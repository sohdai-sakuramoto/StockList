#!/usr/bin/env node
/**
 * 株価スナップショット(quotes.json)生成スクリプト
 *
 * Yahoo Finance の公開チャートAPI(約20分遅延)から、日経平均と主要銘柄の
 * 直近価格を取得して quotes.json を書き出す。GitHub Actions が市場時間中
 * 15分毎に実行し、market-data ブランチへプッシュ → crash-mode.js のバナーが
 * raw.githubusercontent.com 経由で読み込む(mainへのコミット・再デプロイなし)。
 *
 * 実行: node backtest/scripts/update_quotes.mjs [--out <path>]
 *
 * ※ 遅延データの参考表示であり、リアルタイム相場ではない。表示側で
 *   「約20分遅延」を必ず明記する。銘柄の変更は SYMBOLS を編集する。
 */
import fs from "node:fs";
import path from "node:path";

// 時価総額上位の目安として3銘柄(入れ替えはここを編集)
const SYMBOLS = [
  { code: "7203.T", name: "トヨタ" },
  { code: "6758.T", name: "ソニーG" },
  { code: "8306.T", name: "三菱UFJ" },
];
const INDEX = { code: "^N225", name: "日経平均" };

const UA = "Mozilla/5.0 (compatible; StockListBot/1.0; +https://www.stocklist.jp)";

async function fetchChartMeta(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status}`);
  const j = await res.json();
  const meta = j?.chart?.result?.[0]?.meta;
  if (!meta || meta.regularMarketPrice == null) throw new Error(`${symbol}: meta欠落`);
  const prev = meta.previousClose ?? meta.chartPreviousClose;
  return {
    price: meta.regularMarketPrice,
    prev_close: prev ?? null,
    change_pct: prev ? meta.regularMarketPrice / prev - 1 : null,
    market_time: meta.regularMarketTime ?? null, // epoch秒
  };
}

const round2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
const round4 = (x) => (x == null ? null : Math.round(x * 10000) / 10000);

async function main() {
  const outIdx = process.argv.indexOf("--out");
  const outPath = outIdx >= 0 ? process.argv[outIdx + 1] : path.resolve("quotes.json");

  const nk = await fetchChartMeta(INDEX.code);
  const stocks = [];
  for (const s of SYMBOLS) {
    try {
      const q = await fetchChartMeta(s.code);
      stocks.push({ code: s.code, name: s.name, price: round2(q.price), change_pct: round4(q.change_pct) });
    } catch (e) {
      console.warn(`[warn] ${s.code} 取得失敗: ${e.message}(スキップ)`);
    }
  }

  const out = {
    schema: "stocklist-quotes/1",
    updated_at: new Date().toISOString(),
    source: "Yahoo Finance(約20分遅延の参考値)",
    delayed: true,
    nikkei: {
      name: INDEX.name,
      price: round2(nk.price),
      prev_close: round2(nk.prev_close),
      change_pct: round4(nk.change_pct),
      market_time: nk.market_time,
    },
    stocks,
  };
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`[out] ${outPath}: 日経=${out.nikkei.price} (${out.nikkei.change_pct == null ? "-" : (out.nikkei.change_pct * 100).toFixed(2) + "%"}), 銘柄=${stocks.map((s) => s.name).join("/") || "なし"}`);
}

main().catch((e) => { console.error(`ERROR: ${e.message}`); process.exit(1); });
