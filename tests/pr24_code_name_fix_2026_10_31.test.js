/**
 * 取込で銘柄名が「東証」になり、売りが記録できなかった件 (2026-10-31) の回帰テスト。
 *
 *   node tests/pr24_code_name_fix_2026_10_31.test.js
 *
 * 背景: SBI の約定履歴・損益の画面では銘柄名の横に「東証」などの市場名が出て、OCR がそれを銘柄名として
 * 返した。証券コードが読めない行は、銘柄名 (= 東証) をコードの代わりにしていたので、買いと売りが
 * 別の銘柄として記録され、売りが買いと組み合わなかった。記録の ✏️ は日付と価格しか直せず、
 * 保有の銘柄名・コードも直せなかった (ユーザー報告)。
 */
'use strict';
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
const sb = { console, TODAY: '2026-10-31' };
vm.createContext(sb);
vm.runInContext(['normStockCode', 'isValidStockCode', 'isMarketLabel', 'cleanImportItems', 'renameStockCode',
  '_num', '_normAction', '_normType', '_isOpenAction', 'positionPnl',
  'applyHoldImport', 'applyHistImport', 'applyPnlImport', 'matchRoundTrips'].map(grab).join('\n'), sb);
const run = c => vm.runInContext(c, sb);
const J = JSON.stringify;

console.log('--- 市場名と証券コードの見分け ---');
for (const s of ['東証', '東証P', '東証プライム', 'ＰＴＳ', '名証', ' 東証 ', 'プライム']) chk(run(`isMarketLabel(${J(s)})`) === true, `「${s}」は市場名`);
for (const s of ['トヨタ自動車', '東京エレクトロン', 'フジクラ', '']) chk(run(`isMarketLabel(${J(s)})`) === false, `「${s}」は市場名ではない`);
for (const s of ['7203', '247A', '７２０３', ' 581a ', '130A']) chk(run(`isValidStockCode(${J(s)})`) === true, `「${s}」は証券コード`);
for (const s of ['東証', '72O3', '720', '72030', '', null]) chk(run(`isValidStockCode(${J(s)})`) === false, `「${s}」は証券コードではない`);

console.log('--- 取込の行の点検 ---');
const items = run(`cleanImportItems(${J([{code: '７２０３', name: '東証'}, {code: '', name: '東証'}, {code: '6758', name: 'ソニーG'}])},
  c => c === '7203' ? 'トヨタ自動車' : '')`);
chk(items[0].code === '7203' && items[0].name === 'トヨタ自動車' && !items[0]._codeProblem,
    '全角のコードをそろえ、市場名の銘柄名はコードから分かる名前に置き換える');
chk(items[1]._codeProblem === true && items[1].name === '' && items[1]._marketName === true,
    'コードが読めていない行に印を付ける (銘柄名の「東証」は外す)');
chk(items[2].name === 'ソニーG' && !items[2]._codeProblem, '正しい行は変えない');

console.log('--- 約定履歴・損益の取込: コードが無い行は取り込まない ---');
const h1 = run(`applyHistImport([], [], 1000000, ${J([
  {action: 'buy', code: '', name: '東証', shares: 100, price: 1000, date: '2026-10-20', type: 'spot'},
  {action: 'buy', code: '７２０３', name: '東証', shares: 100, price: 2000, date: '2026-10-20', type: 'spot'},
])})`);
chk(h1.T.length === 1 && h1.T[0].cd === '7203', 'コードの無い行は取り込まず、全角のコードはそろえて取り込む');
chk(h1.T[0].nm === '7203', '銘柄名が市場名なら、コードを名前の代わりにする (「東証」を残さない)');
chk(h1.skipped.length === 1 && /証券コードが読めていない/.test(h1.skipped[0].reason), '取り込まなかった理由を返す');
chk(!h1.H.some(h => h.cd === '東証'), '保有に「東証」という銘柄を作らない');
const sell = run(`applyHistImport(${J(h1.H)}, ${J(h1.T)}, ${h1.cash}, ${J([
  {action: 'sell', code: '7203', name: 'トヨタ自動車', shares: 100, price: 2200, date: '2026-10-28', type: 'spot'}])})`);
const rounds = run(`matchRoundTrips(${J(sell.T)})`);
chk(rounds.length === 1 && rounds[0].buy_price === 2000 && rounds[0].sell_price === 2200, '売りが買いと組み合う');
const p1 = run(`applyPnlImport([], ${J([{code: '', name: '東証', realized_pnl: 1, shares: 100, sell_price: 1, date: '2026-10-28'},
  {code: '7203', name: '東証', realized_pnl: 5000, shares: 100, sell_price: 2100, date: '2026-10-28'}])})`);
chk(p1.T.length === 1 && p1.T[0].cd === '7203' && p1.skipped.length === 1, '損益の取込もコードの無い行は取り込まない');

console.log('--- 保有の取込 ---');
const ho = run(`applyHoldImport([], ${J([{code: '', name: '東証', shares: 100, current_price: 1000, type: 'spot'},
  {code: '', name: 'eMAXIS Slim 全世界株式', shares: 1, current_price: 30000, type: 'spot'}])}, {removeMissing: false})`);
chk(ho.H.length === 1 && ho.H[0].nm === 'eMAXIS Slim 全世界株式', '銘柄名が市場名だけの行は取り込まない (コードの無い投資信託は従来どおり)');

console.log('--- 記録のコードを直す ---');
const T0 = [{id: 1, a: 'buy', cd: '東証', nm: '東証', sh: 100, p: 1000, dt: '2026-10-20', type: 'spot'},
            {id: 2, a: 'sell', cd: '東証', nm: '東証', sh: 100, p: 1100, dt: '2026-10-28', type: 'spot'},
            {id: 3, a: 'buy', cd: '6758', nm: 'ソニーG', sh: 100, p: 3000, dt: '2026-10-20', type: 'spot'}];
const H0 = [{cd: '東証', nm: '東証', sh: 100, bp: 1000, type: 'spot', dt: '2026-10-20'},
            {cd: '7203', nm: 'トヨタ自動車', sh: 100, bp: 1200, type: 'spot', dt: '2026-10-10'}];
const r1 = run(`renameStockCode(${J(H0)}, ${J(T0)}, '東証', '7203', 'トヨタ自動車', null)`);
chk(r1.nT === 2 && r1.T.filter(t => t.cd === '7203').length === 2 && r1.T[2].cd === '6758', 'まとめて直すと、古いコードの行だけが変わる');
chk(r1.H.length === 1 && r1.H[0].sh === 200 && r1.H[0].bp === 1100 && r1.H[0].dt === '2026-10-10',
    '保有に同じ銘柄があれば 1 つにまとめる (株数を足し、買値は加重平均・取得日は古いほう)');
chk(run(`matchRoundTrips(${J(r1.T)})`).length === 1, '直した後は売りが買いと組み合う');
const r2 = run(`renameStockCode(${J(H0)}, ${J(T0)}, '東証', '9984', 'SBG', [2])`);
chk(r2.nT === 1 && r2.T[1].cd === '9984' && r2.T[0].cd === '東証' && r2.H[0].cd === '東証', '1 件だけ直すときは、その行だけ (保有も変えない)');

console.log('--- 画面と保存 ---');
const e = grab('editTradeRow');
chk(e.includes('_askCodeName(') && e.includes("prompt('株数'"), '履歴の ✏️ で証券コード・銘柄名・株数も直せる');
chk(e.includes('_renameCodeWithConfirm('), '同じ古いコードの記録がほかにもあれば、まとめて直すかを確かめる');
chk(grab('_renameCodeWithConfirm').includes('confirm('), '黙ってまとめない (別の銘柄が「東証」と読まれていることがある)');
chk(grab('_afterRecordEdit').includes('maybeAutoPublish()'), '直した記録をボットに送る');
chk(grab('hHTML').includes('editHoldCode('), '保有カードに証券コード・銘柄名を直す ✏️');
chk(grab('renderJournalStatus').includes('badCodeRecords()'), 'コードが読めていない記録を売買タブに一覧で出す');
const d = grab('doImport');
chk(d.includes('isValidStockCode(it.code)') && d.includes('confirm('), '取り込む前に、コードの無い行があれば知らせる');
chk(/東証」「東証P」「名証」「PTS」などは市場の名前/.test(all) && (all.match(/市場の名前/g) || []).length >= 3,
    '読み取りの指示 (保有・約定・損益) に「東証などは銘柄名ではない」と書く');

scripts.forEach((src, i) => { try { new vm.Script(src); } catch (err) { chk(false, `inline <script> #${i} 構文エラー: ${err.message}`); } });
console.log(bad ? `\nRESULT: ${bad} NG` : '\nRESULT: OK');
process.exit(bad ? 1 : 0);
