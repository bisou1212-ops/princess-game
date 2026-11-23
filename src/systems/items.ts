import itemsJson from '../data/items.json';
import wordsJson from '../data/words.json';

export type ItemKind = 'flower' | 'dress';

export interface Item {
  kind: ItemKind;
  /** 한글 이름 */
  name: string;
  /** 영어 이름 */
  en: string;
  /** 화면 표시 색 (#rrggbb) */
  color: string;
}

const { _comment: _items, ...items } = itemsJson as unknown as Record<string, Item> & { _comment?: string };

export function getItem(id: string): Item {
  const item = items[id];
  if (!item) throw new Error(`items.json에 없는 아이템: ${id}`);
  return item;
}

export function hasItem(id: string): boolean {
  return id in items;
}

export function allItems(): Record<string, Item> {
  return items;
}

/** 셀 때 읽는 말: 1 → "하나" (없으면 숫자 그대로) */
export function countingWord(n: number): string {
  return wordsJson.counting[n] || String(n);
}

/** 단위 앞에 붙는 말: (5, "개") → "다섯 개" */
export function countWithUnit(n: number, unit: string): string {
  return `${wordsJson.withUnit[n] || String(n)} ${unit}`;
}
