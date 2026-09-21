/**
 * スクショ取り込みの順番はどちらが正しいか、実際に動かして確かめる。
 *
 *   node tests/pr10_import_order_2026_09_21.test.js
 *
 * ユーザーの問い (2026-09-21):
 *   「保有銘柄 → 約定履歴 の順でいいか？ 新規取引があった事実は約定のほうが
 *     早く分かるので、理解の順番としては約定が先のほうがいいのでは」
 *
 * 想定シナリオ (毎日運用):
 *   その日に X を新規で100株買い、前から持っていた Y を100株売った。
 *   → 保有スクショには X だけが写り、Y は消えている。
 *   → 約定履歴スクショには「X 買」「Y 売」の2行が写る。
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

const store = {};
const sb = {
  console, Date, JSON, Math, isNaN, String, Number, parseInt, parseFloat, Set, Array, Object,
  TODAY: '2026-09-24',
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  },
};
sb.window = sb;
vm.createContext(sb);
vm.runInContext([
  grab('_num'), grab('_isOpenAction'), grab('positionPnl'),
  grab('applyHoldImport'), grab('applyHistImport'),
  grab('getPendingExits'), grab('setPendingExits'),
  grab('addPendingExits'), grab('clearPendingExitsFor'),
].join('\n'), sb);
const run = c => vm.runInContext(c, sb);

// ── シナリオの素材 ────────────────────────────────────────────
// 前日時点の保有: X なし / Y 100株 @2000 (建日不明=保有スクショ由来)
const H0 = [{ cd: '9999', nm: 'Y社', sh: 100, bp: 2000, cp: 2100, type: 'spot',
              dt: '2026-09-01', dt_unknown: true }];
// 今日の保有スクショ: X だけ (Y は売って消えた)
const HOLD_SS = [{ code: '1111', name: 'X社', shares: 100, buy_price: 3000, current_price: 3050,
                   type: 'spot' }];
// 今日の約定履歴スクショ
const HIST_SS = [
  { action: 'buy',  code: '1111', name: 'X社', shares: 100, price: 3000, date: '2026-09-24', type: 'spot' },
  { action: 'sell', code: '9999', name: 'Y社', shares: 100, price: 2200, date: '2026-09-24', type: 'spot' },
];

function fresh() { for (const k of Object.keys(store)) delete store[k]; }
sb.H0 = H0; sb.HOLD_SS = HOLD_SS; sb.HIST_SS = HIST_SS;

// ── 順番A: 保有 → 約定履歴 (「履歴だけ」ON = 現行の手引き) ─────
console.log('--- 順番A: 保有 → 約定履歴（「履歴だけ」ON）---');
fresh();
let A = run(`
  const a1 = applyHoldImport(H0, HOLD_SS, {removeMissing: true});
  addPendingExits(a1.removed, TODAY);
  const a2 = applyHistImport(a1.H, [], 100000, HIST_SS, {touchHoldings: false});
  clearPendingExitsFor(HIST_SS);
  ({H: a2.H, T: a2.T, cash: a2.cash, pending: getPendingExits()})
`);
chk(A.H.length === 1 && A.H[0].cd === '1111', `保有は X だけ (${A.H.map(h => h.cd)})`);
chk(A.H[0].sh === 100, `X は 100株 (${A.H[0].sh})`);
chk(A.pending.length === 0, `決済の記録待ちは消える (${A.pending.length})`);
chk(A.T.length === 2, `取引ログに2行 (${A.T.length})`);
const aSell = A.T.find(t => t.a === 'sell');
chk(aSell.pnl === null, '⚠️ 売りの損益 (pnl) が null になる（保有が先に消えているため）');
chk(A.H[0].dt_unknown === true, '⚠️ X の建日が「不明」のまま（保有スクショに日付が無い）');
chk(A.cash === 100000, `⚠️ 残金が動かない (${A.cash})`);

// ── 順番B: 約定履歴 → 保有 (「履歴だけ」OFF = ユーザー提案) ────
console.log('--- 順番B: 約定履歴 → 保有（「履歴だけ」OFF）---');
fresh();
let B = run(`
  const b1 = applyHistImport(H0, [], 100000, HIST_SS, {touchHoldings: true});
  clearPendingExitsFor(HIST_SS);
  const b2 = applyHoldImport(b1.H, HOLD_SS, {removeMissing: true});
  addPendingExits(b2.removed, TODAY);
  ({H: b2.H, T: b1.T, cash: b1.cash, pending: getPendingExits(), removed: b2.removed})
`);
chk(B.H.length === 1 && B.H[0].cd === '1111', `保有は X だけ (${B.H.map(h => h.cd)})`);
chk(B.H[0].sh === 100, `X は 100株・二重計上なし (${B.H[0].sh})`);
chk(B.pending.length === 0, `決済の記録待ちは出ない (${B.pending.length})`);
chk(B.T.length === 2, `取引ログに2行 (${B.T.length})`);
const bSell = B.T.find(t => t.a === 'sell');
chk(bSell.pnl === 20000, `✅ 売りの損益が出る (${bSell.pnl} = (2200-2000)×100)`);
chk(B.H[0].dt_unknown === false, '✅ X の建日が事実として入る（約定日 2026-09-24）');
chk(B.H[0].dt === '2026-09-24', `✅ 建日は約定日 (${B.H[0].dt})`);
chk(B.cash === 20000, `✅ 残金が約定から動く (${B.cash} = 10万 − 30万 + 22万)`);

// 現金は取り込み順に依存してはいけない (買→売 と 売→買 で答えが変わらないこと)
console.log('--- 現金が取り込み順に依存しないこと ---');
fresh();
sb.REV = [HIST_SS[1], HIST_SS[0]];   // 売りが先に写っているスクショ
const F1 = run('applyHistImport(H0, [], 100000, HIST_SS, {touchHoldings: true}).cash');
const F2 = run('applyHistImport(H0, [], 100000, REV, {touchHoldings: true}).cash');
chk(F1 === F2, `買→売 (${F1}) と 売→買 (${F2}) で残金が一致する`);
chk(F1 === 20000, `どちらも 20,000円 (${F1})`);
fresh();
sb.BIGBUY = [{action:'buy', code:'2222', name:'Z', shares:1000, price:5000, date:'2026-09-24', type:'spot'}];
chk(run('applyHistImport([], [], 100000, BIGBUY, {touchHoldings: true}).cash') === 0,
    '残金が足りない買いでも 0 で止まる (マイナスにしない)');

// ── 順番B は保有スクショで自己修正できるか ────────────────────
console.log('--- 順番B は約定履歴の取りこぼしを保有スクショで直せるか ---');
fresh();
const PARTIAL = [HIST_SS[1]];   // 売りだけ写っていて、買いが画面外だった
sb.PARTIAL = PARTIAL;
let C = run(`
  const c1 = applyHistImport(H0, [], 100000, PARTIAL, {touchHoldings: true});
  const c2 = applyHoldImport(c1.H, HOLD_SS, {removeMissing: true});
  ({H: c2.H})
`);
chk(C.H.length === 1 && C.H[0].cd === '1111' && C.H[0].sh === 100,
    '✅ 約定履歴に写っていなかった X も、保有スクショで保有に入る');

// ── 順番A で「履歴だけ」を切り忘れたら何が起きるか ─────────────
console.log('--- 順番A で「履歴だけ」を切り忘れた場合（事故の再現）---');
fresh();
let D = run(`
  const d1 = applyHoldImport(H0, HOLD_SS, {removeMissing: true});
  const d2 = applyHistImport(d1.H, [], 100000, HIST_SS, {touchHoldings: true});
  ({H: d2.H})
`);
const dx = D.H.find(h => h.cd === '1111');
chk(dx && dx.sh === 200,
    `⚠️ X が 200株 に二重計上される (${dx ? dx.sh : 'なし'}) — 順番A はチェックボックス頼み`);

// ── 同じスクショを2回取り込んでも増えないこと ────────────────
console.log('--- 二重取り込みの防止（順番B）---');
fresh();
let E = run(`
  const e1 = applyHistImport(H0, [], 100000, HIST_SS, {touchHoldings: true});
  const e2 = applyHistImport(e1.H, e1.T, e1.cash, HIST_SS, {touchHoldings: true});
  ({T: e2.T, skipped: e2.skipped, H: e2.H})
`);
chk(E.T.length === 2, `2回取り込んでも取引ログは2行 (${E.T.length})`);
chk(E.skipped.length === 2, `2行とも「記録済み」で弾かれる (${E.skipped.length})`);

console.log(bad ? `\nRESULT: ${bad} NG` : '\nRESULT: OK');
process.exit(bad ? 1 : 0);
