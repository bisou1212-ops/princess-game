import type { NavGrid, Point } from './nav-grid';

/**
 * 친구가 돌아다닐 다음 목적지 고르기: 집(home) 둘레 radius 안의 걸을 수 있는 곳.
 * 지금 자리와 너무 가깝거나, 공주(avoid) 바로 옆은 피한다. 못 찾으면 null(그냥 쉼).
 */
export function pickWanderTarget(
  grid: NavGrid,
  home: Point,
  radius: number,
  from: Point,
  rand: () => number = Math.random,
  avoid?: Point,
  avoidDist = 2,
): Point | null {
  if (radius <= 0) return null;
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2;
    const r = radius * Math.sqrt(rand());
    const p = { x: home.x + Math.cos(a) * r, z: home.z + Math.sin(a) * r };
    if (!grid.isWalkableAt(p.x, p.z)) continue;
    if (Math.hypot(p.x - from.x, p.z - from.z) < 0.8) continue;
    if (avoid && Math.hypot(p.x - avoid.x, p.z - avoid.z) < avoidDist) continue;
    return p;
  }
  return null;
}
