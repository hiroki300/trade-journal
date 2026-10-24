/**
 * 短期スイングの事実 3 つ (2026-10-24・stock-checker の swing_facts)。
 *
 *   node tests/pr21_swing_facts_2026_10_24.test.js
 *
 * バックエンドは pullback_candidates.json の頭に market_schedule (pwa: 題・行・empty・warn・注記)、
 * 候補の brief に sector_move / gap_risk (「／」区切り) を入れる。flag OFF の間はどれも無い。
 * PWA は文をそのまま出すだけ (方向・売買の語はバックエンドの禁止語テストで縛る)。
 */
const fs = require('fs'), vm = require('vm');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...HTML.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let bad = 0;
const chk = (ok, label) => { console.log(`  ${ok ? 'OK  ' : 'NG  '}${label}`); if (!ok) bad++; };
scripts.forEach((src, i) => {
  try { new vm.Script(src); } catch (e) { chk(false, `inline <script> #${i} 構文エラー: ${e.message}`); }
});
const all = scripts.join('\n');
function grab(name) {
  const i = all.indexOf(`function ${name}(`);
  if (i < 0) throw new Error(`${name} not found`);
  let d = 0, k = all.indexOf('{', i);
  for (; k < all.length; k++) { if (all[k] === '{') d++; else if (all[k] === '}') { d--; if (!d) break; } }
  return all.slice(i, k + 1);
}
const els = {};
const sb = { console, window: {}, Date, document: { getElementById: id => els[id] || null } };
vm.createContext(sb);
vm.runInContext([grab('_escape'), grab('_safeUrl'), grab('_marginAlertHtml'), grab('_breadthLine'),
                 grab('_marketScheduleHtml'),
                 'const AI_SECTION_LABELS = {};', grab('_aiCardHtml'), grab('_renderPullbackCard'),
                 'let _pullbackSort = "turn", _pullbackShowAll = false; const PULLBACK_SHOW_LIMIT = 10;',
                 grab('renderPullback'),
                 'function isShortlisted() { return false; }'].join('\n'), sb);
const run = c => vm.runInContext(c, sb);

// バックエンド (swing_facts.market_schedule) が 2026-10-23 の終値で作る実際の形
const SCHED = { from: '2026-10-26', to: '2026-11-09', pwa: {
  title: '📆 この先10営業日 (10/26〜11/9) の市場全体の予定',
  lines: ['10/29(木) の寄り付き: FOMC の結果 (米国の政策金利・日本時間 10/29(木) 3:00 発表)',
          '10/30(金) の場中: 日銀の金融政策決定会合の結果 (会合 10/29〜10/30・発表は昼ごろが多いが時刻は決まっていない)',
          '11/9(月) の寄り付き: 米国の雇用統計 (日本時間 11/6(金) 22:30 発表)'],
  empty: '', warn: '',
  note: '出典: 日銀・FRB・米国労働統計局の公式の日程 (2026-10-24 確認・2027/12/31 まで)。SQ は取引所のきまり (毎月の第 2 金曜・休みなら前の営業日) から計算。臨時の会合は入りません。' } };

console.log('--- 📆 予定表 ---');
sb.s = SCHED;
const sh = run('_marketScheduleHtml(s)');
chk(sh.includes('この先10営業日 (10/26〜11/9) の市場全体の予定'), '題が出る');
chk(sh.includes('10/29(木) の寄り付き: FOMC の結果') && sh.includes('11/9(月) の寄り付き: 米国の雇用統計'), '行をそのまま出す');
chk(sh.includes('出典: 日銀・FRB・米国労働統計局'), '出典の注記が出る');
chk(run('_marketScheduleHtml(undefined)') === '' && run('_marketScheduleHtml({})') === '', '無ければ何も出さない (flag OFF の間)');
sb.s2 = { pwa: { title: '📆 この先10営業日 (12/21〜1/3) の市場全体の予定', lines: [], empty: '',
  warn: '⚠️ 予定表は2027/12/31までです (その外の日銀・FOMC・雇用統計・CPI は入っていません)', note: 'x' } };
chk(run('_marketScheduleHtml(s2)').includes('予定表は2027/12/31までです'), '表が届かないときの ⚠️ を出す');
chk(!run('_marketScheduleHtml(s2)').includes('予定なし'), '「予定なし」とは書かない');
sb.s3 = { pwa: { title: 't', lines: [], empty: 'この10営業日に、表にある予定 (日銀・FOMC・米国の雇用統計・CPI・SQ) はありません', warn: '', note: '' } };
chk(run('_marketScheduleHtml(s3)').includes('表にある予定'), '予定が無い期間はバックエンドの文を出す');
sb.s4 = { pwa: { title: 't', lines: ['<b>x</b>'], empty: '', warn: '', note: '' } };
chk(!run('_marketScheduleHtml(s4)').includes('<b>x</b>'), 'エスケープする');

console.log('--- 発掘タブ: 候補の上に 1 回だけ ---');
els.dpullback = { innerHTML: '' }; els.pullbackCount = { textContent: '' };
sb.d = { as_of_date: '2026-10-23', candidate_count: 2, market_schedule: SCHED, candidates: [
  { code: '13010', ticker: '1301', name: '極洋', brief: { one_liner: 'x' } },
  { code: '72030', ticker: '7203', name: 'トヨタ', brief: { one_liner: 'y' } }] };
run('renderPullback(d)');
const page = els.dpullback.innerHTML;
chk(page.split('市場全体の予定').length === 2, '予定表は 1 回だけ (カードごとには出さない)');
chk(page.indexOf('市場全体の予定') < page.indexOf('極洋'), '候補より上');
sb.d0 = { as_of_date: '2026-10-23', candidate_count: 0, market_schedule: SCHED, candidates: [] };
run('renderPullback(d0)');
chk(els.dpullback.innerHTML.includes('市場全体の予定'), '候補が 0 件の日も出す');
sb.doff = { as_of_date: '2026-10-23', candidate_count: 1, candidates: [{ code: '13010', ticker: '1301', name: '極洋', brief: {} }] };
run('renderPullback(doff)');
chk(!els.dpullback.innerHTML.includes('市場全体の予定'), 'market_schedule が無ければ出さない');

console.log('--- 候補カード: 🏭 業種・⚡ 飛び ---');
sb.c = { code: '63300', ticker: '6330', name: '東洋エンジニアリング', brief: {
  sector_move: 'この株 -2.3% (9/29→10/6の5営業日)／同じ業種 (建設業) のほかの32社 (売買の多い800社の中) の真ん中 -0.2%／この株のほうが 2.1 ポイント低い',
  gap_risk: '直近100日で、寄り付きが前日の終値から±3%以上離れて始まった日 13回 (上 6・下 7)／いちばん大きい下への飛び -9.4% (9/3)／-8%の逆指値を寄り付きで飛び越す大きさです。逆指値は、寄り付きでその値段より下に始まると、寄り付きの値段で約定します',
  volatility: 'v', one_liner: 'z' } };
const card = run('_renderPullbackCard(c)');
chk(card.includes('業種と比べた動き (この5営業日・事実だけ・効くかは未検証)'), '🏭 の見出し (未検証と明記)');
chk(card.includes('同じ業種 (建設業) のほかの32社'), '業種の文を「／」で分けて出す');
chk(card.includes('寄り付きの飛び (直近100日)') && card.includes('寄り付きの値段で約定します'), '⚡ の見出しと文');
sb.c2 = { code: '72030', ticker: '7203', name: 'トヨタ', brief: { one_liner: 'x' } };
const card2 = run('_renderPullbackCard(c2)');
chk(!card2.includes('業種と比べた動き') && !card2.includes('寄り付きの飛び'), '無ければ欄ごと出さない (flag OFF の間)');
const src = grab('_renderPullbackCard');
chk(src.indexOf('marginAlertHtml +') < src.indexOf("block('🏭'") && src.indexOf("block('⚡'") < src.indexOf("block('📏'"),
    '日々公表の後・値動きの大きさの前に出す');

console.log('--- 保有タブ ---');
const hold = grab('rHold');
chk(hold.includes('_marketScheduleHtml((window._pullbackData || {}).market_schedule)'), '保有があるときだけ予定表を上に出す');
chk(hold.indexOf('_marketScheduleHtml') > hold.indexOf('H.length ?'), '保有が無いときは出さない');

console.log(bad ? `\n❌ ${bad} 件 NG` : '\n✅ すべて OK');
process.exit(bad ? 1 : 0);
