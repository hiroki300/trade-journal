/**
 * AI の売買の目安 (2026-10-18) の回帰テスト。
 *
 *   node tests/pr19_ai_guidance_2026_10_18.test.js
 *
 * 背景: ユーザーが「AI に売買の目安を言わせたい (未検証と明記して)」と決めた。考え方の土台は投資の基本
 * (オニールの 7〜8% ルール・Odean 1998・Barber & Odean 2000・Asness 2011・R と期待値) と、ユーザーの
 * NotebookLM と、このアプリの実測 (8/16 以降の負けた金額の 86% は −8% を超えて持った取引)。
 * 正本は stock-checker の docs/notebooklm/09_AIの売買の目安の考え方.md。
 *
 * ここで固定すること:
 * - 数字はコード (ルールの線)、意見は AI。ルールが 🛑 なのに AI が「継続」なら ⚠️
 * - 目安を出す AI は Claude 1 か所。Gemini (調べ物) に目安・ロット数を言わせない
 * - 「シニアFM」の役・「手仕舞えと命じて」を使わない。画面に「未検証」を出す
 * - 新しい候補は機械の候補の中からだけ。株数はボットの計算 (size_if_entered)
 * - 目安を ai_calls に記録して非公開リポへ書き出す
 * - 幽霊の建玉: 「削除しますか?」をキャンセルした建玉に unseen_since、🗑 の後に公開
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
function constLine(name) {
  const m = new RegExp(`const ${name} = [^\\n]*`).exec(all);
  if (!m) throw new Error(`const ${name} not found`);
  return m[0];
}

const sb = { console, window: {}, Date, JSON, Set, Math, Number, String, Array };
vm.createContext(sb);
vm.runInContext([
  constLine('RULE_STOP_PCT'), constLine('RULE_TIME_STOP_BD'), "const TODAY = '2026-10-18';",
  grab('_escape'), grab('typeLabel'), grab('_num'), grab('_normType'),
  grab('aiNormalizeCall'), grab('aiWeekdaysBetween'), grab('aiRuleLines'), grab('aiRuleConflict'),
  grab('aiUpsertCall'), grab('aiCode5'), grab('aiCandidatesForReview'), grab('aiFilterReview'),
  grab('markUnseen'), grab('applyHoldImport'), grab('aiCitationsText'),
].join('\n'), sb);
const run = c => vm.runInContext(c, sb);

console.log('--- ルールの線 (計算・ボットの建玉チェックと同じ物差し) ---');
const base = "{cd:'3778', nm:'テスト', sh:200, bp:4000, dt:'2026-10-01', type:'spot'}";
const r = run(`aiRuleLines(${base}, 4000, '2026-10-02')`);
chk(r.stop === 3680 && r.r1 === 4320 && r.r2 === 4640, '買値 4,000 → −8% の線 3,680・+1R 4,320・+2R 4,640');
chk(r.states.length === 0 && r.rNow === 0, '買値ちょうどならルールに触れていない (0R)');
chk(run(`aiRuleLines(${base}, 3600, '2026-10-02')`).states[0].key === 'stop', '−8% より下は 🛑 stop');
chk(run(`aiRuleLines(${base}, 4700, '2026-10-02')`).states[0].key === 'r2', '+2R 以上は 🎯 r2');
chk(run(`aiRuleLines(${base}, 4400, '2026-10-02')`).states[0].key === 'r1', '+1R 以上は 🔒 r1');
chk(run(`aiRuleLines(${base}, 3700, '2026-10-02')`).states[0].key === 'near', '−8% まで 2% 以内は ⚠️ near');
const sl = run("aiRuleLines({cd:'3778', sh:100, bp:4000, sl:3800, dt:'2026-10-01'}, 3790, '2026-10-02')");
chk(sl.states[0].key === 'sl' && sl.sl === 3800, '自分の損切り (sl) に届けば 🛑 sl');
const late = run(`aiRuleLines(${base}, 4050, '2026-10-18')`);
chk(late.heldBd === 11 && late.states.some(s => s.key === 'time'), '10 営業日を超えて +0.5R 未満なら ⏰ time (10/01→10/18 は平日 11 日)');
chk(!run(`aiRuleLines(${base}, 4200, '2026-10-18')`).states.some(s => s.key === 'time'), '+0.5R 以上なら ⏰ を出さない (延長可)');
const short = run("aiRuleLines({cd:'1234', sh:100, bp:1000, type:'margin_short', dt:'2026-10-01'}, 1090, '2026-10-02')");
chk(short.stop === 1080 && short.r2 === 840 && short.states[0].key === 'stop', '信用売建は向きが逆 (1,080 で 🛑)');
chk(run("aiRuleLines({bp:0, bp_unknown:true}, 100, '2026-10-02')") === null, '買値が未確認なら計算しない (null)');
chk(run("aiRuleLines({bp:4000, dt:'2026-09-01', dt_unknown:true}, 4000, '2026-10-18').heldBd") === null,
    '建日が取込日 (dt_unknown) なら保有日数を出さない');

console.log('--- 平日の数 (祝日は数えない概算) ---');
chk(run("aiWeekdaysBetween('2026-10-12', '2026-10-19')") === 5, '月曜→翌月曜は 5');
chk(run("aiWeekdaysBetween('2026-10-20', '2026-10-18')") === null, '未来の建日は null');

console.log('--- ルールと AI の目安の食い違い ---');
const stopRule = run(`aiRuleLines(${base}, 3600, '2026-10-02')`);
chk(run(`aiRuleConflict('継続', ${JSON.stringify(stopRule)})`).startsWith('⚠️ ルールでは損切りの位置'), '🛑 なのに「継続」は ⚠️');
chk(run(`aiRuleConflict('損切り', ${JSON.stringify(stopRule)})`) === '', '🛑 で「損切り」なら食い違いなし');
const r2Rule = run(`aiRuleLines(${base}, 4700, '2026-10-02')`);
chk(run(`aiRuleConflict('継続', ${JSON.stringify(r2Rule)})`).includes('一部利確'), '+2R なのに「継続」は ⚠️');

console.log('--- 目安の言葉をそろえる ---');
chk(run("aiNormalizeCall('一部利確')") === '一部利確' && run("aiNormalizeCall('利確')") === '利確', 'ちょうどの言葉はそのまま');
chk(run("aiNormalizeCall('一部利確を検討')") === '一部利確', '「一部利確」を「利確」と取り違えない');
chk(run("aiNormalizeCall('損切りを推奨')") === '損切り', '文の中の言葉を拾う');
chk(run("aiNormalizeCall('hold')") === '', 'どれでもなければ空 (記録しない)');

console.log('--- 目安の記録 (ai_calls) ---');
const e1 = {date:'2026-10-18', code:'37780', kind:'exit', call:'継続'};
const e2 = {date:'2026-10-18', code:'37780', kind:'exit', call:'損切り'};
const up = run(`aiUpsertCall([${JSON.stringify(e1)}], ${JSON.stringify(e2)}, 500)`);
chk(up.length === 1 && up[0].call === '損切り', '同じ日・銘柄・種類は最後の 1 件だけ残す');
chk(run(`aiUpsertCall([{date:'a',code:'1',kind:'exit'},{date:'b',code:'1',kind:'exit'}], {date:'c',code:'1',kind:'exit'}, 2)`).length === 2,
    '最大件数で古い順に落とす');
chk(run("aiCode5('3778')") === '37780' && run("aiCode5('213A')") === '213A0', '4 桁のコードは 5 桁で記録する');

console.log('--- 振り返りの候補は機械の候補の中からだけ ---');
const pb = {as_of_date:'2026-10-16', candidates:[
  {code:'44430', ticker:'4443', name:'Sansan', price:2005, text:'押し目', size_if_entered:{shares:200, viable:true}},
  {code:'99990', ticker:'9999', name:'B', price:100, text:'x'}]};
const cands = run(`aiCandidatesForReview(${JSON.stringify(pb)}, 10)`);
chk(cands.length === 2 && cands[0].code4 === '4443' && cands[0].size.shares === 200 && cands[0].as_of === '2026-10-16',
    'ボットの並び順・株数 (size_if_entered)・基準日をそのまま渡す');
const raw = {holdings:[{code:'3778', call:'損切り', reasons:['[1] −8%']}, {code:'8058', call:'継続', reasons:[]}],
             candidates:[{code:'4443', reasons:['[8] 機械の候補']}, {code:'7203', reasons:['候補に無い']}], note:''};
const f = run(`aiFilterReview(${JSON.stringify(raw)}, ['3778'], ['4443', '9999'])`);
chk(f.holdings.length === 1 && f.holdings[0].code === '3778', '持っていない銘柄の目安は落とす');
chk(f.candidates.length === 1 && f.candidates[0].code === '4443' && f.dropped === 1, '機械の候補に無い銘柄は落とし、件数を数える');
const many = {holdings:[], candidates:[{code:'4443',reasons:[]},{code:'9999',reasons:[]},{code:'4443',reasons:[]}], note:''};
chk(run(`aiFilterReview(${JSON.stringify(many)}, [], ['4443','9999'])`).candidates.length === 2, '候補は 2 件まで');

console.log('--- 幽霊の建玉 (売った株が保有に残る) ---');
const H0 = [{cd:'8058', type:'spot', bp:4862}, {cd:'3778', type:'spot', bp:3720}];
const m1 = run(`markUnseen(${JSON.stringify(H0)}, [{cd:'8058', type:'spot'}], '2026-10-18')`);
chk(m1[0].unseen_since === '2026-10-18' && !m1[1].unseen_since, 'キャンセルした建玉にだけ写っていない日を付ける');
const m2 = run(`markUnseen(${JSON.stringify(m1)}, [{cd:'8058', type:'spot'}], '2026-10-25')`);
chk(m2[0].unseen_since === '2026-10-18', 'いちばん古い日を残す');
const seen = run(`applyHoldImport(${JSON.stringify(m1)}, [{code:'8058', shares:200, current_price:4700}], {})`);
chk(!seen.H.find(h => h.cd === '8058').unseen_since && seen.H.find(h => h.cd === '8058').cp_at === '2026-10-18',
    '次に写れば印を消し、現値の時点 (cp_at) を残す');
chk(grab('delH').includes('maybeAutoPublish()'), '🗑 削除の後に公開する (ボットの建玉チェックに今夜から反映)');
chk(grab('hHTML').includes('h.unseen_since'), '保有タブに「写っていません」を出す');
chk(/H = ok \? wetRun\.H : markUnseen\(dryRun\.H, wetRun\.removed, TODAY\);/.test(all), '取込でキャンセルしたら印を付ける');

console.log('--- 書き出し (非公開リポ) ---');
const payload = grab('_buildHumanPaperTradesPayload');
chk(payload.includes('ai_calls: getAiCalls()'), '目安の記録を ai_calls として書き出す');
chk(payload.includes('unseen_since: h.unseen_since'), '写っていない日も書き出す');

console.log('--- 目安は Claude 1 か所・Gemini に目安を言わせない ---');
chk(/const RESEARCH_PROVIDER = 'claude';/.test(all), '調べ物は Claude (比較 2026-10-18 の結果)');
const ah = grab('analyzeHolding');
chk(ah.includes('aiRuleBoxHTML(h, rule)') && ah.includes('callResearch(') && ah.includes('schema: AI_EXIT_SCHEMA'),
    '🤝 は ルールの線 → 調べ物 → Claude の目安 (決まった形の JSON)');
chk(!ah.includes('callGemini(') && !ah.includes('合議'), '🤝 で Gemini と Claude の合議をしない');
chk(ah.includes('recordAiCall('), '🤝 の目安を記録する');
const gemCalls = (all.match(/callGemini\(/g) || []).length;
chk(gemCalls === 4, 'callGemini を呼ぶのはチャットの 🤖 (2 か所) と callResearch の分岐だけ (定義を含めて 4)');
const research = [grab('askAISodanForHolding'), grab('aiHoldingResearchPrompt'), grab('examineAI'),
                  grab('examineChartAnalysis')].join('\n');
chk(!/出口の目安（doctrine|もし買うなら|安全なロット数|目標値と損切り価格の妥当性|推奨損切り|推奨利確/.test(research),
    '調べ物の指示に、出口の目安・ロット数・損切り価格を求める文が無い');
chk(!/残金メモ|SNS・YouTube・X話題|X \(旧 Twitter\) で話題の日本株/.test(all), '残金メモ・SNS の話題株を求める指示が無い');

console.log('--- 役・ラベル ---');
const persona = grab('buildPersonaPrefix');
chk(!/シニア|ファンドマネージャー|手仕舞え|命じて/.test(persona), '「シニアFM」の役・「手仕舞えと命じて」を使わない');
chk(!/シニアFMとしての一言|運用歴25年/.test(all), '「シニアFMとしての一言」「運用歴25年」が残っていない');
const note = constLine('AI_UNVERIFIED_NOTE');
chk(note.includes('未検証') && note.includes('28%'), '画面に「未検証」と以前の記録 (勝率 28%) を出す');
const princ = all.slice(all.indexOf('const AI_GUIDANCE_PRINCIPLES'), all.indexOf('const AI_GUIDANCE_SYSTEM'));
chk([1, 2, 3, 4, 5, 6, 7, 8, 9].every(n => princ.includes(`[${n}]`)), '考え方の土台は 9 つ ([1]〜[9])');
chk(princ.includes('目安は必ず「損切り」') && princ.includes('ナンピンしない'), '[1] −8% に届いたら目安は損切り・ナンピンしない');
chk(princ.includes('渡した機械の候補の中からだけ'), '[8] 新しい候補は機械の候補の中からだけ');
chk(/const AI_GUIDANCE_VERSION = 'v1';/.test(all), '版 v1 (正本の説明書の版と同じ)');

console.log('--- 出典の原文を並べる (Claude の Web 検索) ---');
const cit = run(`aiCitationsText([{citations:[{url:'https://a.example/x', title:'A', cited_text:'原文の抜き出し'},
                                              {url:'https://a.example/x', title:'A'}]}])`);
chk(cit.includes('出典:') && cit.includes('「原文の抜き出し」') && cit.split('https://a.example/x').length === 2,
    '出典は URL ごとに 1 行・原文の抜き出しを添える');

console.log('--- 構文 ---');
scripts.forEach((src, i) => {
  try { new vm.Script(src); } catch (e) { chk(false, `inline <script> #${i} 構文エラー: ${e.message}`); }
});

console.log(bad ? `\nRESULT: ${bad} NG` : '\nRESULT: OK');
process.exit(bad ? 1 : 0);
