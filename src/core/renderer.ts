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
  // 파스텔 색이 바래지 않으면서 밝은 반사광은 부드럽게 눌러 주는 톤 매핑 + 색 보정 (그래픽 2차 G1)
  installColorGrade();
  renderer.toneMapping = THREE.CustomToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);
  return renderer;
}

/**
 * 색 보정: Neutral 톤 매핑 뒤에 채도를 조금 올리고(바랜 느낌 없애기), 어두운 곳은 살짝 보랏빛·밝은 곳은 살짝 따뜻하게,
 * 중간 대비를 조금 높인다. 톤 매핑 단계에서 하므로 빛번짐을 끈 가벼운 품질에서도 똑같이 적용된다 (추가 비용 거의 없음).
 */
function installColorGrade(): void {
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
  const custom = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
  if (!chunk.includes(custom)) return;
  THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(
    custom,
    `vec3 CustomToneMapping( vec3 color ) {
  color = NeutralToneMapping( color );
  float luma = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
  color = mix( vec3( luma ), color, 1.16 );
  color = mix( color, color * vec3( 0.96, 0.94, 1.05 ), 1.0 - smoothstep( 0.0, 0.45, luma ) );
  color = mix( color, color * vec3( 1.03, 1.0, 0.96 ), smoothstep( 0.55, 1.0, luma ) );
  color = mix( color, smoothstep( 0.0, 1.0, color ), 0.22 );
  return clamp( color, 0.0, 1.0 );
}`,
  );
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
