import * as THREE from 'three';
import { QUALITY_SETTINGS } from '../../core/quality';

/**
 * 풀 덤불 (그래픽 2차 G1): 풀밭 위에 작은 풀잎 묶음을 흩뿌려 바람에 살랑이게.
 * - 풀밭 메시의 삼각형 위에 넓이에 비례해 무작위로 놓는다 (위를 향한 면만, 놀이 구역 근처만)
 * - 디딤돌·흙·마당 돌바닥 위에는 놓지 않는다
 * - InstancedMesh 하나 = 그리기 한 번. 덤불 하나 = 삼각형 5개
 */
const BLADES = 5;

function tuftGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  for (let i = 0; i < BLADES; i++) {
    const a = (i / BLADES) * Math.PI * 2 + Math.random() * 0.6;
    const r = 0.04 + Math.random() * 0.05;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 0.16 + Math.random() * 0.14;
    const w = 0.035;
    const lean = 0.06 + Math.random() * 0.05;
    const tx = x + Math.cos(a) * lean;
    const tz = z + Math.sin(a) * lean;
    // 풀잎 하나 = 아래가 넓은 삼각형 (아래는 진하게, 끝은 밝게)
    pos.push(x - Math.sin(a) * w, 0, z + Math.cos(a) * w, x + Math.sin(a) * w, 0, z - Math.cos(a) * w, tx, h, tz);
    col.push(0.9, 0.97, 0.88, 0.9, 0.97, 0.88, 1.15, 1.18, 1.05);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // 위를 향한 법선 → 땅과 같은 밝기로 보임
  const normals = new Float32Array(pos.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return g;
}

export interface TuftSource {
  meshes: THREE.Mesh[];
  /** 덤불을 놓지 않을 메시 (디딤돌·흙·돌바닥) */
  avoid: THREE.Mesh[];
  color: THREE.Color;
}

export function createGrassTufts(src: TuftSource, time: { value: number }, radius = 24): THREE.InstancedMesh | null {
  const count = QUALITY_SETTINGS.grassTufts;
  if (count <= 0 || src.meshes.length === 0) return null;

  // 피할 곳: 0.5m 칸으로 표시
  const blocked = new Set<string>();
  const key = (x: number, z: number) => `${Math.round(x * 2)},${Math.round(z * 2)}`;
  const v = new THREE.Vector3();
  // 넓은 판(마당 돌바닥)은 네모 영역 통째로, 작은 것(디딤돌·흙)은 꼭짓점 둘레 칸으로
  const boxes: THREE.Box3[] = [];
  for (const m of src.avoid) {
    m.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3());
    if (size.x * size.z > 60 && size.y < 0.5) {
      boxes.push(box.expandByScalar(0.3));
      continue;
    }
    const p = m.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) blocked.add(key(v.x + dx * 0.5, v.z + dz * 0.5));
    }
  }
  const inBox = (x: number, z: number) => boxes.some((b) => x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z);

  // 위를 향한 풀밭 삼각형 (놀이 구역 근처만), 넓이 누적
  const tris: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]> = [];
  const cum: number[] = [];
  let total = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  for (const m of src.meshes) {
    m.updateMatrixWorld(true);
    const geo = m.geometry;
    const p = geo.getAttribute('position');
    const idx = geo.index;
    const n = idx ? idx.count : p.count;
    for (let i = 0; i < n; i += 3) {
      a.fromBufferAttribute(p, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld);
      b.fromBufferAttribute(p, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(m.matrixWorld);
      c.fromBufferAttribute(p, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(m.matrixWorld);
      if (Math.hypot((a.x + b.x + c.x) / 3, (a.z + b.z + c.z) / 3) > radius) continue;
      const cross = e1.subVectors(b, a).cross(e2.subVectors(c, a));
      const area = cross.length() / 2;
      if (area < 1e-4 || cross.normalize().y < 0.75) continue;
      total += area;
      tris.push([a.clone(), b.clone(), c.clone()]);
      cum.push(total);
    }
  }
  if (total === 0) return null;

  // 땅보다 조금 진하고 푸른 풀색 (땅은 물리 재질이라 더 밝게 보여서 맞춰 줌)
  const tuftColor = src.color.clone().offsetHSL(0.01, 0.1, 0.07);
  // 땅(물리 재질 + 주변 반사)만큼 밝게 보이도록 스스로 조금 빛나게
  const mat = new THREE.MeshLambertMaterial({ color: tuftColor, emissive: tuftColor.clone().multiplyScalar(0.12), vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTuftTime = time;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTuftTime;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
#ifdef USE_INSTANCING
vec3 tuftPos = vec3(instanceMatrix[3]);
#else
vec3 tuftPos = vec3(0.0);
#endif
float tuftW = sin(uTuftTime * 1.8 + tuftPos.x * 0.4 + tuftPos.z * 0.3) + 0.35 * sin(uTuftTime * 3.3 + tuftPos.x * 1.7);
transformed.x += tuftW * transformed.y * 0.35;
transformed.z += tuftW * transformed.y * 0.15;`,
    );
  };
  mat.customProgramCacheKey = () => 'grass-tufts';

  const mesh = new THREE.InstancedMesh(tuftGeometry(), mat, count);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const pt = new THREE.Vector3();
  let placed = 0;
  for (let tries = 0; tries < count * 4 && placed < count; tries++) {
    const r = Math.random() * total;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    const [ta, tb, tc] = tris[lo];
    let u = Math.random();
    let w = Math.random();
    if (u + w > 1) {
      u = 1 - u;
      w = 1 - w;
    }
    pt.copy(ta).addScaledVector(e1.subVectors(tb, ta), u).addScaledVector(e2.subVectors(tc, ta), w);
    if (blocked.has(key(pt.x, pt.z)) || inBox(pt.x, pt.z)) continue;
    q.setFromAxisAngle(up, Math.random() * Math.PI * 2);
    s.setScalar(0.7 + Math.random() * 0.7);
    m4.compose(pt, q, s);
    mesh.setMatrixAt(placed++, m4);
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.raycast = () => {}; // 톡은 땅이 받는다
  return mesh;
}
