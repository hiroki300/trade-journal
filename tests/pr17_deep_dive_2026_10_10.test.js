/**
 * 発掘タブに「🔎 👀 ウォッチの深掘り」を出す (2026-10-10・stock-checker の P4 deep_dive.py)。
 *
 *   node tests/pr17_deep_dive_2026_10_10.test.js
 *
 * バックエンドは deep_dives.json に 👀 の会社ごとの行 ({code, name, dive | null, waiting}) を出す
 * (flag 既定 OFF の間はファイルが無く fetch は null)。照合はバックエンドで済んでいる。
 * PWA は描画するだけで、並び順 (👀 の順) も変えない。
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
function grabConst(name) {
  const i = all.indexOf(`const ${name} = {`);
  if (i < 0) throw new Error(`${name} not found`);
  return all.slice(i, all.indexOf('};', i) + 2);
}
const els = {};
const sb = { console, document: { getElementById: id => (els[id] = els[id] || { innerHTML: '', textContent: '' }) } };
vm.createContext(sb);
vm.runInContext([grab('_escape'), grabConst('DEEP_DIVE_LABELS'), grab('_deepDiveHtml'),
                 grab('renderDeepDives')].join('\n'), sb);
const run = c => vm.runInContext(c, sb);

const DATA = {
  generated_at: '2026-10-29T04:30+09:00', labels: { points: '要点', risks: 'リスク・減益の要因 (会社の説明)' },
  rows: [
    { code: '68570', name: 'アドバンテスト', waiting: null, dive: {
      source: { title: '2027年3月期 第2四半期決算短信', date: '2026-10-28' },
      one_liner: '生成AI向けの需要で増収と会社は説明',
      sections: { points: [{ point: '売上高は24,670百万円', quote: '売上高は 24,670百万円' }],
                  compare: [], risks: [{ point: '為替の変動', quote: '為替相場の変動により' }] } } },
    { code: '47840', name: 'ＧＭＯインターネット', dive: null, waiting: '決算短信がまだ保存されていない' },
  ],
};
sb.DATA = DATA;

console.log('--- renderDeepDives ---');
run('renderDeepDives(null)');
chk(els.ddeepdive.innerHTML.includes('まだ深掘りはありません') && els.deepDiveCount.textContent === '',
    'ファイルが無ければ「まだ無い」と書く (flag OFF の間)');
run('renderDeepDives(DATA)');
const h = els.ddeepdive.innerHTML;
chk(els.deepDiveCount.textContent === '(1/2社)', '件数は「深掘りあり / 👀」');
chk(h.indexOf('アドバンテスト') < h.indexOf('ＧＭＯ'), '👀 の順のまま');
chk(h.includes('🔎 生成AI向けの需要で増収と会社は説明'), '1 行を見出しに出す');
chk(h.includes('2027年3月期 第2四半期決算短信') && h.includes('2026-10-28 開示'), '書類と開示日を出す');
chk(h.includes('<details') && h.includes('「売上高は 24,670百万円」'), '要点と引用は折りたたみの中');
chk(h.includes('リスク・減益の要因 (会社の説明)'), 'バックエンドの見出しを使う');
chk(!h.includes('前年・前四半期との比較'), '空の型は見出しも出さない');
chk(h.includes('決算短信がまだ保存されていない'), '待ちの理由を出す');
sb.EVIL = { rows: [{ code: '<b>1', name: '<img src=x onerror=1>', dive: { one_liner: '<i>z</i>',
  source: { title: '<script>t</script>' }, sections: { points: [{ point: '<b>x</b>', quote: '<u>q</u>' }] } } }] };
run('renderDeepDives(EVIL)');
const e = els.ddeepdive.innerHTML;
chk(!e.includes('<b>') && !e.includes('<img') && !e.includes('<script>') && !e.includes('<i>') && !e.includes('<u>'),
    'すべてエスケープする');

console.log('--- 配線 ---');
chk(HTML.includes('id="ddeepdive"') && HTML.includes('id="deepDiveCount"'), '欄がある');
chk(HTML.indexOf('id="dpullback"') < HTML.indexOf('id="ddeepdive"') &&
    HTML.indexOf('id="ddeepdive"') < HTML.indexOf('id="dyutai"'), 'ピックアップの下・優待の上');
chk(all.includes("_fetchJSON('deep_dives.json')"), 'deep_dives.json を取りにいく');
chk((all.match(/window\._deepDivesData = deepDives;/g) || []).length === 2, '取得とキャッシュの両方で window に載せる');
chk((all.match(/renderDeepDives\(/g) || []).length >= 4, '取得・localStorage・当日キャッシュの 3 経路で描画する');
chk(all.includes('yutai, aiCards, deepDives,'), 'localStorage に保存する');
chk(!grab('renderPullback').includes('_deepDivesData'), '押し目の並び順に深掘りを使わない');

console.log(bad ? `\n❌ ${bad} 件 NG` : '\n✅ すべて OK');
process.exit(bad ? 1 : 0);
