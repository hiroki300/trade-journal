// Service Worker - Trade Journal PWA v4
const CACHE = 'tj-v4';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))  // 全キャッシュ削除
    ).then(() => self.clients.claim())
  );
});

// HTMLは常にネットワーク優先（キャッシュしない）
self.addEventListener('fetch', e => {
  if (e.request.url.includes('googleapis') ||
      e.request.url.includes('anthropic') ||
      e.request.url.includes('script.google.com')) {
    return;
  }
  // すべてネットワークから取得（キャッシュ無効）
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
