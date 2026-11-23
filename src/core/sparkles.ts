import * as THREE from 'three';

/**
 * 반짝반짝 (GDD 7: 다음에 할 일은 반짝이는 표시, GDD 8.1: 반짝이 파티클).
 * 작은 별 스프라이트 몇 개가 주위에서 깜빡이며 천천히 떠오른다. 깜빡임은 부드럽게(눈 보호, GDD 9).
 */
let starTexture: THREE.CanvasTexture | null = null;

function getStarTexture(): THREE.CanvasTexture {
  if (starTexture) return starTexture;
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const m = size / 2;
  const glow = ctx.createRadialGradient(m, m, 0, m, m, m);
  glow.addColorStop(0, 'rgba(255,255,255,0.9)');
  glow.addColorStop(0.25, 'rgba(255,240,250,0.5)');
  glow.addColorStop(1, 'rgba(255,240,250,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  // 네 갈래 별
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(m, 4);
  ctx.quadraticCurveTo(m + 4, m - 4, size - 4, m);
  ctx.quadraticCurveTo(m + 4, m + 4, m, size - 4);
  ctx.quadraticCurveTo(m - 4, m + 4, 4, m);
  ctx.quadraticCurveTo(m - 4, m - 4, m, 4);
  ctx.fill();
  starTexture = new THREE.CanvasTexture(c);
  starTexture.colorSpace = THREE.SRGBColorSpace;
  return starTexture;
}

export interface SparkleOptions {
  count?: number;
  /** 퍼지는 반지름 */
  radius?: number;
  /** 아래·위 높이 */
  height?: [number, number];
  size?: number;
  color?: THREE.ColorRepresentation;
}

export class Sparkles extends THREE.Group {
  private readonly stars: Array<{ sprite: THREE.Sprite; phase: number; speed: number; base: THREE.Vector3 }> = [];
  private t = Math.random() * 10;
  private readonly size: number;

  constructor(opts: SparkleOptions = {}) {
    super();
    const { count = 6, radius = 0.5, height = [0.2, 1.2], size = 0.28, color = 0xffd23f } = opts;
    this.size = size;
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: getStarTexture(),
        color,
        transparent: true,
        depthWrite: false,
        // 밝은 파스텔 배경에서도 보이게 (더하기 합성은 밝은 곳에서 사라짐)
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.setScalar(size);
      sprite.raycast = () => {}; // 톡 판정에서 제외
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const r = radius * (0.5 + Math.random() * 0.5);
      const base = new THREE.Vector3(Math.cos(a) * r, height[0] + Math.random() * (height[1] - height[0]), Math.sin(a) * r);
      sprite.position.copy(base);
      this.add(sprite);
      this.stars.push({ sprite, phase: Math.random() * Math.PI * 2, speed: 1.2 + Math.random() * 1.2, base });
    }
  }

  update(dt: number): void {
    this.t += dt;
    for (const s of this.stars) {
      const k = 0.5 + 0.5 * Math.sin(this.t * s.speed + s.phase); // 0~1 부드럽게
      (s.sprite.material as THREE.SpriteMaterial).opacity = 0.25 + 0.75 * k;
      s.sprite.scale.setScalar((0.6 + 0.5 * k) * this.size);
      s.sprite.position.y = s.base.y + Math.sin(this.t * 0.6 + s.phase) * 0.12; // 둥실둥실
    }
  }
}
