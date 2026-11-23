import wardrobeJson from '../data/wardrobe.json';
import { allItems, getItem, type Item } from './items';

/** 옷 꾸미기 (GDD 5.1): 부위별 조합 + 색 8개 */

export interface Slot {
  id: string;
  name: string;
  en: string;
  optional: boolean;
}

export interface PaletteColor {
  id: string;
  name: string;
  en: string;
  hex: string;
}

export interface Worn {
  /** 입은 옷 id, 안 입었으면 null */
  item: string | null;
  /** palette id */
  color: string;
}

export type Outfit = Record<string, Worn>;

const data = wardrobeJson as unknown as {
  slots: Slot[];
  palette: PaletteColor[];
  starter: string[];
  default: Outfit;
};

export const SLOTS: readonly Slot[] = data.slots;
export const PALETTE: readonly PaletteColor[] = data.palette;
export const STARTER_ITEMS: readonly string[] = data.starter;

export function getColor(id: string): PaletteColor {
  return PALETTE.find((c) => c.id === id) ?? PALETTE[0];
}

export function defaultOutfit(): Outfit {
  return structuredClone(data.default);
}

/** 가진 옷 = 처음부터 있던 옷 + 선물로 받은 옷 */
export function ownedOutfitItems(received: readonly string[]): string[] {
  const set = new Set<string>(STARTER_ITEMS);
  for (const id of received) if (getOutfitItem(id)) set.add(id);
  return [...set];
}

export function getOutfitItem(id: string): (Item & { slot: string; shape: string }) | null {
  const it = allItems()[id];
  return it && it.kind === 'outfit' && it.slot && it.shape ? (it as Item & { slot: string; shape: string }) : null;
}

/** 이 부위에 입을 수 있는 내 옷 (data 순서대로) */
export function itemsForSlot(slot: string, owned: readonly string[]): string[] {
  return Object.keys(allItems()).filter((id) => owned.includes(id) && getOutfitItem(id)?.slot === slot);
}

/** 옷 입기. 같은 부위의 옷을 바꾸면 그 옷의 기본 색으로 */
export function equip(outfit: Outfit, slot: string, itemId: string | null): Outfit {
  const next = structuredClone(outfit);
  if (itemId === null) {
    const s = SLOTS.find((x) => x.id === slot);
    if (!s?.optional) return next;
    next[slot] = { item: null, color: next[slot]?.color ?? PALETTE[0].id };
    return next;
  }
  const it = getOutfitItem(itemId);
  if (!it || it.slot !== slot) return next;
  const keepColor = next[slot]?.item === itemId;
  next[slot] = { item: itemId, color: keepColor ? next[slot].color : (it.defaultColor ?? PALETTE[0].id) };
  return next;
}

export function setColor(outfit: Outfit, slot: string, colorId: string): Outfit {
  const next = structuredClone(outfit);
  if (!next[slot] || !PALETTE.some((c) => c.id === colorId)) return next;
  next[slot] = { ...next[slot], color: colorId };
  return next;
}

/**
 * 저장된 옷을 믿을 수 있게 정리: 없는 부위·모르는 옷·안 가진 옷·모르는 색은 기본값으로.
 * (데이터가 바뀌거나 저장이 깨져도 게임이 멈추지 않게)
 */
export function sanitizeOutfit(raw: unknown, owned: readonly string[]): Outfit {
  const base = defaultOutfit();
  if (!raw || typeof raw !== 'object') return base;
  const src = raw as Record<string, Partial<Worn>>;
  for (const slot of SLOTS) {
    const w = src[slot.id];
    if (!w || typeof w !== 'object') continue;
    const color = typeof w.color === 'string' && PALETTE.some((c) => c.id === w.color) ? w.color : base[slot.id].color;
    if (w.item === null && slot.optional) {
      base[slot.id] = { item: null, color };
    } else if (typeof w.item === 'string' && owned.includes(w.item) && getOutfitItem(w.item)?.slot === slot.id) {
      base[slot.id] = { item: w.item, color };
    }
  }
  return base;
}

/** 이 옷의 이름을 한글·영어로 (안 입기는 null) */
export function describeWorn(w: Worn): { name: string; en: string } | null {
  return w.item ? getItem(w.item) : null;
}
