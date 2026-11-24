import type { Speaker } from '../core/tts';
import {
  PLAY_CHOICES,
  lockQuestion,
  loadSettings,
  qualityChoice,
  saveSettings,
  setQualityChoice,
  SPEECH_RATE,
  type QualityChoice,
  type Settings,
  type SpeechSpeed,
} from '../core/settings';
import './parent-panel.css';

/**
 * 부모 설정 (M9, GDD 7·9: 부모 설정은 어른용 잠금 뒤에).
 * 1) 잠금: 두 자리 곱셈 답을 숫자판으로 입력 (틀리면 조용히 새 문제)
 * 2) 설정: 플레이 시간 · 말 빠르기 · 그래픽 품질 · 목소리 확인 · 저장 초기화(두 번 확인)
 *    잠자리 화면에서 열면(continue) 잠금 뒤에 "조금 더 놀기" 를 고른다
 * 어른이 보는 화면이라 글로만 안내한다 (음성 없음).
 */
export interface ParentDeps {
  speaker: Speaker;
  /** 설정을 바꾸면 바로 적용 (말 빠르기·플레이 시간) */
  onSettings(s: Settings): void;
  /** 이번에 논 시간(분) */
  playedMinutes(): number;
  /** 잠자리 화면에서: min 분 더 놀기 (0 = 오늘은 그만, 계속 잠) */
  onContinue(min: number): void;
  /** 저장 지우고 처음부터 */
  onReset(): Promise<void>;
  onClose(): void;
}

export class ParentPanel {
  readonly el: HTMLDivElement;
  private q = lockQuestion();
  private typed = '';
  private settings: Settings = loadSettings();
  private mode: 'settings' | 'continue' = 'settings';

  constructor(parent: HTMLElement, private readonly d: ParentDeps) {
    this.el = document.createElement('div');
    this.el.className = 'parent-panel';
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!b) return;
      const { act, value = '' } = b.dataset;
      if (act === 'close') this.d.onClose();
      else if (act === 'key') this.key(value);
      else if (act === 'speech') this.setSpeech(value as SpeechSpeed);
      else if (act === 'quality') this.setQuality(value as QualityChoice);
      else if (act === 'voice') this.testVoice();
      else if (act === 'reset') this.showReset();
      else if (act === 'reset-yes') void this.reset(b);
      else if (act === 'reset-no') this.showSettings();
      else if (act === 'reload') location.reload();
      else if (act === 'play') this.setPlay(Number(value));
      else if (act === 'sfx' || act === 'music') this.setSound(act, value === 'on');
      else if (act === 'more') this.d.onContinue(Number(value));
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(mode: 'settings' | 'continue' = 'settings'): void {
    this.mode = mode;
    this.el.hidden = false;
    this.q = lockQuestion();
    this.typed = '';
    this.showLock();
  }

  close(): void {
    this.el.hidden = true;
    this.el.innerHTML = '';
  }

  // ── 잠금 ──

  private showLock(): void {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok']
      .map((k) => `<button class="pa-key ${k.length > 1 ? 'is-fn' : ''}" data-act="key" data-value="${k}">${k === 'del' ? '←' : k === 'ok' ? '확인' : k}</button>`)
      .join('');
    this.el.innerHTML = `<div class="pa-card pa-lock">
      ${this.head('어른 확인')}
      <p class="pa-hint">부모님만 들어갈 수 있어요. 답을 눌러 주세요.</p>
      <div class="pa-q">${this.q.a} × ${this.q.b} = <span class="pa-typed">${this.typed || '?'}</span></div>
      <div class="pa-keys">${keys}</div>
    </div>`;
  }

  private key(k: string): void {
    if (k === 'del') this.typed = this.typed.slice(0, -1);
    else if (k === 'ok') {
      if (Number(this.typed) === this.q.answer) return this.mode === 'continue' ? this.showContinue() : this.showSettings();
      // 틀리면 조용히 새 문제 (빨간 경고 없음)
      this.q = lockQuestion();
      this.typed = '';
    } else if (this.typed.length < 3) this.typed += k;
    this.showLock();
  }

  // ── 설정 ──

  private showSettings(): void {
    this.settings = loadSettings();
    const speech = (Object.keys(SPEECH_RATE) as SpeechSpeed[])
      .map((s) => this.choice('speech', s, { slow: '느리게', normal: '보통', fast: '빠르게' }[s], this.settings.speech === s))
      .join('');
    const q = qualityChoice();
    const quality = (['auto', 'basic', 'high'] as QualityChoice[])
      .map((v) => this.choice('quality', v, { auto: '자동', basic: '가볍게', high: '고품질' }[v], q === v))
      .join('');
    const voice = this.d.speaker.pickVoice('ko-KR');
    const play = PLAY_CHOICES.map((m) => this.choice('play', String(m), m ? `${m}분` : '정하지 않음', this.settings.playMinutes === m)).join('');
    this.el.innerHTML = `<div class="pa-card">
      ${this.head('부모 설정')}
      <section>
        <h3>플레이 시간</h3>
        <div class="pa-row">${play}</div>
        <p class="pa-note">끝나기 2분 전에 펫이 알려 주고, 시간이 되면 잠자리 장면으로 끝나요. 지금까지 ${this.d.playedMinutes()}분 놀았어요.</p>
      </section>
      <section>
        <h3>소리</h3>
        <div class="pa-row">${this.choice('sfx', 'on', '효과음 켜기', this.settings.sfx)}${this.choice('sfx', 'off', '효과음 끄기', !this.settings.sfx)}</div>
        <div class="pa-row" style="margin-top:8px">${this.choice('music', 'on', '음악 켜기', this.settings.music)}${this.choice('music', 'off', '음악 끄기', !this.settings.music)}</div>
      </section>
      <section>
        <h3>말 빠르기</h3>
        <div class="pa-row">${speech}</div>
      </section>
      <section>
        <h3>그래픽 품질</h3>
        <div class="pa-row">${quality}</div>
        <p class="pa-note">태블릿이 느리면 "가볍게". 다시 켜면 적용돼요.
          <button class="pa-link" data-act="reload">지금 다시 켜기</button></p>
      </section>
      <section>
        <h3>목소리</h3>
        <p class="pa-note">한국어 음성: ${voice ? `${voice.name}` : '없음 — 기기 설정 › 텍스트 음성 변환에서 한국어 음성을 설치해 주세요.'}</p>
        <div class="pa-row"><button class="pa-btn" data-act="voice">들어 보기</button></div>
      </section>
      <section>
        <h3>저장 초기화</h3>
        <p class="pa-note">옷·가구·펫·별사탕·부탁을 모두 지우고 처음부터 시작해요.</p>
        <div class="pa-row"><button class="pa-btn is-soft" data-act="reset">처음부터 하기…</button></div>
      </section>
    </div>`;
  }

  private choice(act: string, value: string, label: string, on: boolean): string {
    return `<button class="pa-btn ${on ? 'is-on' : ''}" data-act="${act}" data-value="${value}" aria-pressed="${on}">${label}</button>`;
  }

  private head(title: string): string {
    return `<div class="pa-head"><h2>${title}</h2><button class="pa-close" data-act="close" aria-label="닫기">✕</button></div>`;
  }

  private setSpeech(s: SpeechSpeed): void {
    this.settings = { ...this.settings, speech: s };
    saveSettings(this.settings);
    this.d.onSettings(this.settings);
    this.showSettings();
    this.testVoice();
  }

  private setSound(which: 'sfx' | 'music', on: boolean): void {
    this.settings = { ...this.settings, [which]: on };
    saveSettings(this.settings);
    this.d.onSettings(this.settings);
    this.showSettings();
  }

  private setPlay(min: number): void {
    this.settings = { ...this.settings, playMinutes: min };
    saveSettings(this.settings);
    this.d.onSettings(this.settings);
    this.showSettings();
  }

  /** 잠자리 화면에서 어른 확인 뒤: 조금 더 놀기 */
  private showContinue(): void {
    this.el.innerHTML = `<div class="pa-card">
      ${this.head('조금 더 놀기')}
      <p class="pa-note">더 놀게 해 줄까요? 끝나기 2분 전에 다시 알려 줘요.</p>
      <div class="pa-row" style="margin-top:12px">
        <button class="pa-btn is-on" data-act="more" data-value="10">10분 더</button>
        <button class="pa-btn" data-act="more" data-value="15">15분 더</button>
        <button class="pa-btn" data-act="more" data-value="0">오늘은 그만</button>
      </div>
    </div>`;
  }

  private setQuality(q: QualityChoice): void {
    setQualityChoice(q);
    this.showSettings();
  }

  private testVoice(): void {
    this.d.speaker.speak('안녕하세요! 로은이의 공주 왕국이에요.', { lang: 'ko-KR', pitch: 1.15, rate: 1 });
  }

  private showReset(): void {
    this.el.innerHTML = `<div class="pa-card">
      ${this.head('처음부터 하기')}
      <p class="pa-warn">정말 모두 지울까요? 지우면 되돌릴 수 없어요.</p>
      <p class="pa-note">옷·가구·방 색·펫·별사탕·부탁 진행이 모두 처음으로 돌아가요. (설정은 그대로)</p>
      <div class="pa-row">
        <button class="pa-btn is-on" data-act="reset-no">그대로 두기</button>
        <button class="pa-btn is-soft" data-act="reset-yes">모두 지우기</button>
      </div>
    </div>`;
  }

  private async reset(btn: HTMLElement): Promise<void> {
    btn.setAttribute('disabled', '');
    await this.d.onReset();
    location.reload();
  }
}

/** 부모 설정 버튼 그림 (톱니바퀴) */
export function gearIcon(): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M27 6h10l1.6 7.2a20 20 0 0 1 5 2.9l7-2.3 5 8.7-5.5 4.9a20 20 0 0 1 0 5.8l5.5 4.9-5 8.7-7-2.3a20 20 0 0 1-5 2.9L37 58H27l-1.6-7.2a20 20 0 0 1-5-2.9l-7 2.3-5-8.7 5.5-4.9a20 20 0 0 1 0-5.8L8.4 26l5-8.7 7 2.3a20 20 0 0 1 5-2.9zM32 22a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/></svg>`;
}
