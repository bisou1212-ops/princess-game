/**
 * 단순 격자 길찾기 (CLAUDE.md: "길찾기는 navmesh 또는 단순 그리드").
 * 바닥(XZ 평면)을 정사각형 칸으로 나누고, 장애물 칸을 막은 뒤 A*로 길을 찾는다.
 * three.js에 의존하지 않아 Vitest로 바로 테스트할 수 있다.
 */

export interface Point {
  x: number;
  z: number;
}

export interface NavGridOptions {
  width: number;
  depth: number;
  cellSize: number;
  centerX?: number;
  centerZ?: number;
}

const SQRT2 = Math.SQRT2;
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  readonly originX: number;
  readonly originZ: number;
  private readonly blocked: Uint8Array;

  constructor(opts: NavGridOptions) {
    this.cellSize = opts.cellSize;
    this.cols = Math.round(opts.width / opts.cellSize);
    this.rows = Math.round(opts.depth / opts.cellSize);
    this.originX = (opts.centerX ?? 0) - opts.width / 2;
    this.originZ = (opts.centerZ ?? 0) - opts.depth / 2;
    this.blocked = new Uint8Array(this.cols * this.rows);
  }

  inBounds(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows;
  }

  isWalkable(c: number, r: number): boolean {
    return this.inBounds(c, r) && this.blocked[r * this.cols + c] === 0;
  }

  setBlocked(c: number, r: number, value = true): void {
    if (this.inBounds(c, r)) this.blocked[r * this.cols + c] = value ? 1 : 0;
  }

  worldToCell(x: number, z: number): [number, number] {
    return [Math.floor((x - this.originX) / this.cellSize), Math.floor((z - this.originZ) / this.cellSize)];
  }

  cellCenter(c: number, r: number): Point {
    return { x: this.originX + (c + 0.5) * this.cellSize, z: this.originZ + (r + 0.5) * this.cellSize };
  }

  isWalkableAt(x: number, z: number): boolean {
    const [c, r] = this.worldToCell(x, z);
    return this.isWalkable(c, r);
  }

  /** 축 정렬 사각형을 막는다. pad = 캐릭터 반지름만큼 넓혀서 벽에 몸이 파묻히지 않게 함 */
  blockRect(cx: number, cz: number, w: number, d: number, pad = 0): void {
    const hw = w / 2 + pad;
    const hd = d / 2 + pad;
    this.forEachCell((c, r, p) => {
      if (Math.abs(p.x - cx) <= hw && Math.abs(p.z - cz) <= hd) this.setBlocked(c, r);
    });
  }

  blockCircle(cx: number, cz: number, radius: number, pad = 0): void {
    const rr = (radius + pad) ** 2;
    this.forEachCell((c, r, p) => {
      if ((p.x - cx) ** 2 + (p.z - cz) ** 2 <= rr) this.setBlocked(c, r);
    });
  }

  /** 가장 가까운 걸을 수 있는 칸 (격자 밖 좌표는 가장자리로 당겨서 찾음) */
  nearestWalkable(c: number, r: number): [number, number] | null {
    c = Math.min(Math.max(c, 0), this.cols - 1);
    r = Math.min(Math.max(r, 0), this.rows - 1);
    if (this.isWalkable(c, r)) return [c, r];
    const maxRing = Math.max(this.cols, this.rows);
    for (let ring = 1; ring <= maxRing; ring++) {
      let best: [number, number] | null = null;
      let bestD = Infinity;
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
          if (!this.isWalkable(c + dc, r + dr)) continue;
          const d = dc * dc + dr * dr;
          if (d < bestD) {
            bestD = d;
            best = [c + dc, r + dr];
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** 두 지점 사이가 막힘 없이 이어지는지 (선분을 잘게 나눠 검사) */
  hasLineOfSight(a: Point, b: Point): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / (this.cellSize * 0.25)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.isWalkableAt(a.x + dx * t, a.z + dz * t)) return false;
    }
    return true;
  }

  /**
   * from에서 to까지 걸어갈 경유점 목록 (출발점 제외). 갈 수 없으면 null.
   * 목표가 장애물 안이면 가장 가까운 빈 칸까지 간다.
   */
  findPath(from: Point, to: Point): Point[] | null {
    const [fc, fr] = this.worldToCell(from.x, from.z);
    const start = this.nearestWalkable(fc, fr);
    const [tc, tr] = this.worldToCell(to.x, to.z);
    const goal = this.nearestWalkable(tc, tr);
    if (!start || !goal) return null;

    const cells = this.findCellPath(start[0], start[1], goal[0], goal[1]);
    if (!cells) return null;

    const points = cells.map(([c, r]) => this.cellCenter(c, r));
    // 목표 칸이 원래 걸을 수 있는 곳이면 톡한 정확한 지점까지 간다
    points[points.length - 1] = this.isWalkable(tc, tr) ? { x: to.x, z: to.z } : this.cellCenter(goal[0], goal[1]);
    const anchor = this.isWalkableAt(from.x, from.z) ? from : this.cellCenter(start[0], start[1]);
    const smoothed = this.smooth(anchor, points);
    if (anchor !== from) smoothed.unshift(anchor);
    return smoothed;
  }

  /** 시야가 닿는 가장 먼 점으로 바로 건너뛰어 지그재그를 없앤다 */
  private smooth(anchor: Point, points: Point[]): Point[] {
    const out: Point[] = [];
    let current = anchor;
    let i = 0;
    while (i < points.length) {
      let far = i;
      for (let j = points.length - 1; j > i; j--) {
        if (this.hasLineOfSight(current, points[j])) {
          far = j;
          break;
        }
      }
      current = points[far];
      out.push(current);
      i = far + 1;
    }
    return out;
  }

  /** 8방향 A* (대각선으로 모서리를 깎아 지나가지 않음) */
  private findCellPath(sc: number, sr: number, gc: number, gr: number): Array<[number, number]> | null {
    const n = this.cols * this.rows;
    const g = new Float64Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const start = sr * this.cols + sc;
    const goal = gr * this.cols + gc;
    const h = (c: number, r: number) => {
      const dx = Math.abs(c - gc);
      const dz = Math.abs(r - gr);
      return dx + dz + (SQRT2 - 2) * Math.min(dx, dz);
    };

    const heap = new MinHeap();
    g[start] = 0;
    heap.push(start, h(sc, sr));

    while (heap.size > 0) {
      const cur = heap.pop();
      if (closed[cur]) continue;
      if (cur === goal) return this.reconstruct(came, goal);
      closed[cur] = 1;
      const c = cur % this.cols;
      const r = (cur - c) / this.cols;
      for (const [dc, dr] of DIRS) {
        const nc = c + dc;
        const nr = r + dr;
        if (!this.isWalkable(nc, nr)) continue;
        const diagonal = dc !== 0 && dr !== 0;
        if (diagonal && (!this.isWalkable(c + dc, r) || !this.isWalkable(c, r + dr))) continue;
        const ni = nr * this.cols + nc;
        if (closed[ni]) continue;
        const ng = g[cur] + (diagonal ? SQRT2 : 1);
        if (ng < g[ni]) {
          g[ni] = ng;
          came[ni] = cur;
          heap.push(ni, ng + h(nc, nr));
        }
      }
    }
    return null;
  }

  private reconstruct(came: Int32Array, goal: number): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let i = goal; i !== -1; i = came[i]) out.push([i % this.cols, Math.floor(i / this.cols)]);
    return out.reverse();
  }

  private forEachCell(fn: (c: number, r: number, center: Point) => void): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) fn(c, r, this.cellCenter(c, r));
    }
  }
}

/** A*용 최소 힙 */
class MinHeap {
  private items: number[] = [];
  private keys: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, key: number): void {
    this.items.push(item);
    this.keys.push(key);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number {
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.items.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}
