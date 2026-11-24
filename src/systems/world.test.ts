import { describe, it, expect } from 'vitest';
import { LOCATIONS, START_LOCATION, canTravelTo, getLocation, loadLocationLayout } from './world';
import { buildNavGrid } from '../scenes/castle/courtyard-layout';
import { allCharacters, allDialogues } from './dialogue';
import { allQuestDefs } from './quests';
import { ROOMS } from './decor';

describe('왕국 지도 (world.json)', () => {
  it('처음 장소가 있고 갈 수 있다', () => {
    expect(getLocation(START_LOCATION)).toBeDefined();
    expect(canTravelTo(START_LOCATION)).toBe(true);
  });

  it('MVP: 성과 꽃 왕국만 열려 있고, 나머지는 잠자는 왕국', () => {
    const open = LOCATIONS.filter((l) => l.open).map((l) => l.id);
    expect(open).toEqual(['castle', 'flower-kingdom']);
    expect(canTravelTo('sea-kingdom')).toBe(false);
  });

  it('지도 위 위치는 화면 안(%)이고 id가 겹치지 않는다', () => {
    const ids = new Set<string>();
    for (const l of LOCATIONS) {
      expect(ids.has(l.id)).toBe(false);
      ids.add(l.id);
      expect(l.x).toBeGreaterThanOrEqual(5);
      expect(l.x).toBeLessThanOrEqual(95);
      expect(l.y).toBeGreaterThanOrEqual(5);
      expect(l.y).toBeLessThanOrEqual(95);
    }
  });

  it('부탁이 나타나는 장소는 지도에 있다', () => {
    for (const [id, q] of Object.entries(allQuestDefs())) expect(getLocation(q.location), id).toBeDefined();
  });
});

describe('열린 장소의 배치 데이터', () => {
  const openIds = LOCATIONS.filter((l) => canTravelTo(l.id)).map((l) => l.id);

  it.each(openIds)('%s: id가 맞고, 시작 위치에서 모든 빈 칸에 갈 수 있다', async (id) => {
    const layout = await loadLocationLayout(id);
    expect(layout.id).toBe(id);
    const grid = buildNavGrid(layout);
    expect(grid.isWalkableAt(layout.start.x, layout.start.z)).toBe(true);
    const [sc, sr] = grid.worldToCell(layout.start.x, layout.start.z);
    const seen = new Set([sr * grid.cols + sc]);
    const queue: Array<[number, number]> = [[sc, sr]];
    while (queue.length) {
      const [c, r] = queue.pop()!;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = (r + dr) * grid.cols + (c + dc);
        if (grid.isWalkable(c + dc, r + dr) && !seen.has(k)) {
          seen.add(k);
          queue.push([c + dc, r + dr]);
        }
      }
    }
    let walkable = 0;
    for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) if (grid.isWalkable(c, r)) walkable++;
    expect(seen.size).toBe(walkable);
  });

  it.each(openIds)('%s: 친구·대사·문이 가리키는 데이터가 있다', async (id) => {
    const layout = await loadLocationLayout(id);
    const chars = allCharacters();
    const dialogues = allDialogues();
    const quests = allQuestDefs();
    for (const n of layout.npcs) {
      expect(chars[n.character], n.id).toBeDefined();
      if (n.dialogue) expect(dialogues[n.dialogue], n.id).toBeDefined();
      if (n.quest) expect(quests[n.quest]?.location, n.id).toBe(id);
    }
    // 문은 성 안 방 또는 별사탕 가게로 이어진다
    for (const d of layout.doors) expect(d.target === 'shop' || ROOMS[d.target] !== undefined, d.id).toBe(true);
    for (const key of ['sky', 'ground', 'yard', 'structure', 'prop'] as const) expect(layout.theme[key]).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
