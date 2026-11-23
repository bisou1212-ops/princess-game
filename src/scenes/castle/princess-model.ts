import * as THREE from 'three';
import { getColor, getOutfitItem, SLOTS, type Outfit, type Worn } from '../../systems/wardrobe';

/**
 * 갈아입을 수 있는 임시 공주 모델 (GDD 8.1: 옷·머리는 부위별로 따로 만들어 갈아끼우는 구조).
 * M7에서 부위별 .glb로 바꿀 때도 "부위 = 그룹 하나, 색 = 재질 색"이라는 틀은 그대로 둔다.
 */
const SKIN = 0xffe9dc;

export interface PrincessModel {
  group: THREE.Group;
  setOutfit(outfit: Outfit): void;
}

export function createPrincessModel(outfit: Outfit): PrincessModel {
  const group = new THREE.Group();
  group.add(createBase());

  const slotGroups = new Map<string, { key: string; obj: THREE.Object3D }>();

  const setOutfit = (o: Outfit) => {
    for (const slot of SLOTS) {
      const worn = o[slot.id];
      const key = worn ? `${worn.item}:${worn.color}` : 'none';
      const prev = slotGroups.get(slot.id);
      if (prev?.key === key) continue;
      if (prev) {
        group.remove(prev.obj);
        dispose(prev.obj);
      }
      const obj = worn ? createSlotMesh(worn) : new THREE.Group();
      obj.name = `slot:${slot.id}`;
      obj.traverse((m) => {
        if ((m as THREE.Mesh).isMesh && !m.userData.noShadow) m.castShadow = true;
      });
      group.add(obj);
      slotGroups.set(slot.id, { key, obj });
    }
  };
  setOutfit(outfit);
  return { group, setOutfit };
}

function mat(color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
}

function mesh(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  return m;
}

/** 머리·얼굴·팔 (옷과 상관없는 몸) */
function createBase(): THREE.Group {
  const g = new THREE.Group();
  const skin = mat(SKIN);
  g.add(mesh(new THREE.SphereGeometry(0.3, 24, 18), skin, 0, 1.3, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 10), skin, 0, 0.98, 0)); // 목
  // 눈 (앞 = +z)
  const eye = mat(0x3d3a4a, { roughness: 0.3 });
  for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.04, 10, 8), eye, s * 0.1, 1.32, 0.26));
  // 볼
  const cheek = mat(0xffb3c7, { transparent: true, opacity: 0.7 });
  for (const s of [-1, 1]) {
    const c = mesh(new THREE.SphereGeometry(0.045, 10, 8), cheek, s * 0.17, 1.24, 0.22);
    c.scale.z = 0.4;
    g.add(c);
  }
  // 팔
  for (const s of [-1, 1]) {
    const arm = mesh(new THREE.CapsuleGeometry(0.06, 0.28, 4, 8), skin, s * 0.25, 0.72, 0);
    arm.rotation.z = s * 0.35;
    g.add(arm);
  }
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
    case 'hair:bun': {
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
      } else {
        g.add(mesh(new THREE.SphereGeometry(0.15, 14, 12), main, 0, 1.62, -0.06));
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
    case 'dress:flower': {
      g.add(mesh(new THREE.CylinderGeometry(0.17, 0.42, 0.82, 24), main, 0, 0.5, 0));
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
