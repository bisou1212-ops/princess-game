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
}

const data = worldJson as unknown as { start: string; locations: Location[]; sleepLine: string };

export const LOCATIONS: readonly Location[] = data.locations;
export const START_LOCATION = data.start;
export const SLEEP_LINE = data.sleepLine;

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
};

export function canTravelTo(id: string): boolean {
  return !!getLocation(id)?.open && id in LOADERS;
}

export async function loadLocationLayout(id: string): Promise<CourtyardLayout> {
  const load = LOADERS[id];
  if (!load) throw new Error(`world.json에 불러올 방법이 없는 장소: ${id}`);
  return load();
}
