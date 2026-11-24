import * as THREE from 'three';

/** CLAUDE.md 성능 원칙: 픽셀 비율 최대 2 */
export const MAX_PIXEL_RATIO = 2;

export function createRenderer(container: HTMLElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
}
