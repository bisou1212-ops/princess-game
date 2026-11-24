import * as THREE from 'three';

/**
 * 펫 움직임 (M8-5). 펫 모델에는 동작 클립이 없고, 뼈를 코드로 직접 돌린다 — 가볍고 고치기 쉽다.
 * - 네 발 걷기: 대각선 다리끼리(앞왼·뒤오른) 함께 앞뒤로, 걸음마다 몸이 통통
 * - 숨쉬기·고개 갸웃·바라보기, 귀·꼬리 스프링 (걸으면 꼬리를 빨리 흔듦)
 * - 폴짝(기쁠 때), 눈 깜빡임
 * 뼈 이름: root·body·head·ear.L/R·tail·leg.FL/FR/BL/BR (scripts/blender/build_pets.py)
 */
export interface PetMotion {
  /** 지금 이동 속도 (m/s) */
  speed: number;
  /** 몸 방향 회전 속도 (rad/s) */
  turnRate: number;
  /** 바라볼 곳 (월드 좌표) */
  lookAt: THREE.Vector3 | null;
  /** 신남(0~1): 꼬리를 세게 흔듦 */
  excited?: number;
}

const UP = new THREE.Vector3(0, 1, 0);

class Spring {
  value = 0;
  private vel = 0;
  constructor(
    private readonly k: number,
    private readonly d: number,
  ) {}
  update(target: number, dt: number): number {
    this.vel += ((target - this.value) * this.k - this.vel * this.d) * dt;
    this.value += this.vel * dt;
    return this.value;
  }
}

export class PetAnimator {
  private readonly bones: Record<string, THREE.Bone | undefined> = {};
  private readonly rest = new Map<THREE.Bone, { q: THREE.Quaternion; p: THREE.Vector3 }>();
  private time = Math.random() * 10;
  private phase = 0;
  private walkW = 0;
  private lookYaw = 0;
  private hopT = -1;
  private readonly ears = new Spring(45, 5);
  private readonly earSide = new Spring(35, 4);
  private readonly tail = new Spring(60, 6);
  private blinkIn = 1.5 + Math.random() * 2;
  private blinkT = -1;
  private readonly tmpQ = new THREE.Quaternion();
  private readonly fwd = new THREE.Vector3();
  private readonly side = new THREE.Vector3();

  constructor(
    private readonly root: THREE.Object3D,
    private readonly eyes: THREE.Object3D[] = [],
  ) {
    root.traverse((o) => {
      const b = o as THREE.Bone;
      if (!b.isBone) return;
      this.bones[b.name] = b;
      this.rest.set(b, { q: b.quaternion.clone(), p: b.position.clone() });
    });
  }

  /** 기쁠 때 폴짝 */
  hop(): void {
    this.hopT = 0;
  }

  get hopping(): boolean {
    return this.hopT >= 0;
  }

  update(dt: number, m: PetMotion): void {
    this.time += dt;
    for (const [b, r] of this.rest) {
      b.quaternion.copy(r.q);
      b.position.copy(r.p);
    }
    this.root.updateWorldMatrix(true, true);
    const fwd = this.fwd.set(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(this.tmpQ)).setY(0).normalize();
    const side = this.side.crossVectors(UP, fwd).normalize();

    // ── 걷기 ──
    const target = THREE.MathUtils.smoothstep(m.speed, 0.05, 0.6);
    this.walkW += (target - this.walkW) * Math.min(1, dt * 10);
    this.phase += dt * (4 + m.speed * 4.5);
    const swing = Math.sin(this.phase) * 0.7 * this.walkW;
    this.rotateWorld(this.bones['leg.FL'], side, swing);
    this.rotateWorld(this.bones['leg.BR'], side, swing);
    this.rotateWorld(this.bones['leg.FR'], side, -swing);
    this.rotateWorld(this.bones['leg.BL'], side, -swing);
    const rootBone = this.bones.root;
    let lift = Math.abs(Math.sin(this.phase)) * 0.045 * this.walkW;

    // 숨쉬기·몸 흔들기
    this.rotateWorld(this.bones.body, fwd, Math.sin(this.phase) * 0.05 * this.walkW + Math.sin(this.time * 1.7) * 0.015);
    this.rotateWorld(this.bones.body, side, Math.sin(this.time * 2.2) * 0.02 * (1 - this.walkW));

    // ── 폴짝 ──
    if (this.hopT >= 0) {
      this.hopT += dt;
      const k = this.hopT / 0.55;
      if (k >= 1) this.hopT = -1;
      else {
        lift += Math.sin(k * Math.PI) * 0.4;
        const tuck = Math.sin(k * Math.PI) * 0.6;
        this.rotateWorld(this.bones['leg.FL'], side, -tuck);
        this.rotateWorld(this.bones['leg.FR'], side, -tuck);
        this.rotateWorld(this.bones['leg.BL'], side, tuck);
        this.rotateWorld(this.bones['leg.BR'], side, tuck);
      }
    }
    if (rootBone && rootBone.parent) {
      // root 뼈를 위로 (뼈대 물체 좌표 = Y 위)
      rootBone.position.y += lift / Math.max(1e-3, rootBone.parent.getWorldScale(new THREE.Vector3()).y);
    }

    // ── 바라보기 + 가끔 고개 갸웃 ──
    let yawTarget = 0;
    const head = this.bones.head;
    if (m.lookAt && head) {
      const from = head.getWorldPosition(new THREE.Vector3());
      const d = m.lookAt.clone().sub(from).setY(0);
      if (d.lengthSq() > 0.01) yawTarget = THREE.MathUtils.clamp(Math.atan2(d.dot(side), d.dot(fwd)), -1, 1);
    }
    this.lookYaw += (yawTarget - this.lookYaw) * Math.min(1, dt * 6);
    this.rotateWorld(head, UP, this.lookYaw * 0.8);
    this.rotateWorld(this.bones.body, UP, this.lookYaw * 0.2);
    const tilt = Math.max(0, Math.sin(this.time * 0.45)) ** 6 * 0.3 * (1 - this.walkW);
    this.rotateWorld(head, fwd, tilt);
    this.rotateWorld(head, side, Math.sin(this.phase * 2) * 0.04 * this.walkW);

    // ── 귀·꼬리 ──
    const ear = this.ears.update(m.speed * 0.15 + (this.hopT >= 0 ? 0.3 : 0), dt);
    const earSide = this.earSide.update(m.turnRate * 0.12, dt);
    for (const n of ['ear.L', 'ear.R'] as const) {
      this.rotateWorld(this.bones[n], side, -ear);
      this.rotateWorld(this.bones[n], fwd, -earSide);
    }
    const ex = Math.max(m.excited ?? 0, this.walkW * 0.6);
    const wag = this.tail.update(Math.sin(this.time * (4 + ex * 10)) * (0.25 + ex * 0.35) - m.turnRate * 0.1, dt);
    this.rotateWorld(this.bones.tail, UP, wag);

    // ── 눈 깜빡임 ──
    this.blinkIn -= dt;
    if (this.blinkIn <= 0 && this.blinkT < 0) {
      this.blinkT = 0;
      this.blinkIn = 2 + Math.random() * 3;
    }
    let open = 1;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const t = this.blinkT / 0.16;
      open = t < 1 ? Math.abs(1 - 2 * t) : 1;
      if (t >= 1) this.blinkT = -1;
    }
    for (const e of this.eyes) e.scale.y = Math.max(0.08, open);
  }

  private rotateWorld(bone: THREE.Bone | undefined, axisWorld: THREE.Vector3, angle: number): void {
    if (!bone || !bone.parent || Math.abs(angle) < 1e-5) return;
    const parentInv = bone.parent.getWorldQuaternion(this.tmpQ).invert();
    const axis = axisWorld.clone().applyQuaternion(parentInv).normalize();
    bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
    bone.updateMatrixWorld(true);
  }
}
