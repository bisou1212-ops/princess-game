/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { allItems } from '../../systems/items';

/** .glb 안의 JSON 부분만 읽기 (three 없이) */
function readGlbJson(path: string): { nodes?: Array<{ name?: string; mesh?: number }>; materials?: Array<{ name?: string }> } {
  const buf = readFileSync(path);
  expect(buf.toString('ascii', 0, 4)).toBe('glTF');
  const jsonLen = buf.readUInt32LE(12);
  expect(buf.toString('ascii', 16, 20)).toBe('JSON');
  return JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
}

describe('Blender 공주 모델 (princess.glb)', () => {
  const gltf = readGlbJson(fileURLToPath(new URL('../../assets/models/princess.glb', import.meta.url)));
  const names = new Set((gltf.nodes ?? []).map((n) => n.name));
  const outfitIds = Object.entries(allItems())
    .filter(([, it]) => it.kind === 'outfit')
    .map(([id]) => id);

  it('몸(base)과 모든 옷 부위가 들어 있다 (이름 = items.json id)', () => {
    expect(names.has('base')).toBe(true);
    for (const id of outfitIds) expect(names.has(id), id).toBe(true);
  });

  it('색 바뀌는 재질 이름 약속을 지킨다', () => {
    const mats = new Set((gltf.materials ?? []).map((m) => m.name));
    for (const m of ['tint', 'tint_light', 'tint_wing', 'skin', 'eye']) expect(mats.has(m), m).toBe(true);
  });
});

describe('Blender 친구 모델 (friend-<id>.glb)', () => {
  const read = (id: string) => {
    try {
      return readGlbJson(fileURLToPath(new URL(`../../assets/models/friend-${id}.glb`, import.meta.url)));
    } catch {
      return null;
    }
  };

  it('마당·꽃 왕국에 서 있는 친구마다 뼈대·동작이 든 모델이 있다 (뼈대 이름 = characters.json id)', async () => {
    const { courtyardLayout } = await import('./courtyard-layout');
    const { loadLocationLayout, LOCATIONS, hasLayout } = await import('../../systems/world');
    const ids = new Set(courtyardLayout.npcs.map((n) => n.character));
    for (const l of LOCATIONS.filter((x) => hasLayout(x.id))) {
      for (const n of (await loadLocationLayout(l.id)).npcs) ids.add(n.character);
    }
    for (const id of ids) {
      const gltf = read(id) as (ReturnType<typeof readGlbJson> & { animations?: Array<{ name: string }>; skins?: unknown[] }) | null;
      expect(gltf, id).not.toBeNull();
      expect(gltf!.nodes?.some((n) => n.name === id), id).toBe(true);
      expect(gltf!.skins?.length, id).toBe(1);
      expect((gltf!.animations ?? []).map((a) => a.name).sort(), id).toEqual(['hop', 'idle', 'walk', 'wave']);
    }
  });
});

describe('Blender 펫 모델 (pet-<id>.glb)', () => {
  it('펫마다 뼈대(이름 = pets.json id)와 코드로 움직일 뼈가 있다', async () => {
    const { PET_IDS } = await import('../../systems/pet');
    const need = ['root', 'body', 'head', 'tail', 'ear.L', 'ear.R', 'leg.FL', 'leg.FR', 'leg.BL', 'leg.BR'];
    for (const id of PET_IDS) {
      const gltf = readGlbJson(fileURLToPath(new URL(`../../assets/models/pet-${id}.glb`, import.meta.url))) as ReturnType<typeof readGlbJson> & { skins?: unknown[] };
      const names = new Set((gltf.nodes ?? []).map((n) => n.name));
      expect(names.has(id), id).toBe(true);
      expect(gltf.skins?.length, id).toBe(1);
      for (const b of need) expect(names.has(b), `${id}: ${b}`).toBe(true);
    }
  });
});
