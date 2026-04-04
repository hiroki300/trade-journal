// Service Worker - Trade Journal PWA
const CACHE = 'tj-v1';
const ASSETS = [
  '/trade-journal/trading_journal.html',
  '/trade-journal/manifest.json',
  '/trade-journal/icon-192.png',
  '/trade-journal/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // APIリクエストはキャッシュしない
  if (e.request.url.includes('googleapis') || 
      e.request.url.includes('anthropic') ||
      e.request.url.includes('script.google.com')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
