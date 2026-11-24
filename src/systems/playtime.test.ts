import { describe, it, expect } from 'vitest';
import { PlayTimer, WARN_BEFORE } from './playtime';

/** sec 초 동안 1초씩 흘려 보내며 일어난 일 */
function run(t: PlayTimer, sec: number, active = true) {
  const events: Array<[number, string]> = [];
  for (let i = 0; i < sec; i++) {
    const e = t.tick(1, active);
    if (e) events.push([Math.round(t.used), e]);
  }
  return events;
}

describe('플레이 시간', () => {
  it('정하지 않으면 아무 일 없음', () => {
    expect(run(new PlayTimer(0), 3600)).toEqual([]);
  });

  it('10분: 8분에 예고, 10분에 잠자리 (한 번씩만)', () => {
    const t = new PlayTimer(10);
    expect(run(t, 900)).toEqual([
      [600 - WARN_BEFORE, 'warn'],
      [600, 'bedtime'],
    ]);
    expect(t.asleep).toBe(true);
  });

  it('화면이 꺼져 있는 동안은 세지 않는다', () => {
    const t = new PlayTimer(10);
    run(t, 2000, false);
    expect(t.used).toBe(0);
  });

  it('놀던 중에 시간을 줄여도 예고 뒤 1분은 더 논다', () => {
    const t = new PlayTimer(30);
    run(t, 20 * 60);
    t.setLimit(10); // 이미 20분 놀았음
    const ev = run(t, 200);
    expect(ev[0]).toEqual([20 * 60 + 1, 'warn']);
    expect(ev[1]).toEqual([20 * 60 + 61, 'bedtime']);
  });

  it('어른이 "10분 더": 다시 놀다가 예고·잠자리', () => {
    const t = new PlayTimer(10);
    run(t, 700);
    t.extend(10);
    expect(t.asleep).toBe(false);
    const ev = run(t, 700);
    expect(ev.map((e) => e[1])).toEqual(['warn', 'bedtime']);
  });
});
