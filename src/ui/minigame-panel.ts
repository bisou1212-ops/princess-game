import type { Speaker } from '../core/tts';
import { sfx } from '../core/sound';
import { getCharacter, type Mood } from '../systems/dialogue';
import { countingWord, getItem } from '../systems/items';
import { MINIGAMES, MemoryGame, makeDeck, type Card } from '../systems/minigames';
import { fillText, type QuestVars } from '../systems/random-quests';
import { checkIcon, itemIcon } from './icons';
import './minigame.css';

/**
 * 미니게임 화면 (화면 가득, 실패·시간 제한 없음, 언제든 닫기 가능).
 * - 케이크 꾸미기(도치): 과일을 끌어서(또는 톡) 케이크 위에 올리며 "하나! 둘!"
 * - 꽃밭 물 주기(고고): 물뿌리개를 새싹 위로 끌면(또는 새싹 톡) 물이 똑똑 → 꽃이 활짝
 * - 카드 짝 맞추기(마당 버튼): 두 장 톡, 같으면 이름을 한글·영어로. 판마다 친구 얼굴·그림 번갈아
 * 글·말은 src/data/minigames.json, 로직은 src/systems/minigames.ts
 */
export interface MiniGamePanelDeps {
  speaker: Speaker;
  /** 친구 얼굴 사진 (카드용) */
  portrait(id: string): string | null;
  onClose(): void;
}

type Mode = 'cake' | 'garden' | 'cards';

export class MiniGamePanel {
  readonly el: HTMLDivElement;
  private mode: Mode = 'cards';
  private target = 0;
  private done = 0;
  private finished = false;
  private onDone: (() => void) | null = null;
  private item = '';
  private giver = 'princess';
  private vars: QuestVars = {};
  // 끌기
  private drag: { el: HTMLElement; ghost: HTMLElement; sx: number; sy: number; moved: boolean } | null = null;
  // 물 주기: 새싹마다 받은 물
  private water = new Map<HTMLElement, number>();
  private lastWaterAt = 0;
  // 카드
  private memory: MemoryGame | null = null;
  private level = 0;
  private onCards: ((candy: number) => void) | null = null;
  private timers: number[] = [];

  constructor(parent: HTMLElement, private readonly d: MiniGamePanelDeps) {
    this.el = document.createElement('div');
    this.el.className = 'mg-panel';
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'close') this.d.onClose();
      else if (act === 'again') this.nextCards();
      else if (act === 'card') this.flipCard(Number(b.dataset.i));
      else if (act === 'sprout' && this.mode === 'garden') this.waterSprout(b, 3);
    });
    this.el.addEventListener('pointerdown', (e) => this.down(e));
    this.el.addEventListener('pointermove', (e) => this.move(e));
    this.el.addEventListener('pointerup', (e) => this.up(e));
    this.el.addEventListener('pointercancel', () => this.cancelDrag());
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  close(): void {
    this.d.speaker.stop();
    this.cancelDrag();
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    this.el.hidden = true;
  }

  // ── 케이크 꾸미기 ──

  openCake(item: string, count: number, giver: string, vars: QuestVars, onDone: () => void): void {
    this.begin('cake', item, count, giver, vars, onDone);
    const cfg = MINIGAMES.cake;
    const it = getItem(item);
    const spots = cakeSpots(count)
      .map(([x, y], i) => `<span class="mg-spot" data-i="${i}" style="left:${x}%;top:${y}%">${itemIcon(it)}</span>`)
      .join('');
    const tray = Array.from({ length: count + cfg.extra }, () => `<button class="mg-fruit" data-drag="fruit" aria-label="${it.name}">${itemIcon(it)}</button>`).join('');
    this.el.innerHTML = `${this.head(cfg.title, cfg.en)}
      ${this.slots(count, itemIcon(it))}
      <div class="mg-stage"><div class="mg-cake" data-drop="cake">${cakeSvg()}${spots}</div></div>
      <div class="mg-say"></div>
      <div class="mg-tray">${tray}</div>`;
    this.say(this.fill(cfg.start), giver);
  }

  // ── 꽃밭 물 주기 ──

  openGarden(item: string, count: number, giver: string, vars: QuestVars, onDone: () => void): void {
    this.begin('garden', item, count, giver, vars, onDone);
    const cfg = MINIGAMES.garden;
    const it = getItem(item);
    this.water.clear();
    const sprouts = Array.from(
      { length: count },
      (_, i) => `<button class="mg-sprout" data-act="sprout" data-i="${i}" aria-label="새싹">${sproutSvg()}<span class="mg-bloom">${itemIcon(it)}</span><span class="mg-drops"></span></button>`,
    ).join('');
    this.el.innerHTML = `${this.head(cfg.title, cfg.en)}
      ${this.slots(count, itemIcon(it))}
      <div class="mg-stage mg-bed">${sprouts}</div>
      <div class="mg-say"></div>
      <div class="mg-tray"><button class="mg-can" data-drag="can" aria-label="물뿌리개">${canSvg()}</button></div>`;
    this.say(this.fill(cfg.start), giver);
  }

  // ── 카드 짝 맞추기 ──

  openCards(onCards: (candy: number) => void): void {
    this.onCards = onCards;
    this.level = 0;
    this.mode = 'cards';
    this.el.hidden = false;
    this.startCards();
  }

  private nextCards(): void {
    this.level++;
    this.startCards();
  }

  private startCards(): void {
    const cfg = MINIGAMES.cards;
    this.finished = false;
    const pairs = cfg.levels[Math.min(this.level, cfg.levels.length - 1)];
    const kind = this.level % 2 === 0 ? 'friend' : 'thing';
    this.memory = new MemoryGame(makeDeck(pairs, kind));
    const cols = pairs * 2 <= 8 ? 4 : 6;
    const cards = this.memory.cards
      .map(
        (c, i) => `<button class="mg-card" data-act="card" data-i="${i}" aria-label="카드">
          <span class="mg-card-in"><span class="mg-back">${starSvg()}</span><span class="mg-front">${this.cardFace(c)}<span class="mg-name">${this.cardName(c)}</span></span></span>
        </button>`,
      )
      .join('');
    this.el.innerHTML = `${this.head(cfg.title, cfg.en)}
      <div class="mg-stage"><div class="mg-cards" style="--cols:${cols}">${cards}</div></div>
      <div class="mg-say"></div>
      <div class="mg-tray mg-again-row"></div>`;
    this.say(cfg.start, 'princess');
  }

  private cardFace(c: Card): string {
    if (c.kind === 'friend') {
      const url = this.d.portrait(c.face);
      return url ? `<img src="${url}" alt="" draggable="false">` : `<span class="mg-initial" style="background:${getCharacter(c.face).color}">${getCharacter(c.face).name.slice(0, 1)}</span>`;
    }
    return itemIcon(getItem(c.face));
  }

  private cardName(c: Card): string {
    return c.kind === 'friend' ? getCharacter(c.face).name : getItem(c.face).name;
  }

  private flipCard(i: number): void {
    const g = this.memory;
    if (!g || this.finished) return;
    const r = g.flip(i);
    if (r.type === 'ignored') return;
    sfx('page');
    this.cardEl(i)?.classList.add('is-up');
    if (r.type === 'miss') {
      this.say(MINIGAMES.cards.miss, 'princess', 'curious');
      this.later(() => {
        g.hide();
        for (const k of [r.a, r.b]) this.cardEl(k)?.classList.remove('is-up');
      }, 1100);
      return;
    }
    if (r.type !== 'match') return;
    for (const k of [r.a, r.b]) this.cardEl(k)?.classList.add('is-match');
    sfx('sparkle');
    const c = g.cards[r.a];
    // 이름을 한글·영어로 (친구는 이름만)
    const en = c.kind === 'thing' ? getItem(c.face).en : '';
    const v = getCharacter('princess').voice;
    const box = this.el.querySelector('.mg-say');
    if (box) box.textContent = en ? `${this.cardName(c)}! ${en}!` : `${this.cardName(c)}!`;
    this.d.speaker.stop();
    this.d.speaker.speak(`${this.cardName(c)}!`, {
      ...v,
      mood: 'excited',
      onEnd: () => (en && !r.done ? this.d.speaker.speak(`${en}!`, { lang: 'en-US', pitch: v.pitch, rate: v.rate, mood: 'excited' }) : undefined),
    });
    if (!r.done) return;
    this.finished = true;
    this.later(() => {
      sfx('reward');
      this.say(MINIGAMES.cards.done, 'princess', 'excited');
      this.el.querySelector('.mg-cards')?.classList.add('is-done');
      const row = this.el.querySelector('.mg-again-row');
      if (row) row.innerHTML = `<button class="mg-again" data-act="again">${MINIGAMES.cards.again}</button>`;
      this.onCards?.(MINIGAMES.cards.candy);
    }, 900);
  }

  private cardEl(i: number): HTMLElement | null {
    return this.el.querySelector(`.mg-card[data-i="${i}"]`);
  }

  // ── 끌기 (과일·물뿌리개) ──

  private down(e: PointerEvent): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-drag]');
    if (!el || this.finished || el.classList.contains('is-used')) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.classList.add('mg-ghost');
    ghost.style.width = `${r.width}px`;
    ghost.style.height = `${r.height}px`;
    document.body.appendChild(ghost);
    this.drag = { el, ghost, sx: e.clientX, sy: e.clientY, moved: false };
    el.classList.add('is-lifted');
    this.place(e.clientX, e.clientY);
  }

  private move(e: PointerEvent): void {
    const g = this.drag;
    if (!g) return;
    if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 12) g.moved = true;
    this.place(e.clientX, e.clientY);
    if (g.el.dataset.drag === 'can') {
      g.ghost.classList.add('is-pouring');
      // 물뿌리개 주둥이(왼쪽 아래) 밑의 새싹에 물
      const sprout = this.under(e.clientX - 40, e.clientY + 30, '.mg-sprout');
      if (sprout) {
        const now = performance.now();
        if (now - this.lastWaterAt > 120) {
          this.lastWaterAt = now;
          this.waterSprout(sprout, 1);
        }
      }
    }
  }

  private up(e: PointerEvent): void {
    const g = this.drag;
    if (!g) return;
    this.drag = null;
    g.ghost.remove();
    g.el.classList.remove('is-lifted');
    if (g.el.dataset.drag !== 'fruit') return;
    // 과일: 케이크 위에 놓거나, 끌지 않고 톡만 해도 케이크로 쏙
    const onCake = !!this.under(e.clientX, e.clientY, '.mg-cake');
    if (onCake || !g.moved) this.addFruit(g.el);
    else sfx('tap');
  }

  private cancelDrag(): void {
    if (!this.drag) return;
    this.drag.ghost.remove();
    this.drag.el.classList.remove('is-lifted');
    this.drag = null;
  }

  private place(x: number, y: number): void {
    const g = this.drag;
    if (!g) return;
    g.ghost.style.left = `${x}px`;
    g.ghost.style.top = `${y}px`;
  }

  private under(x: number, y: number, sel: string): HTMLElement | null {
    for (const el of document.elementsFromPoint(x, y)) {
      const hit = (el as HTMLElement).closest?.(sel) as HTMLElement | null;
      if (hit && this.el.contains(hit)) return hit;
    }
    return null;
  }

  private addFruit(fruit: HTMLElement): void {
    if (this.finished || fruit.classList.contains('is-used')) return;
    fruit.classList.add('is-used');
    this.el.querySelector(`.mg-spot[data-i="${this.done}"]`)?.classList.add('is-on');
    this.count();
  }

  private waterSprout(sprout: HTMLElement, amount: number): void {
    if (this.finished || sprout.classList.contains('is-bloom')) return;
    const n = (this.water.get(sprout) ?? 0) + amount;
    this.water.set(sprout, n);
    sprout.classList.add('is-wet');
    const drops = sprout.querySelector('.mg-drops');
    if (drops) {
      const d = document.createElement('i');
      d.style.left = `${30 + Math.random() * 40}%`;
      drops.appendChild(d);
      this.later(() => d.remove(), 700);
    }
    if (n < 4) {
      if (amount > 1 || n === 1) sfx('bubble');
      return;
    }
    sprout.classList.add('is-bloom');
    this.count(MINIGAMES.garden.grow);
  }

  // ── 공통 ──

  private begin(mode: Mode, item: string, count: number, giver: string, vars: QuestVars, onDone: () => void): void {
    this.close();
    this.mode = mode;
    this.item = item;
    this.target = count;
    this.done = 0;
    this.finished = false;
    this.giver = giver;
    this.vars = vars;
    this.onDone = onDone;
    this.el.hidden = false;
  }

  /** 하나 더! "하나! 둘!" 세기, 다 되면 끝 */
  private count(extra?: string): void {
    this.done++;
    this.el.querySelector(`.mg-slot[data-i="${this.done - 1}"]`)?.classList.add('is-full');
    sfx('count', this.done);
    const v = getCharacter('princess').voice;
    this.d.speaker.stop();
    if (this.done < this.target) {
      this.d.speaker.speak(`${countingWord(this.done)}!${extra && this.mode === 'garden' ? ` ${extra}` : ''}`, { ...v, mood: 'excited' });
      return;
    }
    this.finished = true;
    this.el.querySelectorAll('.mg-fruit:not(.is-used)').forEach((b) => b.classList.add('is-rest'));
    this.el.querySelector('.mg-stage')?.classList.add('is-done');
    this.d.speaker.speak(`${countingWord(this.done)}!`, {
      ...v,
      mood: 'excited',
      onEnd: () => {
        sfx('reward');
        const text = this.mode === 'cake' ? MINIGAMES.cake.done : MINIGAMES.garden.done;
        this.say(text, this.giver, 'excited', () => this.later(() => this.finish(), 500));
      },
    });
  }

  private finish(): void {
    const cb = this.onDone;
    this.onDone = null;
    this.close();
    cb?.();
  }

  private head(title: string, en: string): string {
    return `<div class="mg-head"><span class="mg-round" aria-hidden="true" style="visibility:hidden"></span>
      <div class="mg-title">${title} <small>${en}</small></div>
      <button class="mg-round mg-close" data-act="close" aria-label="닫기">${checkIcon()}</button></div>`;
  }

  private slots(n: number, icon: string): string {
    return `<div class="mg-slots">${Array.from({ length: n }, (_, i) => `<span class="mg-slot" data-i="${i}">${icon}</span>`).join('')}</div>`;
  }

  private fill(text: string): string {
    const it = getItem(this.item);
    return fillText(text, { ...this.vars, item: it.name, en: it.en }, (c) => getCharacter(c).name);
  }

  private say(text: string, speaker: string, mood: Mood = 'happy', onEnd?: () => void): void {
    const box = this.el.querySelector('.mg-say');
    if (box) box.textContent = text;
    const v = getCharacter(speaker).voice;
    this.d.speaker.speak(text, { lang: v.lang, pitch: v.pitch, rate: v.rate, gender: v.gender, mood, onEnd });
  }

  private later(fn: () => void, ms: number): void {
    this.timers.push(window.setTimeout(fn, ms));
  }
}

/** 케이크 윗면 위 과일 자리 (%, 케이크 그림 안) */
function cakeSpots(n: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i + 0.5) * (Math.PI / n); // 윗면 타원 앞쪽 반원을 따라
    out.push([50 + Math.cos(a) * 30, 30 - Math.sin(a) * 9 + (i % 2) * 4]);
  }
  return out;
}

function cakeSvg(): string {
  return `<svg viewBox="0 0 320 260" aria-hidden="true">
    <ellipse cx="160" cy="236" rx="150" ry="20" fill="#e9e2f5"/>
    <ellipse cx="160" cy="226" rx="138" ry="18" fill="#fff" stroke="#e0d4f0" stroke-width="4"/>
    <path d="M50 92v118q0 18 110 18t110-18V92z" fill="#ffb8d6"/>
    <path d="M50 150q0 14 110 14t110-14" fill="none" stroke="#ff9ccf" stroke-width="8"/>
    <ellipse cx="160" cy="92" rx="110" ry="30" fill="#fff6fa"/>
    <path d="M50 92q0 22 18 28 4 22 14 0 10 10 22 4 4 26 16 2 14 8 30 6 6 24 16 0 16 4 30-4 6 22 16 2 14 0 18-14 8 20 14 0 6-20 6-28" fill="#fff6fa"/>
    <g fill="#ffd36e"><circle cx="78" cy="190" r="5"/><circle cx="128" cy="200" r="5"/><circle cx="190" cy="200" r="5"/><circle cx="242" cy="190" r="5"/></g>
  </svg>`;
}

function sproutSvg(): string {
  return `<svg class="mg-sprout-art" viewBox="0 0 120 120" aria-hidden="true">
    <ellipse cx="60" cy="100" rx="48" ry="16" fill="#b98a6a"/><ellipse cx="60" cy="96" rx="40" ry="11" fill="#c99b7a"/>
    <path d="M60 96V62" stroke="#6fbf6a" stroke-width="7" stroke-linecap="round"/>
    <path d="M60 70q-26-4-30-24 24 0 30 24z" fill="#8fd98a"/><path d="M60 64q22-6 28-26-24 2-28 26z" fill="#7fcf7a"/>
  </svg>`;
}

function canSvg(): string {
  return `<svg viewBox="0 0 140 110" aria-hidden="true">
    <path d="M40 36h62l-6 60H46z" fill="#9fd8ff" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>
    <path d="M100 46q30 4 26 34" fill="none" stroke="#9fd8ff" stroke-width="10" stroke-linecap="round"/>
    <path d="M44 52L8 30" stroke="#9fd8ff" stroke-width="10" stroke-linecap="round"/>
    <ellipse cx="8" cy="30" rx="9" ry="12" fill="#7cc4f2" transform="rotate(-30 8 30)"/>
    <circle cx="71" cy="64" r="10" fill="#fff" opacity=".7"/>
  </svg>`;
}

function starSvg(): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6l7.6 15.4 17 2.5-12.3 12 2.9 16.9L32 44.8l-15.2 8 2.9-16.9-12.3-12 17-2.5z" fill="#fff" opacity=".9"/></svg>`;
}
