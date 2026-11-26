/**
 * 소리 (M9-3, GDD 8.2): 효과음 + 배경 음악을 Web Audio 로 직접 만든다.
 * - 파일을 받지 않으므로 첫 로딩이 늘지 않고 라이선스 걱정이 없다 (나중에 CC0 음원으로 바꿔도 됨)
 * - 효과음: 반짝·퐁·방울·딩동 같은 밝은 소리만 (실패·경고 소리 없음)
 * - 배경 음악: 오르골 소리로 장소마다 다른 잔잔한 곡을 계속 지어서 연주 (같은 곡 반복이 지루하지 않게)
 * - 말하는 동안에는 음악을 작게 (대사가 잘 들리게)
 * 브라우저는 화면을 처음 톡해야 소리를 낼 수 있으므로 unlock() 을 첫 터치에 부른다.
 */
export type Sfx =
  | 'tap'
  | 'pop'
  | 'sparkle'
  | 'count'
  | 'reward'
  | 'coin'
  | 'whoosh'
  | 'happy'
  | 'nom'
  | 'bubble'
  | 'page'
  | 'dress';

export type Tune = 'castle' | 'flower-kingdom' | 'sea-kingdom' | 'room' | 'shop' | 'lullaby' | null;

/** 곡마다: 음계(으뜸음 MIDI 번호 + 장음계 단계), 빠르기, 화음 진행 */
const TUNES: Record<Exclude<Tune, null>, { root: number; bpm: number; chords: number[][]; volume: number; density: number }> = {
  castle: { root: 72, bpm: 76, chords: [[0, 2, 4], [5, 0, 2], [3, 5, 0], [4, 6, 1]], volume: 0.5, density: 0.7 },
  'flower-kingdom': { root: 77, bpm: 88, chords: [[0, 2, 4], [3, 5, 0], [4, 6, 1], [0, 2, 4]], volume: 0.5, density: 0.8 },
  // 바다: 느긋하게 출렁이는 화음 (파도처럼 IV-I 반복)
  'sea-kingdom': { root: 74, bpm: 72, chords: [[0, 2, 4], [3, 5, 0], [0, 2, 4], [5, 0, 2]], volume: 0.46, density: 0.6 },
  room: { root: 74, bpm: 70, chords: [[0, 2, 4], [5, 0, 2], [1, 3, 5], [4, 6, 1]], volume: 0.42, density: 0.6 },
  shop: { root: 79, bpm: 96, chords: [[0, 2, 4], [4, 6, 1], [5, 0, 2], [3, 5, 0]], volume: 0.45, density: 0.85 },
  lullaby: { root: 67, bpm: 54, chords: [[0, 2, 4], [3, 5, 0], [0, 2, 4], [4, 6, 1]], volume: 0.38, density: 0.45 },
};
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
/** 장음계 단계(0~) → MIDI (옥타브 넘어가면 올림) */
export function degreeToMidi(root: number, degree: number): number {
  const oct = Math.floor(degree / 7);
  return root + oct * 12 + MAJOR[((degree % 7) + 7) % 7];
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private duck: GainNode | null = null;
  sfxOn = true;
  musicOn = true;
  private tune: Tune = null;
  private nextBeat = 0;
  private beat = 0;
  private melody = 7;
  private timer: number | null = null;
  private countN = 0;

  /** 첫 터치 때: 소리 켜기 (브라우저 규칙) */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.sfxOn ? 0.55 : 0;
    this.sfxBus.connect(this.master);
    this.duck = this.ctx.createGain();
    this.duck.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(this.duck);
    this.startScheduler();
    this.setTune(this.tune, true);
  }

  setEnabled(sfx: boolean, music: boolean): void {
    this.sfxOn = sfx;
    this.musicOn = music;
    const t = this.ctx?.currentTime ?? 0;
    this.sfxBus?.gain.setTargetAtTime(sfx ? 0.55 : 0, t, 0.05);
    this.fadeMusic();
  }

  /** 대사를 읽는 동안 음악을 작게 */
  setSpeaking(on: boolean): void {
    if (!this.ctx || !this.duck) return;
    this.duck.gain.setTargetAtTime(on ? 0.35 : 1, this.ctx.currentTime, on ? 0.08 : 0.6);
  }

  /** 장소에 맞는 곡으로 (천천히 바뀜) */
  setTune(t: Tune, force = false): void {
    if (t && !(t in TUNES)) t = 'castle'; // 새 장소는 곡이 생길 때까지 성 곡
    if (t === this.tune && !force) return;
    this.tune = t;
    this.melody = 7;
    this.fadeMusic();
  }

  /** 화면을 내렸다 올릴 때 (태블릿 배터리) */
  suspend(on: boolean): void {
    if (!this.ctx) return;
    if (on) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  private fadeMusic(): void {
    if (!this.ctx || !this.musicBus) return;
    const vol = this.musicOn && this.tune ? TUNES[this.tune].volume * 0.32 : 0;
    this.musicBus.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.8);
  }

  // ── 효과음 ──

  play(name: Sfx, n = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.sfxOn) return;
    const t = ctx.currentTime + 0.01;
    switch (name) {
      case 'tap':
        this.tone(1180, t, 0.08, 0.25, 'sine', 1.6);
        break;
      case 'pop':
        this.tone(520, t, 0.12, 0.4, 'sine', 2.2);
        break;
      case 'page':
        this.tone(880, t, 0.06, 0.15, 'triangle');
        break;
      case 'sparkle':
        [0, 4, 7, 12, 16].forEach((s, i) => this.bell(84 + s, t + i * 0.055, 0.35, 0.22));
        break;
      case 'count': {
        // 셀 때마다 한 음씩 올라감 (하나·둘·셋 …)
        const k = n > 0 ? n - 1 : this.countN++ % 8;
        this.bell(degreeToMidi(79, k), t, 0.5, 0.35);
        break;
      }
      case 'coin':
        this.bell(91, t, 0.25, 0.3);
        this.bell(96, t + 0.07, 0.45, 0.3);
        break;
      case 'reward':
        [[72, 0], [76, 0.12], [79, 0.24], [84, 0.36], [88, 0.5]].forEach(([m, d]) => this.bell(m, t + d, 0.9, 0.3));
        this.bell(72, t + 0.5, 1.4, 0.2);
        this.bell(79, t + 0.5, 1.4, 0.2);
        break;
      case 'whoosh':
        this.noise(t, 0.6, 600, 2400, 0.25);
        break;
      case 'happy':
        this.tone(660, t, 0.1, 0.25, 'sine', 1.5);
        this.tone(990, t + 0.1, 0.14, 0.25, 'sine', 1.3);
        break;
      case 'nom':
        this.tone(300, t, 0.09, 0.35, 'triangle', 0.8);
        this.tone(360, t + 0.12, 0.09, 0.3, 'triangle', 0.8);
        break;
      case 'bubble':
        this.tone(400 + Math.random() * 300, t, 0.15, 0.3, 'sine', 3);
        break;
      case 'dress':
        [0, 7, 12].forEach((s, i) => this.bell(79 + s, t + i * 0.07, 0.6, 0.22));
        this.noise(t, 0.35, 3000, 8000, 0.06);
        break;
    }
  }

  /** 오르골·방울 같은 소리: 사인파 + 배음, 빠르게 울리고 천천히 사라짐 */
  private bell(midi: number, t: number, dur: number, vol: number, bus: GainNode | null = this.sfxBus): void {
    const ctx = this.ctx!;
    const f = freq(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(bus!);
    for (const [mult, amp] of [[1, 1], [2.01, 0.35], [3.98, 0.12]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mult;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  /** 짧은 소리: slide>1 이면 위로, <1 이면 아래로 미끄러짐 */
  private tone(f: number, t: number, dur: number, vol: number, type: OscillatorType = 'sine', slide = 1): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * slide, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** 바람 소리 (휙): 걸러 낸 잡음 */
  private noise(t: number, dur: number, from: number, to: number, vol: number): void {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(from, t);
    bp.frequency.exponentialRampToValueAtTime(to, t + dur * 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.sfxBus!);
    src.start(t);
    src.stop(t + dur);
  }

  // ── 배경 음악 (오르골) ──

  private startScheduler(): void {
    // 0.1초마다 앞으로 0.5초 안의 음을 미리 예약 (화면이 버벅여도 박자가 흔들리지 않게)
    this.nextBeat = this.ctx!.currentTime + 0.3;
    this.timer = window.setInterval(() => this.schedule(), 100);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.tune || !this.musicOn || ctx.state !== 'running') {
      if (ctx) this.nextBeat = Math.max(this.nextBeat, ctx.currentTime + 0.1);
      return;
    }
    const song = TUNES[this.tune];
    const step = 60 / song.bpm / 2; // 8분음표
    while (this.nextBeat < ctx.currentTime + 0.5) {
      const notes = musicStep(song, this.beat, this.melody, Math.random);
      this.melody = notes.melody;
      for (const m of notes.play) this.bell(m.midi, this.nextBeat, m.dur * step * 2.2, m.vol, this.musicBus);
      this.nextBeat += step;
      this.beat++;
    }
  }

  dispose(): void {
    if (this.timer !== null) clearInterval(this.timer);
    void this.ctx?.close();
  }
}

/**
 * 오르골 곡 한 박(8분음표) 짓기 — 순수 함수 (테스트용으로 밖에 둠).
 * 한 마디 = 8박, 마디마다 화음 하나. 낮은 음은 마디 처음에 화음 바탕음,
 * 멜로디는 장음계 위를 한두 칸씩 걸어 다니고 강박에서는 화음 음으로 내려앉는다.
 */
export function musicStep(
  song: { root: number; chords: number[][]; density: number },
  beat: number,
  melody: number,
  rng: () => number,
): { melody: number; play: Array<{ midi: number; dur: number; vol: number }> } {
  const bar = Math.floor(beat / 8) % song.chords.length;
  const pos = beat % 8;
  const chord = song.chords[bar];
  const play: Array<{ midi: number; dur: number; vol: number }> = [];
  if (pos === 0) play.push({ midi: degreeToMidi(song.root - 24, chord[0]), dur: 4, vol: 0.5 });
  if (pos === 4) play.push({ midi: degreeToMidi(song.root - 12, chord[2]), dur: 2, vol: 0.3 });
  const strong = pos % 2 === 0;
  if (strong || rng() < song.density * 0.5) {
    let next = melody + [-2, -1, -1, 0, 1, 1, 2][Math.floor(rng() * 7)];
    if (pos === 0 || pos === 4) {
      // 강박: 가까운 화음 음으로
      const options = [-7, 0, 7, 14].flatMap((o) => chord.map((c) => c + o)).filter((m) => m >= 2 && m <= 12);
      next = options.reduce((a, b) => (Math.abs(b - next) < Math.abs(a - next) ? b : a));
    } else {
      next = Math.max(2, Math.min(12, next));
    }
    if (rng() < song.density || pos === 0) play.push({ midi: degreeToMidi(song.root, next), dur: strong ? 2 : 1, vol: strong ? 0.42 : 0.3 });
    melody = next;
  }
  return { melody, play };
}

/** 게임 전체에서 쓰는 소리 하나 */
export const sound = new Sound();
export const sfx = (name: Sfx, n?: number) => sound.play(name, n);
