import * as THREE from 'three';
import type { Mood } from '../../systems/dialogue';
import { eyeTexture, type EyeSide, type EyeStyle } from './anime-eyes';

/**
 * 표정 (그래픽 2차 G2).
 * 그림 눈 + 그림 입(머리 뼈에 붙인 판)을 대사 기분(mood)에 맞춰 바꾼다.
 * - 말하는 동안 입이 뻐끔뻐끔 (닫힌 입 ↔ 벌린 입)
 * - 수줍음·신남·기쁨이면 볼이 조금 더 발그레
 * - 고개 자세(갸웃·숙이기)는 PrincessAnimator 가 posture 를 읽어 더한다
 * 그림은 캔버스로 그려 한 번만 만든다 (파일 0개).
 */
export type Expression = Mood;
type MouthStyle = 'smile' | 'grin' | 'open' | 'talk' | 'o' | 'frown' | 'small';

interface ExprDef {
  eyes: EyeStyle;
  mouth: MouthStyle;
  /** 말할 때 번갈아 보이는 입 */
  talk: MouthStyle;
  /** 볼 발그레 (0~1) */
  blush: number;
}

const EXPR: Record<Expression, ExprDef> = {
  normal: { eyes: 'open', mouth: 'smile', talk: 'talk', blush: 0 },
  happy: { eyes: 'open', mouth: 'grin', talk: 'talk', blush: 0.25 },
  excited: { eyes: 'joy', mouth: 'open', talk: 'grin', blush: 0.45 },
  curious: { eyes: 'open', mouth: 'o', talk: 'talk', blush: 0 },
  shy: { eyes: 'open', mouth: 'small', talk: 'talk', blush: 0.8 },
  sad: { eyes: 'sad', mouth: 'frown', talk: 'talk', blush: 0 },
};

/** 고개 자세: [갸웃(옆으로 기울기), 숙이기] 라디안 */
export const POSTURE: Record<Expression, [number, number]> = {
  normal: [0, 0],
  happy: [0.06, 0],
  excited: [0, -0.06],
  curious: [0.2, 0.04],
  shy: [-0.12, 0.14],
  sad: [0, 0.2],
};

const MW = 128;
const MH = 96;
const mouthCache = new Map<MouthStyle, THREE.CanvasTexture>();
const LIP = '#9a3a58';
const INSIDE = '#b8475f';
const TONGUE = '#ff9aae';

function mouthTexture(style: MouthStyle): THREE.CanvasTexture {
  const cached = mouthCache.get(style);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = MW;
  c.height = MH;
  const ctx = c.getContext('2d')!;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = LIP;
  ctx.lineWidth = 8;
  const filled = (path: () => void, tongue: [number, number, number, number] | null) => {
    ctx.beginPath();
    path();
    ctx.closePath();
    ctx.fillStyle = INSIDE;
    ctx.fill();
    if (tongue) {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = TONGUE;
      ctx.beginPath();
      ctx.ellipse(tongue[0], tongue[1], tongue[2], tongue[3], 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.lineWidth = 6;
    ctx.stroke();
  };
  switch (style) {
    case 'smile':
      ctx.beginPath();
      ctx.moveTo(30, 38);
      ctx.quadraticCurveTo(64, 72, 98, 38);
      ctx.stroke();
      break;
    case 'small':
      ctx.beginPath();
      ctx.moveTo(46, 44);
      ctx.quadraticCurveTo(64, 60, 82, 44);
      ctx.stroke();
      break;
    case 'grin':
      // 활짝 웃는 입 (D 모양)
      filled(() => {
        ctx.moveTo(28, 34);
        ctx.quadraticCurveTo(64, 40, 100, 34);
        ctx.quadraticCurveTo(96, 80, 64, 80);
        ctx.quadraticCurveTo(32, 80, 28, 34);
      }, [64, 80, 22, 14]);
      break;
    case 'open':
      // 신나서 크게 벌린 입
      filled(() => {
        ctx.moveTo(30, 28);
        ctx.quadraticCurveTo(64, 34, 98, 28);
        ctx.quadraticCurveTo(98, 88, 64, 88);
        ctx.quadraticCurveTo(30, 88, 30, 28);
      }, [64, 88, 26, 18]);
      break;
    case 'talk':
      filled(() => ctx.ellipse(64, 50, 18, 16, 0, 0, Math.PI * 2), [64, 64, 14, 9]);
      break;
    case 'o':
      filled(() => ctx.ellipse(64, 50, 13, 15, 0, 0, Math.PI * 2), null);
      break;
    case 'frown':
      ctx.beginPath();
      ctx.moveTo(38, 60);
      ctx.quadraticCurveTo(64, 34, 90, 60);
      ctx.stroke();
      break;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  mouthCache.set(style, tex);
  return tex;
}

export class Face {
  private expr: Expression = 'normal';
  private base: Expression = 'normal';
  private talking = false;
  private flapT = 0;
  private flapOpen = false;
  private blush = 0;
  private readonly cheekBase: THREE.Color[];

  constructor(
    private readonly eyes: THREE.Mesh[],
    private readonly mouth: THREE.Mesh | null,
    private readonly cheeks: THREE.MeshStandardMaterial[],
  ) {
    this.cheekBase = cheeks.map((m) => m.color.clone());
    this.apply();
  }

  get expression(): Expression {
    return this.expr;
  }

  /** 지금 표정 */
  set(expr: Expression): void {
    if (expr === this.expr) return;
    this.expr = expr;
    this.apply();
  }

  /** 대화가 없을 때 돌아갈 표정 (해결 전 우는 친구 = sad) */
  setBase(expr: Expression): void {
    const wasBase = this.expr === this.base;
    this.base = expr;
    if (wasBase) this.set(expr);
  }

  reset(): void {
    this.talking = false;
    this.set(this.base);
    this.apply();
  }

  setTalking(on: boolean): void {
    if (this.talking === on) return;
    this.talking = on;
    this.flapT = 0;
    this.flapOpen = on;
    this.applyMouth();
  }

  /** 눈을 깜빡여도 되는 표정인가 (웃는 눈은 이미 감은 모양) */
  get canBlink(): boolean {
    return EXPR[this.expr].eyes !== 'joy';
  }

  update(dt: number): void {
    if (this.talking) {
      this.flapT -= dt;
      if (this.flapT <= 0) {
        this.flapOpen = !this.flapOpen;
        // 열린 입은 조금 길게, 가끔 쉬는 박자
        this.flapT = this.flapOpen ? 0.11 + Math.random() * 0.08 : 0.07 + Math.random() * (Math.random() < 0.15 ? 0.25 : 0.06);
        this.applyMouth();
      }
    }
    const want = EXPR[this.expr].blush;
    if (Math.abs(want - this.blush) > 0.001) {
      this.blush += (want - this.blush) * Math.min(1, dt * 4);
      this.cheeks.forEach((m, i) => {
        m.color.copy(this.cheekBase[i]).lerp(BLUSH, this.blush * 0.5);
        m.emissive.copy(BLUSH).multiplyScalar(this.blush * 0.25);
      });
    }
  }

  private apply(): void {
    const def = EXPR[this.expr];
    for (const e of this.eyes) {
      const mat = e.material as THREE.MeshBasicMaterial;
      mat.map = eyeTexture(e.userData.iris as string, def.eyes, e.userData.eyeSide as EyeSide);
    }
    this.applyMouth();
  }

  private applyMouth(): void {
    if (!this.mouth) return;
    const def = EXPR[this.expr];
    (this.mouth.material as THREE.MeshBasicMaterial).map = mouthTexture(this.talking && this.flapOpen ? def.talk : def.mouth);
  }
}

const BLUSH = new THREE.Color(0xff6f9a);

export interface FaceParts {
  root: THREE.Object3D;
  head: THREE.Object3D | undefined;
  eyes: THREE.Mesh[];
  /** 원래 3D 입 (공주·플로라) — 있으면 그 자리에 그림 입을 붙이고 숨긴다 */
  mouthMesh?: THREE.Mesh;
  /** 입 자리를 정할 코 (동물 친구) — 코 바로 아래 */
  noseMesh?: THREE.Mesh;
  /** 없으면 그림 입을 붙이지 않는다 (부리가 있는 새) */
  withMouth: boolean;
  cheeks: THREE.MeshStandardMaterial[];
}

/** 눈·입·볼을 모아 표정 담당을 만든다. 모델은 쉬는 자세, 원점에 있어야 한다 */
export function createFace(p: FaceParts): Face {
  let mouth: THREE.Mesh | null = null;
  if (p.withMouth && p.head && p.eyes.length > 0) {
    p.root.updateWorldMatrix(true, true);
    let center: THREE.Vector3 | null = null;
    let width = 0.1;
    if (p.mouthMesh) {
      const box = worldBox(p.mouthMesh);
      center = box.getCenter(new THREE.Vector3());
      width = Math.max(0.13, box.getSize(new THREE.Vector3()).x * 1.75);
      (p.mouthMesh.material as THREE.Material).visible = false;
    } else if (p.noseMesh) {
      // 코 재질에 발바닥 등이 섞여 있을 수 있어 눈 근처 꼭짓점만 본다
      const eyeY = p.eyes.reduce((s, e) => s + e.getWorldPosition(new THREE.Vector3()).y, 0) / p.eyes.length;
      const box = worldBox(p.noseMesh, (v) => Math.abs(v.x) < 0.1 && v.y > eyeY - 0.3 && v.y < eyeY + 0.05);
      if (!box.isEmpty()) {
        center = new THREE.Vector3(0, box.min.y - 0.04, box.max.z);
        width = 0.12;
      }
    }
    if (center) {
      const skip = new Set<THREE.Object3D>([p.mouthMesh, p.noseMesh].filter(Boolean) as THREE.Object3D[]);
      const zAt = (y: number) => surfaceZ(p.root, skip, center!.x, y) ?? center!.z;
      const z = zAt(center.y);
      const tilt = Math.atan2(zAt(center.y + 0.03) - zAt(center.y - 0.03), 0.06);
      const mat = new THREE.MeshBasicMaterial({ map: mouthTexture('smile'), transparent: true, depthWrite: false, toneMapped: false });
      mouth = new THREE.Mesh(new THREE.PlaneGeometry(width, width * (MH / MW)), mat);
      mouth.position.set(center.x, center.y, z + 0.004);
      mouth.rotation.x = tilt;
      mouth.renderOrder = 2;
      mouth.userData.noOutline = true;
      mouth.userData.eyeDecal = true;
      mouth.updateMatrixWorld(true);
      p.head.updateWorldMatrix(true, false);
      mouth.applyMatrix4(new THREE.Matrix4().copy(p.head.matrixWorld).invert());
      p.head.add(mouth);
    }
  }
  return new Face(p.eyes, mouth, p.cheeks);
}

function worldBox(mesh: THREE.Mesh, keep?: (v: THREE.Vector3) => boolean): THREE.Box3 {
  const box = new THREE.Box3();
  const pos = mesh.geometry.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    if (!keep || keep(v)) box.expandByPoint(v);
  }
  return box;
}

/** (x, y) 근처에서 몸 표면이 가장 앞(+z)으로 나온 곳 */
function surfaceZ(root: THREE.Object3D, skip: Set<THREE.Object3D>, x: number, y: number): number | null {
  let best: number | null = null;
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || skip.has(m) || m.userData.eyeDecal) return;
    // 재질 이름은 불러올 때 userData.matName 에 적어 둔다 (게임 재질로 바꾸면 이름이 없어짐)
    if (/^(eye|shine|cheek|mouth|brow)/.test((m.userData.matName as string) ?? '')) return;
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      if (Math.abs(v.x - x) < 0.035 && Math.abs(v.y - y) < 0.03 && (best === null || v.z > best)) best = v.z;
    }
  });
  return best;
}
