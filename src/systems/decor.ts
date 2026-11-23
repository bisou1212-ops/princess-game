import roomsJson from '../data/rooms.json';
import { allItems, type Item } from './items';
import { PALETTE } from './wardrobe';

/**
 * 성 꾸미기 (GDD 5.2): 방을 칸으로 나누고 가구를 놓는다.
 * three.js와 분리된 순수 로직이라 Vitest로 테스트한다.
 */

export interface RoomDef {
  name: string;
  en: string;
  width: number;
  depth: number;
  cellSize: number;
  wall: string;
  floor: string;
}

export type FurnitureItem = Item & { kind: 'furniture'; shape: string; w: number; d: number; layer: 'object' | 'floor' };

/** 방에 놓인 가구 하나. (c, r)은 차지하는 칸의 왼쪽 위(-x, -z) 칸 */
export interface Placed {
  uid: string;
  item: string;
  c: number;
  r: number;
  /** 90° 단위 회전 0~3 */
  rot: number;
  /** palette id */
  color: string;
}

const data = roomsJson as unknown as { rooms: Record<string, RoomDef>; starterFurniture: Record<string, number> };

export const ROOMS: Readonly<Record<string, RoomDef>> = data.rooms;
export const STARTER_FURNITURE: Readonly<Record<string, number>> = data.starterFurniture;

export function getFurniture(id: string): FurnitureItem | null {
  const it = allItems()[id];
  return it && it.kind === 'furniture' && it.shape && it.w && it.d ? ({ layer: 'object', ...it } as FurnitureItem) : null;
}

/** 가진 가구 개수 = 처음 가구 + 선물로 받은 가구(하나씩) */
export function ownedFurniture(received: readonly string[]): Record<string, number> {
  const out: Record<string, number> = { ...STARTER_FURNITURE };
  for (const id of received) if (getFurniture(id)) out[id] = (out[id] ?? 0) + 1;
  return out;
}

/** 회전을 반영한 차지 칸 수 */
export function footprint(item: FurnitureItem, rot: number): { w: number; d: number } {
  return rot % 2 === 0 ? { w: item.w, d: item.d } : { w: item.d, d: item.w };
}

export class RoomLayout {
  readonly cols: number;
  readonly rows: number;
  private placed: Placed[] = [];
  private seq = 0;

  constructor(
    readonly def: RoomDef,
    private owned: Record<string, number> = { ...STARTER_FURNITURE },
  ) {
    this.cols = Math.round(def.width / def.cellSize);
    this.rows = Math.round(def.depth / def.cellSize);
  }

  get items(): readonly Placed[] {
    return this.placed;
  }

  get(uid: string): Placed | undefined {
    return this.placed.find((p) => p.uid === uid);
  }

  setOwned(owned: Record<string, number>): void {
    this.owned = { ...owned };
  }

  /** 서랍에 남은 개수 */
  available(itemId: string): number {
    return (this.owned[itemId] ?? 0) - this.placed.filter((p) => p.item === itemId).length;
  }

  /** 서랍에 보여 줄 가구 (가진 것 전부, 데이터 순서) */
  drawer(): Array<{ item: string; left: number }> {
    return Object.keys(allItems())
      .filter((id) => (this.owned[id] ?? 0) > 0 && getFurniture(id))
      .map((id) => ({ item: id, left: this.available(id) }));
  }

  /** 손가락이 가리키는 바닥 좌표(방 가운데가 0,0)에 가구 가운데가 오도록 칸 맞추기 */
  snap(itemId: string, rot: number, x: number, z: number): { c: number; r: number } | null {
    const item = getFurniture(itemId);
    if (!item) return null;
    const { w, d } = footprint(item, rot);
    const cs = this.def.cellSize;
    return {
      c: Math.round((x + this.def.width / 2) / cs - w / 2),
      r: Math.round((z + this.def.depth / 2) / cs - d / 2),
    };
  }

  /** 가구 가운데의 바닥 좌표 */
  centerOf(itemId: string, c: number, r: number, rot: number): { x: number; z: number } {
    const item = getFurniture(itemId)!;
    const { w, d } = footprint(item, rot);
    const cs = this.def.cellSize;
    return { x: (c + w / 2) * cs - this.def.width / 2, z: (r + d / 2) * cs - this.def.depth / 2 };
  }

  /** 방 안이고, 같은 층의 다른 가구와 안 겹치면 true (러그 위에는 놓을 수 있음) */
  canPlace(itemId: string, c: number, r: number, rot: number, ignoreUid?: string): boolean {
    const item = getFurniture(itemId);
    if (!item) return false;
    const { w, d } = footprint(item, rot);
    if (c < 0 || r < 0 || c + w > this.cols || r + d > this.rows) return false;
    for (const p of this.placed) {
      if (p.uid === ignoreUid) continue;
      const other = getFurniture(p.item);
      if (!other || other.layer !== item.layer) continue;
      const o = footprint(other, p.rot);
      const overlap = c < p.c + o.w && p.c < c + w && r < p.r + o.d && p.r < r + d;
      if (overlap) return false;
    }
    return true;
  }

  /** 서랍에서 꺼내 놓기 */
  place(itemId: string, c: number, r: number, rot = 0, color?: string): Placed | null {
    const item = getFurniture(itemId);
    if (!item || this.available(itemId) <= 0 || !this.canPlace(itemId, c, r, rot)) return null;
    const p: Placed = {
      uid: `${itemId}-${Date.now().toString(36)}-${this.seq++}`,
      item: itemId,
      c,
      r,
      rot: ((rot % 4) + 4) % 4,
      color: color ?? item.defaultColor ?? PALETTE[0].id,
    };
    this.placed.push(p);
    return { ...p };
  }

  move(uid: string, c: number, r: number): boolean {
    const p = this.get(uid);
    if (!p || !this.canPlace(p.item, c, r, p.rot, uid)) return false;
    p.c = c;
    p.r = r;
    return true;
  }

  /**
   * 90° 돌리기. 가운데를 기준으로 돌리고, 벽·가구에 걸리면 가까운 빈자리로 살짝 밀어 본다.
   * 그래도 안 되면 false (그대로 둠 — 실패 표시 없이 살짝 흔들기만)
   */
  rotate(uid: string): boolean {
    const p = this.get(uid);
    const item = p && getFurniture(p.item);
    if (!p || !item) return false;
    const rot = (p.rot + 1) % 4;
    const before = footprint(item, p.rot);
    const after = footprint(item, rot);
    // 가운데 유지
    const c0 = p.c + Math.round((before.w - after.w) / 2);
    const r0 = p.r + Math.round((before.d - after.d) / 2);
    for (let ring = 0; ring <= 2; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
          if (this.canPlace(p.item, c0 + dc, r0 + dr, rot, uid)) {
            p.c = c0 + dc;
            p.r = r0 + dr;
            p.rot = rot;
            return true;
          }
        }
      }
    }
    return false;
  }

  recolor(uid: string, color: string): boolean {
    const p = this.get(uid);
    if (!p || !PALETTE.some((x) => x.id === color)) return false;
    p.color = color;
    return true;
  }

  /** 치우기 = 서랍으로 돌려보내기 */
  remove(uid: string): boolean {
    const i = this.placed.findIndex((p) => p.uid === uid);
    if (i < 0) return false;
    this.placed.splice(i, 1);
    return true;
  }

  toJSON(): Placed[] {
    return this.placed.map((p) => ({ ...p }));
  }

  /** 저장값 불러오기: 모르는 가구·가진 것보다 많은 것·방 밖·겹친 것은 빼고 놓는다 */
  load(raw: unknown): void {
    this.placed = [];
    if (!Array.isArray(raw)) return;
    for (const v of raw as Array<Partial<Placed>>) {
      if (!v || typeof v.item !== 'string' || typeof v.uid !== 'string') continue;
      if (![v.c, v.r, v.rot].every((n) => Number.isInteger(n))) continue;
      const rot = ((v.rot! % 4) + 4) % 4;
      if (this.available(v.item) <= 0 || !this.canPlace(v.item, v.c!, v.r!, rot)) continue;
      const color = typeof v.color === 'string' && PALETTE.some((x) => x.id === v.color) ? v.color : (getFurniture(v.item)!.defaultColor ?? PALETTE[0].id);
      this.placed.push({ uid: v.uid, item: v.item, c: v.c!, r: v.r!, rot, color });
    }
  }
}
