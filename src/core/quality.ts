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
  basic: { bloom: false, maxPixelRatio: 1.25, shadowMap: 1024, petals: 14, clouds: 4 },
  high: { bloom: true, maxPixelRatio: 2, shadowMap: 2048, petals: 36, clouds: 7 },
}[QUALITY];

/** 다음에 켤 때부터 적용 (부모 설정용) */
export function setQuality(q: Quality): void {
  try {
    globalThis.localStorage?.setItem(KEY, q);
  } catch {
    /* 저장 못 해도 괜찮음 */
  }
}
