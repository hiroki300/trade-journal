# trade-journal

> 個人スイングトレーダー向け取引ジャーナル PWA（GitHub Pages）

スマホ・PC のブラウザから使える 2 つの Web アプリで、SBI 証券の運用記録・朝の判断・夕方の振り返りを一元化する。バックエンドの自動監視システム（[stock-checker](https://github.com/hiroki300/stock-checker)）が出力する JSON を、データリポジトリ（[trade-journal-data](https://github.com/hiroki300/trade-journal-data)）経由で受け取って表示する。

---

## 🎯 戦略の根幹（2026-04-25 確定 / 短期回転重視）

| 項目 | 値 | 備考 |
|---|---|---|
| 損切り | **-8%** デフォルト | -5% / -3% にも切替可 |
| RR（リスクリワード） | **1 : 2** | 1.5 / 3 にも切替可 |
| 保有期間 | **数日〜数週間** | 6 ヶ月以上は基本ロールオフ |
| 勝率目標 | **50%** | RR 1:2 と組み合わせて期待値プラス |
| 1 ポジション | 10〜30 万円 / 同時最大 5 銘柄 |  |
| 信用金利 | 年率 2.8%（SBI 制度買方） | 保有日数 × 残高で自動計算 |

> 旧戦略（RR 1:3 / 保有最長 6 ヶ月 / +45% 目標）からの転換。stock-checker 側の `build_strategy_context()` と本リポジトリの計算アシスタントの両方に同じ数値が浸透している。

---

## 🏗 アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│  [Backend] hiroki300/stock-checker (GitHub Actions)     │
│   ├ weekly_sniper v13      (週次 15:00 JST)             │
│   ├ full_screener  v5      (週次)                        │
│   ├ daily_checker          (平日 朝/夕)                  │
│   ├ fundamentals_collector v9  (平日 06:00)              │
│   └ limit_watch            (12:30 / 15:30)               │
└─────────────────┬───────────────────────────────────────┘
                  │ 各種 .json を push
                  ▼
┌─────────────────────────────────────────────────────────┐
│  [Data] hiroki300/trade-journal-data                    │
│   ├ macro_state.json / macro_history.json               │
│   ├ latest_prices.json / weekly_results.json            │
│   ├ limit_watchlist.json / fundamentals.json            │
└─────────────────┬───────────────────────────────────────┘
                  │ raw.githubusercontent.com で fetch
                  ▼
┌─────────────────────────────────────────────────────────┐
│  [Frontend] hiroki300/trade-journal (このリポジトリ)     │
│   ├ trading_journal.html  v1.1  ── 取引記録・損益管理    │
│   └ morning.html          v0.19 ── 朝会・夕会・分析      │
│         （GitHub Pages として配信、PWA でインストール）  │
└─────────────────────────────────────────────────────────┘
                  │
                  ▼
              📱 スマホ / 🖥 PC ブラウザ
              （Gemini 2.5 Flash + Claude Haiku 4.5 を直接呼び出し）
```

---

## 📂 ファイル構成

```
trade-journal/
├── trading_journal.html   # メインアプリ（取引記録・損益・売買履歴）
├── morning.html           # 朝会・夕会・銘柄分析・指値ウォッチ
├── manifest.json          # PWA マニフェスト
├── icon-192.png           # PWA アイコン
└── README.md              # このファイル
```

---

## 📱 trading_journal.html（v1.1）

短期回転重視戦略のロジックが組み込まれた取引ジャーナル本体。8 タブ構成。

### タブ一覧

| アイコン | タブ | 用途 |
|---|---|---|
| 📊 | 概況 | 残金・評価額・含み損益・実現損益・銘柄別サマリ |
| 💱 | 売買 | 新規買い／決済売り記録 + **損切り計算アシスタント (v1.1)** |
| 💼 | 保有 | 保有銘柄一覧、信用金利コスト、撤退ライン目安 |
| 👁 | 注目 | ウォッチリスト（手動追加 + スクショ取込） |
| 🌅 | 朝チェック | Gemini 需給 × Claude エントリー判断（全銘柄／保有のみ／注目のみ） |
| 🔍 | 振り返り | 終値スクショ取込 → Gemini × 3 + Claude で明日の戦略 |
| 🔬 | 銘柄分析 | 単一銘柄の深堀り（テーマ・需給 × テクニカル） |
| 💬 | 相談 | 合議 / Gemini 単独 / Claude 単独 のチャット |

### 損切り計算アシスタント（Phase 5 v1.1）

売買タブで買値を入力すると自動表示。

- 損切り幅: **-8% / -5% / -3%**（デフォルト -8%）
- RR 倍率: **1.5 / 2 / 3**（デフォルト 2）
- 株数を入れると損失額・利益額も円ベースで表示
- 「💡 推奨値を自動入力」で損切り・利確欄に一発反映
- 既存の損切り・利確が入っている場合は実 RR をリアルタイム判定（達成 / やや低 / 不足）

### スクリーンショット取込（Gemini 自動判別）

SBI 証券アプリの画面を撮るだけで取り込める（証券会社問わず汎用化済み）。

| ボタン | 想定スクショ |
|---|---|
| 💼 保有銘柄 | 保有一覧・残高照会 |
| 📋 約定履歴 | 約定照会・注文履歴 |
| 💰 損益履歴 | 損益・譲渡益税画面 |
| 👁 ウォッチ | ウォッチリスト・スクリーニング結果 |
| 💴 余力・残金 | 余力照会画面 |
| 📊 評価損益 | 評価損益サマリ |

最大 20 枚まで一括処理可能。

### 信用金利コスト計算

保有タブで信用買付の銘柄に対し、`bp × sh × 0.028 / 365 × 経過日数` で自動計算。期日（買付から 6 ヶ月後）までの残日数も併記。

---

## 🌅 morning.html（v0.19 / Phase 5.3）

朝の板チェック・夕会の振り返り・銘柄分析・対話チャットを統合した分析ハブ。

### 主要機能（フェーズ別）

- **Phase 2 まで**: 朝会の基本機能（保有・新規候補の判定）
- **Phase 3 機能 A（夕会）**: その日の総括・明日の戦略
- **Phase 3 機能 B（売買分析）**: 3 段分業（Gemini 文脈 → Gemini 数値 → Claude 統合）
- **Phase 3.5+ (v0.10)**: IndexedDB による履歴永続化、Markdown エクスポート
- **Phase 3.6 (v0.11)**: 朝会・夕会へのエクスポート展開、日次まとめボタン
- **Phase 4 (v0.12〜v0.15)**: Gemini × Claude 対話チャット（文脈チップ 6 種、IndexedDB 永続化、💬 深掘りボタン）
- **Phase 5.1 (v0.16)**: Claude モデル切替（Haiku ↔ Sonnet 4.6）
- **Phase 5.3 (v0.17)**:
  - 拡張データスキーマ（ATR / 保有日数 / 信用残 / PBR / 配当利回 / 決算日）
  - ファンダ・需給チップ表示（決算日近接時の警告色、信用倍率 5 倍超で warn）
  - 動的撤退ライン目安（ATR ベース）
  - 見送り（スルー）機能 ⏭️
- **v0.18**: 朝会 UI 反転（「判定先行 → AI 追認」型から「情報先行 → ユーザー判断」型へ）/ 各保有銘柄カードへのニュース・材料表示（Gemini Google 検索 72h）
- **v0.19**: ETF 等で売残ほぼゼロ銘柄の信用倍率 700 倍化対策

### データ取得元

```javascript
const DATA_BASE = "https://raw.githubusercontent.com/hiroki300/trade-journal-data/main";
```

| ファイル | 用途 |
|---|---|
| `macro_state.json` | 日経・グロース・USDJPY などのマクロ最新値 |
| `macro_history.json` | マクロ指標の履歴 |
| `latest_prices.json` | 全銘柄の最新終値 |
| `weekly_results.json` | 週次スキャナーの推奨銘柄（S/A/B/C ランク） |
| `limit_watchlist.json` | 指値ウォッチ対象（軽め指値 / 絶好の指値） |
| `fundamentals.json` | ファンダ・需給データ（PBR / 配当利回 / 信用倍率 / ATR / 決算日 等） |

---

## 🔑 API キー設定

初回起動時にモーダルが表示される。キーはブラウザの `localStorage` のみに保存され、GitHub には push されない。

| 用途 | 取得先 | 保存キー |
|---|---|---|
| 🤖 Gemini 2.5 Flash | aistudio.google.com → Get API key | `tj_gk` |
| 🧠 Anthropic Claude Haiku 4.5 / Sonnet 4.6 | console.anthropic.com → API Keys | `tj_ck` |

> ブラウザから直接 Anthropic API を叩くため、`anthropic-dangerous-direct-browser-access: true` ヘッダ付き。個人運用でのみ使用。

### 使用モデル

| モデル | 用途 | 単価感 |
|---|---|---|
| `gemini-2.5-flash` | 需給・テーマ・市場文脈 | 安価 |
| `claude-haiku-4-5-20251001` | エントリー判断・チャット | 安価 |
| `claude-sonnet-4-6` | 売買分析の統合戦略（v0.16〜） | 中 |

---

## 💾 localStorage キー一覧

| キー | 内容 |
|---|---|
| `tj_h5` | 保有銘柄 |
| `tj_t5` | 売買履歴 |
| `tj_c5` | 残金 |
| `tj_w2` | ウォッチリスト |
| `tj_mrn` | 朝チェック結果（最大 30 日） |
| `tj_rev` | 振り返り結果（最大 30 日） |
| `tj_az` | 銘柄分析結果（最大 30 日） |
| `tj_gk` | Gemini API キー |
| `tj_ck` | Anthropic API キー |

morning.html 側は IndexedDB を併用（チャット履歴・売買分析アーカイブ）。

---

## 🚀 デプロイ

GitHub Pages を使う。

1. リポジトリ → Settings → Pages
2. Branch: `main` / `(root)` を選択
3. 数分後に `https://hiroki300.github.io/trade-journal/trading_journal.html` で公開
4. スマホで開いて「ホーム画面に追加」→ PWA としてインストール

`manifest.json` と `icon-192.png` が同梱されているのでフルスクリーン PWA として動く。

---

## 📅 1 日の運用フロー

```
06:00  fundamentals_collector が動き、fundamentals.json 更新
07:30  morning_prices で latest_prices.json 更新
 ↓
朝     morning.html → 🌅 朝の板チェック
        ニュース確認 → エントリー判断 → 売買タブで記録
 ↓
12:30  limit_watch（昼）→ 軽め指値ヒットを LINE 通知
15:00  （週次）weekly_sniper / full_screener
15:30  limit_watch（引け前）
 ↓
夕方   morning.html → 🌆 夕方の振り返り
        終値スクショ → 明日の戦略生成
 ↓
任意   trading_journal.html → 💬 相談
        その日の判断について Gemini × Claude に深掘り
```

---

## 🔗 関連リポジトリ

| リポジトリ | 役割 |
|---|---|
| [stock-checker](https://github.com/hiroki300/stock-checker) | 自動監視システム本体（Python / GitHub Actions） |
| [trade-journal-data](https://github.com/hiroki300/trade-journal-data) | フロントエンドが参照する JSON データ置き場 |
| **trade-journal**（このリポジトリ） | フロントエンド PWA |

---

## 📝 主要バージョン履歴

### trading_journal.html
- **v1.1** (2026-04-25): 短期回転重視戦略浸透 / 損切り計算アシスタント / RR 1:2 デフォルト
- v1.0: スクショ自動読取 / 信用金利 2.8% 計算 / 折り畳み式分析カード
- v0.x: SBI スクショ読取（保有・建玉のタブ別プロンプト）

### morning.html
- **v0.19** (2026-04 後半): ETF 等の信用倍率 700 倍化対策
- **v0.18**: 朝会 UI 反転（情報先行型）/ 保有銘柄カードへのニュース表示
- v0.17 (Phase 5.3): ファンダ・需給チップ / 動的リスク管理 / 見送り機能
- v0.16 (Phase 5.1): Claude モデル切替 UI
- v0.14〜0.15 (Phase 4): 対話チャット / 文脈チップ / 履歴永続化 / 💬 深掘り
- v0.10〜0.11 (Phase 3.5+): IndexedDB アーカイブ / Markdown エクスポート / 日次まとめ
- v0.7〜0.9 (Phase 3): 夕会 / 売買分析 3 段分業

---

## ⚠️ 注意

- 個人運用専用。証券口座とは直結していない（手動入力＋スクショ読取）
- API キーはブラウザの localStorage のみに保存、GitHub には絶対に push しない
- スクショは Gemini 経由で読み取るため、ネットワーク経由で画像が一時送信される
- 投資判断の最終責任はユーザー本人。AI 判定はあくまで参考
