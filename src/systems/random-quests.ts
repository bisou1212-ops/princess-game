import data from '../data/random-quests.json';
import { getDialogue, type DialogueLine } from './dialogue';
import { countWithUnit, countingWord, getItem } from './items';
import type { NavGrid, Point } from './navigation/nav-grid';
import type { QuestDef } from './quests';

/**
 * 할 때마다 달라지는 부탁 (random-quests.json).
 * 친구의 이야기 부탁(quests.json)을 다 끝내면, 말을 걸 때마다 템플릿 하나를 골라
 * 물건 색·개수·놓이는 자리·이유·받는 친구를 무작위로 정해 새 부탁을 만든다.
 * three.js와 분리된 순수 로직 (rng를 넣어 테스트에서 결과를 고정할 수 있다).
 */
export interface RandomTemplate {
  id: string;
  type: 'collect' | 'deliver' | 'talk';
  givers: string[];
  items: string[];
  count?: [number, number];
  decoys?: number;
  dialogue: string;
  reasons: string[];
  /** talk(기분 알아맞히기): 친구가 들려주는 상황과 그때의 기분 */
  situations?: Array<{ mood: string; text: string }>;
}

interface RandomData {
  templates: RandomTemplate[];
  candy: [number, number];
  giftChance: number;
  gifts: string[];
}

const config = data as unknown as RandomData;
export const RANDOM_TEMPLATES: readonly RandomTemplate[] = config.templates;

/** 대사에 끼워 넣을 말 ({item}, {count} …) */
export type QuestVars = Record<string, string>;

export interface RandomQuest {
  id: string;
  def: QuestDef;
  vars: QuestVars;
}

export type Rng = () => number;

/** "하나, 둘, 셋" */
export function countingOut(n: number): string {
  return Array.from({ length: n }, (_, i) => countingWord(i + 1)).join(', ');
}

/** 부탁 대사에 넣을 기본 말: 물건 이름·영어·개수·센 말·친구 (모든 부탁에 쓸 수 있음) */
export function questVars(def: QuestDef): QuestVars {
  const vars: QuestVars = { from: def.giver };
  const g = def.goal;
  if (g.type === 'talk') return vars;
  const item = getItem(g.item);
  Object.assign(vars, { itemId: g.item, item: item.name, en: item.en });
  if (g.type === 'collect') {
    vars.count = countWithUnit(g.count, item.unit ?? '개');
    vars.counting = countingOut(g.count);
  } else {
    vars.to = g.to;
  }
  return vars;
}

/**
 * 이야기 부탁(quests.json)을 이번 게임에 맞게 굴리기: vary에 적힌 대로
 * 물건(색)·개수·놓이는 자리를 무작위로 정한다. 대사·선물·친구는 그대로.
 */
export function rollStoryQuest(def: QuestDef, spots: (n: number) => Point[], rng: Rng = Math.random): { def: QuestDef; vars: QuestVars } | null {
  const v = def.vary;
  if (!v || def.goal.type !== 'collect') return null;
  const itemId = pick(rng, v.items);
  const count = between(rng, v.count);
  // 오답 물건: 원래 섞여 있던 개수만큼, 고른 물건이 아닌 것으로
  const origDecoys = def.spawns.filter((s) => s.item !== (def.goal as { item: string }).item).length;
  const decoyIds = [...new Set([...v.items, ...def.spawns.map((s) => s.item)])].filter((i) => i !== itemId);
  const decoys = decoyIds.length > 0 ? origDecoys : 0;
  const places = spots(count + decoys);
  const answer = Math.min(count, places.length);
  const spawns = places.map((p, i) => ({ item: i < answer ? itemId : pick(rng, decoyIds), x: p.x, z: p.z }));
  const hints: Record<string, string> = {};
  for (const sp of spawns) if (sp.item !== itemId) hints[sp.item] = v.hint;
  const rolled: QuestDef = { ...def, goal: { type: 'collect', item: itemId, count: answer }, spawns, hints };
  return { def: rolled, vars: questVars(rolled) };
}

const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length) % list.length];
const between = (rng: Rng, [lo, hi]: [number, number]) => lo + Math.floor(rng() * (hi - lo + 1));

/** 이 친구가 할 수 있는 무작위 부탁이 있나 */
export function hasRandomQuests(character: string): boolean {
  return RANDOM_TEMPLATES.some((t) => t.givers.includes(character));
}

export interface MakeOptions {
  giver: string;
  /** 지금 장소 (world.json id) */
  location: string;
  /** 같은 장소에 있는 친구들 (배달 받을 친구 후보) */
  townFriends: string[];
  /** 물건을 놓을 빈 자리 n개 */
  spots(n: number): Point[];
  /** 바로 전 부탁 — 같은 물건이 두 번 연속 나오지 않게 */
  previous?: QuestVars;
  rng?: Rng;
}

/** 새 부탁 하나 만들기. 이 친구가 할 수 있는 게 없으면 null */
export function makeRandomQuest(o: MakeOptions): RandomQuest | null {
  const rng = o.rng ?? Math.random;
  const friends = o.townFriends.filter((f) => f !== o.giver);
  const templates = RANDOM_TEMPLATES.filter(
    (t) => t.givers.includes(o.giver) && (t.type !== 'deliver' || friends.length > 0) && (t.type !== 'talk' || (t.situations?.length ?? 0) > 0),
  );
  if (templates.length === 0) return null;
  // 바로 전과 다른 종류를 먼저 (종류가 하나뿐이면 같은 종류)
  const fresh = templates.filter((t) => t.id !== o.previous?.template);
  const t = pick(rng, fresh.length > 0 ? fresh : templates);
  const id = `rq:${o.giver}:${Date.now().toString(36)}${Math.floor(rng() * 1e6).toString(36)}`;
  const rewards = {
    candy: between(rng, config.candy),
    items: rng() < config.giftChance ? [pick(rng, config.gifts)] : [],
  };

  if (t.type === 'talk') {
    // 기분 알아맞히기: 바로 전과 다른 상황
    const choices = t.situations!.filter((s) => s.text !== o.previous?.situation);
    const sit = pick(rng, choices.length > 0 ? choices : t.situations!);
    const dialogue = `${t.dialogue}-${sit.mood}`;
    return {
      id,
      vars: { template: t.id, from: o.giver, situation: sit.text, mood: sit.mood },
      def: {
        giver: o.giver,
        location: o.location,
        title: '기분 알아맞히기',
        goal: { type: 'talk' },
        spawns: [],
        hints: {},
        dialogue: { offer: dialogue, progress: dialogue, complete: dialogue, done: dialogue },
        rewards,
      },
    };
  }

  const itemChoices = t.items.filter((i) => i !== o.previous?.itemId);
  const itemId = pick(rng, itemChoices.length > 0 ? itemChoices : t.items);
  const item = getItem(itemId);
  const vars: QuestVars = {
    template: t.id,
    itemId,
    item: item.name,
    en: item.en,
    reason: pick(rng, t.reasons),
    from: o.giver,
  };
  const dlg = (stage: string) => `${t.dialogue}-${stage}`;

  if (t.type === 'deliver') {
    const to = pick(rng, friends);
    vars.to = to;
    return {
      id,
      vars,
      def: {
        giver: o.giver,
        location: o.location,
        title: `${item.name} 전하기`,
        goal: { type: 'deliver', item: itemId, to },
        spawns: [],
        hints: {},
        dialogue: { offer: dlg('offer'), progress: dlg('progress'), complete: dlg('complete'), done: dlg('done') },
        rewards,
      },
    };
  }

  const count = between(rng, t.count ?? [2, 4]);
  const decoyIds = t.items.filter((i) => i !== itemId);
  const decoyCount = Math.min(t.decoys ?? 0, decoyIds.length > 0 ? t.decoys ?? 0 : 0);
  const spots = o.spots(count + decoyCount);
  // 자리가 모자라면 (아주 좁은 장소) 정답부터 채운다
  const answer = Math.min(count, spots.length);
  const spawns = spots.map((p, i) => ({ item: i < answer ? itemId : pick(rng, decoyIds), x: p.x, z: p.z }));
  const hints: Record<string, string> = {};
  for (const s of spawns) if (s.item !== itemId) hints[s.item] = dlg('hint');
  vars.count = countWithUnit(answer, item.unit ?? '개');
  vars.counting = countingOut(answer);
  return {
    id,
    vars,
    def: {
      giver: o.giver,
      location: o.location,
      title: `${item.name} ${vars.count}`,
      goal: { type: 'collect', item: itemId, count: answer },
      spawns,
      hints,
      dialogue: { offer: dlg('offer'), progress: dlg('progress'), ready: dlg('ready'), complete: dlg('complete'), done: dlg('done') },
      rewards,
    },
  };
}

/**
 * 물건을 놓을 빈 자리 n개: 걸을 수 있는 칸 중에서, 피할 곳(친구·시작 자리·문)과
 * 서로 minGap m 이상 떨어진 곳을 무작위로.
 */
export function randomSpots(grid: NavGrid, n: number, avoid: Point[], rng: Rng = Math.random, minGap = 2.2): Point[] {
  const cells: Point[] = [];
  for (let r = 1; r < grid.rows - 1; r++) {
    for (let c = 1; c < grid.cols - 1; c++) {
      // 주변 칸까지 걸을 수 있는 곳만 (벽에 딱 붙은 자리는 줍기 어려움)
      if (!grid.isWalkable(c, r) || !grid.isWalkable(c + 1, r) || !grid.isWalkable(c - 1, r) || !grid.isWalkable(c, r + 1) || !grid.isWalkable(c, r - 1)) continue;
      cells.push(grid.cellCenter(c, r));
    }
  }
  // 섞기
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const out: Point[] = [];
  const far = (p: Point, list: Point[], gap: number) => list.every((q) => Math.hypot(p.x - q.x, p.z - q.z) >= gap);
  for (const gap of [minGap, minGap * 0.6]) {
    for (const p of cells) {
      if (out.length >= n) break;
      if (far(p, avoid, 1.6) && far(p, out, gap)) out.push(p);
    }
    if (out.length >= n) break;
  }
  return out;
}

/** 받침 있는 글자면 true (조사 고르기) */
function hasBatchim(word: string): boolean {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return /[0-9LMNRlmnr]$/.test(ch); // 숫자·영어는 대충
  return code % 28 !== 0;
}

const JOSA: Record<string, [string, string]> = {
  을: ['을', '를'],
  를: ['을', '를'],
  이: ['이', '가'],
  가: ['이', '가'],
  은: ['은', '는'],
  는: ['은', '는'],
  야: ['이야', '야'],
  이야: ['이야', '야'],
  과: ['과', '와'],
  와: ['과', '와'],
  예요: ['이에요', '예요'],
  이에요: ['이에요', '예요'],
};

/** "{item|을}" → "빨간 꽃을" / "편지를" */
export function fillText(text: string, vars: QuestVars, names: (id: string) => string): string {
  return text.replace(/\{(\w+)(?:\|([^}]+))?\}/g, (whole, key: string, josa?: string) => {
    let v = vars[key];
    if (v === undefined) return whole;
    if (key === 'to' || key === 'from') v = names(v);
    if (!josa) return v;
    const pair = JOSA[josa];
    return pair ? v + (hasBatchim(v) ? pair[0] : pair[1]) : v + josa;
  });
}

/** 부탁 대사에 친구 이름·물건을 끼워 넣는다 (speaker 'giver'·'receiver'도 바꿈) */
export function fillLines(lines: DialogueLine[], vars: QuestVars, names: (id: string) => string): DialogueLine[] {
  return lines.map((l) => {
    const line: DialogueLine = {
      ...l,
      speaker: l.speaker === 'giver' ? vars.from : l.speaker === 'receiver' ? vars.to : l.speaker,
      text: fillText(l.text, vars, names),
    };
    // 고르기 카드의 대답 대사도 미리 채워 둔다
    if (l.choices) {
      line.choices = l.choices.map((c) => ({
        ...c,
        label: fillText(c.label, vars, names),
        replyLines: c.reply ? fillLines(getDialogue(c.reply), vars, names) : c.replyLines,
      }));
    }
    return line;
  });
}
