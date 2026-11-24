import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import unicornUrl from '../../assets/models/pet-unicorn.glb?url';
import catUrl from '../../assets/models/pet-cat.glb?url';
import puppyUrl from '../../assets/models/pet-puppy.glb?url';
import { STYLE, addOutline, toonMaterial, type SurfaceRole } from '../../core/toon';
import { PET_KINDS } from '../../systems/pet';
import { decorateEyes } from './anime-eyes';
import { PetAnimator } from './pet-animator';

/**
 * 펫 모델 (scripts/blender/build_pets.py → pet-<id>.glb, 한 마리 = 파일 하나, 한 마리 삼각형 약 5천 개).
 * 고른 펫만 불러온다 (첫 로딩을 가볍게). 불러오지 못하면 동글동글 도형 펫.
 */
const URLS: Record<string, string> = { unicorn: unicornUrl, cat: catUrl, puppy: puppyUrl };
const templates = new Map<string, THREE.Object3D>();
const loading = new Map<string, Promise<boolean>>();

export function preloadPet(kind: string): Promise<boolean> {
  if (templates.has(kind)) return Promise.resolve(true);
  const url = URLS[kind];
  if (!url) return Promise.resolve(false);
  let p = loading.get(kind);
  if (!p) {
    p = new GLTFLoader().loadAsync(url).then(
      (gltf) => {
        templates.set(kind, gltf.scene);
        return true;
      },
      (err) => {
        console.warn(`펫 모델(${kind})을 불러오지 못해 도형 펫을 씁니다.`, err);
        return false;
      },
    );
    loading.set(kind, p);
  }
  return p;
}

export interface PetModel {
  group: THREE.Group;
  animator: PetAnimator | null;
}

/** 펫 하나 (앞 = +z, 바닥 y=0) */
export function createPetModel(kind: string): PetModel {
  const t = templates.get(kind);
  if (!t) return createShapePet(kind);
  const root = cloneSkinned(t);
  const g = new THREE.Group();
  g.add(root);
  g.updateMatrixWorld(true);
  let head: THREE.Object3D | undefined;
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone && o.name === 'head') head = o;
  });
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  const eyes: THREE.Object3D[] = [];
  const iris = PET_KINDS[kind]?.eyeColor ?? '#6b5a8a';
  for (const mesh of meshes) {
    const src = mesh.material as THREE.MeshStandardMaterial;
    const name = src.name || '';
    const role: SurfaceRole = /(body|fur|cream|snout)/.test(name) ? 'skin' : /mane/.test(name) ? 'hair' : /(gold|collar)/.test(name) ? 'gem' : 'plain';
    const mat = toonMaterial(
      {
        color: src.color.clone(),
        emissive: name.startsWith('shine') ? 0xffffff : 0x000000,
        emissiveIntensity: name.startsWith('shine') ? 0.5 : 0,
      },
      role,
    );
    mesh.material = mat;
    mesh.castShadow = true;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) mesh.frustumCulled = false;
    if (STYLE === 'glossy') {
      if (name.startsWith('eye')) eyes.push(...decorateEyes(mesh, iris, head));
      if (name.startsWith('shine')) mat.visible = false;
    }
    if (/^(shine|cheek|eye)/.test(name)) mesh.userData.noOutline = true;
  }
  addOutline(g, 0.01);
  g.userData.eyes = eyes; // 잠자리 그림에서 눈 감기
  return { group: g, animator: new PetAnimator(root, eyes) };
}

/** 모델이 없을 때: 동그란 몸 + 머리 + 귀 (펫 색) */
function createShapePet(kind: string): PetModel {
  const g = new THREE.Group();
  const color = PET_KINDS[kind]?.color ?? '#ffffff';
  const fur = toonMaterial({ color }, 'skin');
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 10), fur);
  body.scale.set(0.95, 0.85, 1.3);
  body.position.y = 0.34;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 12), fur);
  head.position.set(0, 0.66, 0.2);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 10), fur);
    ear.position.set(s * 0.14, 0.92, 0.16);
    g.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), toonMaterial({ color: 0x3d3a4a }));
    eye.position.set(s * 0.1, 0.68, 0.44);
    g.add(eye);
  }
  for (const m of [body, head]) m.castShadow = true;
  g.add(body, head);
  return { group: g, animator: null };
}
