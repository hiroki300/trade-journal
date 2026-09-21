/**
 * アプリ内チャート (インライン SVG) のテスト。
 *
 *   node tests/pr7_chart_2026_09_20.test.js
 *
 * 描画は純関数 buildChartSVG(chart) に閉じている。系列はバックエンドが作り
 * (pullback_charts.json)、**フロントで指標を作り直さない**。
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

function constLines(firstNames) {
  // `const CHART_W = 360, CHART_H = 250;` のように 1 行に複数宣言されているので、
  // 行ごと取り出す。
  return firstNames.map(n => {
    const line = all.split('\n').find(l => l.trimStart().startsWith('const ' + n));
    if (!line) throw new Error(n + ' not found');
    return line;
  }).join('\n');
}

const sb = { console, window: {}, Date, document: { getElementById: () => null } };
vm.createContext(sb);
vm.runInContext([
  constLines(['CHART_W', 'CHART_PAD', 'CHART_PRICE_H']),
  grab('_escape'), grab('_niceNum'), grab('buildChartSVG'), grab('chartCaption'),
].join('\n'), sb);
const run = c => vm.runInContext(c, sb);

// 90本のダミー系列 (1,000円前後で上下しつつ上昇)
const bars = [];
for (let i = 0; i < 90; i++) {
  const c = 1000 + i * 2 + (i % 5 === 0 ? 12 : -4);
  bars.push([`2026-${String((i % 6) + 3).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
             c - 3, c + 8, c - 9, c, 100000 + i * 10]);
}
sb.ch = {
  ticker: '7203', name: 'トヨタ', n: bars.length, from: bars[0][0], to: bars[bars.length - 1][0],
  bars,
  ma25: bars.map((b, i) => (i >= 24 ? b[4] - 5 : null)),
  ma75: bars.map((b, i) => (i >= 74 ? b[4] - 12 : null)),
  lines: {stop: Math.round(bars[bars.length - 1][4] * 0.92), high_20d: 1190, low_20d: 1120},
  swings: [{price: 1150, touches: 3, side: 'below'}],
  bands: [{lo: 1100, hi: 1120, share_pct: 12.3}],
};

console.log('--- SVG が組める ---');
const svg = run('buildChartSVG(ch)');
chk(svg.startsWith('<svg viewBox="0 0 360 250"'), 'モバイル幅の viewBox');
chk(!/NaN|undefined|Infinity/.test(svg), '壊れた数値が入っていない');
const rects = (svg.match(/<rect /g) || []).length;
const lines = (svg.match(/<line /g) || []).length;
chk(rects >= bars.length * 2, `ローソクの実体と出来高の矩形がある (${rects}本)`);
chk(lines >= bars.length, `ヒゲの線がある (${lines}本)`);
chk((svg.match(/<polyline /g) || []).length === 2, 'MA25 と MA75 の 2 本');

console.log('--- 水平線と帯 ---');
chk(svg.includes('-8%') && svg.includes('stroke-dasharray="4 2"'), '-8%ストップが破線で出る');
chk(svg.includes('20日高値') && svg.includes('20日安値'), '20日高安の線が出る');
chk(svg.includes('3回'), '高安が集まった価格 (タッチ回数) が出る');
chk(svg.includes('opacity="0.16"'), '最も売買が多かった価格帯が帯で出る');

console.log('--- 縦の目盛りはバーと -8% だけで決める ---');
const far = JSON.parse(JSON.stringify(sb.ch));
far.swings = [{price: 10, touches: 9, side: 'below'}];   // 遠すぎる注記
sb.far = far;
const svgFar = run('buildChartSVG(far)');
chk(!svgFar.includes('9回'), '範囲外の注記は描かない (ローソクを潰さない)');
const bodyY = s => (s.match(/<rect x="[\d.]+" y="([\d.]+)"/) || [])[1];
chk(bodyY(svg) === bodyY(svgFar), '遠い注記があってもローソクの位置が変わらない');

console.log('--- 壊れた入力で例外を投げない ---');
for (const bad2 of ['null', '{}', '{bars:[]}', '{bars:[[null,null,null,null,null,null]]}']) {
  sb.x = null;
  const out = run(`buildChartSVG(${bad2})`);
  chk(typeof out === 'string' && out.length > 0, `${bad2} でも文字列を返す`);
}

console.log('--- 注記 (規律) ---');
const cap = run('chartCaption(ch)');
chk(cap.includes('日足90本'), '本数と期間を書く');
chk(cap.includes('予測力は未測定') && cap.includes('52週高安は範囲外'), '主張しない断りを書く');
for (const w of ['買い', '売り', '狙い目', '支持線', '抵抗線', 'サポート']) {
  chk(!cap.includes(w), `方向・売買を示す語が無い (${w})`);
}

console.log('--- 遅延 fetch (常時読み込みを重くしない) ---');
chk(all.includes("_fetchJSON('pullback_charts.json')"), '専用ファイルを取りにいく');
const lmr = grab('loadMorningReports');
chk(!lmr.includes('pullback_charts'), '起動時の一括取得には含めない');
chk(grab('toggleInlineChart').includes('_loadCharts()'), 'チャートを開いたときだけ読む');
chk(all.includes('let _chartsData = null'), 'セッション内キャッシュを持つ');
chk(!all.includes("setItem('tj_charts"), 'localStorage には保存しない (容量を食わない)');

console.log('--- 構文 ---');
scripts.forEach((src, i) => {
  try { new vm.Script(src); } catch (e) { chk(false, `inline <script> #${i} 構文エラー: ${e.message}`); }
});
chk(true, `inline <script> ${scripts.length} 本の構文OK`);

console.log(bad ? `\nRESULT: ${bad} NG` : '\nRESULT: OK');
process.exit(bad ? 1 : 0);
