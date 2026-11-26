import { doorIcon } from './decor-ui';
import { mapIcon } from '../scenes/map/map-screen';
import { candyIcon, itemIcon, wardrobeIcon } from './icons';
import { getItem } from '../systems/items';
import { gearIcon } from './parent-panel';
import { albumIcon } from './sticker-icons';
import './hud.css';
import { sfx } from '../core/sound';

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
  private readonly parentBtn: HTMLButtonElement;
  private readonly cardsBtn: HTMLButtonElement;
  private readonly albumBtn: HTMLButtonElement;
  private readonly viewEl: HTMLDivElement;
  private mode: 'yard' | 'room' = 'yard';
  private buttonsOn = true;

  constructor(
    parent: HTMLElement,
    handlers: { onWardrobe(): void; onExit(): void; onMap(): void; onParent(): void; onCards(): void; onAlbum(): void; onZoom(factor: number): void; onResetView(): void },
  ) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-tracker" hidden></div>
      <div class="hud-candy" aria-label="별사탕">${candyIcon()}<span>0</span></div>
      <button class="hud-wardrobe" type="button" aria-label="드레스룸">${wardrobeIcon()}</button>
      <button class="hud-wardrobe hud-exit" type="button" aria-label="마당으로 나가기" hidden>${doorIcon()}</button>
      <button class="hud-wardrobe hud-map" type="button" aria-label="지도">${mapIcon()}</button>
      <button class="hud-wardrobe hud-cards" type="button" aria-label="카드 짝 맞추기">${cardsIcon()}</button>
      <button class="hud-wardrobe hud-album" type="button" aria-label="스티커 앨범">${albumIcon()}</button>
      <button class="hud-parent" type="button" aria-label="부모 설정">${gearIcon()}</button>
      <div class="hud-view">
        <button class="hud-view-btn" type="button" data-zoom="in" aria-label="가까이">${zoomIcon(true)}</button>
        <button class="hud-view-btn" type="button" data-zoom="out" aria-label="멀리">${zoomIcon(false)}</button>
        <button class="hud-view-btn hud-view-reset" type="button" aria-label="처음 보던 대로">${resetViewIcon()}</button>
      </div>`;
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
    this.parentBtn = this.root.querySelector('.hud-parent')!;
    this.parentBtn.addEventListener('click', () => handlers.onParent());
    this.cardsBtn = this.root.querySelector('.hud-cards')!;
    this.cardsBtn.addEventListener('click', () => handlers.onCards());
    this.albumBtn = this.root.querySelector('.hud-album')!;
    this.albumBtn.addEventListener('click', () => handlers.onAlbum());
    // 보기: 돋보기 +·− (한 번 톡에 조금씩), 처음 보던 대로
    this.viewEl = this.root.querySelector('.hud-view')!;
    this.viewEl.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.hud-view-btn');
      if (!b) return;
      sfx('tap');
      if (b.dataset.zoom) handlers.onZoom(b.dataset.zoom === 'in' ? 0.8 : 1.25);
      else handlers.onResetView();
    });
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
    this.cardsBtn.hidden = !this.buttonsOn || this.mode !== 'yard';
    this.albumBtn.hidden = !this.buttonsOn || this.mode !== 'yard';
    // 부모 설정: 마당에서만 (방에서는 아래 가구 서랍과 겹침)
    this.parentBtn.hidden = !this.buttonsOn || this.mode !== 'yard';
    this.viewEl.hidden = !this.buttonsOn || this.mode !== 'yard';
  }

  /** 새로 깨어난 왕국이 있으면 지도 버튼에 반짝 점 */
  setMapNew(on: boolean): void {
    const dot = this.mapBtn.querySelector('.wr-new-dot');
    if (on && !dot) this.mapBtn.insertAdjacentHTML('beforeend', '<span class="wr-new-dot"></span>');
    if (!on) dot?.remove();
  }

  /** 앨범에 아직 안 본 새 스티커가 있으면 반짝 점 */
  setAlbumNew(on: boolean): void {
    const dot = this.albumBtn.querySelector('.wr-new-dot');
    if (on && !dot) this.albumBtn.insertAdjacentHTML('beforeend', '<span class="wr-new-dot"></span>');
    if (!on) dot?.remove();
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
    if (celebrate) {
      bounce(this.candyPill);
      sfx('coin');
    }
  }

  /** 모으기 진행 표시. target=0이면 숨김 */
  setTracker(itemId: string, count: number, target: number, celebrate = false): void {
    if (target <= 0) {
      this.tracker.hidden = true;
      return;
    }
    this.tracker.hidden = false;
    const slots = Array.from({ length: target }, (_, i) =>
      `<span class="slot ${i < count ? 'is-filled' : ''}">${slotIcon(itemId, i < count)}</span>`,
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

/** 진행 칸 그림: 채운 칸은 아이템 색, 빈 칸은 연회색 */
function slotIcon(itemId: string, filled: boolean): string {
  const it = getItem(itemId);
  return itemIcon(filled ? it : { ...it, color: '#d9d4e2' });
}

/** 돋보기 + / − */
function zoomIcon(plus: boolean): string {
  return `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="20" cy="20" r="13" fill="#e9f6ff" stroke="#7a6a9b" stroke-width="4.5"/><path d="M30 30l11 11" stroke="#7a6a9b" stroke-width="6" stroke-linecap="round"/><path d="M13 20h14${plus ? 'M20 13v14' : ''}" stroke="#ff7fb8" stroke-width="4.5" stroke-linecap="round"/></svg>`;
}

/** 처음 보던 대로: 빙글 화살표 + 눈 */
function resetViewIcon(): string {
  return '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M38 24a14 14 0 1 1-4.1-9.9" fill="none" stroke="#7a6a9b" stroke-width="4.5" stroke-linecap="round"/><path d="M36 6v10H26" fill="none" stroke="#7a6a9b" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="24" r="5" fill="#ff7fb8"/></svg>';
}

/** 카드 짝 맞추기 버튼: 겹친 카드 두 장 (하트·별) */
function cardsIcon(): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
    <rect x="8" y="12" width="28" height="40" rx="6" fill="#c9a8ff" stroke="#fff" stroke-width="3" transform="rotate(-12 22 32)"/>
    <path d="M22 27l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z" fill="#fff" transform="rotate(-12 22 32)"/>
    <rect x="28" y="12" width="28" height="40" rx="6" fill="#ff9ccf" stroke="#fff" stroke-width="3" transform="rotate(10 42 32)"/>
    <path d="M42 41c-6-4-8-7-8-9.5a3.8 3.8 0 0 1 8-1.6 3.8 3.8 0 0 1 8 1.6c0 2.5-2 5.5-8 9.5z" fill="#fff" transform="rotate(10 42 32)"/>
  </svg>`;
}
