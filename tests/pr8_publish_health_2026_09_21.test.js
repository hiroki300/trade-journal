/**
 * 自動連携 (publish) が止まったことを検出できるか。
 *
 *   node tests/pr8_publish_health_2026_09_21.test.js
 *
 * 背景 (2026-09-21 実測): 公開データ human_paper_trades.json は
 * 2026-09-11T10:43Z で止まっており未決済5件。サーバ側は正常だったのに
 * アプリは 10 日間なにも言わなかった (maybeAutoPublish は console.warn だけ、
 * 最終公開日時もどこにも無かった)。そこを固定する。
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
function grabAsync(name) {
  const i = all.indexOf(`async function ${name}(`);
  if (i < 0) throw new Error(`async ${name} not found`);
  let d = 0, k = all.indexOf('{', i);
  for (; k < all.length; k++) { if (all[k] === '{') d++; else if (all[k] === '}') { d--; if (!d) break; } }
  return all.slice(i, k + 1);
}
function constLine(name) {
  const line = all.split('\n').find(l => l.trimStart().startsWith('const ' + name));
  if (!line) throw new Error(name + ' not found');
  return line;
}

// ── サンドボックス ────────────────────────────────────────────
const store = {};
const els = {};
const sb = {
  console, Date, JSON, Math, isNaN, String, Array, Number, parseInt, Promise,
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  },
  document: { getElementById: id => els[id] || null },
  alert: m => { sb._lastAlert = m; },
  toast: m => { sb._lastToast = m; },
  fetch: null,
  _lastAlert: '', _lastToast: '',
};
sb.window = sb;
vm.createContext(sb);
vm.runInContext([
  constLine('PUB_BASE'), constLine('PUB_STATE_KEY'), constLine('PUB_STALE_DAYS'),
  'let _pubFresh = null;',
  grab('_escape'),
  grab('getPubState'), grab('setPubState'), grab('_daysAgo'), grab('_jstShort'),
  grabAsync('loadPublishedFreshness'), grabAsync('testGhConnection'),
  grab('renderPubStatus'),
  'function renderJournalStatus(){ sb_called = (typeof sb_called === "undefined" ? 1 : sb_called + 1); }',
  'var sb_called = 0;',
].join('\n'), sb);
const run = c => vm.runInContext(c, sb);

console.log('--- 状態の保存と読み出し ---');
run('setPubState({at:"2026-09-11T10:43:38.575Z", ok:true, status:200, expires:"2026-12-01"})');
chk(run('getPubState().ok') === true, '保存した状態を読める');
chk(store['tj_pub_state'].includes('2026-09-11'), 'localStorage に入る');
store['tj_pub_state'] = '{壊れた';
chk(run('getPubState()') === null, '壊れた JSON でも例外にしない');

console.log('--- 日数と時刻 ---');
run('var _now = Date.now();');
chk(run('_daysAgo(new Date(Date.now() - 10*86400000).toISOString())') === 10, '10日前を10と数える');
chk(run('_daysAgo(null)') === null, 'null は null');
chk(run('_daysAgo("でたらめ")') === null, '壊れた日付は null');
chk(run('_jstShort("2026-09-11T10:43:38.575Z")') === '9/11 19:43', 'JST に直して出す');
chk(run('_jstShort(null)') === '—', '無ければダッシュ');

console.log('--- 公開データの鮮度 (PAT 不要で読むだけ) ---');
sb.fetch = async () => ({
  ok: true,
  json: async () => ({
    _generated_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    trades: [{ code: '1', exit_date: null }, { code: '2', exit_date: '2026-09-01' },
             { code: '3', exit_date: null }],
  }),
});
run('_pubFresh = null;');
let f = null;
(async () => {
  f = await run('loadPublishedFreshness()');
  chk(f.days === 10, `10日前と分かる (${f.days})`);
  chk(f.n === 3 && f.openN === 2, `件数と未決済を数える (${f.n}/${f.openN})`);

  console.log('--- 🔑API設定 の状態表示 ---');
  els['pubStatus'] = { innerHTML: '' };
  run('setPubState({at:"2026-09-11T10:43:38.575Z", ok:false, status:401, expires:"2026-09-10"})');
  run('renderPubStatus()');
  const h = els['pubStatus'].innerHTML;
  chk(h.includes('⚠️') && h.includes('10日前'), '古いことを警告する');
  chk(h.includes('❌') && h.includes('401'), '失敗と HTTP を出す');
  chk(h.includes('2026-09-10'), 'PAT の有効期限を出す');

  console.log('--- 接続テストが原因を切り分ける ---');
  const cases = [
    [200, '✅', '接続できました'],
    [401, '❌', '有効期限が切れて'],
    [403, '❌', '権限が足りません'],
    [404, '❌', '見つかりません'],
    [500, '⚠️', '予期しない応答'],
  ];
  store['tj_ghpat'] = 'github_pat_dummy';
  for (const [status, mark, frag] of cases) {
    sb.fetch = async () => ({
      status,
      headers: { get: k => (k === 'github-authentication-token-expiration' ? '2026-12-31' : null) },
    });
    sb._lastAlert = '';
    await run('testGhConnection()');
    const m = sb._lastAlert || '';
    chk(m.startsWith(mark) && m.includes(frag), `HTTP ${status} → ${frag}`);
    chk(run('getPubState().status') === status, `HTTP ${status} を記録する`);
  }

  console.log('--- PAT が無いときは推測しない ---');
  delete store['tj_ghpat'];
  sb._lastAlert = '';
  await run('testGhConnection()');
  chk(sb._lastAlert.includes('保存されていません'), 'PAT 未保存を明示する');

  console.log('--- 回線が死んでいても例外を投げない ---');
  store['tj_ghpat'] = 'x';
  sb.fetch = async () => { throw new Error('Failed to fetch'); };
  sb._lastAlert = '';
  await run('testGhConnection()');
  chk(sb._lastAlert.includes('通信できませんでした'), '通信失敗を伝える');

  console.log('--- 規律: 失敗を黙って飲まない ---');
  const mp = all.slice(all.indexOf('async function maybeAutoPublish('));
  chk(mp.slice(0, 400).includes('setPubState'), '自動公開の失敗を端末に記録する');
  // マークアップは <script> の外なので HTML 全文で見る
  chk(HTML.includes('id="pubStatus"'), '状態表示の置き場がある');
  chk(HTML.includes('onclick="testGhConnection()"') && HTML.includes('🔌 接続テスト'),
      '接続テストのボタンがある');
  const rjs = grab('renderJournalStatus');
  chk(rjs.includes('自動連携が失敗しています') && rjs.includes('公開データが'),
      '売買タブにも警告を出す');

  console.log('--- 構文 ---');
  scripts.forEach((src, i) => {
    try { new vm.Script(src); } catch (e) { chk(false, `inline <script> #${i}: ${e.message}`); }
  });
  chk(true, `inline <script> ${scripts.length} 本の構文OK`);

  console.log(bad ? `\nRESULT: ${bad} NG` : '\nRESULT: OK');
  process.exit(bad ? 1 : 0);
})();
