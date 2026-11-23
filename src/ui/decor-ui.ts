import { PALETTE } from '../systems/wardrobe';
import { checkIcon } from './icons';
import './decor.css';

/**
 * 성 꾸미기 화면 아래쪽 (GDD 7: 가구는 아래 서랍에서 끌어다 놓기, 톡하면 돌리기·색·치우기)
 * - 서랍: 가진 가구 카드. 카드를 위로 끌면 방에 놓을 수 있다.
 * - 고른 가구 도구: 돌리기 / 색 8개 / 치우기(서랍으로) / 다 했어요
 */
export interface DrawerCard {
  item: string;
  left: number;
  thumb: string;
  name: string;
}

export interface DecorUiHandlers {
  /** 서랍 카드를 위로 끌기 시작 */
  onCardDrag(item: string, e: PointerEvent): void;
  onCardTap(item: string): void;
  onRotate(): void;
  onColor(color: string): void;
  onPutAway(): void;
  onDone(): void;
}

export class DecorUi {
  readonly drawer: HTMLDivElement;
  readonly tools: HTMLDivElement;

  constructor(parent: HTMLElement, private readonly h: DecorUiHandlers) {
    this.drawer = document.createElement('div');
    this.drawer.className = 'decor-drawer';
    this.drawer.hidden = true;
    this.tools = document.createElement('div');
    this.tools.className = 'decor-tools';
    this.tools.hidden = true;
    parent.append(this.drawer, this.tools);

    this.bindDrawer();
    this.tools.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
      if (!btn) return;
      const { act, value } = btn.dataset;
      if (act === 'rotate') this.h.onRotate();
      else if (act === 'color' && value) this.h.onColor(value);
      else if (act === 'away') this.h.onPutAway();
      else if (act === 'done') this.h.onDone();
    });
  }

  /** 서랍 카드 위에서 위쪽으로 끌면 가구 꺼내기, 옆으로 끌면 서랍 스크롤 */
  private bindDrawer(): void {
    let start: { id: number; x: number; y: number; item: string; done: boolean } | null = null;
    this.drawer.addEventListener('pointerdown', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.dc-card');
      if (!card || card.classList.contains('is-empty')) return;
      start = { id: e.pointerId, x: e.clientX, y: e.clientY, item: card.dataset.item!, done: false };
    });
    this.drawer.addEventListener('pointermove', (e) => {
      if (!start || start.done || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      // 위쪽으로(비스듬히도) 끌면 꺼내기, 거의 옆으로만 끌면 서랍 스크롤
      if (dy < -10 && Math.abs(dy) > Math.abs(dx) * 0.5) {
        start.done = true;
        this.h.onCardDrag(start.item, e);
      }
    });
    const end = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const wasTap = !start.done && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 12;
      const item = start.item;
      start = null;
      if (wasTap && e.type === 'pointerup') this.h.onCardTap(item);
    };
    this.drawer.addEventListener('pointerup', end);
    this.drawer.addEventListener('pointercancel', end);
  }

  setCards(cards: DrawerCard[]): void {
    this.drawer.innerHTML = `<div class="dc-hint" aria-hidden="true">▲</div><div class="dc-row">${cards
      .map(
        (c) => `<div class="dc-card ${c.left <= 0 ? 'is-empty' : ''}" data-item="${c.item}" role="button" aria-label="${c.name}">
          <img src="${c.thumb}" alt="" draggable="false">
          ${c.left > 1 ? `<span class="dc-count">${c.left}</span>` : ''}
        </div>`,
      )
      .join('')}</div>`;
  }

  /** 가구를 골랐을 때 도구 표시 (현재 색 강조) */
  showTools(color: string | null): void {
    if (color === null) {
      this.tools.hidden = true;
      return;
    }
    this.tools.hidden = false;
    const dots = PALETTE.map(
      (c) => `<button class="dt-color ${c.id === color ? 'is-on' : ''}" data-act="color" data-value="${c.id}" style="--c:${c.hex}" aria-label="${c.name}"></button>`,
    ).join('');
    this.tools.innerHTML = `
      <button class="dt-btn dt-rotate" data-act="rotate" aria-label="돌리기">${rotateIcon()}</button>
      <div class="dt-colors">${dots}</div>
      <button class="dt-btn dt-away" data-act="away" aria-label="치우기">${awayIcon()}</button>
      <button class="dt-btn dt-done" data-act="done" aria-label="다 했어요">${checkIcon()}</button>`;
  }

  setVisible(on: boolean): void {
    this.drawer.hidden = !on;
    if (!on) this.tools.hidden = true;
  }

  /** 손가락이 서랍 위에 있으면 true (여기에 놓으면 다시 넣기) */
  isOverDrawer(clientY: number): boolean {
    if (this.drawer.hidden) return false;
    return clientY >= this.drawer.getBoundingClientRect().top;
  }

  /** 아래쪽 UI 높이 (카메라 화면 중심 맞추기용) */
  get bottomHeight(): number {
    const el = this.tools.hidden ? this.drawer : this.tools;
    return el.hidden ? 0 : el.getBoundingClientRect().height;
  }
}

function rotateIcon(): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M48 30a16 16 0 1 1-6-12" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/><path d="M44 6l2 16-16-2z" fill="#fff"/></svg>`;
}

function awayIcon(): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 28h44l-4 26H14z" fill="#fff"/><path d="M8 22h48v8H8z" fill="#fff" opacity=".8"/><path d="M32 4v16M24 12l8 8 8-8" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function doorIcon(): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 58V14a18 18 0 0 1 36 0v44z" fill="#c99a74" stroke="#fff" stroke-width="3"/><circle cx="41" cy="36" r="3.5" fill="#ffd76a"/><path d="M22 16a10 10 0 0 1 20 0" fill="none" stroke="#fff" stroke-width="3" opacity=".6"/></svg>`;
}
