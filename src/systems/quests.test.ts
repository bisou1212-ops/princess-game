import { describe, it, expect } from 'vitest';
import { QuestBook, allQuestDefs, type QuestDef } from './quests';
import { Wallet } from './rewards';
import { allItems, countWithUnit, countingWord } from './items';
import { allCharacters, allDialogues } from './dialogue';
import { buildNavGrid, courtyardLayout } from '../scenes/castle/courtyard-layout';

const def: QuestDef = {
  giver: 'tori',
  location: 'castle',
  title: '테스트',
  goal: { type: 'collect', item: 'flower-red', count: 2 },
  spawns: [],
  hints: { 'flower-blue': 'hint-blue' },
  dialogue: { offer: 'o', progress: 'p', ready: 'r', complete: 'c', done: 'd' },
  rewards: { candy: 3, items: ['dress-flower'] },
};

describe('부탁 진행', () => {
  it('받기 → 모으기 → 가져다주기 → 끝', () => {
    const book = new QuestBook({ q: def });
    expect(book.wantsAttention('q')).toBe(true);
    expect(book.collect('flower-red')).toBeNull(); // 받기 전에는 안 셈

    expect(book.talk('q')).toMatchObject({ event: 'offered', dialogue: 'o' });
    expect(book.wantsAttention('q')).toBe(false);
    expect(book.talk('q')).toMatchObject({ event: 'progress', dialogue: 'p' });

    expect(book.collect('flower-yellow')).toBeNull();
    expect(book.collect('flower-red')).toEqual({ questId: 'q', count: 1, target: 2, nowReady: false });
    expect(book.collect('flower-red')).toEqual({ questId: 'q', count: 2, target: 2, nowReady: true });
    expect(book.get('q').status).toBe('ready');
    expect(book.wantsAttention('q')).toBe(true);
    expect(book.collect('flower-red')).toBeNull(); // 더 모아도 넘치지 않음

    const done = book.talk('q');
    expect(done).toMatchObject({ event: 'completed', dialogue: 'c', rewards: def.rewards });
    expect(book.talk('q')).toMatchObject({ event: 'done', dialogue: 'd' });
    expect(book.current()).toBeNull();
  });

  it('오답 물건은 진행 중일 때만 힌트를 준다', () => {
    const book = new QuestBook({ q: def });
    expect(book.hintFor('flower-blue')).toBeNull();
    book.talk('q');
    expect(book.hintFor('flower-blue')).toBe('hint-blue');
    expect(book.hintFor('flower-red')).toBeNull();
  });

  it('선물을 받으면 별사탕이 늘고 같은 옷은 한 번만 들어간다', () => {
    const w = new Wallet();
    w.grant(def.rewards);
    w.grant(def.rewards);
    expect(w.candy).toBe(6);
    expect(w.items).toEqual(['dress-flower']);
  });
});

describe('숫자 읽기', () => {
  it('셀 때와 단위 앞의 말이 다르다', () => {
    expect([1, 2, 3].map(countingWord)).toEqual(['하나', '둘', '셋']);
    expect(countWithUnit(5, '개')).toBe('다섯 개');
    expect(countWithUnit(1, '송이')).toBe('한 송이');
    expect(countingWord(42)).toBe('42');
  });
});

describe('부탁 데이터 (quests.json)', () => {
  const quests = allQuestDefs();
  const items = allItems();
  const dialogues = allDialogues();
  const characters = allCharacters();
  const grid = buildNavGrid(courtyardLayout);

  it('참조하는 아이템·대사·캐릭터가 모두 있다', () => {
    for (const [id, q] of Object.entries(quests)) {
      expect(characters[q.giver], id).toBeDefined();
      expect(items[q.goal.item], id).toBeDefined();
      for (const d of Object.values(q.dialogue)) expect(dialogues[d], `${id}: ${d}`).toBeDefined();
      for (const [item, d] of Object.entries(q.hints)) {
        expect(items[item], `${id}: ${item}`).toBeDefined();
        expect(dialogues[d], `${id}: ${d}`).toBeDefined();
      }
      for (const r of q.rewards.items) expect(items[r], `${id}: ${r}`).toBeDefined();
    }
  });

  it('정답 물건이 목표 개수만큼 놓이고, 모두 걸어갈 수 있는 곳에 있다', () => {
    for (const [id, q] of Object.entries(quests)) {
      const correct = q.spawns.filter((s) => s.item === q.goal.item).length;
      expect(correct, id).toBeGreaterThanOrEqual(q.goal.count);
      for (const s of q.spawns) {
        expect(items[s.item], `${id}: ${s.item}`).toBeDefined();
        expect(grid.isWalkableAt(s.x, s.z), `${id}: (${s.x}, ${s.z})`).toBe(true);
        // 오답 물건에는 힌트가 있어야 아이가 헤매지 않는다
        if (s.item !== q.goal.item) expect(q.hints[s.item], `${id}: ${s.item} 힌트`).toBeDefined();
      }
    }
  });

  it('마당의 친구가 가리키는 부탁이 있고, 부탁한 친구와 같다', () => {
    for (const n of courtyardLayout.npcs) {
      if (!n.quest) continue;
      expect(quests[n.quest], n.id).toBeDefined();
      expect(quests[n.quest].giver).toBe(n.character);
    }
  });
});
