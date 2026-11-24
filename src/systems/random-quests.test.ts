import { describe, it, expect } from 'vitest';
import { RANDOM_TEMPLATES, fillLines, fillText, makeRandomQuest, questVars, randomSpots, rollStoryQuest, type MakeOptions } from './random-quests';
import { allQuestDefs } from './quests';
import { getDialogue, type DialogueLine } from './dialogue';
import { QuestBook } from './quests';
import { allDialogues, getCharacter } from './dialogue';
import { hasItem } from './items';
import { NavGrid } from './navigation/nav-grid';
import { GameState } from './game-state';
import { MemoryStore } from '../core/storage';

/** 고정된 난수 (테스트마다 같은 결과) */
function seeded(seed = 1): () => number {
  let s = (seed * 2654435761) % 2147483647 || 1;
  for (let i = 0; i < 4; i++) s = (s * 16807) % 2147483647; // 처음 몇 개는 버림 (작은 seed는 앞쪽 값이 비슷함)
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const spotsLine = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i * 3, z: 0 }));
const opts = (o: Partial<MakeOptions> = {}): MakeOptions => ({
  giver: 'tori',
  location: 'castle',
  townFriends: ['tori', 'flora'],
  spots: spotsLine,
  rng: seeded(),
  ...o,
});
const names = (id: string) => getCharacter(id).name;

describe('할 때마다 달라지는 부탁', () => {
  it('템플릿의 물건·대사·친구가 모두 있다', () => {
    const d = allDialogues();
    for (const t of RANDOM_TEMPLATES) {
      for (const i of t.items) expect(hasItem(i), i).toBe(true);
      for (const g of t.givers) expect(getCharacter(g)).toBeDefined();
      if (t.type === 'talk') {
        for (const sit of t.situations ?? []) expect(d[`${t.dialogue}-${sit.mood}`], sit.mood).toBeDefined();
        continue;
      }
      const stages = t.type === 'deliver' ? ['offer', 'progress', 'complete', 'done'] : ['offer', 'progress', 'ready', 'complete', 'done', 'hint'];
      for (const s of stages) expect(d[`${t.dialogue}-${s}`], `${t.dialogue}-${s}`).toBeDefined();
    }
  });

  it('만들 때마다 내용이 달라진다', () => {
    const rng = seeded(7);
    const titles = new Set<string>();
    for (let i = 0; i < 12; i++) titles.add(makeRandomQuest(opts({ rng }))!.def.title);
    expect(titles.size).toBeGreaterThan(4);
  });

  it('모으기 부탁: 정답 개수만큼 놓이고, 오답 물건에는 힌트가 있다', () => {
    for (let seed = 1; seed < 30; seed++) {
      const q = makeRandomQuest(opts({ giver: 'dochi', townFriends: ['dochi', 'gogo'], rng: seeded(seed) }))!;
      if (q.def.goal.type !== 'collect') continue;
      const goal = q.def.goal;
      expect(q.def.spawns.filter((s) => s.item === goal.item)).toHaveLength(goal.count);
      for (const s of q.def.spawns) if (s.item !== goal.item) expect(q.def.hints[s.item]).toBeDefined();
    }
  });

  it('배달 부탁은 같은 장소의 다른 친구에게', () => {
    for (let seed = 1; seed < 30; seed++) {
      const q = makeRandomQuest(opts({ giver: 'flora', rng: seeded(seed) }))!;
      if (q.def.goal.type === 'deliver') expect(q.def.goal.to).toBe('tori');
    }
  });

  it('바로 전과 같은 물건은 연달아 나오지 않는다', () => {
    const rng = seeded(3);
    let prev = makeRandomQuest(opts({ rng }))!;
    for (let i = 0; i < 20; i++) {
      const next = makeRandomQuest(opts({ rng, previous: prev.vars }))!;
      expect(next.vars.itemId).not.toBe(prev.vars.itemId);
      prev = next;
    }
  });

  it('대사에 이름·물건·조사를 알맞게 넣는다', () => {
    const vars = { item: '빨간 꽃', count: '세 송이', from: 'tori', to: 'gogo', en: 'Red flower' };
    expect(fillText('{item} {count|을} 찾아 줄래?', vars, names)).toBe('빨간 꽃 세 송이를 찾아 줄래?');
    expect(fillText('{to}에게 {item|을}', { ...vars, item: '초대장' }, names)).toBe('고고에게 초대장을');
    expect(fillText('{from|이} 보낸 {item|이야}?', { ...vars, item: '편지' }, names)).toBe('토리가 보낸 편지야?');
    expect(fillText('{decoy|야}', { decoy: '블루베리' }, names)).toBe('블루베리야');
    const lines = fillLines([{ speaker: 'receiver', text: '{from|이} 보냈구나' }], vars, names);
    expect(lines[0]).toMatchObject({ speaker: 'gogo', text: '토리가 보냈구나' });
  });

  it('빈자리는 걸을 수 있고 서로 떨어져 있다', () => {
    const grid = new NavGrid({ width: 20, depth: 20, cellSize: 0.5 });
    grid.blockRect(0, 0, 6, 6);
    const spots = randomSpots(grid, 6, [{ x: 8, z: 8 }], seeded(5));
    expect(spots).toHaveLength(6);
    for (const p of spots) {
      expect(grid.isWalkableAt(p.x, p.z)).toBe(true);
      expect(Math.hypot(p.x - 8, p.z - 8)).toBeGreaterThanOrEqual(1.6);
    }
    for (let i = 0; i < spots.length; i++)
      for (let j = i + 1; j < spots.length; j++)
        expect(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z)).toBeGreaterThanOrEqual(2.2 * 0.6);
  });
});

describe('부탁 책: 이야기 부탁 다음엔 무작위 부탁', () => {
  /** 토리의 이야기 부탁을 다 끝낸 책 */
  function doneStory(): QuestBook {
    const book = new QuestBook();
    for (const id of book.storyQuestsOf('tori')) {
      book.talk(id);
      const goal = book.def(id).goal;
      if (goal.type === 'collect') for (let i = 0; i < goal.count; i++) book.collect(goal.item);
      book.talk(id);
    }
    return book;
  }
  const make = (seed: number) => () =>
    makeRandomQuest(opts({ rng: seeded(seed), townFriends: ['tori'] })); // 배달 받을 친구 없음 → 모으기만

  it('이야기 부탁이 남아 있으면 무작위 부탁을 주지 않는다', () => {
    const book = new QuestBook();
    const r = book.talkToCharacter('tori', make(1))!;
    expect(r.questId).toBe('tori-red-flowers');
  });

  it('다 끝내면 말 걸 때마다 새 부탁 → 모으기 → 선물, 끝난 부탁은 하나만 남는다', () => {
    const book = doneStory();
    expect(book.characterWantsAttention('tori')).toBe(true);
    const ids: string[] = [];
    for (let round = 0; round < 3; round++) {
      const offer = book.talkToCharacter('tori', make(round + 2))!;
      expect(offer.vars?.from).toBe('tori');
      ids.push(offer.questId);
      // 기분 부탁은 대화로 바로 끝나고 선물
      if (offer.event === 'completed') continue;
      expect(offer.event).toBe('offered');
      const goal = book.def(offer.questId).goal;
      if (goal.type !== 'collect') throw new Error('모으기여야 함');
      // 하는 중에 다른 친구는 "끝나면 부탁할게"
      for (let i = 0; i < goal.count; i++) book.collect(goal.item);
      const done = book.talkToCharacter('tori', make(99))!;
      expect(done.event).toBe('completed');
      if (done.event === 'completed') expect(done.rewards.candy).toBeGreaterThan(0);
    }
    expect(new Set(ids).size).toBe(3);
    expect(Object.keys(book.randomToJSON())).toHaveLength(1);
  });

  it('다른 부탁을 하는 중이면 새 부탁 대신 기다려 달라고 한다', () => {
    const book = doneStory();
    book.talk('flora-party-invite'); // 배달 하는 중
    const r = book.talkToCharacter('tori', make(4))!;
    expect(r.dialogue).toBe('rq-busy');
  });

  it('하는 중인 무작위 부탁은 저장했다가 그대로 이어진다', async () => {
    const store = new MemoryStore();
    const a = new GameState(store);
    for (const id of a.quests.storyQuestsOf('tori')) {
      a.quests.talk(id);
      const goal = a.quests.def(id).goal;
      if (goal.type === 'collect') for (let i = 0; i < goal.count; i++) a.quests.collect(goal.item);
      a.quests.talk(id);
    }
    const offer = a.quests.talkToCharacter('tori', make(5))!;
    a.quests.collect((a.quests.def(offer.questId).goal as { item: string }).item, 0);
    await a.saveNow();
    const b = new GameState(store);
    await b.load();
    expect(b.quests.current()?.id).toBe(offer.questId);
    expect(b.quests.get(offer.questId).count).toBe(1);
    expect(b.quests.remainingSpawns(offer.questId).some((s) => s.index === 0)).toBe(false);
  });
});

/** 채운 대사에 {…}가 남아 있지 않은지 (고르기 대답까지) */
function leftovers(lines: DialogueLine[]): string[] {
  const out: string[] = [];
  for (const l of lines) {
    if (/[{}]/.test(l.text)) out.push(l.text);
    for (const c of l.choices ?? []) out.push(...leftovers(c.replyLines ?? []));
  }
  return out;
}

describe('게임마다 달라지는 이야기 부탁·기분 부탁', () => {
  it('이야기 부탁은 굴릴 때마다 색·개수·자리가 달라진다', () => {
    const def = allQuestDefs()['tori-red-flowers'];
    const seen = new Set<string>();
    for (let seed = 1; seed < 15; seed++) {
      const r = rollStoryQuest(def, (n) => Array.from({ length: n }, (_, i) => ({ x: i * 2 + seed, z: seed })), seeded(seed))!;
      const g = r.def.goal as { item: string; count: number };
      expect(def.vary!.items).toContain(g.item);
      expect(r.def.spawns.filter((s) => s.item === g.item)).toHaveLength(g.count);
      seen.add(`${g.item}-${g.count}`);
      // 선물·대사는 그대로
      expect(r.def.rewards).toEqual(def.rewards);
      expect(r.def.dialogue).toEqual(def.dialogue);
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it('모든 이야기 부탁 대사가 빈칸 없이 채워진다', () => {
    for (const [id, def] of Object.entries(allQuestDefs())) {
      const vars = questVars(def);
      for (const dlg of Object.values(def.dialogue)) {
        expect(leftovers(fillLines(getDialogue(dlg), vars, names)), `${id}:${dlg}`).toEqual([]);
      }
      for (const hint of Object.values(def.hints)) {
        const v = { ...vars, decoy: '파란 꽃', decoyEn: 'Blue flower' };
        expect(leftovers(fillLines(getDialogue(hint), v, names)), `${id}:${hint}`).toEqual([]);
      }
    }
  });

  it('무작위 부탁 대사도 빈칸 없이 채워진다 (기분 부탁의 고르기 대답 포함)', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed < 60; seed++) {
      const q = makeRandomQuest(opts({ giver: 'pippi', townFriends: ['pippi', 'gogo'], rng: seeded(seed) }))!;
      kinds.add(q.vars.template);
      for (const dlg of new Set(Object.values(q.def.dialogue))) {
        expect(leftovers(fillLines(getDialogue(dlg), q.vars, names)), dlg).toEqual([]);
      }
    }
    expect(kinds).toEqual(new Set(['flowers', 'delivery', 'feelings']));
  });

  it('기분 부탁: 상황에 맞는 기분 카드만 정답', () => {
    for (let seed = 1; seed < 30; seed++) {
      const q = makeRandomQuest(opts({ giver: 'gogo', townFriends: ['gogo'], rng: seeded(seed) }))!;
      if (q.vars.template !== 'feelings') continue;
      const lines = fillLines(getDialogue(q.def.dialogue.offer), q.vars, names);
      const ask = lines.find((l) => l.choices?.some((c) => c.icon === 'sad'))!;
      const right = ask.choices!.filter((c) => c.correct !== false).map((c) => c.id);
      expect(right).toEqual([q.vars.mood]);
      expect(ask.text).toContain('고고');
    }
  });
});

describe('이야기 부탁을 받을 때 굴리기', () => {
  it('처음 받을 때 한 번만 굴리고, 저장 후에도 같은 내용', async () => {
    const store = new MemoryStore();
    const a = new GameState(store);
    let rolls = 0;
    const roll = (def: Parameters<typeof rollStoryQuest>[0]) => {
      rolls++;
      return rollStoryQuest(def, (n) => Array.from({ length: n }, (_, i) => ({ x: i * 2, z: 1 })), seeded(11));
    };
    const offer = a.quests.talkToCharacter('tori', undefined, roll)!;
    expect(offer.questId).toBe('tori-red-flowers');
    expect(offer.vars?.item).toBeDefined();
    a.quests.talkToCharacter('tori', undefined, roll); // 하는 중 → 다시 굴리지 않음
    expect(rolls).toBe(1);
    const goal = a.quests.def('tori-red-flowers').goal as { item: string; count: number };
    await a.saveNow();
    const b = new GameState(store);
    await b.load();
    expect(b.quests.def('tori-red-flowers').goal).toEqual(goal);
    expect(b.quests.varsOf('tori-red-flowers')?.item).toBe(offer.vars?.item);
  });
});
