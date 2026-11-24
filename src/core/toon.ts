import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 화풍 (GDD 8.1 → 2026-11 변경: 부드러운 입체).
 * - glossy(기본): 말랑하고 윤기 나는 피규어 같은 질감 — 물리 기반 재질 + 반사광(clearcoat) + 반짝이 가루
 * - toon: 예전 그림책 툰 셰이딩 + 외곽선 (주소에 ?style=toon 을 붙이면 비교용으로 볼 수 있음)
 * 모든 장면은 toonMaterial()(이름은 그대로)로 재질을 만든다. role 로 재질 느낌을 고른다.
 */
export type ArtStyle = 'glossy' | 'toon';

export const STYLE: ArtStyle = (() => {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('style');
    return q === 'toon' ? 'toon' : 'glossy';
  } catch {
    return 'glossy';
  }
})();

/** 명암 3단계 (툰 화풍용) */
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

/** 재질 느낌: skin(말랑한 피부) · hair(윤기 나는 머리, 아래로 갈수록 밝게) · cloth(반짝이 가루 옷) · gem(보석) · plain */
export type SurfaceRole = 'plain' | 'skin' | 'hair' | 'cloth' | 'gem';

export type Surface = THREE.MeshToonMaterial | THREE.MeshPhysicalMaterial;

/** 화풍에 맞는 재질 하나 */
export function toonMaterial(params: ToonParams = {}, role: SurfaceRole = 'plain'): Surface {
  const { roughness, metalness: _m, gradientMap: _g, ...rest } = params;
  if (STYLE === 'toon') return new THREE.MeshToonMaterial({ gradientMap: GRADIENT, ...rest });
  const look: Record<SurfaceRole, THREE.MeshPhysicalMaterialParameters> = {
    // 바닥·벽처럼 넓은 면은 무광 (반사가 화면 전체를 뿌옇게 만들지 않게)
    plain: { roughness: Math.max(roughness ?? 0.8, 0.7), envMapIntensity: 0.35 },
    skin: { roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.3, sheen: 0.4, sheenColor: new THREE.Color(0xffd6e4), sheenRoughness: 0.6 },
    hair: { roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.15 },
    cloth: { roughness: 0.45, clearcoat: 0.55, clearcoatRoughness: 0.25, sheen: 0.8, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.35 },
    gem: { roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, metalness: 0.1 },
  };
  const m = new THREE.MeshPhysicalMaterial({ ...rest, ...look[role] });
  if (role === 'hair' || role === 'cloth') addGlitter(m, role === 'hair');
  return m;
}

/**
 * 반짝이 가루 + (머리) 끝으로 갈수록 밝아지는 색.
 * 물체 좌표를 작은 칸으로 나눠 몇 칸만 반짝, 보는 각도가 바뀌면 다른 칸이 반짝인다.
 */
function addGlitter(m: THREE.MeshPhysicalMaterial, gradient: boolean): void {
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vObjPos;
float glitterHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
${gradient ? 'diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, vec3(1.0, 0.86, 0.95), 0.6), (1.0 - smoothstep(0.6, 1.35, vObjPos.y)));' : ''}`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
{
  vec3 cell = floor(vObjPos * 70.0);
  float h = glitterHash(cell);
  float tw = fract(h * 37.0 + dot(normalize(vViewPosition), vec3(1.7, 2.3, 3.1)) * 1.5);
  float sparkle = step(0.965, h) * smoothstep(0.75, 1.0, tw);
  gl_FragColor.rgb += sparkle * 1.2; // 빛번짐 문턱을 넘어 반짝이만 번지게
}`,
      );
  };
  m.customProgramCacheKey = () => (gradient ? 'glitter-hair' : 'glitter-cloth');
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
  if (STYLE !== 'toon') return; // 말랑한 피규어 느낌에는 외곽선이 없다
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
