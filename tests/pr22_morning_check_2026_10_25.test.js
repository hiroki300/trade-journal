/**
 * 🌍 市場のいちばん上に 🌅 朝チェック (2026-10-25・stock-checker の morning_check.py / private_publish.py)。
 *
 *   node tests/pr22_morning_check_2026_10_25.test.js
 *
 * bot は LINE を送った後、同じ吹き出しの文を非公開リポ trade-journal-private の morning_check.json に書く
 * ({date, generated_at, trigger, reference, bubbles:[{kind,text}], sources:[{n,name,url,title,cited_text}]})。
 * PWA は売買記録と同じ鍵 (tj_ghpat) で読み、文をそのまま出す。
 * - 今日の分でなければ「まだ届いていない」と書き、前回の分は畳む (古い分を今朝のものとして読ませない)
 * - 「その日 1 回だけ取得」(loadMorningReports) に乗せない。今日の分が届くまでは 5 分に 1 回まで取り直す
 * - 鍵が無い・期限切れ・リポが見えない・まだ一度も届いていない、を言い分ける (黙って空にしない)
 * - 【今日の見通し】には「AI の推測・外れることがあります」を必ず付ける
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
function grab(name, prefix = '') {
  const i = all.indexOf(`${prefix}function ${name}(`);
  if (i < 0) throw new Error(`${name} not found`);
  let d = 0, k = all.indexOf('{', i);
  for (; k < all.length; k++) { if (all[k] === '{') d++; else if (all[k] === '}') { d--; if (!d) break; } }
  return all.slice(i, k + 1);
}
const constLine = name => all.split('\n').find(l => l.trimStart().startsWith('const ' + name));

// 時刻と今日の日付は固定する (時間に依存するテストにしない)
let NOW = Date.parse('2026-10-26T07:30:00+09:00');
let TODAY_STR = '2026-10-26';
class FakeDate extends Date {
  constructor(...a) { if (a.length === 0) super(NOW); else super(...a); }
  static now() { return NOW; }
}

const store = {};
const el = { innerHTML: '' };
let responses = {};      // url → status (or [status, body])
const calls = [];
const sb = {
  console, JSON, Promise, String, Number, Array, Object, Date: FakeDate,
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
                  removeItem: k => { delete store[k]; } },
  document: { getElementById: id => (id === 'dmorningcheck' ? el : null) },
  ymdJST: () => TODAY_STR,
  fetch: async (url, opt) => {
    calls.push({ url, opt });
    const r = responses[url];
    if (r === 'throw') throw new Error('offline');
    const [status, body] = Array.isArray(r) ? r : [r || 404, {}];
    return { status, ok: status === 200, json: async () => { if (body === 'bad') throw new Error('x'); return body; },
             headers: { get: () => '' } };
  },
};
vm.createContext(sb);
vm.runInContext([
  constLine('GH_PRIVATE_REPO'), constLine('MC_FILE'), constLine('MC_CACHE_KEY'), constLine('MC_RETRY_MS'),
  constLine('MC_OUTLOOK_LABEL'), constLine('_MC_CARD'),
  'let _mc = null; let _mcBusy = null;',
  grab('_escape'), grab('_safeUrl'), grab('_jstShort'),
  grab('_fetchMorningCheck', 'async '), grab('loadMorningCheck', 'async '), grab('_mcErrText'),
  grab('_mcWhen'), grab('_mcLineHtml'), grab('_mcBubbleHtml'), grab('_mcSourcesHtml'), grab('renderMorningCheck'),
].join('\n'), sb);
const run = c => vm.runInContext(c, sb);
const reset = () => { run('_mc = null; _mcBusy = null;'); calls.length = 0; el.innerHTML = '';
                      for (const k of Object.keys(store)) delete store[k]; };

const API = 'https://api.github.com/repos/hiroki300/trade-journal-private';
const FILE = API + '/contents/morning_check.json?ref=main';

// bot (morning_check.app_payload) が 2026-10-26 に書く形
const PAYLOAD = {
  version: 1, date: '2026-10-26', generated_at: '2026-10-26T07:17+09:00', trigger: 'auto',
  reference: '2026-10-23T15:45+09:00',
  bubbles: [
    { kind: 'positions', text: '🚦 建玉の出口ルールの印 (10/23 の終値)\n・三菱商事: ⏰ 保有 19営業日 (10日で撤退のルール)・損益 -1.4%\n※ 自分で決めた出口ルールの点検です。売買の判断はしていません' },
    { kind: 'numbers', text: '🌅 朝チェック 10/26(月) 07:17\n東京の前回の大引け (10/23) から今朝まで\n・半導体株 (SOX指数) −6.7%（かなり大きい）\n・原油 (WTI): 取得できず\n※ Yahoo Finance から機械で取得 (公式の配信ではありません)' },
    { kind: 'ai', text: '🗞 AI のまとめ (Claude が Web の記事を読んで書きました)\n【ひとことで】\n昨夜は半導体株が下がりました。\n【昨夜の理由】\n・AI 企業の巨額投資への心配から売られました。[1]\n【今日の見通し】(AI の推測・外れることがあります)\n・半導体関連は売られやすいかもしれません。\n【今日の予定】\n・米国の指標が発表される予定。[2]\n※ 売買の判断はしていません。見通しの当たり外れは測っていません' },
  ],
  sources: [
    { n: 1, name: 'Yahoo!ファイナンス', url: 'https://finance.yahoo.co.jp/news/detail/abc', title: '〔米株式〕ダウ', cited_text: '【ニューヨーク時事】22日の…' },
    { n: 2, name: 'Investing.com', url: 'https://jp.investing.com/news/1', title: '予定', cited_text: '' },
  ],
};

(async () => {
  console.log('--- 今日の分 ---');
  reset();
  store.tj_ghpat = 'github_pat_dummy';
  responses = { [FILE]: [200, PAYLOAD] };
  await run('loadMorningCheck()');
  const h = el.innerHTML;
  chk(calls[0].url === FILE, '非公開リポの morning_check.json を読む');
  chk(calls[0].opt.headers.Authorization === 'Bearer github_pat_dummy', '売買記録と同じ鍵 (tj_ghpat)');
  chk(calls[0].opt.headers.Accept === 'application/vnd.github.raw+json' && calls[0].opt.cache === 'no-store',
      '中身をそのまま・キャッシュしない');
  chk(h.includes('10/26(月) 07:17 に作成'), '作成の日時を出す');
  chk(h.includes('三菱商事: ⏰ 保有 19営業日') && h.includes('−6.7%（かなり大きい）'), 'LINE の文をそのまま出す');
  chk(h.includes('原油 (WTI): 取得できず'), '取れなかった数字は「取得できず」のまま');
  chk(h.includes('【今日の見通し】(AI の推測・外れることがあります)'), '見通しに推測のラベル');
  chk(h.includes('href="https://finance.yahoo.co.jp/news/detail/abc"') && h.includes('>[1]</a>'), '[1] は記事へのリンク');
  chk(h.includes('記事の該当箇所') && h.includes('【ニューヨーク時事】22日の…'), '原文の抜き書きは畳んで出す');
  chk(!h.includes('まだ届いていません'), '今日の分には「まだ届いていない」を出さない');
  chk(h.indexOf('🚦') < h.indexOf('🌅 朝チェック') && h.indexOf('🌅 朝チェック') < h.indexOf('🗞'), 'LINE と同じ順');
  chk(JSON.parse(store.tj_morning_check).payload.date === '2026-10-26', 'この端末に取っておく');

  console.log('--- 今日の分を読んだら取り直さない ---');
  calls.length = 0;
  NOW += 60 * 60 * 1000;
  await run('loadMorningCheck()');
  chk(calls.length === 0, 'タブを切り替えても取りに行かない');
  await run('loadMorningCheck(true)');
  chk(calls.length === 1, '🔄 なら取り直す');

  console.log('--- 今日の分がまだ (7:15 より前・土日祝) ---');
  reset();
  NOW = Date.parse('2026-10-26T06:50:00+09:00');
  store.tj_ghpat = 'p';
  const OLD = { ...PAYLOAD, date: '2026-10-23', generated_at: '2026-10-23T07:17+09:00' };
  responses = { [FILE]: [200, OLD] };
  await run('loadMorningCheck()');
  let g = el.innerHTML;
  chk(g.includes('今日 (10/26(月)) の朝チェックはまだ届いていません'), '今日の分でないと大きく書く');
  chk(g.includes('土日・祝日は届きません'), '休みの日は届かないと書く');
  chk(/<details><summary[^>]*>前回の分を見る \(10\/23\(金\) 07:17 に作成\)<\/summary>/.test(g), '前回の分は畳む');
  chk(g.indexOf('まだ届いていません') < g.indexOf('🌅 朝チェック 10/26'), '注意書きは中身より前');
  calls.length = 0;
  NOW += 2 * 60 * 1000;
  await run('loadMorningCheck()');
  chk(calls.length === 0, '5 分たたないうちは取りに行かない');
  NOW += 4 * 60 * 1000;
  responses = { [FILE]: [200, PAYLOAD] };
  await run('loadMorningCheck()');
  chk(calls.length === 1 && el.innerHTML.includes('10/26(月) 07:17 に作成') && !el.innerHTML.includes('まだ届いていません'),
      '5 分たてば取り直し、今日の分が来たら普通に出す (その日 1 回のキャッシュで固まらない)');

  console.log('--- 再起動しても昨日の分で固まらない ---');
  run('_mc = null;'); calls.length = 0;
  store.tj_morning_check = JSON.stringify({ payload: OLD, fetchedAt: NOW - 1000 });
  responses = { [FILE]: [200, PAYLOAD] };
  await run('loadMorningCheck()');
  chk(calls.length === 1 && el.innerHTML.includes('10/26(月) 07:17 に作成'), '取っておいた分が昨日なら取りに行く');

  console.log('--- 読めないとき (黙って空にしない) ---');
  reset();
  await run('loadMorningCheck()');
  chk(calls.length === 0 && el.innerHTML.includes('鍵 (PAT) が無い') && el.innerHTML.includes('🔑 API設定'),
      '鍵が無い → 取りに行かず、その旨と入れ場所');
  store.tj_ghpat = 'p';
  responses = { [FILE]: 401 };
  await run('loadMorningCheck(true)');
  chk(el.innerHTML.includes('無効か期限切れ'), '401 → 鍵が無効か期限切れ');
  responses = { [FILE]: 404, [API]: 200 };
  await run('loadMorningCheck(true)');
  chk(el.innerHTML.includes('まだ一度も届いていません'), 'ファイルが 404・リポは見える → まだ届いていない');
  responses = { [FILE]: 404, [API]: 404 };
  await run('loadMorningCheck(true)');
  chk(el.innerHTML.includes('trade-journal-private が見えません'), 'リポも 404 → 鍵にリポが入っていない (404 だけで決めない)');
  responses = { [FILE]: 'throw' };
  await run('loadMorningCheck(true)');
  chk(el.innerHTML.includes('通信できませんでした'), '圏外 → 通信できなかった');
  responses = { [FILE]: [200, { date: '2026-10-26' }] };
  await run('loadMorningCheck(true)');
  chk(el.innerHTML.includes('読めませんでした (形が崩れています)'), '形の崩れた JSON は出さない');

  console.log('--- 前に読んだ分があって最新が読めない ---');
  reset();
  NOW = Date.parse('2026-10-26T08:00:00+09:00');
  store.tj_ghpat = 'p';
  store.tj_morning_check = JSON.stringify({ payload: OLD, fetchedAt: Date.parse('2026-10-23T07:30:00+09:00') });
  responses = { [FILE]: 500 };
  await run('loadMorningCheck()');
  g = el.innerHTML;
  chk(g.includes('最新を読めませんでした') && g.includes('HTTP 500') && g.includes('10/23 07:30 に読んだ分'),
      '読めなかった理由と、いつ読んだ分かを出す');
  chk(g.includes('まだ届いていません') && g.includes('<details>'), '古い分は畳んだまま');

  console.log('--- 文の守り ---');
  const noLabel = run(`_mcLineHtml('【今日の見通し】', 1, [])`);
  chk(noLabel.includes('(AI の推測・外れることがあります)'), 'bot の文にラベルが無くても画面で足す');
  const once = run(`_mcLineHtml('【今日の見通し】(AI の推測・外れることがあります)', 1, [])`);
  chk(once.split('AI の推測').length === 2, 'ラベルを二重にしない');
  const evil = run(`_mcBubbleHtml({text: '<img src=x onerror=alert(1)>[1]'}, [{n: 1, url: 'javascript:alert(1)'}])`);
  chk(!evil.includes('<img') && evil.includes('&lt;img') && !evil.includes('javascript:'), 'HTML は無害化・危ない URL はリンクにしない');
  const srcEvil = run(`_mcSourcesHtml([{n: 1, name: '<b>x</b>', url: 'data:text/html,1', title: '', cited_text: '<i>'}])`);
  chk(!srcEvil.includes('<b>x') && !srcEvil.includes('href="data:') && srcEvil.includes('&lt;i&gt;'), '出典の一覧も無害化');
  chk(run(`_mcSourcesHtml([])`) === '', '出典が無ければ一覧を出さない (AI が作れなかった朝)');
  // bot は抜き書きに売買をすすめる語 (例「目標株価」) があると cited_text を空にして cited_hidden を立てる
  const hid = run(`_mcSourcesHtml([{n: 2, name: 'Investing.com', url: 'https://jp.investing.com/n', title: 't', cited_text: '', cited_hidden: true}])`);
  chk(hid.includes('出していません') && hid.includes('リンク先で読めます') && !hid.includes('<details'), '出さなかった抜き書きはその旨を書く');

  console.log('--- 画面と呼び出し ---');
  const market = HTML.slice(HTML.indexOf('id="page-market"'), HTML.indexOf('id="page-discover"'));
  chk(market.indexOf('id="dmorningcheck"') > 0 && market.indexOf('id="dmorningcheck"') < market.indexOf('id="dmacro"'),
      '🌍 市場のいちばん上 (マクロ判定より前)');
  chk(market.includes('売買の判断はしていません'), '欄の説明に売買の判断をしないと書く');
  chk(!HTML.includes('📅 朝会レポート'), '古い見出し「📅 朝会レポート」を残さない');
  chk(grab('go').includes("id==='market') loadMorningCheck()"), '🌍 市場を開いたら取り直す (5 分に 1 回まで)');
  chk(grab('loadMorningReports', 'async ').includes('loadMorningCheck(forceRefresh)'), '起動時と 🔄 再取得でも読む');
  chk(!/loadMorningCheck[^\n]*_reportsCacheDate/.test(all), '朝チェックはその日 1 回のキャッシュを見ない');

  console.log(bad ? `\n❌ ${bad} 件 NG` : '\n✅ すべて OK');
  process.exit(bad ? 1 : 0);
})();
