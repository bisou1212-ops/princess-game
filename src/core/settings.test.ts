import { describe, it, expect } from 'vitest';
import { loadSettings, lockQuestion, qualityChoice, saveSettings, setQualityChoice } from './settings';
import { PERF_KEY } from './quality';
import { GameState, SAVE_KEY } from '../systems/game-state';
import { MemoryStore } from './storage';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

describe('부모 설정', () => {
  it('말 빠르기 저장·불러오기 (깨진 값은 보통)', () => {
    const s = mem();
    expect(loadSettings(s).speech).toBe('normal');
    saveSettings({ speech: 'slow', playMinutes: 15, sfx: false, music: true }, s);
    expect(loadSettings(s).sfx).toBe(false);
    expect(loadSettings(s).playMinutes).toBe(15);
    expect(loadSettings(s).speech).toBe('slow');
    s.setItem('settings', '{oops');
    expect(loadSettings(s).speech).toBe('normal');
  });

  it('그래픽 품질을 바꾸면 자동 조절 단계도 다시 잰다', () => {
    const s = mem();
    s.setItem(PERF_KEY, '3');
    setQualityChoice('basic', s);
    expect(qualityChoice(s)).toBe('basic');
    expect(s.getItem(PERF_KEY)).toBeNull();
    setQualityChoice('auto', s);
    expect(qualityChoice(s)).toBe('auto');
  });

  it('잠금 문제는 6~9단 곱셈', () => {
    expect(lockQuestion(() => 0)).toEqual({ a: 6, b: 6, answer: 36 });
    expect(lockQuestion(() => 0.99)).toEqual({ a: 9, b: 9, answer: 81 });
  });

  it('저장 초기화: 지운 뒤에는 다시 저장되지 않는다', async () => {
    const store = new MemoryStore();
    const g = new GameState(store);
    g.wallet.candy = 5;
    await g.saveNow();
    expect(await store.get(SAVE_KEY)).toBeDefined();
    await g.reset();
    expect(await store.get(SAVE_KEY)).toBeUndefined();
    g.change();
    await g.saveNow(); // 앱을 내릴 때 저장해도
    expect(await store.get(SAVE_KEY)).toBeUndefined();
  });
});
