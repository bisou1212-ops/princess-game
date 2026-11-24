import * as THREE from 'three';
import { createRenderer, bindResize } from './core/renderer';
import { createLook } from './core/look';
import { registerServiceWorker } from './core/pwa';
import { attachGestures } from './core/gestures';
import { openStore } from './core/storage';
import { Speaker } from './core/tts';
import { getCharacter } from './systems/dialogue';
import { GameState } from './systems/game-state';
import { allItems } from './systems/items';
import { START_LOCATION, getLocation, loadLocationLayout } from './systems/world';
import { DecorUi } from './ui/decor-ui';
import { DialogueBox } from './ui/dialogue-box';
import { renderFurnitureThumbs } from './ui/furniture-thumbs';
import { Hud } from './ui/hud';
import { RewardPopup } from './ui/reward-popup';
import { RoomUi } from './ui/room-ui';
import { ShopPanel } from './ui/shop-panel';
import { itemIcon } from './ui/icons';
import { getItem } from './systems/items';
import { buy } from './systems/shop';
import { WardrobePanel } from './ui/wardrobe-panel';
import type { CourtyardLayout } from './scenes/castle/courtyard-layout';
import { createCourtyardScene, type CourtyardScene } from './scenes/castle/courtyard-scene';
import { CourtyardController } from './scenes/castle/courtyard-controller';
import { createBedroomScene, type BedroomScene } from './scenes/castle/bedroom-scene';
import { BedroomController } from './scenes/castle/bedroom-controller';
import { MapScreen } from './scenes/map/map-screen';
import { createTravelScene } from './scenes/map/travel-scene';
import { preloadPrincessGlb } from './scenes/castle/princess-glb';
import { preloadFriendsGlb } from './scenes/castle/friends-glb';

/** 바깥 장소 하나 (성 마당, 꽃 왕국 …) */
interface Town {
  id: string;
  layout: CourtyardLayout;
  scene: CourtyardScene;
  controller: CourtyardController;
}

/** 열기구 연출 최소 시간 — 너무 짧으면 아이가 무슨 일인지 모른다 */
const TRAVEL_MIN_MS = 3000;

async function start() {
  const container = document.getElementById('app')!;
  const renderer = createRenderer(container);
  // 부드러운 입체 화풍: 주변 반사 + 빛번짐
  const look = createLook(renderer, container);

  // Blender로 만든 공주 모델 (실패하면 도형 공주로 대신)
  await Promise.all([preloadPrincessGlb(), preloadFriendsGlb()]);

  // 저장된 진행 상황 불러오기 (없거나 깨졌으면 처음부터)
  const state = new GameState(await openStore());
  await state.load();

  const speaker = new Speaker();
  speaker.installUnlock(window);
  const princessVoice = getCharacter('princess').voice;

  const hud = new Hud(document.body, {
    onWardrobe: () => openWardrobe(),
    onExit: () => void goTo('town'),
    onMap: () => openMap(),
  });
  const dialogue = new DialogueBox(document.body, speaker);
  const reward = new RewardPopup(document.body, speaker, princessVoice);
  const fade = document.createElement('div');
  fade.className = 'scene-fade';
  const travelWait = document.createElement('div');
  travelWait.className = 'travel-wait';
  travelWait.hidden = true;
  travelWait.innerHTML = '<span>★</span><span>★</span><span>★</span>';
  document.body.append(fade, travelWait);

  const toNdc = (x: number, y: number) => {
    const rect = renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
  };
  const aspect = () => container.clientWidth / container.clientHeight;

  // ── 바깥 장소들 (처음 갈 때 만든다) ──
  const towns = new Map<string, Town>();
  async function getTown(id: string): Promise<Town> {
    const existing = towns.get(id);
    if (existing) return existing;
    const layout = await loadLocationLayout(id);
    const controller = new CourtyardController({
      layout,
      state,
      speaker,
      dialogue,
      hud,
      reward,
      // 문: 성 안 방 또는 별사탕 가게
      onEnterRoom: (target) => (target === 'shop' ? openShop() : void goTo('room', target)),
    });
    const scene = createCourtyardScene(aspect(), {
      layout,
      outfit: state.outfit,
      onInteract: (what) => controller.handle(what),
    });
    controller.attach(scene);
    bindResize(renderer, scene.camera, container);
    look.prepare(scene.scene);
    const t = { id, layout, scene, controller };
    towns.set(id, t);
    return t;
  }
  let town = await getTown(START_LOCATION);

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
  const roomUi = new RoomUi(document.body, {
    onRoom: (id) => void goTo('room', id),
    onPaintOpen: () => room?.controller.openPaint(),
    onPaintPart: (part) => room?.controller.choosePaintPart(part),
    onPaintColor: (c) => room?.controller.paint(c),
    onInviteOpen: () => room?.controller.openInvite(),
    onInvite: (id) => room?.controller.invite(id),
    onPanelClose: () => room?.controller.closePanel(),
  });
  let room: { id: string; scene: BedroomScene; controller: BedroomController } | null = null;
  const rooms = new Map<string, { scene: BedroomScene; controller: BedroomController }>();
  const getRoom = (id: string) => {
    let r = rooms.get(id);
    if (!r) {
      const layout = state.rooms[id];
      const scene = createBedroomScene(aspect(), layout);
      bindResize(renderer, scene.camera, container);
      look.prepare(scene.scene);
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
        roomUi,
        dialogue,
        onLayout: () => applyViewOffset(),
        onMirror: () => void openWardrobeFromRoom(id),
        setBusy: (busy) => {
          roomUi.setButtonsVisible(!busy);
          hud.setButtonsVisible(!busy);
        },
      });
      r = { scene, controller: ctl };
      rooms.set(id, r);
    }
    return { id, ...r };
  };

  // ── 왕국 사이 이동 ──
  const travel = createTravelScene(aspect());
  look.prepare(travel.scene);
  bindResize(renderer, travel.camera, container);

  let mode: 'town' | 'room' | 'travel' = 'town';
  let switching = false;

  /** 화면을 살짝 가렸다가(fade) 바꾸기 */
  async function withFade(change: () => void | Promise<void>) {
    fade.classList.add('is-on');
    await wait(260);
    await change();
    applyViewOffset();
    fade.classList.remove('is-on');
    await wait(260);
  }

  async function goTo(next: 'town' | 'room', roomId = 'bedroom') {
    if (switching || (next === mode && (next === 'town' || room?.id === roomId))) return;
    if (next === 'room' && !state.rooms[roomId]) return;
    switching = true;
    speaker.stop();
    await withFade(() => {
      if (mode === 'room') room?.controller.leave();
      mode = next;
      if (next === 'room') {
        room = getRoom(roomId);
        room.controller.enter();
        roomUi.show(roomId);
      } else {
        room = null;
        roomUi.show(null);
      }
      hud.setMode(next === 'room' ? 'room' : 'yard');
    });
    switching = false;
  }

  async function travelTo(id: string) {
    if (switching || id === town.id || mode !== 'town') return;
    switching = true;
    const from = town;
    const dest = getLocation(id)!;
    await withFade(() => {
      map.close();
      mode = 'travel';
      travel.start(state.outfit);
      hud.setButtonsVisible(false);
    });

    // 날아가는 동안 다음 장소를 불러온다. 오래 걸리면 별이 통통 (로딩 화면)
    const minimum = wait(TRAVEL_MIN_MS);
    const loading = getTown(id).then(
      (t) => t,
      (err) => {
        console.warn('장소를 불러오지 못했어요', err);
        return null;
      },
    );
    await minimum;
    const slow = setTimeout(() => (travelWait.hidden = false), 50);
    const next = await loading;
    clearTimeout(slow);
    travelWait.hidden = true;

    await withFade(() => {
      town = next ?? from;
      town.scene.teleport(town.layout.start);
      town.scene.setOutfit(state.outfit);
      town.controller.refreshHud();
      mode = 'town';
      hud.setMode('yard');
      hud.setButtonsVisible(true);
    });
    switching = false;
    const arrived = getLocation(town.id) ?? dest;
    speaker.speak(next ? `${arrived.name}에 도착했어요!` : '지금은 갈 수 없어요. 다음에 다시 가 봐요!', {
      ...princessVoice,
      mood: 'excited',
    });
  }

  // ── 지도 ──
  const map = new MapScreen(document.body, {
    speaker,
    voice: princessVoice,
    onTravel: (id) => void travelTo(id),
    onClose: () => closeMap(),
  });
  function openMap() {
    if (dialogue.isOpen || mode !== 'town' || switching) return;
    map.open(town.id);
    hud.setButtonsVisible(false);
  }
  function closeMap() {
    map.close();
    hud.setButtonsVisible(true);
  }

  // ── 드레스룸 ──
  const wardrobe = new WardrobePanel(document.body, {
    speaker,
    voice: princessVoice,
    onChange: (outfit) => {
      state.outfit = outfit;
      for (const t of towns.values()) t.scene.setOutfit(outfit, t === town);
      state.change();
    },
    onClose: () => closeWardrobe(),
  });

  // 말풍선·고르기 카드가 가리는 만큼 장면을 위로 올린다 (친구 표정을 보고 고를 수 있게)
  let dialogueCover = 0;
  dialogue.onCover = (px) => {
    dialogueCover = px;
    applyViewOffset();
  };

  /** 패널·서랍·말풍선에 가려지지 않게 화면 중심을 옮겨 공주·친구·방이 보이게 */
  function applyViewOffset() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    for (const t of towns.values()) {
      if (wardrobe.isOpen && t === town) {
        const r = wardrobe.el.getBoundingClientRect();
        const portrait = h > w;
        t.scene.camera.setViewOffset(w, h, portrait ? 0 : r.width / 2, portrait ? r.height / 2 : 0, w, h);
      } else if (dialogueCover > 0 && t === town) {
        t.scene.camera.setViewOffset(w, h, 0, Math.min(dialogueCover, h * 0.6) * 0.42, w, h);
      } else {
        t.scene.camera.clearViewOffset();
      }
    }
    if (room) {
      // 아래를 가리는 것: 말풍선 > 색칠·초대 패널 > 가구 서랍
      const bottom = dialogueCover || (roomUi.isPanelOpen ? roomUi.panel.getBoundingClientRect().height + 24 : 0) || decorUi.drawer.getBoundingClientRect().height || 150;
      room.scene.fitView(w, h, bottom);
    }
  }
  window.addEventListener('resize', applyViewOffset);

  /** 드레스룸 거울: 마당 거울 화면에서 옷을 갈아입고, 닫으면 그 방으로 돌아온다 */
  let wardrobeReturnRoom: string | null = null;
  async function openWardrobeFromRoom(roomId: string) {
    if (switching || dialogue.isOpen) return;
    await goTo('town');
    wardrobeReturnRoom = roomId;
    openWardrobe();
  }

  function openWardrobe() {
    if (dialogue.isOpen || mode !== 'town' || switching) return;
    wardrobe.open(state.outfit, state.ownedOutfits, state.newOutfits);
    town.scene.setMirror(true);
    hud.setButtonsVisible(false);
    applyViewOffset();
    // 드레스룸을 열었으면 새 옷은 "봤음"
    state.seenOutfits = [...new Set([...state.seenOutfits, ...state.ownedOutfits])];
    state.change();
    town.controller.refreshHud();
  }

  function closeWardrobe() {
    wardrobe.close();
    town.scene.setMirror(false);
    hud.setButtonsVisible(true);
    applyViewOffset();
    // 드레스룸 거울에서 왔으면 그 방으로 돌아간다
    const back = wardrobeReturnRoom;
    wardrobeReturnRoom = null;
    if (back) void goTo('room', back);
  }

  // ── 별사탕 가게 (꽃 왕국) ──
  const shop = new ShopPanel(document.body, {
    speaker,
    voice: princessVoice,
    wallet: state.wallet,
    thumb: (id) => getThumbs().get(id) ?? itemIcon(getItem(id)),
    onBuy: (id) => {
      const ok = buy(state.wallet, id);
      if (ok) state.change();
      return ok;
    },
    onClose: () => closeShop(),
  });
  function openShop() {
    if (dialogue.isOpen || mode !== 'town' || switching || shop.isOpen) return;
    hud.setButtonsVisible(false);
    shop.open();
  }
  function closeShop() {
    shop.close();
    hud.setButtonsVisible(true);
    town.controller.refreshHud();
  }

  // 앱을 내리거나 닫을 때 바로 저장
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void state.saveNow();
  });
  window.addEventListener('pagehide', () => void state.saveNow());

  // 개발 중 브라우저 콘솔에서 상태 확인용 (배포 빌드에는 없음)
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __game: { state, goTo, travelTo, town: () => town, room: () => room, mode: () => mode, towns },
    });
  }

  // 톡·끌기: 지금 장면으로 보낸다
  attachGestures(renderer.domElement, {
    onTap: (x, y) => {
      if (mode === 'town') town.scene.tap(toNdc(x, y));
      else if (mode === 'room') room?.controller.onTap(x, y);
    },
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
      look.render(room.scene.scene, room.scene.camera);
    } else if (mode === 'travel') {
      travel.update(dt);
      look.render(travel.scene, travel.camera);
    } else {
      town.scene.update(dt);
      look.render(town.scene.scene, town.scene.camera);
    }
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

void start();
registerServiceWorker();
