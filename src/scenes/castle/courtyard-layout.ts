import { NavGrid, type Point } from '../../systems/navigation/nav-grid';
import layoutJson from '../../data/courtyard.json';

export type Obstacle =
  | { id: string; shape: 'box'; x: number; z: number; w: number; d: number; h: number }
  | { id: string; shape: 'cylinder' | 'tree'; x: number; z: number; r: number; h: number };

/** 마당에 서 있는 친구 (characters.json·dialogues.json의 id를 가리킴) */
export interface NpcPlacement {
  id: string;
  character: string;
  x: number;
  z: number;
  /** 처음 바라보는 방향(라디안) */
  facing: number;
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
  width: number;
  depth: number;
  cellSize: number;
  start: Point;
  obstacles: Obstacle[];
  npcs: NpcPlacement[];
  doors: DoorPlacement[];
}

export const courtyardLayout = layoutJson as CourtyardLayout;

/** 캐릭터 몸 반지름 — 장애물을 이만큼 넓게 막아 몸이 벽에 파묻히지 않게 한다 */
export const AGENT_RADIUS = 0.35;
/** 친구 몸 반지름 (공주가 친구를 뚫고 지나가지 않게) */
export const NPC_RADIUS = 0.4;

export function buildNavGrid(layout: CourtyardLayout, agentRadius = AGENT_RADIUS): NavGrid {
  const grid = new NavGrid({ width: layout.width, depth: layout.depth, cellSize: layout.cellSize });
  for (const o of layout.obstacles) {
    if (o.shape === 'box') grid.blockRect(o.x, o.z, o.w, o.d, agentRadius);
    else grid.blockCircle(o.x, o.z, o.r, agentRadius);
  }
  for (const n of layout.npcs) grid.blockCircle(n.x, n.z, NPC_RADIUS, agentRadius);
  return grid;
}
