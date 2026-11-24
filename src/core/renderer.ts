import * as THREE from 'three';

import { perfSettings, savedPerfLevel } from './quality';

/** CLAUDE.md 성능 원칙: 픽셀 비율 최대 2 (기본 품질은 1.25, 느린 기기는 자동으로 더 낮춤) */
let maxPixelRatio = perfSettings(savedPerfLevel()).maxPixelRatio;

/** 느린 기기 자동 조절: 픽셀 비율 상한을 바꾸고 바로 적용 */
export function setMaxPixelRatio(renderer: THREE.WebGLRenderer, ratio: number): void {
  maxPixelRatio = ratio;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
}

export function createRenderer(container: HTMLElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // 파스텔 색이 바래지 않으면서 밝은 반사광은 부드럽게 눌러 주는 톤 매핑
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);
  return renderer;
}

/** 창 크기·화면 회전에 맞춰 렌더러와 카메라를 갱신 */
export function bindResize(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  container: HTMLElement,
): void {
  const onResize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
}
