/* Service worker RANEPA Student: офлайн-работа и обновления. Создаётся сборкой (build.mjs). */
const VERSION = 'c8cf4da19d42';
const CACHE = 'ranepa-student-' + VERSION;
const FONT_CACHE = 'ranepa-student-fonts';
const PRECACHE = [
  "./",
  "./assets/app-CCSAFWG3.css",
  "./assets/app-SSDC2EBX.js",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/favicon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./index.html",
  "./manifest.webmanifest"
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('ranepa-student-') && k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') {
      // Оболочка приложения из кэша — запуск без интернета; новая версия приходит через обновление service worker.
      event.respondWith(caches.match('./index.html').then((cached) => cached || fetch(request)));
      return;
    }
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
