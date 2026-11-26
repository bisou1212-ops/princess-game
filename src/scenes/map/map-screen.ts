import type { Speaker } from '../../core/tts';
import { LOCATIONS, SLEEP_LINE, WAKE_LINE, canTravelTo, stickersToWake, type Location } from '../../systems/world';
import { stickerIcon } from '../../ui/sticker-icons';
import './map.css';

export interface MapScreenOptions {
  speaker: Speaker;
  voice: { lang: string; pitch: number; rate: number };
  /** 갈 수 있는 왕국을 골랐을 때 */
  onTravel(locationId: string): void;
  onClose(): void;
}

/**
 * 왕국 지도 (GDD 4.3: 지도에서 톡 → 날아가기).
 * 바다 위 섬들. 지금 있는 곳엔 왕관 표시, 아직 못 가는 왕국은 구름에 덮여 잠자고 있다.
 * 글을 못 읽어도 그림과 음성으로 알 수 있게 이름을 한글·영어로 읽어 준다.
 */
export class MapScreen {
  readonly el: HTMLDivElement;
  private current = '';

  constructor(
    parent: HTMLElement,
    private readonly opts: MapScreenOptions,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'map-screen';
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.map-close')) {
        this.opts.onClose();
        return;
      }
      const island = target.closest<HTMLButtonElement>('.map-island');
      if (island?.dataset.id) this.pick(island.dataset.id);
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(current: string): void {
    this.current = current;
    this.render();
    this.el.hidden = false;
  }

  close(): void {
    this.el.hidden = true;
    this.opts.speaker.stop();
  }

  private pick(id: string): void {
    const loc = LOCATIONS.find((l) => l.id === id);
    if (!loc) return;
    if (!canTravelTo(id)) {
      const n = stickersToWake(id);
      this.say(`${loc.name}!`, loc.en, n ? WAKE_LINE.replace('{n}', String(n)).replace('{name}', loc.name) : SLEEP_LINE);
      this.el.querySelector(`[data-id="${id}"]`)?.classList.add('is-wobble');
      setTimeout(() => this.el.querySelector(`[data-id="${id}"]`)?.classList.remove('is-wobble'), 600);
      return;
    }
    if (id === this.current) {
      this.say(`${loc.name}!`, loc.en, '지금 여기 있어요!');
      return;
    }
    this.say(`${loc.name}!`, loc.en);
    this.opts.onTravel(id);
  }

  /** 한글 이름 → 영어 이름 → (있으면) 덧붙이는 말 */
  private say(ko: string, en: string, after?: string): void {
    const { speaker, voice } = this.opts;
    speaker.speak(ko, {
      ...voice,
      mood: 'excited',
      onEnd: () =>
        speaker.speak(`${en}!`, {
          lang: 'en-US',
          pitch: voice.pitch,
          rate: voice.rate,
          mood: 'excited',
          onEnd: () => after && speaker.speak(after, { ...voice, mood: 'happy' }),
        }),
    });
  }

  private render(): void {
    const islands = LOCATIONS.map((l) => this.island(l)).join('');
    this.el.innerHTML = `
      <div class="map-sea">
        <svg class="map-waves" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M5 20q5-3 10 0t10 0M60 88q5-3 10 0t10 0M80 55q5-3 10 0t10 0M10 85q5-3 10 0t10 0M40 40q4-2 8 0t8 0" fill="none" stroke="#fff" stroke-width=".6" opacity=".7"/>
        </svg>
        ${islands}
      </div>
      <button class="map-close" type="button" aria-label="지도 닫기">${closeIcon()}</button>`;
  }

  private island(l: Location): string {
    const here = l.id === this.current;
    const open = canTravelTo(l.id);
    return `
      <button class="map-island ${open ? '' : 'is-sleeping'} ${here ? 'is-here' : ''}" data-id="${l.id}"
        style="left:${l.x}%;top:${l.y}%;--c:${l.color}" aria-label="${l.name}">
        <span class="mi-land">${locationIcon(l.icon)}</span>
        ${open ? '' : '<span class="mi-cloud" aria-hidden="true">z z</span>'}
        ${!open && stickersToWake(l.id) ? `<span class="mi-wake" aria-hidden="true">${stickerIcon('heart')}<b>${stickersToWake(l.id)}</b></span>` : ''}
        ${here ? `<span class="mi-here" aria-hidden="true">${crownIcon()}</span>` : ''}
        <span class="mi-name">${l.name}</span>
      </button>`;
  }
}

function locationIcon(icon: Location['icon']): string {
  const svg = (b: string) => `<svg viewBox="0 0 64 64" aria-hidden="true">${b}</svg>`;
  switch (icon) {
    case 'castle':
      return svg(`<path d="M12 56V26h8v-8h6v8h12v-8h6v8h8v30z" fill="#fff" stroke="#ff9ccf" stroke-width="3" stroke-linejoin="round"/>
        <path d="M14 26l3-10 3 10M44 26l3-10 3 10M29 18l3-12 3 12" fill="#ff9ccf"/><path d="M27 56V44a5 5 0 0 1 10 0v12z" fill="#c99a74"/>`);
    case 'flower':
      return svg(
        [0, 72, 144, 216, 288].map((a) => `<ellipse cx="32" cy="18" rx="10" ry="14" fill="#ff8fc4" transform="rotate(${a} 32 32)"/>`).join('') +
          '<circle cx="32" cy="32" r="9" fill="#ffd84d"/>',
      );
    case 'shell':
      return svg(`<path d="M32 10C14 10 6 30 10 48l22 8 22-8c4-18-4-38-22-38z" fill="#fff" stroke="#74c0ff" stroke-width="3"/><path d="M32 12v42M20 16l6 38M44 16l-6 38" stroke="#74c0ff" stroke-width="2"/>`);
    case 'snow':
      return svg(`<g stroke="#74c0ff" stroke-width="5" stroke-linecap="round"><path d="M32 8v48M11 20l42 24M11 44l42-24"/></g><circle cx="32" cy="32" r="6" fill="#fff"/>`);
    case 'star':
      return svg(`<path d="M32 6l8 16 18 3-13 12 3 18-16-9-16 9 3-18L6 25l18-3z" fill="#ffd84d" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>`);
  }
}

function crownIcon(): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 46l-2-28 13 12 11-18 11 18 13-12-2 28z" fill="#ffd76a" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>`;
}

function closeIcon(): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 18l28 28M46 18L18 46" stroke="#fff" stroke-width="8" stroke-linecap="round"/></svg>`;
}

export function mapIcon(): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M6 14l16-6 20 6 16-6v42l-16 6-20-6-16 6z" fill="#bfe6ff" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
    <path d="M22 8v42M42 14v42" stroke="#fff" stroke-width="3"/><circle cx="32" cy="30" r="6" fill="#ff8fc4"/><path d="M14 40q6-6 12 0" fill="none" stroke="#86d98f" stroke-width="4" stroke-linecap="round"/></svg>`;
}
