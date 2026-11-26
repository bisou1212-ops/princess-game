import questsJson from '../data/quests.json';
import { hasRandomQuests, questVars, type QuestVars, type RandomQuest } from './random-quests';

/**
 * 친구의 부탁 (GDD 4·5.3). 실패·시간 제한 없음 — 언제든 다시 말을 걸면 된다.
 * available(아직 안 받음) → active(하는 중) → ready(다 모음) → completed(선물 받음)
 *
 * 부탁 종류
 * - collect: 물건 n개 모아서 부탁한 친구에게 가져가기 (꽃·딸기·화분 세우기 …)
 * - deliver: 받은 물건을 다른 친구(to)에게 전하기 — 받는 친구가 고마워하며 선물을 준다
 * - talk: 대화 안의 고르기(기분 알아차리기·위로하기)를 끝내면 바로 해결 — 선물
 * - seek: 숨바꼭질 — 친구가 숨으면(장소의 hideSpots) 찾아가 말을 걸면(가까이 가면) 해결
 * - play: 친구와 놀이(미니게임)를 끝까지 하면 해결 — 케이크 꾸미기(cake)·꽃밭 물 주기(garden). 중간에 닫으면 다시 말 걸어 이어 하기
 * 친구마다 부탁이 여러 개면 quests.json 순서대로 하나씩 (requires 로 앞 부탁을 지정할 수도 있음)
 */
export type QuestStatus = 'available' | 'active' | 'ready' | 'completed';

export interface QuestSpawn {
  item: string;
  x: number;
  z: number;
}

export interface Reward {
  candy: number;
  items: string[];
}

export type QuestGoal =
  | { type: 'collect'; item: string; count: number }
  | { type: 'deliver'; item: string; to: string }
  | { type: 'talk' }
  /** 미니게임: game = cake(과일 count개 올리기)·garden(꽃 count송이 물 주기), item = 과일·꽃 */
  | { type: 'play'; game: MiniGame; item: string; count: number }
  /** 숨바꼭질: 친구가 숨고, 찾으면(말 걸면) 해결 */
  | { type: 'seek' };

export type MiniGame = 'cake' | 'garden';

export interface QuestDef {
  giver: string;
  /** 물건이 나타나는 장소 (world.json id) */
  location: string;
  title: string;
  /** 이 부탁보다 먼저 끝내야 하는 부탁 */
  requires?: string;
  /** 게임마다 달라지는 부분: items 중 하나, count 범위, 자리는 무작위 (rollStoryQuest) */
  vary?: { items: string[]; count: [number, number]; hint: string };
  /** 부탁을 해결하기 전까지 부탁한 친구의 기분 (sad면 눈물) */
  giverMood?: 'sad';
  goal: QuestGoal;
  spawns: QuestSpawn[];
  hints: Record<string, string>;
  /** deliver: complete = 받는 친구의 대사, ready 는 쓰지 않음 */
  dialogue: { offer: string; progress: string; ready?: string; complete: string; done: string };
  rewards: Reward;
}

const { _comment: _q, ...questDefs } = questsJson as unknown as Record<string, QuestDef> & { _comment?: string };

export function allQuestDefs(): Record<string, QuestDef> {
  return questDefs;
}

/** 목표 개수 (배달은 1) */
export function goalCount(def: QuestDef): number {
  return def.goal.type === 'collect' || def.goal.type === 'play' ? def.goal.count : 1;
}

export interface QuestProgress {
  status: QuestStatus;
  count: number;
  /** 이미 주운 spawns 번호 — 다시 켰을 때 주운 꽃이 또 나타나지 않게 */
  collected: number[];
}

/** 친구에게 말을 걸었을 때 일어나는 일 */
export type TalkResult =
  | { event: 'offered'; dialogue: string; spawns: QuestSpawn[] }
  | { event: 'progress'; dialogue: string }
  | { event: 'completed'; dialogue: string; rewards: Reward }
  | { event: 'delivered'; dialogue: string; rewards: Reward }
  /** 숨바꼭질: 대사 뒤 친구가 숨는다 (공주는 열까지 셈) */
  | { event: 'seek'; dialogue: string }
  /** 놀이 부탁: 대사 뒤에 미니게임을 연다 */
  | { event: 'play'; dialogue: string; game: MiniGame; item: string; count: number }
  | { event: 'done'; dialogue: string };

/** 물건을 주웠을 때 */
export interface CollectResult {
  questId: string;
  count: number;
  target: number;
  /** 이번에 목표 개수를 채웠는지 */
  nowReady: boolean;
}

/** 할 때마다 달라지는 부탁의 id는 "rq:"로 시작한다 (random-quests.ts) */
export const isRandomQuest = (id: string) => id.startsWith('rq:');

export class QuestBook {
  private readonly progress = new Map<string, QuestProgress>();
  private readonly defs: Record<string, QuestDef>;
  /** 무작위 부탁의 대사에 끼워 넣을 말 */
  private readonly vars = new Map<string, QuestVars>();

  constructor(
    defs: Record<string, QuestDef> = questDefs,
    private readonly canRandom: (character: string) => boolean = hasRandomQuests,
  ) {
    this.defs = { ...defs };
    for (const id of Object.keys(defs)) this.progress.set(id, { status: 'available', count: 0, collected: [] });
  }

  /** 새로 만든 무작위 부탁 넣기 */
  addRandom(q: RandomQuest): void {
    this.defs[q.id] = q.def;
    this.vars.set(q.id, { ...q.vars });
    this.progress.set(q.id, { status: 'available', count: 0, collected: [] });
  }

  /** 대사에 끼워 넣을 말 (굴린 부탁은 저장된 값, 아니면 부탁 내용에서) */
  varsOf(id: string): QuestVars | undefined {
    const d = this.defs[id];
    return this.vars.get(id) ?? (d ? questVars(d) : undefined);
  }

  /** 이 친구의 무작위 부탁들 (오래된 것부터) */
  private randomQuestsOf(character: string): string[] {
    return [...this.progress.keys()].filter((id) => isRandomQuest(id) && this.defs[id].giver === character);
  }

  /** 끝난 무작위 부탁은 친구마다 마지막 하나만 남긴다 (저장이 끝없이 커지지 않게) */
  private pruneRandom(character: string): void {
    const done = this.randomQuestsOf(character).filter((id) => this.progress.get(id)!.status === 'completed');
    for (const id of done.slice(0, -1)) {
      this.progress.delete(id);
      this.vars.delete(id);
      delete this.defs[id];
    }
  }

  /** 바로 전 무작위 부탁 (같은 부탁이 연달아 나오지 않게) */
  lastRandomVars(character: string): QuestVars | undefined {
    const list = this.randomQuestsOf(character);
    return list.length ? this.vars.get(list[list.length - 1]) : undefined;
  }

  /** 이야기 부탁을 다 끝냈고, 지금 하는 부탁이 하나도 없으면 새 부탁을 할 수 있다 */
  private canOfferRandom(character: string): boolean {
    if (!this.canRandom(character)) return false;
    if (this.storyQuestsOf(character).some((id) => this.progress.get(id)!.status !== 'completed')) return false;
    return this.current() === null;
  }

  /** 저장용: 무작위 부탁·이번 게임에 굴린 이야기 부탁의 내용 (진행 상황은 toJSON에) */
  randomToJSON(): Record<string, { def: QuestDef; vars: QuestVars }> {
    const out: Record<string, { def: QuestDef; vars: QuestVars }> = {};
    for (const id of this.progress.keys()) {
      if (isRandomQuest(id) || this.vars.has(id)) out[id] = { def: this.defs[id], vars: { ...this.vars.get(id) } };
    }
    return out;
  }

  /** 이야기 부탁을 굴린 결과로 바꾸기 (받기 직전에 한 번) */
  private applyRoll(id: string, rolled: { def: QuestDef; vars: QuestVars }): void {
    this.defs[id] = rolled.def;
    this.vars.set(id, { ...rolled.vars });
  }

  /** 저장된 무작위 부탁 다시 넣기 (load 전에). 모양이 이상하면 버린다 */
  loadRandom(raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    for (const [id, v] of Object.entries(raw as Record<string, { def?: QuestDef; vars?: QuestVars }>)) {
      const def = v?.def;
      if (!def || typeof def.giver !== 'string' || !def.goal || !Array.isArray(def.spawns) || !def.dialogue || !def.rewards) continue;
      const vars = v.vars && typeof v.vars === 'object' ? v.vars : {};
      if (isRandomQuest(id)) this.addRandom({ id, def, vars });
      else if (this.defs[id]) this.applyRoll(id, { def, vars }); // 이번 게임에 굴린 이야기 부탁
    }
  }

  /** 저장된 진행 상황 불러오기 (모르는 부탁·이상한 값은 무시) */
  load(raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    const statuses: QuestStatus[] = ['available', 'active', 'ready', 'completed'];
    for (const [id, v] of Object.entries(raw as Record<string, Partial<QuestProgress>>)) {
      const def = this.defs[id];
      if (!def || !v || !statuses.includes(v.status as QuestStatus)) continue;
      const collected = Array.isArray(v.collected)
        ? [...new Set(v.collected.filter((n) => Number.isInteger(n) && n >= 0 && n < def.spawns.length))]
        : [];
      const target = goalCount(def);
      const count = Math.min(Math.max(0, Math.floor(Number(v.count) || 0)), target);
      let status = v.status as QuestStatus;
      if (def.goal.type === 'collect') {
        // 개수와 상태가 어긋나면 개수를 믿는다
        if (status === 'active' && count >= target) status = 'ready';
        if (status === 'ready' && count < target) status = 'active';
      } else if (status === 'ready') {
        status = 'active'; // 배달에는 ready 가 없다
      }
      this.progress.set(id, { status, count, collected });
    }
  }

  /** 진행 중인 부탁에서 아직 마당에 남아 있어야 할 물건들 (spawns 번호 포함) */
  remainingSpawns(id: string): Array<QuestSpawn & { index: number }> {
    const p = this.progress.get(id);
    if (!p || (p.status !== 'active' && p.status !== 'ready')) return [];
    return this.def(id)
      .spawns.map((s, index) => ({ ...s, index }))
      .filter((s) => !p.collected.includes(s.index));
  }

  def(id: string): QuestDef {
    const d = this.defs[id];
    if (!d) throw new Error(`quests.json에 없는 부탁: ${id}`);
    return d;
  }

  get(id: string): QuestProgress {
    const p = this.progress.get(id);
    if (!p) throw new Error(`quests.json에 없는 부탁: ${id}`);
    return { ...p, collected: [...p.collected] };
  }

  /** 이 친구가 주는 부탁들 (quests.json 순서 + 무작위 부탁) */
  questsOf(character: string): string[] {
    return Object.keys(this.defs).filter((id) => this.defs[id].giver === character);
  }

  /** 이 친구의 이야기 부탁 (quests.json) */
  storyQuestsOf(character: string): string[] {
    return this.questsOf(character).filter((id) => !isRandomQuest(id));
  }

  /** 이 친구가 지금 줄 차례인 부탁 (앞 부탁을 다 끝내야 다음). 다 끝났으면 null */
  private nextQuestOf(character: string): string | null {
    for (const id of this.storyQuestsOf(character)) {
      const p = this.progress.get(id)!;
      if (p.status === 'completed') continue;
      const req = this.defs[id].requires;
      if (req && this.progress.get(req)?.status !== 'completed') return null;
      return id;
    }
    return null;
  }

  /** 이 친구에게 배달할 물건을 들고 있으면 그 부탁 */
  private deliveryFor(character: string): string | null {
    for (const [id, p] of this.progress) {
      const g = this.defs[id].goal;
      if (p.status === 'active' && g.type === 'deliver' && g.to === character) return id;
    }
    return null;
  }

  /**
   * 친구(캐릭터)에게 말을 걸었을 때. 배달 물건을 받는 친구면 먼저 배달,
   * 아니면 그 친구의 다음 이야기 부탁, 다 끝났으면 무작위 부탁(make로 새로 만듦).
   * 부탁이 없는 친구면 null (그냥 인사 대사). 무작위 부탁이면 vars(대사에 끼워 넣을 말)도 준다.
   */
  talkToCharacter(
    character: string,
    make?: () => RandomQuest | null,
    roll?: (def: QuestDef) => { def: QuestDef; vars: QuestVars } | null,
  ): (TalkResult & { questId: string; vars?: QuestVars }) | null {
    const delivery = this.deliveryFor(character);
    if (delivery) {
      const d = this.defs[delivery];
      const p = this.progress.get(delivery)!;
      p.status = 'completed';
      p.count = 1;
      const vars = this.varsOf(delivery);
      if (isRandomQuest(delivery)) this.pruneRandom(d.giver);
      return { questId: delivery, event: 'delivered', dialogue: d.dialogue.complete, rewards: d.rewards, vars };
    }
    const next = this.nextQuestOf(character);
    if (next) {
      // 처음 받는 이야기 부탁: 이번 게임의 색·개수·자리를 정한다
      if (roll && this.progress.get(next)!.status === 'available' && !this.vars.has(next)) {
        const rolled = roll(this.defs[next]);
        if (rolled) this.applyRoll(next, rolled);
      }
      return { questId: next, ...this.talk(next), vars: this.varsOf(next) };
    }

    // 하는 중인 무작위 부탁
    const open = this.randomQuestsOf(character).find((id) => this.progress.get(id)!.status !== 'completed');
    if (open) {
      const vars = this.vars.get(open);
      const r = this.talk(open);
      if (r.event === 'completed') this.pruneRandom(character);
      return { questId: open, ...r, vars };
    }
    // 새 무작위 부탁
    if (make && this.canOfferRandom(character)) {
      const q = make();
      if (q) {
        this.addRandom(q);
        return { questId: q.id, ...this.talk(q.id), vars: this.vars.get(q.id) };
      }
    }
    const story = this.storyQuestsOf(character);
    const storyDone = story.every((id) => this.progress.get(id)!.status === 'completed');
    // 다른 부탁을 하는 중이면: "그거 끝나면 나도 부탁할게!"
    const cur = this.current();
    if (make && storyDone && this.canRandom(character) && cur) {
      return { questId: cur.id, event: 'done', dialogue: 'rq-busy', vars: { from: character } };
    }
    const last = story[story.length - 1];
    if (last && this.progress.get(last)?.status === 'completed') {
      return { questId: last, event: 'done', dialogue: this.defs[last].dialogue.done, vars: this.varsOf(last) };
    }
    // 앞 부탁(다른 친구의 부탁)이 안 끝나서 아직 줄 게 없음
    return null;
  }

  /** 부탁 id로 직접 말 걸기 (테스트·내부용) */
  talk(id: string): TalkResult {
    const d = this.def(id);
    const p = this.progress.get(id)!;
    switch (p.status) {
      case 'available':
        if (d.goal.type === 'talk') {
          // 대화(고르기 포함)가 곧 부탁: 끝나면 바로 선물
          p.status = 'completed';
          p.count = 1;
          return { event: 'completed', dialogue: d.dialogue.offer, rewards: d.rewards };
        }
        p.status = 'active';
        if (d.goal.type === 'seek') return { event: 'seek', dialogue: d.dialogue.offer };
        if (d.goal.type === 'play') return { event: 'play', dialogue: d.dialogue.offer, game: d.goal.game, item: d.goal.item, count: d.goal.count };
        return { event: 'offered', dialogue: d.dialogue.offer, spawns: d.spawns };
      case 'active':
        // 숨바꼭질: 숨은 친구에게 말을 걸면(찾으면) 해결
        if (d.goal.type === 'seek') {
          p.status = 'completed';
          p.count = 1;
          return { event: 'completed', dialogue: d.dialogue.complete, rewards: d.rewards };
        }
        // 놀이를 하다 닫았으면: 다시 말 걸면 이어 하기
        if (d.goal.type === 'play') return { event: 'play', dialogue: d.dialogue.progress, game: d.goal.game, item: d.goal.item, count: d.goal.count };
        return { event: 'progress', dialogue: d.dialogue.progress };
      case 'ready':
        p.status = 'completed';
        return { event: 'completed', dialogue: d.dialogue.complete, rewards: d.rewards };
      case 'completed':
        return { event: 'done', dialogue: d.dialogue.done };
    }
  }

  /** 놀이(미니게임)를 끝까지 했다 → 해결. 하는 중인 놀이 부탁이 아니면 null */
  finishPlay(id: string): { dialogue: string; rewards: Reward } | null {
    const d = this.defs[id];
    const p = this.progress.get(id);
    if (!d || !p || d.goal.type !== 'play' || p.status !== 'active') return null;
    p.status = 'completed';
    p.count = d.goal.count;
    if (isRandomQuest(id)) this.pruneRandom(d.giver);
    return { dialogue: d.dialogue.complete, rewards: d.rewards };
  }

  /** 진행 중인 모으기 부탁 중 이 물건이 필요한 것이 있으면 하나 센다 */
  collect(itemId: string, spawnIndex?: number): CollectResult | null {
    for (const [id, p] of this.progress) {
      const goal = this.defs[id].goal;
      if (p.status !== 'active' || goal.type !== 'collect' || goal.item !== itemId) continue;
      if (spawnIndex !== undefined) {
        if (p.collected.includes(spawnIndex)) return null;
        p.collected.push(spawnIndex);
      }
      p.count = Math.min(p.count + 1, goal.count);
      const nowReady = p.count >= goal.count;
      if (nowReady) p.status = 'ready';
      return { questId: id, count: p.count, target: goal.count, nowReady };
    }
    return null;
  }

  /** 진행 중인 부탁에서 이 물건(오답)을 톡했을 때의 힌트 대사 */
  hintFor(itemId: string): { questId: string; dialogue: string } | null {
    for (const [id, p] of this.progress) {
      if (p.status !== 'active') continue;
      const hint = this.defs[id].hints[itemId];
      if (hint) return { questId: id, dialogue: hint };
    }
    return null;
  }

  /** 부탁 하나가 ♥ 상태인지 (받을 차례이거나 다 모았을 때) */
  wantsAttention(id: string): boolean {
    const s = this.progress.get(id)?.status;
    return s === 'available' || s === 'ready';
  }

  /** 이 친구 머리 위에 ♥를 띄울지: 줄 부탁이 있거나, 가져다줄 것이 있거나, 배달 물건을 받을 친구일 때 */
  characterWantsAttention(character: string): boolean {
    if (this.deliveryFor(character)) return true;
    const next = this.nextQuestOf(character);
    if (next !== null) return this.wantsAttention(next);
    if (this.randomQuestsOf(character).some((id) => this.progress.get(id)!.status === 'ready')) return true;
    return this.canOfferRandom(character);
  }

  /** 친구의 지금 기분 (아직 해결 안 한 부탁의 giverMood) */
  moodOf(character: string): 'sad' | null {
    for (const id of this.storyQuestsOf(character)) {
      const d = this.defs[id];
      if (d.giverMood && this.progress.get(id)!.status !== 'completed') return d.giverMood;
    }
    return null;
  }

  /** 지금 하는 중인(또는 다 모은) 부탁 하나 — 화면 위 진행 표시용 */
  current(): { id: string; def: QuestDef; progress: QuestProgress } | null {
    for (const [id, p] of this.progress) {
      if (p.status === 'active' || p.status === 'ready') return { id, def: this.defs[id], progress: this.get(id) };
    }
    return null;
  }

  /** 저장용 */
  toJSON(): Record<string, QuestProgress> {
    return Object.fromEntries([...this.progress].map(([id]) => [id, this.get(id)]));
  }
}
