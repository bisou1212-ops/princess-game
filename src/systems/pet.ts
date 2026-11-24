import data from '../data/pets.json';
import type { Character } from './dialogue';
import { countWithUnit } from './items';
import { countingOut, type QuestVars, type Rng } from './random-quests';

/**
 * 펫 (M8-5, GDD 3·4): 골라서 함께 사는 동물 한 마리.
 * - 처음 한 번 고르고 이름을 붙인다
 * - 시간이 지나면 배고프고(밥) 꼬질꼬질해진다(목욕) — 생활습관
 * - 배고플 때 밥, 꼬질꼬질할 때 목욕을 해 주면 별사탕 (실패·벌점 없음: 아무리 오래 안 돌봐도 그냥 "배고파요")
 * three.js와 분리된 순수 로직.
 */
export interface PetFood {
  icon: string;
  name: string;
  en: string;
}

export interface PetKindDef {
  name: string;
  en: string;
  color: string;
  eyeColor: string;
  voice: { lang: string; pitch: number; rate: number };
  names: string[];
  food: PetFood;
}

interface PetData {
  kinds: Record<string, PetKindDef>;
  snack: [number, number];
  hungryAfterHours: number;
  dirtyAfterHours: number;
  candy: number;
  dirtSpots: number;
}

const config = data as unknown as PetData;
export const PET_KINDS: Readonly<Record<string, PetKindDef>> = config.kinds;
export const PET_IDS: readonly string[] = Object.keys(config.kinds);
export const DIRT_SPOTS = config.dirtSpots;
const HOUR = 3600_000;

export interface PetSave {
  kind: string;
  name: string;
  fedAt: number;
  bathedAt: number;
}

export type PetNeed = 'hungry' | 'dirty' | null;

export class Pet {
  constructor(
    readonly kind: string,
    readonly name: string,
    /** 마지막으로 밥 먹은 때 (0 = 아직, 처음 데려오면 배고픔) */
    public fedAt = 0,
    /** 마지막으로 씻은 때 */
    public bathedAt = Date.now(),
  ) {
    if (!PET_KINDS[kind]) throw new Error(`pets.json에 없는 펫: ${kind}`);
  }

  get def(): PetKindDef {
    return PET_KINDS[this.kind];
  }

  hungry(now = Date.now()): boolean {
    return now - this.fedAt >= config.hungryAfterHours * HOUR;
  }

  dirty(now = Date.now()): boolean {
    return now - this.bathedAt >= config.dirtyAfterHours * HOUR;
  }

  /** 지금 가장 먼저 해 줄 일 (밥이 먼저) */
  need(now = Date.now()): PetNeed {
    return this.hungry(now) ? 'hungry' : this.dirty(now) ? 'dirty' : null;
  }

  /** 밥을 다 먹였다. 배고팠으면 별사탕 */
  feed(now = Date.now()): number {
    const earned = this.hungry(now) ? config.candy : 0;
    this.fedAt = now;
    return earned;
  }

  /** 목욕을 다 했다. 꼬질꼬질했으면 별사탕 */
  bathe(now = Date.now()): number {
    const earned = this.dirty(now) ? config.candy : 0;
    this.bathedAt = now;
    return earned;
  }

  toJSON(): PetSave {
    return { kind: this.kind, name: this.name, fedAt: this.fedAt, bathedAt: this.bathedAt };
  }

  /** 저장된 펫 (깨졌거나 모르는 펫이면 null → 다시 고르기) */
  static load(raw: unknown): Pet | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Partial<PetSave>;
    if (typeof r.kind !== 'string' || !PET_KINDS[r.kind]) return null;
    const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 12) : PET_KINDS[r.kind].names[0];
    const time = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
    return new Pet(r.kind, name, time(r.fedAt, 0), time(r.bathedAt, Date.now()));
  }
}

/** 이번에 줄 간식 개수 (수 세기 2~5) */
export function snackCount(rng: Rng = Math.random): number {
  const [lo, hi] = config.snack;
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** 대화 상자에 쓸 펫 캐릭터 (speaker "pet") — 이름은 아이가 붙인 이름 */
export function petCharacter(pet: Pet): Character {
  const d = pet.def;
  return { name: pet.name, color: d.color, eyeColor: d.eyeColor, model: 'plain', voice: d.voice };
}

/** 펫 대사 빈칸: {name}·{kind}·{food}·{en}·{count}·{counting} */
export function petVars(pet: Pet, count = 0): QuestVars {
  const d = pet.def;
  const vars: QuestVars = { name: pet.name, kind: d.name, kindEn: d.en, food: d.food.name, en: d.food.en };
  if (count > 0) {
    vars.count = countWithUnit(count, '개');
    vars.counting = countingOut(count);
  }
  return vars;
}
