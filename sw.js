// Service Worker - Trade Journal PWA
//   Phase C-1 : Web Share Target (共有された画像の受け渡し)
//   2026-09-23: オフライン代替 (app shell のキャッシュ) を追加
//
// ⚠️ 設計の核 — **公開 JSON は絶対にキャッシュしない。**
//   このアプリは「今日のデータ」を出すことが前提で、古い候補や古い保有を
//   今日のものとして描くのが最悪の壊れ方 (backend の ROB-1 と同じ思想)。
//   だから圏外では「アプリは開くがデータは出ない」を正とする。
//   キャッシュするのは画面の骨 (HTML/manifest/icon) だけ。
//
// 取得方針: ネットワーク優先 + タイムアウトでキャッシュに退避。
//   - 回線が生きているときは必ず最新を取る (更新が1世代遅れない)
//   - 遅い/切れているときは NET_TIMEOUT_MS でキャッシュに切り替えて即開く
//   - 成功した app shell の応答は毎回キャッシュを更新する
const SHELL_CACHE = 'tj-shell-v1';
const SHARE_CACHE = 'tj-share-v1';
const KEEP = [SHELL_CACHE, SHARE_CACHE];

// SW スコープ基準の相対パス。GitHub Pages (/trade-journal/) と
// ローカル preview (/) の両方で正しく解決される。
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

// 回線が遅いときにキャッシュへ切り替えるまでの待ち時間。
// index.html は ~295KB あるので、圏外や極端に細い回線で無限に待たせない。
const NET_TIMEOUT_MS = 3000;

self.addEventListener('install', e => {
  // addAll は 1 つ失敗すると全部失敗するので個別に入れる (アイコン欠けで
  // オフライン代替ごと死ぬのを避ける)
  e.waitUntil(
    caches.open(SHELL_CACHE).then(cache =>
      Promise.all(SHELL.map(p =>
        cache.add(new Request(p, { cache: 'reload' })).catch(() => null)
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      // KEEP 以外 (旧 tj-v* など) を削除
      Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k)))
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

/** app shell か (= キャッシュしてよいか)。同一オリジンの GET のみ。 */
function isShell(request, url) {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;   // 公開 JSON は対象外
  if (request.mode === 'navigate') return true;
  return /\.(html|json|png|svg|ico|webmanifest)$/.test(url.pathname)
    && !url.pathname.endsWith('sw.js');
}

/** 圏外/低速時の代替。ナビゲーションは index.html に倒す。 */
async function fallback(request) {
  const hit = await caches.match(request, { ignoreSearch: true });
  if (hit) return hit;
  if (request.mode === 'navigate') {
    const shell = await caches.match('./index.html', { ignoreSearch: true });
    if (shell) return shell;
  }
  return Response.error();
}

/**
 * app shell は HTTP キャッシュを迂回して必ず最新を取る。
 *
 * ⚠️ 実測 (2026-09-23): 同じ URL への既定 fetch はブラウザの HTTP キャッシュから
 * **古い index.html を返した** (更新したのにマーカーが出ない)。`cache:'reload'` では
 * 最新が返った。SW は HTTP キャッシュの手前ではなく奥にいるので、ここを迂回しないと
 * 「オンラインなら必ず最新」が壊れる — このアプリで一番やってはいけない壊れ方。
 */
function shellFetch(request) {
  return fetch(request, { cache: 'reload' }).catch(() => fetch(request));
}

async function networkFirst(request) {
  const url = new URL(request.url);
  const shell = isShell(request, url);
  let timer;
  try {
    const net = (shell ? shellFetch(request) : fetch(request)).then(res => {
      // 成功した app shell だけキャッシュを更新する。
      // opaque/エラー応答は入れない (壊れた画面を焼き付けないため)。
      if (shell && res && res.ok && res.type !== 'opaque') {
        const copy = res.clone();
        caches.open(SHELL_CACHE).then(c => c.put(request, copy)).catch(() => {});
      }
      return res;
    });
    if (!shell) return await net;                 // 公開 JSON 等は素通し (退避しない)
    // app shell は待ちすぎない: NET_TIMEOUT_MS でキャッシュに切り替える
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => resolve(null), NET_TIMEOUT_MS);
    });
    const winner = await Promise.race([net.catch(() => null), timeout]);
    if (winner) return winner;
    const cached = await fallback(request);
    // キャッシュが無ければネットワークの完走を待つ (初回起動時など)
    return cached && cached.type !== 'error' ? cached : await net;
  } catch (e) {
    return fallback(request);
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Phase C-1: Share Target の POST を index.html で intercept
  if (e.request.method === 'POST' && url.pathname.endsWith('/index.html')) {
    e.respondWith(handleShareTarget(e.request));
    return;
  }

  // AI API と GAS は SW を通さない (キー付きリクエストを触らない)
  if (e.request.url.includes('googleapis') ||
      e.request.url.includes('anthropic') ||
      e.request.url.includes('script.google.com')) {
    return;
  }

  e.respondWith(networkFirst(e.request));
});
