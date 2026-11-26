import type { Speaker } from '../core/tts';
import { sfx } from '../core/sound';
import { getCharacter } from '../systems/dialogue';
import { countingWord } from '../systems/items';
import { MINIGAMES } from '../systems/minigames';
import './minigame.css';

/**
 * 숨바꼭질 세기 화면: 공주가 눈을 가리고 "하나, 둘 … 열!" (큰 숫자가 하나씩 톡).
 * 그동안 친구는 장면에서 숨는다. 톡하면 조금 빨리 넘어감 (기다리기 힘든 아이를 위해).
 */
export class SeekCountdown {
  private readonly el: HTMLDivElement;
  private n = 0;
  private timer = 0;
  private onDone: (() => void) | null = null;

  constructor(parent: HTMLElement, private readonly speaker: Speaker) {
    this.el = document.createElement('div');
    this.el.className = 'seek-layer';
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.el.addEventListener('click', () => this.next());
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(onDone: () => void): void {
    const cfg = MINIGAMES.seek;
    this.onDone = onDone;
    this.n = 0;
    this.el.hidden = false;
    this.el.innerHTML = `<div class="seek-card">
      <div class="seek-eyes" aria-hidden="true">${eyesSvg()}</div>
      <div class="seek-title">${cfg.close}</div>
      <div class="seek-num"></div>
    </div>`;
    const v = getCharacter('princess').voice;
    this.speaker.speak(cfg.close, { ...v, mood: 'happy', onEnd: () => this.schedule(300) });
    this.schedule(2600); // 음성이 안 끝나도 넘어가게
  }

  private schedule(ms: number): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.next(), ms);
  }

  private next(): void {
    if (this.el.hidden) return;
    const total = MINIGAMES.seek.count;
    if (this.n >= total) return this.finish();
    this.n++;
    const num = this.el.querySelector<HTMLElement>('.seek-num');
    if (num) {
      num.textContent = String(this.n);
      num.classList.remove('is-pop');
      void num.offsetWidth;
      num.classList.add('is-pop');
    }
    sfx('count', this.n);
    const v = getCharacter('princess').voice;
    this.speaker.stop();
    this.speaker.speak(`${countingWord(this.n)}${this.n === total ? '!' : ''}`, { ...v, mood: this.n === total ? 'excited' : 'normal', onEnd: () => this.schedule(this.n === total ? 500 : 180) });
    this.schedule(1300);
  }

  private finish(): void {
    window.clearTimeout(this.timer);
    this.el.hidden = true;
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }

  close(): void {
    window.clearTimeout(this.timer);
    this.el.hidden = true;
    this.onDone = null;
  }
}

/** 눈을 가린 두 손 */
function eyesSvg(): string {
  return `<svg viewBox="0 0 200 120">
    <circle cx="100" cy="70" r="60" fill="#ffe7da"/>
    <path d="M70 66q10-8 20 0M110 66q10-8 20 0" fill="none" stroke="#5a4a6b" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="62" cy="64" rx="34" ry="26" fill="#ffd9c7" stroke="#fff" stroke-width="5" transform="rotate(-18 62 64)"/>
    <ellipse cx="138" cy="64" rx="34" ry="26" fill="#ffd9c7" stroke="#fff" stroke-width="5" transform="rotate(18 138 64)"/>
    <circle cx="70" cy="96" r="9" fill="#ff9ccf" opacity=".6"/><circle cx="130" cy="96" r="9" fill="#ff9ccf" opacity=".6"/>
  </svg>`;
}
