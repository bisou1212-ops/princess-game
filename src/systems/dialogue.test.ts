import { describe, it, expect } from 'vitest';
import {
  DialogueSession,
  allCharacters,
  allDialogues,
  estimateWordTimes,
  pauseAfter,
  prosodyFor,
  splitSentences,
  tokenize,
  wordIndexAt,
} from './dialogue';
import { courtyardLayout } from '../scenes/castle/courtyard-layout';
import { allQuestDefs } from './quests';

describe('어절 나누기·강조 위치', () => {
  const text = '안녕! 나는 꽃 왕국의  플로라 공주야.';
  const tokens = tokenize(text);

  it('띄어쓰기 단위로 나누고 원문 위치를 기억한다', () => {
    expect(tokens.map((t) => t.text)).toEqual(['안녕!', '나는', '꽃', '왕국의', '플로라', '공주야.']);
    for (const t of tokens) expect(text.slice(t.start, t.end)).toBe(t.text);
  });

  it('TTS 글자 위치로 몇 번째 어절인지 찾는다', () => {
    expect(wordIndexAt(tokens, 0)).toBe(0);
    expect(wordIndexAt(tokens, text.indexOf('꽃'))).toBe(2);
    expect(wordIndexAt(tokens, text.indexOf('플로라') + 1)).toBe(4);
    expect(wordIndexAt(tokens, text.length)).toBe(5);
  });

  it('추정 시간표는 순서대로 늘어나고, 빠르게 읽으면 짧아진다', () => {
    const slow = estimateWordTimes(tokens, 0.8);
    const fast = estimateWordTimes(tokens, 1.5);
    for (let i = 1; i < slow.starts.length; i++) expect(slow.starts[i]).toBeGreaterThan(slow.starts[i - 1]);
    expect(fast.total).toBeLessThan(slow.total);
  });
});

describe('끊어 읽기·억양', () => {
  it('문장부호마다 나누고 추임새도 따로 읽는다', () => {
    const text = '음~ 새로 이사 온 공주님, 맞지? 헤헤… 반가워!';
    const segs = splitSentences(text);
    expect(segs.map((s) => s.text)).toEqual(['음~', '새로 이사 온 공주님, 맞지?', '헤헤…', '반가워!']);
    for (const s of segs) expect(text.slice(s.start, s.end)).toBe(s.text);
  });

  it('부호 없는 끝 문장과 부호만 있는 조각을 처리한다', () => {
    expect(splitSentences('안녕 ... 친구야').map((s) => s.text)).toEqual(['안녕 ...', '친구야']);
    expect(splitSentences('!!!')).toEqual([]);
  });

  it('물음표·느낌표는 높게, 기분에 따라 달라지고, 범위를 넘지 않는다', () => {
    const base = { pitch: 1.2, rate: 0.95 };
    const plain = prosodyFor('그래.', base);
    expect(prosodyFor('그래?', base).pitch).toBeGreaterThan(plain.pitch);
    expect(prosodyFor('그래!', base).pitch).toBeGreaterThan(plain.pitch);
    expect(prosodyFor('그래.', base, 'shy').rate).toBeLessThan(plain.rate);
    const extreme = prosodyFor('와?', { pitch: 2, rate: 2 }, 'excited');
    expect(extreme.pitch).toBeLessThanOrEqual(1.45);
    expect(extreme.rate).toBeLessThanOrEqual(1.3);
  });

  it('추임새 뒤에는 조금 더 쉰다', () => {
    expect(pauseAfter('음~')).toBeGreaterThan(pauseAfter('그래.'));
  });
});

describe('대화 진행', () => {
  it('한 줄씩 넘기고 끝나면 null', () => {
    const s = new DialogueSession([
      { speaker: 'flora', text: '하나' },
      { speaker: 'flora', text: '둘' },
    ]);
    expect(s.current?.text).toBe('하나');
    expect(s.isLast).toBe(false);
    expect(s.next()?.text).toBe('둘');
    expect(s.isLast).toBe(true);
    expect(s.next()).toBeNull();
    expect(s.next()).toBeNull();
  });
});

describe('대사·캐릭터 데이터', () => {
  const characters = allCharacters();
  const dialogues = allDialogues();

  it('모든 대사의 화자가 characters.json에 있다', () => {
    for (const [id, lines] of Object.entries(dialogues)) {
      expect(lines.length, id).toBeGreaterThan(0);
      for (const line of lines) {
        // guest=초대한 친구, giver·receiver=무작위 부탁의 친구, pet=아이가 이름 붙인 펫 (실행 중에 바뀜)
        if (!['guest', 'giver', 'receiver', 'pet'].includes(line.speaker)) expect(characters[line.speaker], `${id}: ${line.speaker}`).toBeDefined();
        expect(line.text.trim().length).toBeGreaterThan(0);
        if (line.mood) expect(['normal', 'happy', 'excited', 'curious', 'shy', 'sad']).toContain(line.mood);
      }
    }
  });

  it('캐릭터 목소리 값이 브라우저 허용 범위 안이다', () => {
    for (const c of Object.values(characters)) {
      expect(c.voice.pitch).toBeGreaterThanOrEqual(0);
      expect(c.voice.pitch).toBeLessThanOrEqual(2);
      expect(c.voice.rate).toBeGreaterThanOrEqual(0.1);
      expect(c.voice.rate).toBeLessThanOrEqual(2);
      expect(c.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('마당의 친구가 가리키는 캐릭터·대사가 있다', () => {
    for (const n of courtyardLayout.npcs) {
      expect(characters[n.character], n.id).toBeDefined();
      if (n.dialogue) expect(dialogues[n.dialogue], n.id).toBeDefined();
      const gives = Object.values(allQuestDefs()).some((q) => q.giver === n.character);
      expect(n.dialogue !== undefined || gives, `${n.id}: 인사 대사나 부탁 중 하나는 있어야 함`).toBe(true);
    }
  });
});

describe('고르기 (감정·위로하기)', () => {
  it('고르기 카드의 대답 대사가 있고, 맞는 카드가 하나 이상 있다', () => {
    const dialogues = allDialogues();
    for (const [id, lines] of Object.entries(dialogues)) {
      for (const line of lines) {
        if (!line.choices) continue;
        expect(line.choices.length, id).toBeGreaterThanOrEqual(2);
        expect(line.choices.some((c) => c.correct !== false), `${id}: 맞는 카드`).toBe(true);
        for (const c of line.choices) if (c.reply) expect(dialogues[c.reply], `${id}: ${c.reply}`).toBeDefined();
      }
    }
  });

  it('틀린 카드를 고르면 힌트 뒤에 같은 질문이 다시 나온다 (세션 끼워 넣기)', () => {
    const q = { speaker: 'princess', text: '기분은?', choices: [{ id: 'a', label: 'A', icon: 'happy', correct: false }] };
    const s = new DialogueSession([{ speaker: 'pippi', text: '흑흑' }, q, { speaker: 'pippi', text: '고마워' }]);
    s.next();
    s.insertNext([{ speaker: 'princess', text: '힌트' }, q]);
    expect(s.next()?.text).toBe('힌트');
    expect(s.next()).toBe(q);
    expect(s.next()?.text).toBe('고마워');
  });
});
