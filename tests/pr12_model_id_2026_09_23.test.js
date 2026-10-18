/**
 * Claude のモデル ID と thinking の扱いが意図どおりか。
 *
 *   node tests/pr12_model_id_2026_09_23.test.js
 *
 * 背景 (2026-09-23): `callClaude` は `claude-sonnet-4-20250514` (Claude Sonnet 4) を
 * 使っていた。これは **Deprecated** (退役日 TBD) で、まだ動くが予告なく 404 になる。
 * `claude-sonnet-5` へ移した。
 *
 * ⚠️ 移行で効く罠が 1 つある: **Sonnet 5 は `thinking` を省略すると adaptive
 * thinking が既定 ON** になる。思考は出力トークンとして課金され、かつ `max_tokens`
 * (ここでは 4000〜5000) を食うので、答えが途中で切れる。API キーはユーザー自身の
 * ものなので、未実測でコストを上げないためにも明示的に無効化しておく。
 *
 * このテストは「モデル ID を上げたのに thinking を無効化し忘れる」退化を止める。
 */
const fs = require('fs'), path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const README = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

let bad = 0;
const chk = (ok, label) => { console.log(`  ${ok ? 'OK  ' : 'NG  '}${label}`); if (!ok) bad++; };

// 2026-10-18: Sonnet 5 → Sonnet 5.5 (ボットの AI カード・朝チェックと同じ)。
// ⚠️ Sonnet 5.5 は thinking:{type:'disabled'} が 400 (STATUS §4 G) なので、ボットと同じ adaptive にした。
//    思考も max_tokens を使うので、上限は 8000 以上 (使った分だけ課金)。
console.log('--- モデル ID ---');
chk(/const CLAUDE_MODEL = 'claude-sonnet-5-5';/.test(HTML), "CLAUDE_MODEL は claude-sonnet-5-5");
chk(!/model:'claude-sonnet-5'/.test(HTML), '古い claude-sonnet-5 を直書きしていない');
chk(!/claude-sonnet-4-20250514/.test(HTML), '退役予定の claude-sonnet-4-20250514 が残っていない');
chk(!/claude-sonnet-5(-5)?-\d{8}/.test(HTML), 'モデル ID に日付サフィックスを足していない');

console.log('--- thinking は adaptive・上限は 8000 以上 ---');
const body = /const body = \{model: CLAUDE_MODEL[\s\S]{0,260}?\};/.exec(HTML);
chk(!!body, 'callClaude の body 定義が見つかる');
chk(body && /thinking: \{type:'adaptive'\}/.test(body[0]), "body に thinking:{type:'adaptive'} が入っている");
chk(body && !/type:'disabled'/.test(body[0]), "Sonnet 5.5 で 400 になる thinking:{type:'disabled'} を送っていない");
chk(body && /Math\.max\(maxTokens \|\| 0, 8000\)/.test(body[0]), 'max_tokens は 8000 以上');

console.log('--- 400 になるパラメータを送っていない ---');
// temperature / top_p / top_k / budget_tokens は Sonnet 5 系で拒否される
chk(body && !/temperature|top_p|top_k|budget_tokens/.test(body[0]),
    'temperature / top_p / top_k / budget_tokens を送っていない');

console.log('--- README がコードと一致している ---');
chk(/`claude-sonnet-5-5`/.test(README), 'README のモデル表に claude-sonnet-5-5 がある');
['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-sonnet-4-20250514'].forEach(m => {
  chk(!README.includes(m), `README に実際は使っていない ${m} が残っていない`);
});

console.log('--- sw.js の未使用定数 ---');
chk(!/const CACHE\b/.test(SW), '未使用の const CACHE が消えている');
chk(/SHARE_CACHE/.test(SW), 'SHARE_CACHE (共有画像の受け渡し) は残っている');

console.log(bad ? `\nRESULT: ${bad} NG` : '\nRESULT: OK');
process.exit(bad ? 1 : 0);
