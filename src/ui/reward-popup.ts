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
      <div class="confetti" aria-hidden="true">${confetti()}</div>
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

/** 축하 색종이 (G2): 파스텔 색 조각·별·하트가 위에서 살랑살랑 떨어진다. CSS 애니메이션이라 3D 비용 없음 */
const CONFETTI_COLORS = ['#ff9ccf', '#ffd36e', '#9fd8ff', '#b9f0a8', '#d7b4ff', '#ffb38a'];
function confetti(n = 42): string {
  let out = '';
  for (let i = 0; i < n; i++) {
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    const shape = i % 7 === 0 ? 'star' : i % 9 === 0 ? 'heart' : i % 2 === 0 ? 'strip' : 'dot';
    const left = Math.random() * 100;
    const delay = Math.random() * 0.9;
    const dur = 2.6 + Math.random() * 1.8;
    const sway = (Math.random() * 2 - 1) * 60;
    const spin = (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540);
    const style = `left:${left.toFixed(1)}%;--c:${color};--sway:${sway.toFixed(0)}px;--spin:${spin.toFixed(0)}deg;animation-duration:${dur.toFixed(2)}s;animation-delay:${delay.toFixed(2)}s`;
    out += shape === 'star' ? `<i class="cf cf-star" style="${style}">★</i>` : shape === 'heart' ? `<i class="cf cf-heart" style="${style}">♥</i>` : `<i class="cf cf-${shape}" style="${style}"></i>`;
  }
  return out;
}
