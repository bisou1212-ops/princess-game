import {
  estimateWordTimes,
  pauseAfter,
  prosodyFor,
  splitSentences,
  tokenize,
  wordIndexAt,
  type Mood,
  type Segment,
  type WordToken,
} from '../systems/dialogue';

/**
 * 기기 내장 음성(Web Speech API)으로 읽어 주고, 지금 읽는 어절 번호를 알려 준다 (GDD 8.2).
 * - 대사를 문장(추임새) 단위로 나눠 한 덩어리씩 읽고 사이에 잠깐 쉰다 → 끊어 읽기가 자연스러움
 * - 문장 끝 부호(! ? ~)와 기분(mood)에 따라 높낮이·속도를 조금씩 바꿔 억양을 살린다
 * - 단어 위치(boundary) 이벤트를 주는 기기는 그것으로, 안 주는 기기는 추정 시간표로 강조한다
 * - 음성이 아예 없거나 막혀도 글자 강조는 똑같이 진행된다
 */
export interface SpeakOptions {
  lang: string;
  pitch: number;
  rate: number;
  mood?: Mood;
  /** 지금 읽는 어절 번호 (대사 전체 기준) */
  onWord?(index: number): void;
  onEnd?(): void;
}

export class Speaker {
  private readonly synth: SpeechSynthesis | null =
    typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  private voices: SpeechSynthesisVoice[] = [];
  private timers: number[] = [];
  private token = 0;
  /** 말 빠르기 (부모 설정): 모든 대사의 속도에 곱한다 */
  rateScale = 1;

  constructor() {
    if (!this.synth) return;
    const load = () => (this.voices = this.synth!.getVoices());
    load();
    this.synth.addEventListener?.('voiceschanged', load);
  }

  get supported(): boolean {
    return this.synth !== null;
  }

  /**
   * iOS·일부 브라우저는 사용자가 화면을 처음 누른 순간에만 음성을 허용한다.
   * 첫 터치 때 빈 문장을 한 번 읽어 잠금을 풀어 둔다.
   */
  installUnlock(target: EventTarget): void {
    if (!this.synth) return;
    const unlock = () => {
      this.refreshVoices();
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      this.synth!.speak(u);
      target.removeEventListener('pointerdown', unlock);
    };
    target.addEventListener('pointerdown', unlock);
  }

  stop(): void {
    this.token++;
    this.clearTimers();
    this.synth?.cancel();
  }

  speak(text: string, opts: SpeakOptions): void {
    this.stop();
    if (this.rateScale !== 1) opts = { ...opts, rate: opts.rate * this.rateScale };
    const my = this.token;
    const alive = () => my === this.token;
    const tokens = tokenize(text);
    const segments = splitSentences(text);
    const voice = this.synth ? this.pickVoice(opts.lang) : undefined;

    opts.onWord?.(0);

    let i = 0;
    const next = () => {
      if (!alive()) return;
      if (i >= segments.length) {
        opts.onEnd?.();
        return;
      }
      const seg = segments[i++];
      const prosody = prosodyFor(seg.text, opts, opts.mood);
      this.speakSegment(seg, tokens, { ...opts, ...prosody }, voice, alive, () => {
        if (alive()) this.timers.push(window.setTimeout(next, pauseAfter(seg.text) * 1000));
      });
    };
    next();
  }

  /** 문장 하나를 읽는다. 끝나면(또는 실패해도) done 호출 */
  private speakSegment(
    seg: Segment,
    allTokens: WordToken[],
    opts: SpeakOptions,
    voice: SpeechSynthesisVoice | undefined,
    alive: () => boolean,
    done: () => void,
  ): void {
    // 이 문장에 속한 어절들 (대사 전체 기준 번호 유지)
    const first = allTokens.findIndex((t) => t.start >= seg.start);
    const segTokens = allTokens.filter((t) => t.start >= seg.start && t.start < seg.end);
    const { starts, total } = estimateWordTimes(segTokens, opts.rate);

    let usingBoundary = false;
    let estimateStarted = false;
    let finished = false;
    const segTimers: number[] = [];
    const push = (id: number) => {
      segTimers.push(id);
      this.timers.push(id);
    };
    const clearSeg = () => segTimers.forEach((t) => clearTimeout(t));

    const finish = () => {
      if (finished || !alive()) return;
      finished = true;
      clearSeg();
      done();
    };
    const startEstimate = (withEnd: boolean) => {
      if (estimateStarted || usingBoundary || !alive()) return;
      estimateStarted = true;
      starts.forEach((s, k) => push(window.setTimeout(() => alive() && !usingBoundary && opts.onWord?.(first + k), s * 1000)));
      if (withEnd) push(window.setTimeout(finish, total * 1000 + 150));
    };

    if (first >= 0) opts.onWord?.(first);

    if (!this.synth) {
      startEstimate(true);
      return;
    }

    const u = new SpeechSynthesisUtterance(seg.text);
    u.lang = opts.lang;
    u.pitch = opts.pitch;
    u.rate = opts.rate;
    if (voice) u.voice = voice;

    u.onstart = () => startEstimate(false);
    u.onboundary = (e) => {
      if (!alive() || e.name === 'sentence') return;
      if (!usingBoundary) {
        usingBoundary = true;
        clearSeg();
      }
      opts.onWord?.(wordIndexAt(allTokens, seg.start + e.charIndex));
    };
    u.onend = finish;
    u.onerror = () => {
      // 음성이 실패해도 글자 강조는 끝까지
      if (!estimateStarted && !usingBoundary) startEstimate(true);
      else if (!usingBoundary) push(window.setTimeout(finish, total * 1000 + 150));
      else finish();
    };

    // 음성이 시작조차 안 되는 기기 대비: 1.5초 안에 onstart가 없으면 추정으로 진행
    push(window.setTimeout(() => startEstimate(true), 1500));
    this.synth.speak(u);
  }

  /** 기기 음성 목록 다시 받기 (안드로이드는 목록이 늦게 오고 voiceschanged 가 안 올 때도 있다) */
  private refreshVoices(): void {
    const list = this.synth?.getVoices() ?? [];
    if (list.length) this.voices = list;
  }

  /**
   * 해당 언어 음성 고르기: 정확히 같은 언어(ko-KR) → 같은 말(ko) 순서, 그 안에서 기기에 설치된 것 우선.
   * 음성을 직접 정해 주지 않으면 일부 태블릿은 lang 을 무시하고 기본(영어) 음성으로 한국어를 읽는다.
   */
  pickVoice(lang: string): SpeechSynthesisVoice | undefined {
    if (!this.voices.some((v) => sameLang(v.lang, lang))) this.refreshVoices();
    return pickVoiceFrom(this.voices, lang);
  }

  /** 점검 화면용: 기기에 있는 음성 */
  get voiceList(): readonly SpeechSynthesisVoice[] {
    this.refreshVoices();
    return this.voices;
  }

  private clearTimers(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
  }
}

const normLang = (l: string) => l.replace('_', '-').toLowerCase();
const sameLang = (a: string, b: string) => normLang(a).split('-')[0] === normLang(b).split('-')[0];

/** 음성 목록에서 고르기 (테스트용으로 밖에 둠) */
export function pickVoiceFrom<V extends { lang: string; localService: boolean }>(voices: readonly V[], lang: string): V | undefined {
  const want = normLang(lang);
  const exact = voices.filter((v) => normLang(v.lang) === want);
  const same = voices.filter((v) => sameLang(v.lang, lang));
  for (const list of [exact, same]) {
    const v = list.find((x) => x.localService) ?? list[0];
    if (v) return v;
  }
  return undefined;
}
