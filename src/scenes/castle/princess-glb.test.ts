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
