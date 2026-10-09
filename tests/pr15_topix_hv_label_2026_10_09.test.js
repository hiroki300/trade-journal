/**
 * マクロ欄の「日経HV」を「TOPIX HV」に直す (2026-10-09・stock-checker の macro_guard)。
 *
 *   node tests/pr15_topix_hv_label_2026_10_09.test.js
 *
 * バックエンドが取っているのはずっと TOPIX (J-Quants に日経平均は無い・コード 0000 = TOPIX)
 * だったのに、ここのラベルが「日経HV」だった。判定・閾値は変えていない。
 */
const fs = require('fs'), vm = require('vm');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...HTML.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let bad = 0;
const chk = (ok, label) => { console.log(`  ${ok ? 'OK  ' : 'NG  '}${label}`); if (!ok) bad++; };
const all = scripts.join('\n');
function grab(name) {
  const i = all.indexOf(`function ${name}(`);
  if (i < 0) throw new Error(`${name} not found`);
  let d = 0, k = all.indexOf('{', i);
  for (; k < all.length; k++) { if (all[k] === '{') d++; else if (all[k] === '}') { d--; if (!d) break; } }
  return all.slice(i, k + 1);
}
const el = { innerHTML: '', textContent: '' };
const sb = { console, Date, Math, document: { getElementById: () => el } };
vm.createContext(sb);
const stale = all.match(/const MACRO_STALE_HOURS = [^;]+;/)[0];
vm.runInContext([stale, grab('_escape'), grab('_fmtEvalAt'), grab('_macroAgeHours'), grab('renderMacro')]
  .join('\n'), sb);

console.log('--- renderMacro ---');
sb.renderMacro({ regime: 'normal', hv_20d: 14.9, ma25_dev: 0.31,
                 summary: '🟢 レジーム:NORMAL | TOPIX HV14.9% / MA25乖離0.31% / uptrend',
                 evaluated_at: new Date().toISOString() });
chk(el.innerHTML.includes('TOPIX HV 14.9%'), 'ラベルは「TOPIX HV」');
chk(!el.innerHTML.includes('日経'), '「日経」を出さない');

console.log(bad ? `\n❌ ${bad} 件 NG` : '\n✅ すべて OK');
process.exit(bad ? 1 : 0);
