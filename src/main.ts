import * as THREE from 'three';
import { createRenderer, bindResize } from './core/renderer';
import { registerServiceWorker } from './core/pwa';
import { createEmptyScene } from './scenes/empty-scene';

const container = document.getElementById('app')!;
const renderer = createRenderer(container);
const { scene, camera, update } = createEmptyScene(container.clientWidth / container.clientHeight);
bindResize(renderer, camera, container);

const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  // 탭 전환 후 돌아올 때 큰 점프 방지
  update(Math.min(timer.getDelta(), 0.1));
  renderer.render(scene, camera);
});

registerServiceWorker();
