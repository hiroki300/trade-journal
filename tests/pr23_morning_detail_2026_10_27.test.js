/**
 * 🌅 朝チェック: LINE は要点だけ・ここが詳しい版 (2026-10-27・stock-checker の morning_line)。
 *
 *   node tests/pr23_morning_detail_2026_10_27.test.js
 *
 * bot の flag MORNING_LINE_V2_ENABLED が ON の朝は、非公開リポの morning_check.json に LINE より詳しい版
 * (+ 📅 予定と気づき = kind 'notices') が届く。PWA は文をそのまま出し、'notices' がある朝だけ
 * 「LINE は要点だけ・ここが詳しい版」と添える (無い朝は LINE と同じ中身)。
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
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
const el = { innerHTML: '' };
const sb = { console, String, Array, Number, Date, document: { getElementById: id => (id === 'dmorningcheck' ? el : null) },
             ymdJST: () => '2026-10-27' };
vm.createContext(sb);
const constLine = name => all.split('\n').find(l => l.trimStart().startsWith('const ' + name));
vm.runInContext([grab('_escape'), grab('_safeUrl'), grab('_jstShort'), grab('_mcErrText'), grab('_mcWhen'),
                 constLine('MC_OUTLOOK_LABEL') || "const MC_OUTLOOK_LABEL = '';", constLine('_MC_CARD'),
                 grab('_mcLineHtml'), grab('_mcBubbleHtml'), grab('_mcSourcesHtml'), grab('_mcKindNote'),
                 grab('renderMorningCheck'), 'let _mc = null;'].join('\n'), sb);
const run = c => vm.runInContext(c, sb);

console.log('--- LINE との関係の 1 行 ---');
const base = { date: '2026-10-27', generated_at: '2026-10-27T07:18+09:00', trigger: 'auto', sources: [] };
sb.pV2 = { ...base, bubbles: [{ kind: 'numbers', text: '🌅 朝チェック\n・S&P500 +0.7%' },
                              { kind: 'notices', text: '📅 予定と気づき\n【あなたの株】(建玉・👀)\n・10/30(金)ごろ 三菱電機の決算 (建玉・推定)' }] };
run('_mc = { payload: pV2 }; renderMorningCheck()');
chk(el.innerHTML.includes('LINE には要点だけが届きます。ここが詳しい版です'), '予定と気づきがある朝は「ここが詳しい版」');
chk(el.innerHTML.includes('📅 予定と気づき') && el.innerHTML.includes('三菱電機の決算'), '予定と気づきの吹き出しも出す');
sb.pV1 = { ...base, bubbles: [{ kind: 'numbers', text: '🌅 朝チェック' }, { kind: 'ai', text: '🗞 AI のまとめ' }] };
run('_mc = { payload: pV1 }; renderMorningCheck()');
chk(el.innerHTML.includes('LINE と同じ中身です。') && !el.innerHTML.includes('詳しい版'), '切り替え前の朝は「LINE と同じ中身」');
chk(!HTML.includes('朝チェックと<b>同じ中身</b>です'), '見出しの下の説明は決め打ちの「同じ中身」をやめた');

console.log(bad ? `\n❌ ${bad} 件 NG` : '\n✅ すべて OK');
process.exit(bad ? 1 : 0);
