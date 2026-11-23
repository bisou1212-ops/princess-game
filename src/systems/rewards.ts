import type { Reward } from './quests';

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
      for (const it of r.items) if (typeof it === 'string' && !this.items.includes(it)) this.items.push(it);
    }
  }

  toJSON(): { candy: number; items: string[] } {
    return { candy: this.candy, items: [...this.items] };
  }

  grant(reward: Reward): void {
    this.candy += reward.candy;
    for (const it of reward.items) if (!this.items.includes(it)) this.items.push(it);
  }
}
