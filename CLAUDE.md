StocList claude.md

# StockList合同会社

## 会社概要
- ミッション：過去の相場の暴落・急騰を当時のニュースとともに記録し、個人投資家が歴史から学べる場をつくる
- 事業：日本株の相場アーカイブサイト「StockList」の運営
- 主な読者：初心者〜中級の個人投資家
- 代表：Sohdai（最終意思決定者）

## 現在のフェーズ（2026年10月時点）
- サイト公開直後。最優先は「認知獲得」と「読者の反応の検証」
- 優先順位：コンテンツの正確さ > SEO・集客 > 収益化

## 今後2~6ヶ月の目標
- ユーザー数を増やし、定着させる（MAU：10,000）

## 今後6ヶ月~1年の目標
- 収益化（月商：15万円）

## 組織（AI社員）
- CMO：集客戦略、X運用、広告 → .claude/agents/cmo.md
- CFO：利益やコストの管理 → .claude/agents/cfo.md
- 編集長：記事・イベントページ制作、ファクトチェック → .claude/agents/editor.md
- エンジニア：サイト開発・保守 → .claude/agents/engineer.md
- デザイナー：サイトやX運用、記事のデザイン設計 → .claude/agents/designer.md
- 判断に迷う、または担当外の場合は代表に確認する

## 絶対ルール
- 特定銘柄の売買推奨・将来の株価予想をしない（投資助言に該当し得るため）
- 株価・日付・数値は必ず出典を確認し、出典を記録する
- 公開・投稿・広告出稿・データ削除は、必ず代表の承認を得てから行う
- 推測で事実を書かない。不明な点は「不明」とするか代表に確認する。

## 表記ルール
- です・ます調
- 指数名は「日経平均株価」で統一（初出のみ正式名称）
- 日付は「2024年8月5日」形式、数値は3桁区切り

## 技術
- ホスティング：Vercel（main への push で自動デプロイ）
- フレームワーク：なし（素の HTML / CSS / JavaScript の静的サイト）
  - ページ生成・データ処理は Node.js 20 のスクリプト（ESM、外部ライブラリなし）
  - URL は vercel.json の cleanUrls（.html なし）・trailingSlash: false（末尾スラッシュなし）
  - 計測：Vercel Web Analytics / GA4 / X ウェブサイトタグ
    （ID は Vercel の環境変数 GA_MEASUREMENT_ID・X_PIXEL_ID・X_PIXEL_EVENT_ID から読み込む）
- ディレクトリ構成：
  - `index.html` `history.html` `timeline.html` `now.html` `war-and-stocks.html` … 各ページ
  - `start/` `privacy/` `disclosure/` … 証券口座ガイド・プライバシーポリシー・免責事項
  - `events/` … イベント別ページ（*.html は自動生成）、viewer.js / viewer.css、summary.json
  - `History/events/` … イベントのデータ（events.json・<id>.json・navigation.json・timeline.json・books/）
  - `og/events/` … イベント別の OGP 画像（1200×630）
  - `backtest/` … データ取得・急落モード判定・ページ生成のスクリプト（scripts/）とテスト（test.js）
  - `analytics-config.js` … 計測の読み込みと自分のアクセス除外（?va-disable=1）
  - `affiliate-config.js` `newsletter-config.js` `crash-mode.js` … アフィリエイト・メルマガ・急落モード表示
  - `.github/workflows/` … 市場データの自動更新（平日18時 JST）・株価スナップショット（市場時間中15分毎）
  - `docs/` … リダイレクト対応表など
  - ※ `events/*.html` `timeline.html` `war-and-stocks.html` `crash-ranking.html` `sitemap.xml` `state.json` は自動生成。直接編集せず、生成スクリプトかデータを直す
- コマンド：
  - テスト：`npm --prefix backtest test`
  - ページ再生成：`node backtest/scripts/build_event_pages.mjs`（イベントページ・年表・特集・暴落ランキング・sitemap）
  - データ更新：`node backtest/scripts/update_state.mjs` → `build_event_data.mjs` → `build_feature_data.mjs`
    （外部の株価データを取得するため、通常は GitHub Actions「Update market state」で実行）
  - OGP 画像の再生成：`node backtest/scripts/build_og_images.mjs`（Playwright と Noto Sans JP フォントが必要。イベント追加時のみ）
  - ビルド：`node backtest/scripts/write_site_config.mjs`（Vercel がデプロイ時に自動実行。環境変数から site-config.js を作る）
  - デプロイ：作業ブランチ → PR → main にマージすると Vercel が自動デプロイ

## 参考資料
- ブランド・トーン詳細：@docs/brand.md
- コンテンツ制作手順：@docs/content-guide.md