/**
 * 押し目×決算セクションの表示ロジックの回帰テスト。
 *
 *   node tests/pullback.test.js
 *
 * index.html はビルド無しの単一ファイルなので、インライン <script> から純粋関数を
 * 取り出して vm で評価する (tests/import.test.js と同じ作法)。
 */
const fs = require('fs'), vm = require('vm');
const HTML = fs.readFileSync('C:/Users/hayak/OneDrive/Desktop/trade-journal/index.html', 'utf8');
const scripts = [...HTML.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);

// ① 全インライン script の構文チェック
let bad = 0;
const chk = (ok, label) => { console.log(`  ${ok ? 'OK  ' : 'NG  '}${label}`); if (!ok) bad++; };
scripts.forEach((src, i) => {
  try { new vm.Script(src); chk(true, `inline <script> #${i} 構文OK (${src.length}字)`); }
  catch (e) { chk(false, `inline <script> #${i} 構文エラー: ${e.message}`); }
});

const all = scripts.join('\n');
function grab(name) {
  const i = all.indexOf(`function ${name}(`);
  if (i < 0) throw new Error(`${name} not found`);
  let d = 0, k = all.indexOf('{', i);
  for (; k < all.length; k++) { if (all[k] === '{') d++; else if (all[k] === '}') { d--; if (!d) break; } }
  return all.slice(i, k + 1);
}
const sb = { console, window: {} };
vm.createContext(sb);
vm.runInContext([grab('_escape'), grab('_breadthLine'), grab('_pullbackFactsFor')].join('\n'), sb);
const run = c => vm.runInContext(c, sb);

console.log('--- _breadthLine ---');
sb.b1 = {window:20, n_days:17, today_candidates:16, today_passed:28,
         median_candidates:31, min_candidates:16, max_candidates:56, rank_from_low:1};
const l1 = run('_breadthLine(b1)');
chk(l1.includes('直近17営業日') && l1.includes('中央値 31件') && l1.includes('幅 16〜56件'), `分布を出す: ${l1.replace(/<[^>]*>/g,'')}`);
chk(l1.includes('今日は 16件（少ない順で 1/17番目）'), '今日の位置を出す');
chk(!/狙い目|買い|有利|不利|割安|チャンス/.test(l1), '方向を示す語を含まない');
chk(run('_breadthLine(null)') === '', 'breadth 無しは空文字');
chk(run('_breadthLine({n_days:2, median_candidates:1, min_candidates:1, max_candidates:1, today_candidates:1, rank_from_low:1})') === '', '履歴2日以下は非表示');

console.log('--- _pullbackFactsFor ---');
sb.window._pullbackData = { as_of_date: '2026-08-26', candidates: [
  {code:'81360', ticker:'8136', name:'サンリオ', price:1210, as_of:'2026-08-26',
   pullback:{drawdown_60d_pct:17.7, ma25_dev_pct:-3.1, ma75_dev_pct:13.5, rsi14:49.52,
             bb_pct_b:0.33, atr:77.57, vol_ratio:0.46}} ] };
const f = run('_pullbackFactsFor("8136")');
chk(f != null, '4桁 ticker で引ける');
chk(f.asOf === '2026-08-26', `as_of を返す (実測 ${f && f.asOf})`);
chk(f.lines.join('|').includes('RSI14: 49.52') && f.lines.join('|').includes('60日高値からの下落率: 17.7%'),
    `実数をそのまま並べる: ${f.lines.slice(0,3).join(' / ')}`);
chk(run('_pullbackFactsFor("81360")') != null, '5桁 code でも引ける');
chk(run('_pullbackFactsFor("7203")') === null, '候補外は null (Web検索フォールバック)');
chk(run('_pullbackFactsFor("")') === null, '空コードは null');
sb.window._pullbackData = { candidates: [{code:'11110', ticker:'1111', name:'X', price:null, as_of:'2026-08-26', pullback:{}}] };
const f2 = run('_pullbackFactsFor("1111")');
chk(f2.lines.every(x => !/null|undefined|NaN/.test(x)), `欠損は「未取得」表記: ${f2.lines[0]} / ${f2.lines[4]}`);

console.log('--- examineChartAnalysis のプロンプト構築 ---');
const src = grab('examineChartAnalysis');
chk(src.includes('factsBlock'), 'facts をプロンプトに載せている');
chk(src.includes('これに反する数値や、ここに無い数値の創作は禁止'), '創作禁止の指示がある');
chk(src.includes('検索由来'), '候補外は検索由来と明示する指示がある');
chk(!/買うべき|狙い目である/.test(src.replace(/「買い\/売り\/買うべき\/狙い目」/g,'')), '売買推奨の語を出力側に持たない');

console.log('--- カードの鮮度表示 ---');
const card = grab('_renderPullbackCard');
chk(card.includes('🆕 今日が初日') && card.includes('営業日連続'), '🆕 / 🔁 の両方がある');
chk(!card.includes("_escape(String(c.streak)) + '日連続"), '旧「N日連続」ラベルが残っていない');

console.log(bad ? `\nRESULT: NG (${bad})` : '\nRESULT: OK');
process.exitCode = bad ? 1 : 0;
