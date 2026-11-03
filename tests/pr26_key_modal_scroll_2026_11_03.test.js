/**
 * 「🔑 APIキーを設定」の画面が、短い画面で下まで届かなかった件 (2026-11-03) の回帰テスト。
 *
 *   node tests/pr26_key_modal_scroll_2026_11_03.test.js
 *
 * 背景: 初回 (鍵が未保存の新しい端末) と、ヘッダの「🔑 API設定」で開くこの画面は、中身が幅 375px で
 * 約 1,000px ある。背景の層 (.key-modal-overlay) は position:fixed で、overflow が既定 (visible) の
 * ままだったので、画面より背が高いと、はみ出した分をスクロールできなかった。さらに align-items:center
 * のせいで上側にもはみ出し (高さ 812px で見出しが約 93px 切れ)、下の「あとで設定する」にも届かなかった。
 *
 * 直し方: 背景の層をスクロールできるようにし (overflow-y:auto)、カードに margin:auto を付ける。
 * align-items:center のままだと、溢れた分の上半分はスクロールで届かない領域へ出てしまう。margin:auto なら
 * 余白があるときは真ん中、溢れるときは上にそろえて下へスクロールできる。
 *
 * 副作用への対処: 層がスクロールできるようになると、下まで送って閉じた位置が残る (Chrome は display:none を
 * 挟んでも保つ)。ヘッダの「🔑 API設定」で開き直すと、見出しが画面の外のまま開く。openKeyModal で
 * 表示したあとに scrollTop=0 にする (非表示の要素への代入は効かないので、表示の後でなければならない)。
 *
 * node には描画の仕組みが無いので、ここでは CSS の指定と openKeyModal の動きを固定する。実際に届くかは
 * preview (幅 375×812 と 390×844) で確かめた (PR の本文)。
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

// <style> から、セレクタがちょうど一致する規則の指定を取り出す (同じ指定が複数あれば後ろが勝つ)。
const CSS = [...HTML.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
function rule(selector) {
  const out = {};
  for (const chunk of CSS.split('}')) {
    const i = chunk.lastIndexOf('{');
    if (i < 0 || chunk.slice(0, i).split('{').pop().trim() !== selector) continue;
    for (const d of chunk.slice(i + 1).split(';')) {
      const k = d.indexOf(':');
      if (k > 0) out[d.slice(0, k).trim().toLowerCase()] = d.slice(k + 1).trim().toLowerCase();
    }
  }
  return out;
}
// margin の省略形 (1〜4 個) を [上, 右, 下, 左] に開く。個別の margin-top / margin-bottom があればそれを優先。
function margins(r) {
  const t = (r.margin || '').split(/\s+/).filter(Boolean);
  const [top, right, bottom, left] = t.length === 1 ? [t[0], t[0], t[0], t[0]]
    : t.length === 2 ? [t[0], t[1], t[0], t[1]]
    : t.length === 3 ? [t[0], t[1], t[2], t[1]]
    : t.length === 4 ? t : [];
  return { top: r['margin-top'] || top, bottom: r['margin-bottom'] || bottom };
}

const ov = rule('.key-modal-overlay'), card = rule('.key-modal');

console.log('--- 背景の層 (.key-modal-overlay) ---');
chk(ov.position === 'fixed' && ov.display === 'flex', '画面に固定された flex の層 (ページ側のスクロールでは動かせないので、層そのものが動く必要がある)');
const oy = ov['overflow-y'] || (ov.overflow || '').split(/\s+/).pop();
chk(oy === 'auto' || oy === 'scroll', `層が縦にスクロールできる (overflow-y: ${oy || '未指定'}) — はみ出した分に届く`);

console.log('--- カード (.key-modal): 上が切れない寄せ方 ---');
const m = margins(card), ai = ov['align-items'] || '';
chk((m.top === 'auto' && m.bottom === 'auto') || /^(safe\b|flex-start|start)/.test(ai),
    `カードが画面より背が高くても上が切れない (margin 上下: ${m.top || '-'}/${m.bottom || '-'}・align-items: ${ai || '-'})`);

console.log('--- 開き直したとき: 前に下へ送っていても、見出しから出す ---');
// 非表示の要素への scrollTop の代入は効かない (ブラウザと同じ)。下まで送って (194) 閉じた状態から開く。
const modal = { style: { display: 'none' }, _top: 194,
  get scrollTop() { return this._top; }, set scrollTop(v) { if (this.style.display !== 'none') this._top = v; } };
const els = { keyModal: modal };
const sb = { document: { getElementById: id => els[id] || (els[id] = { style: {}, value: '', checked: false }) }, GK: '', CK: '', ld: () => true };
vm.createContext(sb);
vm.runInContext(grab('openKeyModal'), sb);
vm.runInContext('openKeyModal()', sb);
chk(modal.style.display === 'flex', 'openKeyModal は鍵の画面を flex で表示する');
chk(modal.scrollTop === 0, `開き直すと、前に下へ送った位置を残さず見出しから出る (scrollTop: ${modal.scrollTop})`);

console.log('--- 中身は変えない ---');
const seg = HTML.slice(HTML.indexOf('id="keyModal"'), HTML.indexOf('<script>', HTML.indexOf('id="keyModal"')));
chk(/<span class="key-skip" onclick="closeKeyModal\(\)">あとで設定する<\/span>/.test(seg), '「あとで設定する」は鍵の画面の中にあり、閉じる処理につながっている');
chk(/<button class="key-save-btn" onclick="saveKeys\(\)">✅ 保存してスタート<\/button>/.test(seg), '「保存してスタート」は鍵の画面の中にある');

console.log(bad ? `\nRESULT: ${bad} NG` : '\nRESULT: OK');
process.exit(bad ? 1 : 0);
