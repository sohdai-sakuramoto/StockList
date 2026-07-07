# 急落モード発動ルールのバックテスト

`backtest_spec_claude_code.md`(実装指示書)に基づく、日経平均の「急落モード」発動ルール検証ツール。
状態機械 (normal / caution / crash / recovery) の閾値候補 **108通り** を 2000年以降の日次終値で総当たり評価し、最良設定を選定する。

## 使い方

```bash
node backtest.js          # Stooq からデータ取得(初回のみ)→ 全グリッド評価 → 出力
node --test test.js       # ユニットテスト
```

- データは `data/nkx_daily.csv` にキャッシュされ、**2回目以降はキャッシュ優先**。
- 追加パッケージ不要(Node 18+ の組み込み `fetch` / `node:test` のみ使用)。

### データソースと自動フォールバック

仕様の検証用ソースは Stooq (`^nkx`) だが、近年 Stooq は bot 対策(JavaScript認証)で
自動取得が弾かれ、CSVの代わりに認証HTMLを返すことがある。そのため取得は次の順で試行し、
**正規のCSVを返した最初のソースを採用**する:

1. Stooq: `https://stooq.com/q/d/l/?s=^nkx&i=d`
2. FRED (米セントルイス連銀): `https://fred.stlouisfed.org/graph/fredgraph.csv?id=NIKKEI225`(認証不要)

CSVパーサは Stooq(`Date,…,Close,…`)/ FRED(`DATE,NIKKEI225` の2列)/ Yahoo(`Adj Close`)の
いずれの列形式も自動判別する。全ソースに到達できない場合はエラーで停止する(仕様どおり)。

**手動でデータを置く場合**: 上記いずれかのCSVをダウンロードして `data/nkx_daily.csv` に保存し、
`node backtest.js` を実行すればキャッシュとして使われる(取得はスキップ)。
特定ファイルを直接指定するなら `node backtest.js --data <path>`。

### ネットワークが遮断された環境での動作確認(デモ)

開発に使ったリモート環境では Stooq / Yahoo / FRED など金融データソースへの接続が
すべてポリシーで遮断されていたため、**無理に接続せず**、主要イベント日の騰落率を
おおよそ史実に合わせた「近似合成データ」でパイプラインを検証できるようにしてある。

```bash
node scripts/generate_demo_data.js                              # data/nkx_daily.demo.csv を生成
node backtest.js --data data/nkx_daily.demo.csv --out out_demo  # デモデータで全評価
```

⚠ 合成データはあくまで動作確認用。**閾値の最終決定は必ず実データで行うこと。**

## 出力物

| ファイル | 内容 |
|---|---|
| `results.csv` | 全108設定 × 全指標の一覧 |
| `best_config.json` | 採用設定(発動・解除条件、通知ポリシー、指標) |
| `report.md` | 検証レポート(イベント別検出状況・境界イベント・誤発動・全遷移履歴) |
| `fires_for_trends.csv` | 採用設定の全 crash 発動日 (date, dd, trigger_condition) |

## 実装上の解釈(仕様の曖昧な点の確定)

- `peak` は「直近 lookback 営業日(**当日含む**)の終値最高値」。crash 中も rolling 更新を継続。
- crash の解除判定に使う「急落前高値」は発動時点の rolling peak を固定保持(`preCrashPeak`)。
  `dd > -5% 回復` と `recovery → normal` の高値更新はいずれもこの固定値に対して判定する。
- 条件C の「peak更新日」は rolling 窓内で最高値を**厳密に上回った**最初の日。
- リードタイムは「発動時点の急落前高値の日 → crash 遷移日」の営業日数。
- notify は同一ドローダウン局面(局面開始時の高値を終値が上回るまで)につき初回のみ true。
- 冒頭 lookback 営業日はウォームアップとして判定対象外
  (このため lookback=120/250 は E01=2000年4月 を構造的に検出できない)。
- 閾値比較には 1e-9 の許容(仕様どおり)。

## 重要な発見(デモデータでの実行より)

**recall = 1.0 を満たす設定はグリッド内に存在しない可能性が高い。**
原因は閾値ではなくイベント判定方法にある:

- 判定は「ウィンドウ内に crash への **遷移** が1回以上」だが、
  E02(米同時多発テロ)や E08(2016年年初)などは**イベント前から下落局面が続いており、
  すでに crash 状態のままウィンドウに入る**ため、新規遷移が発生しない。
- レポートの診断列と `results.csv` の `recall_relaxed`
  (遷移が無くても crash **状態** がウィンドウ内にあれば捕捉とみなす緩和版)で確認できる。
  緩和版では recall 1.0 を達成する設定が存在する。

→ 対応案: イベント判定を「状態ベース」に変える、または再発動条件(crash 中の追い打ち暴落の扱い)を見直す。
このため `selectBest()` は合格設定が無い場合、最大 recall の中からスコア最大の設定を
**暫定採用**として選び、`best_config.json` の `passed_spec_criteria: false` で明示する。
