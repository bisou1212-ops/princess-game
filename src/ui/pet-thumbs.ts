import * as THREE from 'three';
import { createPetModel } from '../scenes/castle/pet-glb';

/**
 * 펫 고르기·돌보기 화면의 펫 그림: 3D 펫 모델을 비스듬히 앞에서 찍는다.
 * (화면 그림을 따로 그리지 않아도 모델과 늘 같은 모습)
 */
const cache = new Map<string, string>();

export function petThumb(renderer: THREE.WebGLRenderer, kind: string, size = 320): string {
  const hit = cache.get(kind);
  if (hit) return hit;
  const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xf0d8e8, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(2, 4, 5);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 20);

  const { group } = createPetModel(kind);
  group.rotation.y = 0.45; // 살짝 옆으로 (몸과 꼬리도 보이게)
  scene.add(group);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
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
  const url = canvas.toDataURL('image/png');
  cache.set(kind, url);
  return url;
}
