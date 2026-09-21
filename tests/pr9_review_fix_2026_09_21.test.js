/**
 * 「要確認」に出しているのに直せない、を直したか。
 *
 *   node tests/pr9_review_fix_2026_09_21.test.js
 *
 * ユーザー報告 (2026-09-21): 年の誤記2箇所をスマホから直せない・消せない。
 * 原因は履歴が直近30件しか描画されておらず (`[...T].reverse().slice(0,30)`)、
 * 取引41件のうち2024年の取得行に編集ボタンで到達できなかったこと。
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...HTML.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const all = scripts.join('\n');

let bad = 0;
const chk = (ok, label) => { console.log(`  ${ok ? 'OK  ' : 'NG  '}${label}`); if (!ok) bad++; };

function grab(name) {
  const i = all.indexOf(`function ${name}(`);
  if (i < 0) throw new Error(`${name} not found`);
  let d = 0, k = all.indexOf('{', i);
  for (; k < all.length; k++) { if (all[k] === '{') d++; else if (all[k] === '}') { d--; if (!d) break; } }
  return all.slice(i, k + 1);
}
function constLine(name) {
  const line = all.split('\n').find(l => l.trimStart().startsWith('const ' + name));
  if (!line) throw new Error(name + ' not found');
  return line;
}

const sb = { console, Date, JSON, Math, isNaN, String, Number, parseInt, parseFloat, Set, Array, RegExp };
sb.window = sb;
vm.createContext(sb);
vm.runInContext([
  constLine('MAX_PLAUSIBLE_HOLD_DAYS'), constLine('HIST_PAGE'),
  grab('_num'), grab('_isOpenAction'), grab('matchRoundTrips'),
  grab('consolidateRounds'), grab('splitImplausibleRounds'), grab('_suggestBuyYear'),
].join('\n'), sb);
const run = c => vm.runInContext(c, sb);

console.log('--- 直す年の提案 ---');
chk(run('_suggestBuyYear("2024-06-04","2026-06-23")') === '2026-06-04',
    '58030: 2024-06-04 → 2026-06-04 を提案する');
chk(run('_suggestBuyYear("2024-07-28","2026-07-31")') === '2026-07-28',
    '50160: 2024-07-28 → 2026-07-28 を提案する');
chk(run('_suggestBuyYear("2025-01-10","2026-06-23")') === '2026-01-10',
    '保有365日以内になる**最大の年**を採る');
chk(run('_suggestBuyYear("2024-12-30","2026-01-05")') === '2025-12-30',
    '年をまたぐ場合も正しく提案する');
chk(run('_suggestBuyYear("2020-02-29","2024-03-02")') === '2024-02-29',
    '2月29日は閏年だけを候補にする (2024 は閏年)');
chk(run('_suggestBuyYear("2020-02-29","2025-03-02")') === null,
    '2025-02-29 は存在しないので提案しない (JS は 03-01 に繰り上げる)');
chk(run('_suggestBuyYear("2020-02-29","2026-03-02")') === null,
    '365日以内に収まる閏年が無ければ提案しない (2024-02-29 は732日前)');
chk(run('_suggestBuyYear("2024-06-04","2024-06-10")') === '2024-06-04',
    'そもそも正しい日付ならそのまま');
chk(run('_suggestBuyYear(null,"2026-06-23")') === null, '壊れた入力は提案しない');
chk(run('_suggestBuyYear("2026-06-23","2024-06-04")') === null,
    '取得が決済より後なら提案しない (勝手に決めない)');

console.log('--- 「要確認」から辿れるように元の行 id を運ぶ ---');
sb.T = [
  { id: 'b1', a: 'buy',  cd: '5803', nm: 'フジクラ', sh: 100, p: 4707, dt: '2024-06-04', type: 'margin' },
  { id: 's1', a: 'sell', cd: '5803', nm: 'フジクラ', sh: 100, p: 6589, dt: '2026-06-23', type: 'margin' },
  { id: 'b2', a: 'buy',  cd: '7203', nm: 'トヨタ',   sh: 100, p: 3000, dt: '2026-09-01', type: 'spot' },
  { id: 's2', a: 'sell', cd: '7203', nm: 'トヨタ',   sh: 100, p: 3100, dt: '2026-09-08', type: 'spot' },
];
const rounds = run('matchRoundTrips(T)');
chk(rounds.length === 2, `往復が2件できる (${rounds.length})`);
chk(rounds[0].buy_id === 'b1' && rounds[0].sell_id === 's1', '取得と決済の行 id を運ぶ');
const split = run('splitImplausibleRounds(consolidateRounds(matchRoundTrips(T)))');
chk(split.review.length === 1 && split.ok.length === 1, '要確認1件・公開対象1件');
chk(split.review[0].buy_id === 'b1',
    '要確認の行から取得行 id に到達できる (これが無いと直せない)');
chk(split.review[0].sell_id === 's1', '決済行 id も運ぶ (往復まとめて消すため)');

console.log('--- 統合しても id が消えない ---');
sb.T2 = [
  { id: 'x1', a: 'buy',  cd: '7011', sh: 100, p: 4820, dt: '2026-04-07', type: 'spot' },
  { id: 'x2', a: 'buy',  cd: '7011', sh: 200, p: 4390, dt: '2026-04-07', type: 'spot' },
  { id: 'y1', a: 'sell', cd: '7011', sh: 300, p: 4714, dt: '2026-04-23', type: 'spot' },
];
const con = run('consolidateRounds(matchRoundTrips(T2))');
chk(con.length === 1, `同一 (code, 取得日) が1行に統合される (${con.length})`);
chk(con[0].buy_id != null, '統合後も取得行 id が残る');
chk(con[0].shares === 300, `株数が合算される (${con[0].shares})`);

console.log('--- UI: その場で直す / 消す ---');
chk(HTML.includes('fixReviewRow(') && HTML.includes('✏️ 取得日を直す'),
    '要確認の行に「取得日を直す」ボタンがある');
chk(HTML.includes('deleteReviewRound(') && HTML.includes('🗑 この往復を消す'),
    '要確認の行に「この往復を消す」ボタンがある');
const rjs = grab('renderJournalStatus');
chk(rjs.includes('fixReviewRow') && rjs.includes('deleteReviewRound'),
    'ボタンは要確認の描画から出る (履歴を辿らせない)');
chk(rjs.includes('_suggestBuyYear'), '提案する年をボタンのラベルに出す');

console.log('--- 30件の壁を外した ---');
chk(run('HIST_PAGE') === 30, '既定は直近30件のまま');
chk(all.includes('function toggleHistAll()'), '全件表示のトグルがある');
const rth = grab('rTH');
chk(rth.includes('_histShowAll') && !rth.includes('.slice(0,30)'),
    '30件で固定的に切らない');
chk(rth.includes('残り') && rth.includes('件も表示'), '残り件数を出して気づけるようにする');

console.log('--- 規律: 消す操作は確認を取る ---');
const del = grab('deleteReviewRound');
chk(del.includes('confirm(') && del.includes('元に戻せません'), '削除前に確認する');
chk(del.includes('sv(KT'), '保存する');
const fix = grab('fixReviewRow');
chk(fix.includes('confirm(') && fix.includes('editTradeRow'),
    '提案を断ったら自分で入力できる');

console.log('--- 構文 ---');
scripts.forEach((src, i) => {
  try { new vm.Script(src); } catch (e) { chk(false, `inline <script> #${i}: ${e.message}`); }
});
chk(true, `inline <script> ${scripts.length} 本の構文OK`);

console.log(bad ? `\nRESULT: ${bad} NG` : '\nRESULT: OK');
process.exit(bad ? 1 : 0);
