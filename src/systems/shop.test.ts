import { describe, it, expect } from 'vitest';
import { SHOP_ITEMS, buy, priceOf, shopState } from './shop';
import { Wallet } from './rewards';
import { allItems, getItem } from './items';
import { ownedFurniture } from './decor';

describe('별사탕 가게', () => {
  it('파는 물건은 모두 있고, 값은 1~10 (세기 연습)', () => {
    expect(SHOP_ITEMS.length).toBeGreaterThanOrEqual(15);
    for (const s of SHOP_ITEMS) {
      expect(getItem(s.item)).toBeDefined();
      expect(s.price).toBeGreaterThanOrEqual(1);
      expect(s.price).toBeLessThanOrEqual(10);
    }
  });

  it('별사탕이 있으면 사고, 가구는 여러 번 살 수 있다', () => {
    const w = new Wallet();
    w.candy = 10;
    const p = priceOf('chair')!;
    expect(buy(w, 'chair')).toBe(true);
    expect(buy(w, 'chair')).toBe(true);
    expect(w.candy).toBe(10 - 2 * p);
    expect(w.items.filter((x) => x === 'chair')).toHaveLength(2);
    expect(ownedFurniture(w.items).chair).toBeGreaterThanOrEqual(2);
  });

  it('모자라면 몇 개 더 필요한지 알려 주고 아무것도 안 바뀐다', () => {
    const w = new Wallet();
    w.candy = 3;
    const state = shopState(w, 'piano');
    expect(state).toEqual({ can: false, reason: 'candy', missing: priceOf('piano')! - 3 });
    expect(buy(w, 'piano')).toBe(false);
    expect(w.candy).toBe(3);
    expect(w.items).toEqual([]);
  });

  it('선물로 받은 같은 가구도 여러 개 쌓이고, 옷은 하나만', () => {
    const w = new Wallet();
    w.grant({ candy: 1, items: ['plant', 'dress-flower'] });
    w.grant({ candy: 1, items: ['plant', 'dress-flower'] });
    expect(w.items.filter((x) => x === 'plant')).toHaveLength(2);
    expect(w.items.filter((x) => x === 'dress-flower')).toHaveLength(1);
    const again = new Wallet();
    again.load(w.toJSON());
    expect(again.items).toEqual(w.items);
  });

  it('아이템(옷·가구)이 30개 넘는다', () => {
    const n = Object.values(allItems()).filter((x) => x.kind === 'furniture' || x.kind === 'outfit').length;
    expect(n).toBeGreaterThanOrEqual(30);
  });
});
