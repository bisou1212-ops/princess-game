import * as THREE from 'three';

/**
 * 반짝이는 큰 눈 (부드러운 입체 화풍).
 * Blender 모델의 'eye' 조각(양쪽 눈이 한 덩어리) 앞에 그림 눈을 붙인다:
 * 색 있는 눈동자(위는 진하고 아래는 밝게) + 동공 + 큰 반짝임 + 작은 반짝임 + 별.
 * 원래 눈·반짝이 조각은 재질만 숨긴다(자식인 그림 눈은 보이게).
 */
const textureCache = new Map<string, THREE.CanvasTexture>();

function eyeTexture(iris: string): THREE.CanvasTexture {
  const cached = textureCache.get(iris);
  if (cached) return cached;
  const W = 256;
  const H = 320;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const cx = W / 2;
  const cy = H / 2;
  const base = new THREE.Color(iris);
  const dark = base.clone().multiplyScalar(0.35).getStyle();
  const light = base.clone().lerp(new THREE.Color(0xffffff), 0.55).getStyle();
  const mid = base.getStyle();

  // 흰자 없이 큰 눈동자 (치비 화풍): 바깥 테두리
  ctx.fillStyle = '#2a2238';
  ctx.beginPath();
  ctx.ellipse(cx, cy, W * 0.46, H * 0.46, 0, 0, Math.PI * 2);
  ctx.fill();
  // 눈동자: 위는 진하게, 아래로 밝게
  const g = ctx.createLinearGradient(0, cy - H * 0.4, 0, cy + H * 0.42);
  g.addColorStop(0, dark);
  g.addColorStop(0.45, mid);
  g.addColorStop(1, light);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 6, W * 0.4, H * 0.41, 0, 0, Math.PI * 2);
  ctx.fill();
  // 아래쪽 빛 반사 (초승달)
  ctx.fillStyle = 'rgba(255, 235, 250, 0.55)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + H * 0.25, W * 0.26, H * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  // 동공
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(cx, cy - 4, W * 0.17, H * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // 큰 반짝임 (왼쪽 위)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(cx - W * 0.15, cy - H * 0.17, W * 0.13, H * 0.12, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // 작은 반짝임 (오른쪽 아래)
  ctx.beginPath();
  ctx.arc(cx + W * 0.17, cy + H * 0.13, W * 0.055, 0, Math.PI * 2);
  ctx.fill();
  // 별 반짝임 (오른쪽 위)
  star(ctx, cx + W * 0.16, cy - H * 0.2, W * 0.07);
  // 위 속눈썹 라인
  ctx.strokeStyle = '#2a2238';
  ctx.lineWidth = W * 0.07;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, W * 0.46, H * 0.46, 0, Math.PI * 1.08, Math.PI * 1.92);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  textureCache.set(iris, tex);
  return tex;
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.35;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** 이 메시(양쪽 눈)를 그림 눈으로 바꾼다. 앞 = +z */
export function decorateEyes(eyeMesh: THREE.Mesh, iris: string): void {
  const pos = eyeMesh.geometry.attributes.position as THREE.BufferAttribute;
  const sides = [new THREE.Box3(), new THREE.Box3()];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    sides[v.x < 0 ? 0 : 1].expandByPoint(v);
  }
  const mat = new THREE.MeshBasicMaterial({ map: eyeTexture(iris), transparent: true, depthWrite: false, toneMapped: false });
  for (const box of sides) {
    if (box.isEmpty()) continue;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 1.25, size.y * 1.2), mat);
    plane.position.set(center.x, center.y, box.max.z + 0.003);
    plane.renderOrder = 2;
    plane.userData.noOutline = true;
    plane.userData.eyeDecal = true; // 모델을 훑는 쪽이 이 판의 재질을 바꾸지 않게
    eyeMesh.add(plane);
  }
  (eyeMesh.material as THREE.Material).visible = false;
}
