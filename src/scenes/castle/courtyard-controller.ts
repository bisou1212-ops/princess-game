import type { Speaker } from '../../core/tts';
import { getCharacter, getDialogue } from '../../systems/dialogue';
import type { GameState } from '../../systems/game-state';
import { goalCount } from '../../systems/quests';
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
      const it = getItem(s.item);
      this.scene.addPickup(pickupId(questId, s.index), s.item, it.color, s, it.shape ?? 'flower');
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

    // 이 친구의 부탁(또는 이 친구에게 전할 물건)이 있으면 그것, 없으면 그냥 인사
    const result = this.quests.talkToCharacter(npc.character);
    if (!result) {
      if (npc.dialogue) this.deps.dialogue.open(getDialogue(npc.dialogue));
      return;
    }
    const questId = result.questId;
    this.refreshMarkers();
    const gotReward = result.event === 'completed' || result.event === 'delivered';
    // 선물은 바로 지갑에 넣고 저장 (대화 도중 앱을 꺼도 선물을 잃지 않게). 보여 주는 건 대화 뒤에
    if (gotReward) this.deps.state.wallet.grant(result.rewards);
    if (result.event === 'offered' || gotReward) this.deps.state.change();

    switch (result.event) {
      case 'offered':
        this.deps.dialogue.open(getDialogue(result.dialogue), () => {
          // 대화가 끝나면 물건이 톡톡 나타난다 (배달 부탁은 물건을 들고 출발)
          this.spawnHere(questId);
          this.refreshHud();
        });
        break;
      case 'completed':
      case 'delivered':
        this.deps.dialogue.open(getDialogue(result.dialogue), () => {
          // 남은 물건(오답 포함)은 정리. 세워 둔 화분은 그대로
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
      // 넘어진 화분은 그 자리에 세우고, 나머지는 쏙 줍기
      if (getItem(itemId).onCollect === 'stand') this.scene?.standPickup(id);
      else this.scene?.removePickup(id);
      this.deps.state.change();
      this.deps.hud.setTracker(itemId, collected.count, collected.target, true);
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
        const ready = this.quests.def(collected.questId).dialogue.ready;
        if (ready) {
          window.setTimeout(() => {
            if (!this.deps.dialogue.isOpen) this.deps.dialogue.open(getDialogue(ready));
          }, 900);
        }
      }
      return;
    }

    // 정답이 아닌 물건: 실패가 아니라 친구의 힌트 (색 이름 한글·영어)
    const hint = this.quests.hintFor(itemId);
    if (hint) this.deps.dialogue.open(getDialogue(hint));
  }

  /** ♥: 부탁이 없는 친구는 늘(인사), 부탁이 있는 친구는 받을 차례·가져다줄 때·배달받을 때만 */
  private refreshMarkers(): void {
    for (const npc of this.deps.layout.npcs) {
      const hasQuests = this.quests.questsOf(npc.character).length > 0;
      const on = this.quests.characterWantsAttention(npc.character) || (!hasQuests && !!npc.dialogue);
      this.scene?.setNpcAttention(npc.id, on);
    }
  }

  /** 다른 장소에서 부탁이 바뀌었을 수 있으니 돌아올 때마다 ♥와 진행 표시를 다시 맞춘다 */
  refreshHud(): void {
    const { hud, state } = this.deps;
    this.refreshMarkers();
    hud.setCandy(state.wallet.candy);
    hud.setWardrobeNew(state.newOutfits.length > 0);
    const cur = this.quests.current();
    if (cur) hud.setTracker(cur.def.goal.item, cur.progress.count, goalCount(cur.def));
    else hud.setTracker('', 0, 0);
  }
}
