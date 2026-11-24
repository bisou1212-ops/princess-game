import type { Speaker } from '../../core/tts';
import { getCharacter, getDialogue, type DialogueLine } from '../../systems/dialogue';
import { fillLines, makeRandomQuest, randomSpots, rollStoryQuest, type QuestVars, type RandomQuest } from '../../systems/random-quests';
import type { NavGrid } from '../../systems/navigation/nav-grid';
import type { GameState } from '../../systems/game-state';
import { goalCount } from '../../systems/quests';
import { countingWord, getItem } from '../../systems/items';
import type { DialogueBox } from '../../ui/dialogue-box';
import type { Hud } from '../../ui/hud';
import type { RewardPopup } from '../../ui/reward-popup';
import { petVars, snackCount, type PetNeed } from '../../systems/pet';
import { buildNavGrid, type CourtyardLayout } from './courtyard-layout';
import type { CourtyardScene, Interaction } from './courtyard-scene';
import { sfx } from '../../core/sound';

interface Deps {
  layout: CourtyardLayout;
  state: GameState;
  speaker: Speaker;
  dialogue: DialogueBox;
  hud: Hud;
  reward: RewardPopup;
  /** 성 문 앞에 도착하면 그 방으로 들어간다 */
  onEnterRoom(roomId: string): void;
  /** 펫 돌보기 화면 열기: 밥(간식 count개)·목욕 */
  onPetCare(mode: 'feed' | 'bath', count: number): void;
}

/** 펫이 할 일이 없을 때 하는 말 (번갈아) */
const PET_CHEERS = ['pet-cheer-1', 'pet-cheer-2', 'pet-cheer-3'];

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
  private grid: NavGrid | null = null;
  private cheer = Math.floor(Math.random() * PET_CHEERS.length);

  constructor(private readonly deps: Deps) {}

  /** 대사 묶음 (무작위 부탁이면 친구 이름·물건을 끼워 넣음) */
  private lines(dialogueId: string, vars?: QuestVars): DialogueLine[] {
    const lines = getDialogue(dialogueId);
    return vars ? fillLines(lines, vars, (id) => getCharacter(id).name) : lines;
  }

  /** 이 장소에서 물건을 놓을 빈자리 n개: 걸을 수 있고 친구·시작 자리·문에서 떨어진 곳 */
  private spots(n: number) {
    const { layout } = this.deps;
    this.grid ??= buildNavGrid(layout);
    const avoid = [
      layout.start,
      ...layout.npcs.map((p) => ({ x: p.x, z: p.z })),
      ...layout.doors.map((d) => ({ x: d.x, z: d.z + 1 })),
    ];
    return randomSpots(this.grid, n, avoid);
  }

  /** 이 장소에서 새 부탁 만들기 */
  private makeRandom(character: string): RandomQuest | null {
    const { layout } = this.deps;
    return makeRandomQuest({
      giver: character,
      location: layout.id,
      townFriends: layout.npcs.map((n) => n.character),
      spots: (n) => this.spots(n),
      previous: this.quests.lastRandomVars(character),
    });
  }

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
    else if (what.kind === 'pet') this.talkToPet();
    else this.pickUp(what.id, what.item);
  }

  private talkTo(npcId: string): void {
    const npc = this.deps.layout.npcs.find((n) => n.id === npcId);
    if (!npc) return;

    // 이 친구의 부탁(또는 이 친구에게 전할 물건)이 있으면 그것, 없으면 그냥 인사
    const result = this.quests.talkToCharacter(
      npc.character,
      () => this.makeRandom(npc.character),
      // 이야기 부탁은 그 부탁의 장소에서 받을 때만 자리를 새로 정한다
      (def) => (def.location === this.deps.layout.id ? rollStoryQuest(def, (n) => this.spots(n)) : null),
    );
    if (!result) {
      if (npc.dialogue) this.deps.dialogue.open(getDialogue(npc.dialogue));
      return;
    }
    const questId = result.questId;
    const vars = result.vars;
    this.refreshMarkers();
    const gotReward = result.event === 'completed' || result.event === 'delivered';
    // 선물은 바로 지갑에 넣고 저장 (대화 도중 앱을 꺼도 선물을 잃지 않게). 보여 주는 건 대화 뒤에
    if (gotReward) this.deps.state.wallet.grant(result.rewards);
    if (result.event === 'offered' || gotReward) this.deps.state.change();

    switch (result.event) {
      case 'offered':
        this.deps.dialogue.open(this.lines(result.dialogue, vars), () => {
          // 대화가 끝나면 물건이 톡톡 나타난다 (배달 부탁은 물건을 들고 출발)
          this.spawnHere(questId);
          this.refreshHud();
        });
        break;
      case 'completed':
      case 'delivered':
        // 끝난 무작위 부탁은 정리되어 없을 수도 있으니 물건 수를 먼저 센다
        const spawnCount = this.spawnCountOf(questId);
        this.deps.dialogue.open(this.lines(result.dialogue, vars), () => {
          // 남은 물건(오답 포함)은 정리. 세워 둔 화분은 그대로
          for (let i = 0; i < spawnCount; i++) this.scene?.removePickup(pickupId(questId, i));
          this.refreshHud();
          this.deps.hud.setCandy(this.deps.state.wallet.candy, true);
          this.deps.reward.open(result.rewards);
        });
        break;
      default:
        this.deps.dialogue.open(this.lines(result.dialogue, vars));
    }
  }

  // ── 펫 ──

  /** 펫을 톡: 배고프면 밥, 꼬질꼬질하면 목욕, 아니면 다음 할 일 힌트 (앞장서서 달려감) */
  private talkToPet(): void {
    const pet = this.deps.state.pet;
    if (!pet || this.deps.dialogue.isOpen) return;
    this.scene?.petCelebrate();
    const need = pet.need();
    if (need === 'hungry') {
      const count = snackCount();
      this.deps.dialogue.open(this.petLines('pet-hungry', { ...petVars(pet, count) }), () => this.deps.onPetCare('feed', count));
      return;
    }
    if (need === 'dirty') {
      this.deps.dialogue.open(this.petLines('pet-dirty', petVars(pet)), () => this.deps.onPetCare('bath', 0));
      return;
    }
    this.petHint();
  }

  private petLines(id: string, vars: QuestVars): DialogueLine[] {
    return fillLines(getDialogue(id), vars, (c) => getCharacter(c).name);
  }

  /** 다음 할 일: 지금 부탁의 물건·친구 쪽으로 앞장선다. 다른 장소의 일이면 지도, 할 일이 없으면 칭찬 */
  private petHint(): void {
    const { state, layout, dialogue } = this.deps;
    const base = petVars(state.pet!);
    const here = new Set(layout.npcs.map((n) => n.character));
    const go = (id: string, vars: QuestVars, guide: Parameters<CourtyardScene['guidePet']>[0]) =>
      dialogue.open(this.petLines(id, { ...base, ...vars }), () => this.scene?.guidePet(guide));
    const cur = this.quests.current();
    if (cur) {
      const g = cur.def.goal;
      const qv = this.quests.varsOf(cur.id) ?? {};
      if (g.type === 'collect' && cur.progress.status === 'active') {
        if (cur.def.location === layout.id) return go('pet-hint-collect', { item: qv.item ?? getItem(g.item).name }, { kind: 'pickup', item: g.item });
      } else if (g.type === 'deliver') {
        if (here.has(g.to)) return go('pet-hint-deliver', { item: qv.item ?? getItem(g.item).name, to: g.to }, { kind: 'npc', character: g.to });
      } else if (here.has(cur.def.giver)) {
        return go('pet-hint-friend', { to: cur.def.giver }, { kind: 'npc', character: cur.def.giver });
      }
      return dialogue.open(this.petLines('pet-hint-elsewhere', base));
    }
    const waiting = layout.npcs.find((n) => this.quests.characterWantsAttention(n.character));
    if (waiting) return go('pet-hint-friend', { to: waiting.character }, { kind: 'npc', character: waiting.character });
    this.cheer = (this.cheer + 1) % PET_CHEERS.length;
    dialogue.open(this.petLines(PET_CHEERS[this.cheer], base));
  }

  /** 돌보기를 다 했다 → 펫이 폴짝 + 하트, 필요했으면 별사탕 */
  finishPetCare(mode: 'feed' | 'bath'): number {
    const { state, hud } = this.deps;
    const pet = state.pet;
    if (!pet) return 0;
    const candy = mode === 'feed' ? pet.feed() : pet.bathe();
    state.wallet.candy += candy;
    state.change();
    this.scene?.petCelebrate();
    this.refreshPet();
    hud.setCandy(state.wallet.candy, candy > 0);
    return candy;
  }

  /** 펫 모습과 머리 위 그림을 지금 상태에 맞춘다 */
  refreshPet(): void {
    const pet = this.deps.state.pet;
    this.scene?.setPet(pet?.kind ?? null);
    const need: PetNeed = pet ? pet.need() : null;
    this.scene?.setPetNeed(need);
  }

  private spawnCountOf(questId: string): number {
    try {
      return this.quests.def(questId).spawns.length;
    } catch {
      return 0;
    }
  }

  private pickUp(id: string, itemId: string): void {
    const where = parsePickupId(id);
    const collected = this.quests.collect(itemId, where?.index);
    if (collected) {
      sfx('sparkle');
      sfx('count', collected.count);
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
        const readyVars = this.quests.varsOf(collected.questId);
        if (ready) {
          window.setTimeout(() => {
            if (!this.deps.dialogue.isOpen) this.deps.dialogue.open(this.lines(ready, readyVars));
          }, 900);
        }
      }
      return;
    }

    // 정답이 아닌 물건: 실패가 아니라 친구의 힌트 (색 이름 한글·영어)
    const hint = this.quests.hintFor(itemId);
    if (hint) {
      const hv = this.quests.varsOf(hint.questId);
      this.deps.dialogue.open(this.lines(hint.dialogue, hv && { ...hv, decoy: getItem(itemId).name, decoyEn: getItem(itemId).en }));
    }
  }

  /** ♥: 부탁이 없는 친구는 늘(인사), 부탁이 있는 친구는 받을 차례·가져다줄 때·배달받을 때만 */
  private refreshMarkers(): void {
    for (const npc of this.deps.layout.npcs) {
      const hasQuests = this.quests.questsOf(npc.character).length > 0;
      const on = this.quests.characterWantsAttention(npc.character) || (!hasQuests && !!npc.dialogue);
      this.scene?.setNpcAttention(npc.id, on);
      this.scene?.setNpcMood(npc.id, this.quests.moodOf(npc.character));
    }
  }

  /** 다른 장소에서 부탁이 바뀌었을 수 있으니 돌아올 때마다 ♥와 진행 표시를 다시 맞춘다 */
  refreshHud(): void {
    const { hud, state } = this.deps;
    this.refreshMarkers();
    this.refreshPet();
    hud.setCandy(state.wallet.candy);
    hud.setWardrobeNew(state.newOutfits.length > 0);
    const cur = this.quests.current();
    if (cur && 'item' in cur.def.goal) hud.setTracker(cur.def.goal.item, cur.progress.count, goalCount(cur.def));
    else hud.setTracker('', 0, 0);
  }
}
