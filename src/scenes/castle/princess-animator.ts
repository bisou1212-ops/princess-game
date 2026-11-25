import * as THREE from 'three';
import { POSTURE, type Face } from './face';

/**
 * 공주 움직임 (그래픽 고도화 시범).
 * Blender 클립(idle·walk·hop·wave) + 실시간으로 더하는 움직임:
 * - 가만히↔걷기: 속도에 따라 부드럽게 섞고, 걷기 재생 속도를 이동 속도에 맞춘다(발 박자)
 * - 폴짝·손 흔들기: 한 번 재생, 앞뒤로 부드럽게 섞임
 * - 고개 돌려 바라보기(Look-at), 방향을 틀 때 몸 기울기, 출발·멈춤 때 앞뒤로 기울기
 * - 뒷머리·치마: 스프링으로 늦게 따라오는 출렁임 (보조 움직임)
 * - 눈 깜빡임
 * - (G2) 표정(Face)에 따른 고개 자세 + 코드로 만드는 몸짓: 박수·끄덕·빙글
 */
export type OneShot = 'hop' | 'wave';
/** 클립 없이 뼈를 돌려 만드는 몸짓 (친구·공주 모두, 뼈 이름이 같음) */
export type Gesture = 'clap' | 'nod' | 'spin';
const GESTURE_TIME: Record<Gesture, number> = { clap: 1.3, nod: 0.8, spin: 0.9 };

export interface MotionInput {
  /** 지금 이동 속도 (m/s) */
  speed: number;
  /** 몸 방향 회전 속도 (rad/s, +면 왼쪽으로) */
  turnRate: number;
  /** 앞뒤 가속도 (m/s², +면 빨라짐) */
  accel: number;
  /** 바라볼 곳 (월드 좌표). 없으면 앞을 본다 */
  lookAt: THREE.Vector3 | null;
}

/** walk 클립(16프레임=두 걸음)이 자연스러운 이동 속도 */
const WALK_REF_SPEED = 2.6;
const UP = new THREE.Vector3(0, 1, 0);

class Spring {
  value = 0;
  private vel = 0;
  constructor(
    private readonly stiffness: number,
    private readonly damping: number,
  ) {}
  update(target: number, dt: number): number {
    const a = (target - this.value) * this.stiffness - this.vel * this.damping;
    this.vel += a * dt;
    this.value += this.vel * dt;
    return this.value;
  }
}

export class PrincessAnimator {
  readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction | null;
  private readonly walk: THREE.AnimationAction | null;
  private readonly shots = new Map<OneShot, THREE.AnimationAction>();
  private shot: { action: THREE.AnimationAction; t: number; duration: number } | null = null;
  private walkWeight = 0;
  private readonly bones: Record<string, THREE.Bone | undefined> = {};
  private lookYaw = 0;
  private lean = 0;
  private pitch = 0;
  private readonly hair = new Spring(55, 7);
  private readonly hairSide = new Spring(45, 6);
  private readonly skirt = new Spring(70, 9);
  /** 동물 친구의 귀·꼬리 (없으면 그냥 지나감) */
  private readonly ears = new Spring(40, 4.5);
  private readonly earSide = new Spring(35, 4);
  private readonly tail = new Spring(50, 5);
  private blinkIn = 2 + Math.random() * 2;
  private blinkT = -1;
  private readonly eyes: THREE.Object3D[];
  private gesture: { name: Gesture; t: number } | null = null;
  private readonly clipPose: Array<[THREE.Bone, THREE.Quaternion]> = [];
  private tilt = 0;
  private bow = 0;
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpV2 = new THREE.Vector3();

  constructor(
    private readonly root: THREE.Object3D,
    clips: THREE.AnimationClip[],
    eyes: THREE.Object3D[] = [],
    readonly face: Face | null = null,
  ) {
    this.mixer = new THREE.AnimationMixer(root);
    const make = (name: string) => {
      const clip = clips.find((c) => c.name === name);
      return clip ? this.mixer.clipAction(clip) : null;
    };
    this.idle = make('idle');
    this.walk = make('walk');
    for (const a of [this.idle, this.walk]) {
      if (!a) continue;
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.play();
    }
    this.walk?.setEffectiveWeight(0);
    for (const n of ['hop', 'wave'] as const) {
      const a = make(n);
      if (a) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = false;
        this.shots.set(n, a);
      }
    }
    root.traverse((o) => {
      if (!(o as THREE.Bone).isBone) return;
      this.bones[o.name] = o as THREE.Bone;
      // 불러오면 점이 빠진 이름(armL)이 된다 → Blender 이름(arm.L)으로도 찾게
      const m = /^(.+)([LR])$/.exec(o.name);
      if (m) this.bones[`${m[1]}.${m[2]}`] = o as THREE.Bone;
    });
    // 클립 자세 기억: 믹서는 값이 그대로면 뼈를 다시 쓰지 않아서, 더한 회전이 다음 프레임에 쌓인다.
    // 그래서 매 프레임 믹서 전에 지난 클립 자세로 되돌린다
    for (const b of new Set(Object.values(this.bones))) if (b) this.clipPose.push([b, b.quaternion.clone()]);
    this.eyes = eyes;
  }

  /** 한 번 하는 동작 (폴짝·손 흔들기). 걷는 중이면 위에 섞인다 */
  play(name: OneShot): void {
    const action = this.shots.get(name);
    if (!action) return;
    if (this.shot) this.shot.action.stop();
    action.reset();
    action.setEffectiveWeight(0);
    action.play();
    this.shot = { action, t: 0, duration: action.getClip().duration };
  }

  /** 박수·끄덕·빙글 (클립 위에 더함) */
  playGesture(name: Gesture): void {
    this.gesture = { name, t: 0 };
  }

  private time = Math.random() * 10;

  update(dt: number, m: MotionInput): void {
    this.time += dt;
    // ── 클립 섞기 ──
    const target = THREE.MathUtils.smoothstep(m.speed, 0.08, 0.9);
    this.walkWeight += (target - this.walkWeight) * Math.min(1, dt * 10);
    let shotW = 0;
    if (this.shot) {
      this.shot.t += dt;
      const { t, duration } = this.shot;
      shotW = Math.min(1, t / 0.12, Math.max(0, (duration - t) / 0.2));
      this.shot.action.setEffectiveWeight(shotW);
      if (t >= duration) {
        this.shot.action.stop();
        this.shot = null;
        shotW = 0;
      }
    }
    const loco = 1 - shotW;
    this.idle?.setEffectiveWeight((1 - this.walkWeight) * loco);
    this.walk?.setEffectiveWeight(this.walkWeight * loco);
    if (this.walk) this.walk.timeScale = THREE.MathUtils.clamp(m.speed / WALK_REF_SPEED, 0.6, 1.6);
    for (const [b, q] of this.clipPose) b.quaternion.copy(q);
    this.mixer.update(dt);
    for (const [b, q] of this.clipPose) q.copy(b.quaternion);

    // ── 실시간 움직임 (클립 위에 더하기) ──
    this.root.updateWorldMatrix(true, true);
    const fwd = this.tmpV.set(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(this.tmpQ)).setY(0).normalize();
    const right = this.tmpV2.crossVectors(UP, fwd).normalize(); // 캐릭터의 왼쪽(+X 쪽)

    // 바라보기: 몸 기준 좌우 각도, 너무 많이 돌지 않게
    let yawTarget = 0;
    if (m.lookAt) {
      const head = this.bones.head;
      const from = head ? head.getWorldPosition(new THREE.Vector3()) : this.root.getWorldPosition(new THREE.Vector3());
      const d = m.lookAt.clone().sub(from).setY(0);
      if (d.lengthSq() > 0.01) {
        yawTarget = Math.atan2(d.dot(right), d.dot(fwd));
        yawTarget = THREE.MathUtils.clamp(yawTarget, -0.9, 0.9);
      }
    }
    this.lookYaw += (yawTarget - this.lookYaw) * Math.min(1, dt * 6);
    // 방향을 틀면 안쪽으로 기울고, 빨라지면 앞으로·느려지면 뒤로
    const leanTarget = THREE.MathUtils.clamp(-m.turnRate * m.speed * 0.035, -0.16, 0.16);
    this.lean += (leanTarget - this.lean) * Math.min(1, dt * 8);
    const pitchTarget = THREE.MathUtils.clamp(m.accel * 0.025, -0.12, 0.12);
    this.pitch += (pitchTarget - this.pitch) * Math.min(1, dt * 8);

    // 표정에 따른 고개: 갸웃(궁금)·숙이기(슬픔·수줍음)
    const [tiltT, bowT] = this.face ? POSTURE[this.face.expression] : [0, 0];
    this.tilt += (tiltT - this.tilt) * Math.min(1, dt * 4);
    this.bow += (bowT - this.bow) * Math.min(1, dt * 4);
    this.rotateWorld(this.bones.head, fwd, this.tilt);
    this.rotateWorld(this.bones.head, right, this.bow);
    this.rotateWorld(this.bones.spine, right, this.bow * 0.3);
    this.applyGesture(dt, fwd, right);

    this.rotateWorld(this.bones.head, UP, this.lookYaw * 0.75);
    this.rotateWorld(this.bones.spine, UP, this.lookYaw * 0.25);
    this.rotateWorld(this.bones.spine, fwd, this.lean);
    this.rotateWorld(this.bones.spine, right, this.pitch); // +: 위쪽이 앞(+Z)으로

    // 뒷머리: 걸으면 뒤로 날리고, 출발·멈춤·회전 때 출렁
    const hairBack = this.hair.update(m.speed * 0.09 + m.accel * 0.05, dt);
    const hairSide = this.hairSide.update(m.turnRate * 0.12, dt);
    this.rotateWorld(this.bones.hair_back, right, hairBack); // +: 머리끝이 뒤로
    this.rotateWorld(this.bones.hair_back, fwd, -hairSide); // 도는 반대쪽으로 쏠림
    // 귀: 걸음마다 살짝 뒤로 젖혀지고 출렁 / 꼬리: 좌우로 살랑
    const ear = this.ears.update(m.speed * 0.12 + m.accel * 0.06, dt);
    const earSide = this.earSide.update(m.turnRate * 0.1, dt);
    for (const n of ['ear.L', 'ear.R'] as const) {
      // 귀는 위로 뻗은 뼈: 뒤로 젖히기 = right 축 음수
      this.rotateWorld(this.bones[n], right, -ear);
      this.rotateWorld(this.bones[n], fwd, -earSide);
    }
    const wag = this.tail.update(Math.sin(this.time * (m.speed > 0.2 ? 9 : 3)) * 0.35 - m.turnRate * 0.1, dt);
    this.rotateWorld(this.bones.tail, UP, wag);

    // 치마: 회전·가속에 늦게 따라오기
    const skirt = this.skirt.update(m.accel * 0.03, dt);
    this.rotateWorld(this.bones.skirt, right, skirt);
    this.rotateWorld(this.bones.skirt, fwd, this.lean * 0.6); // 기우는 반대쪽으로 치맛단이 쏠림

    // 눈 깜빡임 (가끔 두 번)
    this.blinkIn -= dt;
    if (this.blinkIn <= 0 && this.blinkT < 0) {
      this.blinkT = 0;
      this.blinkIn = 2.2 + Math.random() * 3 + (Math.random() < 0.2 ? -2 : 0);
    }
    let open = 1;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const t = this.blinkT / 0.16;
      open = t < 1 ? Math.abs(1 - 2 * t) : 1;
      if (t >= 1) this.blinkT = -1;
    }
    if (this.face && !this.face.canBlink) open = 1;
    for (const e of this.eyes) e.scale.y = Math.max(0.08, open);
    this.face?.update(dt);
  }

  private applyGesture(dt: number, fwd: THREE.Vector3, right: THREE.Vector3): void {
    const g = this.gesture;
    if (!g) return;
    g.t += dt;
    const dur = GESTURE_TIME[g.name];
    const k = g.t / dur;
    if (k >= 1) {
      this.gesture = null;
      return;
    }
    // 앞뒤로 부드럽게 들어가고 나오는 세기
    const env = Math.min(1, k / 0.15, (1 - k) / 0.2);
    if (g.name === 'clap') {
      // 두 팔을 앞으로 모아 짝짝짝 (4번)
      const clap = 0.5 - 0.5 * Math.cos(k * Math.PI * 8);
      for (const [n, s] of [['arm.L', -1], ['arm.R', 1]] as const) {
        this.rotateWorld(this.bones[n], right, -1.25 * env);
        this.rotateWorld(this.bones[n], UP, s * (0.3 + 0.65 * clap) * env);
      }
      this.rotateWorld(this.bones.spine, right, -0.05 * env);
    } else if (g.name === 'nod') {
      this.rotateWorld(this.bones.head, right, Math.sin(k * Math.PI * 4) * 0.22 * env);
    } else {
      // 제자리에서 한 바퀴 빙글 (팔은 살짝 벌림)
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.rotateWorld(this.bones.root, UP, e * Math.PI * 2);
      this.rotateWorld(this.bones['arm.L'], fwd, 0.7 * env);
      this.rotateWorld(this.bones['arm.R'], fwd, -0.7 * env);
    }
  }

  /** 뼈를 월드 축 기준으로 돌리기 (클립 자세 위에 더함) */
  private rotateWorld(bone: THREE.Bone | undefined, axisWorld: THREE.Vector3, angle: number): void {
    if (!bone || !bone.parent || Math.abs(angle) < 1e-5) return;
    const parentInv = bone.parent.getWorldQuaternion(this.tmpQ).invert();
    const axis = axisWorld.clone().applyQuaternion(parentInv).normalize();
    bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
    bone.updateMatrixWorld(true);
  }
}
