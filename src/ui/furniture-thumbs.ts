import * as THREE from 'three';
import { getFurniture } from '../systems/decor';
import { getColor } from '../systems/wardrobe';
import { createFurnitureMesh, disposeObject } from '../scenes/castle/furniture-meshes';

/**
 * 서랍 카드용 가구 그림을 3D 모델에서 직접 찍어 만든다.
 * (가구가 30개 넘게 늘어나도 그림을 따로 그릴 필요 없음, M7 아트 교체 때도 자동 반영)
 */
export function renderFurnitureThumbs(renderer: THREE.WebGLRenderer, itemIds: string[], size = 160): Map<string, string> {
  const out = new Map<string, string>();
  const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe8d8f0, 2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const pixels = new Uint8Array(size * size * 4);
  const image = ctx.createImageData(size, size);

  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevShadow = renderer.shadowMap.enabled;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = false;

  for (const id of itemIds) {
    const it = getFurniture(id);
    if (!it) continue;
    const obj = createFurnitureMesh(it.shape, getColor(it.defaultColor ?? 'pink').hex, it.w * 0.5, it.d * 0.5);
    scene.add(obj);

    // 모델 크기에 맞춰 비스듬히 위에서 보기
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05;
    camera.position.copy(center).add(new THREE.Vector3(0.75, 0.6, 1).normalize().multiplyScalar(dist));
    camera.lookAt(center);

    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, pixels);
    // WebGL은 아래에서 위로 읽히므로 뒤집기
    for (let y = 0; y < size; y++) {
      image.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    }
    ctx.putImageData(image, 0, 0);
    out.set(id, canvas.toDataURL('image/png'));

    scene.remove(obj);
    disposeObject(obj);
  }

  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.shadowMap.enabled = prevShadow;
  rt.dispose();
  return out;
}
