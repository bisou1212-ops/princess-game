import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import friendsUrl from '../../assets/models/friends.glb?url';
import { addOutline, toonMaterial } from '../../core/toon';

/**
 * Blender로 만든 친구 모델 (scripts/blender/build_friends.py → friends.glb).
 * 물체 이름 = characters.json 의 id (flora, tori, gogo, dochi). 색은 고정.
 * 모델에 없는 친구(새로 추가된 친구 등)는 도형 모델로 대신한다.
 */
const templates = new Map<string, THREE.Object3D>();

export async function preloadFriendsGlb(): Promise<boolean> {
  if (templates.size > 0) return true;
  try {
    const gltf = await new GLTFLoader().loadAsync(friendsUrl);
    for (const node of [...gltf.scene.children]) templates.set(node.name, node);
    return true;
  } catch (err) {
    console.warn('친구 모델을 불러오지 못해 도형 친구를 씁니다.', err);
    return false;
  }
}

export function hasFriendGlb(id: string): boolean {
  return templates.has(id);
}

/** 친구 하나 (앞 = +z, 바닥 y=0) */
export function createFriendFromGlb(id: string): THREE.Group {
  const t = templates.get(id);
  if (!t) throw new Error(`friends.glb에 없는 친구: ${id}`);
  const node = t.clone(true);
  node.position.set(0, 0, 0);
  node.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.material as THREE.MeshStandardMaterial;
    const name = src.name || '';
    mesh.material = toonMaterial({
      color: src.color.clone(),
      emissive: name.startsWith('shine') ? 0xffffff : 0x000000,
      emissiveIntensity: name.startsWith('shine') ? 0.5 : 0,
    });
    mesh.castShadow = true;
    if (/^(shine|mouth|cheek|eye)/.test(name)) mesh.userData.noOutline = true;
  });
  const g = new THREE.Group();
  g.add(node);
  addOutline(g, 0.012);
  return g;
}

/** 모델에 들어 있는 친구 이름 (점검용) */
export function friendGlbNames(): string[] {
  return [...templates.keys()];
}
