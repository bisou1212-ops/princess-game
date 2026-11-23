import { describe, it, expect } from 'vitest';
import { buildNavGrid, courtyardLayout } from './courtyard-layout';

describe('성 마당 배치 데이터', () => {
  const grid = buildNavGrid(courtyardLayout);

  it('시작 위치는 걸을 수 있는 곳이다', () => {
    expect(grid.isWalkableAt(courtyardLayout.start.x, courtyardLayout.start.z)).toBe(true);
  });

  it('갇힌 구역 없이 모든 빈 칸에 시작 위치에서 갈 수 있다', () => {
    const [sc, sr] = grid.worldToCell(courtyardLayout.start.x, courtyardLayout.start.z);
    const seen = new Set<number>([sr * grid.cols + sc]);
    const queue: Array<[number, number]> = [[sc, sr]];
    while (queue.length) {
      const [c, r] = queue.pop()!;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc;
        const nr = r + dr;
        const key = nr * grid.cols + nc;
        if (grid.isWalkable(nc, nr) && !seen.has(key)) {
          seen.add(key);
          queue.push([nc, nr]);
        }
      }
    }
    let walkable = 0;
    for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) if (grid.isWalkable(c, r)) walkable++;
    expect(seen.size).toBe(walkable);
  });

  it('분수 반대편까지 길을 찾는다', () => {
    const path = grid.findPath(courtyardLayout.start, { x: 0, z: -4 });
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(1);
  });
});
