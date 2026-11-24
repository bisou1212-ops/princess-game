/**
 * 플레이 시간 (M9-2, GDD 4·9): 부모가 정한 시간만큼 놀면 잠자리 장면으로 자연스럽게 마무리.
 * - 끝나기 2분 전에 한 번 예고 (펫이 "곧 자러 갈 시간이에요")
 * - 예고를 듣고 나서 적어도 1분은 더 놀 수 있게 (설정을 놀던 중에 줄여도 갑자기 끝나지 않게)
 * - 앱을 다시 켜도 잠든 지 얼마 안 됐으면 계속 자는 화면 (SLEEP_HOLD)
 * 시간은 화면이 켜져 있는 동안만 센다. three.js 와 분리된 순수 로직.
 */
export const WARN_BEFORE = 120;
const MIN_AFTER_WARN = 60;
/** 잠든 뒤 이만큼은 다시 켜도 자는 화면 (어른이 "더 놀기"로 풀 수 있음) */
export const SLEEP_HOLD_MS = 60 * 60 * 1000;

export type PlayEvent = 'warn' | 'bedtime' | null;

export class PlayTimer {
  /** 이번에 논 시간(초) */
  used = 0;
  private warnedAt: number | null = null;
  private slept = false;

  constructor(
    /** 놀 시간(분), 0 = 정하지 않음 */
    public limitMin = 0,
  ) {}

  get asleep(): boolean {
    return this.slept;
  }

  /** 남은 시간(초). 정하지 않았으면 Infinity */
  get left(): number {
    if (this.limitMin <= 0) return Infinity;
    const end = Math.max(this.limitMin * 60, this.warnedAt !== null ? this.warnedAt + MIN_AFTER_WARN : 0);
    return Math.max(0, end - this.used);
  }

  /** 부모 설정에서 바꿈 (바로 적용) */
  setLimit(min: number): void {
    this.limitMin = min;
    if (min <= 0) this.warnedAt = null;
  }

  /**
   * 매 프레임(또는 매초). active=false 면 세지 않음 (화면 꺼짐·잠든 화면).
   * 돌려주는 값: 이번에 일어난 일 (예고·잠자리) — 한 번씩만
   */
  tick(dt: number, active = true): PlayEvent {
    if (!active || this.slept || this.limitMin <= 0) return null;
    this.used += Math.min(dt, 1);
    if (this.warnedAt === null && this.limitMin * 60 - this.used <= WARN_BEFORE) {
      this.warnedAt = this.used;
      return 'warn';
    }
    if (this.left <= 0) {
      this.slept = true;
      return 'bedtime';
    }
    return null;
  }

  /** 다시 켰는데 아직 잘 시간 (잠든 지 얼마 안 됨) */
  sleepNow(): void {
    this.slept = true;
  }

  /** 어른이 "조금 더 놀기": 지금부터 min 분 더 (예고도 다시) */
  extend(min: number): void {
    this.slept = false;
    this.used = 0;
    this.limitMin = min;
    this.warnedAt = null;
  }
}
