/**
 * 🧮 買う前の確認に地合いと値幅の数え (2026-11-12・stock-checker の設計 DESIGN_SIZE_STOP_OPEN_2026-11-12.md の A2)。
 *
 *   node tests/pr27_pretrade_regime_2026_11_12.test.js
 *
 * bot (stock-checker #155) は pretrade.json (schema 2) に
 *   regime: {regime, as_of, size_factor, icon, words, guidance} | null   (TOPIX の終値で判定・取れない晩は null)
 *   range_base_rates: {measured_on, condition, buckets:[{lo, hi, close_m8, n}]}
 * を書く。固定すること:
 * - 計画の大きさに地合いの倍率を掛ける (storm 0.5・halt 0。11/12 ユーザー決定 Q1 ①)
 * - 地合いが無いときは「取得できず・株数に地合いは入っていません」(黙って満額にしない)
 * - 値幅の数えは「過去 10 年の数え・予想ではありません」と書く
 * - 古いポップアップ (checkMacroWarning) に説明書に無い言葉 (損切り幅も狭めに・推奨します) を残さない
 * - 売買をすすめる言葉・株価の向きの予想を出さない
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
const constBlock = name => {
  const i = all.indexOf('const ' + name + ' =');
  if (i < 0) throw new Error(name + ' not found');
  return all.slice(i, all.indexOf(';', i) + 1);
};

const store = {};
const els = {};
const elem = id => (els[id] = els[id] || { innerHTML: '', value: '', placeholder: '' });
let responses = {};
const alerts = [];
const sb = {
  console, JSON, Promise, String, Number, Array, Object, Math, Set, Date,
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
                  removeItem: k => { delete store[k]; } },
  document: { getElementById: id => elem(id) },
  window: {},
  ymdJST: () => '2026-11-12',
  H: [],
  TODAY: '2026-11-12',
  alert: m => alerts.push(m),
  ld: (k, d) => (k in store ? JSON.parse(store[k]) : d),
  sv: (k, v) => { store[k] = JSON.stringify(v); },
  fetch: async (url) => {
    const r = responses[url];
    const [status, body] = Array.isArray(r) ? r : [r || 404, {}];
    return { status, ok: status === 200, json: async () => body, headers: { get: () => '' } };
  },
};
vm.createContext(sb);
vm.runInContext([
  constBlock('GH_PRIVATE_REPO'), constBlock('PC_FILE'), constBlock('PC_CACHE_KEY'), constBlock('PC_REFRESH_MS'),
  constBlock('PC_DEFAULT_RULES'), 'let _pc = null; let _pcBusy = null;',
  grab('_escape'), grab('_num'), grab('_marketScheduleHtml'),
  grab('pcTick'), grab('pcToward'), grab('pcCode5'), grab('pcIsBiz'), grab('pcAddBiz'), grab('pcYen'), grab('pcMd'),
  grab('pcRangeBucket'), grab('pcPlan'), grab('_fetchPretrade', 'async '), grab('loadPretrade', 'async '),
  grab('_pcErrText'), grab('renderPretrade'), grab('checkMacroWarning'),
].join('\n'), sb);
const run = c => vm.runInContext(c, sb);

const RULES = { capital_jpy: 2500000, risk_per_trade_pct: 0.015, stop_loss_pct: 0.08, safety_stop_pct: 0.12,
  target_rr: 2, breakeven_trigger_rr: 1, time_stop_days: 10, max_positions: 5, max_position_pct: 0.4,
  max_total_exposure_pct: 1.0, lot_size: 100 };
const RATES = { measured_on: '2026-11-12', condition: '過去の数え',
  buckets: [{ lo: 0, hi: 2, close_m8: 0.062 }, { lo: 2, hi: 3, close_m8: 0.117 }, { lo: 3, hi: 4, close_m8: 0.207 },
            { lo: 4, hi: 5, close_m8: 0.29 }, { lo: 5, hi: 6.5, close_m8: 0.357 }, { lo: 6.5, hi: null, close_m8: 0.493 }] };
const STORM = { regime: 'storm', as_of: '2026-11-11', size_factor: 0.5, icon: '⛈', words: '荒れ',
  guidance: '新規は押し目の反発を確認してから・ポジションサイズ50%' };
const HALT = { regime: 'halt', as_of: '2026-11-11', size_factor: 0, icon: '🔴', words: '停止', guidance: '新規エントリーは見送り' };
const NORMAL = { regime: 'normal', as_of: '2026-11-11', size_factor: 1, icon: '🟢', words: '通常', guidance: '通常運転' };

console.log('■ 値幅の区切り (bot の range_bucket と同じ境目)');
sb.__R = RATES;
chk(run('pcRangeBucket(__R, 1.5)').close_m8 === 0.062 && run('pcRangeBucket(__R, 2.0)').close_m8 === 0.117,
    '1.5% → 2% 未満 / 2.0% → 2〜3% (境目は上の区切り)');
chk(run('pcRangeBucket(__R, 5.08)').close_m8 === 0.357 && run('pcRangeBucket(__R, 12)').close_m8 === 0.493, '5.08% → 5〜6.5% / 12% → 6.5% 以上');
chk(run('pcRangeBucket(__R, null)') === null && run('pcRangeBucket(null, 3)') === null, '値幅か数えが無ければ null');

console.log('■ 計画の大きさに地合いの倍率');
const base = { price: 1500, code5: '39410', buyDate: '2026-11-12', rules: RULES, holidays: [], holdings: [] };
sb.__n = Object.assign({}, base, { regime: NORMAL });
sb.__s = Object.assign({}, base, { regime: STORM });
sb.__h = Object.assign({}, base, { regime: HALT });
sb.__x = Object.assign({}, base, { regime: null });
const rn = run('pcPlan(__n)'), rs = run('pcPlan(__s)'), rh = run('pcPlan(__h)'), rx = run('pcPlan(__x)');
chk(rn.planJpy === 468750 && rn.planShares === 300 && rn.sizeFactor === 1, 'normal: 468,750 円 → 300 株');
chk(rs.planJpy === 234375 && rs.basePlanJpy === 468750 && rs.planShares === 100 && rs.shares === 100 && rs.sizeFactor === 0.5,
    'storm: 半分の 234,375 円 → 100 株');
chk(rh.planJpy === 0 && rh.planShares === 0 && !rh.checks[3].ok && /見送り/.test(rh.checks[3].text), 'halt: 計画 0 円・⚠️ 新規は見送りの決まり');
chk(rx.planJpy === 468750 && rx.sizeFactor === 1 && rx.regime === null, '地合いが無いときは倍率 1 (画面で「取得できず」と書く)');
sb.__s2 = Object.assign({}, base, { regime: STORM, shares: 300 });
const rs2 = run('pcPlan(__s2)');
chk(!rs2.checks[3].ok && /234,375円 を超えています/.test(rs2.checks[3].text), 'storm に 300 株 (45 万円) は計画超え ⚠️');

console.log('■ 画面');
const API = 'https://api.github.com/repos/hiroki300/trade-journal-private';
const pay = regime => ({ schema_version: 2, as_of: '2026-11-11', rules: RULES, holidays: [], regime,
  range_base_rates: RATES, stocks: { '39410': { n: 'レンゴー', s: 'パルプ・紙', c: 1504.5, r: 2.3 },
                                     '49710': { n: 'メック', s: '化学', c: 5410, r: 6.14 } }, facts: {} });
const FORBID = ['買え', '売れ', '買い時', '売り時', '狙い目', 'おすすめ', '推奨', '割安', '有望', '上がる', '下がる', '仕込', '反発する'];
(async () => {
  store.tj_ghpat = 'x';
  for (const [label, reg, expect] of [
    ['storm', STORM, out => /⛈ storm/.test(out) && /11\/11/.test(out) && /ポジションサイズ50%/.test(out) && /× 地合い 50%/.test(out) && /234,375円/.test(out)],
    ['halt', HALT, out => /🔴 halt/.test(out) && /新規エントリーは見送り/.test(out) && /× 地合い 0%/.test(out)],
    ['normal', NORMAL, out => /🟢 normal/.test(out) && !/× 地合い/.test(out) && /468,750円/.test(out)],
    ['取得できず', null, out => /地合いは取得できず/.test(out) && /株数に地合いは入っていません/.test(out)],
  ]) {
    run('_pc = null'); responses = { [API + '/contents/pretrade.json?ref=main']: [200, pay(reg)] };
    elem('pcCode').value = '3941'; elem('pcPrice').value = ''; elem('pcShares').value = '';
    await run('loadPretrade(true)');
    const out = elem('pcOut').innerHTML;
    chk(expect(out), `地合い ${label} の行と計画の上限`);
    chk(FORBID.every(w => !out.includes(w)), `地合い ${label}: 売買をすすめる言葉・向きの予想が無い`);
  }
  run('_pc = null'); responses = { [API + '/contents/pretrade.json?ref=main']: [200, pay(STORM)] };
  elem('pcCode').value = '4971';
  await run('loadPretrade(true)');
  let out = elem('pcOut').innerHTML;
  chk(/終値で -8% 以下になった回が 36%/.test(out) && /過去 10 年の数え・予想ではありません/.test(out), '値幅 6.1% の株: 5〜6.5% の区切りの 36%');
  chk(/1単元 \(100株\) でも/.test(out), 'storm でメック 5,410 円 × 100 株 (54 万円) は 1 単元でも計画超え ⚠️');

  console.log('■ 古い pretrade.json (schema 1・regime の項目なし)');
  const old = pay(null); delete old.regime; delete old.range_base_rates; old.schema_version = 1;
  run('_pc = null'); responses = { [API + '/contents/pretrade.json?ref=main']: [200, old] };
  elem('pcCode').value = '3941';
  await run('loadPretrade(true)');
  out = elem('pcOut').innerHTML;
  chk(/地合いは取得できず/.test(out) && /468,750円/.test(out) && !/-8% 以下になった回/.test(out), '項目が無ければ「取得できず」・満額・値幅の数えは出さない');

  console.log('■ 地合いのポップアップ (説明書 06 の言葉)');
  for (const reg of ['storm', 'halt']) {
    delete store.tj_macro_warned_at; alerts.length = 0;
    sb.window._macroData = { regime: reg, summary: '' };
    run('checkMacroWarning()');
    const m = alerts[0] || '';
    chk(m && !/推奨/.test(m) && !/損切り幅も狭め/.test(m), `${reg}: 説明書に無い言葉 (推奨・損切り幅も狭めに) が無い`);
    chk(reg === 'storm' ? /ポジションサイズ 50%/.test(m) && /半分/.test(m) : /見送り/.test(m), `${reg}: アプリの決まりと 🧮 の株数への効き方`);
  }

  console.log(bad ? `\n❌ ${bad} 件 NG` : '\n✅ すべて OK');
  process.exit(bad ? 1 : 0);
})();
