/**
 * 「自分で決めたルール」を「今の売買ルール」に (2026-11-03・stock-checker #152 に合わせる) の回帰テスト。
 *
 *   node tests/pr25_rule_wording_2026_11_03.test.js
 *
 * 背景: 2026-11-02 にユーザーが「10 日以内で売る縛りをつけた気はない」と指摘した。記録を調べると、
 * 売買ルールの多く (-8% の幅・RR 1:2・+1R で損切りを買値へ・5 銘柄・1 銘柄 40%・1 回 1.5%) はアプリの既定で、
 * ユーザーが決めたのは一部 (-8% を終値で判断・保険の逆指値・合計 100%・10 日のまま など) だった。
 * 画面ではルール全体を「自分で決めた」とまとめず、「今の売買ルール」とだけ書く (11/03 にユーザーが案 A を選んだ)。
 * 誰が決めたかの内訳は stock-checker の説明書 docs/notebooklm/06_売買ルールと記録のしかた.md の表。
 * - 🧮 買う前の確認の注記: 「※ 算術と、今の売買ルールとの照合です。売買の判断はご自身で。」
 * - index.html のどこにも (コメントも)、ルール全体を「自分で決めた」とまとめる言い方を置かない
 */
'use strict';
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
const constBlock = name => {
  const i = all.indexOf('const ' + name + ' =');
  if (i < 0) throw new Error(name + ' not found');
  return all.slice(i, all.indexOf(';', i) + 1);
};

// stock-checker の tests/test_rule_wording_2026_11_03.py と同じ型
const LUMPED = /自分で決めた(?:売買の?|出口)?(?:ルール|上限)|自分で決めた\s*[−-]\s*8|(?:自分|あなた)の(?:ルール|規則)/;
const NOTE = '※ 算術と、今の売買ルールとの照合です。売買の判断はご自身で。';

console.log('■ index.html (コメントも)');
const hits = HTML.split('\n').map((t, i) => [i + 1, t]).filter(([, t]) => LUMPED.test(t));
hits.forEach(([n, t]) => console.log(`      ${n}: ${t.trim().slice(0, 120)}`));
chk(hits.length === 0, 'ルール全体を「自分で決めた」とまとめる言い方が無い');

console.log('■ 🧮 買う前の確認の注記 (データが無く、値段を手で入れたとき)');
const els = {};
const elem = id => (els[id] = els[id] || { innerHTML: '', value: '', placeholder: '' });
const sb = {
  console, JSON, String, Number, Array, Object, Math, Set, Date,
  document: { getElementById: id => elem(id) },
  window: {},
  ymdJST: () => '2026-11-04',
  H: [],
};
vm.createContext(sb);
vm.runInContext([
  constBlock('PC_DEFAULT_RULES'), 'let _pc = null;',
  grab('_escape'), grab('_num'), grab('_marketScheduleHtml'),
  grab('pcTick'), grab('pcToward'), grab('pcCode5'), grab('pcIsBiz'), grab('pcAddBiz'), grab('pcYen'), grab('pcMd'),
  grab('pcPlan'), grab('_pcErrText'), grab('renderPretrade'),
].join('\n'), sb);
elem('pcCode').value = '3778';
elem('pcPrice').value = '2850';
vm.runInContext('renderPretrade()', sb);
const out = elem('pcOut').innerHTML;
chk(/100株/.test(out), '計算の結果が出る (前提の確認)');
chk(out.includes(NOTE), '注記は「' + NOTE + '」');
chk(!out.includes('自分で決めた') && !LUMPED.test(out), '注記に「自分で決めた」を出さない (誰が決めたかは書き足さない・案 A)');

console.log(bad ? `\n❌ ${bad} 件 NG` : '\n✅ すべて OK');
process.exit(bad ? 1 : 0);
