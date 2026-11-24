import { describe, it, expect } from 'vitest';
import { pickVoiceFrom } from './tts';
import { PerfGovernor, PERF_MAX, perfSettings } from './quality';
import { attachGestures } from './gestures';

const v = (name: string, lang: string, localService = true) => ({ name, lang, localService });
const EDGE = [
  v('Microsoft Heami - Korean (Korean)', 'ko-KR'),
  v('Microsoft SunHi Online (Natural) - Korean (Korea)', 'ko-KR', false),
  v('Microsoft InJoon Online (Natural) - Korean (Korea)', 'ko-KR', false),
  v('Microsoft Ana Online (Natural) - English (United States)', 'en-US', false),
  v('Microsoft David - English (United States)', 'en-US'),
];

describe('음성 고르기 (태블릿에서 한국어가 영어 음성으로 읽히던 문제)', () => {
  it('정확히 같은 언어를 먼저, 그 안에서 설치된 음성', () => {
    const list = [v('en', 'en-US'), v('ko-net', 'ko-KR', false), v('ko-local', 'ko-KR')];
    expect(pickVoiceFrom(list, 'ko-KR')?.name).toBe('ko-local');
  });
  it('안드로이드식 이름(ko_KR)·말만 같은 것(ko)도 찾는다', () => {
    expect(pickVoiceFrom([v('en', 'en-US'), v('k', 'ko_KR')], 'ko-KR')?.name).toBe('k');
    expect(pickVoiceFrom([v('en', 'en-GB'), v('k', 'ko')], 'ko-KR')?.name).toBe('k');
  });
  it('사람 같은 자연스러운 음성을 먼저, 고고는 남자 목소리', () => {
    expect(pickVoiceFrom(EDGE, 'ko-KR')?.name).toContain('SunHi');
    expect(pickVoiceFrom(EDGE, 'ko-KR', 'male')?.name).toContain('InJoon');
    expect(pickVoiceFrom(EDGE, 'en-US')?.name).toContain('Ana');
    // 남자 음성이 없으면 있는 것 중에서
    expect(pickVoiceFrom([v('Microsoft Heami - Korean', 'ko-KR')], 'ko-KR', 'male')?.name).toContain('Heami');
  });
  it('한국어 음성이 없으면 영어 음성을 고르지 않는다', () => {
    expect(pickVoiceFrom([v('en', 'en-US')], 'ko-KR')).toBeUndefined();
  });
});

describe('느린 기기 자동 조절', () => {
  it('fps 가 낮으면 한 단계씩 내리고, 빠르면 그대로', () => {
    const applied: number[] = [];
    const g = new PerfGovernor((l) => applied.push(l), 0, 40, 1);
    for (let i = 0; i < 120; i++) g.tick(1 / 60); // 기다림 3초 + 빠름
    expect(g.level).toBe(0);
    for (let i = 0; i < 200; i++) g.tick(1 / 20); // 느림
    expect(g.level).toBeGreaterThan(0);
    expect(applied[0]).toBe(1);
    for (let i = 0; i < 2000; i++) g.tick(1 / 10);
    expect(g.level).toBe(PERF_MAX);
  });
  it('탭을 내렸다 올린 큰 틈·장면 바꾸는 중은 재지 않는다', () => {
    const g = new PerfGovernor(() => {}, 0, 40, 1);
    for (let i = 0; i < 400; i++) g.tick(1 / 10, true);
    g.tick(5);
    expect(g.level).toBe(0);
  });
  it('단계마다 해상도·빛번짐', () => {
    expect(perfSettings(1).bloom).toBe(false);
    expect(perfSettings(4).maxPixelRatio).toBeLessThanOrEqual(1);
  });
});

describe('톡 (아이 손가락)', () => {
  const fake = () => {
    const handlers: Record<string, (e: unknown) => void> = {};
    return { el: { addEventListener: (n: string, f: (e: unknown) => void) => (handlers[n] = f), removeEventListener() {} } as unknown as HTMLElement, fire: (n: string, e: object) => handlers[n]({ pointerId: 1, pointerType: 'touch', button: 0, ...e }) };
  };
  it('조금 미끄러지거나 1초 가까이 눌러도 톡 (누른 자리로)', async () => {
    const { el, fire } = fake();
    const taps: number[][] = [];
    attachGestures(el, { onTap: (x, y) => taps.push([x, y]), onDragStart: () => false });
    fire('pointerdown', { clientX: 100, clientY: 100 });
    fire('pointermove', { clientX: 115, clientY: 110 });
    await new Promise((r) => setTimeout(r, 700));
    fire('pointerup', { clientX: 118, clientY: 112 });
    expect(taps).toEqual([[100, 100]]);
  });
  it('끌기가 시작되면 톡이 아니다', () => {
    const { el, fire } = fake();
    const taps: number[][] = [];
    attachGestures(el, { onTap: (x, y) => taps.push([x, y]), onDragStart: () => true });
    fire('pointerdown', { clientX: 100, clientY: 100 });
    fire('pointermove', { clientX: 120, clientY: 100 });
    fire('pointerup', { clientX: 120, clientY: 100 });
    expect(taps).toEqual([]);
  });
});
