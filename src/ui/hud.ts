import { doorIcon } from './decor-ui';
import { mapIcon } from '../scenes/map/map-screen';
import { candyIcon, flowerIcon, wardrobeIcon } from './icons';
import './hud.css';

/**
 * 화면 위 고정 표시.
 * - 오른쪽 위: 별사탕 개수
 * - 가운데 위: 지금 모으는 부탁 (빈 칸이 하나씩 채워짐 → 수 세기)
 * - 왼쪽 위: 드레스룸·지도 버튼 (GDD 7 고정 아이콘), 새 옷이 있으면 반짝 점
 */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly candyEl: HTMLSpanElement;
  private readonly candyPill: HTMLDivElement;
  private readonly tracker: HTMLDivElement;
  private readonly wardrobeBtn: HTMLButtonElement;
  private readonly exitBtn: HTMLButtonElement;
  private readonly mapBtn: HTMLButtonElement;
  private mode: 'yard' | 'room' = 'yard';
  private buttonsOn = true;

  constructor(parent: HTMLElement, handlers: { onWardrobe(): void; onExit(): void; onMap(): void }) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-tracker" hidden></div>
      <div class="hud-candy" aria-label="별사탕">${candyIcon()}<span>0</span></div>
      <button class="hud-wardrobe" type="button" aria-label="드레스룸">${wardrobeIcon()}</button>
      <button class="hud-wardrobe hud-exit" type="button" aria-label="마당으로 나가기" hidden>${doorIcon()}</button>
      <button class="hud-wardrobe hud-map" type="button" aria-label="지도">${mapIcon()}</button>`;
    parent.appendChild(this.root);
    this.candyPill = this.root.querySelector('.hud-candy')!;
    this.candyEl = this.candyPill.querySelector('span')!;
    this.tracker = this.root.querySelector('.hud-tracker')!;
    this.wardrobeBtn = this.root.querySelector('.hud-wardrobe')!;
    this.wardrobeBtn.addEventListener('click', () => handlers.onWardrobe());
    this.exitBtn = this.root.querySelector('.hud-exit')!;
    this.exitBtn.addEventListener('click', () => handlers.onExit());
    this.mapBtn = this.root.querySelector('.hud-map')!;
    this.mapBtn.addEventListener('click', () => handlers.onMap());
  }

  /** 마당: 드레스룸 버튼·부탁 표시 / 방: 나가기 버튼 */
  setMode(mode: 'yard' | 'room'): void {
    this.mode = mode;
    this.root.classList.toggle('is-room', mode === 'room');
    this.applyButtons();
  }

  private applyButtons(): void {
    this.wardrobeBtn.hidden = !this.buttonsOn || this.mode !== 'yard';
    this.exitBtn.hidden = !this.buttonsOn || this.mode !== 'room';
    this.mapBtn.hidden = !this.buttonsOn || this.mode !== 'yard';
  }

  /** 드레스룸에 아직 안 본 새 옷이 있으면 반짝 점 */
  setWardrobeNew(on: boolean): void {
    const dot = this.wardrobeBtn.querySelector('.wr-new-dot');
    if (on && !dot) this.wardrobeBtn.insertAdjacentHTML('beforeend', '<span class="wr-new-dot"></span>');
    if (!on) dot?.remove();
  }

  /** 드레스룸·대화 중에는 숨김 */
  setButtonsVisible(on: boolean): void {
    this.buttonsOn = on;
    this.applyButtons();
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
