# 旧URL → 新URL リダイレクト対応表

`vercel.json` の `redirects` で設定。2026-07-19 のURL構造変更（`/History/...` → 小文字・意味のあるスラッグ）で変わったURLを、新URLへ **301** で転送する。

## 旧URL体系と新URL体系

| 旧URL（2026-07-19 まで） | 新URL | 備考 |
|---|---|---|
| `/History/History`（`.html` 付きも） | `/history` | 旧ハブページ（旧サイトマップ掲載） |
| `/History`、`/History/`、`/History/index.html` | `/history` | 大文字の `/History` は旧下書きページ（noindex）だった |
| `/History/events/lehman` | `/events/lehman-shock` | 旧サイトマップ掲載 |
| `/History/events/great-east-japan` | `/events/great-east-japan-earthquake` | 旧サイトマップ掲載 |
| `/History/events/covid` | `/events/covid-shock` | 旧サイトマップ掲載 |
| `/History/events/ishiba` | `/events/ishiba-shock` | 旧サイトマップ掲載 |
| `/History/events/<その他>` | `/events/<その他>` | 念のための包括ルール |
| `/History/EventViewer?e=lehman` 等（`.html` 付きも） | `/events/<新スラッグ>` | 旧イベントビューア。以前はJSリダイレクトのみだった |
| `/History/EventViewer`（`e` なし） | `/history` | |
| `/History/Covid19/*`（2021年の月別ページ9件） | `/events/covid-shock` | 旧コンテンツ。2026-10 に noindex から 301 へ切り替え |
| `/History/GreatEastJapanEarthquake/*`（ANA・日本郵船など6件） | `/events/great-east-japan-earthquake` | 同上 |
| `/History/FinancialCrisis2008/*` | `/events/lehman-shock` | 同上 |

## 転送の段数とステータスコード

- `vercel.json` の `redirects` は `statusCode: 301`（`permanent: true` は 308 になるため使わない）。
- `.html` 付きURLと末尾スラッシュ付きURLは、Vercel の `cleanUrls` / `trailingSlash: false` が先に **308** で拡張子なし・スラッシュなしへ転送し、その後 301 で新URLへ転送する（2段）。308 は Google では 301 と同じ「恒久的な転送」として扱われる。
  - 例: `/History/events/lehman.html` → 308 → `/History/events/lehman` → 301 → `/events/lehman-shock`
- 大文字小文字: `vercel.json` の redirects / headers の `source` は大文字小文字を区別する（Vercel 公式ドキュメント）。`/History` のルールは `/history` には当たらない。ファイルの配信も区別するため、`/Events/lehman-shock` のような表記ゆれは 404。

## 確認用一覧（期待される転送）

```
/History/History.html                      308 → /History/History  301 → /history
/History/History                           301 → /history
/History                                   301 → /history
/History/events/lehman.html                308 → /History/events/lehman  301 → /events/lehman-shock
/History/events/lehman                     301 → /events/lehman-shock
/History/events/great-east-japan           301 → /events/great-east-japan-earthquake
/History/events/covid                      301 → /events/covid-shock
/History/events/ishiba                     301 → /events/ishiba-shock
/History/EventViewer.html?e=lehman         308 → /History/EventViewer?e=lehman  301 → /events/lehman-shock?e=lehman
/history/                                  308 → /history
/start/                                    308 → /start
/History/Covid19/2020-1                    301 → /events/covid-shock
/events/lehman-shock                       200（転送なし）
/history                                   200（転送なし）
```

本番での確認コマンド例（`-I` でヘッダーのみ、`-L` で最後まで追う）:

```sh
curl -sI https://www.stocklist.jp/History/events/lehman | grep -iE "^(HTTP|location)"
curl -sIL https://www.stocklist.jp/History/History.html | grep -iE "^(HTTP|location)"
curl -sI https://www.stocklist.jp/history | head -1     # 200 であること(転送ループしないこと)
```
