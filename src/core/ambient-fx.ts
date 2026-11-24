import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { QUALITY_SETTINGS } from './quality';

/**
 * 장면을 살아 있게 하는 작은 효과들 (그래픽 고도화). 화면이 지저분해지지 않게 은은하게.
 * - 먼지 퐁: 발걸음·착지 때 바닥에 동그란 먼지가 퍼지며 사라짐
 * - 꽃잎: 카메라 주변에 꽃잎 몇 장이 팔랑팔랑 떨어짐 (품질에 따라 개수)
 * - 구름: 하늘 높이 몽실한 구름이 천천히 흘러감
 */
let puffTexture: THREE.CanvasTexture | null = null;
function getPuffTexture(): THREE.CanvasTexture {
  if (puffTexture) return puffTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,250,244,0.9)');
  g.addColorStop(0.5, 'rgba(255,246,236,0.5)');
  g.addColorStop(1, 'rgba(255,246,236,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  puffTexture = new THREE.CanvasTexture(c);
  puffTexture.colorSpace = THREE.SRGBColorSpace;
  return puffTexture;
}

interface Puff {
  sprite: THREE.Sprite;
  t: number;
  life: number;
  size: number;
  vx: number;
  vz: number;
}

export class AmbientFx {
  readonly group = new THREE.Group();
  private readonly puffs: Puff[] = [];
  private nextPuff = 0;
  private readonly petals: THREE.InstancedMesh | null;
  private readonly petalState: Array<{ p: THREE.Vector3; spin: THREE.Vector3; rot: THREE.Euler; phase: number; speed: number }> = [];
  private readonly clouds: THREE.Group[] = [];
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private time = 0;

  constructor(opts: { petalColors?: number[]; area?: number } = {}) {
    // 먼지 퐁 (미리 만들어 두고 돌려 씀)
    const mat = new THREE.SpriteMaterial({ map: getPuffTexture(), transparent: true, depthWrite: false });
    for (let i = 0; i < 24; i++) {
      const sprite = new THREE.Sprite(mat.clone());
      sprite.visible = false;
      this.group.add(sprite);
      this.puffs.push({ sprite, t: 1, life: 0.6, size: 0.4, vx: 0, vz: 0 });
    }

    // 꽃잎: 작은 판 하나를 여러 번 (InstancedMesh = 그리기 한 번)
    const n = QUALITY_SETTINGS.petals;
    const colors = opts.petalColors ?? [0xffb3d6, 0xffffff, 0xffd6ea, 0xffe9a8];
    if (n > 0) {
      const geo = new THREE.PlaneGeometry(0.12, 0.08);
      const pm = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
      this.petals = new THREE.InstancedMesh(geo, pm, n);
      this.petals.frustumCulled = false;
      const col = new THREE.Color();
      const area = opts.area ?? 12;
      for (let i = 0; i < n; i++) {
        this.petalState.push({
          p: new THREE.Vector3((Math.random() - 0.5) * area * 2, Math.random() * 7, (Math.random() - 0.5) * area * 2),
          spin: new THREE.Vector3(Math.random() * 2, Math.random() * 3, Math.random() * 2),
          rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
          phase: Math.random() * 10,
          speed: 0.35 + Math.random() * 0.3,
        });
        this.petals.setColorAt(i, col.set(colors[i % colors.length]));
      }
      this.group.add(this.petals);
    } else {
      this.petals = null;
    }

    // 구름: 동글동글 덩어리 몇 개 (안개 영향 없이 하얗게)
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: false });
    for (let i = 0; i < QUALITY_SETTINGS.clouds; i++) {
      // 구름 하나 = 덩어리 여러 개를 합친 메시 하나 (그리기 한 번)
      const parts = 4 + (i % 3);
      const geos: THREE.BufferGeometry[] = [];
      for (let k = 0; k < parts; k++) {
        const s = 2.2 + Math.random() * 1.8;
        const g = new THREE.SphereGeometry(1, 10, 7);
        g.scale(s * 1.3, s * 0.8, s);
        g.translate((k - parts / 2) * 2.4 + Math.random(), Math.random() * 1.2, Math.random() * 1.5);
        geos.push(g);
      }
      const c = new THREE.Group();
      c.add(new THREE.Mesh(mergeGeometries(geos)!, cloudMat));
      geos.forEach((g) => g.dispose());
      c.position.set(-60 + i * (120 / QUALITY_SETTINGS.clouds) + Math.random() * 8, 22 + Math.random() * 8, -45 - Math.random() * 20);
      c.userData.speed = 0.6 + Math.random() * 0.6;
      this.clouds.push(c);
      this.group.add(c);
    }
  }

  /** 바닥에 먼지 퐁 (size m) */
  puff(x: number, z: number, size = 0.35, spread = 0): void {
    const p = this.puffs[this.nextPuff];
    this.nextPuff = (this.nextPuff + 1) % this.puffs.length;
    p.t = 0;
    p.life = 0.55 + Math.random() * 0.2;
    p.size = size;
    const a = Math.random() * Math.PI * 2;
    p.vx = Math.cos(a) * spread;
    p.vz = Math.sin(a) * spread;
    p.sprite.position.set(x, 0.12, z);
    p.sprite.visible = true;
  }

  /** 착지: 둥글게 먼지 여러 개 */
  landing(x: number, z: number): void {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.puff(x + Math.cos(a) * 0.25, z + Math.sin(a) * 0.25, 0.4, 0.9);
    }
  }

  /** focus: 꽃잎이 날릴 중심 (공주 근처) */
  update(dt: number, focus: THREE.Vector3): void {
    this.time += dt;
    for (const p of this.puffs) {
      if (!p.sprite.visible) continue;
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) {
        p.sprite.visible = false;
        continue;
      }
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.z += p.vz * dt;
      p.sprite.position.y = 0.12 + k * 0.25;
      p.sprite.scale.setScalar(p.size * (0.6 + k * 1.2));
      (p.sprite.material as THREE.SpriteMaterial).opacity = 0.7 * (1 - k);
    }

    if (this.petals) {
      const area = 12;
      this.petalState.forEach((s, i) => {
        s.p.y -= s.speed * dt;
        s.p.x += (Math.sin(this.time * 0.8 + s.phase) * 0.35 + 0.25) * dt; // 살랑 + 바람
        s.p.z += Math.cos(this.time * 0.6 + s.phase) * 0.2 * dt;
        s.rot.x += s.spin.x * dt;
        s.rot.y += s.spin.y * dt;
        s.rot.z += s.spin.z * dt;
        // 카메라 주변 상자 밖으로 나가면 위로 다시
        const dx = s.p.x - focus.x;
        const dz = s.p.z - focus.z;
        if (s.p.y < 0.05 || Math.abs(dx) > area || Math.abs(dz) > area) {
          s.p.set(focus.x + (Math.random() - 0.5) * area * 2, 5 + Math.random() * 3, focus.z + (Math.random() - 0.5) * area * 2);
        }
        this.tmpQ.setFromEuler(s.rot);
        this.tmpM.compose(s.p, this.tmpQ, this.one);
        this.petals!.setMatrixAt(i, this.tmpM);
      });
      this.petals.instanceMatrix.needsUpdate = true;
    }

    for (const c of this.clouds) {
      c.position.x += (c.userData.speed as number) * dt;
      if (c.position.x > 70) c.position.x = -70;
    }
  }
}
