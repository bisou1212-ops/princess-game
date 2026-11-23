import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 그림책 같은 툰 셰이딩 + 연한 외곽선 (GDD 8.1).
 * 모든 장면은 toonMaterial()로 재질을 만들고, 또렷하게 보여야 할 것에만 addOutline()을 붙인다.
 */

/** 명암 3단계 (어두운 쪽도 너무 어둡지 않게 — 파스텔 느낌 유지) */
const GRADIENT = (() => {
  const levels = new Uint8Array([150, 210, 255]);
  const tex = new THREE.DataTexture(levels, levels.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();

export type ToonParams = THREE.MeshToonMaterialParameters & { roughness?: number; metalness?: number };

/** MeshStandardMaterial 대신 쓰는 툰 재질 (roughness·metalness는 무시) */
export function toonMaterial(params: ToonParams = {}): THREE.MeshToonMaterial {
  const { roughness: _r, metalness: _m, ...rest } = params;
  return new THREE.MeshToonMaterial({ gradientMap: GRADIENT, ...rest });
}

// ── 외곽선 (뒤집은 껍데기 방식: 법선 방향으로 살짝 부풀린 뒷면을 진한 색으로) ──

const OUTLINE_COLOR = new THREE.Color(0x6e5a82);
const outlineMaterials = new Map<number, THREE.MeshBasicMaterial>();
const smoothGeometries = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

function outlineMaterial(thickness: number): THREE.MeshBasicMaterial {
  const key = Math.round(thickness * 1000);
  let m = outlineMaterials.get(key);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide, transparent: true, opacity: 0.55 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.outlineThickness = { value: thickness };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float outlineThickness;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * outlineThickness;');
  };
  m.customProgramCacheKey = () => `outline-${key}`;
  outlineMaterials.set(key, m);
  return m;
}

/** 모서리가 갈라지지 않도록 법선을 부드럽게 만든 사본 (모양마다 한 번만) */
function smoothed(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  let s = smoothGeometries.get(geo);
  if (s) return s;
  const copy = new THREE.BufferGeometry();
  copy.setAttribute('position', geo.attributes.position.clone());
  if (geo.index) copy.setIndex(geo.index.clone());
  s = mergeVertices(copy, 1e-3);
  s.computeVertexNormals();
  smoothGeometries.set(geo, s);
  return s;
}

/**
 * root 안의 보이는 메시마다 외곽선을 붙인다.
 * 투명한 것·판정용(hit area)·바닥판·스프라이트는 건너뛴다. 이미 붙어 있으면 다시 붙이지 않는다.
 */
export function addOutline(root: THREE.Object3D, thickness = 0.025): void {
  const targets: THREE.Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.isOutline || mesh.userData.isHitArea || mesh.userData.noOutline) return;
    const mat = mesh.material as THREE.Material;
    if (Array.isArray(mesh.material) || mat.transparent || (mat as THREE.MeshBasicMaterial).colorWrite === false) return;
    if (mesh.children.some((c) => c.userData.isOutline)) return;
    targets.push(mesh);
  });
  for (const mesh of targets) {
    const outline = new THREE.Mesh(smoothed(mesh.geometry), outlineMaterial(thickness));
    outline.userData.isOutline = true;
    outline.raycast = () => {}; // 톡 판정에서 제외
    outline.castShadow = false;
    outline.receiveShadow = false;
    mesh.add(outline);
  }
}
