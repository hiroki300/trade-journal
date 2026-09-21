/**
 * 2026-09-20 の記録方針の変更に伴う回帰テスト。
 *
 *   node tests/pr2_2026_09_20.test.js
 *
 * 方針: 保有は毎回スクショ→自動公開 / 決済は月1回まとめて約定履歴から取込。
 * ここで守るのは「記録が静かに壊れない」ための4点:
 *   1. FIFO のロットを 1ポジション=1要素へ統合する (件数の水増し = CI が狭く出る)
 *   2. 保有期間1年超 (年の入力ミス) を採点から外し、画面に出す
 *   3. 保有から消えた建玉を「決済の記録待ち」として覚える (負けが黙って消えない)
 *   4. 約定履歴の「履歴のみ」取込で、保有と残金を二重計上しない
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

// localStorage スタブ (pending exits が読み書きする)
const store = {};
const localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
const sb = { console, window: {}, Date, localStorage, TODAY: '2026-09-20',
             document: { getElementById: () => null } };
vm.createContext(sb);
vm.runInContext([
  grab('_num'), grab('_normType'), grab('_isOpenAction'), grab('positionPnl'),
  grab('typeLabel'), grab('_noteReasonSuffix'), grab('getSkips'),
  grab('matchRoundTrips'), grab('consolidateRounds'), grab('splitImplausibleRounds'),
  grab('getPendingExits'), grab('setPendingExits'), grab('addPendingExits'), grab('clearPendingExitsFor'),
  grab('applyHoldImport'), grab('applyHistImport'),
  'const MAX_PLAUSIBLE_HOLD_DAYS = 365;',
].join('\n'), sb);
const run = c => vm.runInContext(c, sb);

// ════════════════════════════════════════════════════════════
console.log('--- FIFO のロットを 1ポジション=1要素へ統合 ---');
// 同じ日に 2 回に分けて買い、後日 2 回に分けて売った = 判断としては 1 ポジション
sb.T1 = [
  {a: 'buy',  cd: '7011', nm: 'X', sh: 100, p: 4820, dt: '2026-07-01', type: 'spot'},
  {a: 'buy',  cd: '7011', nm: 'X', sh: 100, p: 4390, dt: '2026-07-01', type: 'spot'},
  {a: 'sell', cd: '7011', nm: 'X', sh: 100, p: 4700, dt: '2026-07-10', type: 'spot'},
  {a: 'sell', cd: '7011', nm: 'X', sh: 100, p: 4800, dt: '2026-07-14', type: 'spot'},
];
const rounds = run('matchRoundTrips(T1)');
chk(rounds.length === 2, `FIFO は 2 行を出す (実測 ${rounds.length})`);
sb.R1 = rounds;
const merged = run('consolidateRounds(R1)');
chk(merged.length === 1, `統合すると 1 行 (実測 ${merged.length})`);
chk(merged[0].shares === 200, `株数は合算 (実測 ${merged[0].shares})`);
chk(Math.abs(merged[0].buy_price - 4605) < 0.01, `建値は株数加重平均 (実測 ${merged[0].buy_price})`);
chk(Math.abs(merged[0].sell_price - 4750) < 0.01, `決済値も株数加重平均 (実測 ${merged[0].sell_price})`);
chk(merged[0].sell_date === '2026-07-14', '決済日は最後の決済日');

// 建てた日が違えば別ポジション
sb.R2 = [
  {code: '5016', type: 'spot', buy_date: '2026-08-04', sell_date: '2026-08-05', buy_price: 3800, sell_price: 4136, shares: 100},
  {code: '5016', type: 'spot', buy_date: '2026-08-13', sell_date: '2026-08-18', buy_price: 3882, sell_price: 4070, shares: 100},
];
chk(run('consolidateRounds(R2)').length === 2, '建てた日が違えば統合しない');
// 現物と信用は別建玉
sb.R3 = [
  {code: '5016', type: 'spot',   buy_date: '2026-08-04', sell_date: '2026-08-05', buy_price: 3800, sell_price: 4136, shares: 100},
  {code: '5016', type: 'margin', buy_date: '2026-08-04', sell_date: '2026-08-05', buy_price: 3800, sell_price: 4136, shares: 100},
];
chk(run('consolidateRounds(R3)').length === 2, '現物と信用は統合しない');

// ════════════════════════════════════════════════════════════
console.log('--- 年の入力ミス (保有1年超) を採点から外す ---');
sb.R4 = [
  {code: '5803', type: 'spot', buy_date: '2024-06-04', sell_date: '2026-06-23', buy_price: 4707, sell_price: 6589, shares: 100},
  {code: '5803', type: 'spot', buy_date: '2026-06-09', sell_date: '2026-06-29', buy_price: 4444, sell_price: 5920, shares: 100},
];
const sp = run('splitImplausibleRounds(R4)');
chk(sp.ok.length === 1 && sp.review.length === 1, '1年超は review 側へ');
chk(sp.review[0].hold_days > 700, `保有日数を付ける (実測 ${sp.review[0].hold_days})`);
chk(sp.ok[0].hold_days === 20, `正常な行にも日数が付く (実測 ${sp.ok[0].hold_days})`);
sb.R5 = [{code: 'X', type: 'spot', buy_date: '', sell_date: '', buy_price: 1, sell_price: 1, shares: 1}];
chk(run('splitImplausibleRounds(R5)').ok.length === 1, '日付が読めない行は落とさない (fail-open)');

// ════════════════════════════════════════════════════════════
console.log('--- 決済の記録待ち ---');
run("setPendingExits([])");
run("addPendingExits([{cd:'6862', nm:'ミナト', sh:100, bp:2180, dt:'2026-06-29', type:'spot'}], '2026-08-04')");
let pend = run('getPendingExits()');
chk(pend.length === 1 && pend[0].code === '6862' && pend[0].noticed_on === '2026-08-04',
    '保有から消えた建玉を覚える');
run("addPendingExits([{cd:'6862', nm:'ミナト', sh:100, bp:2180, dt:'2026-06-29', type:'spot'}], '2026-08-05')");
chk(run('getPendingExits()').length === 1, '同じ建玉は二重に増えない');
run("clearPendingExitsFor([{code:'6862', action:'sell', type:'spot'}])");
chk(run('getPendingExits()').length === 0, '約定履歴の売りを取り込んだら消える');
run("setPendingExits([]); addPendingExits([{cd:'5802', nm:'Y', sh:300, bp:2520, dt:'2026-08-18', type:'margin_short'}], '2026-09-11')");
run("clearPendingExitsFor([{code:'5802', action:'sell', type:'margin_short'}])");
chk(run('getPendingExits()').length === 1, '信用売建は「売り」では消えない (返済買で消える)');
run("clearPendingExitsFor([{code:'5802', action:'buy', type:'margin_short'}])");
chk(run('getPendingExits()').length === 0, '信用売建は返済買で消える');

// ════════════════════════════════════════════════════════════
console.log('--- 約定履歴の「履歴のみ」取込 ---');
const H0 = [{cd: '8136', nm: 'S', sh: 100, bp: 1195, cp: 1200, type: 'spot'}];
sb.H0 = H0;
sb.items = [{code: '8136', action: 'buy', shares: 100, price: 1195, date: '2026-08-12', type: 'spot'}];
const normal = run('applyHistImport(H0, [], 200000, items)');
chk(normal.H[0].sh === 200 && normal.cash === 200000 - 119500,
    `通常モードは保有と残金を動かす (従来どおり。実測 sh=${normal.H[0].sh} cash=${normal.cash})`);
const only = run('applyHistImport(H0, [], 200000, items, {touchHoldings: false})');
chk(only.H[0].sh === 100 && only.cash === 200000, '履歴のみモードは保有も残金も動かさない');
chk(only.T.length === 1 && only.T[0].p === 1195, '取引ログには入る');
const dup = run('applyHistImport(H0, ' + JSON.stringify(only.T) + ', 200000, items, {touchHoldings: false})');
chk(dup.T.length === 1 && dup.skipped.length === 1, '同じ約定の再取込は重複として弾く');

// ════════════════════════════════════════════════════════════
console.log('--- 撤去したもの (実データで常に空だった) ---');
for (const name of ['renderTaxAfterSummary', 'buildTaxAfterSummary', 'renderDriftSummary',
                    'renderTagPerformance', 'renderAIAccuracy', 'getLossPatternInjection',
                    'getDriftPromptInjection', 'lookupAIRecommendationByCode',
                    'buildExecutionMetaOnBuy', 'recordSkipWeek', 'TAG_PRESETS', '_selectedTags']) {
  chk(!all.includes(name), `${name} が残っていない`);
}
chk(!HTML.includes('id="dpnl"') && !HTML.includes('id="ddrift"') &&
    !HTML.includes('id="dtags"') && !HTML.includes('id="daiacc"'), '市場タブの記録系4セクションが無い');
chk(!/t\.execution_meta\s*=|updatedCount/.test(grab('exportAllData')),
    'バックアップが過去の取引に今日の推奨を書き込まない');

// ════════════════════════════════════════════════════════════
console.log('--- 取込後の自動公開と画面の状態表示 ---');
const di = grab('doImport');
chk(di.includes('maybeAutoPublish()'), '保有/約定の取込後に自動公開する');
chk(di.includes('addPendingExits(wetRun.removed'), '消した建玉を記録待ちに積む');
chk(di.includes('clearPendingExitsFor(checked)'), '取り込んだ売りで記録待ちを消す');
chk(di.includes('touchHoldings: !histOnly'), '履歴のみチェックボックスを見る');
chk(grab('maybeAutoPublish').includes("localStorage.getItem('tj_ghpat')"),
    'PAT が無ければ自動公開しない (催促もしない)');
const pl = grab('_buildHumanPaperTradesPayload');
chk(pl.includes('consolidateRounds') && pl.includes('splitImplausibleRounds'),
    'export が統合と要確認の切り分けを通る');
chk(pl.includes('pending_exits') && pl.includes('shares'), 'payload に記録待ちと株数が入る');

// ════════════════════════════════════════════════════════════
console.log('--- 構文 ---');
scripts.forEach((src, i) => {
  try { new vm.Script(src); } catch (e) { chk(false, `inline <script> #${i} 構文エラー: ${e.message}`); }
});
chk(true, `inline <script> ${scripts.length} 本の構文OK`);

console.log(bad ? `\nRESULT: ${bad} NG` : '\nRESULT: OK');
process.exit(bad ? 1 : 0);
