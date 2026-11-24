// 최소 서비스 워커: 오프라인에서도 마지막으로 받은 게임이 열리도록.
// 페이지(HTML)는 네트워크 우선, 나머지 정적 파일은 캐시 우선.
// 캐시 구조를 바꿀 때는 CACHE 이름의 버전을 올린다.
const CACHE = 'princess-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        // 배포 중에 받은 404 가 브라우저 캐시에 남아 있을 수 있어, 실패하면 캐시를 건너뛰고 한 번 더
        fetch(req)
          .then((res) => (res.ok ? res : fetch(req, { cache: 'reload' })))
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
    ),
  );
});
