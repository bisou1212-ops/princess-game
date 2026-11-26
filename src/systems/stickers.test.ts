import { describe, expect, it } from 'vitest';
import { STICKERS, StickerBook, pickupCounter } from './stickers';
import { GameState } from './game-state';

describe('스티커 앨범', () => {
  it('스티커 id 는 겹치지 않고, 얻는 방법 글이 있다', () => {
    expect(new Set(STICKERS.map((s) => s.id)).size).toBe(STICKERS.length);
    for (const s of STICKERS) {
      expect(s.at).toBeGreaterThan(0);
      expect(s.hint.length).toBeGreaterThan(0);
    }
  });

  it('셈이 정해진 횟수가 되면 한 번만 붙는다', () => {
    const book = new StickerBook();
    const got: string[] = [];
    book.onEarn = (s) => got.push(s.id);
    expect(book.record('quest').map((s) => s.id)).toEqual(['first-quest']);
    for (let i = 0; i < 3; i++) book.record('quest');
    expect(book.record('quest').map((s) => s.id)).toEqual(['helper']);
    expect(book.record('quest')).toEqual([]);
    expect(got).toEqual(['first-quest', 'helper']);
    expect(book.unseen.size).toBe(2);
    book.markSeen();
    expect(book.unseen.size).toBe(0);
  });

  it('여러 개를 한 번에 세면 (별사탕) 넘은 것이 모두 붙는다', () => {
    const book = new StickerBook();
    expect(book.record('candy', 31).map((s) => s.id)).toEqual(['candy-rich']);
  });

  it('저장했다 불러와도 그대로, 이상한 값은 버린다', () => {
    const a = new StickerBook();
    a.record('cards', 5);
    const b = new StickerBook();
    b.load(JSON.parse(JSON.stringify({ ...a.toJSON(), earned: [...a.toJSON().earned, 'nope'], counts: { ...a.toJSON().counts, bad: 'x' } })));
    expect([...b.earned].sort()).toEqual(['memory', 'memory-star']);
    expect(b.count('cards')).toBe(5);
    expect(b.count('bad')).toBe(0);
  });

  it('주운 물건의 셈 이름', () => {
    expect(pickupCounter('flower-red')).toBe('flower');
    expect(pickupCounter('strawberry')).toBe('berry');
    expect(pickupCounter('flowerpot')).toBe('pot');
    expect(pickupCounter('letter')).toBeNull();
  });

  it('스티커가 생기기 전 저장을 불러오면 이미 한 일만큼 스티커가 붙는다', () => {
    const old = new GameState();
    old.quests.talk('pippi-comfort'); // 기분 부탁: 말하면 바로 해결
    old.wallet.candy = 35;
    const save = old.toSave() as unknown as Record<string, unknown>;
    delete save.stickers;
    const now = new GameState();
    now.applySave(save);
    expect(now.stickers.earned.has('first-quest')).toBe(true);
    expect(now.stickers.earned.has('candy-rich')).toBe(true);
    expect(now.stickers.unseen.size).toBeGreaterThan(0);
  });
});
