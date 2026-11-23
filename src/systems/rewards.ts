import type { Reward } from './quests';

/** 별사탕과 받은 선물 (GDD 5.3) */
export class Wallet {
  candy = 0;
  readonly items: string[] = [];

  grant(reward: Reward): void {
    this.candy += reward.candy;
    for (const it of reward.items) if (!this.items.includes(it)) this.items.push(it);
  }
}
