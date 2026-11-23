import * as THREE from 'three';

/**
 * 임시 가구 모델 (도형). 크기는 차지하는 칸(가로 sx × 세로 sz, m)에 맞춘다. 앞 = +z.
 * 색을 바꿀 수 있는 부분은 userData.tint = true 인 재질 (나머지는 흰색·나무색 등 고정).
 * M7에서 .glb로 바꿀 때도 "tint 재질만 색 변경" 규칙을 유지한다.
 */
export function createFurnitureMesh(shape: string, colorHex: string, sx: number, sz: number): THREE.Group {
  const g = new THREE.Group();
  const main = tint(colorHex);
  const light = tint(colorHex, 0.5);
  const white = plain(0xfffaf3);
  const wood = plain(0xd9b38c);

  const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = h / 2, z = 0) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    g.add(b);
    return b;
  };
  const cyl = (rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = h / 2, z = 0, seg = 16) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
    c.position.set(x, y, z);
    g.add(c);
    return c;
  };
  const ball = (r: number, m: THREE.Material, x: number, y: number, z: number) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m);
    b.position.set(x, y, z);
    g.add(b);
    return b;
  };

  const W = sx * 0.94; // 칸 사이에 살짝 틈
  const D = sz * 0.94;

  switch (shape) {
    case 'bed': {
      box(W, 0.3, D, main);
      box(W * 0.94, 0.16, D * 0.86, white, 0, 0.38, D * 0.05);
      box(W, 0.9, 0.12, main, 0, 0.45, -D / 2 + 0.06); // 머리판
      box(W * 0.5, 0.12, 0.35, white, 0, 0.52, -D / 2 + 0.35); // 베개
      box(W * 0.96, 0.08, D * 0.5, light, 0, 0.48, D * 0.2); // 이불
      break;
    }
    case 'closet': {
      box(W, 1.9, D, main);
      box(0.02, 1.7, 0.02, white, 0, 1.0, D / 2 + 0.01);
      for (const s of [-1, 1]) ball(0.04, white, s * 0.12, 1.0, D / 2 + 0.03);
      box(W * 1.04, 0.08, D * 1.08, light, 0, 1.94);
      break;
    }
    case 'table': {
      cyl(Math.min(W, D) / 2, Math.min(W, D) / 2, 0.08, main, 0, 0.62, 0, 28);
      cyl(0.06, 0.1, 0.6, wood, 0, 0.3);
      cyl(0.3, 0.32, 0.04, wood, 0, 0.02);
      break;
    }
    case 'chair': {
      box(W * 0.8, 0.08, D * 0.8, main, 0, 0.4);
      box(W * 0.8, 0.5, 0.06, main, 0, 0.65, -D * 0.37);
      for (const sx2 of [-1, 1]) for (const sz2 of [-1, 1]) cyl(0.03, 0.03, 0.4, wood, sx2 * W * 0.33, 0.2, sz2 * D * 0.33, 8);
      break;
    }
    case 'lamp': {
      cyl(0.16, 0.18, 0.05, wood, 0, 0.025);
      cyl(0.025, 0.025, 1.1, wood, 0, 0.6, 0, 8);
      const shade = cyl(0.12, 0.22, 0.26, main, 0, 1.2);
      (shade.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x332200);
      break;
    }
    case 'plant': {
      cyl(0.16, 0.12, 0.28, main);
      ball(0.2, plain(0x86d98f), 0, 0.45, 0);
      ball(0.14, plain(0x9ee6a6), 0.1, 0.6, 0.05);
      ball(0.12, plain(0x7fcb88), -0.1, 0.58, -0.04);
      break;
    }
    case 'rug': {
      const rug = cyl(1, 1, 0.025, main, 0, 0.0125, 0, 40);
      rug.scale.set(W / 2, 1, D / 2);
      const inner = cyl(1, 1, 0.03, light, 0, 0.015, 0, 40);
      inner.scale.set(W / 2.6, 1, D / 2.6);
      break;
    }
    case 'toybox': {
      box(W, 0.45, D, main);
      box(W * 1.04, 0.07, D * 1.08, light, 0, 0.48);
      ball(0.1, plain(0xffd84d), -W * 0.25, 0.6, 0);
      box(0.16, 0.16, 0.16, plain(0x74c0ff), W * 0.2, 0.58, 0);
      break;
    }
    case 'bookshelf': {
      box(W, 1.5, D, main);
      for (let i = 0; i < 3; i++) {
        const y = 0.3 + i * 0.45;
        box(W * 0.88, 0.32, 0.05, plain(0xfffaf3), 0, y, D / 2 - 0.02);
        const colors = [0xff9ccf, 0x74c0ff, 0xffd84d, 0x86d98f];
        for (let k = 0; k < 4; k++) box(0.08, 0.26, 0.2, plain(colors[(k + i) % 4]), -W * 0.32 + k * 0.13, y, 0.02);
      }
      break;
    }
    case 'teddy': {
      ball(0.18, main, 0, 0.18, 0);
      ball(0.14, main, 0, 0.44, 0);
      for (const s of [-1, 1]) ball(0.05, main, s * 0.1, 0.56, 0);
      ball(0.06, light, 0, 0.42, 0.11);
      for (const s of [-1, 1]) ball(0.02, plain(0x3d3a4a), s * 0.05, 0.47, 0.12);
      break;
    }
    default:
      box(W, 0.5, D, main);
  }

  g.traverse((m) => {
    if ((m as THREE.Mesh).isMesh) {
      m.castShadow = shape !== 'rug';
      m.receiveShadow = true;
    }
  });
  return g;
}

/** 색을 바꿀 수 있는 재질 */
function tint(hex: string, lighten = 0): THREE.MeshStandardMaterial {
  const c = new THREE.Color(hex);
  if (lighten) c.lerp(new THREE.Color(0xffffff), lighten);
  const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
  m.userData.tint = lighten ? 'light' : 'main';
  return m;
}

function plain(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
}

/** 이미 만든 가구의 색만 바꾸기 */
export function recolorFurniture(obj: THREE.Object3D, hex: string): void {
  const main = new THREE.Color(hex);
  const light = main.clone().lerp(new THREE.Color(0xffffff), 0.5);
  obj.traverse((m) => {
    const mat = (m as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!mat || !mat.userData?.tint) return;
    mat.color.copy(mat.userData.tint === 'light' ? light : main);
  });
}

export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((x) => x.dispose());
  });
}
