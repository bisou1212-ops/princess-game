import { describe, expect, it } from 'vitest';
import { MINIGAMES, MemoryGame, makeDeck } from './minigames';
import { getCharacter } from './dialogue';
import { hasItem } from './items';

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

describe('카드 짝 맞추기', () => {
  it('카드 그림은 모두 있는 아이템·친구다', () => {
    for (const id of MINIGAMES.cards.things) expect(hasItem(id), id).toBe(true);
    for (const id of MINIGAMES.cards.friends) expect(getCharacter(id)).toBeDefined();
  });

  it('짝 n개 = 카드 2n장, 그림마다 정확히 두 장', () => {
    const deck = makeDeck(4, 'thing', MINIGAMES.cards, seeded(3));
    expect(deck).toHaveLength(8);
    const count = new Map<string, number>();
    for (const c of deck) count.set(c.face, (count.get(c.face) ?? 0) + 1);
    expect([...count.values()].every((n) => n === 2)).toBe(true);
  });

  it('같은 두 장은 열린 채로, 다른 두 장은 다시 덮인다. 다 찾으면 끝', () => {
    const game = new MemoryGame(makeDeck(3, 'friend', MINIGAMES.cards, seeded(5)));
    const cards = game.cards;
    // 틀린 짝 먼저
    const other = cards.findIndex((c) => c.face !== cards[0].face);
    expect(game.flip(0).type).toBe('first');
    expect(game.flip(other).type).toBe('miss');
    expect(game.flip(1).type).toBe('ignored'); // 덮일 때까지 기다림
    game.hide();
    expect(game.isUp(0)).toBe(false);
    // 이제 모두 맞히기
    const seen = new Set<number>();
    let last = null;
    for (let i = 0; i < cards.length; i++) {
      if (seen.has(i)) continue;
      const j = cards.findIndex((c, k) => k !== i && c.face === cards[i].face);
      seen.add(i).add(j);
      game.flip(i);
      last = game.flip(j);
      expect(last.type).toBe('match');
    }
    expect(last).toMatchObject({ type: 'match', done: true });
    expect(game.done).toBe(true);
    expect(game.flip(0).type).toBe('ignored');
  });
});
