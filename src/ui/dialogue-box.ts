import type { Speaker } from '../core/tts';
import { DialogueSession, getCharacter, getDialogue, tokenize, type Choice, type DialogueLine } from '../systems/dialogue';
import { choiceIcon } from './icons';
import './dialogue-box.css';
import { sfx } from '../core/sound';

/**
 * 화면 아래 큰 말풍선 (GDD 7).
 * - 화면 아무 곳이나 톡 → 다음 대사 (마지막이면 닫힘)
 * - 스피커 버튼 → 다시 듣기
 * - 읽는 어절이 빛난다
 * - 질문 줄(choices)이면 그림 카드가 뜨고, 카드를 톡해야 넘어간다 (틀려도 힌트 후 다시 고르기)
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
  private readonly choicesEl: HTMLDivElement;
  /** 카드를 고르고 대답을 기다리는 중 (두 번 누르기 막기) */
  private choosing = false;

  /** 말풍선·카드가 화면 아래를 얼마나 가리는지(px) 알려 준다 → 장면을 위로 올려 친구 얼굴이 보이게 */
  onCover: ((px: number) => void) | null = null;

  constructor(parent: HTMLElement, private readonly speaker: Speaker) {
    this.layer = document.createElement('div');
    this.layer.className = 'dialogue-layer';
    this.layer.hidden = true;
    this.layer.innerHTML = `
      <div class="choices" hidden></div>
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
    this.choicesEl = this.layer.querySelector('.choices')!;
    this.choicesEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = (e.target as HTMLElement).closest<HTMLButtonElement>('.choice');
      const line = this.session?.current;
      const choice = line?.choices?.find((c) => c.id === card?.dataset.id);
      if (card && choice) this.pick(choice, card);
    });

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
    this.onCover?.(0);
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }

  private advance(): void {
    // 대사가 막 뜬 순간의 실수 톡은 무시. 질문 줄은 카드를 골라야 넘어간다
    if (!this.session || performance.now() - this.shownAt < 350) return;
    if (this.session.current?.choices?.length) return;
    const line = this.session.next();
    sfx('page');
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
    const choices = line.choices ?? [];
    this.choicesEl.hidden = choices.length === 0;
    this.choicesEl.innerHTML = choices
      .map(
        (c) => `<button class="choice" type="button" data-id="${c.id}" aria-label="${c.label}">
          <span class="choice-icon">${choiceIcon(c.icon)}</span>
          <span class="choice-label">${c.label}</span>${c.en ? `<span class="choice-en">${c.en}</span>` : ''}
        </button>`,
      )
      .join('');
    this.choosing = false;
    this.nextEl.classList.toggle('is-last', (this.session?.isLast ?? true) || choices.length > 0);
    this.shownAt = performance.now();
    this.reportCover();
    this.speakCurrent();
  }

  private reportCover(): void {
    if (!this.onCover) return;
    const bubble = this.layer.querySelector('.bubble')!.getBoundingClientRect();
    let top = bubble.top - 28; // 이름표
    if (!this.choicesEl.hidden) top = Math.min(top, this.choicesEl.getBoundingClientRect().top);
    this.onCover(Math.max(0, window.innerHeight - top));
  }

  /** 카드를 골랐을 때: 이름을 읽어 주고 → 대답 대사 → (틀렸으면) 같은 질문 다시 */
  private pick(choice: Choice, card: HTMLElement): void {
    if (this.choosing || !this.session) return;
    this.choosing = true;
    const correct = choice.correct !== false;
    card.classList.add(correct ? 'is-picked' : 'is-wobble');
    sfx(correct ? 'sparkle' : 'tap');
    const question = this.session.current!;
    const reply = choice.replyLines ?? (choice.reply ? getDialogue(choice.reply) : []);
    this.session.insertNext(correct ? reply : [...reply, question]);
    const voice = getCharacter('princess').voice;
    const go = () => {
      if (!this.session) return;
      const next = this.session.next();
      if (next) this.show(next);
      else this.close();
    };
    this.speaker.speak(`${choice.label}!`, {
      ...voice,
      mood: 'excited',
      onEnd: () =>
        choice.en
          ? this.speaker.speak(`${choice.en}!`, { lang: 'en-US', pitch: voice.pitch, rate: voice.rate, mood: 'excited', onEnd: go })
          : go(),
    });
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
      gender: voice.gender,
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
