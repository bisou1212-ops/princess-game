import { describe, it, expect } from 'vitest';
import { PET_IDS, PET_KINDS, Pet, petVars, snackCount } from './pet';
import { GameState } from './game-state';
import { fillLines } from './random-quests';
import { getDialogue } from './dialogue';

const HOUR = 3600_000;

describe('펫', () => {
  it('세 마리: 이름 카드 3개·간식이 있다', () => {
    expect(PET_IDS).toEqual(['unicorn', 'cat', 'puppy']);
    for (const id of PET_IDS) {
      const k = PET_KINDS[id];
      expect(k.names).toHaveLength(3);
      expect(k.food.name && k.food.en && k.food.icon).toBeTruthy();
    }
  });

  it('처음 데려오면 배고프고, 밥을 주면 별사탕 + 몇 시간 동안 배부름', () => {
    const t0 = 1_000_000_000_000;
    const pet = new Pet('cat', '나비', 0, t0);
    expect(pet.need(t0)).toBe('hungry');
    expect(pet.feed(t0)).toBe(1);
    expect(pet.need(t0)).toBe(null);
    // 배부른데 또 주면 별사탕은 없음 (그래도 혼나지 않음)
    expect(pet.feed(t0 + HOUR)).toBe(0);
    expect(pet.hungry(t0 + 4 * HOUR + 1)).toBe(true);
  });

  it('시간이 지나면 꼬질꼬질 → 목욕하면 깨끗 (밥이 먼저)', () => {
    const t0 = 1_000_000_000_000;
    const pet = new Pet('puppy', '콩이', t0, t0);
    const later = t0 + 7 * HOUR;
    expect(pet.need(later)).toBe('hungry');
    pet.feed(later);
    expect(pet.need(later)).toBe('dirty');
    expect(pet.bathe(later)).toBe(1);
    expect(pet.need(later)).toBe(null);
  });

  it('간식 개수는 2~5 (수 세기)', () => {
    expect(snackCount(() => 0)).toBe(2);
    expect(snackCount(() => 0.999)).toBe(5);
  });

  it('대사 빈칸: 이름·간식·개수', () => {
    const pet = new Pet('unicorn', '별님');
    const lines = fillLines(getDialogue('pet-hungry'), petVars(pet, 3), (c) => c);
    expect(lines[1].text).toBe('사과 세 개 주세요!');
    expect(fillLines(getDialogue('pet-adopted'), petVars(pet), (c) => c)[0].text).toContain('나는 별님이야!');
    expect(fillLines(getDialogue('pet-fed'), petVars(pet, 3), (c) => c)[0].text).toContain('하나, 둘, 셋');
  });

  it('저장·불러오기 (모르는 펫·깨진 값은 다시 고르기)', () => {
    const s = new GameState();
    s.pet = new Pet('cat', '모모', 123, 456);
    const saved = s.toSave();
    const t = new GameState();
    t.applySave(JSON.parse(JSON.stringify(saved)));
    expect(t.pet?.toJSON()).toEqual({ kind: 'cat', name: '모모', fedAt: 123, bathedAt: 456 });
    expect(Pet.load({ kind: 'dragon', name: 'x' })).toBeNull();
    expect(Pet.load(null)).toBeNull();
    expect(Pet.load({ kind: 'puppy' })?.name).toBe('콩이');
    // 펫이 없던 옛 저장도 그대로 열린다
    const old = { ...saved } as Record<string, unknown>;
    delete old.pet;
    const u = new GameState();
    expect(u.applySave(old)).toBe(true);
    expect(u.pet).toBeNull();
  });
});
