import type * as THREE from 'three';
import { createFriendFromGlb, hasFriendGlb } from '../scenes/castle/friends-glb';
import { createPrincessModel } from '../scenes/castle/princess-model';
import type { Face } from '../scenes/castle/face';
import type { Mood } from '../systems/dialogue';
import type { Outfit } from '../systems/wardrobe';
import { createPetModel } from '../scenes/castle/pet-glb';
import { snapshot } from './pet-thumbs';

/**
 * 말풍선 앞 얼굴 사진: 3D 모델을 대사 기분의 표정으로 찍는다 (머리·어깨).
 * 친구는 (id, 기분)마다 한 번만 찍어 두고, 공주는 입은 옷이 바뀌면 다시 찍는다.
 */
const cache = new Map<string, string>();

export interface PortraitDeps {
  renderer: THREE.WebGLRenderer;
  outfit(): Outfit;
  /** 아이가 고른 펫 종류 (speaker 'pet') */
  petKind(): string | null;
}

export function createPortraits(d: PortraitDeps): (speaker: string, mood: Mood | undefined) => string | null {
  return (speaker, mood = 'normal') => {
    if (speaker === 'pet') {
      const kind = d.petKind();
      if (!kind) return null;
      const key = `pet:${kind}`;
      let url = cache.get(key);
      if (!url) {
        url = snapshot(d.renderer, createPetModel(kind).group, { size: 256, yaw: 0.4, head: [0.06, 0.34] });
        cache.set(key, url);
      }
      return url;
    }
    const isPrincess = speaker === 'princess';
    if (!isPrincess && !hasFriendGlb(speaker)) return null;
    const key = `${isPrincess ? `princess:${JSON.stringify(d.outfit())}` : speaker}:${mood}`;
    let url = cache.get(key);
    if (!url) {
      const group = isPrincess ? createPrincessModel(d.outfit()).group : createFriendFromGlb(speaker);
      const face = group.userData.face as Face | null | undefined;
      if (face) {
        face.set(mood);
        face.update(10); // 볼 발그레까지 바로
      }
      url = snapshot(d.renderer, group, { size: 256, yaw: 0.3, cropFrom: 0.45, head: [0.32, 0.62] });
      // 공주 옷 사진이 너무 쌓이지 않게 (옷마다 기분 6개)
      if (cache.size > 60) cache.clear();
      cache.set(key, url);
    }
    return url;
  };
}
