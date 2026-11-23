import * as THREE from 'three';
import { createRenderer, bindResize } from './core/renderer';
import { registerServiceWorker } from './core/pwa';
import { onTap } from './core/input';
import { openStore } from './core/storage';
import { Speaker } from './core/tts';
import { getCharacter } from './systems/dialogue';
import { GameState } from './systems/game-state';
import { DialogueBox } from './ui/dialogue-box';
import { Hud } from './ui/hud';
import { RewardPopup } from './ui/reward-popup';
import { WardrobePanel } from './ui/wardrobe-panel';
import { courtyardLayout } from './scenes/castle/courtyard-layout';
import { createCourtyardScene } from './scenes/castle/courtyard-scene';
import { CourtyardController } from './scenes/castle/courtyard-controller';

async function start() {
  const container = document.getElementById('app')!;
  const renderer = createRenderer(container);

  // 저장된 진행 상황 불러오기 (없거나 깨졌으면 처음부터)
  const state = new GameState(await openStore());
  await state.load();

  const speaker = new Speaker();
  speaker.installUnlock(window);
  const princessVoice = getCharacter('princess').voice;

  const hud = new Hud(document.body, () => openWardrobe());
  const dialogue = new DialogueBox(document.body, speaker);
  const reward = new RewardPopup(document.body, speaker, princessVoice);

  const controller = new CourtyardController({ layout: courtyardLayout, state, speaker, dialogue, hud, reward });
  const courtyard = createCourtyardScene(container.clientWidth / container.clientHeight, {
    layout: courtyardLayout,
    outfit: state.outfit,
    onInteract: (what) => controller.handle(what),
  });
  controller.attach(courtyard);
  bindResize(renderer, courtyard.camera, container);

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

  /** 패널에 가려지지 않게 화면 중심을 옆(또는 위)으로 밀어 공주가 보이게 */
  const applyViewOffset = () => {
    const cam = courtyard.camera;
    if (!wardrobe.isOpen) {
      cam.clearViewOffset();
      return;
    }
    const w = container.clientWidth;
    const h = container.clientHeight;
    const r = wardrobe.el.getBoundingClientRect();
    const portrait = h > w;
    cam.setViewOffset(w, h, portrait ? 0 : r.width / 2, portrait ? r.height / 2 : 0, w, h);
  };
  window.addEventListener('resize', applyViewOffset);

  function openWardrobe() {
    if (dialogue.isOpen) return;
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
  if (import.meta.env.DEV) Object.assign(window, { __game: { controller, courtyard, state } });

  const ndc = new THREE.Vector2();
  onTap(renderer.domElement, (clientX, clientY) => {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    courtyard.tap(ndc);
  });

  const timer = new THREE.Timer();
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    // 탭 전환 후 돌아올 때 큰 점프 방지
    courtyard.update(Math.min(timer.getDelta(), 0.1));
    renderer.render(courtyard.scene, courtyard.camera);
  });
}

void start();
registerServiceWorker();
