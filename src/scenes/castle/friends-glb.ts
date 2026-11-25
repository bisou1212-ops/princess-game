import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import floraUrl from '../../assets/models/friend-flora.glb?url';
import toriUrl from '../../assets/models/friend-tori.glb?url';
import gogoUrl from '../../assets/models/friend-gogo.glb?url';
import dochiUrl from '../../assets/models/friend-dochi.glb?url';
import pippiUrl from '../../assets/models/friend-pippi.glb?url';
import { STYLE, addOutline, toonMaterial } from '../../core/toon';
import { getCharacter } from '../../systems/dialogue';
import { decorateEyes } from './anime-eyes';
import { PrincessAnimator } from './princess-animator';
import { createFace } from './face';

/**
 * Blender로 만든 친구 모델 (scripts/blender/build_friends.py → friend-<id>.glb, 친구 하나 = 파일 하나).
 * 뼈대 물체 이름 = characters.json 의 id. 뼈 이름은 공주와 같아 같은 동작(idle·walk·hop·wave)과
 * 움직임 코드(PrincessAnimator)를 쓴다. 동물은 귀·꼬리 뼈가 스프링으로 출렁인다. 색은 고정.
 * 모델에 없는 친구(새로 추가된 친구 등)는 도형 모델로 대신한다.
 */
const URLS: Record<string, string> = { flora: floraUrl, tori: toriUrl, gogo: gogoUrl, dochi: dochiUrl, pippi: pippiUrl };
const templates = new Map<string, { scene: THREE.Object3D; clips: THREE.AnimationClip[] }>();

export async function preloadFriendsGlb(): Promise<boolean> {
  if (templates.size > 0) return true;
  const loader = new GLTFLoader();
  const results = await Promise.all(
    Object.entries(URLS).map(async ([id, url]) => {
      try {
        const gltf = await loader.loadAsync(url);
        templates.set(id, { scene: gltf.scene, clips: gltf.animations });
        return true;
      } catch (err) {
        console.warn(`친구 모델(${id})을 불러오지 못해 도형 친구를 씁니다.`, err);
        return false;
      }
    }),
  );
  return results.some(Boolean);
}

export function hasFriendGlb(id: string): boolean {
  return templates.has(id);
}

/** 친구 하나 (앞 = +z, 바닥 y=0). userData.animator 로 움직인다 */
export function createFriendFromGlb(id: string): THREE.Group {
  const t = templates.get(id);
  if (!t) throw new Error(`친구 모델이 없음: ${id}`);
  const root = cloneSkinned(t.scene);
  const g = new THREE.Group();
  g.add(root);
  g.updateMatrixWorld(true);
  let head: THREE.Object3D | undefined;
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone && o.name === 'head') head = o;
  });
  const eyes: THREE.Mesh[] = [];
  let mouthMesh: THREE.Mesh | undefined;
  let noseMesh: THREE.Mesh | undefined;
  let beak = false;
  const cheeks: THREE.MeshStandardMaterial[] = [];
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !mesh.userData.eyeDecal) meshes.push(mesh);
  });
  for (const mesh of meshes) {
    const src = mesh.material as THREE.MeshStandardMaterial;
    const name = src.name || '';
    mesh.userData.matName = name;
    if (name.startsWith('mouth')) mouthMesh = mesh;
    if (name.startsWith('f_nose')) noseMesh = mesh;
    if (name.startsWith('f_beak')) beak = true;
    const role = /^(skin|f_.*fur|f_.*body|f_dochi_face)/.test(name)
      ? 'skin'
      : /hair/.test(name)
        ? 'hair'
        : /(dress|light|apron|overall|scarf|chef|wing)/.test(name)
          ? 'cloth'
          : /(gem|gold)/.test(name)
            ? 'gem'
            : 'plain';
    const mat = toonMaterial(
      {
        color: src.color.clone(),
        emissive: name.startsWith('shine') ? 0xffffff : 0x000000,
        emissiveIntensity: name.startsWith('shine') ? 0.5 : 0,
      },
      role,
    );
    mesh.material = mat;
    if (name.startsWith('cheek')) cheeks.push(mat as THREE.MeshStandardMaterial);
    mesh.castShadow = true;
    // 폴짝·걷기로 쉬는 자세 경계 밖으로 나갈 수 있어 화면 밖 판정을 끔 (친구 수가 적어 부담 없음)
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) mesh.frustumCulled = false;
    if (STYLE === 'glossy') {
      if (name.startsWith('eye')) eyes.push(...decorateEyes(mesh, getCharacter(id).eyeColor ?? '#6b5a8a', head));
      if (name.startsWith('shine')) mat.visible = false;
    }
    if (/^(shine|mouth|cheek|eye)/.test(name)) mesh.userData.noOutline = true;
  }
  addOutline(g, 0.012);
  // 부리가 있는 새(삐삐)는 그림 입 없이 눈만 바뀐다
  const face = STYLE === 'glossy' ? createFace({ root, head, eyes, mouthMesh, noseMesh, withMouth: !beak, cheeks }) : null;
  g.userData.face = face;
  g.userData.animator = t.clips.length > 0 ? new PrincessAnimator(root, t.clips, eyes, face) : null;
  return g;
}

/** 모델이 있는 친구 이름 (점검용) */
export function friendGlbNames(): string[] {
  return [...templates.keys()];
}
