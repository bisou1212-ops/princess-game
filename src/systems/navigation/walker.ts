import type { Point } from './nav-grid';

/**
 * 경유점을 따라 걷고, 가는 방향으로 부드럽게 몸을 돌린다.
 * accel을 주면 천천히 출발해 속도를 올리고, 도착 전에 부드럽게 멈춘다.
 * 먼 곳(farDistance 넘게)은 조금 빠른 걸음(farBoost 배)으로 간다.
 */
export class Walker {
  x: number;
  z: number;
  /** Y축 회전(라디안). 0이면 +z(카메라 쪽)를 바라봄 — three.js rotation.y와 같다 */
  heading = 0;
  speed: number;
  turnSpeed: number;
  /** 지금 실제 속도 (m/s) */
  currentSpeed = 0;
  private path: Point[] = [];
  private targetHeading = 0;
  private maxSpeed: number;

  constructor(
    start: Point,
    speed = 3,
    turnSpeed = 10,
    /** 가속도 (m/s²). Infinity면 바로 출발·바로 정지 */
    readonly accel = Infinity,
    readonly farDistance = 7,
    readonly farBoost = 1,
  ) {
    this.x = start.x;
    this.z = start.z;
    this.speed = speed;
    this.turnSpeed = turnSpeed;
    this.maxSpeed = speed;
  }

  private remaining(): number {
    let d = 0;
    let px = this.x;
    let pz = this.z;
    for (const p of this.path) {
      d += Math.hypot(p.x - px, p.z - pz);
      px = p.x;
      pz = p.z;
    }
    return d;
  }

  get moving(): boolean {
    return this.path.length > 0;
  }

  setPath(path: Point[]): void {
    this.path = path.slice();
    this.maxSpeed = this.remaining() > this.farDistance ? this.speed * this.farBoost : this.speed;
  }

  stop(): void {
    this.path = [];
    this.currentSpeed = 0;
  }

  /** 제자리에서 (x, z) 쪽으로 몸을 돌린다 */
  faceTowards(x: number, z: number): void {
    const dx = x - this.x;
    const dz = z - this.z;
    if (Math.hypot(dx, dz) > 1e-4) this.targetHeading = Math.atan2(dx, dz);
  }

  update(dt: number): void {
    if (!Number.isFinite(this.accel)) {
      this.currentSpeed = this.path.length > 0 ? this.speed : 0;
    } else if (this.path.length > 0) {
      // 남은 거리 안에 멈출 수 있는 속도까지만 (부드러운 도착), 그 안에서 가속
      const stopSpeed = Math.sqrt(2 * this.accel * this.remaining()) + 0.4;
      const target = Math.min(this.maxSpeed, stopSpeed);
      const step = this.accel * dt;
      this.currentSpeed += clamp(target - this.currentSpeed, -step * 1.5, step);
    } else {
      this.currentSpeed = 0;
    }
    let budget = this.currentSpeed * dt;
    while (budget > 0 && this.path.length > 0) {
      const t = this.path[0];
      const dx = t.x - this.x;
      const dz = t.z - this.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-4) this.targetHeading = Math.atan2(dx, dz);
      if (dist <= budget) {
        this.x = t.x;
        this.z = t.z;
        budget -= dist;
        this.path.shift();
      } else {
        this.x += (dx / dist) * budget;
        this.z += (dz / dist) * budget;
        budget = 0;
      }
    }
    // 가장 짧은 방향으로 회전
    let diff = this.targetHeading - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const maxTurn = this.turnSpeed * dt;
    this.heading += Math.abs(diff) <= maxTurn ? diff : Math.sign(diff) * maxTurn;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
