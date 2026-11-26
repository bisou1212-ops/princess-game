import { QUALITY_SETTINGS } from '../../core/quality';
import * as THREE from 'three';
import { Sparkles } from '../../core/sparkles';
import { createFriendFromGlb, hasFriendGlb } from './friends-glb';
import { addOutline, toonMaterial } from '../../core/toon';
import { FollowCamera } from '../../core/follow-camera';
import { TapMarker } from '../../core/tap-marker';
import { Walker } from '../../systems/navigation/walker';
import { pickWanderTarget } from '../../systems/navigation/wander';
import type { Point } from '../../systems/navigation/nav-grid';
import { getCharacter, type Mood } from '../../systems/dialogue';
import { defaultOutfit, type Outfit } from '../../systems/wardrobe';
import {
  buildNavGrid,
  courtyardLayout,
  type CourtyardLayout,
  type DoorPlacement,
  type NpcPlacement,
} from './courtyard-layout';
import { createPrincessModel } from './princess-model';
import { createEnv } from './env-models';
import { AmbientFx } from '../../core/ambient-fx';
import type { Gesture, PrincessAnimator } from './princess-animator';
import { createPetModel } from './pet-glb';
import type { PetAnimator } from './pet-animator';
import type { PetNeed } from '../../systems/pet';
import { bowlIcon, bubblesIcon } from '../../ui/icons';
import {
  COLORS,
  createCharacterMesh,
  createPickupMesh,
  createHeartTexture,
  createHitArea,
  createContactShadow,
  createFlowerPatch,
  createObstacleMesh,
} from './props';
import { sfx } from '../../core/sound';

/** 공주가 다가가서 하는 일: 친구에게 말 걸기 / 물건 줍기 */
export type Interaction =
  | { kind: 'npc'; npc: NpcPlacement }
  | { kind: 'pickup'; id: string; item: string }
  | { kind: 'door'; door: DoorPlacement }
  | { kind: 'pet' };

/** 펫이 앞장서서 데려갈 곳 (힌트) */
export type PetGuide = { kind: 'pickup'; item: string } | { kind: 'npc'; character: string };

export interface CourtyardScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update(dt: number): void;
  /** 화면 좌표(NDC, -1~1)를 톡했을 때 */
  tap(ndc: THREE.Vector2): void;
  /** 마당에 주울 물건을 놓는다 */
  addPickup(id: string, item: string, color: string, at: Point, shape?: string): void;
  /** 넘어진 물건(화분)을 바로 세운다. 그 자리에 남고 더는 톡 대상이 아니다 */
  standPickup(id: string): void;
  /** 주운 물건을 없앤다 (쏙 작아지며 사라짐) */
  removePickup(id: string): void;
  /** 친구 머리 위 ♥ 표시 켜기/끄기 */
  setNpcAttention(npcId: string, on: boolean): void;
  /** 친구 기분: sad면 눈물이 똑똑 (GDD 6: 표정 보고 기분 알아차리기) */
  setNpcMood(npcId: string, mood: 'sad' | null): void;
  /** 공주를 다른 곳으로 옮긴다 (열기구에서 내릴 때) */
  teleport(at: Point): void;
  /** 공주 옷 갈아입히기. celebrate면 빙글 돌며 폴짝 */
  setOutfit(outfit: Outfit, celebrate?: boolean): void;
  /** 거울(드레스룸) 모드: 카메라가 공주 앞으로 다가가고 공주가 천천히 돈다. 이동 톡은 막힘 */
  setMirror(on: boolean): void;
  /** 대화 중: 카메라가 공주와 친구 사이로 살짝 다가간다 */
  setTalking(on: boolean): void;
  /** 표정 (G2): 말하는 캐릭터가 대사 기분에 맞는 얼굴 + 입 뻐끔. character null = 모두 원래 얼굴로 */
  setFace(character: string | null, mood?: Mood, talking?: boolean): void;
  /** 카메라 가까이(<1)·멀리(>1) */
  zoomBy(factor: number): void;
  /** 끌어서 둘러보기 (라디안: 가로 돌기, 세로 높낮이) */
  orbit(dYaw: number, dPitch: number): void;
  /** 처음 보던 각도·거리로 */
  resetView(): void;
  /** 숨바꼭질: 친구가 숨는 자리 중 공주에게서 먼 곳으로 순간이동해 숨는다. hintAfter 초 뒤엔 머리 위 ♥ */
  hideNpc(character: string, spots: Point[], hintAfter: number): void;
  /** 숨바꼭질: 찾았다! 숨은 친구가 폴짝 나와 공주를 본다 */
  revealNpc(character: string): void;
  /** 몸짓 (G2): 박수·끄덕·빙글·폴짝·손 흔들기 */
  gesture(character: string, g: Gesture | 'hop' | 'wave'): void;
  /** 펫 데려오기·바꾸기 (null = 없음). 모델은 미리 preloadPet 으로 불러 둔다 */
  setPet(kind: string | null): void;
  /** 펫 머리 위 그림: 배고파요(밥그릇)·씻겨 주세요(거품) */
  setPetNeed(need: PetNeed): void;
  /** 펫이 기뻐서 폴짝 + 하트 */
  petCelebrate(): void;
  /** 펫이 앞장서서 물건·친구 쪽으로 달려가 기다린다. 갈 곳이 없으면 false */
  guidePet(to: PetGuide): boolean;
}

export interface CourtyardOptions {
  layout?: CourtyardLayout;
  outfit?: Outfit;
  /** 공주가 친구·물건 앞에 도착하면 호출 */
  onInteract?(what: Interaction): void;
}

/** 친구 머리 위 ♥ 높이 (치비 머리 + 토끼 귀 위) */
const HEART_Y = 2.55;
/** 하늘 아래쪽(지평선) 색 — 안개도 같은 색이라 땅 끝이 하늘에 녹아든다 */
const HORIZON = '#fde8f3';

/** 이 거리 안이면 걸어가지 않고 바로 말을 건다 */
const TALK_DISTANCE = 1.9;
/** 이 거리 안이면 바로 줍는다 */
const PICKUP_DISTANCE = 0.8;

interface Npc {
  data: NpcPlacement;
  object: THREE.Group;
  heart: THREE.Sprite;
  /** 친구도 공주처럼 걷는다 (돌아다니기) */
  walker: Walker;
  /** 다음 산책까지 쉬는 시간(초) */
  idle: number;
  /** 말을 건 뒤 잠깐 가만히 있는 시간(초) */
  hold: number;
  walkTime: number;
  /** 슬플 때 흐르는 눈물 */
  tears: THREE.Group | null;
  /** 뼈대 모델이면 동작 담당 */
  animator: PrincessAnimator | null;
  prevHeading: number;
  /** 숨바꼭질로 숨어 있는 중 (since: 숨은 뒤 지난 초, peek: 다음 빼꼼까지, found: 찾음 처리됨) */
  hiding: { since: number; peek: number; hintAfter: number; found: boolean } | null;
}

/** 숨바꼭질: 숨은 친구에게 이만큼 다가가면 찾은 것 */
const SEEK_FIND = 2.0;
/** 공주가 이만큼 가까이 오면 친구가 멈춰서 공주를 본다 */
const NPC_NOTICE = 2.2;
/** 돌아다니는 친구에게 다가갈 때 이만큼 가까워지면 말을 건다 */
const NPC_REACH = 1.75; // 머리가 큰 치비라 1.3m 면 얼굴이 맞닿아 보임

interface Pickup {
  id: string;
  item: string;
  object: THREE.Group;
  hit: THREE.Mesh;
  phase: number;
  /** 사라지는 중이면 0→1 */
  vanish: number | null;
  /** 세워지는 중이면 0→1 */
  stand: number | null;
}

type Target = { kind: 'npc'; npc: Npc } | { kind: 'pickup'; pickup: Pickup } | { kind: 'door'; door: DoorPlacement } | { kind: 'pet' };

/** 펫: 공주 뒤 옆에서 졸졸 따라다니고, 힌트를 줄 때는 앞장서서 달려가 기다린다 */
interface PetState {
  kind: string;
  object: THREE.Group;
  animator: PetAnimator | null;
  walker: Walker;
  mode: 'follow' | 'guide';
  /** 앞장서서 기다리는 곳 (공주가 오면 다시 따라다님) */
  guideTo: Point | null;
  guideT: number;
  replan: number;
  /** 공주의 어느 옆에 있는지 (+1/-1) — 따라갈 때 공주 앞을 가로지르지 않게 */
  side: number;
  prevHeading: number;
  bubble: THREE.Sprite;
  /** 톡한 뒤 잠깐 멈춰서 공주를 봄 */
  hold: number;
  hopIn: number;
}

/** 펫이 따라다니는 자리: 공주 뒤로 PET_BACK, 옆으로 PET_SIDE (m) */
const PET_BACK = 0.35;
const PET_SIDE = 1.2;
/** 펫 크기 (모델은 머리 꼭대기 약 1m) */
const PET_SCALE = 1.2;
/** 펫이 공주를 기다리는 시간(초) — 지나면 다시 따라다님 */
const PET_GUIDE_WAIT = 14;

/** 문 앞에 서는 거리 */
const DOOR_DISTANCE = 1.4;

export function createCourtyardScene(aspect: number, opts: CourtyardOptions = {}): CourtyardScene {
  const layout = opts.layout ?? courtyardLayout;
  const scene = new THREE.Scene();
  const theme = layout.theme;
  scene.background = skyGradient(theme.sky);
  scene.fog = new THREE.Fog(HORIZON, 34, 85);

  const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 120);

  addLights(scene, layout);

  // 바닥: 바깥 들판 + 마당
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    toonMaterial({ color: theme.ground, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const yard = new THREE.Mesh(
    new THREE.PlaneGeometry(layout.width, layout.depth),
    toonMaterial({ color: theme.yard, roughness: 1 }),
  );
  yard.rotation.x = -Math.PI / 2;
  yard.position.y = 0.005;
  yard.receiveShadow = true;
  scene.add(yard);

  const tappables: THREE.Object3D[] = [ground, yard];
  // Blender 배경이 있으면 보이는 모습은 그것으로 (땅·마당 판은 톡 판정용으로만 남김)
  const env = createEnv(layout.env);
  if (env) {
    for (const plane of [ground, yard]) {
      (plane.material as THREE.Material).visible = false;
      plane.receiveShadow = false;
    }
    scene.add(env.root);
    tappables.push(...env.surfaces);
  } else {
    for (const o of layout.obstacles) {
      const mesh = createObstacleMesh(o, theme);
      scene.add(mesh);
      tappables.push(mesh);
    }
  }
  // 작은 꽃밭은 그림자를 드리우지 않음 (그림자 그리기 횟수 절약, 발밑 그림자로 충분)
  for (const patch of layout.flowerPatches ?? []) {
    const fp = createFlowerPatch(patch);
    fp.traverse((o) => (o.castShadow = false));
    scene.add(fp);
  }

  // 친구들
  const heartTexture = createHeartTexture();
  const npcs: Npc[] = layout.npcs.map((data) => {
    // Blender 친구 모델이 있으면 그것, 없으면 도형 친구
    const object = hasFriendGlb(data.character) ? createFriendFromGlb(data.character) : createCharacterMesh(getCharacter(data.character));
    object.position.set(data.x, 0, data.z);
    object.rotation.y = data.facing;
    const npcWalker = new Walker({ x: data.x, z: data.z }, 1.1, 6);
    npcWalker.heading = data.facing;
    object.userData.npcId = data.id;
    object.add(createHitArea(0.7, 2.6));
    object.add(createContactShadow(0.6));
    // ♥ 표시: 말을 걸 수 있는 친구 (GDD 4)
    const heart = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTexture, depthWrite: false }));
    heart.scale.setScalar(0.6);
    heart.position.y = HEART_Y;
    object.add(heart);
    scene.add(object);
    tappables.push(object);
    const animator = (object.userData.animator as PrincessAnimator | null | undefined) ?? null;
    return { data, object, heart, walker: npcWalker, idle: 1 + Math.random() * 3, hold: 0, walkTime: 0, tears: null, animator, prevHeading: npcWalker.heading, hiding: null };
  });

  /** 매 프레임 깜빡이게 할 반짝이들 */
  const sparkles: Sparkles[] = [];

  // 성 문 (톡하면 들어가기)
  const doorGlows: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  for (const d of layout.doors) {
    const door = new THREE.Group();
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(d.w, d.h, 0.12),
      toonMaterial({ color: 0xc99a74, roughness: 0.8 }),
    );
    panel.position.y = d.h / 2;
    const arch = new THREE.Mesh(
      new THREE.CylinderGeometry(d.w / 2, d.w / 2, 0.12, 24, 1, false, 0, Math.PI),
      toonMaterial({ color: 0xc99a74, roughness: 0.8 }),
    );
    arch.rotation.set(Math.PI / 2, Math.PI / 2, 0);
    arch.position.y = d.h;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), toonMaterial({ color: COLORS.crown }));
    knob.position.set(d.w * 0.3, d.h * 0.45, 0.08);
    // 바닥의 반짝이는 표시 (들어갈 수 있는 곳)
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(d.w + 0.4, 0.9),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(0, 0.015, 0.6);
    doorGlows.push(glow);
    door.add(panel, arch, knob, glow, createHitArea(d.w * 0.7, d.h + 0.6));
    door.position.set(d.x, 0, d.z + 0.07);
    door.userData.doorId = d.id;
    door.traverse((m) => {
      if (m !== glow && (m as THREE.Mesh).isMesh && !m.userData.isHitArea) m.castShadow = true;
    });
    addOutline(door, 0.025);
    if (d.target === 'shop') door.add(createShopSign(d.h));
    const doorSparkles = new Sparkles({ count: 7, radius: 1, height: [0.4, 2.6], size: 0.34 });
    doorSparkles.position.z = 0.4;
    door.add(doorSparkles);
    sparkles.push(doorSparkles);
    scene.add(door);
    tappables.push(door);
  }

  const pickups = new Map<string, Pickup>();

  const grid = buildNavGrid(layout);
  // 공주: 천천히 출발·부드럽게 멈춤(가속 7m/s²), 먼 곳은 조금 빠른 걸음
  const walker = new Walker(layout.start, 2.6, 9, 7, 7, 1.3);
  const princessModel = createPrincessModel(opts.outfit ?? defaultOutfit());
  const princess = princessModel.group;
  const animator = princessModel.animator ?? null;
  /** 캐릭터 id → 움직임 담당 ('princess' 또는 친구의 characters.json id) */
  const animatorOf = (character: string): PrincessAnimator | null =>
    character === 'princess' ? animator : (npcs.find((n) => n.data.character === character)?.animator ?? null);
  let prevHeading = walker.heading;
  let prevSpeed = 0;
  let accelSmooth = 0;
  /** 공주가 바라볼 곳 (말하는 친구·거울 속 자기) */
  let lookAtNpc: { walker: Walker } | null = null;
  let lookHold = 0;
  const lookPoint = new THREE.Vector3();
  princess.add(createContactShadow(0.62));
  scene.add(princess);
  let mirror = false;
  let mirrorSpin = 0;
  /** 옷을 바꿨을 때 빙글+폴짝 (0→1) */
  let celebrateT = 1;

  // 펫
  let pet: PetState | null = null;
  const petHearts: Array<{ sprite: THREE.Sprite; t: number; vx: number }> = [];
  const petLook = new THREE.Vector3();
  const petBubbles: Record<'hungry' | 'dirty', THREE.Texture> = { hungry: bubbleTexture(bowlIcon()), dirty: bubbleTexture(bubblesIcon()) };

  const marker = new TapMarker();
  scene.add(marker.object);

  // 먼지·꽃잎·구름
  const fx = new AmbientFx();
  scene.add(fx.group);
  let stepDist = 0;
  let stepSide = 1;
  /** 폴짝 뒤 착지 먼지까지 남은 시간 */
  let landIn = -1;
  /** 카메라 실제 자리·보는 곳 (원하는 자리로 부드럽게 따라감) */
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const wantPos = new THREE.Vector3();
  const wantLook = new THREE.Vector3();
  const follow = new FollowCamera(camera);
  const focus = new THREE.Vector3(walker.x, 0, walker.z);
  follow.snap(focus);
  camPos.copy(camera.position);
  camLook.set(focus.x, 0.8, focus.z);

  const raycaster = new THREE.Raycaster();
  const mirrorCam = new THREE.Vector3();
  const mirrorLook = new THREE.Vector3(walker.x, 0.8, walker.z);
  const lookTarget = new THREE.Vector3();
  const camSide = new THREE.Vector3();
  let walkTime = 0;
  let elapsed = 0;
  /** 걸어가는 중인 목적지(친구·물건) */
  let pending: Target | null = null;
  let talking = false;
  /** 카메라가 가는 방향 앞쪽을 살짝 더 보게 (부드럽게) */
  const lead = new THREE.Vector3();

  const targetFromHit = (obj: THREE.Object3D | null): Target | null => {
    for (let o = obj; o; o = o.parent) {
      const npcId = o.userData.npcId as string | undefined;
      if (npcId) {
        const npc = npcs.find((n) => n.data.id === npcId);
        return npc ? { kind: 'npc', npc } : null;
      }
      const doorId = o.userData.doorId as string | undefined;
      if (doorId) {
        const door = layout.doors.find((d) => d.id === doorId);
        return door ? { kind: 'door', door } : null;
      }
      if (o.userData.isPet) return pet ? { kind: 'pet' } : null;
      const pickupId = o.userData.pickupId as string | undefined;
      if (pickupId) {
        const pickup = pickups.get(pickupId);
        return pickup && pickup.vanish === null ? { kind: 'pickup', pickup } : null;
      }
    }
    return null;
  };

  const targetPos = (t: Target): Point =>
    t.kind === 'pet'
      ? { x: pet?.walker.x ?? walker.x, z: pet?.walker.z ?? walker.z }
      : t.kind === 'npc'
      ? { x: t.npc.walker.x, z: t.npc.walker.z }
      : t.kind === 'door'
        ? { x: t.door.x, z: t.door.z + 0.6 }
        : { x: t.pickup.object.position.x, z: t.pickup.object.position.z };

  const arrive = (t: Target) => {
    pending = null;
    walker.stop();
    const p = targetPos(t);
    walker.faceTowards(p.x, p.z);
    if (t.kind === 'npc') {
      t.npc.walker.stop();
      t.npc.walker.faceTowards(walker.x, walker.z);
      t.npc.hold = 3;
      t.npc.animator?.play('wave');
      // 친구를 바라보며 손 흔들어 인사
      lookAtNpc = t.npc;
      lookHold = 6;
      animator?.play('wave');
      opts.onInteract?.({ kind: 'npc', npc: t.npc.data });
    } else if (t.kind === 'pet') {
      if (pet) {
        // 펫이 멈춰서 공주를 보고, 공주도 펫을 본다
        pet.walker.stop();
        pet.walker.faceTowards(walker.x, walker.z);
        pet.mode = 'follow';
        pet.guideTo = null;
        pet.hold = 3;
        lookAtNpc = pet;
        lookHold = 4;
      }
      opts.onInteract?.({ kind: 'pet' });
    } else if (t.kind === 'door') {
      walker.faceTowards(t.door.x, t.door.z - 1);
      opts.onInteract?.({ kind: 'door', door: t.door });
    } else {
      opts.onInteract?.({ kind: 'pickup', id: t.pickup.id, item: t.pickup.item });
    }
  };

  /** 친구들 돌아다니기: 쉬기 ↔ 집 둘레 산책. 공주가 오거나(가까이·다가오는 중) 말하는 동안엔 멈춰서 공주를 본다 */
  const npcLook = new THREE.Vector3();
  const updateNpcs = (dt: number) => {
    for (const n of npcs) {
      if (n.hiding) {
        const h = n.hiding;
        h.since += dt;
        h.peek -= dt;
        const dist = Math.hypot(walker.x - n.walker.x, walker.z - n.walker.z);
        if (h.peek <= 0) {
          // 빼꼼: 몸을 살짝 기울여 내다보거나 폴짝 (어디 있는지 힌트)
          h.peek = 5 + Math.random() * 4;
          n.animator?.playGesture(Math.random() < 0.5 ? 'nod' : 'spin');
          if (dist < 9) sfx('happy');
        }
        if (h.since > h.hintAfter) n.heart.visible = true;
        // 가까이 오면 찾았다! (말 걸기와 같음)
        if (!h.found && !mirror && dist < SEEK_FIND) {
          h.found = true;
          arrive({ kind: 'npc', npc: n });
        }
      }
      const radius = n.hiding ? 0 : (n.data.wander ?? 0);
      const near = !n.hiding && Math.hypot(walker.x - n.walker.x, walker.z - n.walker.z) < NPC_NOTICE;
      const targeted = pending?.kind === 'npc' && pending.npc === n;
      n.hold = Math.max(0, n.hold - dt);
      if (near || targeted || n.hold > 0 || mirror) {
        if (n.walker.moving) n.walker.stop();
        if (near || targeted) n.walker.faceTowards(walker.x, walker.z);
      } else if (radius > 0 && !n.walker.moving) {
        n.idle -= dt;
        if (n.idle <= 0) {
          n.idle = 2 + Math.random() * 3;
          const to = pickWanderTarget(grid, n.data, radius, n.walker, Math.random, walker);
          const path = to && grid.findPath(n.walker, to);
          if (path && path.length) n.walker.setPath(path);
        }
      }
      n.walker.update(dt);
      n.walkTime = n.walker.moving ? n.walkTime + dt : 0;
      const bob = !n.animator && n.walker.moving ? Math.abs(Math.sin(n.walkTime * 9)) * 0.06 : 0;
      n.object.position.set(n.walker.x, bob, n.walker.z);
      n.object.rotation.y = n.walker.heading;
      if (n.animator && dt > 0) {
        let turn = n.walker.heading - n.prevHeading;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn)) / dt;
        n.prevHeading = n.walker.heading;
        // 공주가 가까이 오면 공주를 바라본다
        const look = near || targeted || n.hold > 0 ? npcLook.set(walker.x, 1.1, walker.z) : null;
        n.animator.update(dt, { speed: n.walker.currentSpeed, turnRate: turn, accel: 0, lookAt: look });
      }
      if (n.tears) {
        // 눈물 두 방울이 볼을 타고 똑똑 (번갈아)
        n.tears.children.forEach((drop, i) => {
          const t = ((elapsed * 0.9 + i * 0.5) % 1);
          drop.position.y = drop.userData.y0 - t * 0.28;
          drop.scale.setScalar(t < 0.15 ? t / 0.15 : 1);
          ((drop as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t);
        });
      }
    }
  };

  /** 공주 뒤 옆 자리 (펫이 따라다니는 곳) */
  const petSpot = (side: number): Point => {
    const h = walker.heading;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    // 옆 = 앞 방향을 90° 돌린 것
    return { x: walker.x - fx * PET_BACK + fz * PET_SIDE * side, z: walker.z - fz * PET_BACK - fx * PET_SIDE * side };
  };

  const placePet = (p: PetState) => {
    const at = petSpot(p.side);
    const cell = grid.findPath(at, at);
    const spot = cell && cell.length ? cell[cell.length - 1] : { x: walker.x, z: walker.z };
    p.walker.stop();
    p.walker.x = spot.x;
    p.walker.z = spot.z;
    p.walker.heading = walker.heading;
    p.mode = 'follow';
    p.guideTo = null;
    p.object.position.set(spot.x, 0, spot.z);
  };

  const updatePet = (dt: number) => {
    if (!pet) return;
    const p = pet;
    const toPrincess = Math.hypot(walker.x - p.walker.x, walker.z - p.walker.z);
    p.hold = Math.max(0, p.hold - dt);
    p.replan -= dt;
    let excited = 0;
    if (p.mode === 'guide' && p.guideTo) {
      p.guideT += dt;
      const princessThere = Math.hypot(walker.x - p.guideTo.x, walker.z - p.guideTo.z) < 1.6;
      if (princessThere || p.guideT > PET_GUIDE_WAIT) {
        p.mode = 'follow';
        p.guideTo = null;
      } else if (!p.walker.moving) {
        // 도착해서 기다리기: 공주를 보며 가끔 폴짝 "이쪽이에요!"
        p.walker.faceTowards(walker.x, walker.z);
        excited = 1;
        p.hopIn -= dt;
        if (p.hopIn <= 0) {
          p.hopIn = 1.6;
          p.animator?.hop();
        }
      }
    }
    if (p.mode === 'follow') {
      if (toPrincess > 10) placePet(p); // 너무 멀어지면 옆으로 톡
      // 지금 있는 쪽 옆에 머문다 (공주 앞을 가로지르지 않게)
      const sx = p.walker.x - walker.x;
      const sz = p.walker.z - walker.z;
      const sideNow = Math.cos(walker.heading) * sx - Math.sin(walker.heading) * sz;
      if (Math.abs(sideNow) > 0.3) p.side = Math.sign(sideNow);
      const spot = petSpot(p.side);
      const d = Math.hypot(spot.x - p.walker.x, spot.z - p.walker.z);
      if (p.hold > 0) {
        if (p.walker.moving) p.walker.stop();
      } else if (d > 0.9 && p.replan <= 0) {
        p.replan = 0.45;
        const path = grid.findPath({ x: p.walker.x, z: p.walker.z }, spot);
        if (path && path.length) p.walker.setPath(path);
      } else if (!p.walker.moving && toPrincess < 2.5 && !walker.moving) {
        p.walker.faceTowards(walker.x, walker.z);
      }
    }
    p.walker.update(dt);
    p.object.position.set(p.walker.x, 0, p.walker.z);
    p.object.rotation.y = p.walker.heading;
    if (p.animator && dt > 0) {
      let turn = p.walker.heading - p.prevHeading;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn)) / dt;
      p.prevHeading = p.walker.heading;
      const look = toPrincess < 4 && !p.walker.moving ? petLook.set(walker.x, 1.3, walker.z) : null;
      p.animator.update(dt, { speed: p.walker.currentSpeed, turnRate: turn, lookAt: look, excited });
    }
    // 머리 위 그림이 살랑
    p.bubble.position.y = 1.3 + Math.sin(elapsed * 3) * 0.04;
    // 하트가 둥실 올라가며 사라짐
    for (let i = petHearts.length - 1; i >= 0; i--) {
      const h = petHearts[i];
      h.t += dt;
      const k = Math.max(0, h.t) / 1.1;
      h.sprite.visible = h.t >= 0;
      h.sprite.position.set(p.walker.x + h.vx * k, 1 + k * 1.1, p.walker.z);
      h.sprite.material.opacity = 1 - k;
      h.sprite.scale.setScalar(0.3 + k * 0.15);
      if (k >= 1) {
        scene.remove(h.sprite);
        h.sprite.material.dispose();
        petHearts.splice(i, 1);
      }
    }
  };

  return {
    scene,
    camera,

    setPet(kind) {
      if (pet && pet.kind === kind) return;
      if (pet) {
        scene.remove(pet.object);
        pet = null;
      }
      if (!kind) return;
      const model = createPetModel(kind);
      const object = model.group;
      object.userData.isPet = true;
      object.scale.setScalar(PET_SCALE);
      object.add(createHitArea(0.5, 1));
      object.add(createContactShadow(0.42));
      const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: petBubbles.hungry, depthWrite: false }));
      bubble.scale.setScalar(0.5);
      bubble.visible = false;
      object.add(bubble);
      scene.add(object);
      // 공주보다 조금 빠르게 (멀어지면 더 빨리 따라잡음)
      const pw = new Walker({ x: walker.x, z: walker.z }, 2.8, 10, 9, 3, 1.6);
      pet = { kind, object, animator: model.animator, walker: pw, mode: 'follow', guideTo: null, guideT: 0, replan: 0, side: 1, prevHeading: 0, bubble, hold: 0, hopIn: 0 };
      placePet(pet);
    },

    setPetNeed(need) {
      if (!pet) return;
      pet.bubble.visible = need !== null;
      if (need) pet.bubble.material.map = petBubbles[need];
      pet.bubble.material.needsUpdate = true;
    },

    petCelebrate() {
      if (!pet) return;
      sfx('happy');
      pet.animator?.hop();
      for (let i = 0; i < 5; i++) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTexture, transparent: true, depthWrite: false }));
        sprite.visible = false;
        scene.add(sprite);
        petHearts.push({ sprite, t: -i * 0.12, vx: (i - 2) * 0.25 });
      }
    },

    guidePet(to) {
      if (!pet) return false;
      let goal: Point | null = null;
      if (to.kind === 'pickup') {
        let best = Infinity;
        for (const pk of pickups.values()) {
          if (pk.item !== to.item || pk.vanish !== null || pk.stand !== null) continue;
          const d = Math.hypot(pk.object.position.x - walker.x, pk.object.position.z - walker.z);
          if (d < best) {
            best = d;
            goal = { x: pk.object.position.x, z: pk.object.position.z };
          }
        }
      } else {
        const n = npcs.find((m) => m.data.character === to.character);
        if (n) goal = { x: n.walker.x, z: n.walker.z };
      }
      if (!goal) return false;
      // 물건·친구 바로 옆 (공주 쪽)에서 기다린다
      const dx = walker.x - goal.x;
      const dz = walker.z - goal.z;
      const len = Math.hypot(dx, dz) || 1;
      const gap = to.kind === 'npc' ? 1.1 : 0.7;
      const wait = { x: goal.x + (dx / len) * gap, z: goal.z + (dz / len) * gap };
      const path = grid.findPath({ x: pet.walker.x, z: pet.walker.z }, wait);
      if (!path || !path.length) return false;
      pet.walker.setPath(path);
      pet.mode = 'guide';
      pet.guideTo = goal;
      pet.guideT = 0;
      pet.hold = 0;
      pet.hopIn = 0.3;
      return true;
    },

    tap(ndc) {
      if (mirror) return;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects([...tappables, ...[...pickups.values()].map((p) => p.object), ...(pet ? [pet.object] : [])], true);
      if (hits.length === 0) return;
      // 투명 판정 영역이 있는 친구·물건을 먼저 (뒤에 있는 바닥보다 우선)
      const target = hits.map((h) => targetFromHit(h.object)).find((t) => t !== null) ?? null;
      pending = target;

      const dest = target ? targetPos(target) : { x: hits[0].point.x, z: hits[0].point.z };
      if (target?.kind === 'pet') {
        walker.stop();
        arrive(target);
        return;
      }
      if (target) {
        const reach = target.kind === 'npc' ? TALK_DISTANCE : target.kind === 'door' ? DOOR_DISTANCE : PICKUP_DISTANCE;
        if (Math.hypot(walker.x - dest.x, walker.z - dest.z) <= reach) {
          arrive(target);
          return;
        }
      }
      const path = grid.findPath({ x: walker.x, z: walker.z }, dest);
      if (!path || path.length === 0) {
        pending = null;
        return;
      }
      walker.setPath(path);
      if (!target) {
        const end = path[path.length - 1];
        marker.show(end.x, end.z);
      }
    },

    addPickup(id, item, color, at, shape = 'flower') {
      const object = createPickupMesh(shape, color);
      object.position.set(at.x, 0, at.z);
      object.userData.pickupId = id;
      const hit = createHitArea(0.6, 1.2);
      object.add(hit);
      addOutline(object, 0.012);
      const twinkle = new Sparkles({ count: 4, radius: 0.45, height: [0.3, 0.9], size: 0.26 });
      object.add(twinkle);
      object.userData.sparkles = twinkle;
      object.traverse((o) => (o.castShadow = false)); // 작은 물건은 그림자 없이 (그림자 그리기 횟수 절약)
      object.scale.setScalar(0.01); // 톡 나타나는 연출
      scene.add(object);
      pickups.set(id, { id, item, object, hit, phase: Math.random() * Math.PI * 2, vanish: null, stand: null });
    },

    standPickup(id) {
      const p = pickups.get(id);
      if (p && p.vanish === null && p.stand === null) p.stand = 0;
      if (pending?.kind === 'pickup' && pending.pickup.id === id) pending = null;
    },

    removePickup(id) {
      const p = pickups.get(id);
      if (p && p.vanish === null) p.vanish = 0;
      if (pending?.kind === 'pickup' && pending.pickup.id === id) pending = null;
    },

    teleport(at) {
      pending = null;
      walker.stop();
      walker.x = at.x;
      walker.z = at.z;
      walker.heading = 0;
      princess.position.set(at.x, 0, at.z);
      follow.snap(focus.set(at.x, 0, at.z));
      camPos.copy(camera.position);
      camLook.set(at.x, 0.8, at.z);
      if (pet) placePet(pet);
    },

    setOutfit(outfit, celebrate = false) {
      princessModel.setOutfit(outfit);
      if (celebrate) {
        celebrateT = 0;
        animator?.play('hop');
        if (animator) landIn = 0.62; // hop 클립의 착지 순간
      }
    },

    setTalking(on) {
      talking = on;
    },

    setFace(character, mood, isTalking = false) {
      const all = [animator, ...npcs.map((n) => n.animator)];
      if (character === null) {
        for (const a of all) a?.face?.reset();
        return;
      }
      const a = animatorOf(character);
      if (!a?.face) return;
      a.face.set(mood ?? 'normal');
      a.face.setTalking(isTalking);
      // 다른 캐릭터는 입을 다문다
      for (const o of all) if (o && o !== a) o.face?.setTalking(false);
    },

    hideNpc(character, spots, hintAfter) {
      const n = npcs.find((m) => m.data.character === character);
      if (!n || spots.length === 0) return;
      // 공주에게서 먼 자리 중 하나 (너무 가까우면 숨바꼭질이 안 됨)
      const far = spots.filter((p) => Math.hypot(p.x - walker.x, p.z - walker.z) > 6);
      const list = far.length > 0 ? far : spots;
      const p = list[Math.floor(Math.random() * list.length)];
      n.walker.stop();
      n.walker.x = p.x;
      n.walker.z = p.z;
      n.walker.faceTowards(0, 0);
      n.object.position.set(p.x, 0, p.z);
      n.heart.visible = false;
      n.hiding = { since: 0, peek: 4, hintAfter, found: false };
      if (lookAtNpc === n) lookAtNpc = null;
    },

    revealNpc(character) {
      const n = npcs.find((m) => m.data.character === character);
      if (!n) return;
      n.hiding = null;
      n.heart.visible = false;
      n.hold = 4;
      n.walker.faceTowards(walker.x, walker.z);
      n.animator?.play('hop');
      sfx('sparkle');
    },

    zoomBy(f) {
      follow.zoomBy(f);
    },

    orbit(dYaw, dPitch) {
      follow.orbit(dYaw, dPitch);
    },

    resetView() {
      follow.reset();
    },

    gesture(character, g) {
      const a = animatorOf(character);
      if (!a) return;
      if (g === 'hop' || g === 'wave') a.play(g);
      else a.playGesture(g);
    },

    setMirror(on) {
      if (mirror === on) return;
      mirror = on;
      if (on) {
        pending = null;
        walker.stop();
        mirrorSpin = 0;
      }
    },

    setNpcMood(npcId, mood) {
      const npc = npcs.find((n) => n.data.id === npcId);
      if (!npc) return;
      npc.animator?.face?.setBase(mood === 'sad' ? 'sad' : 'normal');
      if (mood === 'sad' && !npc.tears) {
        npc.tears = createTears();
        npc.object.add(npc.tears);
      } else if (mood !== 'sad' && npc.tears) {
        npc.object.remove(npc.tears);
        npc.tears = null;
      }
    },

    setNpcAttention(npcId, on) {
      const npc = npcs.find((n) => n.data.id === npcId);
      if (npc) npc.heart.visible = on;
    },

    update(dt) {
      elapsed += dt;
      walker.update(dt);
      // 돌아다니는 친구에게 가는 중: 충분히 가까워지면 바로 말 걸기 (친구 자리까지 파고들지 않게)
      if (pending?.kind === 'npc' && Math.hypot(walker.x - pending.npc.walker.x, walker.z - pending.npc.walker.z) <= NPC_REACH) {
        arrive(pending);
      }
      if (pending && !walker.moving) arrive(pending);
      updateNpcs(dt);
      for (const n of npcs) n.heart.position.y = HEART_Y + Math.sin(elapsed * 3) * 0.08;
      for (const g of doorGlows) g.material.opacity = 0.25 + 0.2 * Math.sin(elapsed * 3);
      for (const s of sparkles) s.update(dt);
      env?.update(elapsed);
      for (const p of pickups.values()) (p.object.userData.sparkles as Sparkles | undefined)?.update(dt);

      for (const p of pickups.values()) {
        const bloom = p.object.getObjectByName('bloom')!;
        if (!bloom.userData.noSpin) bloom.rotation.y += dt * 0.8;
        if (p.stand !== null) {
          // 넘어진 화분이 톡 일어선다 → 그 자리에 남고 반짝임·판정은 없앤다
          p.stand = Math.min(1, p.stand + dt / 0.45);
          const k = 1 - (1 - p.stand) ** 3;
          bloom.rotation.z = (Math.PI / 2) * (1 - k);
          bloom.position.y = 0.28 * (1 - k) + Math.sin(p.stand * Math.PI) * 0.15;
          if (p.stand >= 1) {
            p.object.remove(p.hit);
            const tw = p.object.userData.sparkles as Sparkles | undefined;
            if (tw) p.object.remove(tw);
            p.object.getObjectByName('glow')?.removeFromParent();
            delete p.object.userData.pickupId;
            pickups.delete(p.id);
          }
          continue;
        }
        const glow = p.object.getObjectByName('glow') as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
        const pulse = 0.5 + 0.5 * Math.sin(elapsed * 4 + p.phase);
        glow.material.opacity = 0.3 + 0.5 * pulse;
        glow.scale.setScalar(1 + 0.25 * pulse);

        if (p.vanish === null) {
          // 나타날 때 커지기
          const s = p.object.scale.x;
          if (s < 1) p.object.scale.setScalar(Math.min(1, s + dt * 3));
        } else {
          p.vanish += dt / 0.4;
          const t = Math.min(p.vanish, 1);
          p.object.scale.setScalar(Math.max(0.01, 1 - t));
          p.object.position.y = t * 0.8;
          if (t >= 1) {
            scene.remove(p.object);
            pickups.delete(p.id);
          }
        }
      }

      // 걸을 때 통통 튀는 느낌 (뼈대 동작이 있으면 걷기 클립이 대신함)
      walkTime = walker.moving ? walkTime + dt : 0;
      let bob = !animator && walker.moving ? Math.abs(Math.sin(walkTime * 10)) * 0.08 : 0;
      let spin = 0;
      if (celebrateT < 1) {
        celebrateT = Math.min(1, celebrateT + dt / (animator ? 0.85 : 0.7));
        if (!animator) bob += Math.sin(celebrateT * Math.PI) * 0.35;
        spin = easeOut(celebrateT) * Math.PI * 2;
      }
      princess.position.set(walker.x, bob, walker.z);
      if (mirror) {
        // 거울 앞: 정면을 보다가 천천히 좌우로 몸을 돌려 옷을 보여 줌
        mirrorSpin += dt;
        princess.rotation.y = Math.sin(mirrorSpin * 0.9) * 0.9 + spin;
      } else {
        princess.rotation.y = walker.heading + spin;
      }

      if (animator && dt > 0) {
        // 몸 회전 속도·가속도 → 기울기·머리카락·치마 출렁임
        let turn = walker.heading - prevHeading;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn)) / dt;
        prevHeading = walker.heading;
        const speed = walker.currentSpeed;
        accelSmooth += ((speed - prevSpeed) / dt - accelSmooth) * Math.min(1, dt * 10);
        prevSpeed = speed;
        lookHold = Math.max(0, lookHold - dt);
        if ((lookHold <= 0 && !talking) || walker.moving) lookAtNpc = null; // 대화 중엔 계속 친구를 봄
        let look: THREE.Vector3 | null = null;
        if (mirror) look = lookPoint.copy(camera.position);
        else if (lookAtNpc) look = lookPoint.set(lookAtNpc.walker.x, 1.2, lookAtNpc.walker.z);
        else if (pending?.kind === 'npc') look = lookPoint.set(pending.npc.walker.x, 1.2, pending.npc.walker.z);
        animator.update(dt, { speed, turnRate: mirror ? 0 : turn, accel: accelSmooth, lookAt: look });
      }

      updatePet(dt);

      // 발걸음 먼지 (0.7m마다 왼발·오른발 번갈아), 폴짝 착지 먼지
      if (walker.moving && walker.currentSpeed > 0.6) {
        stepDist += walker.currentSpeed * dt;
        if (stepDist > 0.7) {
          stepDist = 0;
          stepSide = -stepSide;
          const h = walker.heading;
          fx.puff(walker.x + Math.cos(h) * 0.12 * stepSide - Math.sin(h) * 0.15, walker.z - Math.sin(h) * 0.12 * stepSide - Math.cos(h) * 0.15, 0.3);
        }
      } else {
        stepDist = 0.5;
      }
      if (landIn >= 0) {
        landIn -= dt;
        if (landIn < 0) fx.landing(walker.x, walker.z);
      }
      fx.update(dt, focus);

      marker.update(dt);
      // 걷는 방향 앞쪽을 조금 더 보여 주기 (빠를수록 더), 대화 중엔 친구와의 가운데를 보며 다가감
      const sp = walker.currentSpeed;
      lead.lerp(
        new THREE.Vector3(Math.sin(walker.heading) * sp * 0.5, 0, Math.cos(walker.heading) * sp * 0.5),
        1 - Math.exp(-3 * dt),
      );
      focus.set(walker.x + lead.x, 0, walker.z + lead.z);
      const talkWith = talking ? lookAtNpc : null;
      if (mirror) {
        const k = 1 - Math.exp(-6 * dt);
        mirrorCam.set(walker.x, 1.45, walker.z + 3.9);
        camera.position.lerp(mirrorCam, k);
        mirrorLook.lerp(lookTarget.set(walker.x, 1.0, walker.z), k);
        camera.lookAt(mirrorLook);
        camPos.copy(camera.position);
        camLook.copy(mirrorLook);
      } else {
        // 따라가는 카메라가 원하는 자리
        follow.update(focus, dt);
        wantPos.copy(camera.position);
        wantLook.set(focus.x, 0.8, focus.z);
        if (talkWith) {
          // 대화: 두 얼굴이 다 보이게 옆(카메라 쪽)에서 가까이
          const mx = (walker.x + talkWith.walker.x) / 2;
          const mz = (walker.z + talkWith.walker.z) / 2;
          let nx = -(talkWith.walker.z - walker.z);
          let nz = talkWith.walker.x - walker.x;
          const len = Math.hypot(nx, nz) || 1;
          nx /= len;
          nz /= len;
          // 지금 카메라가 있는 쪽에서 보게 (아이가 돌려 놓은 각도 존중)
          const side = follow.sideDir(camSide);
          if (nx * side.x + nz * side.z < 0) {
            nx = -nx;
            nz = -nz;
          }
          // 너무 옆이면 카메라 쪽으로 섞어 화면 방향이 크게 뒤집히지 않게
          const dx = nx + side.x * 0.35;
          const dz = nz + side.z * 0.35;
          const dl = Math.hypot(dx, dz);
          wantPos.set(mx + (dx / dl) * 5.2, 2.6, mz + (dz / dl) * 5.2);
          wantLook.set(mx, 0.95, mz);
        }
        // 따라가기 ↔ 대화 사이를 부드럽게 오가기
        const k = 1 - Math.exp(-4 * dt);
        camPos.lerp(wantPos, k);
        camLook.lerp(wantLook, k);
        camera.position.copy(camPos);
        camera.lookAt(camLook);
        mirrorLook.set(walker.x, 0.8, walker.z);
      }
    },
  };
}

function addLights(scene: THREE.Scene, layout: CourtyardLayout): void {
  // 하늘빛(푸른 위·따뜻한 아래)은 조금 줄이고 햇빛을 따뜻하고 세게 → 그림자와 입체감이 또렷 (그래픽 2차 G1)
  scene.add(new THREE.HemisphereLight(0xdfe9ff, 0xead2c0, 1.3));
  // 실시간 그림자는 이 방향광 1개만 (CLAUDE.md 성능 원칙)
  const sun = new THREE.DirectionalLight(0xfff0da, 2.1);
  sun.position.set(8, 16, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(QUALITY_SETTINGS.shadowMap, QUALITY_SETTINGS.shadowMap);
  const half = Math.max(layout.width, layout.depth) / 2 + 2;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 50 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  // 뒤쪽 위에서 비추는 분홍빛 테두리 조명 (말랑한 피규어처럼 윤곽이 반짝)
  const rim = new THREE.DirectionalLight(0xffc9e8, 0.75);
  rim.position.set(-6, 10, -12);
  scene.add(rim);
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** 위는 장소의 하늘색, 아래(지평선)는 연분홍으로 부드럽게 */
function skyGradient(top: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(0.7, '#f4f2ff');
  g.addColorStop(1, HORIZON);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 눈물 두 방울 (친구 얼굴 앞, 양쪽 눈 아래) */
function createTears(): THREE.Group {
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    const drop = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x74c0ff, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    drop.scale.y = 1.3;
    drop.userData.y0 = 1.22;
    drop.position.set(side * 0.15, 1.22, 0.42);
    g.add(drop);
  }
  return g;
}

/** 별사탕 가게 간판: 문 위에 큰 노란 별 (글을 몰라도 알아볼 수 있게) */
function createShopSign(doorH: number): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? 0.55 : 0.25;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const mat = toonMaterial({ color: 0xffd76a, emissive: 0x553300, emissiveIntensity: 0.4 }, 'gem');
  const star = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05 }), mat);
  star.castShadow = true;
  g.add(star);
  g.position.set(0, doorH + 0.95, 0.05);
  g.userData.noOutline = true;
  return g;
}

/** 펫 머리 위 말풍선 그림: 흰 동그라미 + 아이콘(SVG) */
function bubbleTexture(iconSvg: string): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffb3d6';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(64, 58, 50, 0, Math.PI * 2);
  ctx.moveTo(52, 104);
  ctx.lineTo(64, 124);
  ctx.lineTo(76, 104);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(64, 58, 47, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 26, 20, 76, 76);
    tex.needsUpdate = true;
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" '))}`;
  return tex;
}
