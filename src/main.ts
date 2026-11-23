import * as THREE from 'three';
import { createRenderer, bindResize } from './core/renderer';
import { registerServiceWorker } from './core/pwa';
import { onTap } from './core/input';
import { Speaker } from './core/tts';
import { getCharacter } from './systems/dialogue';
import { DialogueBox } from './ui/dialogue-box';
import { Hud } from './ui/hud';
import { RewardPopup } from './ui/reward-popup';
import { courtyardLayout } from './scenes/castle/courtyard-layout';
import { createCourtyardScene } from './scenes/castle/courtyard-scene';
import { CourtyardController } from './scenes/castle/courtyard-controller';

const container = document.getElementById('app')!;
const renderer = createRenderer(container);

const speaker = new Speaker();
speaker.installUnlock(window);
const hud = new Hud(document.body);
const dialogue = new DialogueBox(document.body, speaker);
const reward = new RewardPopup(document.body, speaker, getCharacter('princess').voice);

const controller = new CourtyardController({ layout: courtyardLayout, speaker, dialogue, hud, reward });
const courtyard = createCourtyardScene(container.clientWidth / container.clientHeight, {
  layout: courtyardLayout,
  onInteract: (what) => controller.handle(what),
});
controller.attach(courtyard);
// 개발 중 브라우저 콘솔에서 상태 확인용 (배포 빌드에는 없음)
if (import.meta.env.DEV) Object.assign(window, { __game: { controller, courtyard } });
bindResize(renderer, courtyard.camera, container);

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

registerServiceWorker();
