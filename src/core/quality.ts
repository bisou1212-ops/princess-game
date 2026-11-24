/**
 * 그래픽 품질 (그래픽 고도화): basic = 느린 태블릿용, high = 빛번짐·큰 그림자·꽃잎 많이.
 * 정하는 순서: 주소 ?quality=basic|high → 저장된 설정(localStorage) → 기기 추정(코어 4개 이하·메모리 4GB 이하면 basic).
 * 부모 설정 화면(M9)에서 바꿀 수 있게 setQuality 를 둔다.
 */
export type Quality = 'basic' | 'high';

const KEY = 'quality';

function detect(): Quality {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('quality');
    if (q === 'basic' || q === 'high') return q;
    const saved = globalThis.localStorage?.getItem(KEY);
    if (saved === 'basic' || saved === 'high') return saved;
    const nav = globalThis.navigator as (Navigator & { deviceMemory?: number }) | undefined;
    const cores = nav?.hardwareConcurrency ?? 8;
    const mem = nav?.deviceMemory ?? 8;
    return cores <= 4 || mem <= 4 ? 'basic' : 'high';
  } catch {
    return 'high';
  }
}

export const QUALITY: Quality = detect();

export const QUALITY_SETTINGS = {
  basic: { bloom: false, maxPixelRatio: 1.25, shadowMap: 1024, petals: 14, clouds: 4, grassTufts: 400 },
  high: { bloom: true, maxPixelRatio: 2, shadowMap: 2048, petals: 36, clouds: 7, grassTufts: 1000 },
}[QUALITY];

/** 다음에 켤 때부터 적용 (부모 설정용) */
export function setQuality(q: Quality): void {
  try {
    globalThis.localStorage?.setItem(KEY, q);
  } catch {
    /* 저장 못 해도 괜찮음 */
  }
}

// ── 느린 기기 자동 조절 ──

/**
 * 실제로 그려 보며 느리면 단계별로 가볍게 한다 (태블릿마다 성능이 달라 미리 알 수 없음).
 * 단계: 0 그대로 → 1 빛번짐 끄기 → 2 해상도 1.5 → 3 해상도 1.25 → 4 해상도 1
 * 한 번 내린 단계는 저장해서 다음에 켤 때 처음부터 적용한다 (?quality= 로 정하면 저장값 무시하고 0부터).
 */
export const PERF_KEY = 'perfLevel';
export const PERF_MAX = 4;

export function savedPerfLevel(): number {
  try {
    if (new URLSearchParams(globalThis.location?.search ?? '').get('quality')) return 0;
    const n = Number(globalThis.localStorage?.getItem(PERF_KEY));
    return Number.isInteger(n) ? Math.min(PERF_MAX, Math.max(0, n)) : 0;
  } catch {
    return 0;
  }
}

/** 이 단계에서 쓸 최대 픽셀 비율·빛번짐 */
export function perfSettings(level: number): { maxPixelRatio: number; bloom: boolean } {
  const base = QUALITY_SETTINGS.maxPixelRatio;
  const cap = [base, base, 1.5, 1.25, 1][Math.min(PERF_MAX, Math.max(0, level))];
  return { maxPixelRatio: Math.min(base, cap), bloom: QUALITY_SETTINGS.bloom && level < 1 };
}

/**
 * 프레임 시간을 모아 평균 fps 가 목표보다 낮으면 한 단계 내린다.
 * - 장면을 바꾼 직후(불러오기·셰이더 준비로 잠깐 느림)는 grace() 로 잠깐 재지 않는다
 * - 올리지는 않는다 (오르락내리락하면 화면이 깜빡여 눈에 거슬림)
 */
export class PerfGovernor {
  level: number;
  /** 최근 재는 구간의 평균 fps (점검 화면용) */
  fps = 0;
  private frames = 0;
  private time = 0;
  private wait = 3;

  constructor(
    private readonly apply: (level: number) => void,
    start = savedPerfLevel(),
    private readonly targetFps = 40,
    private readonly window = 2.5,
  ) {
    this.level = start;
  }

  /** 잠깐 재지 않기 (장면 바꿀 때) */
  grace(seconds = 2): void {
    this.wait = Math.max(this.wait, seconds);
    this.frames = 0;
    this.time = 0;
  }

  /** 매 프레임 실제 경과 시간(초, 자르지 않은 값) */
  tick(rawDt: number, hidden = false): void {
    if (hidden || rawDt <= 0 || rawDt > 1) return; // 탭을 내렸다 올린 것 등은 무시
    if (this.wait > 0) {
      this.wait -= rawDt;
      return;
    }
    this.frames++;
    this.time += rawDt;
    if (this.time < this.window) return;
    this.fps = this.frames / this.time;
    this.frames = 0;
    this.time = 0;
    if (this.fps < this.targetFps && this.level < PERF_MAX) {
      this.level++;
      try {
        globalThis.localStorage?.setItem(PERF_KEY, String(this.level));
      } catch {
        /* 저장 못 해도 이번 판엔 적용 */
      }
      this.apply(this.level);
      this.grace(1.5);
    }
  }
}
