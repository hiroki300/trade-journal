/**
 * sw.js のオフライン代替が、古いデータを出さない形になっているか。
 *
 *   node tests/pr13_sw_offline_2026_09_23.test.js
 *
 * 背景 (2026-09-23): これまで `CACHE = 'tj-v5'` を宣言していたが `caches.put` は
 * `SHARE_CACHE` にしかしておらず、圏外では何も出なかった。ただしこれは**バグでは
 * なく意図的**で、`// すべてネットワークから取得（キャッシュ無効）` と書かれていた。
 * SW の本来の目的は Web Share Target (保有スクショの受け取り) である。
 *
 * オフライン代替を足すにあたっての制約:
 *   1. **公開 JSON をキャッシュしない。** 古い候補や古い保有を「今日のもの」として
 *      描くのが最悪の壊れ方 (backend の ROB-1 と同じ思想)。圏外では
 *      「アプリは開くがデータは出ない」を正とする。
 *   2. **オンラインなら必ず最新。** 実測で、同一 URL への既定 fetch はブラウザの
 *      HTTP キャッシュから古い index.html を返した。`cache:'reload'` で迂回する。
 *   3. Share Target の経路を壊さない。
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

let bad = 0;
const chk = (ok, label) => { console.log(`  ${ok ? 'OK  ' : 'NG  '}${label}`); if (!ok) bad++; };

console.log('--- 構文 ---');
try { new vm.Script(SW); chk(true, 'sw.js は構文エラーなし'); }
catch (e) { chk(false, 'sw.js 構文エラー: ' + e.message); }

console.log('--- app shell をキャッシュする ---');
chk(/const SHELL\s*=\s*\[/.test(SW), 'SHELL (app shell の一覧) がある');
['./', './index.html', './manifest.json'].forEach(p => {
  chk(SW.includes(`'${p}'`), `SHELL に ${p} が入っている`);
});
chk(/caches\.open\(SHELL_CACHE\)/.test(SW), 'SHELL_CACHE を開いている');
chk(/cache\.add\(/.test(SW), 'install で app shell を入れている');
// addAll は 1 つ失敗すると全部失敗する → 個別 add であること
chk(!/cache\.addAll\(/.test(SW), 'addAll ではなく個別 add (1つ欠けても全滅しない)');

console.log('--- 相対パス (GitHub Pages の /trade-journal/ でも動く) ---');
chk(!/const SHELL\s*=\s*\[[^\]]*'\/index\.html'/.test(SW),
    'SHELL が絶対パス /index.html になっていない (スコープ相対)');

console.log('--- 公開 JSON はキャッシュしない ---');
chk(/url\.origin\s*!==\s*self\.location\.origin/.test(SW),
    'isShell が同一オリジンに限定している (公開 JSON = 別オリジンは対象外)');
chk(/githubusercontent/.test(SW) === false,
    '公開データの URL を明示的にキャッシュ対象にしていない');

console.log('--- オンラインなら必ず最新 ---');
chk(/cache:\s*'reload'/.test(SW), "HTTP キャッシュを迂回する cache:'reload' がある");
chk(/function shellFetch/.test(SW), 'shellFetch (app shell 専用の取得) がある');
// 成功時にキャッシュを更新していること
chk(/res\.ok/.test(SW) && /c\.put\(request/.test(SW),
    '成功した応答だけキャッシュを更新している');
chk(/res\.type\s*!==\s*'opaque'/.test(SW),
    'opaque 応答をキャッシュしない (壊れた画面を焼き付けない)');

console.log('--- 圏外での代替 ---');
chk(/caches\.match\(request/.test(SW), '失敗時にキャッシュへ退避する');
chk(/request\.mode\s*===\s*'navigate'/.test(SW), 'ナビゲーションを index.html に倒す');
chk(/NET_TIMEOUT_MS/.test(SW), '低速回線でのタイムアウトがある');

console.log('--- Share Target を壊していない ---');
chk(/handleShareTarget/.test(SW), 'handleShareTarget が残っている');
chk(/shared_images/.test(SW), '共有画像の取り出しが残っている');
chk(/SHARE_CACHE/.test(SW), 'SHARE_CACHE が残っている');
chk(/KEEP\s*=\s*\[SHELL_CACHE,\s*SHARE_CACHE\]/.test(SW),
    'activate の掃除で SHARE_CACHE と SHELL_CACHE の両方を残す');

console.log('--- AI API を SW に通さない ---');
['googleapis', 'anthropic', 'script.google.com'].forEach(h => {
  chk(SW.includes(h), `${h} は素通し (キー付きリクエストを触らない)`);
});

console.log(bad ? `\nRESULT: ${bad} NG` : '\nRESULT: OK');
process.exit(bad ? 1 : 0);
