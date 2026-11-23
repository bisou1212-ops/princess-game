import questsJson from '../data/quests.json';

/**
 * 친구의 부탁 (GDD 4·5.3). 실패·시간 제한 없음 — 언제든 다시 말을 걸면 된다.
 * available(아직 안 받음) → active(모으는 중) → ready(다 모음) → completed(선물 받음)
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

export interface QuestDef {
  giver: string;
  title: string;
  goal: { type: 'collect'; item: string; count: number };
  spawns: QuestSpawn[];
  hints: Record<string, string>;
  dialogue: { offer: string; progress: string; ready: string; complete: string; done: string };
  rewards: Reward;
}

const { _comment: _q, ...questDefs } = questsJson as unknown as Record<string, QuestDef> & { _comment?: string };

export function allQuestDefs(): Record<string, QuestDef> {
  return questDefs;
}

export interface QuestProgress {
  status: QuestStatus;
  count: number;
}

/** 친구에게 말을 걸었을 때 일어나는 일 */
export type TalkResult =
  | { event: 'offered'; dialogue: string; spawns: QuestSpawn[] }
  | { event: 'progress'; dialogue: string }
  | { event: 'completed'; dialogue: string; rewards: Reward }
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
    for (const id of Object.keys(defs)) this.progress.set(id, { status: 'available', count: 0 });
  }

  def(id: string): QuestDef {
    const d = this.defs[id];
    if (!d) throw new Error(`quests.json에 없는 부탁: ${id}`);
    return d;
  }

  get(id: string): QuestProgress {
    const p = this.progress.get(id);
    if (!p) throw new Error(`quests.json에 없는 부탁: ${id}`);
    return { ...p };
  }

  /** 부탁한 친구에게 말을 걸면 상태에 맞는 대사와 결과를 돌려준다 */
  talk(id: string): TalkResult {
    const d = this.def(id);
    const p = this.progress.get(id)!;
    switch (p.status) {
      case 'available':
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

  /** 진행 중인 부탁 중 이 물건이 필요한 것이 있으면 하나 센다 */
  collect(itemId: string): CollectResult | null {
    for (const [id, p] of this.progress) {
      const goal = this.defs[id].goal;
      if (p.status !== 'active' || goal.item !== itemId) continue;
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

  /** 이 친구가 지금 ♥를 띄워야 하는지 (받을 부탁이 있거나, 가져다줄 것이 있을 때) */
  wantsAttention(id: string): boolean {
    const s = this.progress.get(id)?.status;
    return s === 'available' || s === 'ready';
  }

  /** 지금 모으는 중(또는 다 모은) 부탁 하나 — 화면 위 진행 표시용 */
  current(): { id: string; def: QuestDef; progress: QuestProgress } | null {
    for (const [id, p] of this.progress) {
      if (p.status === 'active' || p.status === 'ready') return { id, def: this.defs[id], progress: { ...p } };
    }
    return null;
  }

  /** 저장용 (M4에서 IndexedDB 저장에 사용) */
  toJSON(): Record<string, QuestProgress> {
    return Object.fromEntries([...this.progress].map(([id, p]) => [id, { ...p }]));
  }
}
