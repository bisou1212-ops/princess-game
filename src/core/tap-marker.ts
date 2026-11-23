import * as THREE from 'three';

/** 톡한 바닥에 잠깐 퍼졌다 사라지는 동그라미 (긍정 피드백) */
export class TapMarker {
  readonly object: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private age = Infinity;
  private readonly life = 0.6;

  constructor(color = 0xffffff) {
    this.object = new THREE.Mesh(
      new THREE.RingGeometry(0.25, 0.4, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.object.rotation.x = -Math.PI / 2;
    this.object.visible = false;
  }

  show(x: number, z: number): void {
    this.object.position.set(x, 0.02, z);
    this.age = 0;
    this.object.visible = true;
  }

  update(dt: number): void {
    if (this.age >= this.life) {
      this.object.visible = false;
      return;
    }
    this.age += dt;
    const t = Math.min(this.age / this.life, 1);
    this.object.scale.setScalar(1 + t * 1.2);
    this.object.material.opacity = 0.9 * (1 - t);
  }
}
