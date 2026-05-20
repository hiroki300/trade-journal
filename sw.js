// Service Worker - Trade Journal PWA v5 (Phase C-1: Share Target 対応)
const CACHE = 'tj-v5';
const SHARE_CACHE = 'tj-share-v1';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      // tj-share-v1 は残しつつ、その他 (tj-v*) の旧キャッシュを削除
      Promise.all(keys.filter(k => k !== SHARE_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Phase C-1: Web Share Target で受け取った画像を Cache API に保存し、GET にリダイレクト
async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('shared_images').filter(f => f && typeof f === 'object' && f.type && f.type.startsWith('image/'));
    if (files.length === 0) {
      return Response.redirect('/trade-journal/index.html', 303);
    }
    const cache = await caches.open(SHARE_CACHE);
    // 既存の share-target キャッシュをクリアしてから保存
    const keys = await cache.keys();
    await Promise.all(keys.map(k => cache.delete(k)));
    for (let i = 0; i < files.length && i < 20; i++) {
      const f = files[i];
      const headers = new Headers();
      headers.set('Content-Type', f.type || 'image/jpeg');
      headers.set('X-Share-Filename', encodeURIComponent(f.name || 'shared-' + i + '.jpg'));
      await cache.put('/__share-target-image-' + i, new Response(f, { headers }));
    }
    return Response.redirect('/trade-journal/index.html?share-target=true&count=' + Math.min(files.length, 20), 303);
  } catch (e) {
    return Response.redirect('/trade-journal/index.html?share-target=error', 303);
  }
}

// HTMLは常にネットワーク優先（キャッシュしない）
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Phase C-1: Share Target の POST を index.html で intercept
  if (e.request.method === 'POST' && url.pathname.endsWith('/index.html')) {
    e.respondWith(handleShareTarget(e.request));
    return;
  }

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
