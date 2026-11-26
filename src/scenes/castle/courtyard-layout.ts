import { NavGrid, type Point } from '../../systems/navigation/nav-grid';
import layoutJson from '../../data/courtyard.json';

/** 색을 따로 쓰고 싶을 때 color(#rrggbb), 집은 roof(지붕 색) */
interface RectObstacle {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color?: string;
  roof?: string;
}
interface RoundObstacle {
  id: string;
  x: number;
  z: number;
  r: number;
  h: number;
  color?: string;
  /** 원기둥 위 고깔 지붕 색 (탑) */
  roof?: string;
}
export type Obstacle =
  | (RectObstacle & { shape: 'box' })
  | (RectObstacle & { shape: 'house' })
  | (RoundObstacle & { shape: 'cylinder' })
  | (RoundObstacle & { shape: 'tree' });

/** 장소마다 다른 색 (하늘·바깥 땅·마당 바닥·벽·소품) */
export interface Theme {
  sky: string;
  ground: string;
  yard: string;
  structure: string;
  prop: string;
}

/** 장식 꽃밭 (부딪히지 않음) */
export interface FlowerPatch {
  x: number;
  z: number;
  r: number;
  n: number;
  /** 화단 위처럼 바닥보다 높을 때 */
  y?: number;
}

/** 마당에 서 있는 친구 (characters.json·dialogues.json의 id를 가리킴) */
export interface NpcPlacement {
  id: string;
  character: string;
  x: number;
  z: number;
  /** 처음 바라보는 방향(라디안) */
  facing: number;
  /** 집(x, z) 둘레 이 반지름(m) 안을 돌아다닌다. 없거나 0이면 제자리 */
  wander?: number;
  /** 그냥 말을 걸면 나오는 대사 (dialogues.json) */
  dialogue?: string;
  /** 이 친구가 주는 부탁 (quests.json) — 있으면 부탁 진행에 맞는 대사가 나옴 */
  quest?: string;
}

/** 성 벽에 붙은 문. 톡하면 공주가 걸어가서 target 방으로 들어간다 */
export interface DoorPlacement {
  id: string;
  /** 문 가운데 (벽 앞면) */
  x: number;
  z: number;
  w: number;
  h: number;
  target: string;
}

export interface CourtyardLayout {
  /** world.json의 장소 id */
  id: string;
  /** Blender로 만든 배경 모델 (env-<이름>.glb). 있으면 보이는 모습만 그걸로 바꾸고, 충돌은 obstacles 그대로 */
  env?: string;
  theme: Theme;
  flowerPatches?: FlowerPatch[];
  width: number;
  depth: number;
  cellSize: number;
  start: Point;
  obstacles: Obstacle[];
  npcs: NpcPlacement[];
  doors: DoorPlacement[];
  /** 숨바꼭질 때 친구가 숨는 자리 (나무·집·분수 뒤) */
  hideSpots?: Point[];
}

export const courtyardLayout = layoutJson as CourtyardLayout;

/** 캐릭터 몸 반지름 — 장애물을 이만큼 넓게 막아 몸이 벽에 파묻히지 않게 한다 */
export const AGENT_RADIUS = 0.35;
/** 친구 몸 반지름 (공주가 친구를 뚫고 지나가지 않게) */
export const NPC_RADIUS = 0.4;

export function buildNavGrid(layout: CourtyardLayout, agentRadius = AGENT_RADIUS): NavGrid {
  const grid = new NavGrid({ width: layout.width, depth: layout.depth, cellSize: layout.cellSize });
  for (const o of layout.obstacles) {
    if (o.shape === 'box' || o.shape === 'house') grid.blockRect(o.x, o.z, o.w, o.d, agentRadius);
    else grid.blockCircle(o.x, o.z, o.r, agentRadius);
  }
  // 제자리 친구만 막는다 (돌아다니는 친구는 길을 막지 않음 — 공주가 다가가면 멈춘다)
  for (const n of layout.npcs) if (!n.wander) grid.blockCircle(n.x, n.z, NPC_RADIUS, agentRadius);
  return grid;
}
