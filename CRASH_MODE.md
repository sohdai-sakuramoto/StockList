# 急落モード(サイト自動切替)

市場の急落時に、サイト上部へ状態バナー(平常/警戒/急落/回復)を自動表示する仕組み。
発動しきい値はバックテスト(`backtest/`)で決定した採用設定を使う。

## 構成

| ファイル | 役割 |
|---|---|
| `state.json` | 現在の状態(モード・ドローダウン・メッセージ等)。**サイトが読む唯一のデータ** |
| `crash-mode.js` | `state.json` を読み、上部にバナーを差し込むクライアントスクリプト |
| `crash-mode.css` | バナーのスタイル(サイトの濃紺/赤トーンに合わせた4モード配色) |
| `backtest/scripts/update_state.mjs` | 最新の日経平均データから `state.json` を生成・更新するスクリプト |

状態機械と発動しきい値は `backtest/backtest.js` と共通(同じロジックを再利用)。

## 仕組み

1. `update_state.mjs` が最新データ(Stooq→FRED フォールバック)を取得し、採用設定で状態機械を回して
   「今どのモードか」を判定 → `state.json` に書き出す。
2. 各ページは `crash-mode.js` が `state.json` を fetch し、モードに応じたバナーを `<body>` 先頭に挿入。
3. `mode` が `normal` のとき、および `state.json` が取得できないときはバナーを出さない
   (サイトの通常表示を妨げない安全設計)。

## 使い方

### 状態の更新(定期的に実行)

```bash
# 最新データで state.json を更新(採用設定 best_config.json があればそれを使用)
node backtest/scripts/update_state.mjs

# オフライン確認(キャッシュ/任意CSVで)
node backtest/scripts/update_state.mjs --data backtest/data/nkx_daily.csv
```

更新後に `state.json` をコミット&デプロイすれば、サイトに反映される。
市場が動く日次で更新する運用を想定(将来 GitHub Actions 等での定期実行で完全自動化可能。本タスクではスコープ外)。

### 別ページへの追加

`index.html` には組み込み済み。他ページに出す場合は `<head>` に以下を追加する。
`state.json` はリポジトリ直下にあるので、サブディレクトリからは相対パスで指定する。

```html
<!-- ルート直下のページ -->
<link rel="stylesheet" href="crash-mode.css">
<script src="crash-mode.js" data-state="state.json" defer></script>

<!-- 例) History/History.html など1階層下のページ -->
<link rel="stylesheet" href="../crash-mode.css">
<script src="../crash-mode.js" data-state="../state.json" defer></script>
```

- `data-show-normal="true"` を付けると平常モードでもバナーを表示する(既定は非表示)。

## 注意

- `state.json` の初期値は動作確認用のプレースホルダ(平常モード)。
  **公開前に `node backtest/scripts/update_state.mjs` を実行して最新の実データに更新すること。**
- バナーの数値は検証用データ(Stooq/FRED)に基づく参考値。本番の投資助言用途ではない旨、`disclaimer` に明記。
