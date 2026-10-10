/**
 * 押し目カードに大量保有報告書の事実を出す (2026-10-10・stock-checker の large_holdings_view)。
 *
 *   node tests/pr16_large_holdings_2026_10_10.test.js
 *
 * バックエンドは brief.large_holding に「／」区切りの事実を入れる (flag OFF の間は空文字)。
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
vm.runInContext([grab('_escape'), grab('_safeUrl'), grab('_marginAlertHtml'),
                 'const AI_SECTION_LABELS = {};', grab('_aiCardHtml'), grab('_renderPullbackCard'),
                 'function isShortlisted() { return false; }'].join('\n'), sb);
const run = c => vm.runInContext(c, sb);

console.log('--- 大量保有報告書の欄 ---');
sb.c = { code: '95070', ticker: '9507', name: '四国電力', brief: {
  large_holding: '伊予鉄グループ 保有割合 12.34%→13.43%（変更の報告・10/6 時点・10/9 提出） 保有目的: 純投資／<b>x</b>',
  one_liner: '増収増益' } };
const html = run('_renderPullbackCard(c)');
chk(html.includes('大量保有報告書 (EDINET・直近90日)'), '見出しが出る');
chk(html.includes('伊予鉄グループ 保有割合 12.34%→13.43%'), 'バックエンドの文言をそのまま出す');
chk(!html.includes('<b>x</b>'), 'エスケープする');
sb.c2 = { code: '72030', ticker: '7203', name: 'トヨタ', brief: { large_holding: '', one_liner: 'x' } };
chk(!run('_renderPullbackCard(c2)').includes('大量保有報告書'), '空なら欄ごと出さない (flag OFF の間)');
const card = grab('_renderPullbackCard');
chk(card.indexOf("block('💰'") < card.indexOf("block('🏦'") && card.indexOf("block('🏦'") < card.indexOf('earnDateHtml +'),
    '参考指標の直後・次回決算の前に出す');

console.log(bad ? `\n❌ ${bad} 件 NG` : '\n✅ すべて OK');
process.exit(bad ? 1 : 0);
