import * as THREE from 'three';
import { addOutline, toonMaterial, type ToonParams } from '../../core/toon';
import { getColor, getOutfitItem, SLOTS, type Outfit, type Worn } from '../../systems/wardrobe';
import { createGlbPrincess, hasPrincessGlb } from './princess-glb';
import type { PrincessAnimator } from './princess-animator';

/**
 * 갈아입을 수 있는 임시 공주 모델 (GDD 8.1: 옷·머리는 부위별로 따로 만들어 갈아끼우는 구조).
 * M7에서 부위별 .glb로 바꿀 때도 "부위 = 그룹 하나, 색 = 재질 색"이라는 틀은 그대로 둔다.
 */
const SKIN = 0xffe9dc;
/** 치비 비율(2~3등신): 목을 기준으로 머리(+머리카락·왕관)를 크게 */
const HEAD_PIVOT = 1.02;
const HEAD_SCALE = 1.32;
/** 머리 쪽에 붙는 부위 */
const HEAD_SLOTS = new Set(['hair', 'crown']);

export interface PrincessModel {
  group: THREE.Group;
  setOutfit(outfit: Outfit): void;
  /** 뼈대·동작이 있는 Blender 모델이면 움직임 담당 (도형 공주는 없음) */
  animator?: PrincessAnimator | null;
}

/** Blender 모델(princess.glb)이 불러와져 있으면 그것을, 아니면 도형 공주를 쓴다 */
export function createPrincessModel(outfit: Outfit): PrincessModel {
  return hasPrincessGlb() ? createGlbPrincess(outfit) : createProceduralPrincess(outfit);
}

/** 도형으로 만든 공주 (모델을 못 불러왔을 때·테스트용) */
export function createProceduralPrincess(outfit: Outfit): PrincessModel {
  const group = new THREE.Group();
  const head = new THREE.Group();
  head.position.y = HEAD_PIVOT;
  head.scale.setScalar(HEAD_SCALE);
  group.add(createBody(), head);
  head.add(lowered(createFace()));

  const slotGroups = new Map<string, { key: string; obj: THREE.Object3D }>();

  const setOutfit = (o: Outfit) => {
    for (const slot of SLOTS) {
      const worn = o[slot.id];
      const key = worn ? `${worn.item}:${worn.color}` : 'none';
      const prev = slotGroups.get(slot.id);
      if (prev?.key === key) continue;
      if (prev) {
        prev.obj.parent?.remove(prev.obj);
        dispose(prev.obj);
      }
      const obj = worn ? createSlotMesh(worn) : new THREE.Group();
      obj.name = `slot:${slot.id}`;
      obj.traverse((m) => {
        if ((m as THREE.Mesh).isMesh && !m.userData.noShadow) m.castShadow = true;
      });
      if (HEAD_SLOTS.has(slot.id)) head.add(lowered(obj));
      else group.add(obj);
      slotGroups.set(slot.id, { key, obj });
    }
    addOutline(group, 0.016);
  };
  setOutfit(outfit);
  return { group, setOutfit };
}

/** 머리 그룹(목 기준) 안에 넣을 수 있게 높이를 내린다 */
function lowered<T extends THREE.Object3D>(obj: T): T {
  obj.position.y -= HEAD_PIVOT;
  return obj;
}

function mat(color: THREE.ColorRepresentation, extra: ToonParams = {}) {
  return toonMaterial({ color, roughness: 0.6, ...extra });
}

function mesh(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  return m;
}

/** 목·팔 (옷과 상관없는 몸) */
function createBody(): THREE.Group {
  const g = new THREE.Group();
  const skin = mat(SKIN);
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.14, 10), skin, 0, 0.97, 0)); // 목
  for (const s of [-1, 1]) {
    const arm = mesh(new THREE.CapsuleGeometry(0.06, 0.28, 4, 8), skin, s * 0.25, 0.72, 0);
    arm.rotation.z = s * 0.35;
    g.add(arm);
  }
  g.traverse((m) => (m.castShadow = true));
  return g;
}

/** 얼굴: 동그란 머리 + 반짝이는 큰 눈 + 볼터치 + 웃는 입 (앞 = +z) */
function createFace(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(0.3, 28, 20), mat(SKIN), 0, 1.3, 0));
  const eye = mat(0x3d3a4a);
  const shine = mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.6 });
  for (const s of [-1, 1]) {
    const e = mesh(new THREE.SphereGeometry(0.052, 14, 10), eye, s * 0.105, 1.3, 0.255);
    e.scale.set(0.9, 1.2, 0.6);
    e.userData.noOutline = true;
    const hl = mesh(new THREE.SphereGeometry(0.018, 8, 6), shine, s * 0.105 + 0.018, 1.33, 0.29);
    hl.userData.noOutline = true;
    g.add(e, hl);
  }
  const cheek = mat(0xffb3c7, { transparent: true, opacity: 0.75 });
  for (const s of [-1, 1]) {
    const c = mesh(new THREE.SphereGeometry(0.05, 10, 8), cheek, s * 0.17, 1.22, 0.22);
    c.scale.z = 0.4;
    g.add(c);
  }
  const smile = mesh(new THREE.TorusGeometry(0.035, 0.009, 6, 12, Math.PI), mat(0xd9607f), 0, 1.215, 0.285);
  smile.rotation.z = Math.PI;
  smile.userData.noOutline = true;
  g.add(smile);
  g.traverse((m) => (m.castShadow = true));
  return g;
}

function createSlotMesh(worn: Worn): THREE.Object3D {
  const g = new THREE.Group();
  if (!worn.item) return g;
  const item = getOutfitItem(worn.item);
  if (!item) return g;
  const color = new THREE.Color(getColor(worn.color).hex);
  const main = mat(color);
  const light = mat(color.clone().lerp(new THREE.Color(0xffffff), 0.45));

  switch (`${item.slot}:${item.shape}`) {
    // ── 머리 ──
    case 'hair:long':
    case 'hair:pigtails':
    case 'hair:bun':
    case 'hair:short':
    case 'hair:ponytail': {
      const cap = mesh(new THREE.SphereGeometry(0.325, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), main, 0, 1.31, -0.01);
      cap.rotation.x = -0.35; // 이마는 살짝 보이게
      g.add(cap);
      if (item.shape === 'long') {
        const back = mesh(new THREE.CapsuleGeometry(0.24, 0.42, 6, 14), main, 0, 1.05, -0.13);
        back.scale.z = 0.55;
        g.add(back);
      } else if (item.shape === 'pigtails') {
        for (const s of [-1, 1]) {
          g.add(mesh(new THREE.SphereGeometry(0.1, 12, 10), main, s * 0.33, 1.32, -0.06));
          g.add(mesh(new THREE.CapsuleGeometry(0.08, 0.3, 4, 10), main, s * 0.37, 1.08, -0.06));
        }
      } else if (item.shape === 'short') {
        const bob = mesh(new THREE.SphereGeometry(0.34, 20, 14), main, 0, 1.24, -0.06);
        bob.scale.set(1, 0.75, 0.85);
        g.add(bob);
      } else if (item.shape === 'ponytail') {
        g.add(mesh(new THREE.SphereGeometry(0.09, 12, 10), main, 0, 1.45, -0.32));
        const tail = mesh(new THREE.CapsuleGeometry(0.09, 0.3, 4, 10), main, 0, 1.22, -0.42);
        tail.rotation.x = 0.4;
        g.add(tail);
      } else {
        g.add(mesh(new THREE.SphereGeometry(0.15, 14, 12), main, 0, 1.62, -0.06));
      }
      break;
    }
    case 'crown:flowers': {
      const ring = mesh(new THREE.TorusGeometry(0.3, 0.025, 8, 28), mat(0x86d98f), 0, 1.55, 0);
      ring.rotation.x = Math.PI / 2 - 0.3;
      g.add(ring);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), main, Math.sin(a) * 0.3, 1.55 + Math.cos(a) * 0.09, Math.cos(a) * 0.29));
      }
      break;
    }

    // ── 왕관·머리띠 ──
    case 'crown:crown': {
      const crown = mesh(
        new THREE.CylinderGeometry(0.16, 0.2, 0.18, 5, 1, true),
        mat(color, { roughness: 0.3, metalness: 0.25, side: THREE.DoubleSide }),
        0, 1.65, -0.02,
      );
      g.add(crown);
      g.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), mat(0xffffff, { roughness: 0.2 }), 0, 1.66, 0.17));
      break;
    }
    case 'crown:ribbon': {
      const band = mesh(new THREE.TorusGeometry(0.33, 0.03, 8, 28, Math.PI), main, 0, 1.3, 0.02);
      band.rotation.y = 0;
      g.add(band);
      for (const s of [-1, 1]) {
        const loop = mesh(new THREE.ConeGeometry(0.09, 0.16, 12), main, 0.18 + s * 0.09, 1.6, 0.02);
        loop.rotation.z = s * Math.PI * 0.5;
        g.add(loop);
      }
      g.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), light, 0.18, 1.6, 0.02));
      break;
    }
    case 'crown:tiara': {
      g.add(
        mesh(
          new THREE.CylinderGeometry(0.25, 0.27, 0.06, 20, 1, true, -Math.PI * 0.4, Math.PI * 0.8),
          mat(color, { roughness: 0.3, metalness: 0.25, side: THREE.DoubleSide }),
          0, 1.52, 0,
        ),
      );
      const gem = mesh(new THREE.OctahedronGeometry(0.06), mat(0xffffff, { roughness: 0.1, emissive: color, emissiveIntensity: 0.3 }), 0, 1.6, 0.24);
      g.add(gem);
      break;
    }

    // ── 드레스 ──
    case 'dress:basic':
    case 'dress:flower':
    case 'dress:ribbon': {
      g.add(mesh(new THREE.CylinderGeometry(0.17, 0.42, 0.82, 24), main, 0, 0.5, 0));
      if (item.shape === 'ribbon') {
        for (const [y, r] of [[0.14, 0.42], [0.34, 0.35]] as const) {
          const frill = mesh(new THREE.TorusGeometry(r, 0.035, 8, 28), light, 0, y, 0);
          frill.rotation.x = Math.PI / 2;
          g.add(frill);
        }
        for (const s of [-1, 1]) {
          const loop = mesh(new THREE.SphereGeometry(0.12, 12, 8), light, s * 0.13, 0.7, -0.24);
          loop.scale.set(1.2, 0.8, 0.5);
          g.add(loop);
        }
      }
      if (item.shape === 'flower') {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          g.add(mesh(new THREE.SphereGeometry(0.09, 10, 8), light, Math.sin(a) * 0.43, 0.12, Math.cos(a) * 0.43));
        }
        // 가슴의 꽃 장식
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          g.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), light, Math.cos(a) * 0.045, 0.8 + Math.sin(a) * 0.045, 0.19));
        }
        g.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), mat(0xfff3b0), 0, 0.8, 0.21));
      }
      break;
    }
    case 'dress:puffy': {
      g.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.32, 18), main, 0, 0.78, 0));
      const skirt = mesh(new THREE.SphereGeometry(0.5, 24, 16), main, 0, 0.38, 0);
      skirt.scale.y = 0.72;
      g.add(skirt);
      const frill = mesh(new THREE.TorusGeometry(0.47, 0.05, 8, 32), light, 0, 0.2, 0);
      frill.rotation.x = Math.PI / 2;
      g.add(frill);
      break;
    }

    // ── 신발 ──
    case 'shoes:bunny': {
      for (const s of [-1, 1]) {
        const shoe = mesh(new THREE.SphereGeometry(0.09, 12, 8), main, s * 0.13, 0.05, 0.08);
        shoe.scale.set(1, 0.65, 1.4);
        g.add(shoe);
        for (const e of [-1, 1]) {
          const ear = mesh(new THREE.SphereGeometry(0.03, 8, 6), light, s * 0.13 + e * 0.03, 0.13, 0.1);
          ear.scale.y = 2;
          g.add(ear);
        }
      }
      break;
    }
    case 'shoes:flat': {
      for (const s of [-1, 1]) {
        const shoe = mesh(new THREE.SphereGeometry(0.08, 12, 8), main, s * 0.13, 0.05, 0.08);
        shoe.scale.set(1, 0.6, 1.5);
        g.add(shoe);
      }
      break;
    }
    case 'shoes:boots': {
      for (const s of [-1, 1]) {
        g.add(mesh(new THREE.CylinderGeometry(0.08, 0.085, 0.24, 12), main, s * 0.13, 0.12, 0.02));
        const toe = mesh(new THREE.SphereGeometry(0.085, 12, 8), main, s * 0.13, 0.05, 0.08);
        toe.scale.set(1, 0.6, 1.3);
        g.add(toe);
      }
      break;
    }

    // ── 장신구 ──
    case 'accessory:necklace': {
      const ring = mesh(new THREE.TorusGeometry(0.15, 0.02, 8, 24), main, 0, 0.92, 0.02);
      ring.rotation.x = Math.PI / 2 - 0.35;
      g.add(ring);
      g.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), mat(color, { roughness: 0.2, metalness: 0.2 }), 0, 0.85, 0.17));
      break;
    }
    case 'accessory:wings': {
      const wingMat = mat(color, { transparent: true, opacity: 0.75, roughness: 0.3, side: THREE.DoubleSide });
      for (const s of [-1, 1]) {
        const upper = mesh(new THREE.SphereGeometry(0.3, 16, 12), wingMat, s * 0.26, 0.95, -0.28);
        upper.scale.set(0.9, 1, 0.12);
        upper.rotation.set(0, s * 0.5, s * -0.4);
        upper.userData.noShadow = true;
        const lower = mesh(new THREE.SphereGeometry(0.2, 14, 10), wingMat, s * 0.2, 0.62, -0.26);
        lower.scale.set(0.9, 1, 0.12);
        lower.rotation.set(0, s * 0.5, s * 0.5);
        lower.userData.noShadow = true;
        g.add(upper, lower);
      }
      break;
    }
    case 'accessory:heart-bag': {
      for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), main, -0.36 + s * 0.045, 0.5, 0.12));
      const tip = mesh(new THREE.ConeGeometry(0.085, 0.1, 4), main, -0.36, 0.43, 0.12);
      tip.rotation.x = Math.PI;
      g.add(tip);
      break;
    }
    case 'accessory:wand': {
      const stick = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.45, 8), mat(0xffffff), 0.36, 0.66, 0.14);
      stick.rotation.x = 0.5;
      g.add(stick);
      const star = mesh(new THREE.OctahedronGeometry(0.09), mat(color, { emissive: color, emissiveIntensity: 0.35 }), 0.36, 0.86, 0.26);
      g.add(star);
      break;
    }
  }
  return g;
}

function dispose(obj: THREE.Object3D): void {
  obj.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((x) => x.dispose());
  });
}
