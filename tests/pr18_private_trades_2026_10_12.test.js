/**
 * 売買記録は非公開リポへ、👀ウォッチは公開リポへ (D・2026-10-12・stock-checker HANDOFF_next_2026-10-12.md §5)。
 *
 *   node tests/pr18_private_trades_2026_10_12.test.js
 *
 * human_paper_trades.json (銘柄・建値・株数) を公開リポ trade-journal-data に書かない。
 * shortlist.json (銘柄名だけ) は bot が鍵なしで読むので公開リポのまま。
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...HTML.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const all = scripts.join('\n');
let bad = 0;
const chk = (ok, label) => { console.log(`  ${ok ? 'OK  ' : 'NG  '}${label}`); if (!ok) bad++; };

function grabFn(name, prefix) {
  const i = all.indexOf(`${prefix}function ${name}(`);
  if (i < 0) throw new Error(`${name} not found`);
  let d = 0, k = all.indexOf('{', i);
  for (; k < all.length; k++) { if (all[k] === '{') d++; else if (all[k] === '}') { d--; if (!d) break; } }
  return all.slice(i, k + 1);
}
const constLine = name => all.split('\n').find(l => l.trimStart().startsWith('const ' + name));

const store = { tj_ghpat: 'github_pat_dummy', tj_shortlist: '[]' };
const puts = [];
const sb = {
  console, JSON, Date, Promise, String,
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
  document: { getElementById: () => null },
  alert: m => { sb._alert = m; }, toast: m => { sb._toast = m; },
  fetch: async (url, opt) => {
    if (opt && opt.method === 'PUT') puts.push(url);
    return { status: (opt && opt.method === 'PUT') ? 200 : 404, headers: { get: () => '' },
             json: async () => ({}), text: async () => '' };
  },
};
vm.createContext(sb);
vm.runInContext([
  constLine('GH_PUBLIC_REPO'), constLine('GH_PRIVATE_REPO'),
  'let _pubFresh = null;',
  'function _utf8ToBase64(s) { return "b64"; }',
  'function _buildHumanPaperTradesPayload() { return { trades: [{ code: "70110" }], skips: [] }; }',
  'function getShortlist() { return [{ code: "68570", name: "アドバンテスト" }]; }',
  'function setPubState() {} function renderPubStatus() {} function renderJournalStatus() {}',
  grabFn('_ghPutJson', 'async '), grabFn('publishHumanPaperTrades', 'async '),
].join('\n'), sb);

(async () => {
  console.log('--- 書き先 ---');
  await vm.runInContext('publishHumanPaperTrades()', sb);
  const hpt = puts.find(u => u.endsWith('/human_paper_trades.json'));
  const sl = puts.find(u => u.endsWith('/shortlist.json'));
  chk(hpt === 'https://api.github.com/repos/hiroki300/trade-journal-private/contents/human_paper_trades.json',
      `売買記録は非公開リポへ (${hpt})`);
  chk(sl === 'https://api.github.com/repos/hiroki300/trade-journal-data/contents/shortlist.json',
      `👀ウォッチは公開リポへ (${sl})`);
  chk(!puts.some(u => u.includes('trade-journal-data/contents/human_paper_trades.json')),
      '公開リポに売買記録を書かない');
  chk((sb._toast || '').includes('公開しました'), '成功を知らせる');

  console.log('--- 既定値 ---');
  puts.length = 0;
  await vm.runInContext('_ghPutJson("p", "x.json", {}, "m")', sb);
  chk(puts[0] === 'https://api.github.com/repos/hiroki300/trade-journal-data/contents/x.json',
      'repo を省いたら公開リポ (従来の呼び出しは変わらない)');

  console.log('--- 説明文 ---');
  chk(HTML.includes('trade-journal-data と trade-journal-private の 2 つだけ'), 'PAT の説明に 2 つのリポ');
  chk(HTML.includes('売買記録は非公開リポ trade-journal-private'), '書き先を画面に書く');
  // 2026-10-12 見直し: 非公開にした売買記録を「公開データ」と呼ぶと、まだ公開されていると読める
  chk(!all.includes("'公開データ: '") && !all.includes('公開データが ') && !all.includes('公開データを読めませんでした'),
      '売買記録を「公開データ」と呼ばない');
  chk(all.includes('連携した売買記録 (非公開)'), '非公開の売買記録だと分かる表示');

  console.log(bad ? `\n❌ ${bad} 件 NG` : '\n✅ すべて OK');
  process.exit(bad ? 1 : 0);
})();
