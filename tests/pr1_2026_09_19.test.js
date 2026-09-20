/**
 * 2026-09-19 監査で直した表示の回帰テスト。
 *
 *   node tests/pr1_2026_09_19.test.js
 *
 * - 💡買い候補セクションの撤去 (🏆比較が未宣言の `pick` で必ず落ちていた。
 *   中身は井村流の部分集合で、決算・需給・モメンタムの欄も全件空だった)
 * - 🎁優待が当日キャッシュ経路で描画されず「読み込み中…」のままだった
 * - 優待の「廃止/中止の開示」が、権利月未登録という理由で黙って消えていた
 * - マクロ時刻: バックエンドが +09:00 付きで書くようになったので表示を整える
 * - 🤝売買判断: プロンプトが「経過日数から」判断を求めるのに保有開始日を渡していなかった
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

// DOM は getElementById だけのスタブ。id ごとに innerHTML / textContent を覚える。
const els = {};
const doc = { getElementById: id => (els[id] = els[id] || { innerHTML: '', textContent: '' }) };
const sb = { console, window: {}, Date, document: doc };
vm.createContext(sb);
vm.runInContext([
  'const MACRO_STALE_HOURS = 72;',
  grab('_escape'), grab('_safeUrl'), grab('_fmtEvalAt'), grab('_macroAgeHours'),
  grab('renderYutai'), grab('_renderYutaiCard'),
].join('\n'), sb);
const run = c => vm.runInContext(c, sb);

// ════════════════════════════════════════════════════════════
console.log('--- 💡買い候補の撤去 ---');
for (const name of ['compareCandidates', 'renderCandidates', 'renderCandidatesFromCache',
                    'analyzeCandidate', '_renderCandidateCard', '_renderAIResult', 'copyOrderInfo']) {
  chk(!all.includes(name), `${name} の定義も呼び出しも残っていない`);
}
chk(!HTML.includes('id="compareBtn"') && !HTML.includes('id="dcandidates"') && !HTML.includes('id="cashFilter"'),
    '買い候補の DOM (比較ボタン / 一覧 / 残金フィルタ) が無い');
chk(!all.includes('_watchlistData'), 'limit_watchlist のキャッシュ変数が残っていない');
chk(!all.includes("_fetchJSON('limit_watchlist.json')"), 'limit_watchlist.json を取りに行かない');
chk(all.includes('function toggleChart('), '保有カードの📈チャート (toggleChart) は残す');

// ════════════════════════════════════════════════════════════
console.log('--- 優待: キャッシュ経路でも描画する ---');
const lmr = grab('loadMorningReports');
const cacheBlock = lmr.slice(lmr.indexOf("localStorage.getItem('tj_reports_cache')"), lmr.indexOf('if (!forceRefresh'));
chk(/const \{[^}]*\byutai\b[^}]*\} = cached/.test(cacheBlock), 'キャッシュから yutai を取り出す');
chk(cacheBlock.includes('renderYutai(yutai)'), '起動直後のキャッシュ描画で renderYutai を呼ぶ');
const sameDay = lmr.slice(lmr.indexOf('if (!forceRefresh'), lmr.indexOf('try {', lmr.indexOf('if (!forceRefresh')));
chk(sameDay.includes('renderYutai(window._yutaiData)'), '当日キャッシュ有効の経路でも renderYutai を呼ぶ');

// ════════════════════════════════════════════════════════════
console.log('--- 優待: 廃止の開示と未登録を黙って消さない ---');
// 2026-09-18 の公開データと同じ形: 全行 schedule 空・7475 は active:false
sb.d = { as_of_date: '2026-09-18', registered_count: 3, rows: [
  { code: '74750', ticker: '7475', name: 'アルビス', active: false, schedule: {}, brief: { link: '' } },
  { code: '43740', ticker: '4374', name: 'ロボペイメント', active: true, schedule: {}, brief: {} },
  { code: '19040', ticker: '1904', name: '', active: true, schedule: {}, brief: {} },
]};
run('renderYutai(d)');
const y = els.dyutai.innerHTML;
chk(y.includes('🛑 優待の廃止/中止が開示されています'), '権利月が無くても廃止の開示は表示する');
chk(y.includes('権利確定月が未登録の銘柄') && y.includes('ロボペイメント') && y.includes('1904'),
    '未登録の銘柄を名前 (無ければコード) で明示する');
chk(!y.includes('権利確定月が登録された銘柄がありません'), 'カードがあるときは「ありません」を出さない');

sb.d2 = { as_of_date: '2026-09-18', registered_count: 1, rows: [
  { code: '43740', ticker: '4374', name: 'ロボペイメント', active: true, schedule: {}, brief: {} } ]};
run('renderYutai(d2)');
chk(els.dyutai.innerHTML.includes('権利確定月が登録された銘柄がありません') &&
    els.dyutai.innerHTML.includes('ロボペイメント'), '全件未登録なら「ありません」+ 未登録の内訳');

sb.d3 = { as_of_date: '2026-09-18', registered_count: 1, rows: [
  { code: '81360', ticker: '8136', name: 'サンリオ', active: true,
    schedule: { last_buy_date: '2026-09-26', business_days_left: 3 }, brief: { schedule: '権利付最終日 9/26' } } ]};
run('renderYutai(d3)');
chk(els.dyutai.innerHTML.includes('サンリオ') && els.dyutai.innerHTML.includes('あと3日'), '日付がある行は従来どおり');
chk(!/おすすめ|狙い目|買うべき|買い推奨/.test(grab('renderYutai')), '推奨の語を足していない');

// ════════════════════════════════════════════════════════════
console.log('--- マクロ時刻 ---');
chk(run('_fmtEvalAt("2026-09-24T10:23+09:00")') === '2026-09-24 10:23', '+09:00 付きを「YYYY-MM-DD HH:MM」で出す');
chk(run('_fmtEvalAt("2026-09-18T01:23")') === '2026-09-18 01:23', '旧形式もそのまま出す');
chk(run('_fmtEvalAt(null)') === '', 'null は空文字');
const aware = run('_macroAgeHours("2026-09-24T10:23+09:00")');
const expect = (Date.now() - Date.parse('2026-09-24T01:23:00Z')) / 3600000;
chk(Math.abs(aware - expect) < 0.01, '+09:00 付きはオフセットどおりに経過時間を数える (JST 10:23 = UTC 01:23)');
chk(grab('renderMacro').includes('_fmtEvalAt(d.evaluated_at)'), 'renderMacro が表示用に整形している');

// ════════════════════════════════════════════════════════════
console.log('--- 🤝売買判断に保有開始日を渡す ---');
const ah = grab('analyzeHolding');
chk(ah.includes("'保有開始日: '+h.dt"), 'プロンプトに保有開始日を入れる');
chk(ah.includes('保有開始日: 不明'), '開始日が無いときは「不明」と明示する (黙って落とさない)');

// ════════════════════════════════════════════════════════════
//  レビュー指摘の修正: 保有スクショの dt は「取込日」であって建日ではない
// ════════════════════════════════════════════════════════════
console.log('--- 建日が分からない保有を「保有開始日」と言わない ---');
vm.runInContext([grab('_num'), grab('_normType'), grab('_isOpenAction'), grab('positionPnl'),
                 grab('applyHoldImport'), grab('applyHistImport')].join('\n'), sb);
sb.TODAY = '2026-09-20';
// 画面A (保有証券リスト) 相当: 建日が無い
const r1 = run("applyHoldImport([], [{code:'8136', name:'サンリオ', shares:100, current_price:1200}], {})");
chk(r1.H[0].dt === '2026-09-20' && r1.H[0].dt_unknown === true, '建日が読めない保有は dt_unknown=true');
// 画面C (詳細) 相当: 建日が読めた
const r2 = run("applyHoldImport([], [{code:'8136', shares:100, buy_price:1100, current_price:1200, buy_date:'2026-09-01'}], {})");
chk(r2.H[0].dt === '2026-09-01' && r2.H[0].dt_unknown === false, '建日が読めた保有は dt_unknown=false');
// 後から建日が読めたら印を消す
const r3 = run("applyHoldImport(" + JSON.stringify(r1.H) + ", [{code:'8136', shares:100, buy_price:1100, buy_date:'2026-09-01'}], {})");
chk(r3.H[0].dt === '2026-09-01' && r3.H[0].dt_unknown === false, '再取込で建日が読めたら印を消す');
// 約定履歴の取込は約定日が事実
const r4 = run("applyHistImport([], [], 0, [{code:'8136', action:'buy', shares:100, price:1100, date:'2026-09-02'}])");
chk(r4.H[0].dt === '2026-09-02' && r4.H[0].dt_unknown === false, '約定履歴からの建玉は dt が事実');

const ah2 = grab('analyzeHolding');
chk(ah2.includes('ymdJST()') && !ah2.includes('Date.parse(TODAY)'),
    '経過日数は読み込み時の TODAY でなく、その場の JST 日付で数える');
chk(ah2.includes('_hd >= 0') && ah2.includes('_hd <= 3650'), '未来日・桁違いの日付は経過日数にしない');
chk(ah2.includes('!h.dt_unknown'), 'dt_unknown の保有は経過日数を主張しない');
chk(ah2.includes('実際の建日ではありません'), '取込日であることを AI に明示する');

// ════════════════════════════════════════════════════════════
//  井村流セクションの鮮度表示 (このレーンだけ日付が出ていなかった)
// ════════════════════════════════════════════════════════════
console.log('--- 井村流の鮮度表示 ---');
const rcb = grab('renderCandidateBrief');
chk(rcb.includes('generated_at'), '生成日を読む');
chk(rcb.includes('週次更新が止まっている可能性'), '古いときは警告を出す');
chk(rcb.includes('生成日が不明'), '生成日が無いときも黙って通さない');
chk(rcb.includes('ymdJST()'), '当日日付はその場で取る (読み込み時の定数を使わない)');

// ════════════════════════════════════════════════════════════
console.log('--- 構文 ---');
scripts.forEach((src, i) => {
  try { new vm.Script(src); } catch (e) { chk(false, `inline <script> #${i} 構文エラー: ${e.message}`); }
});
chk(true, `inline <script> ${scripts.length} 本の構文OK`);

console.log(bad ? `\nRESULT: ${bad} NG` : '\nRESULT: OK');
process.exit(bad ? 1 : 0);
