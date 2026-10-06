/**
 * 押し目カードに日々公表・信用規制の事実を出す (2026-10-06・stock-checker #83)。
 *
 *   node tests/pr14_margin_alert_2026_10_06.test.js
 *
 * バックエンドは brief.margin_alert に事実だけの 1 行を入れる (flag 既定 OFF の間は無い)。
 * PWA は brief のフィールドを個別に描画するので、ここで足さないとアプリに出ない。
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
const sb = { console };
vm.createContext(sb);
vm.runInContext([grab('_escape'), grab('_marginAlertHtml')].join('\n'), sb);
const run = c => vm.runInContext(c, sb);

console.log('--- _marginAlertHtml ---');
chk(run(`_marginAlertHtml('')`) === '' && run(`_marginAlertHtml(undefined)`) === '', '無ければ何も出さない (flag OFF の間)');
const reg = run(`_marginAlertHtml('⚠️ 東証の信用取引規制銘柄（2026-10-06 公表）')`);
chk(reg.includes('rgba(239,68,68') && reg.includes('東証の信用取引規制銘柄'), '規制中は赤系');
const daily = run(`_marginAlertHtml('📌 東証の日々公表銘柄（2026-10-06 公表）')`);
chk(daily.includes('rgba(234,179,8') && !daily.includes('rgba(239,68,68'), '日々公表は黄系');
chk(!run(`_marginAlertHtml('<b>x</b>')`).includes('<b>'), 'エスケープする');

console.log('--- カードへの配線 ---');
const card = grab('_renderPullbackCard');
chk(card.includes('_marginAlertHtml(b.margin_alert)'), 'brief.margin_alert を描画する');
chk(card.indexOf('const marginAlertHtml') < card.indexOf('marginAlertHtml +'),
    'marginAlertHtml は使用前に定義されている (TDZ 事故の防止)');
chk(card.indexOf('exDateHtml +') < card.indexOf('marginAlertHtml +'), '権利落ち警告の直後に並ぶ');

console.log(bad ? `\n❌ ${bad} 件 NG` : '\n✅ すべて OK');
process.exit(bad ? 1 : 0);
