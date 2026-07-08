# イベントビューア用データ

`History/EventViewer.html` が読む、暴落イベントの「週次株価」と「その週のニュース」データ。

## ファイル

| ファイル | 内容 | 編集 |
|---|---|---|
| `events.json` | イベント定義(タイトル・期間・カテゴリ・**ニュース**) | 手動で編集 |
| `<id>.json` | 各イベントの**週次株価**(自動生成物) | 生成スクリプトで作成 |

## 週次株価の生成

`events.json` の各 `window`(約半年)を日次終値から切り出し、週足に集約する。

```bash
# 最新の実データ(Stooq→FRED)で生成
node backtest/scripts/build_event_data.mjs

# オフライン/デモ(合成データ)で生成
node backtest/scripts/build_event_data.mjs --data backtest/data/nkx_daily.demo.csv
```

- 出力 JSON の `source` が `real` 以外(`demo`)のとき、ビューアに「デモデータ」注記が出る。
- **公開前に必ず実データで再生成すること。** 現在コミットされている `<id>.json` は動作確認用のデモ。

## ニュースの追加・編集

`events.json` の各イベントの `news` 配列を編集する。日付(`date`)がチャートの週に自動でひも付く。

```json
{ "date": "2008-09-16", "title": "見出し", "body": "要約", "source": "出典", "url": "https://…" }
```

- 権利・運用リスクを避けるため、本文は「見出し＋要約＋リンク」に留める方針。
- `url` は任意(無ければ出典名のみ表示)。
