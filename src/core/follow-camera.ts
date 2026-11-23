import * as THREE from 'three';

/** 대상(캐릭터)을 일정한 거리에서 부드럽게 따라가는 카메라 */
export class FollowCamera {
  readonly offset: THREE.Vector3;
  /** 클수록 빨리 따라붙음 */
  stiffness: number;
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
    this.apply();
  }

  private apply(): void {
    this.camera.position.copy(this.focus).add(this.offset);
    this.camera.lookAt(this.focus.x, this.focus.y + 0.8, this.focus.z);
  }
}
