#!/usr/bin/env node
/**
 * イベント個別ページ(SEO用・静的HTML)と sitemap.xml を生成する。
 *
 * events.json + events/<id>.json から、各イベントの
 *   History/events/<id>.html   … 固有の title/description/OGP/JSON-LD + クロール可能な本文
 *                                  + 週次チャート(viewer.js で描画)
 * を生成し、リポジトリ直下に sitemap.xml / robots.txt を出力する。
 *
 * 実行: node backtest/scripts/build_event_pages.mjs
 * ※ 週次データ(<id>.json)は build_event_data.mjs で先に生成しておくこと。
 *
 * 独自ドメインに変えたら SITE_URL を書き換えて再生成する。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE_URL = "https://stock-list-kem9.vercel.app"; // ← 独自ドメイン導入時に変更
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const EVENTS_DIR = path.join(REPO_ROOT, "History", "events");
const EVENTS_JSON = path.join(EVENTS_DIR, "events.json");

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const jsonForScript = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

function pageHtml(cfg, series) {
  const url = `${SITE_URL}/History/events/${cfg.id}.html`;
  const title = `${cfg.title}の日経平均チャートと当時のニュース｜StockList`;
  const dd = series?.kpi ? `最大下落率 ${(series.kpi.max_drawdown * 100).toFixed(1)}%。` : "";
  const desc = `${cfg.title}（${cfg.date}前後）の日経平均を週次チャートで振り返る。${dd}当時の株価に影響したニュースと合わせて追体験できます。`;
  const ogImg = `${SITE_URL}/IMG_3857.jpg`;

  const jsonld = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${cfg.title}｜日経平均の暴落を追体験する`,
    description: cfg.summary || desc,
    datePublished: cfg.date,
    about: cfg.title,
    keywords: [cfg.title, "日経平均", "暴落", "株価", "チャート"].join(","),
    mainEntityOfPage: url,
    author: { "@type": "Organization", name: "StockList" },
    publisher: { "@type": "Organization", name: "StockList" },
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "ホーム", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "大きな出来事", item: `${SITE_URL}/History/History.html` },
      { "@type": "ListItem", position: 3, name: cfg.title, item: url },
    ],
  };

  const nav = ALL.map((e) =>
    `<a href="${e.id}.html"${e.id === cfg.id ? ' aria-current="true"' : ""}>${esc(e.title)}</a>`).join("");

  // クロール可能なニュース(noscript フォールバック兼、初期HTMLの本文)
  const newsHtml = (cfg.news || []).map((n) =>
    `<li><strong>${esc(n.date)}｜${esc(n.title)}</strong>${n.body ? "<br>" + esc(n.body) : ""}${n.source ? `（${esc(n.source)}）` : ""}</li>`).join("");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="StockList" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${ogImg}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(desc)}" />
  <meta name="twitter:image" content="${ogImg}" />
  <link rel="stylesheet" href="../../crash-mode.css" />
  <link rel="stylesheet" href="viewer.css" />
  <script src="../../crash-mode.js" data-state="../../state.json" defer></script>
  <script type="application/ld+json">${JSON.stringify(jsonld)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>
  <!-- Google Analytics -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-06EHKG0SQ2"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-06EHKG0SQ2');</script>
</head>
<body>
  <div class="slv-topbar">
    <a class="back" href="../History.html">← 年表へ戻る</a>
    <span class="brand">日経平均と大きな出来事</span>
  </div>
  <div class="slv-wrap">
    <nav class="slv-picker" aria-label="出来事を選ぶ">${nav}</nav>
    <div class="slv-head">
      <h1>${esc(cfg.title)}</h1>
      <span class="cat">${esc(cfg.category || "")}</span>
      <span class="date">${esc(cfg.date || "")} 前後</span>
    </div>
    <p class="slv-summary">${esc(cfg.summary || "")}</p>

    <div id="slv-root"></div>

    <noscript>
      <h2>当時の主なニュース</h2>
      <ul>${newsHtml}</ul>
    </noscript>

    <aside class="slv-cta">
      <p class="slv-cta-lead">暴落は、歴史的にはいつか戻ってきました。</p>
      <p class="slv-cta-sub">狼狽売りより、次の下落に備えて少額から。長期・積立の第一歩は口座づくりから。</p>
      <a class="slv-cta-btn" href="/start/">はじめての証券口座を見る →</a>
    </aside>

    <p class="slv-foot">
      ※ 教育・情報提供目的のページです。投資助言ではありません。株価データは検証用（Stooq/FRED）、ニュースは見出し・要約とリンクに留めています。
    </p>
  </div>

  <script type="application/json" id="slv-data">${jsonForScript({ cfg, series })}</script>
  <script src="viewer.js"></script>
  <script>
    (function () {
      var D = JSON.parse(document.getElementById("slv-data").textContent);
      StockListViewer.render(document.getElementById("slv-root"), D.cfg, D.series);
    })();
  </script>
</body>
</html>
`;
}

let ALL = [];
function main() {
  ALL = JSON.parse(fs.readFileSync(EVENTS_JSON, "utf8"));
  const urls = [
    { loc: `${SITE_URL}/`, pri: "1.0" },
    { loc: `${SITE_URL}/start/`, pri: "0.9" },
    { loc: `${SITE_URL}/History/History.html`, pri: "0.8" },
    { loc: `${SITE_URL}/disclosure/`, pri: "0.3" },
  ];
  for (const cfg of ALL) {
    const dataPath = path.join(EVENTS_DIR, `${cfg.id}.json`);
    let series = { points: [], kpi: null, source: "real" };
    if (fs.existsSync(dataPath)) series = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    else console.warn(`[warn] ${cfg.id}.json が無いためチャート無しで生成`);
    const out = path.join(EVENTS_DIR, `${cfg.id}.html`);
    fs.writeFileSync(out, pageHtml(cfg, series), "utf8");
    urls.push({ loc: `${SITE_URL}/History/events/${cfg.id}.html`, pri: "0.9" });
    console.log(`[out] History/events/${cfg.id}.html`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const sitemap =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.pri}</priority></url>`).join("\n") +
    "\n</urlset>\n";
  fs.writeFileSync(path.join(REPO_ROOT, "sitemap.xml"), sitemap, "utf8");
  console.log("[out] sitemap.xml");

  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
  fs.writeFileSync(path.join(REPO_ROOT, "robots.txt"), robots, "utf8");
  console.log("[out] robots.txt");
}

main();
