import { QUALITY_SETTINGS } from '../../core/quality';
import * as THREE from 'three';
import { addOutline, toonMaterial, type Surface } from '../../core/toon';
import { footprint, getFurniture, type RoomLayout } from '../../systems/decor';
import { getColor } from '../../systems/wardrobe';
import { Sparkles } from '../../core/sparkles';
import { getCharacter } from '../../systems/dialogue';
import { createFurnitureMesh, disposeObject, recolorFurniture } from './furniture-meshes';
import { createFriendFromGlb, hasFriendGlb } from './friends-glb';
import { createCharacterMesh } from './props';
import type { PrincessAnimator } from './princess-animator';

/**
 * 성 안 방 (GDD 5.2) — 앞·오른쪽 벽을 뗀 인형의 집 같은 시점.
 * 무엇을 놓을지는 RoomLayout(순수 로직)이 정하고, 이 장면은 그대로 보여 주기만 한다.
 */
export interface BedroomScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update(dt: number): void;
  /** 화면 좌표(NDC) 아래의 가구 uid */
  pickFurniture(ndc: THREE.Vector2): string | null;
  /** 화면 좌표(NDC) 아래가 거울이면 true */
  pickMirror(ndc: THREE.Vector2): boolean;
  /** 화면 좌표(NDC)가 가리키는 바닥 (방 밖이어도 바닥 평면 위 좌표) */
  floorPoint(ndc: THREE.Vector2): { x: number; z: number } | null;
  /** 끌고 있는 가구 미리보기. valid=false면 흐릿한 회색 (빨간 경고 없음) */
  showGhost(itemId: string, rot: number, c: number, r: number, color: string, valid: boolean): void;
  hideGhost(): void;
  /** 배치 상태를 화면에 반영 */
  sync(): void;
  setHidden(uid: string | null): void;
  select(uid: string | null): void;
  /** 놓을 때 톡 튀어나오기 */
  pop(uid: string): void;
  /** 못 돌릴 때 살짝 흔들기 */
  wiggle(uid: string): void;
  /** 벽지·바닥·커튼 색을 RoomLayout.style대로 다시 칠하기 (바뀐 부분은 살짝 반짝) */
  applyStyle(changed?: 'wall' | 'floor' | 'curtain'): void;
  /** 초대한 친구를 방에 세우기 (null이면 손 흔들고 사라짐) */
  showGuest(characterId: string | null): void;
  /** 아래 bottomPx만큼 가려져도 방 전체가 보이도록 카메라 거리 맞추기 */
  fitView(viewW: number, viewH: number, bottomPx: number): void;
}

interface Shown {
  obj: THREE.Group;
  key: string;
  color: string;
  anim: { kind: 'pop' | 'wiggle'; t: number } | null;
}

export function createBedroomScene(aspect: number, layout: RoomLayout): BedroomScene {
  const def = layout.def;
  const W = def.width;
  const D = def.depth;
  const WALL_H = 2.6;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3e9ff);

  const camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 80);
  const LOOK = new THREE.Vector3(0, 0.5, 0);
  const VIEW_DIR = new THREE.Vector3(5.4, 6.6, 7.6).sub(LOOK).normalize();
  camera.position.copy(LOOK).addScaledVector(VIEW_DIR, 11);
  camera.lookAt(LOOK);
  // 화면에 꼭 들어와야 하는 점: 바닥 네 귀퉁이 + 벽 꼭대기
  const KEY_POINTS = [
    [-W / 2, 0, -D / 2], [W / 2, 0, -D / 2], [W / 2, 0, D / 2], [-W / 2, 0, D / 2],
    [-W / 2, WALL_H, -D / 2], [W / 2, WALL_H, -D / 2], [-W / 2, WALL_H, D / 2],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));

  scene.add(new THREE.HemisphereLight(0xffffff, 0xe8d8f0, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(4, 8, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(QUALITY_SETTINGS.shadowMap, QUALITY_SETTINGS.shadowMap);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 20 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // 바닥 + 벽 2개 (뒤·왼쪽)
  const floorMat = toonMaterial({ color: layout.surfaceHex('floor'), roughness: 0.9 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const wallMat = toonMaterial({ color: layout.surfaceHex('wall'), roughness: 1 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, WALL_H, 0.2), wallMat);
  back.position.set(0, WALL_H / 2, -D / 2 - 0.1);
  back.receiveShadow = true;
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.2, WALL_H, D), wallMat);
  left.position.set(-W / 2 - 0.1, WALL_H / 2, 0);
  left.receiveShadow = true;
  scene.add(back, left);

  // ── 방 꾸밈 (그래픽 고도화): 나무 마루 결, 흰 걸레받이, 아래 벽 띠(징두리)와 가로대, 위 몰딩 ──
  // 색은 고른 벽지·바닥 색을 따라간다 (applyStyle 에서 함께 갱신)
  const grooveMat = toonMaterial({ color: 0x000000, roughness: 1 });
  const wainscotMat = toonMaterial({ color: 0xffffff, roughness: 0.9 });
  const trimMat = toonMaterial({ color: 0xfffbf6, roughness: 0.6 });
  const decor = new THREE.Group();
  const plankW = 0.5;
  for (let x = -W / 2 + plankW; x < W / 2 - 0.01; x += plankW) {
    const groove = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.004, D), grooveMat);
    groove.position.set(x, 0.002, 0);
    groove.receiveShadow = true;
    decor.add(groove);
  }
  // 판자 이음매 (엇갈리게)
  for (let i = 0; i < Math.round(W / plankW); i++) {
    const x = -W / 2 + plankW * (i + 0.5);
    const z = -D / 2 + ((i * 1.7) % D);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(plankW, 0.004, 0.02), grooveMat);
    seam.position.set(x, 0.002, z);
    decor.add(seam);
  }
  const WAINSCOT = 0.9;
  const backLow = new THREE.Mesh(new THREE.BoxGeometry(W, WAINSCOT, 0.04), wainscotMat);
  backLow.position.set(0, WAINSCOT / 2, -D / 2 + 0.02);
  const leftLow = new THREE.Mesh(new THREE.BoxGeometry(0.04, WAINSCOT, D), wainscotMat);
  leftLow.position.set(-W / 2 + 0.02, WAINSCOT / 2, 0);
  decor.add(backLow, leftLow);
  for (const [y, h, depth] of [[0.06, 0.12, 0.07], [WAINSCOT, 0.06, 0.06], [WALL_H - 0.06, 0.12, 0.08]] as const) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(W, h, depth), trimMat);
    b.position.set(0, y, -D / 2 + depth / 2);
    const l = new THREE.Mesh(new THREE.BoxGeometry(depth, h, D), trimMat);
    l.position.set(-W / 2 + depth / 2, y, 0);
    decor.add(b, l);
  }
  decor.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).receiveShadow = true) : null));
  scene.add(decor);
  const syncDecorColors = () => {
    grooveMat.color.set(layout.surfaceHex('floor')).multiplyScalar(0.8);
    // 아래 벽은 벽지보다 살짝 진하게
    wainscotMat.color.set(layout.surfaceHex('wall')).lerp(new THREE.Color(0xc9a0b8), 0.12);
  };
  syncDecorColors();
  // 창문 (뒷벽)
  const win = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 0.05), new THREE.MeshBasicMaterial({ color: 0xbfe6ff }));
  win.position.set(1.2, 1.55, -D / 2 + 0.01);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.15, 0.04), toonMaterial({ color: 0xffffff }));
  frame.position.set(1.2, 1.55, -D / 2 - 0.005);
  scene.add(frame, win);
  // 커튼 (창문 양쪽 + 위 주름 장식) — 색을 바꿀 수 있다
  const curtainMat = toonMaterial({ color: layout.surfaceHex('curtain') }, 'cloth');
  const curtains = new THREE.Group();
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.55, 0.08), curtainMat);
    panel.position.set(1.2 + side * 0.92, 1.4, -D / 2 + 0.06);
    panel.castShadow = true;
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 20), toonMaterial({ color: 0xffd76a }, 'gem'));
    tie.position.set(1.2 + side * 0.92, 1.25, -D / 2 + 0.12);
    curtains.add(panel, tie);
  }
  for (let i = 0; i < 5; i++) {
    const scallop = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10), curtainMat);
    scallop.scale.set(1, 0.55, 0.35);
    scallop.position.set(1.2 - 0.88 + i * 0.44, 2.2, -D / 2 + 0.08);
    curtains.add(scallop);
  }
  scene.add(curtains);
  // 색이 바뀐 자리에 반짝
  const paintSparkles = new Sparkles({ count: 10, radius: 1.6, height: [0.2, 2.2], size: 0.3, color: 0xffffff });
  paintSparkles.visible = false;
  scene.add(paintSparkles);
  let paintTime = 0;
  // 거울 (드레스룸): 왼쪽 벽에 금테 두른 큰 거울 — 톡하면 옷 갈아입기
  let mirror: THREE.Group | null = null;
  let mirrorSparkles: Sparkles | null = null;
  if (def.mirror) {
    mirror = new THREE.Group();
    const glass = new THREE.Mesh(
      new THREE.CircleGeometry(0.62, 40),
      toonMaterial({ color: 0xdff3ff, roughness: 0.05, metalness: 0.6 }, 'gem'),
    );
    glass.scale.y = 1.45;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.07, 12, 48), toonMaterial({ color: 0xffd76a }, 'gem'));
    rim.scale.y = 1.45;
    const shine = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.9),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }),
    );
    shine.position.set(-0.22, 0.15, 0.01);
    shine.rotation.z = -0.35;
    const bow = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), toonMaterial({ color: 0xff9ccf }, 'cloth'));
    bow.position.set(0, 0.98, 0.04);
    mirror.add(glass, rim, shine, bow);
    mirror.rotation.y = Math.PI / 2; // 왼쪽 벽에서 방 쪽(+x)을 본다
    mirror.scale.setScalar(1.25); // 아이 손가락으로 톡하기 쉽게 크게
    mirror.position.set(-W / 2 + 0.03, 1.35, -D / 6);
    mirrorSparkles = new Sparkles({ count: 6, radius: 0.7, height: [-0.8, 0.9], size: 0.26 });
    mirror.add(mirrorSparkles);
    scene.add(mirror);
  }
  // 초대한 친구
  let guest: { obj: THREE.Group; sparkles: Sparkles; t: number; leaving: boolean } | null = null;
  // 바닥 테두리 (방 끝이 어딘지 보이게)
  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(W, 0.06, 0.06),
    toonMaterial({ color: 0xd8c2ad }),
  );
  edge.position.set(0, 0.03, D / 2);
  const edge2 = edge.clone();
  edge2.rotation.y = Math.PI / 2;
  edge2.position.set(W / 2, 0.03, 0);
  scene.add(edge, edge2);

  // 끄는 동안만 보이는 칸 선
  const grid = new THREE.GridHelper(W, layout.cols, 0xc9b5a3, 0xc9b5a3);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.45;
  grid.position.y = 0.006;
  grid.visible = false;
  scene.add(grid);

  // 선택 표시 (바닥에 깔리는 반짝 판)
  const selMat = new THREE.MeshBasicMaterial({ color: 0xff9ccf, transparent: true, opacity: 0.35, depthWrite: false });
  const selection = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), selMat);
  selection.rotation.x = -Math.PI / 2;
  selection.position.y = 0.01;
  selection.visible = false;
  scene.add(selection);
  let selectedUid: string | null = null;

  const shown = new Map<string, Shown>();
  let hiddenUid: string | null = null;
  let ghost: { key: string; obj: THREE.Group } | null = null;
  const raycaster = new THREE.Raycaster();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const tmp = new THREE.Vector3();
  let elapsed = 0;

  const placeObj = (obj: THREE.Object3D, itemId: string, c: number, r: number, rot: number) => {
    const p = layout.centerOf(itemId, c, r, rot);
    obj.position.set(p.x, 0, p.z);
    obj.rotation.y = -rot * (Math.PI / 2);
    // 다음 화면 그리기 전에 톡해도 맞게 바로 위치 갱신
    obj.updateMatrixWorld(true);
  };

  const build = (itemId: string, color: string) => {
    const it = getFurniture(itemId)!;
    const cs = def.cellSize;
    const obj = createFurnitureMesh(it.shape, getColor(color).hex, it.w * cs, it.d * cs);
    obj.userData.furniture = true;
    addOutline(obj, 0.015);
    return obj;
  };

  const api: BedroomScene = {
    scene,
    camera,

    pickFurniture(ndc) {
      raycaster.setFromCamera(ndc, camera);
      const objs = [...shown.entries()].filter(([uid]) => uid !== hiddenUid).map(([, s]) => s.obj);
      const hit = raycaster.intersectObjects(objs, true)[0];
      if (!hit) return null;
      for (const [uid, s] of shown) {
        let o: THREE.Object3D | null = hit.object;
        while (o && o !== s.obj) o = o.parent;
        if (o) return uid;
      }
      return null;
    },

    pickMirror(ndc) {
      if (!mirror) return false;
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObject(mirror, true).some((h) => !(h.object as THREE.Sprite).isSprite);
    },

    floorPoint(ndc) {
      raycaster.setFromCamera(ndc, camera);
      const p = raycaster.ray.intersectPlane(floorPlane, tmp);
      return p ? { x: p.x, z: p.z } : null;
    },

    showGhost(itemId, rot, c, r, color, valid) {
      const key = `${itemId}:${color}`;
      if (!ghost || ghost.key !== key) {
        if (ghost) {
          scene.remove(ghost.obj);
          disposeObject(ghost.obj);
        }
        const obj = build(itemId, color);
        obj.traverse((m) => {
          const mesh = m as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = false;
          const mat = (mesh.material as Surface).clone();
          mat.transparent = true;
          mat.userData.baseColor = mat.color.clone();
          if (mesh.userData.isOutline) mesh.visible = false; // 미리보기는 외곽선 없이
          mesh.material = mat;
        });
        ghost = { key, obj };
        scene.add(obj);
      }
      placeObj(ghost.obj, itemId, c, r, rot);
      ghost.obj.position.y = 0.06;
      ghost.obj.visible = true;
      ghost.obj.traverse((m) => {
        const mat = (m as THREE.Mesh).material as Surface | undefined;
        if (!mat?.userData?.baseColor) return;
        mat.opacity = valid ? 0.85 : 0.35;
        mat.color.copy(valid ? mat.userData.baseColor : new THREE.Color(0xbbb6c4));
      });
      grid.visible = true;
    },

    hideGhost() {
      if (ghost) ghost.obj.visible = false;
      grid.visible = false;
    },

    sync() {
      const alive = new Set<string>();
      for (const p of layout.items) {
        alive.add(p.uid);
        let s = shown.get(p.uid);
        const key = p.item;
        if (!s || s.key !== key) {
          if (s) {
            scene.remove(s.obj);
            disposeObject(s.obj);
          }
          s = { obj: build(p.item, p.color), key, color: p.color, anim: null };
          shown.set(p.uid, s);
          scene.add(s.obj);
        }
        if (s.color !== p.color) {
          recolorFurniture(s.obj, getColor(p.color).hex);
          s.color = p.color;
        }
        placeObj(s.obj, p.item, p.c, p.r, p.rot);
        s.obj.visible = p.uid !== hiddenUid;
      }
      for (const [uid, s] of shown) {
        if (alive.has(uid)) continue;
        scene.remove(s.obj);
        disposeObject(s.obj);
        shown.delete(uid);
      }
      if (selectedUid && !alive.has(selectedUid)) api.select(null);
      else api.select(selectedUid);
    },

    setHidden(uid) {
      hiddenUid = uid;
      for (const [id, s] of shown) s.obj.visible = id !== uid;
      if (uid && uid === selectedUid) selection.visible = false;
    },

    select(uid) {
      selectedUid = uid;
      const p = uid ? layout.get(uid) : undefined;
      if (!p) {
        selection.visible = false;
        return;
      }
      const it = getFurniture(p.item)!;
      const fp = footprint(it, p.rot);
      const center = layout.centerOf(p.item, p.c, p.r, p.rot);
      selection.scale.set(fp.w * def.cellSize + 0.2, fp.d * def.cellSize + 0.2, 1);
      selection.position.set(center.x, 0.01 + (it.layer === 'floor' ? 0.03 : 0), center.z);
      selection.visible = uid !== hiddenUid;
    },

    pop(uid) {
      const s = shown.get(uid);
      if (s) s.anim = { kind: 'pop', t: 0 };
    },

    wiggle(uid) {
      const s = shown.get(uid);
      if (s) s.anim = { kind: 'wiggle', t: 0 };
    },

    applyStyle(changed) {
      wallMat.color.set(layout.surfaceHex('wall'));
      floorMat.color.set(layout.surfaceHex('floor'));
      syncDecorColors();
      curtainMat.color.set(layout.surfaceHex('curtain'));
      if (!changed) return;
      const at = { wall: [-W / 4, 1.3, -D / 2 + 0.3], floor: [0, 0.1, 0], curtain: [1.2, 1.5, -D / 2 + 0.3] }[changed];
      paintSparkles.position.set(at[0], at[1], at[2]);
      paintSparkles.visible = true;
      paintTime = 1.2;
    },

    showGuest(characterId) {
      if (guest) {
        // 이미 있던 친구는 바로 치운다 (새 친구가 오면 바뀜)
        if (characterId !== null) {
          scene.remove(guest.obj);
          guest = null;
        } else {
          guest.leaving = true;
          guest.t = 0;
          return;
        }
      }
      if (characterId === null) return;
      const obj = hasFriendGlb(characterId) ? createFriendFromGlb(characterId) : createCharacterMesh(getCharacter(characterId));
      const at = layout.guestSpot();
      obj.position.set(at.x, 0, at.z);
      // 카메라 쪽을 본다
      obj.rotation.y = Math.atan2(VIEW_DIR.x, VIEW_DIR.z);
      obj.scale.setScalar(0.01);
      obj.traverse((m) => ((m as THREE.Mesh).isMesh ? ((m as THREE.Mesh).castShadow = true) : null));
      const sparkles = new Sparkles({ count: 8, radius: 0.7, height: [0.2, 1.6], size: 0.3 });
      obj.add(sparkles);
      scene.add(obj);
      guest = { obj, sparkles, t: 0, leaving: false };
      // 기뻐서 폴짝 (뼈대 모델이면)
      (obj.userData.animator as PrincessAnimator | null | undefined)?.play('hop');
    },

    fitView(viewW, viewH, bottomPx) {
      camera.aspect = viewW / viewH;
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
      const bottomNdc = -1 + (2 * bottomPx) / viewH + 0.04;
      const topNdc = 1 - (2 * 96) / viewH; // 위쪽 여백: 방 고르기 버튼 아래부터
      const v = new THREE.Vector3();
      // 화면 아래가 가려진 만큼 바라보는 점을 위로 올리고(=방이 위로), 다 들어올 때까지 뒤로 물러난다
      for (let dist = 7; dist <= 30; dist += 0.25) {
        camera.position.copy(LOOK).addScaledVector(VIEW_DIR, dist);
        camera.lookAt(LOOK);
        camera.updateMatrixWorld();
        let minY = Infinity;
        let maxY = -Infinity;
        let ok = true;
        for (const p of KEY_POINTS) {
          v.copy(p).project(camera);
          if (Math.abs(v.x) > 0.94) ok = false;
          minY = Math.min(minY, v.y);
          maxY = Math.max(maxY, v.y);
        }
        // 세로로 남는 공간 안에 들어가면, 가운데를 맞추도록 화면을 옮긴다
        if (ok && maxY - minY <= topNdc - bottomNdc) {
          const shiftNdc = (topNdc + bottomNdc) / 2 - (maxY + minY) / 2;
          camera.setViewOffset(viewW, viewH, 0, (shiftNdc * viewH) / 2, viewW, viewH);
          return;
        }
      }
    },

    update(dt) {
      elapsed += dt;
      selMat.opacity = 0.25 + 0.15 * Math.sin(elapsed * 5);
      mirrorSparkles?.update(dt);
      if (paintTime > 0) {
        paintTime -= dt;
        paintSparkles.update(dt);
        if (paintTime <= 0) paintSparkles.visible = false;
      }
      if (guest) {
        guest.t += dt;
        guest.sparkles.update(dt);
        (guest.obj.userData.animator as PrincessAnimator | null | undefined)?.update(dt, {
          speed: 0,
          turnRate: 0,
          accel: 0,
          lookAt: camera.position,
        });
        if (guest.leaving) {
          // 깡충 뛰며 작아져서 사라짐
          const k = Math.max(0, 1 - guest.t / 0.45);
          guest.obj.scale.setScalar(Math.max(0.01, k));
          guest.obj.position.y = Math.sin(Math.min(guest.t / 0.45, 1) * Math.PI) * 0.4;
          if (k <= 0) {
            scene.remove(guest.obj);
            guest = null;
          }
        } else {
          // 톡 나타나서 기쁘게 통통
          const grow = Math.min(1, guest.t / 0.35);
          guest.obj.scale.setScalar(Math.max(0.01, grow < 1 ? grow * (1 + 0.25 * Math.sin(grow * Math.PI)) : 1));
          guest.obj.position.y = Math.abs(Math.sin(guest.t * 4)) * 0.12;
        }
      }
      for (const s of shown.values()) {
        if (!s.anim) continue;
        s.anim.t += dt;
        if (s.anim.kind === 'pop') {
          const t = Math.min(s.anim.t / 0.35, 1);
          // 살짝 커졌다가 제자리 (통통)
          const k = t < 1 ? 1 + Math.sin(t * Math.PI) * 0.18 : 1;
          s.obj.scale.set(k, 2 - k, k);
          if (t >= 1) {
            s.obj.scale.set(1, 1, 1);
            s.anim = null;
          }
        } else {
          const t = Math.min(s.anim.t / 0.4, 1);
          s.obj.rotation.z = Math.sin(t * Math.PI * 6) * 0.06 * (1 - t);
          if (t >= 1) {
            s.obj.rotation.z = 0;
            s.anim = null;
          }
        }
      }
    },
  };

  api.sync();
  return api;
}
