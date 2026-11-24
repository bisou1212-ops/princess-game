/**
 * 부모 설정 (M9, GDD 9). 기기 설정이라 localStorage 에 둔다 (CLAUDE.md: 설정은 localStorage).
 * 그래픽 품질은 quality.ts 의 'quality' 키를 그대로 쓴다 (다음에 켤 때 적용).
 */
import { PERF_KEY } from './quality';

export type SpeechSpeed = 'slow' | 'normal' | 'fast';
export type QualityChoice = 'auto' | 'basic' | 'high';

export interface Settings {
  /** 말 빠르기 — 글을 따라 읽기 어려우면 느리게 */
  speech: SpeechSpeed;
  /** 한 번에 놀 시간(분). 0 = 정하지 않음 (GDD 9: 10/15/20/30분) */
  playMinutes: number;
  /** 효과음·배경 음악 켜기 */
  sfx: boolean;
  music: boolean;
}

export const PLAY_CHOICES = [0, 10, 15, 20, 30] as const;

const KEY = 'settings';
const QUALITY_KEY = 'quality';
export const SPEECH_RATE: Record<SpeechSpeed, number> = { slow: 0.82, normal: 1, fast: 1.15 };
const DEFAULTS: Settings = { speech: 'normal', playMinutes: 0, sfx: true, music: true };

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
const ls = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export function loadSettings(store: Storage | null = ls()): Settings {
  try {
    const raw = JSON.parse(store?.getItem(KEY) ?? 'null') as Partial<Settings> | null;
    const speech = raw?.speech && raw.speech in SPEECH_RATE ? raw.speech : DEFAULTS.speech;
    const playMinutes = (PLAY_CHOICES as readonly number[]).includes(raw?.playMinutes as number) ? (raw!.playMinutes as number) : DEFAULTS.playMinutes;
    const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
    return { speech, playMinutes, sfx: bool(raw?.sfx, DEFAULTS.sfx), music: bool(raw?.music, DEFAULTS.music) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings, store: Storage | null = ls()): void {
  try {
    store?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 저장 못 해도 이번 판엔 적용 */
  }
}

/** 지금 고른 그래픽 품질 (자동 = 기기를 보고 정함) */
export function qualityChoice(store: Storage | null = ls()): QualityChoice {
  const q = store?.getItem(QUALITY_KEY);
  return q === 'basic' || q === 'high' ? q : 'auto';
}

/** 그래픽 품질 바꾸기: 자동 조절 단계도 처음부터 다시 잰다. 다시 켜면 적용 */
export function setQualityChoice(q: QualityChoice, store: Storage | null = ls()): void {
  try {
    if (q === 'auto') store?.removeItem(QUALITY_KEY);
    else store?.setItem(QUALITY_KEY, q);
    store?.removeItem(PERF_KEY);
  } catch {
    /* 무시 */
  }
}

/**
 * 어른용 잠금 문제: 두 자리 곱셈 (6~9 × 6~9). 7살은 아직 못 푸는 문제.
 * rng 를 넣어 테스트에서 고정할 수 있다.
 */
export function lockQuestion(rng: () => number = Math.random): { a: number; b: number; answer: number } {
  const a = 6 + Math.floor(rng() * 4);
  const b = 6 + Math.floor(rng() * 4);
  return { a, b, answer: a * b };
}
