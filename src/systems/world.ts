import worldJson from '../data/world.json';
import courtyardJson from '../data/courtyard.json';
import type { CourtyardLayout } from '../scenes/castle/courtyard-layout';

/** 왕국 지도 (GDD 2·4·10): 어디로 갈 수 있는지, 장소 배치 데이터를 어떻게 불러오는지 */

export interface Location {
  id: string;
  name: string;
  en: string;
  icon: 'castle' | 'flower' | 'shell' | 'snow' | 'star';
  color: string;
  /** 지도 위 위치 (%) */
  x: number;
  y: number;
  open: boolean;
  /** 스티커를 이만큼 모으면 잠자던 왕국이 깨어난다 (open=false 인 왕국) */
  wakeStickers?: number;
}

const data = worldJson as unknown as { start: string; locations: Location[]; sleepLine: string; wakeLine: string; awakeLine: string };

export const LOCATIONS: readonly Location[] = data.locations;
export const START_LOCATION = data.start;
export const SLEEP_LINE = data.sleepLine;
/** "스티커를 {n}개 더 모으면 {name}이 깨어나요!" */
export const WAKE_LINE = data.wakeLine;
/** "{name}이 깨어났어요!" */
export const AWAKE_LINE = data.awakeLine;

export function getLocation(id: string): Location | undefined {
  return LOCATIONS.find((l) => l.id === id);
}

/**
 * 장소 배치 데이터 불러오기. 성은 처음부터 들어 있고, 다른 왕국은 갈 때 따로 받아 온다
 * (나중에 모델·소리가 커져도 첫 로딩을 가볍게 — CLAUDE.md: 첫 로딩 10MB 이하).
 */
const LOADERS: Record<string, () => Promise<CourtyardLayout>> = {
  castle: async () => courtyardJson as unknown as CourtyardLayout,
  'flower-kingdom': async () => (await import('../data/flower-kingdom.json')).default as unknown as CourtyardLayout,
  'sea-kingdom': async () => (await import('../data/sea-kingdom.json')).default as unknown as CourtyardLayout,
};

/** 지금 모은 스티커 수 (게임이 정해 준다. 테스트·처음엔 0) */
let stickerCount: () => number = () => 0;
export function setStickerCount(fn: () => number): void {
  stickerCount = fn;
}

/** 배치 데이터가 있는 장소 (갈 수 있든 없든) */
export function hasLayout(id: string): boolean {
  return id in LOADERS;
}

/** 잠자는 왕국이 깨어났나: 스티커를 정해진 만큼 모았으면 */
export function isAwake(id: string): boolean {
  const l = getLocation(id);
  if (!l) return false;
  return l.open || (l.wakeStickers !== undefined && stickerCount() >= l.wakeStickers);
}

/** 앞으로 몇 개 더 모으면 깨어나는지 (깨어날 수 없는 왕국이면 null) */
export function stickersToWake(id: string): number | null {
  const l = getLocation(id);
  if (!l || l.open || l.wakeStickers === undefined || !hasLayout(id)) return null;
  return Math.max(0, l.wakeStickers - stickerCount());
}

export function canTravelTo(id: string): boolean {
  return isAwake(id) && hasLayout(id);
}

export async function loadLocationLayout(id: string): Promise<CourtyardLayout> {
  const load = LOADERS[id];
  if (!load) throw new Error(`world.json에 불러올 방법이 없는 장소: ${id}`);
  return load();
}
