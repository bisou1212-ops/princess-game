import { getItem, hasItem } from './items';
import type { Reward } from './quests';

/** 가구는 여러 개 가질 수 있다 (의자 두 개 …). 옷 등은 하나만 */
export function isStackable(itemId: string): boolean {
  return hasItem(itemId) && getItem(itemId).kind === 'furniture';
}

/** 별사탕과 받은 선물 (GDD 5.3) */
export class Wallet {
  candy = 0;
  readonly items: string[] = [];

  /** 저장된 값 불러오기 (이상한 값은 무시) */
  load(raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    const r = raw as { candy?: unknown; items?: unknown };
    if (typeof r.candy === 'number' && Number.isFinite(r.candy)) this.candy = Math.max(0, Math.floor(r.candy));
    if (Array.isArray(r.items)) {
      this.items.length = 0;
      for (const it of r.items) if (typeof it === 'string') this.add(it);
    }
  }

  toJSON(): { candy: number; items: string[] } {
    return { candy: this.candy, items: [...this.items] };
  }

  /** 물건 하나 넣기 (가구는 여러 개, 나머지는 이미 있으면 그대로) */
  add(itemId: string): void {
    if (isStackable(itemId) || !this.items.includes(itemId)) this.items.push(itemId);
  }

  has(itemId: string): boolean {
    return this.items.includes(itemId);
  }

  grant(reward: Reward): void {
    this.candy += reward.candy;
    for (const it of reward.items) this.add(it);
  }

  /** 별사탕 내기. 모자라면 false (아무것도 안 바뀜) */
  spend(n: number): boolean {
    if (n < 0 || n > this.candy) return false;
    this.candy -= n;
    return true;
  }
}
