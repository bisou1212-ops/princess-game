import type { Speaker } from '../core/tts';
import { getCharacter, type DialogueLine } from '../systems/dialogue';
import { gearIcon } from './parent-panel';
import './bedtime.css';

/**
 * 잠자리 장면 (M9-2, GDD 4-8: 부모가 정한 시간이 되면 공주와 펫이 잠자리에 드는 장면으로 끝).
 * 밤하늘·달·반짝이는 별 아래 침대에서 공주와 펫이 눈을 감고 쿨쿨. 대사는 글자 + 음성.
 * 아이가 할 수 있는 건 없다 (실패·벌점 없이 자연스럽게 끝). 오른쪽 아래 작은 톱니 = 어른만 "조금 더 놀기".
 */
export class BedtimeScreen {
  readonly el: HTMLDivElement;
  private shown = false;

  constructor(
    parent: HTMLElement,
    private readonly d: { speaker: Speaker; onAdult(): void },
  ) {
    this.el = document.createElement('div');
    this.el.className = 'bedtime';
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-act="adult"]')) this.d.onAdult();
    });
  }

  get isOpen(): boolean {
    return this.shown;
  }

  show(pics: { princess: string; pet: string | null }, lines: DialogueLine[]): void {
    this.shown = true;
    this.el.hidden = false;
    const stars = Array.from({ length: 22 }, (_, i) => {
      const x = (i * 37 + 11) % 100;
      const y = (i * 23 + 7) % 55;
      return `<i class="bt-star" style="left:${x}%;top:${y}%;animation-delay:${(i % 7) * 0.4}s"></i>`;
    }).join('');
    this.el.innerHTML = `${stars}
      <div class="bt-moon"></div>
      <div class="bt-bed">
        <div class="bt-head"></div>
        <div class="bt-pillow"></div>
        <img class="bt-princess" src="${pics.princess}" alt="" draggable="false">
        ${pics.pet ? `<img class="bt-pet" src="${pics.pet}" alt="" draggable="false">` : ''}
        <div class="bt-blanket"></div>
        <div class="bt-zzz"><b>Z</b><b>z</b><b>z</b></div>
      </div>
      <p class="bt-say"></p>
      <button class="bt-adult" data-act="adult" aria-label="부모 설정">${gearIcon()}</button>`;
    this.say(lines);
  }

  hide(): void {
    this.shown = false;
    this.d.speaker.stop();
    this.el.hidden = true;
    this.el.innerHTML = '';
  }

  private say(lines: DialogueLine[]): void {
    const box = this.el.querySelector('.bt-say');
    const next = (i: number) => {
      const line = lines[i];
      if (!line || !this.shown) return;
      if (box) box.textContent = line.text;
      const v = getCharacter(line.speaker).voice;
      // 잠자리라 조금 느리고 낮게
      this.d.speaker.speak(line.text, { lang: line.lang ?? v.lang, pitch: v.pitch - 0.05, rate: v.rate * 0.9, mood: line.mood, onEnd: () => window.setTimeout(() => next(i + 1), 500) });
    };
    next(0);
  }
}
