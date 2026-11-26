import type { Speaker } from '../core/tts';
import { sfx } from '../core/sound';
import { getCharacter } from '../systems/dialogue';
import { STICKERS, type StickerBook, type StickerDef } from '../systems/stickers';
import { checkIcon } from './icons';
import { stickerIcon } from './sticker-icons';
import './sticker-album.css';

/**
 * 스티커 앨범 (모으는 큰 목표). HUD 앨범 버튼 → 화면 가득 앨범.
 * - 붙은 스티커: 색칠된 동그란 스티커 + 이름. 톡하면 이름을 한글·영어로
 * - 아직 없는 스티커: 흐린 그림자 + "?" 와 얼마나 남았는지 띠. 톡하면 얻는 방법을 읽어 줌
 * - 새 스티커가 붙으면 화면 위에 "새 스티커!" 알림이 톡 (알림은 소리만, 말은 앨범에서)
 */
export class StickerAlbum {
  readonly el: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private toastTimer = 0;
  private queue: StickerDef[] = [];

  constructor(
    parent: HTMLElement,
    private readonly speaker: Speaker,
    private readonly book: StickerBook,
    private readonly onClose: () => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'album-panel';
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'close') this.onClose();
      else if (b.dataset.act === 'sticker') this.tapSticker(b.dataset.id!, b);
    });
    this.toast = document.createElement('div');
    this.toast.className = 'sticker-toast';
    this.toast.hidden = true;
    parent.appendChild(this.toast);
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    const total = STICKERS.length;
    const got = STICKERS.filter((s) => this.book.earned.has(s.id)).length;
    const cells = STICKERS.map((s) => {
      const has = this.book.earned.has(s.id);
      const isNew = this.book.unseen.has(s.id);
      const p = Math.round(this.book.progress(s) * 100);
      return `<button class="al-cell${has ? ' is-on' : ''}${isNew ? ' is-new' : ''}" data-act="sticker" data-id="${s.id}" aria-label="${has ? s.name : '아직 없는 스티커'}">
        <span class="al-badge">${stickerIcon(s.icon)}${has ? '' : '<span class="al-q">?</span>'}</span>
        <span class="al-name">${has ? s.name : '???'}</span>
        ${has ? '' : `<span class="al-bar"><i style="width:${p}%"></i></span>`}
      </button>`;
    }).join('');
    this.el.innerHTML = `<div class="al-head"><span class="al-round" aria-hidden="true" style="visibility:hidden"></span>
        <div class="al-title">스티커 앨범 <small>Sticker album</small></div>
        <button class="al-round al-close" data-act="close" aria-label="닫기">${checkIcon()}</button></div>
      <div class="al-count"><b>${got}</b> / ${total}</div>
      <div class="al-page">${cells}</div>`;
    this.el.hidden = false;
    sfx('page');
    const v = getCharacter('princess').voice;
    this.speaker.speak(got === 0 ? '스티커를 모아 봐요!' : `스티커 ${got}개!`, { ...v, mood: 'excited' });
    this.book.markSeen();
  }

  close(): void {
    this.speaker.stop();
    this.el.hidden = true;
  }

  private tapSticker(id: string, el: HTMLElement): void {
    const s = STICKERS.find((x) => x.id === id);
    if (!s) return;
    const v = getCharacter('princess').voice;
    this.speaker.stop();
    el.classList.remove('is-tap');
    void el.offsetWidth;
    el.classList.add('is-tap');
    if (this.book.earned.has(id)) {
      sfx('sparkle');
      this.speaker.speak(`${s.name}!`, { ...v, mood: 'excited', onEnd: () => this.speaker.speak(`${s.en}!`, { lang: 'en-US', pitch: v.pitch, rate: v.rate, mood: 'excited' }) });
    } else {
      sfx('tap');
      this.speaker.speak(s.hint, { ...v, mood: 'curious' });
    }
  }

  /** 새 스티커 알림 (여러 개면 차례로) */
  notify(s: StickerDef): void {
    this.queue.push(s);
    if (this.toast.hidden) this.showNext();
  }

  private showNext(): void {
    const s = this.queue.shift();
    if (!s) {
      this.toast.hidden = true;
      return;
    }
    this.toast.innerHTML = `<span class="st-badge">${stickerIcon(s.icon)}</span><span class="st-text"><small>새 스티커!</small>${s.name}</span>`;
    this.toast.hidden = false;
    this.toast.classList.remove('is-in');
    void this.toast.offsetWidth;
    this.toast.classList.add('is-in');
    sfx('sparkle');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.showNext(), 3200);
  }
}
