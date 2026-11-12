/**
 * 保有カードの「🛡 保険の逆指値を SBI に入れた ✅」(2026-11-12・stock-checker の設計 DESIGN_SIZE_STOP_OPEN_2026-11-12.md の B1)。
 *
 *   node tests/pr28_safety_stop_confirm_2026_11_12.test.js
 *
 * 背景: 負けた金額の 9 割は -8% を超えて持った回。保険の逆指値 (-12%) を入れたかを記録する場所が無かった。
 * SBI の期間指定の注文は発注日を含めて最長 15 営業日 (公式) → ✅ は日付つきにし、期限の目安を出す。
 * 固定すること:
 * - ✅ は {on: 日付, bp, sh} で持ち、買値か株数が変わったら効かない (逆指値の値段・株数が合わなくなる)
 * - 期限の目安 = ✅ の日を 1 日目として 15 営業日目 (土日祝を除く)
 * - 売買記録の export に safety_stop_confirmed_on (✅ が効いている建玉だけ)
 * - 押したら保存してボットに送る (maybeAutoPublish)・取り消しは確かめてから
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
scripts.forEach((src, i) => { try { new vm.Script(src); } catch (e) { chk(false, `inline <script> #${i} 構文エラー: ${e.message}`); } });

const sb = { Date, String, Number, Math, Object, Array, JSON, _pc: null };
vm.createContext(sb);
vm.runInContext([constBlock('PC_DEFAULT_RULES'), constBlock('SS_VALID_BD'), constBlock('SS_SOON_BD'), grab('pcTick'), grab('pcToward'), grab('pcIsBiz'), grab('pcAddBiz'),
                 grab('ssPrice'), grab('ssConfirmedOn'), grab('ssExpiry'), grab('ssStatus')].join('\n'), sb);
const run = c => vm.runInContext(c, sb);
const HOL = ['2026-11-23'];

console.log('--- 値段 (🧮 の「SBI に写す値段」と同じ丸め) ---');
chk(run('ssPrice({bp: 6350})') === 5590, 'メック 6,350 円 → 5,588 を 10 円刻みで買値の側へ = 5,590 円');
chk(run('ssPrice({bp: 1493})') === 1314, 'レンゴー 1,493 円 → 1,313.84 → 1,314 円');
chk(run('ssPrice({bp: 4901}, {safety_stop_pct: 0.15})') === 4170, 'ルールの値を渡せば使う (-15% → 4,165.85 → 4,170)');
chk(run('ssPrice({bp: 0})') === null && run('ssPrice({bp: 1000, bp_unknown: true})') === null, '買値が無い・未確認なら出さない');

console.log('--- ✅ は買値と株数に結びつく ---');
chk(run("ssConfirmedOn({bp: 1493, sh: 100, ss: {on: '2026-11-12', bp: 1493, sh: 100}})") === '2026-11-12', '同じ買値・株数なら効く');
chk(run("ssConfirmedOn({bp: 1480, sh: 100, ss: {on: '2026-11-12', bp: 1493, sh: 100}})") === null, '買値を直したら効かない');
chk(run("ssConfirmedOn({bp: 1493, sh: 200, ss: {on: '2026-11-12', bp: 1493, sh: 100}})") === null, '株数が変わったら (買い増し・一部売り) 効かない');
chk(run('ssConfirmedOn({bp: 1493, sh: 100})') === null, '✅ が無ければ null');

console.log('--- 期限の目安 (SBI の期間指定は発注日を含めて最長 15 営業日) ---');
chk(run(`ssExpiry('2026-11-12', ${JSON.stringify(HOL)})`) === '2026-12-03', '11/12 (木) を 1 日目 → 15 営業日目は 12/3 (木) (11/23 の祝日を除く)');
chk(run(`ssExpiry('2026-11-12', [])`) === '2026-12-02', '祝日を知らなければ 12/2');
const st = (on, today) => JSON.parse(run(`JSON.stringify(ssStatus({bp: 1493, sh: 100, ss: {on: '${on}', bp: 1493, sh: 100}}, '${today}', ${JSON.stringify(HOL)}))`));
chk(st('2026-11-12', '2026-11-12').state === 'ok' && st('2026-11-12', '2026-11-12').expiry === '2026-12-03', '押した日は ok');
chk(st('2026-11-12', '2026-12-01').state === 'soon', '期限の 2 営業日前から soon');
chk(st('2026-11-12', '2026-12-04').state === 'expired', '期限を過ぎたら expired');
chk(run(`ssStatus({bp: 1493, sh: 100}, '2026-11-12', []).state`) === 'none', '✅ が無ければ none');

console.log('--- 画面・保存・export ---');
const card = grab('hHTML');
chk(card.includes('ssPrice(') && card.includes('tSS(') && /SBI に入れた ✅/.test(all), '保有カードに 🛡 の値段と ✅ のボタン');
chk(/SBI の期限の目安/.test(all) && /15 営業日/.test(all), '期限の目安と「最長 15 営業日」を書く');
const t = grab('tSS');
chk(t.includes('maybeAutoPublish()') && t.includes('sv(KH, H)'), '押したら保存してボットに送る');
chk(t.includes('confirm('), '取り消す前に確かめる');
const exp = grab('_buildHumanPaperTradesPayload');
chk(/safety_stop_confirmed_on:\s*ssConfirmedOn\(h\)/.test(exp), 'export に safety_stop_confirmed_on (効いている ✅ だけ)');
const FORBID = ['買え', '売れ', '狙い目', 'おすすめ', '推奨', '割安'];
const ui = grab('ssCardHtml');
chk(FORBID.every(w => !ui.includes(w)), '売買をすすめる言葉が無い');

console.log(bad ? `\nRESULT: ${bad} NG` : '\nRESULT: OK');
process.exit(bad ? 1 : 0);
