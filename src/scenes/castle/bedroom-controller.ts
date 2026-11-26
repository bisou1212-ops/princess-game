import * as THREE from 'three';
import type { Speaker } from '../../core/tts';
import { ROOMS, SURFACES, praiseFor, type RoomLayout, type SurfaceId } from '../../systems/decor';
import { getCharacter, getDialogue, type DialogueLine } from '../../systems/dialogue';
import type { DialogueBox } from '../../ui/dialogue-box';
import type { RoomUi } from '../../ui/room-ui';
import type { GameState } from '../../systems/game-state';
import { getItem } from '../../systems/items';
import { getColor } from '../../systems/wardrobe';
import type { DecorUi } from '../../ui/decor-ui';
import type { BedroomScene } from './bedroom-scene';

interface Deps {
  roomId: string;
  layout: RoomLayout;
  scene: BedroomScene;
  ui: DecorUi;
  state: GameState;
  speaker: Speaker;
  voice: { lang: string; pitch: number; rate: number };
  thumbs: () => Map<string, string>;
  roomUi: RoomUi;
  dialogue: DialogueBox;
  /** 아래 UI 높이가 바뀌었을 때 (카메라 맞추기) */
  onLayout(): void;
  /** 친구가 와 있는 동안 위 버튼 숨기기 */
  setBusy(busy: boolean): void;
  /** 드레스룸 거울을 톡하면 옷 갈아입기 */
  onMirror(): void;
  /** 화면 좌표 → NDC */
  toNdc(x: number, y: number): THREE.Vector2;
}

/** 지금 끌고 있는 가구: 서랍에서 새로 꺼낸 것 또는 방에 있던 것 */
type Drag =
  | { kind: 'new'; item: string; rot: number; color: string; spot: { c: number; r: number } | null; valid: boolean }
  | { kind: 'move'; uid: string; item: string; rot: number; color: string; spot: { c: number; r: number } | null; valid: boolean };

/**
 * 성 꾸미기 조작 (GDD 5.2·7):
 * 서랍 카드를 위로 끌기 → 방에 놓기 / 가구 톡 → 고르기(돌리기·색·치우기) / 가구 끌기 → 옮기기.
 * 놓을 수 없는 자리에서는 빨간 경고 없이 흐릿하게만 보이고, 손을 떼면 원래대로 돌아간다.
 */
export class BedroomController {
  private drag: Drag | null = null;
  private selected: string | null = null;
  private docListeners: (() => void) | null = null;
  private paintPart: SurfaceId = 'wall';
  private guestOn = false;

  constructor(private readonly d: Deps) {}

  enter(): void {
    this.d.scene.sync();
    this.refreshDrawer();
    this.d.ui.setVisible(true);
  }

  leave(): void {
    this.cancelDrag();
    this.select(null);
    this.d.roomUi.hidePanel();
    this.d.ui.setVisible(false);
    if (this.guestOn) {
      this.d.dialogue.close();
      this.d.scene.showGuest(null);
      this.guestOn = false;
    }
  }

  /** 친구가 와 있거나 패널이 열려 있으면 가구를 만지지 않는다 */
  private get locked(): boolean {
    return this.guestOn;
  }

  // ── 벽지·바닥·커튼 색칠 ──

  openPaint(): void {
    if (this.locked) return;
    this.select(null);
    this.d.ui.drawer.hidden = true;
    this.d.roomUi.showPaint(this.paintPart, this.d.layout.style[this.paintPart]);
    this.sayPart(this.paintPart);
    this.d.onLayout();
  }

  choosePaintPart(part: SurfaceId): void {
    this.paintPart = part;
    this.d.roomUi.showPaint(part, this.d.layout.style[part]);
    this.sayPart(part);
  }

  paint(color: string): void {
    if (!this.d.layout.setSurface(this.paintPart, color)) return;
    this.d.scene.applyStyle(this.paintPart);
    this.d.roomUi.showPaint(this.paintPart, color);
    const c = getColor(color);
    this.say(`${c.name}!`, c.en);
    this.d.state.change();
  }

  closePanel(): void {
    this.d.roomUi.hidePanel();
    if (!this.guestOn) this.d.ui.drawer.hidden = false;
    this.d.onLayout();
  }

  // ── 친구 초대 (GDD 5.2: 꾸민 방을 보고 칭찬) ──

  openInvite(): void {
    if (this.locked) return;
    this.select(null);
    this.d.ui.drawer.hidden = true;
    this.d.roomUi.showInvite();
    this.d.speaker.speak('누구를 초대할까?', { ...this.d.voice, mood: 'curious' });
    this.d.onLayout();
  }

  invite(characterId: string): void {
    if (this.locked) return;
    this.guestOn = true;
    this.d.roomUi.hidePanel();
    this.d.ui.drawer.hidden = true;
    this.d.setBusy(true);
    this.d.scene.showGuest(characterId);
    const lines = this.inviteLines(characterId);
    // 친구가 톡 나타난 다음 말하기
    setTimeout(() => {
      if (!this.guestOn) return;
      this.d.dialogue.open(lines, () => {
        this.d.scene.showGuest(null);
        this.guestOn = false;
        this.d.setBusy(false);
        this.d.ui.drawer.hidden = false;
        this.d.onLayout();
      });
    }, 450);
  }

  /** 인사 + 가구 개수에 맞는 칭찬 (+ 색을 바꿨으면 색 칭찬). 'guest'·{room}을 바꿔 넣는다 */
  inviteLines(characterId: string): DialogueLine[] {
    getCharacter(characterId); // 없는 친구면 여기서 알 수 있게
    const count = this.d.layout.items.length;
    const ids = ['invite-hello', praiseFor(count)];
    if (count >= 3 && Object.keys(this.d.layout.style).length > 0) ids.push('invite-colors');
    const roomName = ROOMS[this.d.roomId]?.name ?? '방';
    return ids.flatMap((id) =>
      getDialogue(id).map((l) => ({
        ...l,
        speaker: l.speaker === 'guest' ? characterId : l.speaker,
        text: l.text.replaceAll('{room}', roomName),
      })),
    );
  }

  // ── 방 화면(캔버스) 제스처 ──

  onTap(x: number, y: number): void {
    if (!this.locked && !this.selected && this.d.scene.pickMirror(this.d.toNdc(x, y))) {
      this.d.onMirror();
      return;
    }
    const uid = this.d.scene.pickFurniture(this.d.toNdc(x, y));
    // 같은 가구를 다시 톡하면 고르기 해제, 빈 바닥을 톡해도 해제
    this.select(uid === this.selected ? null : uid);
  }

  onDragStart(x: number, y: number): boolean {
    if (this.locked) return false;
    const uid = this.d.scene.pickFurniture(this.d.toNdc(x, y));
    if (!uid) return false;
    const p = this.d.layout.get(uid)!;
    this.select(null);
    this.drag = { kind: 'move', uid, item: p.item, rot: p.rot, color: p.color, spot: null, valid: false };
    this.d.scene.setHidden(uid);
    return true;
  }

  onDragMove(x: number, y: number): void {
    const drag = this.drag;
    if (!drag) return;
    if (this.d.ui.isOverDrawer(y)) {
      // 서랍 위로 가져오면 "다시 넣기"
      drag.spot = null;
      this.d.scene.hideGhost();
      return;
    }
    const floor = this.d.scene.floorPoint(this.d.toNdc(x, y));
    if (!floor) return;
    const spot = this.d.layout.snap(drag.item, drag.rot, floor.x, floor.z);
    if (!spot) return;
    drag.spot = spot;
    drag.valid = this.d.layout.canPlace(drag.item, spot.c, spot.r, drag.rot, drag.kind === 'move' ? drag.uid : undefined);
    this.d.scene.showGhost(drag.item, drag.rot, spot.c, spot.r, drag.color, drag.valid);
  }

  onDragEnd(x: number, y: number): void {
    const drag = this.drag;
    if (!drag) return;
    this.onDragMove(x, y);
    this.drag = null;
    this.d.scene.hideGhost();
    this.d.scene.setHidden(null);
    const { layout, scene } = this.d;

    if (drag.kind === 'new') {
      if (drag.spot && drag.valid) {
        const p = layout.place(drag.item, drag.spot.c, drag.spot.r, drag.rot, drag.color);
        if (p) {
          this.d.state.stickers.record('furniture');
          scene.sync();
          scene.pop(p.uid);
          this.select(p.uid);
          this.changed();
          return;
        }
      }
      // 못 놓았으면 서랍에 그대로 (아무 일 없음)
      return;
    }

    if (this.d.ui.isOverDrawer(y)) {
      // 서랍에 넣기 = 치우기
      layout.remove(drag.uid);
      scene.sync();
      this.changed();
      return;
    }
    if (drag.spot && drag.valid && layout.move(drag.uid, drag.spot.c, drag.spot.r)) {
      scene.sync();
      scene.pop(drag.uid);
      this.select(drag.uid);
      this.changed();
    } else {
      // 원래 자리로
      scene.sync();
      scene.wiggle(drag.uid);
    }
  }

  cancelDrag(): void {
    if (!this.drag) return;
    this.drag = null;
    this.docListeners?.();
    this.d.scene.hideGhost();
    this.d.scene.setHidden(null);
    this.d.scene.sync();
  }

  // ── 서랍 ──

  /** 서랍 카드를 위로 끌기 시작: 이후 움직임은 문서 전체에서 따라간다 */
  startNewDrag(item: string, e: PointerEvent): void {
    if (this.locked || this.d.layout.available(item) <= 0) return;
    this.select(null);
    const it = getItem(item);
    this.drag = { kind: 'new', item, rot: 0, color: it.defaultColor ?? 'pink', spot: null, valid: false };
    this.sayItem(item);
    const id = e.pointerId;
    const move = (ev: PointerEvent) => ev.pointerId === id && this.onDragMove(ev.clientX, ev.clientY);
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      cleanup();
      this.onDragEnd(ev.clientX, ev.clientY);
    };
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      cleanup();
      this.cancelDrag();
    };
    const cleanup = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
      this.docListeners = null;
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
    this.docListeners = cleanup;
    this.onDragMove(e.clientX, e.clientY);
  }

  /** 카드를 톡만 하면 이름을 읽어 주고 "위로 끌어 봐" 힌트 (서랍 화살표가 반짝임) */
  tapCard(item: string): void {
    this.sayItem(item);
  }

  // ── 고른 가구 도구 ──

  rotateSelected(): void {
    if (!this.selected) return;
    if (this.d.layout.rotate(this.selected)) {
      this.d.scene.sync();
      this.d.scene.pop(this.selected);
      this.changed();
    } else {
      this.d.scene.wiggle(this.selected);
    }
  }

  colorSelected(color: string): void {
    if (!this.selected || !this.d.layout.recolor(this.selected, color)) return;
    this.d.scene.sync();
    this.d.scene.pop(this.selected);
    this.d.ui.showTools(color);
    const c = getColor(color);
    this.say(`${c.name}!`, c.en);
    this.changed();
  }

  putAwaySelected(): void {
    if (!this.selected) return;
    this.d.layout.remove(this.selected);
    this.select(null);
    this.d.scene.sync();
    this.changed();
  }

  deselect(): void {
    this.select(null);
  }

  private select(uid: string | null): void {
    if (uid && this.locked) return;
    if (uid) this.d.roomUi.hidePanel();
    this.selected = uid;
    this.d.scene.select(uid);
    const p = uid ? this.d.layout.get(uid) : undefined;
    this.d.ui.showTools(p ? p.color : null);
    this.d.ui.drawer.hidden = !!p; // 고르는 동안은 도구만
    if (p) this.sayItem(p.item);
  }

  private refreshDrawer(): void {
    const thumbs = this.d.thumbs();
    this.d.ui.setCards(
      this.d.layout.drawer().map((x) => ({ item: x.item, left: x.left, thumb: thumbs.get(x.item) ?? '', name: getItem(x.item).name })),
    );
  }

  private changed(): void {
    this.refreshDrawer();
    this.d.state.change();
  }

  private sayPart(part: SurfaceId): void {
    const s = SURFACES.find((x) => x.id === part)!;
    this.say(`${s.name}!`, s.en);
  }

  private sayItem(item: string): void {
    const it = getItem(item);
    this.say(`${it.name}!`, it.en);
  }

  private say(ko: string, en?: string): void {
    const { speaker, voice } = this.d;
    speaker.speak(ko, {
      ...voice,
      mood: 'excited',
      onEnd: () => en && speaker.speak(`${en}!`, { lang: 'en-US', pitch: voice.pitch, rate: voice.rate, mood: 'excited' }),
    });
  }
}
