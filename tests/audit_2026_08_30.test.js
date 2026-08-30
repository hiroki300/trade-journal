/**
 * 2026-08-30 のデータ監査で入れた表示変更の回帰テスト。
 *
 *   node tests/audit_2026_08_30.test.js
 *
 * index.html はビルド無しの単一ファイルなので、インライン <script> から純粋関数を
 * 取り出して vm で評価する (tests/pullback.test.js と同じ作法)。
 */
const fs = require('fs'), vm = require('vm');
const HTML = fs.readFileSync('C:/Users/hayak/OneDrive/Desktop/trade-journal/index.html', 'utf8');
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

const sb = { console, window: {}, Date, document: { getElementById: () => null } };
vm.createContext(sb);
vm.runInContext([
  'const MACRO_STALE_HOURS = 72;',
  grab('_escape'), grab('_safeUrl'), grab('_macroAgeHours'), grab('_renderYutaiCard'),
].join('\n'), sb);
const run = c => vm.runInContext(c, sb);

// ════════════════════════════════════════════════════════════
//  マクロの鮮度表示
//
//  公開 macro_state.json が 2026-06-03 の版に毎日巻き戻っていたのに、
//  PWA は日付を一切出さないので気づけなかった。必ず「いつの値か」を出す。
// ════════════════════════════════════════════════════════════
console.log('--- マクロの鮮度 ---');
const macroSrc = grab('renderMacro');
chk(macroSrc.includes('evaluated_at'), 'evaluated_at を読んでいる');
chk(macroSrc.includes('時点'), 'as-of を必ず表示する');
chk(macroSrc.includes('MACRO_STALE_HOURS'), '鮮度のしきい値を持つ');
chk(/更新が止まっている/.test(macroSrc), '古いときは警告文を出す');
chk(macroSrc.includes('評価時刻が不明'), 'evaluated_at 欠損も警告する (黙って通さない)');

const hNow = run('_macroAgeHours(new Date(Date.now() - 3600000).toISOString())');
chk(hNow > 0.9 && hNow < 1.1, `1時間前を約1時間と数える (${hNow.toFixed(2)}h)`);
chk(run('_macroAgeHours(null)') === null, 'null は null');
chk(run('_macroAgeHours("zzz")') === null, 'パース不能は null');
// 実際に踏んだ値: 2026-06-03T12:48 (オフセット無し) を JST として解釈できること
chk(run('_macroAgeHours("2026-06-03T12:48")') > 24 * 60, 'オフセット無しでも JST として解釈できる');

// ════════════════════════════════════════════════════════════
//  押し目カード: 当日の動き / 権利落ち / 並び替え
// ════════════════════════════════════════════════════════════
console.log('--- 押し目カードの新ブロック ---');
const card = grab('_renderPullbackCard');
chk(card.includes("'当日の動き'"), '「当日の動き」ブロックがある (前日比/陰陽/転換の根拠)');
chk(card.includes('b.turn'), 'brief.turn を読んでいる');
chk(card.includes('exDateHtml') && card.includes('b.ex_date'), '権利落ち警告を出す');
chk(card.indexOf('const exDateHtml') < card.indexOf('exDateHtml +'),
    'exDateHtml は使用前に定義されている (TDZ 事故の防止)');

console.log('--- 並び替え ---');
const rp = grab('renderPullback');
chk(rp.includes('_pullbackSort'), '並び替えの状態を持つ');
chk(rp.includes('drawdown_60d_pct'), '「深い順」も選べる');
chk(all.includes("let _pullbackSort = 'turn'"),
    '既定は転換順 (バックエンドの順そのまま = 事実の階層)');
const toggle = grab('togglePullbackSort');
chk(toggle.includes('renderPullbackFromCache'), 'トグルで再描画する');
chk(!/おすすめ|狙い目|買うべき/.test(rp), '並び替えラベルに推奨の語が無い');

// ════════════════════════════════════════════════════════════
//  優待セクション
// ════════════════════════════════════════════════════════════
console.log('--- 優待セクション ---');
const ry = grab('renderYutai');
chk(ry.includes('yutai') || ry.includes('dyutai'), 'dyutai へ描画する');
chk(ry.includes('registered_count'), '登録件数を出す');
chk(ry.includes('schedule.last_buy_date') || ry.includes('r.schedule'),
    '権利付最終日を持つ行だけ出す');
chk(!/おすすめ|狙い目|買うべき|買い推奨/.test(ry + grab('_renderYutaiCard')),
    '優待セクションに推奨の語が無い');
chk(HTML.includes('おすすめ順ではありません'), '「おすすめ順ではない」と明記している');
chk(HTML.includes('権利落ち日'), '権利落ちで下がることを説明している');

sb.row = {
  code: '81360', ticker: '8136', name: 'サンプル商事', active: true,
  schedule: { last_buy_date: '2026-09-28', business_days_left: 2 },
  brief: { schedule: '権利付最終日 2026-09-28 (あと2営業日)', benefit: '自社商品 3,000円相当',
           facts: '株価 2,100円', warning: '⚠️ 権利落ち日に配当ぶん 約-2.48%',
           link: 'https://kabutan.jp/stock/?code=8136' },
};
const html1 = run('_renderYutaiCard(row)');
chk(html1.includes('サンプル商事') && html1.includes('あと2日'), 'カードに残り日数を出す');
chk(html1.includes('自社商品 3,000円相当'), '登録された優待内容をそのまま出す');
chk(html1.includes('権利落ち'), '権利落ちの警告を出す');

sb.row2 = { ...sb.row, active: false, name: '廃止された会社' };
const html2 = run('_renderYutaiCard(row2)');
chk(html2.includes('廃止/中止'), '廃止 (改悪) を目立たせる');

sb.row3 = { code: '11110', ticker: '1111', name: 'X', active: true, schedule: {},
            brief: { benefit: '優待内容は未登録 (会社IRでご確認ください)', link: '' } };
const html3 = run('_renderYutaiCard(row3)');
chk(html3.includes('未登録'), '未登録の優待内容を創作せず「未登録」と出す');
chk(!/null|undefined|NaN/.test(html3), '欠損で null/undefined を描画しない');
chk(html3.includes('kabutan.jp'), 'link 欠損時も安全な fallback URL になる');

// ════════════════════════════════════════════════════════════
//  構文チェック (単一ファイルなので壊すと全部止まる)
// ════════════════════════════════════════════════════════════
console.log('--- 構文 ---');
scripts.forEach((src, i) => {
  try { new vm.Script(src); chk(true, `inline <script> #${i} 構文OK (${src.length}字)`); }
  catch (e) { chk(false, `inline <script> #${i} 構文エラー: ${e.message}`); }
});

console.log(bad ? `\nRESULT: NG (${bad})` : '\nRESULT: OK');
process.exitCode = bad ? 1 : 0;
