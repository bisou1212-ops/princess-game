import type { Point } from './nav-grid';

/** 경유점을 따라 일정한 속도로 걷고, 가는 방향으로 부드럽게 몸을 돌린다. */
export class Walker {
  x: number;
  z: number;
  /** Y축 회전(라디안). 0이면 +z(카메라 쪽)를 바라봄 — three.js rotation.y와 같다 */
  heading = 0;
  speed: number;
  turnSpeed: number;
  private path: Point[] = [];
  private targetHeading = 0;

  constructor(start: Point, speed = 3, turnSpeed = 10) {
    this.x = start.x;
    this.z = start.z;
    this.speed = speed;
    this.turnSpeed = turnSpeed;
  }

  get moving(): boolean {
    return this.path.length > 0;
  }

  setPath(path: Point[]): void {
    this.path = path.slice();
  }

  stop(): void {
    this.path = [];
  }

  /** 제자리에서 (x, z) 쪽으로 몸을 돌린다 */
  faceTowards(x: number, z: number): void {
    const dx = x - this.x;
    const dz = z - this.z;
    if (Math.hypot(dx, dz) > 1e-4) this.targetHeading = Math.atan2(dx, dz);
  }

  update(dt: number): void {
    let budget = this.speed * dt;
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
