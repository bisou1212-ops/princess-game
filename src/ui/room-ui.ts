import { ROOMS, SURFACES, type SurfaceId } from '../systems/decor';
import { allCharacters, type Character } from '../systems/dialogue';
import { PALETTE } from '../systems/wardrobe';
import { checkIcon } from './icons';
import './room-ui.css';

/**
 * 성 안 방 화면의 위·옆 버튼 (GDD 5.2)
 * - 위 가운데: 방 고르기 (침실·드레스룸·파티홀)
 * - 오른쪽: 색칠(벽지·바닥·커튼 색) · 친구 초대
 * - 아래 패널: 색칠하기 / 초대할 친구 고르기 (패널이 열리면 가구 서랍은 숨김)
 */
export interface RoomUiHandlers {
  onRoom(roomId: string): void;
  onPaintOpen(): void;
  onPaintPart(part: SurfaceId): void;
  onPaintColor(color: string): void;
  onInviteOpen(): void;
  onInvite(characterId: string): void;
  /** 패널 닫기 (다 했어요) */
  onPanelClose(): void;
}

export class RoomUi {
  private readonly tabs: HTMLDivElement;
  private readonly side: HTMLDivElement;
  readonly panel: HTMLDivElement;

  constructor(parent: HTMLElement, private readonly h: RoomUiHandlers) {
    this.tabs = document.createElement('div');
    this.tabs.className = 'room-tabs';
    this.tabs.hidden = true;
    this.tabs.innerHTML = Object.entries(ROOMS)
      .map(
        ([id, r]) =>
          `<button type="button" class="rt-tab" data-room="${id}" aria-label="${r.name}">${roomIcon(r.icon)}<span>${r.name}</span></button>`,
      )
      .join('');
    this.tabs.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-room]');
      if (b && !b.classList.contains('is-on')) this.h.onRoom(b.dataset.room!);
    });

    this.side = document.createElement('div');
    this.side.className = 'room-side';
    this.side.hidden = true;
    this.side.innerHTML = `
      <button type="button" class="rs-btn rs-paint" data-act="paint" aria-label="색칠하기">${brushIcon()}</button>
      <button type="button" class="rs-btn rs-invite" data-act="invite" aria-label="친구 초대">${inviteIcon()}</button>`;
    this.side.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]')?.dataset.act;
      if (act === 'paint') this.h.onPaintOpen();
      else if (act === 'invite') this.h.onInviteOpen();
    });

    this.panel = document.createElement('div');
    this.panel.className = 'room-panel';
    this.panel.hidden = true;
    this.panel.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
      if (!b) return;
      const { act, value } = b.dataset;
      if (act === 'part' && value) this.h.onPaintPart(value as SurfaceId);
      else if (act === 'color' && value) this.h.onPaintColor(value);
      else if (act === 'friend' && value) this.h.onInvite(value);
      else if (act === 'close') this.h.onPanelClose();
    });

    parent.append(this.tabs, this.side, this.panel);
  }

  /** 방에 들어오면 보이기 (roomId 탭 강조), null이면 숨김 */
  show(roomId: string | null): void {
    this.tabs.hidden = roomId === null;
    this.side.hidden = roomId === null;
    if (roomId === null) this.panel.hidden = true;
    for (const b of this.tabs.querySelectorAll<HTMLButtonElement>('[data-room]')) {
      b.classList.toggle('is-on', b.dataset.room === roomId);
    }
  }

  /** 대화 중에는 버튼을 잠깐 숨김 */
  setButtonsVisible(on: boolean): void {
    this.tabs.classList.toggle('is-away', !on);
    this.side.classList.toggle('is-away', !on);
  }

  get isPanelOpen(): boolean {
    return !this.panel.hidden;
  }

  /** 색칠 패널: 왼쪽 부분 고르기 + 색 8개 */
  showPaint(part: SurfaceId, current: string | undefined): void {
    const parts = SURFACES.map(
      (s) =>
        `<button class="rp-part ${s.id === part ? 'is-on' : ''}" data-act="part" data-value="${s.id}" aria-label="${s.name}">${surfaceIcon(s.id)}<span>${s.name}</span></button>`,
    ).join('');
    const dots = PALETTE.map(
      (c) =>
        `<button class="dt-color ${c.id === current ? 'is-on' : ''}" data-act="color" data-value="${c.id}" style="--c:${c.hex}" aria-label="${c.name}"></button>`,
    ).join('');
    this.panel.className = 'room-panel is-paint';
    this.panel.innerHTML = `<div class="rp-parts">${parts}</div><div class="dt-colors">${dots}</div>
      <button class="dt-btn dt-done" data-act="close" aria-label="다 했어요">${checkIcon()}</button>`;
    this.panel.hidden = false;
  }

  /** 초대 패널: 친구 얼굴 카드 */
  showInvite(): void {
    const friends = Object.entries(allCharacters()).filter(([id]) => id !== 'princess');
    this.panel.className = 'room-panel is-invite';
    this.panel.innerHTML = `<div class="rp-friends">${friends
      .map(
        ([id, c]) =>
          `<button class="rp-friend" data-act="friend" data-value="${id}" aria-label="${c.name}">${faceIcon(c)}<span>${c.name}</span></button>`,
      )
      .join('')}</div>
      <button class="dt-btn dt-done" data-act="close" aria-label="닫기">${checkIcon()}</button>`;
    this.panel.hidden = false;
  }

  hidePanel(): void {
    this.panel.hidden = true;
  }
}

function roomIcon(kind: string): string {
  if (kind === 'dress')
    return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M26 8h12l-2 12 14 34H14l14-34z" fill="#c7b3ff"/><path d="M24 26h16" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="38" r="3" fill="#fff"/></svg>`;
  if (kind === 'party')
    return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 54 26 12l26 26z" fill="#ffd27a"/><path d="M18 34l12 12M22 24l18 18" stroke="#ff9ccf" stroke-width="4"/><circle cx="46" cy="12" r="4" fill="#74c0ff"/><circle cx="54" cy="26" r="3" fill="#ff9ccf"/><circle cx="38" cy="6" r="3" fill="#86d98f"/></svg>`;
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="6" y="30" width="52" height="16" rx="5" fill="#ff9ccf"/><rect x="6" y="18" width="10" height="34" rx="4" fill="#c99a74"/><rect x="48" y="26" width="10" height="26" rx="4" fill="#c99a74"/><rect x="18" y="22" width="16" height="10" rx="5" fill="#fff"/></svg>`;
}

function surfaceIcon(id: SurfaceId): string {
  if (id === 'floor')
    return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M4 40 32 26l28 14-28 14z" fill="#e9c9a8"/><path d="M18 33l28 14M25 29.5l28 14M11 36.5l28 14" stroke="#c99a74" stroke-width="2"/></svg>`;
  if (id === 'curtain')
    return `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="8" width="48" height="6" rx="3" fill="#c99a74"/><path d="M10 14h16c-2 14 2 28-6 40H10z" fill="#ff9ccf"/><path d="M54 14H38c2 14-2 28 6 40h10z" fill="#ff9ccf"/><rect x="26" y="14" width="12" height="30" fill="#bfe6ff"/></svg>`;
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="8" width="48" height="48" rx="6" fill="#fbe3ef"/><path d="M20 8v48M32 8v48M44 8v48" stroke="#ffc4e1" stroke-width="3"/><circle cx="26" cy="22" r="3" fill="#ff9ccf"/><circle cx="38" cy="40" r="3" fill="#ff9ccf"/></svg>`;
}

function brushIcon(): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M44 6l14 14-20 20-14-14z" fill="#fff"/><path d="M22 28l14 14c-4 10-14 16-28 14 4-4 2-12 6-18 2-4 5-8 8-10z" fill="#ffd27a"/></svg>`;
}

function inviteIcon(): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="6" y="16" width="52" height="36" rx="6" fill="#fff"/><path d="M8 20l24 18 24-18" fill="none" stroke="#ff9ccf" stroke-width="4" stroke-linejoin="round"/><path d="M32 46c-6-4-10-7-10-11a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 4-4 7-10 11z" fill="#ff6b9a"/></svg>`;
}

/** 친구 얼굴 그림 (몸 색 + 모양별 귀) */
function faceIcon(c: Character): string {
  const col = c.color;
  const eye = c.eyeColor ?? '#5a4a6b';
  const ears: Record<string, string> = {
    rabbit: `<ellipse cx="22" cy="12" rx="6" ry="14" fill="${col}"/><ellipse cx="42" cy="12" rx="6" ry="14" fill="${col}"/><ellipse cx="22" cy="13" rx="3" ry="9" fill="#ffc4e1"/><ellipse cx="42" cy="13" rx="3" ry="9" fill="#ffc4e1"/>`,
    bear: `<circle cx="16" cy="20" r="8" fill="${col}"/><circle cx="48" cy="20" r="8" fill="${col}"/>`,
    hedgehog: `<path d="M8 34 14 10l8 10 10-14 10 14 8-10 6 24z" fill="#8a6a4a"/>`,
    bird: `<path d="M30 8c2 4 6 4 6 10" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round"/>`,
    princess: `<path d="M20 14l4-8 8 6 8-6 4 8z" fill="#ffd76a"/><path d="M12 30c0-14 40-14 40 0v18H12z" fill="#b99cff"/>`,
  };
  const beak = c.model === 'bird' ? `<path d="M28 42h8l-4 5z" fill="#ffa64d"/>` : `<path d="M28 44q4 3 8 0" fill="none" stroke="#5a4a6b" stroke-width="2.5" stroke-linecap="round"/>`;
  return `<svg viewBox="0 0 64 64" aria-hidden="true">${ears[c.model] ?? ''}<circle cx="32" cy="36" r="20" fill="${c.model === 'princess' ? '#ffe2cf' : col}"/>
    <ellipse cx="24" cy="35" rx="4" ry="5" fill="${eye}"/><ellipse cx="40" cy="35" rx="4" ry="5" fill="${eye}"/>
    <circle cx="23" cy="33" r="1.6" fill="#fff"/><circle cx="39" cy="33" r="1.6" fill="#fff"/>
    <circle cx="18" cy="43" r="3" fill="#ffb3c8" opacity=".7"/><circle cx="46" cy="43" r="3" fill="#ffb3c8" opacity=".7"/>${beak}</svg>`;
}
