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

const SITE_URL = "https://www.stocklist.jp"; // ← 独自ドメイン導入時に変更
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const DATA_DIR = path.join(REPO_ROOT, "History", "events"); // 入力データ(events.json / <id>.json)の置き場
const OUT_DIR = path.join(REPO_ROOT, "events");             // 出力: /events/<slug>.html (クリーンURL /events/<slug>)
const EVENTS_JSON = path.join(DATA_DIR, "events.json");

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const jsonForScript = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

const yearMonth = (d) => { const [y, m] = d.split("-"); return `${y}年${Number(m)}月`; };
const ddPct = (dd) => `${dd < 0 ? "−" : ""}${Math.abs(Math.round(dd * 100))}%`;
// 底値: 大底の終値を「◯,◯◯◯円」で表示
const troughPriceStr = (c) => `${Math.round(c.trough.close).toLocaleString("ja-JP")}円`;
// 下落前の水準に戻るまで: 24ヶ月以上は「約◯年」、未満は「約◯ヶ月」、未回復は「未回復」
function recoverStr(c) {
  if (!c.recovered) return "未回復";
  return c.months_to_recover >= 24 ? `約${Math.round(c.months_to_recover / 12)}年` : `約${c.months_to_recover}ヶ月`;
}
// 数値を主役に: 先頭「約」と末尾の単位(%/円/年/ヶ月)を <span class="slv-u"> で包む。
// PCでは .slv-u は無装飾(=従来どおり)。スマホのみCSSで単位を小さくする。
const unitize = (s) => String(s)
  .replace(/^約/, '<span class="slv-u">約</span>')
  .replace(/(%|円|年|ヶ月)$/, '<span class="slv-u">$1</span>');

function pageHtml(cfg, series) {
  const url = `${SITE_URL}/events/${cfg.slug}`;
  const c = series && series.conclusion ? series.conclusion : null;

  // title/meta は検索クエリ対応の形式に統一
  const title = `${cfg.title}で日経平均は何%下落?回復まで何年?｜StockList`;
  const desc = c
    ? `${cfg.title}で日経平均は高値から約${ddPct(c.drawdown)}下落。底は${yearMonth(c.trough.date)}、高値回復まで${recoverStr(c)}。週次チャートと当時のニュースで、下落率・底・回復の流れを振り返ります。`
    : `${cfg.title}（${cfg.date}前後)の日経平均を週次チャートと当時のニュースで振り返ります。`;
  const ogImg = `${SITE_URL}/IMG_3857.jpg`;
  const modified = (series && series.generated_at ? series.generated_at : new Date().toISOString()).slice(0, 10);

  const jsonld = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description: desc,
    datePublished: cfg.date,
    dateModified: modified,
    about: cfg.title,
    keywords: [cfg.title, "日経平均", "下落率", "底", "回復", "チャート"].join(","),
    mainEntityOfPage: url,
    image: ogImg,
    author: { "@type": "Organization", name: "StockList" },
    publisher: { "@type": "Organization", name: "StockList", url: `${SITE_URL}/` },
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "ホーム", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "相場の歴史", item: `${SITE_URL}/history` },
      { "@type": "ListItem", position: 3, name: cfg.title, item: url },
    ],
  };
  // FAQPage: 画面表示のFAQと完全に同一文言(events.json の faq)
  const faq = Array.isArray(cfg.faq) ? cfg.faq : [];
  const faqLd = faq.length ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  } : null;

  // 結論ボックス(最上部)
  const verdictHtml = c ? `
    <section class="slv-verdict" aria-label="30秒でわかる結論">
      <h2 class="slv-verdict-h">30秒でわかる結論</h2>
      <div class="slv-verdict-grid">
        <div class="slv-vc"><div class="k">最大下落率</div><div class="v neg">${unitize(ddPct(c.drawdown))}</div><div class="note">高値からの下落</div></div>
        <div class="slv-vc"><div class="k">下落前の水準に戻るまで</div><div class="v">${unitize(recoverStr(c))}</div><div class="note">${c.recovered ? esc(cfg.recoveryNote || "下落前の高値を回復") : yearMonth(c.as_of) + "時点で未回復"}</div></div>
        <div class="slv-vc"><div class="k">底値</div><div class="v">${unitize(troughPriceStr(c))}</div><div class="note">${yearMonth(c.trough.date)}に大底</div></div>
      </div>
    </section>` : "";

  // FAQ(タイムラインの後・末尾)。details/summary でJS不要・全文クローラブル
  const faqHtml = faq.length ? `
    <section class="slv-faq" aria-label="よくある質問">
      <h2 class="slv-faq-h">よくある質問</h2>
      ${faq.map((f) => `<details><summary>${esc(f.q)}</summary><div class="slv-faq-a">${esc(f.a)}</div></details>`).join("\n      ")}
    </section>` : "";

  const nav = ALL.map((e) =>
    `<a href="/events/${e.slug}"${e.id === cfg.id ? ' aria-current="true"' : ""}>${esc(e.title)}</a>`).join("");

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
  <link rel="stylesheet" href="/crash-mode.css" />
  <link rel="stylesheet" href="/events/viewer.css" />
  <script src="/crash-mode.js" data-state="/state.json" defer></script>
  <script type="application/ld+json">${JSON.stringify(jsonld)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>
  ${faqLd ? `<script type="application/ld+json">${JSON.stringify(faqLd)}</script>` : ""}
  <!-- Google Analytics -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-06EHKG0SQ2"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-06EHKG0SQ2');</script>
</head>
<body>
  <div class="slv-topbar">
    <a class="back" href="/history">← 年表へ戻る</a>
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
${verdictHtml}
    <div id="slv-root"></div>

    <noscript>
      <h2>当時の主なニュース</h2>
      <ul>${newsHtml}</ul>
    </noscript>
${faqHtml}
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
  <script src="/events/viewer.js"></script>
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
    { loc: `${SITE_URL}/history`, pri: "0.8" },
    { loc: `${SITE_URL}/disclosure/`, pri: "0.3" },
    { loc: `${SITE_URL}/privacy/`, pri: "0.3" },
  ];
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const cfg of ALL) {
    const dataPath = path.join(DATA_DIR, `${cfg.id}.json`);
    let series = { points: [], kpi: null, source: "real" };
    if (fs.existsSync(dataPath)) series = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    else console.warn(`[warn] ${cfg.id}.json が無いためチャート無しで生成`);
    const out = path.join(OUT_DIR, `${cfg.slug}.html`);
    fs.writeFileSync(out, pageHtml(cfg, series), "utf8");
    urls.push({ loc: `${SITE_URL}/events/${cfg.slug}`, pri: "0.9" });
    console.log(`[out] events/${cfg.slug}.html`);
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
