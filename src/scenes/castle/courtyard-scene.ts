import * as THREE from 'three';
import { Sparkles } from '../../core/sparkles';
import { addOutline, toonMaterial } from '../../core/toon';
import { FollowCamera } from '../../core/follow-camera';
import { TapMarker } from '../../core/tap-marker';
import { Walker } from '../../systems/navigation/walker';
import type { Point } from '../../systems/navigation/nav-grid';
import { getCharacter } from '../../systems/dialogue';
import { defaultOutfit, type Outfit } from '../../systems/wardrobe';
import {
  buildNavGrid,
  courtyardLayout,
  type CourtyardLayout,
  type DoorPlacement,
  type NpcPlacement,
} from './courtyard-layout';
import { createPrincessModel } from './princess-model';
import {
  COLORS,
  createCharacterMesh,
  createFlowerMesh,
  createHeartTexture,
  createHitArea,
  createFlowerPatch,
  createObstacleMesh,
} from './props';

/** 공주가 다가가서 하는 일: 친구에게 말 걸기 / 물건 줍기 */
export type Interaction =
  | { kind: 'npc'; npc: NpcPlacement }
  | { kind: 'pickup'; id: string; item: string }
  | { kind: 'door'; door: DoorPlacement };

export interface CourtyardScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update(dt: number): void;
  /** 화면 좌표(NDC, -1~1)를 톡했을 때 */
  tap(ndc: THREE.Vector2): void;
  /** 마당에 주울 물건을 놓는다 */
  addPickup(id: string, item: string, color: string, at: Point): void;
  /** 주운 물건을 없앤다 (쏙 작아지며 사라짐) */
  removePickup(id: string): void;
  /** 친구 머리 위 ♥ 표시 켜기/끄기 */
  setNpcAttention(npcId: string, on: boolean): void;
  /** 공주를 다른 곳으로 옮긴다 (열기구에서 내릴 때) */
  teleport(at: Point): void;
  /** 공주 옷 갈아입히기. celebrate면 빙글 돌며 폴짝 */
  setOutfit(outfit: Outfit, celebrate?: boolean): void;
  /** 거울(드레스룸) 모드: 카메라가 공주 앞으로 다가가고 공주가 천천히 돈다. 이동 톡은 막힘 */
  setMirror(on: boolean): void;
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
const TALK_DISTANCE = 1.6;
/** 이 거리 안이면 바로 줍는다 */
const PICKUP_DISTANCE = 0.8;

interface Npc {
  data: NpcPlacement;
  object: THREE.Group;
  heart: THREE.Sprite;
}

interface Pickup {
  id: string;
  item: string;
  object: THREE.Group;
  hit: THREE.Mesh;
  phase: number;
  /** 사라지는 중이면 0→1 */
  vanish: number | null;
}

type Target = { kind: 'npc'; npc: Npc } | { kind: 'pickup'; pickup: Pickup } | { kind: 'door'; door: DoorPlacement };

/** 문 앞에 서는 거리 */
const DOOR_DISTANCE = 1.4;

export function createCourtyardScene(aspect: number, opts: CourtyardOptions = {}): CourtyardScene {
  const layout = opts.layout ?? courtyardLayout;
  const scene = new THREE.Scene();
  const theme = layout.theme;
  scene.background = skyGradient(theme.sky);
  scene.fog = new THREE.Fog(HORIZON, 30, 70);

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
  for (const o of layout.obstacles) {
    const mesh = createObstacleMesh(o, theme);
    scene.add(mesh);
    tappables.push(mesh);
  }
  for (const patch of layout.flowerPatches ?? []) scene.add(createFlowerPatch(patch));

  // 친구들
  const heartTexture = createHeartTexture();
  const npcs: Npc[] = layout.npcs.map((data) => {
    const object = createCharacterMesh(getCharacter(data.character));
    object.position.set(data.x, 0, data.z);
    object.rotation.y = data.facing;
    object.userData.npcId = data.id;
    object.add(createHitArea(0.7, 2.6));
    // ♥ 표시: 말을 걸 수 있는 친구 (GDD 4)
    const heart = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTexture, depthWrite: false }));
    heart.scale.setScalar(0.6);
    heart.position.y = HEART_Y;
    object.add(heart);
    scene.add(object);
    tappables.push(object);
    return { data, object, heart };
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
    const doorSparkles = new Sparkles({ count: 7, radius: 1, height: [0.4, 2.6], size: 0.34 });
    doorSparkles.position.z = 0.4;
    door.add(doorSparkles);
    sparkles.push(doorSparkles);
    scene.add(door);
    tappables.push(door);
  }

  const pickups = new Map<string, Pickup>();

  const grid = buildNavGrid(layout);
  const walker = new Walker(layout.start);
  const princessModel = createPrincessModel(opts.outfit ?? defaultOutfit());
  const princess = princessModel.group;
  scene.add(princess);
  let mirror = false;
  let mirrorSpin = 0;
  /** 옷을 바꿨을 때 빙글+폴짝 (0→1) */
  let celebrateT = 1;

  const marker = new TapMarker();
  scene.add(marker.object);

  const follow = new FollowCamera(camera);
  const focus = new THREE.Vector3(walker.x, 0, walker.z);
  follow.snap(focus);

  const raycaster = new THREE.Raycaster();
  const mirrorCam = new THREE.Vector3();
  const mirrorLook = new THREE.Vector3(walker.x, 0.8, walker.z);
  const lookTarget = new THREE.Vector3();
  let walkTime = 0;
  let elapsed = 0;
  /** 걸어가는 중인 목적지(친구·물건) */
  let pending: Target | null = null;

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
      const pickupId = o.userData.pickupId as string | undefined;
      if (pickupId) {
        const pickup = pickups.get(pickupId);
        return pickup && pickup.vanish === null ? { kind: 'pickup', pickup } : null;
      }
    }
    return null;
  };

  const targetPos = (t: Target): Point =>
    t.kind === 'npc'
      ? { x: t.npc.data.x, z: t.npc.data.z }
      : t.kind === 'door'
        ? { x: t.door.x, z: t.door.z + 0.6 }
        : { x: t.pickup.object.position.x, z: t.pickup.object.position.z };

  const arrive = (t: Target) => {
    pending = null;
    walker.stop();
    const p = targetPos(t);
    walker.faceTowards(p.x, p.z);
    if (t.kind === 'npc') {
      t.npc.object.rotation.y = Math.atan2(walker.x - p.x, walker.z - p.z);
      opts.onInteract?.({ kind: 'npc', npc: t.npc.data });
    } else if (t.kind === 'door') {
      walker.faceTowards(t.door.x, t.door.z - 1);
      opts.onInteract?.({ kind: 'door', door: t.door });
    } else {
      opts.onInteract?.({ kind: 'pickup', id: t.pickup.id, item: t.pickup.item });
    }
  };

  return {
    scene,
    camera,

    tap(ndc) {
      if (mirror) return;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects([...tappables, ...[...pickups.values()].map((p) => p.object)], true);
      if (hits.length === 0) return;
      // 투명 판정 영역이 있는 친구·물건을 먼저 (뒤에 있는 바닥보다 우선)
      const target = hits.map((h) => targetFromHit(h.object)).find((t) => t !== null) ?? null;
      pending = target;

      const dest = target ? targetPos(target) : { x: hits[0].point.x, z: hits[0].point.z };
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

    addPickup(id, item, color, at) {
      const object = createFlowerMesh(color);
      object.position.set(at.x, 0, at.z);
      object.userData.pickupId = id;
      const hit = createHitArea(0.6, 1.2);
      object.add(hit);
      addOutline(object, 0.012);
      const twinkle = new Sparkles({ count: 4, radius: 0.45, height: [0.3, 0.9], size: 0.26 });
      object.add(twinkle);
      object.userData.sparkles = twinkle;
      object.scale.setScalar(0.01); // 톡 나타나는 연출
      scene.add(object);
      pickups.set(id, { id, item, object, hit, phase: Math.random() * Math.PI * 2, vanish: null });
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
    },

    setOutfit(outfit, celebrate = false) {
      princessModel.setOutfit(outfit);
      if (celebrate) celebrateT = 0;
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

    setNpcAttention(npcId, on) {
      const npc = npcs.find((n) => n.data.id === npcId);
      if (npc) npc.heart.visible = on;
    },

    update(dt) {
      elapsed += dt;
      walker.update(dt);
      if (pending && !walker.moving) arrive(pending);
      for (const n of npcs) n.heart.position.y = HEART_Y + Math.sin(elapsed * 3) * 0.08;
      for (const g of doorGlows) g.material.opacity = 0.25 + 0.2 * Math.sin(elapsed * 3);
      for (const s of sparkles) s.update(dt);
      for (const p of pickups.values()) (p.object.userData.sparkles as Sparkles | undefined)?.update(dt);

      for (const p of pickups.values()) {
        const bloom = p.object.getObjectByName('bloom')!;
        bloom.rotation.y += dt * 0.8;
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

      // 걸을 때 통통 튀는 느낌
      walkTime = walker.moving ? walkTime + dt : 0;
      let bob = walker.moving ? Math.abs(Math.sin(walkTime * 10)) * 0.08 : 0;
      let spin = 0;
      if (celebrateT < 1) {
        celebrateT = Math.min(1, celebrateT + dt / 0.7);
        bob += Math.sin(celebrateT * Math.PI) * 0.35;
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

      marker.update(dt);
      focus.set(walker.x, 0, walker.z);
      if (mirror) {
        const k = 1 - Math.exp(-6 * dt);
        mirrorCam.set(walker.x, 1.45, walker.z + 3.9);
        camera.position.lerp(mirrorCam, k);
        mirrorLook.lerp(lookTarget.set(walker.x, 1.0, walker.z), k);
        camera.lookAt(mirrorLook);
      } else {
        follow.update(focus, dt);
        mirrorLook.set(walker.x, 0.8, walker.z);
      }
    },
  };
}

function addLights(scene: THREE.Scene, layout: CourtyardLayout): void {
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9c8e8, 1.6));
  // 실시간 그림자는 이 방향광 1개만 (CLAUDE.md 성능 원칙)
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(8, 16, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const half = Math.max(layout.width, layout.depth) / 2 + 2;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 50 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
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
