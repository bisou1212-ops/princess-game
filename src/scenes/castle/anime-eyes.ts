import * as THREE from 'three';

/**
 * 반짝이는 큰 눈 (부드러운 입체 화풍).
 * Blender 모델의 'eye' 조각(양쪽 눈이 한 덩어리) 앞에 그림 눈을 붙인다:
 * 색 있는 눈동자(위는 진하고 아래는 밝게) + 동공 + 큰 반짝임 + 작은 반짝임 + 별.
 * 원래 눈·반짝이 조각은 재질만 숨긴다(자식인 그림 눈은 보이게).
 */
const textureCache = new Map<string, THREE.CanvasTexture>();
const W = 256;
const H = 320;
const LINE = '#2a2238';

/** 눈 모양 (그래픽 2차 G2 표정): 뜬 눈 · 웃는 눈(^ ^) · 슬픈 눈(바깥쪽이 처진 눈꺼풀) */
export type EyeStyle = 'open' | 'joy' | 'sad';
/** 'R' = 캐릭터의 오른쪽 눈(화면 왼쪽) — 슬픈 눈은 바깥쪽이 처져서 양쪽 그림이 다르다 */
export type EyeSide = 'L' | 'R';

export function eyeTexture(iris: string, style: EyeStyle = 'open', side: EyeSide = 'L'): THREE.CanvasTexture {
  const key = `${iris}|${style}|${style === 'sad' ? side : ''}`;
  const cached = textureCache.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  if (style === 'joy') drawJoyEye(ctx);
  else {
    drawOpenEye(ctx, iris);
    if (style === 'sad') droopLid(ctx, side);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  textureCache.set(key, tex);
  return tex;
}

/** 웃는 눈: 위로 볼록한 굵은 곡선 + 바깥 속눈썹 */
function drawJoyEye(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = LINE;
  ctx.lineCap = 'round';
  ctx.lineWidth = W * 0.11;
  ctx.beginPath();
  ctx.arc(W / 2, H * 0.62, W * 0.32, Math.PI * 1.12, Math.PI * 1.88);
  ctx.stroke();
}

/** 슬픈 눈: 눈꺼풀이 바깥쪽으로 처지게 위를 지우고 선을 긋는다 */
function droopLid(ctx: CanvasRenderingContext2D, side: EyeSide): void {
  // 캐릭터 오른쪽 눈(R)은 화면 왼쪽이 바깥
  const outerLeft = side === 'R';
  // 안쪽은 거의 그대로, 바깥쪽만 많이 처지게 (팔자 눈썹처럼 보여 슬퍼 보임)
  const yIn = H * 0.08;
  const yOut = H * 0.42;
  const yL = outerLeft ? yOut : yIn;
  const yR = outerLeft ? yIn : yOut;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, yR);
  ctx.lineTo(0, yL);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(W / 2, H / 2, W * 0.47, H * 0.47, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = W * 0.08;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, yL);
  ctx.lineTo(W, yR);
  ctx.stroke();
  // 아래 눈가에 그렁그렁 물기
  ctx.strokeStyle = 'rgba(200, 235, 255, 0.9)';
  ctx.lineWidth = W * 0.05;
  ctx.beginPath();
  ctx.ellipse(W / 2, H * 0.62, W * 0.3, H * 0.2, 0, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
  ctx.restore();
}

function drawOpenEye(ctx: CanvasRenderingContext2D, iris: string): void {
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

/**
 * 이 메시(양쪽 눈)를 그림 눈으로 바꾼다. 앞 = +z.
 * attach(머리 뼈)를 주면 그림 판을 거기에 붙인다 — 뼈대 모델은 메시 자체가 움직이지 않기 때문.
 * 돌려주는 판은 눈 깜빡임(scale.y)에 쓴다.
 */
export function decorateEyes(eyeMesh: THREE.Mesh, iris: string, attach?: THREE.Object3D): THREE.Mesh[] {
  const planes: THREE.Mesh[] = [];
  const pos = eyeMesh.geometry.attributes.position as THREE.BufferAttribute;
  const sides = [new THREE.Box3(), new THREE.Box3()];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    sides[v.x < 0 ? 0 : 1].expandByPoint(v);
  }
  for (const box of sides) {
    if (box.isEmpty()) continue;
    // 눈마다 재질을 따로 둔다 (표정에 따라 그림을 바꿈)
    const side: EyeSide = box.max.x <= 0 ? 'R' : 'L';
    const mat = new THREE.MeshBasicMaterial({ map: eyeTexture(iris, 'open', side), transparent: true, depthWrite: false, toneMapped: false });
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 1.25, size.y * 1.2), mat);
    plane.position.set(center.x, center.y, box.max.z + 0.003);
    plane.renderOrder = 2;
    plane.userData.noOutline = true;
    plane.userData.eyeDecal = true; // 모델을 훑는 쪽이 이 판의 재질을 바꾸지 않게
    plane.userData.eyeSide = side;
    plane.userData.iris = iris;
    if (attach) {
      eyeMesh.updateWorldMatrix(true, false);
      attach.updateWorldMatrix(true, false);
      plane.applyMatrix4(new THREE.Matrix4().copy(attach.matrixWorld).invert().multiply(eyeMesh.matrixWorld));
      attach.add(plane);
    } else {
      eyeMesh.add(plane);
    }
    planes.push(plane);
  }
  (eyeMesh.material as THREE.Material).visible = false;
  return planes;
}
