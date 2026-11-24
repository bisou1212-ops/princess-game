import { describe, it, expect } from 'vitest';
import { degreeToMidi, musicStep } from './sound';

describe('오르골 배경 음악', () => {
  it('장음계 단계 → 음 높이 (옥타브 넘김)', () => {
    expect(degreeToMidi(60, 0)).toBe(60);
    expect(degreeToMidi(60, 2)).toBe(64);
    expect(degreeToMidi(60, 7)).toBe(72);
    expect(degreeToMidi(60, -1)).toBe(59);
  });

  it('마디 첫 박엔 화음 바탕음 + 멜로디는 화음 음, 음역을 벗어나지 않는다', () => {
    const song = { root: 72, chords: [[0, 2, 4], [3, 5, 0]], density: 0.8 };
    let melody = 7;
    let rnd = 0.37;
    const rng = () => (rnd = (rnd * 9301 + 49297) % 233280 / 233280);
    for (let beat = 0; beat < 64; beat++) {
      const r = musicStep(song, beat, melody, rng);
      melody = r.melody;
      expect(melody).toBeGreaterThanOrEqual(2);
      expect(melody).toBeLessThanOrEqual(12);
      if (beat % 8 === 0) {
        const chord = song.chords[Math.floor(beat / 8) % 2];
        expect(r.play[0].midi).toBe(degreeToMidi(48, chord[0]));
        expect(chord.map((c) => ((c % 7) + 7) % 7)).toContain(((melody % 7) + 7) % 7);
      }
    }
  });
});
