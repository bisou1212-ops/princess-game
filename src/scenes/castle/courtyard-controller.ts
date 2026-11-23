import type { Speaker } from '../../core/tts';
import { getCharacter, getDialogue } from '../../systems/dialogue';
import { countingWord, getItem } from '../../systems/items';
import { QuestBook } from '../../systems/quests';
import { Wallet } from '../../systems/rewards';
import type { DialogueBox } from '../../ui/dialogue-box';
import type { Hud } from '../../ui/hud';
import type { RewardPopup } from '../../ui/reward-popup';
import type { CourtyardLayout } from './courtyard-layout';
import type { CourtyardScene, Interaction } from './courtyard-scene';

interface Deps {
  layout: CourtyardLayout;
  speaker: Speaker;
  dialogue: DialogueBox;
  hud: Hud;
  reward: RewardPopup;
  quests?: QuestBook;
  wallet?: Wallet;
}

/**
 * 성 마당의 "무슨 일이 일어나는지"를 정한다 (3D 장면과 분리).
 * 친구에게 말 걸기 → 부탁 받기 → 꽃 줍기(수 세기) → 가져다주기 → 선물·별사탕
 */
export class CourtyardController {
  readonly quests: QuestBook;
  readonly wallet: Wallet;
  private scene: CourtyardScene | null = null;
  private pickupSeq = 0;
  /** 부탁별로 마당에 놓인 물건 id */
  private readonly spawned = new Map<string, string[]>();

  constructor(private readonly deps: Deps) {
    this.quests = deps.quests ?? new QuestBook();
    this.wallet = deps.wallet ?? new Wallet();
  }

  attach(scene: CourtyardScene): void {
    this.scene = scene;
    this.refreshMarkers();
    this.refreshHud();
  }

  handle(what: Interaction): void {
    if (what.kind === 'npc') this.talkTo(what.npc.id);
    else this.pickUp(what.id, what.item);
  }

  private talkTo(npcId: string): void {
    const npc = this.deps.layout.npcs.find((n) => n.id === npcId);
    if (!npc) return;

    if (!npc.quest) {
      if (npc.dialogue) this.deps.dialogue.open(getDialogue(npc.dialogue));
      return;
    }

    const questId = npc.quest;
    const result = this.quests.talk(questId);
    this.refreshMarkers();

    switch (result.event) {
      case 'offered':
        this.deps.dialogue.open(getDialogue(result.dialogue), () => {
          // 대화가 끝나면 꽃이 톡톡 나타난다
          const ids = result.spawns.map((s) => {
            const id = `${questId}#${this.pickupSeq++}`;
            this.scene?.addPickup(id, s.item, getItem(s.item).color, s);
            return id;
          });
          this.spawned.set(questId, ids);
          this.refreshHud();
        });
        break;
      case 'completed':
        this.deps.dialogue.open(getDialogue(result.dialogue), () => {
          // 남은 꽃(오답 포함)은 정리
          for (const id of this.spawned.get(questId) ?? []) this.scene?.removePickup(id);
          this.spawned.delete(questId);
          this.wallet.grant(result.rewards);
          this.refreshHud();
          this.deps.hud.setCandy(this.wallet.candy, true);
          this.deps.reward.open(result.rewards);
        });
        break;
      default:
        this.deps.dialogue.open(getDialogue(result.dialogue));
    }
  }

  private pickUp(pickupId: string, itemId: string): void {
    const collected = this.quests.collect(itemId);
    if (collected) {
      this.scene?.removePickup(pickupId);
      const ids = this.spawned.get(collected.questId);
      if (ids) this.spawned.set(collected.questId, ids.filter((id) => id !== pickupId));

      this.deps.hud.setTracker(getItem(itemId).color, collected.count, collected.target, true);
      // 수 세기: "하나!" "둘!" "셋!" (GDD 6)
      const voice = getCharacter('princess').voice;
      this.deps.speaker.speak(`${countingWord(collected.count)}!`, {
        lang: voice.lang,
        pitch: voice.pitch,
        rate: voice.rate,
        mood: 'excited',
      });
      if (collected.nowReady) {
        this.refreshMarkers();
        // "셋!"을 다 듣고 나서 친구가 "다 모았구나!" (다른 대화가 열려 있으면 생략)
        const def = this.quests.def(collected.questId);
        window.setTimeout(() => {
          if (!this.deps.dialogue.isOpen) this.deps.dialogue.open(getDialogue(def.dialogue.ready));
        }, 900);
      }
      return;
    }

    // 정답이 아닌 물건: 실패가 아니라 친구의 힌트 (색 이름 한글·영어)
    const hint = this.quests.hintFor(itemId);
    if (hint) this.deps.dialogue.open(getDialogue(hint));
  }

  private refreshMarkers(): void {
    for (const npc of this.deps.layout.npcs) {
      const on = npc.quest ? this.quests.wantsAttention(npc.quest) : true;
      this.scene?.setNpcAttention(npc.id, on);
    }
  }

  private refreshHud(): void {
    this.deps.hud.setCandy(this.wallet.candy);
    const cur = this.quests.current();
    if (cur) this.deps.hud.setTracker(getItem(cur.def.goal.item).color, cur.progress.count, cur.def.goal.count);
    else this.deps.hud.setTracker('', 0, 0);
  }
}
