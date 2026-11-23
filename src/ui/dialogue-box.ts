import type { Speaker } from '../core/tts';
import { DialogueSession, getCharacter, tokenize, type DialogueLine } from '../systems/dialogue';
import './dialogue-box.css';

/**
 * 화면 아래 큰 말풍선 (GDD 7).
 * - 화면 아무 곳이나 톡 → 다음 대사 (마지막이면 닫힘)
 * - 스피커 버튼 → 다시 듣기
 * - 읽는 어절이 빛난다
 */
export class DialogueBox {
  private readonly layer: HTMLDivElement;
  private readonly nameEl: HTMLDivElement;
  private readonly textEl: HTMLParagraphElement;
  private readonly nextEl: HTMLDivElement;
  private session: DialogueSession | null = null;
  private onClose: (() => void) | null = null;
  private words: HTMLSpanElement[] = [];
  private shownAt = 0;

  constructor(parent: HTMLElement, private readonly speaker: Speaker) {
    this.layer = document.createElement('div');
    this.layer.className = 'dialogue-layer';
    this.layer.hidden = true;
    this.layer.innerHTML = `
      <div class="bubble" role="dialog" aria-live="polite">
        <div class="bubble-name"></div>
        <p class="bubble-text"></p>
        <button class="bubble-replay" type="button" aria-label="다시 듣기">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
        <div class="bubble-next" aria-hidden="true">▼</div>
      </div>`;
    parent.appendChild(this.layer);
    this.nameEl = this.layer.querySelector('.bubble-name')!;
    this.textEl = this.layer.querySelector('.bubble-text')!;
    this.nextEl = this.layer.querySelector('.bubble-next')!;

    this.layer.addEventListener('click', () => this.advance());
    this.layer.querySelector('.bubble-replay')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.speakCurrent();
    });
  }

  get isOpen(): boolean {
    return this.session !== null;
  }

  open(lines: DialogueLine[], onClose?: () => void): void {
    if (lines.length === 0) return;
    this.session = new DialogueSession(lines);
    this.onClose = onClose ?? null;
    this.layer.hidden = false;
    this.show(this.session.current!);
  }

  close(): void {
    this.speaker.stop();
    this.session = null;
    this.layer.hidden = true;
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }

  private advance(): void {
    // 대사가 막 뜬 순간의 실수 톡은 무시
    if (!this.session || performance.now() - this.shownAt < 350) return;
    const line = this.session.next();
    if (line) this.show(line);
    else this.close();
  }

  private show(line: DialogueLine): void {
    const who = getCharacter(line.speaker);
    this.nameEl.textContent = who.name;
    this.layer.style.setProperty('--speaker-color', who.color);

    this.textEl.replaceChildren();
    this.words = [];
    let cursor = 0;
    for (const tok of tokenize(line.text)) {
      if (tok.start > cursor) this.textEl.append(line.text.slice(cursor, tok.start));
      const span = document.createElement('span');
      span.className = 'word';
      span.textContent = tok.text;
      this.textEl.append(span);
      this.words.push(span);
      cursor = tok.end;
    }
    this.nextEl.classList.toggle('is-last', this.session?.isLast ?? true);
    this.shownAt = performance.now();
    this.speakCurrent();
  }

  private speakCurrent(): void {
    const line = this.session?.current;
    if (!line) return;
    const voice = getCharacter(line.speaker).voice;
    this.highlight(-1);
    this.speaker.speak(line.text, {
      lang: line.lang ?? voice.lang,
      pitch: voice.pitch,
      rate: voice.rate,
      mood: line.mood,
      onWord: (i) => this.highlight(i),
      onEnd: () => this.highlight(-1),
    });
  }

  private highlight(index: number): void {
    this.words.forEach((w, i) => {
      w.classList.toggle('is-reading', i === index);
      w.classList.toggle('is-read', index >= 0 && i < index);
    });
  }
}
