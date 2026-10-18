/**
 * 保有の取得日を画面で直せる (2026-10-18) の回帰テスト。
 *
 *   node tests/pr20_hold_date_edit_2026_10_18.test.js
 *
 * 背景: 2026 年に取得した三菱商事・三井住友FG を 2024 年と入れていて、ボットの建玉チェックが
 * 2024 年の値動きで「🛑 損切りライン到達」と「⏰ 保有 約 500 日」を毎日出していた (警告 5 件中 4 件)。
 * 保有の 📅 は表示だけで、直す方法が無かった。
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
const sb = { Date, String, Number };
vm.createContext(sb);
vm.runInContext(grab('holdDateProblem'), sb);
const run = c => vm.runInContext(c, sb);

console.log('--- 取得日の妥当性 ---');
chk(run("holdDateProblem('2026-09-28', '2026-10-18')") === '', '正しい日付は通す');
chk(run("holdDateProblem('2026-10-19', '2026-10-18')") === '未来の日付です', '未来は弾く');
chk(run("holdDateProblem('2026-02-30', '2026-10-18')") === '存在しない日付です', '存在しない日付は弾く');
chk(run("holdDateProblem('2016-01-01', '2026-10-18')") === '10 年より前の日付です', '10 年より前は弾く');
chk(run("holdDateProblem('2026/09/28', '2026-10-18')").startsWith('日付の形'), '形が違えば弾く');

console.log('--- 画面と保存 ---');
chk(grab('hHTML').includes('onchange="uDT('), '保有カードの 📅 が入力欄になっている');
const u = grab('uDT');
chk(u.includes('h.dt_unknown = false'), '直した取得日は事実として扱う (建日不明を外す)');
chk(u.includes('maybeAutoPublish()'), '直したらボットに送る (建玉チェックに今夜から反映)');
chk(u.includes('confirm('), '直す前に確かめる');

scripts.forEach((src, i) => { try { new vm.Script(src); } catch (e) { chk(false, `inline <script> #${i} 構文エラー: ${e.message}`); } });
console.log(bad ? `\nRESULT: ${bad} NG` : '\nRESULT: OK');
process.exit(bad ? 1 : 0);
