import type { Speaker } from '../core/tts';
import { countWithUnit, getItem } from '../systems/items';
import type { Reward } from '../systems/quests';
import { candyIcon, itemIcon } from './icons';
import { sfx } from '../core/sound';

/**
 * 선물 받기 화면 (GDD 4.5). 선물 이름을 한글·영어로 읽어 주고,
 * 별사탕이 하나씩 튀어나와 같이 셀 수 있다. 화면 아무 곳이나 톡하면 닫힘.
 */
export class RewardPopup {
  private readonly layer: HTMLDivElement;
  private onClose: (() => void) | null = null;
  private shownAt = 0;

  constructor(
    parent: HTMLElement,
    private readonly speaker: Speaker,
    private readonly voice: { pitch: number; rate: number },
  ) {
    this.layer = document.createElement('div');
    this.layer.className = 'reward-layer';
    this.layer.hidden = true;
    parent.appendChild(this.layer);
    this.layer.addEventListener('click', () => {
      if (performance.now() - this.shownAt > 800) this.close();
    });
  }

  open(reward: Reward, onClose?: () => void): void {
    sfx('reward');
    this.onClose = onClose ?? null;
    const gifts = reward.items.map((id) => {
      const it = getItem(id);
      return `<div class="gift">
        <div class="gift-icon">${itemIcon(it)}</div>
        <div class="gift-name">${it.name}</div>
        <div class="gift-en">${it.en}</div>
      </div>`;
    });
    const candies = Array.from(
      { length: reward.candy },
      (_, i) => `<span class="candy" style="animation-delay:${0.6 + i * 0.35}s">${candyIcon()}</span>`,
    ).join('');

    this.layer.innerHTML = `
      <div class="reward-card" role="dialog" aria-label="선물">
        <div class="reward-title">선물이에요!</div>
        <div class="gifts">${gifts.join('')}</div>
        ${reward.candy > 0 ? `<div class="candies">${candies}</div><div class="candy-label">별사탕 ${reward.candy}개</div>` : ''}
      </div>`;
    this.layer.hidden = false;
    this.shownAt = performance.now();

    // 읽어 주기: 선물 이름(한글) → 영어 → 별사탕 개수
    const lines: Array<{ text: string; lang: string }> = [];
    for (const id of reward.items) {
      const it = getItem(id);
      lines.push({ text: `${it.name}!`, lang: 'ko-KR' }, { text: `${it.en}!`, lang: 'en-US' });
    }
    if (reward.candy > 0) lines.push({ text: `별사탕 ${countWithUnit(reward.candy, '개')}!`, lang: 'ko-KR' });
    this.speakAll(lines);
  }

  close(): void {
    this.speaker.stop();
    this.layer.hidden = true;
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }

  private speakAll(lines: Array<{ text: string; lang: string }>, i = 0): void {
    if (i >= lines.length || this.layer.hidden) return;
    this.speaker.speak(lines[i].text, {
      lang: lines[i].lang,
      pitch: this.voice.pitch,
      rate: this.voice.rate,
      mood: 'excited',
      onEnd: () => this.speakAll(lines, i + 1),
    });
  }
}
