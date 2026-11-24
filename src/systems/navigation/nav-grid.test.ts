import { describe, it, expect } from 'vitest';
import { NavGrid, type Point } from './nav-grid';
import { Walker } from './walker';

function openGrid(): NavGrid {
  return new NavGrid({ width: 10, depth: 10, cellSize: 0.5 });
}

/** 경로의 모든 구간이 막힘 없이 이어지는지 */
function pathIsClear(grid: NavGrid, from: Point, path: Point[]): boolean {
  let prev = from;
  for (const p of path) {
    if (!grid.hasLineOfSight(prev, p)) return false;
    prev = p;
  }
  return true;
}

describe('NavGrid 길찾기', () => {
  it('막힌 곳이 없으면 목표까지 한 번에 곧장 간다', () => {
    const grid = openGrid();
    const path = grid.findPath({ x: -4, z: -4 }, { x: 3.3, z: 2.1 });
    expect(path).toEqual([{ x: 3.3, z: 2.1 }]);
  });

  it('벽이 가로막으면 돌아서 간다', () => {
    const grid = openGrid();
    // 가운데 세로 벽, 위쪽(z<-3)에만 틈이 있음
    grid.blockRect(0, 1, 1, 8);
    const from = { x: -3, z: 3 };
    const to = { x: 3, z: 3 };
    const path = grid.findPath(from, to)!;
    expect(path).not.toBeNull();
    expect(path.length).toBeGreaterThan(1);
    expect(path[path.length - 1]).toEqual(to);
    expect(pathIsClear(grid, from, path)).toBe(true);
    expect(path.some((p) => p.z < -3)).toBe(true);
  });

  it('장애물 위를 톡하면 가장 가까운 빈 곳까지 간다', () => {
    const grid = openGrid();
    grid.blockCircle(2, 0, 1);
    const path = grid.findPath({ x: -4, z: 0 }, { x: 2, z: 0 })!;
    const end = path[path.length - 1];
    expect(grid.isWalkableAt(end.x, end.z)).toBe(true);
    expect(Math.hypot(end.x - 2, end.z)).toBeLessThan(1.6);
  });

  it('완전히 둘러싸인 곳은 갈 수 없다 (null)', () => {
    const grid = openGrid();
    // 오른쪽 위 구석을 ㄱ자 벽으로 막음
    grid.blockRect(2, -3.5, 0.5, 3);
    grid.blockRect(3.5, -2, 3, 0.5);
    expect(grid.isWalkableAt(4, -4)).toBe(true);
    expect(grid.findPath({ x: -4, z: 4 }, { x: 4, z: -4 })).toBeNull();
  });

  it('대각선으로 벽 모서리를 깎아 지나가지 않는다', () => {
    const grid = new NavGrid({ width: 2, depth: 2, cellSize: 1 });
    grid.setBlocked(1, 0);
    grid.setBlocked(0, 1);
    expect(grid.findPath({ x: -0.5, z: -0.5 }, { x: 0.5, z: 0.5 })).toBeNull();
  });
});

describe('Walker 이동', () => {
  it('경유점을 따라 걷고 도착하면 멈춘다', () => {
    const w = new Walker({ x: 0, z: 0 }, 2);
    w.setPath([{ x: 0, z: 2 }, { x: 2, z: 2 }]);
    w.update(1); // 2m 이동 → 첫 경유점 도착
    expect(w.x).toBeCloseTo(0);
    expect(w.z).toBeCloseTo(2);
    expect(w.moving).toBe(true);
    for (let i = 0; i < 60; i++) w.update(1 / 30);
    expect(w.x).toBeCloseTo(2);
    expect(w.z).toBeCloseTo(2);
    expect(w.moving).toBe(false);
    // 마지막으로 +x 방향으로 걸었으므로 그쪽을 바라봄
    expect(w.heading).toBeCloseTo(Math.PI / 2, 1);
  });
});

describe('친구 돌아다니기 목적지', async () => {
  const { pickWanderTarget } = await import('./wander');
  let seed = 7;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  it('집 둘레 반지름 안의 걸을 수 있는 곳만 고른다', () => {
    const grid = openGrid();
    grid.blockCircle(1, 0, 0.8);
    const home = { x: 0, z: 0 };
    for (let i = 0; i < 50; i++) {
      const p = pickWanderTarget(grid, home, 2.5, home, rand)!;
      expect(p).not.toBeNull();
      expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(2.5 + 1e-9);
      expect(grid.isWalkableAt(p.x, p.z)).toBe(true);
    }
  });

  it('반지름 0이면 제자리, 공주 바로 옆은 피한다', () => {
    const grid = openGrid();
    expect(pickWanderTarget(grid, { x: 0, z: 0 }, 0, { x: 0, z: 0 }, rand)).toBeNull();
    const princess = { x: 0.5, z: 0 };
    for (let i = 0; i < 50; i++) {
      const p = pickWanderTarget(grid, { x: 0, z: 0 }, 3, { x: 0, z: 0 }, rand, princess);
      if (p) expect(Math.hypot(p.x - princess.x, p.z - princess.z)).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('돌아다니는 친구 데이터', async () => {
  const { LOCATIONS, canTravelTo, loadLocationLayout } = await import('../world');
  const { buildNavGrid } = await import('../../scenes/castle/courtyard-layout');
  it('돌아다니는 친구의 집 둘레에 걸을 수 있는 곳이 충분하다', async () => {
    for (const l of LOCATIONS.filter((x) => canTravelTo(x.id))) {
      const layout = await loadLocationLayout(l.id);
      const grid = buildNavGrid(layout);
      for (const n of layout.npcs.filter((x) => x.wander)) {
        expect(grid.isWalkableAt(n.x, n.z), `${n.id} 집`).toBe(true);
        const { pickWanderTarget } = await import('./wander');
        expect(pickWanderTarget(grid, n, n.wander!, n), `${n.id} 산책 자리`).not.toBeNull();
      }
    }
  });
});
