import type { Speaker } from '../core/tts';
import { getItem } from '../systems/items';
import {
  PALETTE,
  SLOTS,
  equip,
  getColor,
  getOutfitItem,
  itemsForSlot,
  setColor,
  type Outfit,
} from '../systems/wardrobe';
import { checkIcon, noneIcon, outfitIcon, slotIcon } from './icons';
import './wardrobe.css';

export interface WardrobeOptions {
  speaker: Speaker;
  voice: { lang: string; pitch: number; rate: number };
  /** 옷이 바뀔 때마다 (바로 입혀 보기 + 저장) */
  onChange(outfit: Outfit): void;
  onClose(): void;
}

/**
 * 드레스룸 (GDD 5.1·7): 부위 탭 → 옷 톡 → 바로 입힘, 색 동그라미 톡 → 색 변경.
 * 옷·색 이름은 한글과 영어로 읽어 준다 ("분홍! Pink!").
 */
export class WardrobePanel {
  readonly el: HTMLDivElement;
  private outfit: Outfit = {};
  private owned: string[] = [];
  private fresh = new Set<string>();
  private slot = SLOTS[0].id;

  constructor(
    parent: HTMLElement,
    private readonly opts: WardrobeOptions,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'wardrobe';
    this.el.hidden = true;
    parent.appendChild(this.el);

    this.el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
      if (!btn) return;
      const { act, value } = btn.dataset;
      if (act === 'slot' && value) this.selectSlot(value);
      else if (act === 'item') this.pickItem(value === '' ? null : (value ?? null));
      else if (act === 'color' && value) this.pickColor(value);
      else if (act === 'done') this.opts.onClose();
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(outfit: Outfit, owned: string[], fresh: string[]): void {
    this.outfit = structuredClone(outfit);
    this.owned = owned;
    this.fresh = new Set(fresh);
    // 새 옷이 있으면 그 부위부터 보여 준다
    const firstNew = fresh.map((id) => getOutfitItem(id)?.slot).find(Boolean);
    this.slot = firstNew ?? SLOTS[0].id;
    this.el.hidden = false;
    this.render();
  }

  close(): void {
    this.el.hidden = true;
    this.opts.speaker.stop();
  }

  private selectSlot(slot: string): void {
    this.slot = slot;
    this.render();
    const s = SLOTS.find((x) => x.id === slot)!;
    this.say([`${s.name}!`]);
  }

  private pickItem(itemId: string | null): void {
    this.outfit = equip(this.outfit, this.slot, itemId);
    if (itemId) this.fresh.delete(itemId);
    this.opts.onChange(this.outfit);
    this.render();
    if (itemId) {
      const it = getItem(itemId);
      this.say([`${it.name}!`], it.en);
    }
  }

  private pickColor(colorId: string): void {
    this.outfit = setColor(this.outfit, this.slot, colorId);
    this.opts.onChange(this.outfit);
    this.render();
    const c = getColor(colorId);
    this.say([`${c.name}!`], c.en);
  }

  /** 한글로 읽고, 있으면 이어서 영어로 */
  private say(ko: string[], en?: string): void {
    const { speaker, voice } = this.opts;
    const text = ko.join(' ');
    speaker.speak(text, {
      ...voice,
      mood: 'excited',
      onEnd: () => {
        if (en) speaker.speak(`${en}!`, { lang: 'en-US', pitch: voice.pitch, rate: voice.rate, mood: 'excited' });
      },
    });
  }

  private render(): void {
    const worn = this.outfit[this.slot];
    const slotDef = SLOTS.find((s) => s.id === this.slot)!;
    const wornColor = getColor(worn?.color ?? PALETTE[0].id);

    const tabs = SLOTS.map((s) => {
      const hasNew = itemsForSlot(s.id, this.owned).some((id) => this.fresh.has(id));
      return `<button class="wr-tab ${s.id === this.slot ? 'is-on' : ''}" data-act="slot" data-value="${s.id}" aria-label="${s.name}">
        ${slotIcon(s.id)}${hasNew ? '<span class="wr-new-dot"></span>' : ''}</button>`;
    }).join('');

    const items = itemsForSlot(this.slot, this.owned).map((id) => {
      const it = getOutfitItem(id)!;
      const on = worn?.item === id;
      const color = on ? wornColor.hex : getColor(it.defaultColor ?? PALETTE[0].id).hex;
      return `<button class="wr-item ${on ? 'is-on' : ''}" data-act="item" data-value="${id}" aria-label="${it.name}">
        ${outfitIcon(it.slot, it.shape, color)}
        ${this.fresh.has(id) ? '<span class="wr-new">NEW</span>' : ''}
      </button>`;
    });
    if (slotDef.optional) {
      items.unshift(
        `<button class="wr-item ${worn?.item === null ? 'is-on' : ''}" data-act="item" data-value="" aria-label="안 하기">${noneIcon()}</button>`,
      );
    }

    const colors = PALETTE.map(
      (c) => `<button class="wr-color ${worn?.color === c.id ? 'is-on' : ''}" data-act="color" data-value="${c.id}"
        style="--c:${c.hex}" aria-label="${c.name}"></button>`,
    ).join('');

    this.el.innerHTML = `
      <div class="wr-head">
        <div class="wr-tabs">${tabs}</div>
        <button class="wr-done" data-act="done" aria-label="다 입었어요">${checkIcon()}</button>
      </div>
      <div class="wr-items">${items.join('')}</div>
      <div class="wr-colors ${worn?.item ? '' : 'is-disabled'}">${colors}</div>`;
  }
}
