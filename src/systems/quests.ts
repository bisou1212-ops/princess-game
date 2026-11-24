import questsJson from '../data/quests.json';

/**
 * 친구의 부탁 (GDD 4·5.3). 실패·시간 제한 없음 — 언제든 다시 말을 걸면 된다.
 * available(아직 안 받음) → active(하는 중) → ready(다 모음) → completed(선물 받음)
 *
 * 부탁 종류
 * - collect: 물건 n개 모아서 부탁한 친구에게 가져가기 (꽃·딸기·화분 세우기 …)
 * - deliver: 받은 물건을 다른 친구(to)에게 전하기 — 받는 친구가 고마워하며 선물을 준다
 * - talk: 대화 안의 고르기(기분 알아차리기·위로하기)를 끝내면 바로 해결 — 선물
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
  | { type: 'talk' };

export interface QuestDef {
  giver: string;
  /** 물건이 나타나는 장소 (world.json id) */
  location: string;
  title: string;
  /** 이 부탁보다 먼저 끝내야 하는 부탁 */
  requires?: string;
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
  return def.goal.type === 'collect' ? def.goal.count : 1;
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
  | { event: 'done'; dialogue: string };

/** 물건을 주웠을 때 */
export interface CollectResult {
  questId: string;
  count: number;
  target: number;
  /** 이번에 목표 개수를 채웠는지 */
  nowReady: boolean;
}

export class QuestBook {
  private readonly progress = new Map<string, QuestProgress>();

  constructor(private readonly defs: Record<string, QuestDef> = questDefs) {
    for (const id of Object.keys(defs)) this.progress.set(id, { status: 'available', count: 0, collected: [] });
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

  /** 이 친구가 주는 부탁들 (quests.json 순서) */
  questsOf(character: string): string[] {
    return Object.keys(this.defs).filter((id) => this.defs[id].giver === character);
  }

  /** 이 친구가 지금 줄 차례인 부탁 (앞 부탁을 다 끝내야 다음). 다 끝났으면 null */
  private nextQuestOf(character: string): string | null {
    for (const id of this.questsOf(character)) {
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
   * 아니면 그 친구의 다음 부탁. 부탁이 없는 친구면 null (그냥 인사 대사).
   */
  talkToCharacter(character: string): (TalkResult & { questId: string }) | null {
    const delivery = this.deliveryFor(character);
    if (delivery) {
      const d = this.defs[delivery];
      const p = this.progress.get(delivery)!;
      p.status = 'completed';
      p.count = 1;
      return { questId: delivery, event: 'delivered', dialogue: d.dialogue.complete, rewards: d.rewards };
    }
    const next = this.nextQuestOf(character);
    if (next) return { questId: next, ...this.talk(next) };
    const all = this.questsOf(character);
    const last = all[all.length - 1];
    if (last && this.progress.get(last)?.status === 'completed') {
      return { questId: last, event: 'done', dialogue: this.defs[last].dialogue.done };
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
        return { event: 'offered', dialogue: d.dialogue.offer, spawns: d.spawns };
      case 'active':
        return { event: 'progress', dialogue: d.dialogue.progress };
      case 'ready':
        p.status = 'completed';
        return { event: 'completed', dialogue: d.dialogue.complete, rewards: d.rewards };
      case 'completed':
        return { event: 'done', dialogue: d.dialogue.done };
    }
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
  hintFor(itemId: string): string | null {
    for (const [id, p] of this.progress) {
      if (p.status !== 'active') continue;
      const hint = this.defs[id].hints[itemId];
      if (hint) return hint;
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
    return next !== null && this.wantsAttention(next);
  }

  /** 친구의 지금 기분 (아직 해결 안 한 부탁의 giverMood) */
  moodOf(character: string): 'sad' | null {
    for (const id of this.questsOf(character)) {
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
