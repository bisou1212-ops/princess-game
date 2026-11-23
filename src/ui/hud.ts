import { candyIcon, flowerIcon } from './icons';
import './hud.css';

/**
 * 화면 위 고정 표시.
 * - 오른쪽 위: 별사탕 개수
 * - 가운데 위: 지금 모으는 부탁 (빈 칸이 하나씩 채워짐 → 수 세기)
 */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly candyEl: HTMLSpanElement;
  private readonly candyPill: HTMLDivElement;
  private readonly tracker: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-tracker" hidden></div>
      <div class="hud-candy" aria-label="별사탕">${candyIcon()}<span>0</span></div>`;
    parent.appendChild(this.root);
    this.candyPill = this.root.querySelector('.hud-candy')!;
    this.candyEl = this.candyPill.querySelector('span')!;
    this.tracker = this.root.querySelector('.hud-tracker')!;
  }

  setCandy(n: number, celebrate = false): void {
    this.candyEl.textContent = String(n);
    if (celebrate) bounce(this.candyPill);
  }

  /** 모으기 진행 표시. target=0이면 숨김 */
  setTracker(color: string, count: number, target: number, celebrate = false): void {
    if (target <= 0) {
      this.tracker.hidden = true;
      return;
    }
    this.tracker.hidden = false;
    const slots = Array.from({ length: target }, (_, i) =>
      `<span class="slot ${i < count ? 'is-filled' : ''}">${flowerIcon(i < count ? color : '#d9d4e2')}</span>`,
    ).join('');
    this.tracker.innerHTML = `${slots}<b class="tracker-count">${count}<small>/${target}</small></b>`;
    if (celebrate) {
      const filled = this.tracker.querySelectorAll('.slot')[count - 1];
      if (filled) bounce(filled as HTMLElement);
    }
  }
}

function bounce(el: HTMLElement): void {
  el.classList.remove('is-bouncing');
  void el.offsetWidth; // 애니메이션 다시 시작
  el.classList.add('is-bouncing');
}
