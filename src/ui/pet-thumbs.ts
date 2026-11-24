import * as THREE from 'three';
import { createPetModel } from '../scenes/castle/pet-glb';
import { createPrincessModel } from '../scenes/castle/princess-model';
import type { Outfit } from '../systems/wardrobe';

/**
 * 3D 모델을 찍어 화면용 그림(data URL)으로 만든다 — 펫 고르기·돌보기·잠자리 그림.
 * (그림을 따로 그리지 않아도 모델과 늘 같은 모습)
 */
const cache = new Map<string, string>();

interface ShotOptions {
  size?: number;
  /** 몸을 살짝 돌린 각도 */
  yaw?: number;
  /** 눈 감기 (잠자리) */
  sleeping?: boolean;
  /** 0~1: 모델 아래에서부터 이 높이 이상만 화면에 (0.55 = 머리·어깨) */
  cropFrom?: number;
}

function snapshot(renderer: THREE.WebGLRenderer, object: THREE.Object3D, o: ShotOptions = {}): string {
  const size = o.size ?? 320;
  const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xf0d8e8, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(2, 4, 5);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 20);

  object.rotation.y = o.yaw ?? 0.45;
  if (o.sleeping) for (const e of (object.userData.eyes as THREE.Object3D[] | undefined) ?? []) e.scale.y = 0.08;
  scene.add(object);
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (o.cropFrom) box.min.y = box.min.y + (box.max.y - box.min.y) * o.cropFrom;
  const center = box.getCenter(new THREE.Vector3());
  const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
  const dist = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 0.95;
  camera.position.copy(center).add(new THREE.Vector3(0, 0.25, 1).normalize().multiplyScalar(dist));
  camera.lookAt(center);

  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevShadow = renderer.shadowMap.enabled;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = false;
  renderer.setRenderTarget(rt);
  renderer.clear();
  renderer.render(scene, camera);
  const pixels = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, size, size, pixels);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.shadowMap.enabled = prevShadow;
  rt.dispose();

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  // WebGL은 아래에서 위로 읽히므로 뒤집기
  for (let y = 0; y < size; y++) image.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

/** 펫 그림 (sleeping = 눈 감은 잠자리 그림) */
export function petThumb(renderer: THREE.WebGLRenderer, kind: string, sleeping = false): string {
  const key = `pet:${kind}:${sleeping}`;
  let url = cache.get(key);
  if (!url) {
    url = snapshot(renderer, createPetModel(kind).group, { sleeping, yaw: sleeping ? 0.7 : 0.45 });
    cache.set(key, url);
  }
  return url;
}

/** 잠든 공주 얼굴 (지금 입은 옷 그대로, 머리·어깨만) — 옷이 바뀔 수 있어 저장해 두지 않음 */
export function sleepingPrincess(renderer: THREE.WebGLRenderer, outfit: Outfit): string {
  return snapshot(renderer, createPrincessModel(outfit).group, { sleeping: true, yaw: 0.25, cropFrom: 0.5 });
}
