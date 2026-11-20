/** 프로덕션 빌드에서만 서비스 워커 등록 (개발 중 캐시 혼동 방지) */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('서비스 워커 등록 실패', err);
    });
  });
}
