import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import { addOutline, toonMaterial } from '../../core/toon';
import type { Character } from '../../systems/dialogue';
import type { FlowerPatch, Obstacle, Theme } from './courtyard-layout';

/**
 * 그레이박스용 도형 모델들 (M7에서 .glb 아트로 교체).
 * 하늘·캐릭터·꽃처럼 "색이 의미 있는 것"만 색을 쓰고 나머지는 회색.
 */
export const COLORS = {
  sky: 0xbfe6ff,
  ground: 0xb8b8bc,
  courtyard: 0xcacacf,
  wall: 0x9d9da6,
  prop: 0xaaaab2,
  head: 0xffe9dc,
  crown: 0xffd76a,
  stem: 0x7fc47a,
} as const;

export function createObstacleMesh(o: Obstacle, theme?: Theme): THREE.Object3D {
  const isStructure = /^(wall|castle|tower)/.test(o.id);
  const base = o.color ?? (isStructure ? (theme?.structure ?? COLORS.wall) : (theme?.prop ?? COLORS.prop));
  const mat = toonMaterial({ color: base, roughness: 0.9 });
  let obj: THREE.Object3D;

  if (o.shape === 'house') {
    // 집: 몸통 + 네모뿔 지붕 + 문 + 창문
    const house = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), mat);
    body.position.y = o.h / 2;
    const roofH = Math.min(o.w, o.d) * 0.55;
    const diag = Math.hypot(o.w, o.d);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(diag / 2 + 0.15, roofH, 4, 1),
      toonMaterial({ color: o.roof ?? '#ff8fc4', roughness: 0.8 }),
    );
    roof.rotation.y = Math.PI / 4;
    roof.scale.set((o.w / diag) * 1.42, 1, (o.d / diag) * 1.42);
    roof.position.y = o.h + roofH / 2;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.3, 0.08), toonMaterial({ color: 0xc99a74 }));
    door.position.set(0, 0.65, o.d / 2 + 0.03);
    const winMat = toonMaterial({ color: 0xbfe6ff, emissive: 0x223344 });
    for (const s of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.06), winMat);
      win.position.set(s * o.w * 0.3, o.h * 0.62, o.d / 2 + 0.03);
      house.add(win);
    }
    house.add(body, roof, door);
    house.position.set(o.x, 0, o.z);
    obj = house;
  } else if (o.shape === 'box') {
    obj = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), mat);
    obj.position.set(o.x, o.h / 2, o.z);
  } else if (o.shape === 'cylinder') {
    const cyl = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, o.h, 28), mat);
    body.position.y = o.h / 2;
    cyl.add(body);
    if (o.roof) {
      // 탑 지붕 (뾰족한 고깔)
      const roof = new THREE.Mesh(new THREE.ConeGeometry(o.r * 1.2, o.r * 2.2, 28), toonMaterial({ color: o.roof }));
      roof.position.y = o.h + o.r * 1.1;
      cyl.add(roof);
    }
    cyl.position.set(o.x, 0, o.z);
    obj = cyl;
  } else {
    // 나무: 갈색 줄기 + 동글동글 연두 잎 (충돌은 줄기 반지름 r)
    const tree = new THREE.Group();
    const trunkH = o.h * 0.45;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.6, o.r * 0.8, trunkH, 12), toonMaterial({ color: 0xc99a74 }));
    trunk.position.y = trunkH / 2;
    const leaf = toonMaterial({ color: o.color ?? '#9fdc93' });
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(o.h * 0.33, 18, 14), leaf);
    canopy.position.y = trunkH + o.h * 0.25;
    const puff = new THREE.Mesh(new THREE.SphereGeometry(o.h * 0.2, 14, 10), leaf);
    puff.position.set(o.h * 0.2, trunkH + o.h * 0.42, o.h * 0.05);
    tree.add(trunk, canopy, puff);
    tree.position.set(o.x, 0, o.z);
    obj = tree;
  }

  obj.name = o.id;
  obj.traverse((m) => {
    m.castShadow = true;
    m.receiveShadow = true;
  });
  addOutline(obj, 0.035);
  return obj;
}

/** 톡하기 쉽게 실제 모양보다 넓은 투명 판정 영역 (7세 손가락 기준) */
export function createHitArea(radius: number, height: number): THREE.Mesh {
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 12),
    // visible=false: 그리지 않지만 톡 판정(raycast)은 된다 → 그리기 호출을 아낌
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hit.position.y = height / 2;
  hit.userData.isHitArea = true;
  return hit;
}

/** 임시 캐릭터(도형): 몸 + 얼굴 + 모양별 장식. 앞(+z)에 코를 달아 보는 방향이 보이게 함 */
export function createCharacterMesh(character: Character): THREE.Group {
  const bodyColor = new THREE.Color(character.color);
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.33, 0.42, 6, 16), toonMaterial({ color: bodyColor }));
  body.position.y = 0.55;
  g.add(body);

  // 치비 비율: 목을 기준으로 머리를 크게 (공주 모델과 같은 비율)
  const PIVOT = 1.0;
  const head = new THREE.Group();
  head.position.y = PIVOT;
  head.scale.setScalar(1.3);
  g.add(head);
  const add = (m: THREE.Object3D, x: number, y: number, z: number) => {
    m.position.set(x, y - PIVOT, z);
    head.add(m);
    return m;
  };

  const animal = character.model !== 'princess' && character.model !== 'plain';
  add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18), toonMaterial({ color: animal ? bodyColor : COLORS.head })), 0, 1.3, 0);
  // 눈 + 반짝 + 볼 + 웃는 입
  const eyeMat = toonMaterial({ color: 0x3d3a4a });
  const shineMat = toonMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 });
  for (const s of [-1, 1]) {
    const eye = add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), eyeMat), s * 0.1, 1.31, 0.255);
    eye.scale.set(0.9, 1.15, 0.6);
    eye.userData.noOutline = true;
    add(new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), shineMat), s * 0.1 + 0.017, 1.335, 0.29).userData.noOutline = true;
    const cheek = add(
      new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), toonMaterial({ color: 0xffb3c7, transparent: true, opacity: 0.75 })),
      s * 0.17, 1.22, 0.22,
    );
    cheek.scale.z = 0.4;
  }
  if (animal) {
    // 동물 친구: 동그란 주둥이 + 코
    const muzzle = add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), toonMaterial({ color: bodyColor.clone().lerp(new THREE.Color(0xffffff), 0.5) })), 0, 1.2, 0.25);
    muzzle.scale.z = 0.6;
    add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), toonMaterial({ color: character.model === 'rabbit' ? 0xff8fb5 : 0x5a4a6b })), 0, 1.23, 0.31).userData.noOutline = true;
  } else {
    const smile = add(new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 6, 12, Math.PI), toonMaterial({ color: 0xd9607f })), 0, 1.215, 0.285);
    smile.rotation.z = Math.PI;
    smile.userData.noOutline = true;
    // 머리카락 (몸 색을 진하게)
    const hair = add(
      new THREE.Mesh(new THREE.SphereGeometry(0.325, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), toonMaterial({ color: bodyColor.clone().multiplyScalar(0.75) })),
      0, 1.31, -0.01,
    );
    hair.rotation.x = -0.35;
  }

  if (character.model === 'princess') {
    const crown = createCrown();
    add(crown, 0, crown.position.y + 0.03, -0.02);
  }
  if (character.model === 'bear') {
    const earMat = toonMaterial({ color: bodyColor });
    for (const side of [-1, 1]) add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), earMat), side * 0.22, 1.55, 0);
  }
  if (character.model === 'hedgehog') {
    const spikeMat = toonMaterial({ color: bodyColor.clone().multiplyScalar(0.7) });
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * 0.45 + (i / 8) * Math.PI * 0.9;
      const spike = add(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 6), spikeMat), Math.sin(a) * 0.26, 1.42 + Math.cos(a) * 0.08, -Math.cos(a) * 0.2);
      spike.rotation.set(-0.9, 0, -a * 0.8);
    }
  }
  if (character.model === 'bird') {
    // 부리 + 머리 깃털 + 작은 날개
    const beak = add(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 10), toonMaterial({ color: 0xffa94d })), 0, 1.22, 0.33);
    beak.rotation.x = Math.PI / 2;
    for (const s of [-1, 0, 1]) {
      const tuft = add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), toonMaterial({ color: bodyColor })), s * 0.06, 1.66, 0);
      tuft.scale.set(0.6, 1.4, 0.6);
      tuft.rotation.z = -s * 0.4;
    }
  }
  if (character.model === 'rabbit') {
    const earMat = toonMaterial({ color: bodyColor });
    for (const side of [-1, 1]) {
      const ear = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.38, 4, 8), earMat), side * 0.13, 1.72, -0.02);
      ear.rotation.z = side * -0.18;
    }
  }
  if (character.model === 'bird') {
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), toonMaterial({ color: bodyColor.clone().multiplyScalar(0.9) }));
      wing.scale.set(0.35, 0.9, 0.7);
      wing.position.set(side * 0.36, 0.62, -0.02);
      wing.rotation.z = side * 0.3;
      g.add(wing);
    }
  }
  g.traverse((m) => (m.castShadow = true));
  addOutline(g, 0.016);
  return g;
}

function createCrown(): THREE.Mesh {
  const crown = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.2, 0.18, 5, 1, true),
    toonMaterial({ color: COLORS.crown, roughness: 0.3, metalness: 0.2, side: THREE.DoubleSide }),
  );
  crown.position.y = 1.62;
  return crown;
}

/** 꽃: 줄기 + 꽃잎 5장 + 가운데. 꽃잎 색이 곧 정답 단서라 또렷하게 */
export function createFlowerMesh(color: string): THREE.Group {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6),
    toonMaterial({ color: COLORS.stem }),
  );
  stem.position.y = 0.25;
  g.add(stem);

  const bloom = new THREE.Group();
  bloom.position.y = 0.55;
  bloom.rotation.x = -0.5;
  const petalMat = toonMaterial({ color: new THREE.Color(color), roughness: 0.5 });
  // 꽃잎 다섯 장을 메시 하나로 (그리기 한 번)
  const petalGeos = Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * Math.PI * 2;
    return new THREE.SphereGeometry(0.13, 10, 7).scale(1, 0.45, 1).translate(Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14);
  });
  bloom.add(new THREE.Mesh(mergeGeometries(petalGeos)!, petalMat));
  petalGeos.forEach((g) => g.dispose());
  const center = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 10, 8),
    toonMaterial({ color: 0xfff3b0, emissive: 0x443300 }),
  );
  center.position.y = 0.04;
  bloom.add(center);
  bloom.name = 'bloom';
  g.add(bloom);

  // 반짝이는 바닥 고리 (GDD 7: 다음에 할 일은 반짝이는 표시)
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.42, 28),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.02;
  glow.name = 'glow';
  g.add(glow);

  g.traverse((m) => {
    if (m !== glow) m.castShadow = true;
  });
  return g;
}

/** 분홍 하트 그림 (스프라이트용) */
export function createHeartTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(size / 2, size / 2 + 6);
  ctx.beginPath();
  ctx.moveTo(0, 36);
  ctx.bezierCurveTo(-60, -4, -40, -56, 0, -24);
  ctx.bezierCurveTo(40, -56, 60, -4, 0, 36);
  ctx.closePath();
  ctx.fillStyle = '#ff8fc4';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 장식 꽃밭: 작은 꽃 여러 송이 (항상 같은 모양이 되도록 위치로 정한 난수) */
export function createFlowerPatch(patch: FlowerPatch): THREE.Group {
  const g = new THREE.Group();
  let seed = Math.floor((patch.x * 73.1 + patch.z * 37.7 + patch.n) * 1000) >>> 0 || 1;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const colors = [0xff9ccf, 0xffd84d, 0xb99cff, 0xffffff, 0xff8fa3];
  const stemMat = toonMaterial({ color: COLORS.stem });
  const stemGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.45, 5);
  const headGeo = new THREE.SphereGeometry(0.15, 10, 8);
  const mats = colors.map((c) => toonMaterial({ color: c, roughness: 0.6 }));
  for (let i = 0; i < patch.n; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * patch.r;
    const x = patch.x + Math.cos(a) * r;
    const z = patch.z + Math.sin(a) * r;
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.set(x, (patch.y ?? 0) + 0.22, z);
    const head = new THREE.Mesh(headGeo, mats[Math.floor(rand() * mats.length)]);
    head.position.set(x, (patch.y ?? 0) + 0.48, z);
    head.scale.y = 0.6;
    g.add(stem, head);
  }
  return mergeByMaterial(g);
}

/** 움직이지 않는 장식: 같은 재질끼리 메시 하나로 합쳐 그리기 호출을 줄인다 */
function mergeByMaterial(g: THREE.Group): THREE.Group {
  g.updateMatrixWorld(true);
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const mat = mesh.material as THREE.Material;
    if (!groups.has(mat)) groups.set(mat, []);
    groups.get(mat)!.push(geo);
  });
  const out = new THREE.Group();
  for (const [mat, geos] of groups) {
    const merged = mergeGeometries(geos);
    geos.forEach((x) => x.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}

/**
 * 부탁으로 줍는 물건 (꽃 말고). 돌아가는 부분은 'bloom', 바닥 반짝 고리는 'glow' 이름으로 둔다.
 * shape: strawberry · blueberry · pot(넘어진 화분 — 'bloom'이 옆으로 누워 있다)
 */
export function createPickupMesh(shape: string, color: string): THREE.Group {
  if (shape === 'flower') return createFlowerMesh(color);
  const g = new THREE.Group();
  const bloom = new THREE.Group();
  bloom.name = 'bloom';
  g.add(bloom);
  if (shape === 'strawberry') {
    const berry = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), toonMaterial({ color }));
    berry.scale.set(1, 1.15, 1);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.18, 16), toonMaterial({ color }));
    tip.rotation.x = Math.PI;
    tip.position.y = -0.14;
    const seedMat = toonMaterial({ color: 0xfff3b0 });
    for (let i = 0; i < 10; i++) {
      const a = i * 2.4;
      const y = -0.08 + (i % 4) * 0.06;
      const seed = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), seedMat);
      seed.position.set(Math.cos(a) * 0.16, y, Math.sin(a) * 0.16);
      seed.userData.noOutline = true;
      bloom.add(seed);
    }
    const leafMat = toonMaterial({ color: 0x7fc47a });
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 6), leafMat);
      const a = (i / 5) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 0.07, 0.17, Math.sin(a) * 0.07);
      leaf.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
      bloom.add(leaf);
    }
    bloom.add(berry, tip);
    bloom.position.y = 0.32;
  } else if (shape === 'blueberry') {
    const mat = toonMaterial({ color });
    for (const [x, y, z] of [[-0.09, 0, 0.02], [0.09, 0, -0.02], [0, 0.13, 0]]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), mat);
      b.position.set(x, y, z);
      bloom.add(b);
    }
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), toonMaterial({ color: 0x7fc47a }));
    leaf.scale.set(1.6, 0.3, 0.8);
    leaf.position.set(0.05, 0.24, 0);
    bloom.add(leaf);
    bloom.position.y = 0.2;
  } else {
    // 화분: 테라코타 몸통 + 흙 + 작은 새싹. 처음엔 옆으로 넘어져 있다
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.32, 18), toonMaterial({ color }));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 18), toonMaterial({ color }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.16;
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.03, 18), toonMaterial({ color: 0x8a5a3c }));
    soil.position.y = 0.14;
    const sprout = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), toonMaterial({ color: 0x86d98f }));
    sprout.position.y = 0.26;
    sprout.scale.y = 0.8;
    const body = new THREE.Group();
    body.add(pot, rim, soil, sprout);
    body.position.y = 0.22;
    body.scale.setScalar(1.4); // 아이 눈에 잘 띄게 크게
    bloom.add(body);
    bloom.userData.noSpin = true;
    bloom.rotation.z = Math.PI / 2; // 넘어짐
    bloom.position.y = 0.28;
  }
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.42, 28),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.02;
  glow.name = 'glow';
  g.add(glow);
  g.traverse((m) => {
    if (m !== glow) m.castShadow = true;
  });
  return g;
}
