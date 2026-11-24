import * as THREE from 'three';

/** 대상(캐릭터)을 일정한 거리에서 부드럽게 따라가는 카메라 */
export class FollowCamera {
  readonly offset: THREE.Vector3;
  /** 클수록 빨리 따라붙음 */
  stiffness: number;
  /** 거리 배율 (대화 때 가까이 = 1보다 작게). 부드럽게 따라감 */
  zoom = 1;
  private zoomNow = 1;
  private readonly focus = new THREE.Vector3();

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    offset = new THREE.Vector3(0, 9, 9),
    stiffness = 4,
  ) {
    this.offset = offset;
    this.stiffness = stiffness;
  }

  /** 순간이동 (처음 배치할 때) */
  snap(target: THREE.Vector3): void {
    this.focus.copy(target);
    this.apply();
  }

  update(target: THREE.Vector3, dt: number): void {
    const k = 1 - Math.exp(-this.stiffness * dt);
    this.focus.lerp(target, k);
    this.zoomNow += (this.zoom - this.zoomNow) * (1 - Math.exp(-3 * dt));
    this.apply();
  }

  private apply(): void {
    // 세로 화면(태블릿 세로)에서는 옆이 잘려 친구가 안 보이므로 조금 뒤로 물러난다
    const a = this.camera.aspect;
    const pull = (a < 1.4 ? Math.min(1.8, Math.sqrt(1.4 / a)) : 1) * this.zoomNow;
    this.camera.position.copy(this.focus).addScaledVector(this.offset, pull);
    this.camera.lookAt(this.focus.x, this.focus.y + 0.8, this.focus.z);
  }
}
