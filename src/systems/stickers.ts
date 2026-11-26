import data from '../data/stickers.json';

/**
 * 스티커 앨범 (모으는 큰 목표, src/data/stickers.json).
 * 놀이 곳곳에서 record('quest') 처럼 셈을 올리면, 정해진 횟수가 된 스티커가 붙는다.
 * 한 번 붙은 스티커는 떨어지지 않는다. three.js·화면과 분리 (테스트 가능).
 */
export interface StickerDef {
  id: string;
  name: string;
  en: string;
  icon: string;
  counter: string;
  at: number;
  hint: string;
}

export const STICKERS: readonly StickerDef[] = (data as unknown as { stickers: StickerDef[] }).stickers;

export interface StickerSave {
  counts: Record<string, number>;
  earned: string[];
  /** 앨범에서 아직 못 본 새 스티커 */
  unseen: string[];
}

export class StickerBook {
  private readonly counts = new Map<string, number>();
  readonly earned = new Set<string>();
  readonly unseen = new Set<string>();
  /** 새 스티커가 붙었을 때 (화면이 알림을 띄움) */
  onEarn: ((s: StickerDef) => void) | null = null;

  constructor(private readonly defs: readonly StickerDef[] = STICKERS) {}

  count(counter: string): number {
    return this.counts.get(counter) ?? 0;
  }

  /** 셈 올리기 → 이번에 새로 붙은 스티커들 */
  record(counter: string, amount = 1): StickerDef[] {
    if (amount <= 0) return [];
    const n = this.count(counter) + amount;
    this.counts.set(counter, n);
    const fresh = this.defs.filter((s) => s.counter === counter && n >= s.at && !this.earned.has(s.id));
    for (const s of fresh) {
      this.earned.add(s.id);
      this.unseen.add(s.id);
      this.onEarn?.(s);
    }
    return fresh;
  }

  /** 다음 스티커까지 (앨범의 "조금만 더" 표시용) */
  progress(def: StickerDef): number {
    return Math.min(1, this.count(def.counter) / def.at);
  }

  markSeen(): void {
    this.unseen.clear();
  }

  toJSON(): StickerSave {
    return { counts: Object.fromEntries(this.counts), earned: [...this.earned], unseen: [...this.unseen] };
  }

  load(raw: unknown): void {
    this.counts.clear();
    this.earned.clear();
    this.unseen.clear();
    if (!raw || typeof raw !== 'object') return;
    const r = raw as Partial<StickerSave>;
    if (r.counts && typeof r.counts === 'object') {
      for (const [k, v] of Object.entries(r.counts)) if (typeof v === 'number' && Number.isFinite(v) && v > 0) this.counts.set(k, Math.floor(v));
    }
    const known = new Set(this.defs.map((d) => d.id));
    for (const id of Array.isArray(r.earned) ? r.earned : []) if (known.has(id)) this.earned.add(id);
    for (const id of Array.isArray(r.unseen) ? r.unseen : []) if (this.earned.has(id)) this.unseen.add(id);
    // 셈은 넘었는데 붙지 않은 스티커(스티커가 새로 생긴 경우)는 조용히 붙인다
    for (const d of this.defs) if (!this.earned.has(d.id) && this.count(d.counter) >= d.at) this.earned.add(d.id);
  }
}

/** 주운 물건 → 스티커 셈 이름 */
export function pickupCounter(itemId: string): string | null {
  if (itemId.startsWith('flower-')) return 'flower';
  if (itemId === 'strawberry' || itemId === 'blueberry') return 'berry';
  if (itemId === 'flowerpot') return 'pot';
  return null;
}
