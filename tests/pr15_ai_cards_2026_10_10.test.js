/**
 * 押し目カードに「🤖 AI の読み取り」を出す (2026-10-10・stock-checker の P3 ai_cards.py)。
 *
 *   node tests/pr15_ai_cards_2026_10_10.test.js
 *
 * バックエンドは ai_cards.json に、LINE に載った社だけのカードを出す (flag 既定 OFF の間は
 * ファイルが無く fetch は null)。照合 (引用の実在・数字・禁止語) はバックエンドで済んでいる。
 * PWA は描画するだけで、並び順・顔ぶれには使わない。
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
const sb = { console };
vm.createContext(sb);
vm.runInContext([grab('_escape'), grabConst('AI_SECTION_LABELS'), grab('_aiCardHtml')].join('\n'), sb);
const run = c => vm.runInContext(c, sb);

const CARD = {
  profile: {
    source: { title: '2026年3月期 有価証券報告書 (2026-06-24 提出)' }, one_liner: '菓子と乳製品の会社',
    sections: {
      business: [{ point: '菓子と乳製品の製造販売', quote: '菓子および乳製品の製造販売' }],
      risks: [], support: [{ point: '政府の助成で工場を増強', quote: '政府の助成を受けて' }],
    },
  },
  latest: null, latest_missing: true,
  line: ['🤖 事業: 菓子と乳製品の会社', '🏛 公的支援: 政府の助成で工場を増強'],
};
sb.CARD = CARD;

console.log('--- _aiCardHtml ---');
chk(run(`_aiCardHtml(undefined)`) === '' && run(`_aiCardHtml({profile:null,latest:null})`) === '',
    'カードが無ければ何も出さない (flag OFF・LINE に載らなかった社)');
const h = run(`_aiCardHtml(CARD)`);
chk(h.includes('🤖 AI の読み取り') && h.includes('🤖 事業: 菓子と乳製品の会社'), 'LINE と同じ行を見出しに出す');
chk(h.includes('<details') && h.includes('「菓子および乳製品の製造販売」'), '要点と引用は折りたたみの中');
chk(h.includes('🏛 国・自治体の支援'), '公的支援の節に見出しがつく');
chk(!h.includes('会社が挙げるリスク'), '空の節は見出しも出さない');
chk(h.includes('まだ手元にありません'), '短信が無いことを書く (古い短信で語らない)');
chk(h.includes('売買の判断・株価の予想はしていません'), '注記がある');
sb.EVIL = { profile: { source: { title: '<img src=x onerror=alert(1)>' }, sections: {
  business: [{ point: '<b>x</b>', quote: '<script>y</script>' }] } }, line: ['<i>z</i>'] };
const e = run(`_aiCardHtml(EVIL)`);
chk(!e.includes('<b>') && !e.includes('<script>') && !e.includes('<img') && !e.includes('<i>'), 'すべてエスケープする');

console.log('--- 配線 ---');
const card = grab('_renderPullbackCard');
chk(card.includes('_aiCardHtml((((window._aiCardsData || {}).cards) || {})[c.code])'), 'コード (5 桁) で引く');
chk(card.indexOf('const aiHtml') < card.indexOf('aiHtml +'), 'aiHtml は使用前に定義されている (TDZ 事故の防止)');
chk(card.indexOf('headerHtml +') < card.indexOf('aiHtml +') &&
    card.indexOf('aiHtml +') < card.indexOf("block('📉'"), 'ヘッダーの直後に出す');
chk(all.includes("_fetchJSON('ai_cards.json')"), 'ai_cards.json を取りにいく');
chk(all.includes('window._aiCardsData = aiCards;'), '取得とキャッシュの両方で window に載せる');
chk((all.match(/window\._aiCardsData = aiCards;/g) || []).length === 2, 'キャッシュ経路でも載せる');
const sortSrc = grab('renderPullback');
chk(!sortSrc.includes('_aiCardsData'), '並び順の計算に AI のデータを使わない');

console.log(bad ? `\n❌ ${bad} 件 NG` : '\n✅ すべて OK');
process.exit(bad ? 1 : 0);
