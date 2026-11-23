import * as THREE from 'three';
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
  const mat = new THREE.MeshStandardMaterial({ color: base, roughness: 0.9 });
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
      new THREE.MeshStandardMaterial({ color: o.roof ?? '#ff8fc4', roughness: 0.8 }),
    );
    roof.rotation.y = Math.PI / 4;
    roof.scale.set((o.w / diag) * 1.42, 1, (o.d / diag) * 1.42);
    roof.position.y = o.h + roofH / 2;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.3, 0.08), new THREE.MeshStandardMaterial({ color: 0xc99a74 }));
    door.position.set(0, 0.65, o.d / 2 + 0.03);
    const winMat = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, emissive: 0x223344 });
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
    obj = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, o.h, 24), mat);
    obj.position.set(o.x, o.h / 2, o.z);
  } else {
    // 나무: 줄기 + 동그란 잎 (충돌은 줄기 반지름 r)
    const tree = new THREE.Group();
    const trunkH = o.h * 0.45;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.6, o.r * 0.8, trunkH, 12), mat);
    trunk.position.y = trunkH / 2;
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(o.h * 0.35, 16, 12), mat);
    canopy.position.y = trunkH + o.h * 0.25;
    tree.add(trunk, canopy);
    tree.position.set(o.x, 0, o.z);
    obj = tree;
  }

  obj.name = o.id;
  obj.traverse((m) => {
    m.castShadow = true;
    m.receiveShadow = true;
  });
  return obj;
}

/** 톡하기 쉽게 실제 모양보다 넓은 투명 판정 영역 (7세 손가락 기준) */
export function createHitArea(radius: number, height: number): THREE.Mesh {
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
  );
  hit.position.y = height / 2;
  hit.userData.isHitArea = true;
  return hit;
}

/** 임시 캐릭터(도형): 몸 + 얼굴 + 모양별 장식. 앞(+z)에 코를 달아 보는 방향이 보이게 함 */
export function createCharacterMesh(character: Character): THREE.Group {
  const bodyColor = new THREE.Color(character.color);
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 0.5, 6, 16),
    new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.6 }),
  );
  body.position.y = 0.6;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 20, 16),
    new THREE.MeshStandardMaterial({ color: COLORS.head, roughness: 0.6 }),
  );
  head.position.y = 1.3;
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 10, 8),
    new THREE.MeshStandardMaterial({ color: character.model === 'rabbit' ? 0xffa6c9 : bodyColor }),
  );
  nose.position.set(0, 1.3, 0.3);
  g.add(body, head, nose);

  if (character.model === 'princess') g.add(createCrown());
  if (character.model === 'bear') {
    const earMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.6 });
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), earMat);
      ear.position.set(side * 0.22, 1.55, 0);
      g.add(ear);
    }
  }
  if (character.model === 'hedgehog') {
    const spikeMat = new THREE.MeshStandardMaterial({ color: bodyColor.clone().multiplyScalar(0.7), roughness: 0.7 });
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * 0.45 + (i / 8) * Math.PI * 0.9;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 6), spikeMat);
      spike.position.set(Math.sin(a) * 0.26, 1.42 + Math.cos(a) * 0.08, -Math.cos(a) * 0.2);
      spike.rotation.set(-0.9, 0, -a * 0.8);
      g.add(spike);
    }
  }
  if (character.model === 'rabbit') {
    const earMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.6 });
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.38, 4, 8), earMat);
      ear.position.set(side * 0.13, 1.72, -0.02);
      ear.rotation.z = side * -0.18;
      g.add(ear);
    }
  }
  g.traverse((m) => (m.castShadow = true));
  return g;
}

function createCrown(): THREE.Mesh {
  const crown = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.2, 0.18, 5, 1, true),
    new THREE.MeshStandardMaterial({ color: COLORS.crown, roughness: 0.3, metalness: 0.2, side: THREE.DoubleSide }),
  );
  crown.position.y = 1.62;
  return crown;
}

/** 꽃: 줄기 + 꽃잎 5장 + 가운데. 꽃잎 색이 곧 정답 단서라 또렷하게 */
export function createFlowerMesh(color: string): THREE.Group {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6),
    new THREE.MeshStandardMaterial({ color: COLORS.stem }),
  );
  stem.position.y = 0.25;
  g.add(stem);

  const bloom = new THREE.Group();
  bloom.position.y = 0.55;
  bloom.rotation.x = -0.5;
  const petalMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.5 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), petalMat);
    petal.scale.set(1, 0.45, 1);
    petal.position.set(Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14);
    bloom.add(petal);
  }
  const center = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xfff3b0, emissive: 0x443300 }),
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
  const stemMat = new THREE.MeshStandardMaterial({ color: COLORS.stem });
  const stemGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.45, 5);
  const headGeo = new THREE.SphereGeometry(0.15, 10, 8);
  const mats = colors.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
  for (let i = 0; i < patch.n; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * patch.r;
    const x = patch.x + Math.cos(a) * r;
    const z = patch.z + Math.sin(a) * r;
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.set(x, 0.22, z);
    const head = new THREE.Mesh(headGeo, mats[Math.floor(rand() * mats.length)]);
    head.position.set(x, 0.48, z);
    head.scale.y = 0.6;
    g.add(stem, head);
  }
  return g;
}
