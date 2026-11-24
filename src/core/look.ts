import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { STYLE } from './toon';

/**
 * 화면 전체의 느낌 (부드러운 입체 화풍).
 * - 은은한 주변 반사(방 하나를 비춘 듯한 빛)를 모든 장면에 깔아 윤기 나는 재질이 살아나게
 * - 밝은 곳(반짝이·하이라이트·하늘)이 살짝 번지는 빛번짐(bloom, GDD 8.1)
 * 툰 화풍(?style=toon)에서는 아무것도 하지 않고 그대로 그린다.
 */
export interface Look {
  /** 새로 만든 장면에 주변 반사를 깐다 */
  prepare(scene: THREE.Scene): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
}

export function createLook(renderer: THREE.WebGLRenderer, container: HTMLElement): Look {
  if (STYLE !== 'glossy') {
    return { prepare() {}, render: (s, c) => renderer.render(s, c) };
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  // 빛번짐은 화면 절반 해상도로 (태블릿 성능)
  const bloom = new UnrealBloomPass(new THREE.Vector2(container.clientWidth / 2 || 1, container.clientHeight / 2 || 1), 0.35, 0.4, 1.6);
  composer.addPass(renderPass);
  // ?bloom=0 으로 빛번짐 끄고 비교 (성능 점검용)
  if (new URLSearchParams(location.search).get('bloom') !== '0') composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // 캔버스 크기·픽셀 비율이 바뀌면 (화면 회전·창 크기) 매 프레임 확인해서 맞춘다
  const size = new THREE.Vector2();
  let lastW = -1;
  let lastH = -1;
  let lastRatio = -1;
  const syncSize = () => {
    renderer.getSize(size);
    const ratio = renderer.getPixelRatio();
    if (size.x === lastW && size.y === lastH && ratio === lastRatio) return;
    lastW = size.x;
    lastH = size.y;
    lastRatio = ratio;
    composer.setPixelRatio(ratio);
    composer.setSize(size.x, size.y);
    bloom.resolution.set(size.x / 2, size.y / 2);
  };

  return {
    prepare(scene) {
      scene.environment = env;
      scene.environmentIntensity = 0.6;
      // 툰용으로 세게 맞춰 둔 조명을 물리 재질에 맞게 줄인다 (안 그러면 하얗게 날아감)
      scene.traverse((o) => {
        if ((o as THREE.HemisphereLight).isHemisphereLight) (o as THREE.Light).intensity *= 0.35;
        else if ((o as THREE.DirectionalLight).isDirectionalLight) (o as THREE.Light).intensity *= 0.75;
      });
    },
    render(scene, camera) {
      syncSize();
      renderPass.scene = scene;
      renderPass.camera = camera;
      composer.render();
    },
  };
}
