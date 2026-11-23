import { describe, it, expect } from 'vitest';
import {
  PALETTE,
  SLOTS,
  STARTER_ITEMS,
  defaultOutfit,
  equip,
  getOutfitItem,
  itemsForSlot,
  ownedOutfitItems,
  sanitizeOutfit,
  setColor,
} from './wardrobe';
import { GameState, SAVE_KEY } from './game-state';
import { MemoryStore } from '../core/storage';
import { allQuestDefs } from './quests';

describe('옷 입기·색 바꾸기', () => {
  it('옷을 바꾸면 그 옷의 기본 색, 같은 옷을 다시 누르면 색 유지', () => {
    let o = defaultOutfit();
    o = setColor(o, 'dress', 'green');
    expect(o.dress).toEqual({ item: 'dress-basic', color: 'green' });
    o = equip(o, 'dress', 'dress-basic');
    expect(o.dress.color).toBe('green');
    o = equip(o, 'dress', 'dress-puffy');
    expect(o.dress).toEqual({ item: 'dress-puffy', color: 'blue' });
  });

  it('안 입기는 선택 부위만, 다른 부위 옷·모르는 색은 무시', () => {
    let o = defaultOutfit();
    expect(equip(o, 'crown', null).crown.item).toBeNull();
    expect(equip(o, 'dress', null).dress.item).toBe('dress-basic');
    expect(equip(o, 'dress', 'boots').dress.item).toBe('dress-basic');
    o = setColor(o, 'dress', 'rainbow');
    expect(o.dress.color).toBe('pink');
  });

  it('원래 옷은 바꾸지 않는다(새 객체)', () => {
    const o = defaultOutfit();
    equip(o, 'hair', 'hair-bun');
    setColor(o, 'hair', 'pink');
    expect(o).toEqual(defaultOutfit());
  });

  it('선물로 받은 옷만 늘어나고, 부위별로 나뉜다', () => {
    expect(itemsForSlot('dress', ownedOutfitItems([]))).toEqual(['dress-basic', 'dress-puffy']);
    const owned = ownedOutfitItems(['dress-flower', 'flower-red']);
    expect(itemsForSlot('dress', owned)).toContain('dress-flower');
    expect(owned).not.toContain('flower-red');
  });

  it('깨지거나 안 가진 옷이 든 저장값은 기본값으로', () => {
    const owned = ownedOutfitItems([]);
    const o = sanitizeOutfit(
      { dress: { item: 'dress-flower', color: 'red' }, hair: { item: 'hair-bun', color: '???' }, crown: { item: null, color: 'blue' } },
      owned,
    );
    expect(o.dress.item).toBe('dress-basic'); // 아직 안 받은 꽃 드레스
    expect(o.hair).toEqual({ item: 'hair-bun', color: 'brown' });
    expect(o.crown).toEqual({ item: null, color: 'blue' });
    expect(sanitizeOutfit('garbage', owned)).toEqual(defaultOutfit());
  });
});

describe('옷 데이터 (wardrobe.json, items.json)', () => {
  it('색은 8개, 부위마다 처음 가진 옷이 있다', () => {
    expect(PALETTE).toHaveLength(8);
    for (const s of SLOTS) expect(itemsForSlot(s.id, STARTER_ITEMS).length, s.id).toBeGreaterThan(0);
  });

  it('처음 옷·기본 옷이 모두 올바른 옷이다', () => {
    for (const id of STARTER_ITEMS) expect(getOutfitItem(id), id).not.toBeNull();
    const d = defaultOutfit();
    for (const s of SLOTS) {
      expect(d[s.id], s.id).toBeDefined();
      expect(PALETTE.some((c) => c.id === d[s.id].color)).toBe(true);
      if (d[s.id].item) expect(getOutfitItem(d[s.id].item!)?.slot).toBe(s.id);
      else expect(s.optional).toBe(true);
    }
  });

  it('부탁 선물로 주는 옷은 옷 데이터에 있다', () => {
    for (const q of Object.values(allQuestDefs())) {
      for (const id of q.rewards.items) expect(getOutfitItem(id), id).not.toBeNull();
    }
  });
});

describe('저장·불러오기', () => {
  it('부탁 진행·별사탕·선물·옷이 그대로 돌아온다', async () => {
    const store = new MemoryStore();
    const a = new GameState(store);
    a.quests.talk('tori-red-flowers');
    a.quests.collect('flower-red', 0);
    a.wallet.grant({ candy: 5, items: ['dress-flower'] });
    a.outfit = setColor(equip(a.outfit, 'dress', 'dress-flower'), 'dress', 'purple');
    await a.saveNow();

    const b = new GameState(store);
    expect(await b.load()).toBe(true);
    expect(b.quests.get('tori-red-flowers')).toEqual({ status: 'active', count: 1, collected: [0] });
    expect(b.quests.remainingSpawns('tori-red-flowers').map((s) => s.index)).not.toContain(0);
    expect(b.wallet.candy).toBe(5);
    expect(b.wallet.items).toEqual(['dress-flower']);
    expect(b.outfit.dress).toEqual({ item: 'dress-flower', color: 'purple' });
    expect(b.newOutfits).toEqual(['dress-flower']);
  });

  it('같은 꽃은 두 번 셀 수 없다', () => {
    const g = new GameState();
    g.quests.talk('tori-red-flowers');
    expect(g.quests.collect('flower-red', 0)).not.toBeNull();
    expect(g.quests.collect('flower-red', 0)).toBeNull();
  });

  it('저장이 없거나 깨졌으면 처음부터', async () => {
    const store = new MemoryStore();
    expect(await new GameState(store).load()).toBe(false);
    await store.set(SAVE_KEY, { version: 99 });
    expect(await new GameState(store).load()).toBe(false);
    await store.set(SAVE_KEY, {
      version: 1,
      wallet: { candy: -3, items: ['nope', 42] },
      quests: { 'tori-red-flowers': { status: 'weird' }, ghost: { status: 'active' } },
      outfit: null,
    });
    const g = new GameState(store);
    expect(await g.load()).toBe(true);
    expect(g.wallet.candy).toBe(0);
    expect(g.wallet.items).toEqual([]);
    expect(g.quests.get('tori-red-flowers').status).toBe('available');
    expect(g.outfit).toEqual(defaultOutfit());
  });

  it('개수와 상태가 어긋난 저장은 개수를 믿는다', () => {
    const g = new GameState();
    g.quests.load({ 'tori-red-flowers': { status: 'active', count: 3, collected: [0, 1, 2, 99] } });
    expect(g.quests.get('tori-red-flowers')).toEqual({ status: 'ready', count: 3, collected: [0, 1, 2] });
  });
});
