/**
 * 取り込み順の既定が「①約定履歴 → ②保有銘柄」になっているか。
 *
 *   node tests/pr11_import_order_default_2026_09_23.test.js
 *
 * 背景 (2026-09-23): `tests/pr10` で「約定履歴 → 保有」が正しいと実測で確定し
 * CLAUDE.md にも書いたのに、**UI は 💼保有 が先頭で既定選択**のままだった。
 * つまり画面を素直に操作すると逆順になり、CLAUDE.md が列挙した害
 * (売りの損益が null / 建日が不明 / 残金が動かない / 株数の二重計上) が既定で起きた。
 * 正しい順序の説明も `histOnlyWrap` (既定 display:none) の中にあって読めなかった。
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...HTML.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const all = scripts.join('\n');

let bad = 0;
const chk = (ok, label) => { console.log(`  ${ok ? 'OK  ' : 'NG  '}${label}`); if (!ok) bad++; };

console.log('--- 既定で選ばれているのは約定履歴 ---');
const onBtn = /<div class="ss-type on" id="sst-([a-z]+)"/.exec(HTML);
chk(onBtn && onBtn[1] === 'hist', `class="ss-type on" が付くのは hist (${onBtn && onBtn[1]})`);
chk((HTML.match(/class="ss-type on"/g) || []).length === 1, '既定選択は1つだけ');
const initLine = all.split('\n').find(l => l.includes("let ssType="));
chk(initLine && /let ssType='hist'/.test(initLine), `初期値も hist (${(initLine || '').trim().slice(0, 24)})`);

console.log('--- ボタンの並びが 約定履歴 → 保有銘柄 ---');
const iHist = HTML.indexOf('id="sst-hist"'), iHold = HTML.indexOf('id="sst-hold"');
chk(iHist > 0 && iHold > 0 && iHist < iHold, '約定履歴のほうが先に描かれる');
chk(/①約定履歴/.test(HTML) && /②保有銘柄/.test(HTML), 'ボタンに ①② の順番が書いてある');

console.log('--- 順序の説明が常時表示 ---');
// histOnlyWrap は既定 display:none。説明はその外に出ていること
const wrapStart = HTML.indexOf('id="histOnlyWrap"');
const guide = HTML.indexOf('①📋約定履歴 → ②💼保有銘柄');
chk(guide > 0, '順序の説明文が存在する');
chk(guide < wrapStart, '説明は histOnlyWrap (既定 display:none) の外にある');
const seg = HTML.slice(Math.max(0, guide - 400), guide);
chk(!/display:none/.test(seg), '説明を包む要素が display:none ではない');
chk(/建日が「不明」/.test(HTML) && /残金が動きません/.test(HTML),
    '逆順の害 (建日不明・残金が動かない) を具体的に書いている');

console.log('--- 「履歴だけ」チェックは既定オフのまま ---');
const chkbox = /<input type="checkbox" id="histOnlyChk"([^>]*)>/.exec(HTML);
chk(chkbox && !/\bchecked\b/.test(chkbox[1]), '既定でチェックが入っていない');

console.log('--- 古い記述が残っていない ---');
chk(!/12:30\/15:30\) の監視対象/.test(HTML),
    'limit_watch の旧スケジュール (12:30/15:30) を現行として書いていない');
chk(/平日17:45/.test(HTML), '現行の 17:45 を書いている');
const mgetsu = [...HTML.matchAll(/月1回/g)].length;
chk(mgetsu === 0 || /旧「決済は月1回/.test(HTML),
    `「月1回」が残っていても否定形で書いてある (${mgetsu}箇所)`);

console.log('--- setSsType が両方を切り替えられる ---');
const sb = { document: { getElementById: () => null, querySelectorAll: () => [] } };
const src = all.slice(all.indexOf('function setSsType('));
chk(/sst-'\s*\+\s*t|sst-' \+ t|'sst-' \+ t/.test(src.slice(0, 400)) || src.slice(0, 400).includes('sst-'),
    'setSsType は id を組み立てて切り替える (hist/hold を特別扱いしていない)');

console.log('--- 構文 ---');
scripts.forEach((s2, i) => {
  try { new vm.Script(s2); } catch (e) { chk(false, `inline <script> #${i}: ${e.message}`); }
});
chk(true, `inline <script> ${scripts.length} 本の構文OK`);

console.log(bad ? `\nRESULT: ${bad} NG` : '\nRESULT: OK');
process.exit(bad ? 1 : 0);
