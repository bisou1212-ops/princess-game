import * as THREE from 'three';

/**
 * 대상(캐릭터)을 일정한 거리에서 부드럽게 따라가는 카메라.
 * 아이가 직접 바꿀 수 있는 것: 가까이·멀리(userZoom), 빙 둘러보기(yaw), 위에서·옆에서(pitch).
 */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 1.5;
const PITCH_MIN = THREE.MathUtils.degToRad(18);
const PITCH_MAX = THREE.MathUtils.degToRad(70);

export class FollowCamera {
  /** 클수록 빨리 따라붙음 */
  stiffness: number;
  /** 거리 배율 (대화 때 가까이 = 1보다 작게). 부드럽게 따라감 */
  zoom = 1;
  private zoomNow = 1;
  /** 아이가 정한 거리 배율 (+·− 버튼, 두 손가락 벌리기, 마우스 휠) */
  private userZoom = 1;
  private userZoomNow = 1;
  /** 둘러보는 각도 (0 = 남쪽에서 봄, 라디안) */
  private yaw = 0;
  private yawNow = 0;
  /** 내려다보는 각도 */
  private pitch: number;
  private pitchNow: number;
  private readonly distance: number;
  private readonly focus = new THREE.Vector3();

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    offset = new THREE.Vector3(0, 9, 9),
    stiffness = 4,
  ) {
    this.stiffness = stiffness;
    this.distance = offset.length();
    this.pitch = this.pitchNow = Math.asin(offset.y / this.distance);
    this.yaw = this.yawNow = Math.atan2(offset.x, offset.z);
  }

  /** 순간이동 (처음 배치할 때) */
  snap(target: THREE.Vector3): void {
    this.focus.copy(target);
    this.apply();
  }

  /** 가까이(< 1)·멀리(> 1) 곱하기 */
  zoomBy(factor: number): void {
    this.userZoom = THREE.MathUtils.clamp(this.userZoom * factor, ZOOM_MIN, ZOOM_MAX);
  }

  /** 끌어서 둘러보기: dYaw 가로, dPitch 세로 (라디안) */
  orbit(dYaw: number, dPitch: number): void {
    this.yaw += dYaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, PITCH_MIN, PITCH_MAX);
  }

  /** 처음 보던 각도·거리로 */
  reset(): void {
    this.userZoom = 1;
    this.yaw = Math.round(this.yaw / (Math.PI * 2)) * Math.PI * 2;
    this.pitch = Math.PI / 4;
  }

  /** 카메라가 있는 쪽 (바닥 방향, 길이 1) — 대화 카메라가 이쪽에서 보게 */
  sideDir(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.sin(this.yawNow), 0, Math.cos(this.yawNow));
  }

  update(target: THREE.Vector3, dt: number): void {
    const k = 1 - Math.exp(-this.stiffness * dt);
    this.focus.lerp(target, k);
    this.zoomNow += (this.zoom - this.zoomNow) * (1 - Math.exp(-3 * dt));
    const u = 1 - Math.exp(-8 * dt);
    this.userZoomNow += (this.userZoom - this.userZoomNow) * u;
    this.yawNow += (this.yaw - this.yawNow) * u;
    this.pitchNow += (this.pitch - this.pitchNow) * u;
    this.apply();
  }

  private apply(): void {
    // 세로 화면(태블릿 세로)에서는 옆이 잘려 친구가 안 보이므로 조금 뒤로 물러난다
    const a = this.camera.aspect;
    const pull = (a < 1.4 ? Math.min(1.8, Math.sqrt(1.4 / a)) : 1) * this.zoomNow * this.userZoomNow;
    const d = this.distance * pull;
    const c = Math.cos(this.pitchNow);
    this.camera.position.set(
      this.focus.x + Math.sin(this.yawNow) * c * d,
      this.focus.y + Math.sin(this.pitchNow) * d,
      this.focus.z + Math.cos(this.yawNow) * c * d,
    );
    this.camera.lookAt(this.focus.x, this.focus.y + 0.8, this.focus.z);
  }
}
