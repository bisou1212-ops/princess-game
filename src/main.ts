import * as THREE from 'three';
import { createRenderer, bindResize } from './core/renderer';
import { registerServiceWorker } from './core/pwa';
import { attachGestures } from './core/gestures';
import { openStore } from './core/storage';
import { Speaker } from './core/tts';
import { getCharacter } from './systems/dialogue';
import { GameState } from './systems/game-state';
import { allItems } from './systems/items';
import { DecorUi } from './ui/decor-ui';
import { DialogueBox } from './ui/dialogue-box';
import { renderFurnitureThumbs } from './ui/furniture-thumbs';
import { Hud } from './ui/hud';
import { RewardPopup } from './ui/reward-popup';
import { WardrobePanel } from './ui/wardrobe-panel';
import { courtyardLayout } from './scenes/castle/courtyard-layout';
import { createCourtyardScene } from './scenes/castle/courtyard-scene';
import { CourtyardController } from './scenes/castle/courtyard-controller';
import { createBedroomScene, type BedroomScene } from './scenes/castle/bedroom-scene';
import { BedroomController } from './scenes/castle/bedroom-controller';

async function start() {
  const container = document.getElementById('app')!;
  const renderer = createRenderer(container);

  // 저장된 진행 상황 불러오기 (없거나 깨졌으면 처음부터)
  const state = new GameState(await openStore());
  await state.load();

  const speaker = new Speaker();
  speaker.installUnlock(window);
  const princessVoice = getCharacter('princess').voice;

  const hud = new Hud(document.body, { onWardrobe: () => openWardrobe(), onExit: () => void goTo('yard') });
  const dialogue = new DialogueBox(document.body, speaker);
  const reward = new RewardPopup(document.body, speaker, princessVoice);
  const fade = document.createElement('div');
  fade.className = 'scene-fade';
  document.body.appendChild(fade);

  const toNdc = (x: number, y: number) => {
    const rect = renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
  };
  const aspect = () => container.clientWidth / container.clientHeight;

  // ── 성 마당 ──
  const controller = new CourtyardController({
    layout: courtyardLayout,
    state,
    speaker,
    dialogue,
    hud,
    reward,
    onEnterRoom: (roomId) => void goTo('room', roomId),
  });
  const courtyard = createCourtyardScene(aspect(), {
    layout: courtyardLayout,
    outfit: state.outfit,
    onInteract: (what) => controller.handle(what),
  });
  controller.attach(courtyard);
  bindResize(renderer, courtyard.camera, container);

  // ── 성 안 방 (처음 들어갈 때 만든다) ──
  let thumbs: Map<string, string> | null = null;
  const getThumbs = () =>
    (thumbs ??= renderFurnitureThumbs(
      renderer,
      Object.keys(allItems()).filter((id) => allItems()[id].kind === 'furniture'),
    ));
  const decorUi = new DecorUi(document.body, {
    onCardDrag: (item, e) => room?.controller.startNewDrag(item, e),
    onCardTap: (item) => room?.controller.tapCard(item),
    onRotate: () => room?.controller.rotateSelected(),
    onColor: (c) => room?.controller.colorSelected(c),
    onPutAway: () => room?.controller.putAwaySelected(),
    onDone: () => room?.controller.deselect(),
  });
  let room: { id: string; scene: BedroomScene; controller: BedroomController } | null = null;
  const rooms = new Map<string, { scene: BedroomScene; controller: BedroomController }>();
  const getRoom = (id: string) => {
    let r = rooms.get(id);
    if (!r) {
      const layout = state.rooms[id];
      const scene = createBedroomScene(aspect(), layout);
      bindResize(renderer, scene.camera, container);
      const ctl = new BedroomController({
        roomId: id,
        layout,
        scene,
        ui: decorUi,
        state,
        speaker,
        voice: princessVoice,
        thumbs: getThumbs,
        toNdc,
      });
      r = { scene, controller: ctl };
      rooms.set(id, r);
    }
    return { id, ...r };
  };

  let mode: 'yard' | 'room' = 'yard';
  let switching = false;
  async function goTo(next: 'yard' | 'room', roomId = 'bedroom') {
    if (switching || (next === mode && (next === 'yard' || room?.id === roomId))) return;
    if (!state.rooms[roomId] && next === 'room') return;
    switching = true;
    speaker.stop();
    fade.classList.add('is-on');
    await wait(260);
    if (mode === 'room') room?.controller.leave();
    mode = next;
    if (next === 'room') {
      room = getRoom(roomId);
      room.controller.enter();
    } else {
      room = null;
    }
    hud.setMode(next === 'room' ? 'room' : 'yard');
    applyViewOffset();
    fade.classList.remove('is-on');
    await wait(260);
    switching = false;
  }

  // ── 드레스룸 ──
  const wardrobe = new WardrobePanel(document.body, {
    speaker,
    voice: princessVoice,
    onChange: (outfit) => {
      state.outfit = outfit;
      courtyard.setOutfit(outfit, true);
      state.change();
    },
    onClose: () => closeWardrobe(),
  });

  /** 패널·서랍에 가려지지 않게 화면 중심을 옮겨 공주·방이 보이게 */
  function applyViewOffset() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    const yardCam = courtyard.camera;
    if (wardrobe.isOpen) {
      const r = wardrobe.el.getBoundingClientRect();
      const portrait = h > w;
      yardCam.setViewOffset(w, h, portrait ? 0 : r.width / 2, portrait ? r.height / 2 : 0, w, h);
    } else {
      yardCam.clearViewOffset();
    }
    if (room) room.scene.fitView(w, h, decorUi.drawer.getBoundingClientRect().height || 150);
  }
  window.addEventListener('resize', applyViewOffset);

  function openWardrobe() {
    if (dialogue.isOpen || mode !== 'yard') return;
    wardrobe.open(state.outfit, state.ownedOutfits, state.newOutfits);
    courtyard.setMirror(true);
    hud.setButtonsVisible(false);
    applyViewOffset();
    // 드레스룸을 열었으면 새 옷은 "봤음"
    state.seenOutfits = [...new Set([...state.seenOutfits, ...state.ownedOutfits])];
    state.change();
    controller.refreshHud();
  }

  function closeWardrobe() {
    wardrobe.close();
    courtyard.setMirror(false);
    hud.setButtonsVisible(true);
    applyViewOffset();
  }

  // 앱을 내리거나 닫을 때 바로 저장
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void state.saveNow();
  });
  window.addEventListener('pagehide', () => void state.saveNow());

  // 개발 중 브라우저 콘솔에서 상태 확인용 (배포 빌드에는 없음)
  if (import.meta.env.DEV) Object.assign(window, { __game: { controller, courtyard, state, goTo, room: () => room } });

  // 톡·끌기: 지금 장면으로 보낸다
  attachGestures(renderer.domElement, {
    onTap: (x, y) => (mode === 'yard' ? courtyard.tap(toNdc(x, y)) : room?.controller.onTap(x, y)),
    onDragStart: (x, y) => (mode === 'room' && room ? room.controller.onDragStart(x, y) : false),
    onDragMove: (x, y) => room?.controller.onDragMove(x, y),
    onDragEnd: (x, y) => room?.controller.onDragEnd(x, y),
    onDragCancel: () => room?.controller.cancelDrag(),
  });

  const timer = new THREE.Timer();
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    // 탭 전환 후 돌아올 때 큰 점프 방지
    const dt = Math.min(timer.getDelta(), 0.1);
    if (mode === 'room' && room) {
      room.scene.update(dt);
      renderer.render(room.scene.scene, room.scene.camera);
    } else {
      courtyard.update(dt);
      renderer.render(courtyard.scene, courtyard.camera);
    }
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

void start();
registerServiceWorker();
