import charactersJson from '../data/characters.json';
import dialoguesJson from '../data/dialogues.json';

export interface Voice {
  lang: string;
  pitch: number;
  rate: number;
}

export interface Character {
  name: string;
  /** CSS 색 (#rrggbb) */
  color: string;
  /** M7 아트 교체 전까지 쓰는 도형 모양 */
  model: 'princess' | 'rabbit' | 'bear' | 'hedgehog' | 'plain';
  voice: Voice;
}

/** 대사의 기분 — 목소리 높낮이·속도를 살짝 바꿔 말투에 변화를 준다 */
export type Mood = 'normal' | 'happy' | 'excited' | 'curious' | 'shy' | 'sad';

export interface DialogueLine {
  speaker: string;
  text: string;
  lang?: string;
  mood?: Mood;
}

const characters = stripComment(charactersJson) as Record<string, Character>;
const dialogues = stripComment(dialoguesJson) as Record<string, DialogueLine[]>;

function stripComment<T extends object>(json: T): Omit<T, '_comment'> {
  const { _comment: _, ...rest } = json as T & { _comment?: unknown };
  return rest;
}

export function getCharacter(id: string): Character {
  const c = characters[id];
  if (!c) throw new Error(`characters.json에 없는 캐릭터: ${id}`);
  return c;
}

export function getDialogue(id: string): DialogueLine[] {
  const d = dialogues[id];
  if (!d) throw new Error(`dialogues.json에 없는 대사: ${id}`);
  return d;
}

export function allDialogues(): Record<string, DialogueLine[]> {
  return dialogues;
}

export function allCharacters(): Record<string, Character> {
  return characters;
}

// ── 단어 강조용 ─────────────────────────────────────────────

/** 띄어쓰기 단위(어절) 하나와 원문 속 위치 */
export interface WordToken {
  text: string;
  start: number;
  end: number;
}

export function tokenize(text: string): WordToken[] {
  const out: WordToken[] = [];
  for (const m of text.matchAll(/\S+/g)) {
    out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** TTS가 알려 준 글자 위치(charIndex)가 몇 번째 어절인지 */
export function wordIndexAt(tokens: WordToken[], charIndex: number): number {
  let idx = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].start <= charIndex) idx = i;
    else break;
  }
  return idx;
}

/**
 * TTS가 단어 위치를 알려 주지 않는 기기를 위한 추정 시간표(초).
 * 글자 수에 비례하고, 문장부호 뒤에는 잠깐 쉰다. rate가 빠를수록 짧아짐.
 */
export function estimateWordTimes(tokens: WordToken[], rate = 1): { starts: number[]; total: number } {
  const perChar = 0.17 / rate;
  const perWord = 0.08 / rate;
  const starts: number[] = [];
  let t = 0;
  for (const tok of tokens) {
    starts.push(t);
    const letters = tok.text.replace(/[^\p{L}\p{N}]/gu, '').length;
    t += perWord + letters * perChar;
    if (/[.!?,…~]$/.test(tok.text)) t += 0.3 / rate;
  }
  return { starts, total: t };
}

// ── 끊어 읽기·억양 ─────────────────────────────────────────

/** 문장(또는 "음~" 같은 추임새) 하나와 원문 속 위치 */
export interface Segment {
  text: string;
  start: number;
  end: number;
}

/**
 * 문장부호(. ! ? … ~) 단위로 나눈다. 한 덩어리씩 따로 읽고 사이에 잠깐 쉬면
 * 한 번에 이어 읽을 때보다 훨씬 자연스럽다.
 */
export function splitSentences(text: string): Segment[] {
  const out: Segment[] = [];
  for (const m of text.matchAll(/[^.!?…~]+[.!?…~]*|[.!?…~]+/g)) {
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (!/[\p{L}\p{N}]/u.test(trimmed)) continue; // 부호만 있는 조각은 건너뜀
    const start = m.index + lead;
    out.push({ text: trimmed, start, end: start + trimmed.length });
  }
  return out;
}

const MOOD_SHIFT: Record<Mood, { pitch: number; rate: number }> = {
  normal: { pitch: 0, rate: 0 },
  happy: { pitch: 0.05, rate: 0 },
  excited: { pitch: 0.12, rate: 0.05 },
  curious: { pitch: 0.08, rate: -0.05 },
  shy: { pitch: -0.05, rate: -0.12 },
  sad: { pitch: -0.12, rate: -0.15 },
};

/**
 * 문장 끝 부호와 기분에 따라 높낮이·속도를 정한다.
 * 높낮이를 너무 올리면 기계음처럼 뭉개지므로 범위를 좁게 제한한다.
 */
export function prosodyFor(sentence: string, base: { pitch: number; rate: number }, mood: Mood = 'normal') {
  let pitch = base.pitch + MOOD_SHIFT[mood].pitch;
  let rate = base.rate + MOOD_SHIFT[mood].rate;
  const end = sentence.trimEnd().slice(-1);
  if (end === '!') pitch += 0.06;
  else if (end === '?') pitch += 0.1;
  else if (end === '~') {
    pitch += 0.04;
    rate -= 0.08;
  } else if (end === '…') rate -= 0.1;
  return {
    pitch: Math.min(Math.max(pitch, 0.8), 1.45),
    rate: Math.min(Math.max(rate, 0.6), 1.3),
  };
}

/** 문장이 끝난 뒤 쉬는 시간(초) */
export function pauseAfter(sentence: string): number {
  const end = sentence.trimEnd().slice(-1);
  if (end === '~' || end === '…') return 0.35;
  if (end === '.' || end === '!' || end === '?') return 0.25;
  return 0.12;
}

// ── 대화 진행 ──────────────────────────────────────────────

/** 한 번의 대화(여러 줄)를 순서대로 넘긴다 */
export class DialogueSession {
  private index = 0;

  constructor(readonly lines: DialogueLine[]) {}

  get current(): DialogueLine | null {
    return this.lines[this.index] ?? null;
  }

  get isLast(): boolean {
    return this.index >= this.lines.length - 1;
  }

  /** 다음 줄로. 끝났으면 null */
  next(): DialogueLine | null {
    if (this.index < this.lines.length) this.index++;
    return this.current;
  }
}
