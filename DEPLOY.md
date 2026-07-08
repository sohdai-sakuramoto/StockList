# デプロイ手順(Vercel)

本番ブランチは **`main`**。`main` への push で Vercel が自動デプロイする。

## 初回セットアップ(Vercel との接続)

1. https://vercel.com にログイン(GitHub アカウントで可)
2. **Add New… → Project** → GitHub リポジトリ `sohdai-sakuramoto/StockList` を **Import**
3. 設定:
   - **Framework Preset**: `Other`(静的サイトなのでビルド不要)
   - **Root Directory**: `./`(リポジトリ直下)
   - **Build Command / Output Directory**: 空のまま(未設定)
   - **Production Branch**: `main`
4. **Deploy** を押す → 数十秒で公開。`https://<project>.vercel.app` が発行される
5. 独自ドメインを使う場合は Project → Settings → Domains で追加

`vercel.json` の `cleanUrls: true` により `/index`・`/History/History` などの拡張子なしリンクが解決される。

## 更新の流れ

- **コード変更**: `main` に push すれば自動で再デプロイ。
- **株価データの自動更新**: `.github/workflows/update-market-state.yml` が平日 18:00 JST に
  最新データを取得して `state.json` と `History/events/*.json` を再生成・コミット →
  その push で Vercel が再デプロイ。手動実行は GitHub の Actions タブ →
  「Update market state」→ Run workflow。

## 注意

- Vercel の無料(Hobby)プランは**非商用限定**。広告・アフィリエイト等で収益化する際は Pro へ。
- 株価は検証用データ(Stooq→FRED)。公開・商用化の前に指数データのライセンスを確認すること。
