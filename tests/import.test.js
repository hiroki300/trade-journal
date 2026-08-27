#!/usr/bin/env node
/**
 * tests/import.test.js — 売買タブのスクリーンショット取り込みロジックの回帰テスト。
 *
 * 実行:  node tests/import.test.js
 *
 * このリポジトリは単一 HTML ファイル (index.html) で、package.json も
 * テストランナーも無い。ロジックは <script> の中の関数として存在するため、
 * ここでは index.html から純粋関数のソースだけを文字列で抜き出し、
 * vm モジュールで評価して実行する (Node 標準機能のみ・依存追加なし)。
 *
 * 対象は DOM に依存しない純粋関数のみ:
 *   _num / _normAction / _normType / _isOpenAction / positionPnl /
 *   typeLabel / typeBadge / applyHoldImport / applyHistImport /
 *   applyPnlImport / applyWatchImport
 *
 * これらは 2026-08-27 の overhaul で doImport() (145行・DOM直結) から
 * 切り出された。以前は手動でしかテストできず、同じバグ (現金が更新され
 * ない・分割約定が消える・売却済み銘柄が残る等) が繰り返し発生していた。
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const INDEX_HTML = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX_HTML, 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const allSource = scripts.join('\n');

function extractFunction(name) {
  const idx = allSource.indexOf(`function ${name}(`);
  if (idx < 0) throw new Error(`index.html 内に function ${name}( が見つかりません`);
  let depth = 0;
  let i = allSource.indexOf('{', idx);
  const start = i;
  for (; i < allSource.length; i++) {
    if (allSource[i] === '{') depth++;
    else if (allSource[i] === '}') { depth--; if (depth === 0) break; }
  }
  return allSource.slice(idx, i + 1);
}

const FN_NAMES = [
  '_num', '_normAction', '_normType', '_isOpenAction', 'positionPnl',
  'typeLabel', 'typeBadge',
  'applyHoldImport', 'applyHistImport', 'applyPnlImport', 'applyWatchImport',
];

const sandbox = { console, TODAY: '2026-08-27' };
vm.createContext(sandbox);
vm.runInContext(FN_NAMES.map(extractFunction).join('\n'), sandbox);

function run(code) {
  return vm.runInContext(code, sandbox);
}
function set(name, value) {
  sandbox[name] = value;
}

// ── ミニテストランナー (依存を増やさないため自前) ──
let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
  }
}

// ════════════════════════════════════════════════════════════
//  _num — 全角/カンマ/円・株の単位を落として数値化
// ════════════════════════════════════════════════════════════
test('_num: カンマ区切りを数値化する', () => {
  assert.equal(run('_num("1,234")'), 1234);
});
test('_num: 全角数字を数値化する', () => {
  assert.equal(run('_num("１２３４")'), 1234);
});
test('_num: 単位付き文字列 ("円") を数値化する', () => {
  assert.equal(run('_num("1,234円")'), 1234);
});
test('_num: 単位付き文字列 ("株") を数値化する', () => {
  assert.equal(run('_num("100株")'), 100);
});
test('_num: null/空文字/非数値は null を返す (0 に化けない)', () => {
  assert.equal(run('_num(null)'), null);
  assert.equal(run('_num("")'), null);
  assert.equal(run('_num("abc")'), null);
});
test('_num: 数値はそのまま通す (小数含む)', () => {
  assert.equal(run('_num(2850.5)'), 2850.5);
});

// ════════════════════════════════════════════════════════════
//  _normAction — 生の売買表記をリテラルな buy/sell に正規化
// ════════════════════════════════════════════════════════════
test('_normAction: 大文字/日本語表記を正規化する', () => {
  assert.equal(run('_normAction("SELL")'), 'sell');
  assert.equal(run('_normAction("売")'), 'sell');
  assert.equal(run('_normAction("新規買")'), 'buy');
});
test('_normAction: 新規/返済の接頭辞があってもリテラルな買/売のまま (反転しない)', () => {
  assert.equal(run('_normAction("返済買")'), 'buy');
  assert.equal(run('_normAction("新規売")'), 'sell');
});
test('_normAction: 不明な表記は null (買いに化けさせない)', () => {
  assert.equal(run('_normAction("なぞ")'), null);
});

// ════════════════════════════════════════════════════════════
//  _normType — type の表記ゆれ・欠損を正規化
// ════════════════════════════════════════════════════════════
test('_normType: 正しい値はそのまま通す', () => {
  assert.equal(run('_normType("margin_short","")'), 'margin_short');
  assert.equal(run('_normType("spot","")'), 'spot');
});
test('_normType: memo の「売建」表記で margin_short と判定する', () => {
  assert.equal(run('_normType("margin","信用売建 6ヵ月")'), 'margin_short');
});
test('_normType: memo の「買建」表記で margin と判定する', () => {
  assert.equal(run('_normType("","信用買建 3ヵ月")'), 'margin');
});

// ════════════════════════════════════════════════════════════
//  _isOpenAction — 「建てる」か「決済する」かの判定 (信用売建だけ逆転)
// ════════════════════════════════════════════════════════════
test('_isOpenAction: 現物・信用買いは 買=建てる/売=決済', () => {
  assert.equal(run('_isOpenAction("buy","spot")'), true);
  assert.equal(run('_isOpenAction("sell","spot")'), false);
});
test('_isOpenAction: 信用売建だけ 買(返済買)=決済/売(新規売)=建てる', () => {
  assert.equal(run('_isOpenAction("buy","margin_short")'), false);
  assert.equal(run('_isOpenAction("sell","margin_short")'), true);
});

// ════════════════════════════════════════════════════════════
//  positionPnl — 信用売建は符号が反転する
// ════════════════════════════════════════════════════════════
test('positionPnl: 現物は (現在値-取得値)*株数', () => {
  assert.equal(run('positionPnl({type:"spot",bp:1000,sh:100}, 1100)'), 10000);
});
test('positionPnl: 信用売建は値下がりで益、値上がりで損 (符号反転)', () => {
  assert.equal(run('positionPnl({type:"margin_short",bp:1000,sh:100}, 900)'), 10000);
  assert.equal(run('positionPnl({type:"margin_short",bp:1000,sh:100}, 1100)'), -10000);
});

// ════════════════════════════════════════════════════════════
//  applyHoldImport — 保有(hold)スクショの取り込み
// ════════════════════════════════════════════════════════════
test('applyHoldImport: 既存銘柄はマージ更新、新規銘柄は追加される', () => {
  set('H0', [{ cd: '7203', nm: 'トヨタ', sh: 100, bp: 2000, cp: 2000, type: 'spot', memo: '既存' }]);
  set('items1', [
    { code: '7203', name: 'トヨタ自動車', shares: 150, buy_price: 2100, current_price: 2200, type: 'spot', _memoOverride: '' },
    { code: '9984', name: 'SBG', shares: 50, buy_price: 8000, current_price: 8100, type: 'spot', _memoOverride: '新規メモ' },
  ]);
  const r = run('applyHoldImport(H0, items1, {removeMissing:false})');
  assert.equal(r.H.length, 2);
  const toyota = r.H.find(h => h.cd === '7203');
  assert.equal(toyota.sh, 150);
  assert.equal(toyota.bp, 2100);
  const sbg = r.H.find(h => h.cd === '9984');
  assert.equal(sbg.memo, '新規メモ');
  assert.equal(r.skipped.length, 0);
});

test('applyHoldImport: removeMissing で「スクショに写っていない既存ポジション」を検出する (症状: 売った銘柄が残る)', () => {
  set('H2', [
    { cd: '7203', nm: 'トヨタ', sh: 100, bp: 2000, cp: 2000, type: 'spot' },
    { cd: '9984', nm: 'SBG(売却済)', sh: 50, bp: 8000, cp: 8000, type: 'spot' },
    { cd: '6758', nm: 'ソニー(信用)', sh: 100, bp: 3000, cp: 3000, type: 'margin' },
  ]);
  set('items2', [{ code: '7203', name: 'トヨタ', shares: 100, buy_price: 2000, current_price: 2100, type: 'spot', _memoOverride: '' }]);
  const r = run('applyHoldImport(H2, items2, {removeMissing:true})');
  assert.equal(r.removed.length, 1);
  assert.equal(r.removed[0].cd, '9984');
  assert.ok(r.H.some(h => h.cd === '6758'), '撮っていない信用建玉は削除対象外で残る');
  assert.ok(!r.H.some(h => h.cd === '9984'));
});

test('applyHoldImport: スクショに写っていない区分(type)は削除の対象にしない', () => {
  set('H3', [{ cd: '1111', nm: 'A', sh: 10, bp: 100, cp: 100, type: 'margin' }]);
  set('items3', [{ code: '2222', name: 'B', shares: 10, buy_price: 200, type: 'spot', _memoOverride: '' }]);
  const r = run('applyHoldImport(H3, items3, {removeMissing:true})');
  assert.equal(r.removed.length, 0, 'spot しか撮っていないので margin の A は対象外');
});

test('applyHoldImport: コード・銘柄名とも読めない行はスキップする', () => {
  set('items4', [{ code: '', name: '', shares: 10, type: 'spot', _memoOverride: '' }]);
  const r = run('applyHoldImport([], items4, {removeMissing:false})');
  assert.equal(r.skipped.length, 1);
  assert.equal(r.H.length, 0);
});

// ════════════════════════════════════════════════════════════
//  applyHistImport — 約定履歴(hist)スクショの取り込み
// ════════════════════════════════════════════════════════════
test('applyHistImport: 分割約定 (同一コード複数行) が両方反映される (症状: 反映されないことがある)', () => {
  set('hist1', [
    { action: 'buy', code: '7203', name: 'トヨタ', shares: 100, price: 2000, date: '2026-08-01', type: 'spot' },
    { action: 'buy', code: '7203', name: 'トヨタ', shares: 200, price: 2050, date: '2026-08-02', type: 'spot' },
  ]);
  const r = run('applyHistImport([], [], 1000000, hist1)');
  assert.equal(r.H.length, 1);
  assert.equal(r.H[0].sh, 300);
  assert.equal(r.H[0].bp, Math.round((2000 * 100 + 2050 * 200) / 300 * 10) / 10);
  assert.equal(r.T.length, 2, '2行とも T に残る');
  assert.equal(r.cash, 1000000 - 2000 * 100 - 2050 * 200);
});

test('applyHistImport: 現金が買いで減り売りで増える (症状: 購入金額が反映されない)', () => {
  const r = run('applyHistImport([], [], 500000, [{action:"buy",code:"9984",name:"SBG",shares:10,price:8000,date:"2026-08-01",type:"spot"}])');
  assert.equal(r.cash, 500000 - 80000);
});

test('applyHistImport: type を見てマッチングするので現物の売りが信用建玉を消さない (症状: 売った銘柄が残る/消えすぎる)', () => {
  set('H5', [
    { cd: '7203', nm: 'トヨタ現物', sh: 100, bp: 2000, cp: 2000, type: 'spot' },
    { cd: '7203', nm: 'トヨタ信用', sh: 100, bp: 2000, cp: 2000, type: 'margin' },
  ]);
  const r = run('applyHistImport(H5, [], 0, [{action:"sell",code:"7203",name:"トヨタ",shares:100,price:2100,date:"2026-08-01",type:"spot"}])');
  assert.equal(r.H.length, 1);
  assert.equal(r.H[0].type, 'margin');
  assert.equal(r.T[0].pnl, (2100 - 2000) * 100);
});

test('applyHistImport: 信用売建の新規売=建てる、返済買=決済 (符号は positionPnl と一致)', () => {
  const open = run('applyHistImport([], [], 0, [{action:"sell",code:"7203",name:"トヨタ",shares:100,price:1000,date:"2026-08-01",type:"margin_short"}])');
  assert.equal(open.H.length, 1);
  assert.equal(open.H[0].sh, 100);
  assert.equal(open.cash, 100000, '新規売=空売り代金で現金が増える');

  set('openH', open.H);
  set('openCash', open.cash);
  const close = run('applyHistImport(openH, [], openCash, [{action:"buy",code:"7203",name:"トヨタ",shares:100,price:800,date:"2026-08-05",type:"margin_short"}])');
  assert.equal(close.H.length, 0, '返済買=決済で建玉が消える');
  assert.equal(close.T[0].pnl, 20000, '1000→800(下落)で利益 (信用売建の符号反転)');
  assert.equal(close.cash, 100000 - 80000, '返済買=買い戻し代金の支払いで現金が減る');
});

test('applyHistImport: 売買区分が不明な行はスキップする (症状: 売買が「買い」に化ける)', () => {
  const r = run('applyHistImport([], [], 0, [{action:null,code:"1234",name:"謎",shares:10,price:100,date:"2026-08-01",type:"spot"}])');
  assert.equal(r.skipped.length, 1);
  assert.equal(r.H.length, 0);
});

test('applyHistImport: 完全一致の行だけを重複除外する (株数が違えば別の取引として残す)', () => {
  set('existingT', [{ cd: '7203', type: 'spot', a: 'buy', sh: 100, p: 2000, dt: '2026-08-01' }]);
  const dup = run('applyHistImport([], existingT, 1000000, [{action:"buy",code:"7203",name:"トヨタ",shares:100,price:2000,date:"2026-08-01",type:"spot"}])');
  assert.equal(dup.skipped.length, 1, '完全一致は重複としてスキップ');
  const notDup = run('applyHistImport([], existingT, 1000000, [{action:"buy",code:"7203",name:"トヨタ",shares:50,price:2000,date:"2026-08-01",type:"spot"}])');
  assert.equal(notDup.skipped.length, 0, '株数が違うので重複扱いしない (分割約定を保護)');
});

// ════════════════════════════════════════════════════════════
//  applyPnlImport / applyWatchImport
// ════════════════════════════════════════════════════════════
test('applyPnlImport: 実現損益つきで T に追加する', () => {
  const r = run('applyPnlImport([], [{code:"7203",name:"トヨタ",realized_pnl:5000,shares:100,sell_price:2100,date:"2026-08-01"}])');
  assert.equal(r.T.length, 1);
  assert.equal(r.T[0].pnl, 5000);
});

test('applyWatchImport: 新規追加・既存は重複スキップ', () => {
  const r1 = run('applyWatchImport([], [{code:"7203",name:"トヨタ",tag:"注目"}])');
  assert.equal(r1.W.length, 1);
  set('rw1', r1);
  const r2 = run('applyWatchImport(rw1.W, [{code:"7203",name:"トヨタ",tag:"注目2"}])');
  assert.equal(r2.skipped.length, 1);
});

// ════════════════════════════════════════════════════════════
//  回帰確認: 現物ロングの FIFO/損益計算が margin_short 導入前と一致すること
// ════════════════════════════════════════════════════════════
test('回帰: 現物ロングの pnl 計算式は margin_short 導入前と完全一致', () => {
  const h = { type: 'spot', bp: 1000, sh: 50 };
  set('h', h);
  const pnl = run('positionPnl(h, 1234.5)');
  assert.equal(pnl, (1234.5 - 1000) * 50);
});

// ════════════════════════════════════════════════════════════
console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) {
  console.log('\n--- FAILURES ---');
  for (const f of failures) {
    console.log(`\n✗ ${f.name}`);
    console.log(`  ${f.error.message}`);
  }
  process.exitCode = 1;
}
