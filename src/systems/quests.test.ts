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
      if ('item' in q.goal) expect(items[q.goal.item], id).toBeDefined();
      for (const d of Object.values(q.dialogue)) if (d) expect(dialogues[d], `${id}: ${d}`).toBeDefined();
      if (q.goal.type === 'collect') expect(q.dialogue.ready, `${id}: ready 대사`).toBeDefined();
      if (q.requires) expect(quests[q.requires], `${id}: requires`).toBeDefined();
      for (const [item, d] of Object.entries(q.hints)) {
        expect(items[item], `${id}: ${item}`).toBeDefined();
        expect(dialogues[d], `${id}: ${d}`).toBeDefined();
      }
      for (const r of q.rewards.items) expect(items[r], `${id}: ${r}`).toBeDefined();
    }
  });

  it('정답 물건이 목표 개수만큼 놓이고, 모두 걸어갈 수 있는 곳에 있다', () => {
    for (const [id, q] of Object.entries(quests)) {
      const goalItem = 'item' in q.goal ? q.goal.item : null;
      const correct = q.spawns.filter((s) => s.item === goalItem).length;
      if (q.goal.type === 'collect') expect(correct, id).toBeGreaterThanOrEqual(q.goal.count);
      for (const s of q.spawns) {
        expect(items[s.item], `${id}: ${s.item}`).toBeDefined();
        if (q.location === 'castle') expect(grid.isWalkableAt(s.x, s.z), `${id}: (${s.x}, ${s.z})`).toBe(true);
        // 오답 물건에는 힌트가 있어야 아이가 헤매지 않는다
        if (s.item !== goalItem) expect(q.hints[s.item], `${id}: ${s.item} 힌트`).toBeDefined();
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

describe('친구마다 여러 부탁 + 배달 부탁', () => {
  const base = { location: 'castle', spawns: [], hints: {}, rewards: { candy: 1, items: [] } };
  const dlg = (p: string) => ({ offer: `${p}-o`, progress: `${p}-p`, ready: `${p}-r`, complete: `${p}-c`, done: `${p}-d` });
  const defs: Record<string, QuestDef> = {
    a1: { ...base, giver: 'tori', title: '1', goal: { type: 'collect', item: 'flower-red', count: 1 }, dialogue: dlg('a1') },
    a2: { ...base, giver: 'tori', title: '2', requires: 'a1', goal: { type: 'collect', item: 'flower-yellow', count: 1 }, dialogue: dlg('a2') },
    d1: { ...base, giver: 'flora', title: '배달', goal: { type: 'deliver', item: 'invitation', to: 'gogo' }, dialogue: dlg('d1') },
  };

  it('같은 친구의 부탁은 하나씩 차례로', () => {
    const b = new QuestBook(defs);
    expect(b.talkToCharacter('tori')).toMatchObject({ questId: 'a1', event: 'offered' });
    b.collect('flower-red');
    expect(b.talkToCharacter('tori')).toMatchObject({ questId: 'a1', event: 'completed' });
    expect(b.characterWantsAttention('tori')).toBe(true); // 다음 부탁이 기다림
    expect(b.talkToCharacter('tori')).toMatchObject({ questId: 'a2', event: 'offered' });
    b.collect('flower-yellow');
    b.talkToCharacter('tori');
    expect(b.talkToCharacter('tori')).toMatchObject({ questId: 'a2', event: 'done', dialogue: 'a2-d' });
    expect(b.characterWantsAttention('tori')).toBe(false);
  });

  it('배달: 받는 친구에게 말을 걸면 끝나고 선물', () => {
    const b = new QuestBook(defs);
    expect(b.talkToCharacter('gogo')).toBeNull(); // 아직 받은 게 없음
    expect(b.talkToCharacter('flora')).toMatchObject({ questId: 'd1', event: 'offered' });
    expect(b.characterWantsAttention('gogo')).toBe(true);
    expect(b.talkToCharacter('flora')).toMatchObject({ event: 'progress' });
    expect(b.talkToCharacter('gogo')).toMatchObject({ questId: 'd1', event: 'delivered', dialogue: 'd1-c' });
    expect(b.get('d1').status).toBe('completed');
    expect(b.characterWantsAttention('gogo')).toBe(false);
    expect(b.talkToCharacter('flora')).toMatchObject({ event: 'done' });
  });

  it('배달 부탁은 저장에서 ready 로 불러와도 active 로 고친다', () => {
    const b = new QuestBook(defs);
    b.load({ d1: { status: 'ready', count: 0, collected: [] } });
    expect(b.get('d1').status).toBe('active');
  });
});

describe('부탁 데이터: 친구·배달 대상', () => {
  it('부탁하는 친구와 배달받는 친구가 어딘가에 서 있다', async () => {
    const { LOCATIONS, canTravelTo, loadLocationLayout } = await import('./world');
    const present = new Set<string>();
    for (const l of LOCATIONS.filter((x) => canTravelTo(x.id))) for (const n of (await loadLocationLayout(l.id)).npcs) present.add(n.character);
    for (const [id, q] of Object.entries(allQuestDefs())) {
      expect(present.has(q.giver), `${id}: giver ${q.giver}`).toBe(true);
      if (q.goal.type === 'deliver') {
        expect(present.has(q.goal.to), `${id}: to ${q.goal.to}`).toBe(true);
        expect(allItems()[q.goal.item]?.kind, `${id}: 배달 물건`).toBe('letter');
      }
    }
  });

  it('물건은 그 장소에서 걸어갈 수 있는 곳에 놓인다', async () => {
    const { loadLocationLayout } = await import('./world');
    for (const [id, q] of Object.entries(allQuestDefs())) {
      const grid = buildNavGrid(await loadLocationLayout(q.location));
      for (const s of q.spawns) expect(grid.isWalkableAt(s.x, s.z), `${id}: (${s.x}, ${s.z})`).toBe(true);
    }
  });
});

describe('talk 부탁 (삐삐 위로하기)', () => {
  it('대화를 하면 바로 해결되고, 해결 전까지 친구는 슬프다', () => {
    const defs: Record<string, QuestDef> = {
      t: { giver: 'pippi', location: 'flower-kingdom', title: '위로', giverMood: 'sad', goal: { type: 'talk' }, spawns: [], hints: {},
        dialogue: { offer: 'o', progress: 'o', complete: 'o', done: 'd' }, rewards: { candy: 1, items: [] } },
    };
    const b = new QuestBook(defs);
    expect(b.moodOf('pippi')).toBe('sad');
    expect(b.characterWantsAttention('pippi')).toBe(true);
    expect(b.talkToCharacter('pippi')).toMatchObject({ event: 'completed', dialogue: 'o' });
    expect(b.moodOf('pippi')).toBeNull();
    expect(b.talkToCharacter('pippi')).toMatchObject({ event: 'done', dialogue: 'd' });
    expect(b.current()).toBeNull();
  });
});
