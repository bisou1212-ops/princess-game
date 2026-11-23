import type { KeyValueStore } from '../core/storage';
import { hasItem } from './items';
import { QuestBook } from './quests';
import { Wallet } from './rewards';
import { STARTER_ITEMS, defaultOutfit, ownedOutfitItems, sanitizeOutfit, type Outfit } from './wardrobe';

/** 저장 파일 모양. 구조를 바꾸면 version을 올리고 parse에서 옮겨 준다 */
export interface SaveData {
  version: 1;
  savedAt: number;
  wallet: { candy: number; items: string[] };
  quests: Record<string, unknown>;
  outfit: Outfit;
  /** 드레스룸에서 이미 본 옷 (새 옷 표시용) */
  seenOutfits: string[];
}

export const SAVE_KEY = 'save';

/**
 * 게임 진행 상황 한 덩어리: 부탁·별사탕·선물·입은 옷.
 * 바뀔 때마다 change()를 부르면 잠깐 모았다가 자동 저장한다 (GDD 9: 기기 안 자동 저장).
 */
export class GameState {
  readonly quests = new QuestBook();
  readonly wallet = new Wallet();
  outfit: Outfit = defaultOutfit();
  /** 처음 가진 옷은 '새 옷'으로 치지 않음 */
  seenOutfits: string[] = [...STARTER_ITEMS];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly store: KeyValueStore | null = null) {}

  /** 가진 옷 전부 */
  get ownedOutfits(): string[] {
    return ownedOutfitItems(this.wallet.items);
  }

  /** 아직 드레스룸에서 못 본 새 옷 */
  get newOutfits(): string[] {
    return this.ownedOutfits.filter((id) => !this.seenOutfits.includes(id));
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** 무언가 바뀌었음 → 화면 갱신 + 0.5초 뒤 저장 */
  change(): void {
    this.listeners.forEach((fn) => fn());
    if (!this.store) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.saveNow(), 500);
  }

  async saveNow(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (!this.store) return;
    try {
      await this.store.set(SAVE_KEY, this.toSave());
    } catch (err) {
      console.warn('저장 실패', err);
    }
  }

  async load(): Promise<boolean> {
    if (!this.store) return false;
    try {
      const raw = await this.store.get<unknown>(SAVE_KEY);
      return this.applySave(raw);
    } catch (err) {
      console.warn('불러오기 실패 — 처음부터 시작합니다.', err);
      return false;
    }
  }

  toSave(): SaveData {
    return {
      version: 1,
      savedAt: Date.now(),
      wallet: this.wallet.toJSON(),
      quests: this.quests.toJSON(),
      outfit: structuredClone(this.outfit),
      seenOutfits: [...this.seenOutfits],
    };
  }

  /** 저장 데이터 적용. 깨졌거나 모르는 값은 기본값으로 (게임이 멈추지 않게) */
  applySave(raw: unknown): boolean {
    if (!raw || typeof raw !== 'object' || (raw as { version?: unknown }).version !== 1) return false;
    const s = raw as Partial<SaveData>;
    this.wallet.load(s.wallet);
    // 데이터에서 사라진 아이템은 버린다
    const known = this.wallet.items.filter(hasItem);
    this.wallet.items.length = 0;
    this.wallet.items.push(...known);
    this.quests.load(s.quests);
    this.outfit = sanitizeOutfit(s.outfit, this.ownedOutfits);
    this.seenOutfits = Array.isArray(s.seenOutfits) ? s.seenOutfits.filter((x): x is string => typeof x === 'string') : [...STARTER_ITEMS];
    return true;
  }
}
