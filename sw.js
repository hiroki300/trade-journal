// Service Worker - Trade Journal PWA
const CACHE = 'tj-v3';  // バージョンを上げると古いキャッシュが自動削除される

self.addEventListener('install', e => {
  self.skipWaiting();  // 即座に新バージョンを適用
});

self.addEventListener('activate', e => {
  // 古いバージョンのキャッシュをすべて削除
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // APIリクエストはキャッシュしない
  if (e.request.url.includes('googleapis') ||
      e.request.url.includes('anthropic') ||
      e.request.url.includes('script.google.com')) {
    return;
  }
  // HTMLファイルは常にネットワークから取得（キャッシュより最新を優先）
  if (e.request.url.endsWith('.html')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  // その他はキャッシュ優先
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
