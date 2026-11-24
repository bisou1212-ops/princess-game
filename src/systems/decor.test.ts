import { describe, it, expect } from 'vitest';
import { ROOMS, RoomLayout, STARTER_FURNITURE, footprint, getFurniture, ownedFurniture, praiseFor } from './decor';
import { GameState } from './game-state';
import { MemoryStore } from '../core/storage';
import { PALETTE } from './wardrobe';

const room = () => new RoomLayout(ROOMS.bedroom); // 6m × 6m, 0.5m 칸 → 12 × 12

describe('가구 놓기', () => {
  it('방 안 빈자리에만 놓인다', () => {
    const r = room();
    expect(r.cols).toBe(12);
    expect(r.place('bed', 0, 0)).not.toBeNull(); // 3×4칸
    expect(r.canPlace('table', 1, 1, 0)).toBe(false); // 침대와 겹침
    expect(r.canPlace('table', 3, 0, 0)).toBe(true); // 바로 옆
    expect(r.canPlace('table', 11, 0, 0)).toBe(false); // 벽 밖으로 삐져나감
    expect(r.canPlace('table', -1, 0, 0)).toBe(false);
  });

  it('러그 위에는 가구를 놓을 수 있지만 러그끼리는 안 겹친다', () => {
    const r = new RoomLayout(ROOMS.bedroom, { rug: 2, table: 1 });
    expect(r.place('rug', 4, 4)).not.toBeNull();
    expect(r.place('table', 5, 5)).not.toBeNull();
    expect(r.canPlace('rug', 5, 5, 0)).toBe(false);
  });

  it('가진 개수만큼만 꺼낼 수 있고, 치우면 서랍으로 돌아온다', () => {
    expect(room().available('chair')).toBe(STARTER_FURNITURE.chair);
    const r = new RoomLayout(ROOMS.bedroom, { chair: 2 });
    const a = r.place('chair', 0, 0)!;
    r.place('chair', 2, 0);
    expect(r.available('chair')).toBe(0);
    expect(r.place('chair', 4, 0)).toBeNull();
    r.remove(a.uid);
    expect(r.available('chair')).toBe(1);
    expect(r.drawer().find((d) => d.item === 'chair')?.left).toBe(1);
  });

  it('손가락 위치에 가구 가운데가 오도록 칸을 맞춘다', () => {
    const r = room();
    // 방 가운데(0,0)에 2×2 탁자 → 칸 (5,5)부터
    expect(r.snap('table', 0, 0, 0)).toEqual({ c: 5, r: 5 });
    expect(r.centerOf('table', 5, 5, 0)).toEqual({ x: 0, z: 0 });
  });

  it('옮기기: 빈자리로만', () => {
    const r = room();
    const bed = r.place('bed', 0, 0)!;
    const box = r.place('toybox', 6, 0)!;
    expect(r.move(box.uid, 1, 1)).toBe(false);
    expect(r.move(box.uid, 6, 6)).toBe(true);
    expect(r.get(box.uid)).toMatchObject({ c: 6, r: 6 });
    expect(r.move(bed.uid, 0, 1)).toBe(true); // 자기 자신과는 안 겹친다
  });

  it('돌리면 가로·세로가 바뀌고, 벽에 걸리면 살짝 밀어서 돌린다', () => {
    const r = room();
    const shelf = r.place('bookshelf', 5, 0)!; // 2×1
    expect(r.rotate(shelf.uid)).toBe(true);
    const p = r.get(shelf.uid)!;
    expect(p.rot).toBe(1);
    expect(footprint(getFurniture('bookshelf')!, p.rot)).toEqual({ w: 1, d: 2 });
    expect(p.r).toBeGreaterThanOrEqual(0); // 벽 밖으로 안 나감
    expect(r.canPlace('bookshelf', p.c, p.r, p.rot, p.uid)).toBe(true);
  });

  it('꽉 막혀서 못 돌리면 그대로 둔다', () => {
    const r = new RoomLayout({ ...ROOMS.bedroom, width: 1.5, depth: 0.5 }, { closet: 1 }); // 3×1칸 방
    const c = r.place('closet', 0, 0)!;
    expect(r.rotate(c.uid)).toBe(false);
    expect(r.get(c.uid)).toMatchObject({ c: 0, r: 0, rot: 0 });
  });

  it('색은 팔레트 색만', () => {
    const r = room();
    const t = r.place('table', 0, 0)!;
    expect(t.color).toBe('brown');
    expect(r.recolor(t.uid, 'pink')).toBe(true);
    expect(r.recolor(t.uid, 'gold')).toBe(false);
    expect(r.get(t.uid)!.color).toBe('pink');
  });
});

describe('가구 데이터', () => {
  it('처음 가구가 모두 올바른 가구이고, 방보다 작다', () => {
    for (const [id, n] of Object.entries(STARTER_FURNITURE)) {
      const f = getFurniture(id);
      expect(f, id).not.toBeNull();
      expect(n).toBeGreaterThan(0);
      expect(PALETTE.some((c) => c.id === f!.defaultColor), id).toBe(true);
      for (const def of Object.values(ROOMS)) {
        expect(f!.w * def.cellSize).toBeLessThanOrEqual(def.width);
        expect(f!.d * def.cellSize).toBeLessThanOrEqual(def.depth);
      }
    }
  });

  it('선물로 받은 가구는 하나씩 늘어난다', () => {
    expect(ownedFurniture(['bed', 'dress-flower']).bed).toBe(STARTER_FURNITURE.bed + 1);
  });
});

describe('방 저장·불러오기', () => {
  it('놓은 가구·회전·색이 그대로 돌아온다', async () => {
    const store = new MemoryStore();
    const a = new GameState(store);
    const bed = a.rooms.bedroom.place('bed', 0, 0)!;
    a.rooms.bedroom.recolor(bed.uid, 'blue');
    const lamp = a.rooms.bedroom.place('lamp', 10, 10)!;
    a.rooms.bedroom.rotate(lamp.uid);
    await a.saveNow();

    const b = new GameState(store);
    await b.load();
    expect(b.rooms.bedroom.toJSON()).toEqual(a.rooms.bedroom.toJSON());
  });

  it('깨진·겹친·안 가진 가구는 빼고 불러온다', () => {
    const r = room();
    r.load([
      { uid: 'a', item: 'bed', c: 0, r: 0, rot: 0, color: 'pink' },
      { uid: 'b', item: 'table', c: 1, r: 1, rot: 0, color: 'pink' }, // 침대와 겹침
      { uid: 'c', item: 'bed', c: 6, r: 6, rot: 0, color: 'pink' }, // 침대는 1개뿐
      { uid: 'd', item: 'unicorn', c: 8, r: 0, rot: 0, color: 'pink' },
      { uid: 'e', item: 'lamp', c: 20, r: 0, rot: 0, color: 'pink' }, // 방 밖
      { uid: 'f', item: 'chair', c: 8, r: 8, rot: 0, color: '???' },
      'garbage',
    ]);
    expect(r.items.map((p) => p.uid)).toEqual(['a', 'f']);
    expect(r.get('f')!.color).toBe('yellow');
  });
});

describe('여러 방 (M8-3)', () => {
  it('방은 침실·드레스룸·파티홀 3개', () => {
    expect(Object.keys(ROOMS)).toEqual(['bedroom', 'dressroom', 'partyhall']);
    for (const def of Object.values(ROOMS)) {
      expect(def.wall).toMatch(/^#[0-9a-f]{6}$/i);
      expect(def.curtain).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('가구 서랍은 모든 방이 함께 쓴다', () => {
    const s = new GameState();
    const bed = s.rooms.bedroom;
    const dress = s.rooms.dressroom;
    expect(bed.place('bed', 0, 0)).not.toBeNull();
    expect(dress.available('bed')).toBe(0);
    expect(dress.place('bed', 0, 0)).toBeNull();
    bed.remove(bed.items[0].uid);
    expect(dress.available('bed')).toBe(1);
  });

  it('벽지·바닥·커튼 색을 바꾸고 저장·불러오기 된다', async () => {
    const store = new MemoryStore();
    const a = new GameState(store);
    const room = a.rooms.partyhall;
    expect(room.surfaceHex('wall')).toBe(ROOMS.partyhall.wall);
    expect(room.setSurface('wall', 'blue')).toBe(true);
    expect(room.setSurface('wall', 'nope')).toBe(false);
    expect(room.surfaceHex('wall')).not.toBe(ROOMS.partyhall.wall);
    a.rooms.bedroom.place('bed', 0, 0);
    await a.saveNow();
    const b = new GameState(store);
    await b.load();
    expect(b.rooms.partyhall.style.wall).toBe('blue');
    expect(b.rooms.bedroom.items).toHaveLength(1);
  });

  it('친구 칭찬은 가구가 많을수록 커진다', () => {
    expect(praiseFor(0)).toBe('invite-empty');
    expect(praiseFor(4)).toBe('invite-some');
    expect(praiseFor(9)).toBe('invite-lots');
  });

  it('친구는 가구와 안 겹치는 자리에 선다', () => {
    const r = new RoomLayout(ROOMS.bedroom, { toybox: 1 });
    const free = r.guestSpot();
    // 친구 자리 바로 그 칸에 장난감 상자를 놓으면 다른 자리로
    const c = Math.round((free.x + 3) / 0.5 - 1);
    const row = Math.round((free.z + 3) / 0.5 - 1);
    expect(r.place('toybox', c, row)).not.toBeNull();
    const moved = r.guestSpot();
    expect(moved).not.toEqual(free);
  });
});
