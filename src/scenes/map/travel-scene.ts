import * as THREE from 'three';
import { addOutline, toonMaterial } from '../../core/toon';
import type { Outfit } from '../../systems/wardrobe';
import { createPrincessModel, type PrincessModel } from '../castle/princess-model';

/**
 * 왕국 사이를 날아가는 짧은 연출 (GDD 4.3: 탈것을 타고 날아간다).
 * 공주가 (지금 입은 옷 그대로) 분홍 열기구를 타고 구름 사이를 지나간다.
 * 그동안 다음 장소를 불러온다 — 오래 걸리면 아래에 별이 통통 튄다(로딩 화면).
 */
export interface TravelScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** 새로 출발 (공주 옷 맞추기, 구름 다시 놓기) */
  start(outfit: Outfit): void;
  update(dt: number): void;
}

export function createTravelScene(aspect: number): TravelScene {
  const scene = new THREE.Scene();
  scene.background = skyTexture();
  const camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 100);
  camera.position.set(0, 0.6, 11);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xffd6ea, 2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(-4, 6, 8);
  scene.add(sun);

  // 열기구 + 공주
  const balloon = new THREE.Group();
  balloon.add(createEnvelope());
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.6, 16), toonMaterial({ color: 0xc99a74, roughness: 0.9 }));
  basket.position.y = -2.95;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.06, 8, 24), toonMaterial({ color: 0xa87b55 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -2.65;
  balloon.add(basket, rim);
  const ropeMat = toonMaterial({ color: 0xffffff });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.2, 4), ropeMat);
    rope.position.set(Math.cos(a) * 0.5, -2.05, Math.sin(a) * 0.5);
    rope.rotation.z = Math.cos(a) * 0.25;
    rope.rotation.x = -Math.sin(a) * 0.25;
    balloon.add(rope);
  }
  addOutline(balloon, 0.02);
  scene.add(balloon);
  let princess: PrincessModel | null = null;

  // 구름
  const clouds: Array<{ obj: THREE.Group; speed: number }> = [];
  const cloudMat = toonMaterial({ color: 0xffffff, roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const obj = createCloud(cloudMat);
    scene.add(obj);
    clouds.push({ obj, speed: 0 });
  }
  const placeCloud = (c: (typeof clouds)[number], x: number) => {
    const z = -14 + Math.random() * 12;
    c.obj.position.set(x, -4 + Math.random() * 8, z);
    c.obj.scale.setScalar(0.7 + Math.random() * 0.9);
    c.speed = 3 + (z + 14) * 0.6; // 가까운 구름이 더 빨리 지나감
  };

  let t = 0;

  return {
    scene,
    camera,
    start(outfit) {
      if (princess) balloon.remove(princess.group);
      princess = createPrincessModel(outfit);
      princess.group.scale.setScalar(0.85);
      princess.group.position.y = -3.3; // 바구니 위로 얼굴·어깨가 보이게
      balloon.add(princess.group);
      clouds.forEach((c, i) => placeCloud(c, -16 + (i / clouds.length) * 32));
      t = 0;
    },
    update(dt) {
      t += dt;
      balloon.position.set(Math.sin(t * 0.7) * 0.4 - 0.3, 1.2 + Math.sin(t * 1.6) * 0.25, 0);
      balloon.rotation.z = Math.sin(t * 1.3) * 0.05;
      if (princess) princess.group.rotation.y = Math.sin(t * 0.9) * 0.6;
      for (const c of clouds) {
        c.obj.position.x -= c.speed * dt;
        if (c.obj.position.x < -18) placeCloud(c, 18);
      }
    },
  };
}

/** 줄무늬 풍선 (분홍·하양·라벤더) — 세로 줄무늬 그림을 구에 감싼다 */
function createEnvelope(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 4;
  const ctx = c.getContext('2d')!;
  const stripes = ['#ff9ccf', '#ffffff', '#c9b3ff'];
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = stripes[i % 3];
    ctx.fillRect(i * 32, 0, 32, 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.SphereGeometry(1.4, 36, 24), toonMaterial({ map: tex, roughness: 0.5 }));
  m.scale.set(1, 1.15, 1);
  return m;
}

function createCloud(mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const puffs = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < puffs; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.6 + Math.random() * 0.5, 12, 10), mat);
    p.position.set(i * 0.8 - puffs * 0.4, Math.random() * 0.4, Math.random() * 0.3);
    p.scale.y = 0.75;
    g.add(p);
  }
  return g;
}

function skyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#a9dcff');
  grad.addColorStop(0.6, '#e8f4ff');
  grad.addColorStop(1, '#ffe3f1');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
