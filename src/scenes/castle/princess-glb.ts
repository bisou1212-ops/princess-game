import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import princessUrl from '../../assets/models/princess.glb?url';
import { STYLE, addOutline, toonMaterial, type Surface } from '../../core/toon';
import { getCharacter } from '../../systems/dialogue';
import { decorateEyes } from './anime-eyes';
import { getColor, getOutfitItem, SLOTS, type Outfit } from '../../systems/wardrobe';

/**
 * Blender로 만든 공주 모델 (art-source/princess.blend → scripts/blender/build_princess.py).
 * 약속:
 * - 물체 이름 = 부위 id. "base"(몸·얼굴)는 항상 보이고, 옷은 items.json의 id와 같은 이름.
 * - 재질 이름: tint(옷 색) · tint_light(옷 색을 밝게) · tint_wing(옷 색 + 반투명) · 나머지는 고정 색.
 */
let template: THREE.Object3D | null = null;

/** 게임 시작 때 한 번 불러 둔다. 실패하면 도형 공주로 대신한다 (false) */
export async function preloadPrincessGlb(): Promise<boolean> {
  if (template) return true;
  try {
    const gltf = await new GLTFLoader().loadAsync(princessUrl);
    template = gltf.scene;
    return true;
  } catch (err) {
    console.warn('공주 모델을 불러오지 못해 도형 공주를 씁니다.', err);
    return false;
  }
}

export function hasPrincessGlb(): boolean {
  return template !== null;
}

type TintKind = 'tint' | 'tint_light' | 'tint_wing';
const WHITE = new THREE.Color(0xffffff);

/** 템플릿을 복제하고 재질을 툰 재질로 바꾼 공주 하나 */
export function createGlbPrincess(outfit: Outfit): { group: THREE.Group; setOutfit(o: Outfit): void } {
  if (!template) throw new Error('princess.glb가 아직 없습니다');
  const group = new THREE.Group();
  const root = template.clone(true);
  group.add(root);

  /** 부위 id → 그 부위의 색 바뀌는 재질들 */
  const tints = new Map<string, Array<{ kind: TintKind; mat: Surface }>>();
  const parts = new Map<string, THREE.Object3D>();

  for (const node of root.children) {
    parts.set(node.name, node);
    const list: Array<{ kind: TintKind; mat: Surface }> = [];
    node.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.eyeDecal) return;
      const src = mesh.material as THREE.MeshStandardMaterial;
      const name = (src.name || '').split('.')[0] as TintKind | string;
      let mat: Surface;
      if (name === 'tint' || name === 'tint_light' || name === 'tint_wing') {
        const role = node.name.startsWith('hair') ? 'hair' : /^(crown|tiara|necklace|wand)/.test(node.name) ? 'gem' : 'cloth';
        mat = toonMaterial({ color: src.color.clone() }, role);
        if (name === 'tint_wing') {
          mat.transparent = true;
          mat.opacity = 0.75;
          mat.depthWrite = false;
          mat.side = THREE.DoubleSide;
          mesh.userData.noShadow = true;
        }
        list.push({ kind: name, mat });
      } else {
        const role = name === 'skin' ? 'skin' : name === 'gem' ? 'gem' : 'plain';
        mat = toonMaterial({ color: src.color.clone(), emissive: name === 'shine' ? 0xffffff : 0x000000, emissiveIntensity: name === 'shine' ? 0.5 : 0 }, role);
      }
      mesh.material = mat;
      mesh.castShadow = !mesh.userData.noShadow;
      if (STYLE === 'glossy') {
        if (name === 'eye') decorateEyes(mesh, getCharacter('princess').eyeColor ?? '#b45fd8');
        if (name === 'shine') mat.visible = false; // 그림 눈에 반짝임이 들어 있음
      }
      // 아주 작은 얼굴 조각(눈 반짝·입)은 외곽선 없이
      if (name === 'shine' || name === 'mouth' || name === 'cheek' || name === 'eye') mesh.userData.noOutline = true;
    });
    tints.set(node.name, list);
  }
  addOutline(group, 0.012);

  const setOutfit = (o: Outfit) => {
    const worn = new Map<string, string>(); // 옷 id → 색 id
    for (const slot of SLOTS) {
      const w = o[slot.id];
      if (w?.item && getOutfitItem(w.item)) worn.set(w.item, w.color);
    }
    for (const [name, node] of parts) {
      if (name === 'base') {
        node.visible = true;
        continue;
      }
      const colorId = worn.get(name);
      node.visible = colorId !== undefined;
      if (colorId === undefined) continue;
      const main = new THREE.Color(getColor(colorId).hex);
      for (const t of tints.get(name) ?? []) {
        t.mat.color.copy(t.kind === 'tint_light' ? main.clone().lerp(WHITE, 0.5) : main);
      }
    }
  };
  setOutfit(outfit);
  return { group, setOutfit };
}

/** 모델에 들어 있는 부위 이름 (테스트·점검용) */
export function glbPartNames(): string[] {
  return template ? template.children.map((c) => c.name) : [];
}
