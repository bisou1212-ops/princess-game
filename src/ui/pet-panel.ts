import type { Speaker } from '../core/tts';
import { getCharacter, getDialogue, type DialogueLine } from '../systems/dialogue';
import { countingWord } from '../systems/items';
import { DIRT_SPOTS, PET_IDS, PET_KINDS, petVars, type Pet } from '../systems/pet';
import { fillLines, type QuestVars } from '../systems/random-quests';
import { checkIcon, petFoodIcon } from './icons';
import './pet-panel.css';
import { sfx } from '../core/sound';

/**
 * 펫 화면 (M8-5, GDD 3·4·6).
 * - 고르기: 유니콘·고양이·강아지 카드 → 톡하면 이름(한글·영어)을 읽어 줌 → "좋아요" → 이름 카드 3개 중 고르기
 * - 밥: 간식 그릇에서 하나씩 톡 → 펫에게 쏙, "하나! 둘!" (수 세기). 다 먹으면 "맛있어요!"
 * - 목욕: 펫 그림 위 얼룩을 손가락으로 문지르면 거품이 되어 퐁 (생활습관)
 * 실패 없음: 언제든 닫을 수 있고, 다 못 해도 아무 일 없음. 대사는 dialogues.json (글자 + 음성)
 */
export interface PetPanelDeps {
  speaker: Speaker;
  /** 펫 그림 (data URL) */
  thumb(kind: string): string;
  onAdopt(kind: string, name: string): void;
  /** 돌보기를 끝까지 했다 */
  onCareDone(mode: 'feed' | 'bath'): void;
  onClose(): void;
}

type Step = { at: 'choose'; kind: string | null } | { at: 'name'; kind: string; name: string | null } | { at: 'feed' | 'bath' };

export class PetPanel {
  readonly el: HTMLDivElement;
  private step: Step = { at: 'choose', kind: null };
  private pet: Pet | null = null;
  private fed = 0;
  private want = 0;
  private finished = false;
  private rub = new Map<HTMLElement, number>();

  constructor(parent: HTMLElement, private readonly d: PetPanelDeps) {
    this.el = document.createElement('div');
    this.el.className = 'pet-panel';
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!b) return;
      const { act, value } = b.dataset;
      if (act === 'kind' && value) this.pickKind(value);
      else if (act === 'ok-kind') this.showNames();
      else if (act === 'name' && value) this.pickName(value, b);
      else if (act === 'ok-name') this.adopt();
      else if (act === 'back') this.showChoose();
      else if (act === 'food') this.feedOne(b);
      else if (act === 'close') this.d.onClose();
    });
    // 목욕: 손가락으로 문지르기 (터치는 처음 누른 곳에 붙잡히므로 좌표로 얼룩을 찾는다)
    this.el.addEventListener('pointerdown', (e) => this.scrub(e.clientX, e.clientY, 2));
    this.el.addEventListener('pointermove', (e) => {
      if (e.buttons || e.pointerType === 'touch') this.scrub(e.clientX, e.clientY, 1);
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  close(): void {
    this.d.speaker.stop();
    this.el.hidden = true;
  }

  // ── 고르기 ──

  openChoose(): void {
    this.el.hidden = false;
    this.showChoose();
    this.say(getDialogue('pet-choose'));
  }

  private showChoose(): void {
    const chosen = this.step.at === 'choose' || this.step.at === 'name' ? this.step.kind : null;
    this.step = { at: 'choose', kind: chosen };
    const cards = PET_IDS.map((id) => {
      const k = PET_KINDS[id];
      return `<button class="pp-card ${chosen === id ? 'is-picked' : ''}" data-act="kind" data-value="${id}" aria-label="${k.name}">
        <img src="${this.d.thumb(id)}" alt="" draggable="false">
        <span class="pp-card-name">${k.name}</span><span class="pp-card-en">${k.en}</span>
      </button>`;
    }).join('');
    this.el.innerHTML = `<div class="pp-title">${getDialogue('pet-choose')[0].text}</div>
      <div class="pp-cards">${cards}</div>
      <button class="pp-ok" data-act="ok-kind" aria-label="좋아요" ${chosen ? '' : 'hidden'}>${checkIcon()}</button>`;
  }

  private pickKind(kind: string): void {
    sfx('tap');
    this.step = { at: 'choose', kind };
    this.el.querySelectorAll('.pp-card').forEach((c) => c.classList.toggle('is-picked', (c as HTMLElement).dataset.value === kind));
    (this.el.querySelector('.pp-ok') as HTMLElement).hidden = false;
    const k = PET_KINDS[kind];
    const v = getCharacter('princess').voice;
    this.d.speaker.speak(`${k.name}!`, {
      ...v,
      mood: 'excited',
      onEnd: () => this.d.speaker.speak(`${k.en}!`, { lang: 'en-US', pitch: v.pitch, rate: v.rate, mood: 'excited' }),
    });
  }

  private showNames(): void {
    if (this.step.at !== 'choose' || !this.step.kind) return;
    const kind = this.step.kind;
    this.step = { at: 'name', kind, name: null };
    const k = PET_KINDS[kind];
    const lines = fillLines(getDialogue('pet-name'), { kind: k.name }, (c) => c);
    const names = k.names.map((n) => `<button class="pp-name" data-act="name" data-value="${n}">${n}</button>`).join('');
    this.el.innerHTML = `<div class="pp-head"><button class="pp-round pp-back" data-act="back" aria-label="다시 고르기">${backIcon()}</button>
        <div class="pp-title">${lines[0].text}</div></div>
      <div class="pp-big"><img src="${this.d.thumb(kind)}" alt="" draggable="false"></div>
      <div class="pp-names">${names}</div>
      <button class="pp-ok" data-act="ok-name" aria-label="좋아요" hidden>${checkIcon()}</button>`;
    this.say(lines);
  }

  private pickName(name: string, btn: HTMLElement): void {
    sfx('tap');
    if (this.step.at !== 'name') return;
    this.step.name = name;
    this.el.querySelectorAll('.pp-name').forEach((c) => c.classList.toggle('is-picked', c === btn));
    (this.el.querySelector('.pp-ok') as HTMLElement).hidden = false;
    this.d.speaker.speak(`${name}!`, { ...getCharacter('princess').voice, mood: 'excited' });
  }

  private adopt(): void {
    if (this.step.at !== 'name' || !this.step.name) return;
    this.d.onAdopt(this.step.kind, this.step.name);
  }

  // ── 밥 ──

  openFeed(pet: Pet, count: number): void {
    this.pet = pet;
    this.step = { at: 'feed' };
    this.fed = 0;
    this.want = count;
    this.finished = false;
    this.el.hidden = false;
    const food = pet.def.food;
    const slots = Array.from({ length: count }, (_, i) => `<span class="pp-slot" data-i="${i}">${petFoodIcon(food.icon)}</span>`).join('');
    // 그릇에는 조금 넉넉하게 (다 먹으면 남은 건 그대로)
    const plate = Array.from({ length: count + 2 }, () => `<button class="pp-food" data-act="food" aria-label="${food.name}">${petFoodIcon(food.icon)}</button>`).join('');
    const lines = this.petLines('pet-feed-start', count);
    this.el.innerHTML = `${this.careHead(`${food.name} <small>${food.en}</small>`)}
      <div class="pp-slots">${slots}</div>
      <div class="pp-big pp-eater"><img src="${this.d.thumb(pet.kind)}" alt="" draggable="false"></div>
      <div class="pp-say"></div>
      <div class="pp-plate">${plate}</div>`;
    this.say(lines);
  }

  private feedOne(btn: HTMLElement): void {
    if (this.step.at !== 'feed' || this.finished || btn.classList.contains('is-gone')) return;
    this.fed++;
    btn.classList.add('is-gone');
    this.el.querySelector(`.pp-slot[data-i="${this.fed - 1}"]`)?.classList.add('is-full');
    bounce(this.el.querySelector('.pp-eater'));
    if (this.fed < this.want) {
      sfx('nom');
      sfx('count', this.fed);
      this.d.speaker.speak(`${countingWord(this.fed)}!`, { ...getCharacter('princess').voice, mood: 'excited' });
      return;
    }
    this.finished = true;
    this.el.querySelectorAll('.pp-food:not(.is-gone)').forEach((b) => b.classList.add('is-rest'));
    this.finish('feed', this.petLines('pet-fed', this.want));
  }

  // ── 목욕 ──

  openBath(pet: Pet): void {
    this.pet = pet;
    this.step = { at: 'bath' };
    this.finished = false;
    this.rub.clear();
    this.el.hidden = false;
    // 얼룩: 펫 그림 가운데 둘레에 흩어 놓기
    const spots = Array.from({ length: DIRT_SPOTS }, (_, i) => {
      const a = (i / DIRT_SPOTS) * Math.PI * 2 + Math.random() * 0.6;
      const r = 18 + Math.random() * 16;
      const x = 50 + Math.cos(a) * r;
      const y = 55 + Math.sin(a) * r * 0.85;
      const s = 12 + Math.random() * 5;
      return `<span class="pp-dirt" style="left:${x}%;top:${y}%;width:${s}%;height:${s * 0.8}%"></span>`;
    }).join('');
    this.el.innerHTML = `${this.careHead('목욕 <small>Bath</small>')}
      <div class="pp-big pp-tub"><img src="${this.d.thumb(pet.kind)}" alt="" draggable="false">${spots}</div>
      <div class="pp-say"></div>`;
    this.say(this.petLines('pet-bath-start'));
  }

  private scrub(x: number, y: number, amount: number): void {
    if (this.step.at !== 'bath' || this.finished || this.el.hidden) return;
    const spot = document.elementsFromPoint(x, y).find((el) => el.classList.contains('pp-dirt')) as HTMLElement | undefined;
    if (!spot || spot.classList.contains('is-clean')) return;
    const n = (this.rub.get(spot) ?? 0) + amount;
    this.rub.set(spot, n);
    spot.style.opacity = String(Math.max(0.25, 1 - n / 6));
    if (n < 5) return;
    spot.style.opacity = '';
    spot.classList.add('is-clean'); // 거품이 되어 퐁
    sfx('bubble');
    const left = this.el.querySelectorAll('.pp-dirt:not(.is-clean)').length;
    if (left > 0) {
      this.d.speaker.speak('뽀득!', { ...getCharacter('princess').voice, mood: 'happy' });
      return;
    }
    this.finished = true;
    this.el.querySelector('.pp-tub')?.classList.add('is-shiny');
    this.finish('bath', this.petLines('pet-bathed'));
  }

  // ── 공통 ──

  private careHead(title: string): string {
    return `<div class="pp-head"><span class="pp-round" aria-hidden="true" style="visibility:hidden"></span><div class="pp-title">${title}</div>
      <button class="pp-round pp-close" data-act="close" aria-label="닫기">${checkIcon()}</button></div>`;
  }

  private petLines(id: string, count = 0): DialogueLine[] {
    const vars: QuestVars = this.pet ? petVars(this.pet, count) : {};
    return fillLines(getDialogue(id), vars, (c) => getCharacter(c).name);
  }

  /** 다 했다: 하트 + 펫이 고맙다고 말한 뒤 닫힘 (소리가 안 나는 기기도 6초 뒤엔 닫힘) */
  private finish(mode: 'feed' | 'bath', lines: DialogueLine[]): void {
    sfx(mode === 'feed' ? 'nom' : 'sparkle');
    window.setTimeout(() => sfx('reward'), 250);
    this.el.querySelector('.pp-big')?.insertAdjacentHTML('beforeend', '<span class="pp-hearts"><i>♥</i><i>♥</i><i>♥</i></span>');
    this.d.onCareDone(mode);
    let done = false;
    const end = () => {
      if (done || this.step.at !== mode) return;
      done = true;
      this.d.onClose();
    };
    this.say(lines, end);
    window.setTimeout(end, 6000 + lines.length * 1500);
  }

  /** 대사 여러 줄을 차례로: 글자를 보여 주며 읽기 */
  private say(lines: DialogueLine[], onEnd?: () => void): void {
    const box = this.el.querySelector('.pp-say');
    const next = (i: number) => {
      const line = lines[i];
      if (!line) return onEnd?.();
      if (box) box.textContent = line.text;
      const v = getCharacter(line.speaker).voice;
      this.d.speaker.speak(line.text, { lang: line.lang ?? v.lang, pitch: v.pitch, rate: v.rate, mood: line.mood, onEnd: () => next(i + 1) });
    };
    next(0);
  }
}

function bounce(el: Element | null): void {
  if (!el) return;
  el.classList.remove('is-nom');
  void (el as HTMLElement).offsetWidth;
  el.classList.add('is-nom');
}

function backIcon(): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M38 14 20 32l18 18" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
