import type * as THREE from 'three';
import { QUALITY, type PerfGovernor, PERF_KEY } from '../core/quality';
import type { Speaker } from '../core/tts';

/**
 * 태블릿 점검 화면 (어른용, 주소 끝에 ?check=1).
 * 지금 fps·자동 조절 단계·해상도, 기기 음성 목록과 고른 한국어 음성, 목소리 시험 버튼.
 * 문제가 생긴 기기에서 이 화면을 찍어 보내면 원인을 바로 알 수 있다.
 */
export class CheckOverlay {
  private readonly el: HTMLDivElement;
  private readonly stats: HTMLPreElement;
  private frames = 0;
  private time = 0;
  private worst = 0;

  constructor(
    parent: HTMLElement,
    private readonly d: { renderer: THREE.WebGLRenderer; speaker: Speaker; perf: PerfGovernor },
  ) {
    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:fixed;z-index:99;left:8px;bottom:8px;max-width:min(92vw,520px);max-height:60vh;overflow:auto;padding:10px 12px;border-radius:14px;background:rgba(40,30,60,.82);color:#fff;font:13px/1.45 monospace;touch-action:auto';
    this.el.innerHTML = `<pre style="margin:0;white-space:pre-wrap"></pre>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        <button data-k="ko" style="font-size:16px;padding:8px 12px">한국어 시험</button>
        <button data-k="en" style="font-size:16px;padding:8px 12px">English test</button>
        <button data-k="reset" style="font-size:16px;padding:8px 12px">자동 조절 초기화</button>
      </div>`;
    this.stats = this.el.querySelector('pre')!;
    parent.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => {
      const k = (e.target as HTMLElement).dataset.k;
      if (k === 'ko') d.speaker.speak('안녕하세요! 로은이의 공주 왕국이에요.', { lang: 'ko-KR', pitch: 1.1, rate: 1 });
      else if (k === 'en') d.speaker.speak('Hello! Pink! Apple!', { lang: 'en-US', pitch: 1.1, rate: 1 });
      else if (k === 'reset') {
        localStorage.removeItem(PERF_KEY);
        location.reload();
      }
    });
    this.refresh();
  }

  update(rawDt: number): void {
    this.frames++;
    this.time += rawDt;
    this.worst = Math.max(this.worst, rawDt);
    if (this.time >= 1) this.refresh();
  }

  private refresh(): void {
    const fps = this.time > 0 ? this.frames / this.time : 0;
    const r = this.d.renderer;
    const canvas = r.domElement;
    const nav = navigator as Navigator & { deviceMemory?: number };
    const voices = this.d.speaker.voiceList;
    const ko = voices.filter((v) => /^ko/i.test(v.lang));
    const pick = this.d.speaker.pickVoice('ko-KR');
    const info = r.info.render;
    this.stats.textContent = [
      `fps ${fps.toFixed(0)} (가장 긴 프레임 ${(this.worst * 1000).toFixed(0)}ms)`,
      `자동 조절 단계 ${this.d.perf.level}/4 · 품질 ${QUALITY}`,
      `해상도 ${canvas.width}×${canvas.height} · 픽셀비율 ${r.getPixelRatio()} (기기 ${devicePixelRatio})`,
      `그리기 ${info.calls}번 · 삼각형 ${Math.round(info.triangles / 1000)}k`,
      `코어 ${navigator.hardwareConcurrency ?? '?'} · 메모리 ${nav.deviceMemory ?? '?'}GB`,
      `${navigator.userAgent}`,
      `음성 ${voices.length}개 · 한국어 ${ko.length}개`,
      ...ko.map((v) => `  - ${v.name} [${v.lang}]${v.localService ? ' 설치됨' : ' 온라인'}${v.default ? ' 기본' : ''}`),
      `고른 한국어 음성: ${pick ? `${pick.name} [${pick.lang}]` : '없음 → 기기 설정에서 한국어 음성 설치 필요'}`,
      `남자 목소리(고고): ${this.d.speaker.pickVoice('ko-KR', 'male')?.name ?? '없음'} · 영어: ${this.d.speaker.pickVoice('en-US')?.name ?? '없음'}`,
    ].join('\n');
    this.frames = 0;
    this.time = 0;
    this.worst = 0;
  }
}
