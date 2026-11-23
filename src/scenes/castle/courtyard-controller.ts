import type { Speaker } from '../../core/tts';
import { getCharacter, getDialogue } from '../../systems/dialogue';
import type { GameState } from '../../systems/game-state';
import { countingWord, getItem } from '../../systems/items';
import type { DialogueBox } from '../../ui/dialogue-box';
import type { Hud } from '../../ui/hud';
import type { RewardPopup } from '../../ui/reward-popup';
import type { CourtyardLayout } from './courtyard-layout';
import type { CourtyardScene, Interaction } from './courtyard-scene';

interface Deps {
  layout: CourtyardLayout;
  state: GameState;
  speaker: Speaker;
  dialogue: DialogueBox;
  hud: Hud;
  reward: RewardPopup;
  /** 성 문 앞에 도착하면 그 방으로 들어간다 */
  onEnterRoom(roomId: string): void;
}

/** 마당에 놓인 물건 id = "부탁id#spawns번호" (다시 켰을 때 같은 꽃을 찾기 위해) */
const pickupId = (questId: string, index: number) => `${questId}#${index}`;
function parsePickupId(id: string): { questId: string; index: number } | null {
  const at = id.lastIndexOf('#');
  const index = Number(id.slice(at + 1));
  return at > 0 && Number.isInteger(index) ? { questId: id.slice(0, at), index } : null;
}

/**
 * 성 마당의 "무슨 일이 일어나는지"를 정한다 (3D 장면과 분리).
 * 친구에게 말 걸기 → 부탁 받기 → 꽃 줍기(수 세기) → 가져다주기 → 선물·별사탕
 * 바뀐 내용은 GameState.change()로 자동 저장된다.
 */
export class CourtyardController {
  private scene: CourtyardScene | null = null;

  constructor(private readonly deps: Deps) {}

  private get quests() {
    return this.deps.state.quests;
  }

  attach(scene: CourtyardScene): void {
    this.scene = scene;
    // 저장에서 불러온 진행 중인 부탁: 아직 안 주운 꽃을 다시 놓는다
    for (const questId of Object.keys(this.quests.toJSON())) this.spawnHere(questId);
    this.refreshMarkers();
    this.refreshHud();
  }

  /** 이 장소의 부탁이면 아직 안 주운 물건을 놓는다 */
  private spawnHere(questId: string): void {
    if (!this.scene || this.quests.def(questId).location !== this.deps.layout.id) return;
    for (const s of this.quests.remainingSpawns(questId)) {
      this.scene.addPickup(pickupId(questId, s.index), s.item, getItem(s.item).color, s);
    }
  }

  handle(what: Interaction): void {
    if (what.kind === 'npc') this.talkTo(what.npc.id);
    else if (what.kind === 'door') this.deps.onEnterRoom(what.door.target);
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
    // 선물은 바로 지갑에 넣고 저장 (대화 도중 앱을 꺼도 선물을 잃지 않게). 보여 주는 건 대화 뒤에
    if (result.event === 'completed') this.deps.state.wallet.grant(result.rewards);
    if (result.event === 'offered' || result.event === 'completed') this.deps.state.change();

    switch (result.event) {
      case 'offered':
        this.deps.dialogue.open(getDialogue(result.dialogue), () => {
          // 대화가 끝나면 꽃이 톡톡 나타난다
          this.spawnHere(questId);
          this.refreshHud();
        });
        break;
      case 'completed':
        this.deps.dialogue.open(getDialogue(result.dialogue), () => {
          // 남은 꽃(오답 포함)은 정리
          this.quests.def(questId).spawns.forEach((_, i) => this.scene?.removePickup(pickupId(questId, i)));
          this.refreshHud();
          this.deps.hud.setCandy(this.deps.state.wallet.candy, true);
          this.deps.reward.open(result.rewards);
        });
        break;
      default:
        this.deps.dialogue.open(getDialogue(result.dialogue));
    }
  }

  private pickUp(id: string, itemId: string): void {
    const where = parsePickupId(id);
    const collected = this.quests.collect(itemId, where?.index);
    if (collected) {
      this.scene?.removePickup(id);
      this.deps.state.change();
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

  refreshHud(): void {
    const { hud, state } = this.deps;
    hud.setCandy(state.wallet.candy);
    hud.setWardrobeNew(state.newOutfits.length > 0);
    const cur = this.quests.current();
    if (cur) hud.setTracker(getItem(cur.def.goal.item).color, cur.progress.count, cur.def.goal.count);
    else hud.setTracker('', 0, 0);
  }
}
