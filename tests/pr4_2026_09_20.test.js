/**
 * 📐 よく売買された価格帯 (価格帯別出来高) の表示テスト。
 *
 *   node tests/pr4_2026_09_20.test.js
 *
 * バックエンド (levels_view.py) が作った文言をそのまま出すだけで、
 * **フロントで数値から言葉を作り直さない** (HANDOFF_pwa_display.md の規律)。
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

const sb = { console, window: {}, Date, document: { getElementById: () => null } };
vm.createContext(sb);
vm.runInContext([grab('_escape'), grab('_safeUrl'), grab('_renderPullbackCard'),
                 'function isShortlisted() { return false; }'].join('\n'), sb);
const run = c => vm.runInContext(c, sb);

console.log('--- カードに 📐 の行が出る ---');
sb.c = {
  code: '72030', ticker: '7203', name: 'トヨタ', price: 3116,
  brief: {
    pullback: '60日高値から 12.0% 押した',
    volatility: 'ふだんの1日の値幅は 2.3%',
    levels: '直近100営業日でどの価格帯が多く売買されたか (日足からの推計)／いまの株価の帯: 全体の4% ' +
            '(均等に散らばった場合は4%)／下でいちばん厚い帯 2,975円〜3,010円 (11%・1.5〜2.0日ぶん下)' +
            '／現値〜-8%ストップ(2,867円)の間で売買されたのは全体の56%',
    one_liner: '増収増益',
  },
};
const html = run('_renderPullbackCard(c)');
chk(html.includes('よく売買された価格帯'), '見出しが出る');
chk(html.includes('2,975円〜3,010円') && html.includes('1.5〜2.0日ぶん下'), 'バックエンドの文言をそのまま出す');
chk(html.includes('全体の56%'), 'ストップまでのシェアも出る');

console.log('--- brief.levels が無いカードは何も出さない (壊れない) ---');
sb.c2 = { code: '81360', ticker: '8136', name: 'サンリオ', price: 1268,
          brief: { pullback: '押し目', one_liner: '増収増益' } };
const html2 = run('_renderPullbackCard(c2)');
chk(!html2.includes('よく売買された価格帯'), '空のときは見出しごと出ない');
chk(html2.includes('サンリオ'), 'カード自体は従来どおり描画される');

console.log('--- フロントで言葉を作り直していない ---');
const card = grab('_renderPullbackCard');
chk(card.includes("block('📐', 'よく売買された価格帯', b.levels"), 'brief.levels をそのまま渡すだけ');
for (const w of ['日ぶん下', '厚い帯', '均等に散らばった']) {
  chk(!card.includes(w), `カード側で文言を組み立てていない (${w})`);
}

console.log('--- セクションの注記 (物差しと近似の断り) ---');
const note = HTML.slice(HTML.indexOf('🔥 ピックアップ'), HTML.indexOf('id="dpullback"'));
chk(note.includes('ふだん1日で動く値幅'), '「日ぶん」の物差しを説明している');
chk(note.includes('日足からの推計'), '日足近似であることを書いている');
chk(note.includes('52週高安は範囲外'), '窓の外は見えないと書いている');
chk(/反発する\/止まるという意味ではありません|予測力は未測定/.test(note), '方向を主張しないと明記している');
for (const w of ['支持線', '抵抗線', 'サポート', 'レジスタンス']) {
  chk(!note.includes(w), `方向を含意する語を使っていない (${w})`);
}

console.log('--- 構文 ---');
scripts.forEach((src, i) => {
  try { new vm.Script(src); } catch (e) { chk(false, `inline <script> #${i} 構文エラー: ${e.message}`); }
});
chk(true, `inline <script> ${scripts.length} 本の構文OK`);

console.log(bad ? `\nRESULT: ${bad} NG` : '\nRESULT: OK');
process.exit(bad ? 1 : 0);
