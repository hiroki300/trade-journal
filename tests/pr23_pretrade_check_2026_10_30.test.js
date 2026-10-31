/**
 * 💱 売買タブの「🧮 買う前の確認」(2026-10-30・stock-checker の pretrade_facts.py / private_publish.py)。
 *
 *   node tests/pr23_pretrade_check_2026_10_30.test.js
 *
 * bot は毎晩、非公開リポ trade-journal-private の pretrade.json に
 * {as_of, rules, holidays, stocks:{5桁:{n,s,c,r}}, facts:{5桁:{next_earnings, ex, last_disclosure}}} を書く。
 * - 株数は position_sizer と同じ式 (資産 × 1.5% ÷ 8%・1 銘柄 40% で頭打ち・100 株単位で切り下げ)
 * - SBI に写す値段は呼値にそろえ、買値に近い側へ丸める (保険は -12% より深くならない・利確は +16% より遠くならない)
 * - 期限は 10 営業日 (土日・祝日・12/31〜1/3 を除く)
 * - 上限 (5 銘柄・1 銘柄 40%・合計 100%・計画の大きさ) を超えたら ⚠️
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
const calls = [];
const sb = {
  console, JSON, Promise, String, Number, Array, Object, Math, Set, Date,
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
                  removeItem: k => { delete store[k]; } },
  document: { getElementById: id => elem(id) },
  window: {},
  ymdJST: () => '2026-10-30',
  H: [],
  fetch: async (url, opt) => {
    calls.push({ url, opt });
    const r = responses[url];
    if (r === 'throw') throw new Error('offline');
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
  grab('pcPlan'), grab('_fetchPretrade', 'async '), grab('loadPretrade', 'async '), grab('_pcErrText'), grab('renderPretrade'),
].join('\n'), sb);
const run = c => vm.runInContext(c, sb);

const RULES = { capital_jpy: 2500000, risk_per_trade_pct: 0.015, stop_loss_pct: 0.08, safety_stop_pct: 0.12,
  target_rr: 2, breakeven_trigger_rr: 1, time_stop_days: 10, max_positions: 5, max_position_pct: 0.4,
  max_total_exposure_pct: 1.0, lot_size: 100 };
const HOL = ['2026-11-03', '2026-11-23'];
chk(run('PC_DEFAULT_RULES.safety_stop_pct') === 0.12 && run('PC_DEFAULT_RULES.stop_loss_pct') === 0.08,
    'データが無いときの既定: 保険の逆指値 -12% (stock-checker の config.SAFETY_STOP_PCT と同じ)・損切り -8%');

console.log('■ 呼値・丸め・営業日');
chk(run('pcTick(2850)') === 1 && run('pcTick(3000)') === 1 && run('pcTick(3001)') === 5 && run('pcTick(31000)') === 50,
    '呼値: 3,000 円以下は 1 円・5,000 円以下は 5 円・3 万円を超えると 50 円');
chk(run('pcToward(2422.5, 2850)') === 2423, '保険の逆指値は買値の側 (上) へ: 2,422.5 → 2,423');
chk(run('pcToward(3570.2, 4200)') === 3575 && run('pcToward(4872, 4200)') === 4870, '5 円刻み: 3,570.2 → 3,575 (浅く) / 4,872 → 4,870 (近く)');
chk(run('pcToward(3305, 2850)') === 3305 && run('pcToward(3306, 2850)') === 3305, '刻みちょうどはそのまま・3,000 円を超えると 5 円刻み (3,306 → 3,305)');
chk(run('pcCode5("3778")') === '37780' && run('pcCode5("581a")') === '581A0' && run('pcCode5("37780")') === '37780', 'コードは 5 桁へ');
chk(run(`pcAddBiz('2026-10-30', 10, ${JSON.stringify(HOL)})`) === '2026-11-16', '10/30 (金) + 10 営業日 = 11/16 (月) (11/3 の祝日を除く)');
chk(run(`pcAddBiz('2026-12-28', 3, [])`) === '2027-01-04', '年末年始 (12/31〜1/3) は数えない');
chk(run(`pcIsBiz('2026-10-31', [])`) === false && run(`pcIsBiz('2026-11-03', ${JSON.stringify(HOL)})`) === false, '土曜・祝日は営業日でない');

console.log('■ 計算 (2026-10-30 の保有 6 銘柄・428 万円で 3778 を 2,850 円)');
const HOLD = [['80580', 972400], ['83160', 338270], ['65030', 980200], ['49710', 635000], ['70140', 421850], ['581A0', 930000]]
  .map(([c, v]) => ({ code5: c, name: c, value: v, sector: c === '65030' ? '電気機器' : '' }));
sb.__o = { price: 2850, code5: '37780', buyDate: '2026-10-30', rules: RULES, holidays: HOL, sector: '情報・通信業',
           holdings: HOLD, facts: { next_earnings: '2027-02-05', ex: { last_buy_date: '2027-03-29', ex_date: '2027-03-30', kind: '期末' },
                                    last_disclosure: { date: '2026-10-28', label: '決算発表(2Q)' } } };
const res = run('pcPlan(__o)');
chk(res.planJpy === 468750 && res.planShares === 100 && res.shares === 100 && res.cost === 285000, '計画 468,750 円 → 100 株 = 285,000 円');
chk(res.stop === 2622 && res.safety === 2508 && res.breakeven === 3078 && res.target === 3305, '損切り 2,622 / 保険 2,508 / 建値の目安 3,078 / 利確 3,305 (5 円刻み)');
chk(res.deadline === '2026-11-16', '期限 11/16');
chk(res.riskJpy === 22800 && res.riskPct === 0.9, '損切りの損 22,800 円 = 資産の 0.9%');
const txt = res.checks.map(c => (c.ok ? 'OK ' : 'NG ') + c.text);
chk(!res.checks[0].ok && /銘柄数 7 \(上限 5\)/.test(res.checks[0].text), '⚠️ 銘柄数 7 (上限 5)');
chk(!res.checks[1].ok && /資産の 183%/.test(res.checks[1].text), '⚠️ 合計 資産の 183% (上限 100%): ' + res.checks[1].text);
chk(res.checks[2].ok && res.checks[3].ok, '✅ 1 銘柄 11%・✅ 計画の大きさ以内');
chk(res.over === 2, '超えている上限は 2 つ');
chk(res.earnings.inWindow === false && res.ex.inWindow === false, '決算の推定・権利落ちは期間の外');

console.log('■ 株数を自分で入れた・1 単元でも計画を超える・同じ銘柄の買い増し');
sb.__o2 = Object.assign({}, sb.__o, { shares: 300, holdings: [] });
const r2 = run('pcPlan(__o2)');
chk(r2.shares === 300 && !r2.checks[3].ok && /計画の大きさ 468,750円 を超えています/.test(r2.checks[3].text), '300 株 (85.5 万円) は計画超え ⚠️');
sb.__o3 = Object.assign({}, sb.__o, { price: 5000, holdings: [] });
const r3 = run('pcPlan(__o3)');
chk(r3.planShares === 0 && r3.shares === 100 && !r3.checks[3].ok && /1単元 \(100株\) でも/.test(r3.checks[3].text), '5,000 円 × 100 株 = 50 万円 は 1 単元でも計画超え ⚠️');
sb.__o4 = Object.assign({}, sb.__o, { holdings: [{ code5: '37780', name: 'さくら', value: 800000, sector: '情報・通信業' }] });
const r4 = run('pcPlan(__o4)');
chk(!r4.checks[2].ok && /1銘柄 資産の 43%/.test(r4.checks[2].text) && /銘柄数 1/.test(r4.checks[0].text), '買い増しは銘柄数を増やさず、1 銘柄の割合に足す (43% ⚠️)');
chk(r4.sameSector.length === 0, '同じ銘柄は「同じ業種の保有」に数えない');
sb.__o5 = Object.assign({}, sb.__o, { sector: '電気機器', facts: { next_earnings: '2026-11-10' } });
const r5 = run('pcPlan(__o5)');
chk(r5.sameSector.length === 1 && r5.earnings.inWindow === true, '同じ業種の保有 1 件・決算の推定 11/10 は期間中 ⚠️');

console.log('■ 画面 (データあり)');
const PAY = { as_of: '2026-10-30', rules: RULES, holidays: HOL,
  stocks: { '37780': { n: 'さくらインターネット', s: '情報・通信業', c: 2850, r: 3.2 } },
  facts: { '37780': sb.__o.facts } };
const API = 'https://api.github.com/repos/hiroki300/trade-journal-private';
(async () => {
  store.tj_ghpat = 'x';
  responses = { [API + '/contents/pretrade.json?ref=main']: [200, PAY] };
  sb.H = [{ cd: '6503', nm: '三菱電機', sh: 200, bp: 4901 }];
  elem('pcCode').value = '3778';
  await run('loadPretrade(true)');
  const out = elem('pcOut').innerHTML;
  chk(calls[0].opt.headers.Authorization === 'Bearer x' && /raw/.test(calls[0].opt.headers.Accept), '売買記録と同じ鍵で非公開リポから読む');
  chk(/さくらインターネット/.test(out) && /100株 = 285,000円/.test(out), '値段が空なら終値で計算・銘柄名');
  chk(/2,508円/.test(out) && /3,305円/.test(out) && /SBI に写す値段/.test(out), 'SBI に写す値段 (逆指値・指値)');
  chk(/11\/16\(月\)/.test(out), '期限の日付');
  chk(/1日 3\.2%/.test(out) && /約 2\.5 日分/.test(out), 'ふだんの値幅');
  chk(/決算の推定 2\/5/.test(out) && /権利付最終日 3\/29/.test(out) && /直近の開示 10\/28/.test(out), '決算の推定・権利落ち・直近の開示');
  chk(/OCO/.test(out) && /未検証/.test(out), 'OCO は未検証と書く');
  chk(store[sb.PC_CACHE_KEY || 'tj_pretrade'] !== undefined, '端末に控える');
  const FORBID = ['買え', '売れ', '買い時', '売り時', '狙い目', 'おすすめ', '推奨', '割安', '有望', '上がる', '下がる', '仕込'];
  chk(FORBID.every(w => !out.includes(w)), '売買をすすめる言葉・向きの予想が無い');

  console.log('■ 値段を手で入れる・データに無い銘柄');
  elem('pcPrice').value = '2,900';
  run('renderPretrade()');
  chk(/2,900円/.test(elem('pcOut').innerHTML) && !/の終値\)/.test(elem('pcOut').innerHTML.split('</div>')[0]), '入れた値段を優先 (終値の注記を出さない)');
  elem('pcPrice').value = ''; elem('pcCode').value = '9999';
  run('renderPretrade()');
  chk(/値段のデータに無い銘柄/.test(elem('pcOut').innerHTML), '無い銘柄は「値段を入れてください」');
  elem('pcPrice').value = '1000';
  run('renderPretrade()');
  chk(/400株/.test(elem('pcOut').innerHTML) && /会社の IR で確かめて/.test(elem('pcOut').innerHTML), '手入力でも計算・決算日は自分で確かめると書く');

  console.log('■ 鍵が無い・まだ無い・見えない');
  run('_pc = null'); delete store.tj_ghpat; delete store.tj_pretrade;
  await run('loadPretrade(true)');
  chk(/鍵 \(PAT\) が無い/.test(elem('pcStatus').innerHTML), '鍵が無い');
  store.tj_ghpat = 'x'; run('_pc = null'); responses = { [API]: 200 };
  await run('loadPretrade(true)');
  chk(/まだ届いていません/.test(elem('pcStatus').innerHTML), 'ファイルがまだ無い (リポは見える)');
  run('_pc = null'); responses = { [API]: 404 };
  await run('loadPretrade(true)');
  chk(/非公開リポが見えません/.test(elem('pcStatus').innerHTML), 'リポが見えない (404 を「まだ無い」と混ぜない)');
  run('_pc = null'); responses = { [API + '/contents/pretrade.json?ref=main']: 401 };
  await run('loadPretrade(true)');
  chk(/期限切れ/.test(elem('pcStatus').innerHTML), '鍵の期限切れ');

  console.log('■ 30 分に 1 回まで取り直す');
  run('_pc = null'); responses = { [API + '/contents/pretrade.json?ref=main']: [200, PAY] }; calls.length = 0;
  await run('loadPretrade()'); await run('loadPretrade()');
  chk(calls.length === 1, '続けて開いても取り直さない');

  console.log('■ 配線');
  chk(/if \(id==='trade'\) \{[^}]*loadPretrade\(\)/.test(all), '💱 売買タブを開いたら読む');
  chk(/id="pcCode"[^>]*oninput="renderPretrade\(\)"/.test(HTML) && /id="pcOut"/.test(HTML), '入力で計算し直す');

  console.log(bad ? `\n❌ ${bad} 件 NG` : '\n✅ すべて OK');
  process.exit(bad ? 1 : 0);
})();
