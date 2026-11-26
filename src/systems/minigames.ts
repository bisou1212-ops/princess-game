import data from '../data/minigames.json';

/**
 * 미니게임 로직 (three.js·화면과 분리, 테스트 가능).
 * - 케이크 꾸미기·꽃밭 물 주기: 개수 세기 (화면이 맡음)
 * - 카드 짝 맞추기(MemoryGame): 두 장을 뒤집어 같으면 그대로, 다르면 다시 덮음. 실패·시간 제한 없음
 */
export interface MiniGameText {
  title: string;
  en: string;
  start: string;
  done: string;
}

export interface CardsConfig extends MiniGameText {
  miss: string;
  again: string;
  candy: number;
  /** 판마다 짝 수 (4 → 6 …, 마지막 판은 계속) */
  levels: number[];
  /** 그림 카드 (items.json id) */
  things: string[];
  /** 친구 얼굴 카드 (characters.json id) */
  friends: string[];
}

export interface MiniGameData {
  cake: MiniGameText & { extra: number };
  garden: MiniGameText & { grow: string };
  cards: CardsConfig;
  /** 숨바꼭질: count까지 세기, hintAfter초 뒤 숨은 친구 머리 위 ♥ */
  seek: { title: string; en: string; close: string; count: number; hintAfter: number };
}

const { _comment: _c, ...rest } = data as unknown as MiniGameData & { _comment?: string };
export const MINIGAMES: MiniGameData = rest;

export type Rng = () => number;

/** 카드 한 장: 무엇(face)이 그려졌는지 + 종류(친구 얼굴·그림) */
export interface Card {
  face: string;
  kind: 'friend' | 'thing';
}

export function shuffle<T>(list: T[], rng: Rng = Math.random): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 짝 n개짜리 카드 (판마다 친구 얼굴·그림을 번갈아) */
export function makeDeck(pairs: number, kind: 'friend' | 'thing', cfg: CardsConfig = MINIGAMES.cards, rng: Rng = Math.random): Card[] {
  const pool = kind === 'friend' ? cfg.friends : cfg.things;
  const faces = shuffle(pool, rng).slice(0, Math.min(pairs, pool.length));
  return shuffle(
    faces.flatMap((face) => [
      { face, kind },
      { face, kind },
    ]),
    rng,
  );
}

export type FlipResult =
  | { type: 'ignored' }
  /** 첫 장을 뒤집음 */
  | { type: 'first'; index: number }
  /** 두 장이 같음 (done = 다 찾음) */
  | { type: 'match'; a: number; b: number; face: string; done: boolean }
  /** 두 장이 다름 → 잠깐 보여 주고 hide() 로 다시 덮음 */
  | { type: 'miss'; a: number; b: number };

export class MemoryGame {
  readonly matched = new Set<number>();
  private open: number[] = [];
  /** 다른 두 장이 열려 있는 동안은 새로 못 뒤집음 (덮일 때까지) */
  private waiting = false;
  moves = 0;

  constructor(readonly cards: Card[]) {}

  isUp(i: number): boolean {
    return this.matched.has(i) || this.open.includes(i);
  }

  get done(): boolean {
    return this.matched.size === this.cards.length;
  }

  flip(i: number): FlipResult {
    if (this.waiting || i < 0 || i >= this.cards.length || this.isUp(i)) return { type: 'ignored' };
    this.open.push(i);
    if (this.open.length === 1) return { type: 'first', index: i };
    const [a, b] = this.open;
    this.moves++;
    if (this.cards[a].face === this.cards[b].face) {
      this.matched.add(a);
      this.matched.add(b);
      this.open = [];
      return { type: 'match', a, b, face: this.cards[a].face, done: this.done };
    }
    this.waiting = true;
    return { type: 'miss', a, b };
  }

  /** 틀린 두 장을 다시 덮기 */
  hide(): void {
    this.open = [];
    this.waiting = false;
  }
}
