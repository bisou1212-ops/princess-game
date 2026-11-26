import * as THREE from 'three';
import { createRenderer, bindResize, setMaxPixelRatio } from './core/renderer';
import { PerfGovernor, perfSettings } from './core/quality';
import { CheckOverlay } from './ui/check-overlay';
import { ParentPanel } from './ui/parent-panel';
import { loadSettings, SPEECH_RATE } from './core/settings';
import { sound, sfx, type Tune } from './core/sound';
import { createLook } from './core/look';
import { registerServiceWorker } from './core/pwa';
import { attachGestures } from './core/gestures';
import { openStore } from './core/storage';
import { Speaker } from './core/tts';
import { getCharacter, getDialogue, registerCharacter } from './systems/dialogue';
import { PET_IDS, Pet, petCharacter, petVars } from './systems/pet';
import { fillLines, type QuestVars } from './systems/random-quests';
import { PetPanel } from './ui/pet-panel';
import { petThumb, sleepingPrincess } from './ui/pet-thumbs';
import { createPortraits } from './ui/portraits';
import { MiniGamePanel } from './ui/minigame-panel';
import { SeekCountdown } from './ui/seek-countdown';
import { StickerAlbum } from './ui/sticker-album';
import type { MiniGame } from './systems/quests';
import { BedtimeScreen } from './ui/bedtime';
import { PlayTimer, SLEEP_HOLD_MS } from './systems/playtime';
import { preloadPet } from './scenes/castle/pet-glb';
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
import { preloadEnv } from './scenes/castle/env-models';

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
  // 펫: 있으면 그 펫만, 아직 없으면 고를 수 있게 세 마리 모두 불러 둔다
  if (state.pet) registerCharacter('pet', petCharacter(state.pet));
  await Promise.all(state.pet ? [preloadPet(state.pet.kind)] : PET_IDS.map((k) => preloadPet(k)));

  const speaker = new Speaker();
  speaker.installUnlock(window);
  speaker.rateScale = SPEECH_RATE[loadSettings().speech];
  // 소리: 첫 터치에 켜짐 (브라우저 규칙). 효과음·음악은 부모 설정에서 끌 수 있다
  sound.setEnabled(loadSettings().sfx, loadSettings().music);
  window.addEventListener('pointerdown', () => sound.unlock(), { capture: true });
  const princessVoice = getCharacter('princess').voice;

  const hud = new Hud(document.body, {
    onWardrobe: () => openWardrobe(),
    onExit: () => void goTo('town'),
    onMap: () => openMap(),
    onParent: () => openParent(),
    onCards: () => openCards(),
    onAlbum: () => openAlbum(),
    onZoom: (f) => mode === 'town' && town.scene.zoomBy(f),
    onResetView: () => mode === 'town' && town.scene.resetView(),
  });
  const dialogue = new DialogueBox(document.body, speaker);
  // 말풍선 앞 얼굴 사진 (3D 모델을 기분 표정으로 찍음)
  dialogue.portraitFor = createPortraits({ renderer, outfit: () => state.outfit, petKind: () => state.pet?.kind ?? null });
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
    await preloadEnv(layout.env); // 장소 배경 모델 (없거나 실패하면 도형 배경)
    const controller = new CourtyardController({
      layout,
      state,
      speaker,
      dialogue,
      hud,
      reward,
      // 문: 성 안 방 또는 별사탕 가게
      onEnterRoom: (target) => (target === 'shop' ? openShop() : void goTo('room', target)),
      onPetCare: (mode, count) => openPetCare(mode, count),
      onPlay: (p) => openPlay(p),
      onSeekCount: (done) => {
        hud.setButtonsVisible(false);
        seekCount.open(() => {
          hud.setButtonsVisible(true);
          done();
        });
      },
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
  // 첫 장소가 준비되면 불러오기 별을 치운다 (한 프레임 그린 뒤)
  requestAnimationFrame(() => document.getElementById('boot')?.remove());

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
    onInvite: (id) => {
      state.stickers.record('invite');
      room?.controller.invite(id);
    },
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
    perf.grace(2); // 새 장면 준비로 잠깐 느린 건 재지 않음
    applyViewOffset();
    fade.classList.remove('is-on');
    await wait(260);
  }

  async function goTo(next: 'town' | 'room', roomId = 'bedroom') {
    if (switching || (next === mode && (next === 'town' || room?.id === roomId))) return;
    if (next === 'room' && !state.rooms[roomId]) return;
    switching = true;
    sfx('whoosh');
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
    sfx('whoosh');
    if (id === 'flower-kingdom') state.stickers.record('travel');
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
      sfx('dress');
      state.stickers.record('dress');
      state.outfit = outfit;
      for (const t of towns.values()) t.scene.setOutfit(outfit, t === town);
      state.change();
    },
    onClose: () => closeWardrobe(),
  });

  // 표정·몸짓 (G2): 말하는 친구·공주가 대사 기분에 맞는 얼굴로, 입을 뻐끔뻐끔
  dialogue.onSpeak = (who, mood, talking) => {
    if (mode !== 'town') return;
    town.scene.setFace(who, mood, talking);
    if (who && talking) {
      if (mood === 'excited') town.scene.gesture(who, 'clap');
      else if (mood === 'happy') town.scene.gesture(who, 'nod');
    }
  };

  // 말풍선·고르기 카드가 가리는 만큼 장면을 위로 올린다 (친구 표정을 보고 고를 수 있게)
  let dialogueCover = 0;
  dialogue.onCover = (px) => {
    dialogueCover = px;
    town.scene.setTalking(px > 0);
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
      if (ok) state.stickers.record('shop');
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

  // ── 스티커 앨범 (모으는 큰 목표) ──
  const album = new StickerAlbum(document.body, speaker, state.stickers, () => {
    album.close();
    hud.setButtonsVisible(true);
    hud.setAlbumNew(state.stickers.unseen.size > 0);
  });
  state.stickers.onEarn = (s) => {
    album.notify(s);
    hud.setAlbumNew(true);
    state.change();
  };
  hud.setAlbumNew(state.stickers.unseen.size > 0);
  function openAlbum() {
    if (dialogue.isOpen || mode !== 'town' || switching || miniGames.isOpen || album.isOpen) return;
    hud.setButtonsVisible(false);
    album.open();
    hud.setAlbumNew(false);
    state.change();
  }

  // ── 숨바꼭질 세기 화면 ──
  const seekCount = new SeekCountdown(document.body, speaker);

  // ── 미니게임: 놀이 부탁(케이크·꽃밭) + 카드 짝 맞추기(마당 버튼) ──
  const miniGames = new MiniGamePanel(document.body, {
    speaker,
    portrait: (id) => dialogue.portraitFor?.(id, 'happy') ?? null,
    onClose: () => {
      miniGames.close();
      hud.setButtonsVisible(true);
      town.controller.refreshHud();
    },
  });
  function openPlay(p: { questId: string; game: MiniGame; item: string; count: number; giver: string; vars: QuestVars }) {
    hud.setButtonsVisible(false);
    const done = () => {
      hud.setButtonsVisible(true);
      town.controller.finishPlay(p.questId, p.giver);
    };
    if (p.game === 'cake') miniGames.openCake(p.item, p.count, p.giver, p.vars, done);
    else miniGames.openGarden(p.item, p.count, p.giver, p.vars, done);
  }
  function openCards() {
    if (dialogue.isOpen || mode !== 'town' || switching || miniGames.isOpen) return;
    sfx('page');
    hud.setButtonsVisible(false);
    miniGames.openCards((candy) => {
      state.stickers.record('cards');
      state.stickers.record('candy', candy);
      state.wallet.grant({ candy, items: [] });
      state.change();
      hud.setCandy(state.wallet.candy, true);
    });
  }

  // ── 펫 (M8-5): 처음엔 고르기, 그다음엔 밥·목욕 ──
  const petPanel = new PetPanel(document.body, {
    speaker,
    thumb: (kind) => petThumb(renderer, kind),
    onAdopt: (kind, name) => {
      state.pet = new Pet(kind, name);
      registerCharacter('pet', petCharacter(state.pet));
      state.change();
      petPanel.close();
      hud.setButtonsVisible(true);
      town.controller.refreshPet();
      town.scene.petCelebrate();
      dialogue.open(fillLines(getDialogue('pet-adopted'), petVars(state.pet), (c) => getCharacter(c).name));
    },
    onCareDone: (mode) => void town.controller.finishPetCare(mode),
    onClose: () => {
      petPanel.close();
      hud.setButtonsVisible(true);
    },
  });
  function openPetCare(mode: 'feed' | 'bath', count: number) {
    if (!state.pet) return;
    hud.setButtonsVisible(false);
    if (mode === 'feed') petPanel.openFeed(state.pet, count);
    else petPanel.openBath(state.pet);
  }
  if (!state.pet) {
    hud.setButtonsVisible(false);
    window.setTimeout(() => petPanel.openChoose(), 600);
  }
  // 시간이 지나면 다시 배고파진다 → 머리 위 그림을 가끔 다시 맞춤
  window.setInterval(() => {
    if (mode === 'town' && !dialogue.isOpen) town.controller.refreshPet();
  }, 30_000);

  // ── 부모 설정 (어른용 잠금 뒤) ──
  const parentPanel = new ParentPanel(document.body, {
    speaker,
    onSettings: (s) => {
      speaker.rateScale = SPEECH_RATE[s.speech];
      sound.setEnabled(s.sfx, s.music);
      playTimer.setLimit(s.playMinutes);
    },
    onReset: () => state.reset(),
    playedMinutes: () => Math.floor(playTimer.used / 60),
    onContinue: (min) => {
      parentPanel.close();
      if (min <= 0) return; // 오늘은 그만: 계속 잠
      playTimer.extend(min);
      bedtime.hide();
      try {
        localStorage.removeItem(SLEEP_KEY);
      } catch {
        /* 무시 */
      }
      hud.setButtonsVisible(true);
    },
    onClose: () => {
      parentPanel.close();
      speaker.stop();
      hud.setButtonsVisible(!bedtime.isOpen);
    },
  });
  function openParent() {
    if (dialogue.isOpen || switching || parentPanel.isOpen) return;
    speaker.stop();
    hud.setButtonsVisible(false);
    parentPanel.open();
  }

  // ── 플레이 시간 (M9-2): 2분 전 예고 → 시간이 되면 잠자리 장면 ──
  const SLEEP_KEY = 'sleepUntil';
  const playTimer = new PlayTimer(loadSettings().playMinutes);
  const bedtime = new BedtimeScreen(document.body, { speaker, onAdult: () => parentPanel.open('continue') });
  /** 하던 대화·장면 바꾸기가 끝날 때까지 기다렸다가 (너무 오래면 그냥) */
  const whenIdle = (fn: () => void, maxWait = 45_000) => {
    const start = performance.now();
    const check = () => {
      const busy = dialogue.isOpen || switching || mode === 'travel' || miniGames.isOpen || seekCount.isOpen;
      if (!busy || performance.now() - start > maxWait) fn();
      else window.setTimeout(check, 1000);
    };
    check();
  };
  const petLinesFor = (id: string) => {
    const lines = getDialogue(id).filter((l) => l.speaker !== 'pet' || state.pet);
    return state.pet ? fillLines(lines, petVars(state.pet), (c) => getCharacter(c).name) : lines;
  };
  function warnBedtime() {
    whenIdle(() => {
      if (bedtime.isOpen || dialogue.isOpen) return; // 바쁘면 예고는 건너뜀 (잠자리 장면은 그대로 옴)
      dialogue.open(petLinesFor(state.pet ? 'bedtime-soon-pet' : 'bedtime-soon'));
    }, 60_000);
  }
  function startBedtime(quiet = false) {
    const show = () => {
      speaker.stop();
      if (dialogue.isOpen) dialogue.close();
      hud.setButtonsVisible(false);
      const pics = {
        princess: sleepingPrincess(renderer, state.outfit),
        pet: state.pet ? petThumb(renderer, state.pet.kind, true) : null,
      };
      bedtime.show(pics, petLinesFor(quiet ? 'bedtime-still' : 'bedtime'));
      try {
        if (!quiet) localStorage.setItem(SLEEP_KEY, String(Date.now() + SLEEP_HOLD_MS));
      } catch {
        /* 무시 */
      }
      void state.saveNow();
    };
    if (quiet) show();
    else whenIdle(show);
  }
  // 다시 켰는데 잠든 지 얼마 안 됐으면 계속 자는 화면
  try {
    if (Number(localStorage.getItem(SLEEP_KEY)) > Date.now()) {
      playTimer.sleepNow();
      startBedtime(true);
    }
  } catch {
    /* 무시 */
  }

  // 길게 누르면 뜨는 메뉴(이미지 저장·복사 등) 막기 — 아이가 오래 누르는 일이 많다
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // 앱을 내리거나 닫을 때 바로 저장
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void state.saveNow();
    sound.suspend(document.visibilityState === 'hidden');
  });
  window.addEventListener('pagehide', () => void state.saveNow());

  // 개발 중 브라우저 콘솔에서 상태 확인용 (배포 빌드에는 없음)
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __game: { state, goTo, travelTo, town: () => town, room: () => room, mode: () => mode, towns, petPanel, playTimer, startBedtime, warnBedtime, sound, renderer, dialogue, miniGames, openCards },
    });
  }

  // 톡·끌기: 지금 장면으로 보낸다
  const tapAt = (x: number, y: number) => {
    sfx('tap');
    if (mode === 'town') town.scene.tap(toNdc(x, y));
    else if (mode === 'room') room?.controller.onTap(x, y);
  };
  /**
   * 마당에서 끌기 = 둘러보기 (가로: 빙 돌기, 세로: 높낮이).
   * 아이 톡은 조금 미끄러지므로 28px 안에서 떼면 그냥 톡으로 본다.
   */
  let lookDrag: { sx: number; sy: number; lx: number; ly: number; t: number; on: boolean } | null = null;
  const canLook = () => mode === 'town' && !switching && !wardrobe.isOpen;
  attachGestures(renderer.domElement, {
    onTap: tapAt,
    onDragStart: (x, y) => {
      if (mode === 'room' && room) return room.controller.onDragStart(x, y);
      if (!canLook()) return false;
      lookDrag = { sx: x, sy: y, lx: x, ly: y, t: performance.now(), on: false };
      return true;
    },
    onDragMove: (x, y) => {
      if (!lookDrag) return room?.controller.onDragMove(x, y);
      if (!lookDrag.on && Math.hypot(x - lookDrag.sx, y - lookDrag.sy) > 28) {
        lookDrag.on = true;
        lookDrag.lx = x;
        lookDrag.ly = y;
      }
      if (!lookDrag.on) return;
      const h = container.clientHeight || 1;
      town.scene.orbit(-((x - lookDrag.lx) / h) * 2.6, ((y - lookDrag.ly) / h) * 1.6);
      lookDrag.lx = x;
      lookDrag.ly = y;
    },
    onDragEnd: (x, y) => {
      if (!lookDrag) return room?.controller.onDragEnd(x, y);
      const l = lookDrag;
      lookDrag = null;
      if (!l.on && performance.now() - l.t <= 1200) tapAt(l.sx, l.sy);
    },
    onDragCancel: () => {
      if (lookDrag) lookDrag = null;
      else room?.controller.cancelDrag();
    },
    // 두 손가락 벌리기 = 가까이
    onPinch: (f) => canLook() && town.scene.zoomBy(1 / f),
  });
  // 컴퓨터: 마우스 휠로 가까이·멀리
  renderer.domElement.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (canLook()) town.scene.zoomBy(Math.exp(e.deltaY * 0.0012));
    },
    { passive: false },
  );

  // 느린 기기면 빛번짐·해상도를 단계별로 낮춘다 (실제 fps 를 재서)
  const perf = new PerfGovernor((level) => {
    const p = perfSettings(level);
    look.setBloom(p.bloom);
    setMaxPixelRatio(renderer, p.maxPixelRatio);
  });
  // ?check=1: 태블릿 점검 화면 (fps·해상도·음성 목록·목소리 시험)
  const check = new URLSearchParams(location.search).get('check') ? new CheckOverlay(document.body, { renderer, speaker, perf }) : null;

  const timer = new THREE.Timer();
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const raw = timer.getDelta();
    perf.tick(raw, document.visibilityState === 'hidden' || switching);
    check?.update(raw);
    // 놀이 시간은 화면이 보이고 부모 설정이 닫혀 있을 때만 센다
    // 장소에 맞는 곡, 말하는 동안은 음악을 작게
    const tune: Tune = bedtime.isOpen ? 'lullaby' : shop.isOpen ? 'shop' : mode === 'room' ? 'room' : mode === 'travel' ? 'flower-kingdom' : (town.id as Tune);
    sound.setTune(tune);
    sound.setSpeaking(!!globalThis.speechSynthesis?.speaking);
    const play = playTimer.tick(raw, document.visibilityState === 'visible' && !parentPanel.isOpen && !bedtime.isOpen);
    if (play === 'warn') warnBedtime();
    else if (play === 'bedtime') startBedtime();
    if (bedtime.isOpen) return; // 자는 동안은 3D 를 그리지 않음 (배터리·열)
    // 탭 전환 후 돌아올 때 큰 점프 방지
    const dt = Math.min(raw, 0.1);
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
