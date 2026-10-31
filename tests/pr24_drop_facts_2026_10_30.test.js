/**
 * 押し目カードに「なぜ下げたか・どう下げたか・注目の印」を出す (2026-10-30・stock-checker の drop_facts)。
 *
 *   node tests/pr24_drop_facts_2026_10_30.test.js
 *
 * バックエンドは brief.drop_facts に行の配列を入れる (flag OFF の間はキーが無い)。
 */
const fs = require('fs'), vm = require('vm');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...HTML.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let bad = 0;
const chk = (ok, label) => { console.log(`  ${ok ? 'OK  ' : 'NG  '}${label}`); if (!ok) bad++; };
scripts.forEach((src, i) => {
  try { new vm.Script(src); } catch (e) { chk(false, `inline <script> #${i} 構文エラー: ${e.message}`); }
});
const all = scripts.join('\n');
function grab(name) {
  const i = all.indexOf(`function ${name}(`);
  if (i < 0) throw new Error(`${name} not found`);
  let d = 0, k = all.indexOf('{', i);
  for (; k < all.length; k++) { if (all[k] === '{') d++; else if (all[k] === '}') { d--; if (!d) break; } }
  return all.slice(i, k + 1);
}
const sb = { console, window: {}, Date, document: { getElementById: () => null } };
vm.createContext(sb);
vm.runInContext([grab('_escape'), grab('_safeUrl'), grab('_marginAlertHtml'), grab('_dropFactsHtml'),
                 'const AI_SECTION_LABELS = {};', grab('_aiCardHtml'), grab('_renderPullbackCard'),
                 'function isShortlisted() { return false; }'].join('\n'), sb);
const run = c => vm.runInContext(c, sb);

console.log('--- なぜ・どう下げたか の欄 ---');
sb.c = { code: '68570', ticker: '6857', name: 'アドバンテスト', brief: {
  one_liner: 'x',
  drop_facts: [
    '🔎 なぜ下げたか (押しの期間 10/14〜10/30・12 営業日)',
    '  10/28 決算 (2Q)・10/28 業績予想の修正 (営業利益の会社予想を引き下げ -12%)',
    '📉 どう下げたか: 押しの間の 1 日平均の売買代金は、その前の 60 営業日の 1.8 倍 (多めの商いでの下げ)',
    '📣 注目の印: 10/30 に +3.1%・出来高はふだん (前の 20 日平均) の 2.4 倍 <b>x</b>',
    '※ 研究 (米国など) では … 日本株・このアプリでは未検証です。売買の推奨ではありません。',
  ] } };
const html = run('_renderPullbackCard(c)');
chk(html.includes('🔎 なぜ下げたか (押しの期間 10/14〜10/30'), '見出しが出る');
chk(html.includes('営業利益の会社予想を引き下げ -12%'), 'バックエンドの文言をそのまま出す');
chk(html.includes('📉 どう下げたか') && html.includes('📣 注目の印'), 'どう下げたか・注目の印');
chk(html.includes('未検証です'), '未検証の断り書きが出る');
chk(!html.includes('<b>x</b>'), 'エスケープする');
chk(html.indexOf('🔎 なぜ下げたか') > html.indexOf('寄り付きの飛び') || !html.includes('寄り付きの飛び'),
    '寄り付きの飛びの後に置く');
sb.c2 = { code: '72030', ticker: '7203', name: 'トヨタ', brief: { one_liner: 'x' } };
chk(!run('_renderPullbackCard(c2)').includes('なぜ下げたか'), 'キーが無ければ欄ごと出さない (flag OFF の間)');
sb.c3 = { code: '72030', ticker: '7203', name: 'トヨタ', brief: { one_liner: 'x', drop_facts: [] } };
chk(!run('_renderPullbackCard(c3)').includes('なぜ下げたか'), '空の配列でも出さない');

console.log(bad ? `\n❌ ${bad} 件 NG` : '\n✅ すべて OK');
process.exit(bad ? 1 : 0);
