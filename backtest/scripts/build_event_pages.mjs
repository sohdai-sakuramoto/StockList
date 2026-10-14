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
import { warFeatureHtml } from "./feature_war.mjs";

const SITE_URL = "https://www.stocklist.jp"; // ← 独自ドメイン導入時に変更
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const DATA_DIR = path.join(REPO_ROOT, "History", "events"); // 入力データ(events.json / <id>.json)の置き場
const OUT_DIR = path.join(REPO_ROOT, "events");             // 出力: /events/<slug>.html (クリーンURL /events/<slug>)
const EVENTS_JSON = path.join(DATA_DIR, "events.json");
// 書籍から転記した企業別の年別株価(株価20年 等)。イベントの cfg.companies から参照する
const BOOK_DIR = path.join(DATA_DIR, "books");
function loadBook(name) {
  const p = path.join(BOOK_DIR, `${name}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const jsonForScript = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

const yearMonth = (d) => { const [y, m] = d.split("-"); return `${y}年${Number(m)}月`; };
const ddPct = (dd) => `${dd < 0 ? "−" : ""}${Math.abs(Math.round(dd * 100))}%`;
// 底値: 底(期間内の最安値)の終値を「◯,◯◯◯円」で表示
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

const fmtYen = (v) => (v == null ? "" : Number(v).toLocaleString("ja-JP", { maximumFractionDigits: 1 }));
function companiesTableHtml(spec) {
  if (!spec) return "";
  const book = loadBook(spec.book);
  if (!book) { console.warn(`[warn] 書籍データ ${spec.book}.json がありません`); return ""; }
  const years = spec.years;
  const flagged = (cid, y) => book.flags.some((f) => f.company === cid && f.field === "annual" && String(f.year) === String(y));
  const rows = [];
  for (const id of spec.ids) {
    const c = book.companies.find((x) => x.id === id);
    if (!c) { console.warn(`[warn] ${spec.book}: 企業 ${id} がありません`); continue; }
    if (years.some((y) => flagged(id, y))) { console.warn(`[warn] ${c.name}: 要確認の値を含むため表から除外`); continue; }
    const cells = years.map((y) => {
      const v = c.annual[String(y)];
      return v ? `<td><span class="hi">${fmtYen(v[0])}</span><span class="sep">〜</span><span class="lo">${fmtYen(v[1])}</span></td>` : `<td class="na">—</td>`;
    }).join("");
    const caps = c.capital.filter((k) => years.includes(Number(k.ym.slice(0, 4))))
      .map((k) => `${Number(k.ym.slice(0, 4))}年${Number(k.ym.slice(5, 7))}月`);
    // 前身企業の株価を含む年がある場合は社名の下に明記(例: 八幡製鐵の1949年以前は日本製鐵)
    const pre = c.predecessor && years.some((y) => y <= c.predecessor.until) ? `<small>${c.predecessor.until}年以前は前身の${esc(c.predecessor.name)}</small>` : "";
    rows.push(`<tr><th scope="row">${esc(c.name)}<small>現 ${esc(c.now)}</small>${pre}${cells}<td class="cap">${caps.length ? esc(caps.join("・")) : "なし"}</td></tr>`);
  }
  if (!rows.length) return "";
  return `
    <section class="slv-co" aria-label="${esc(spec.title)}">
      <h2>${esc(spec.title)}</h2>
      ${spec.lead ? `<p class="slv-co-lead">${esc(spec.lead)}</p>` : ""}
      <div class="slv-co-wrap"><table>
        <thead><tr><th scope="col">企業（当時の社名）</th>${years.map((y) => `<th scope="col">${y}年<small>高値〜安値</small></th>`).join("")}<th scope="col">期間中の増資</th></tr></thead>
        <tbody>${rows.join("")}</tbody>
      </table></div>
      <p class="slv-co-note">出典：『${esc(book.source.title)}』${book.source.publisher ? esc(book.source.publisher) : ""}（運営者による転記）。単位は円。年間の最高値〜最安値で、増資による株価の切り下がり（権利落ち）は調整していません。増資のあった年の下落には、その影響が含まれます。当時の株価は額面や株式分割の違いから、現在の株価とは比べられません。</p>
    </section>`;
}

function pageHtml(cfg, series) {
  const url = `${SITE_URL}/events/${cfg.slug}`;
  const c = series && series.conclusion ? series.conclusion : null;

  // title/meta は検索クエリ対応の形式に統一
  const title = `${cfg.title}で日経平均は何%下落?回復まで何年?｜StockList`;
  const ll = c && c.later_low ? c.later_low : null;
  const desc = c
    ? ll
      ? `${cfg.title}で日経平均は高値から約${ddPct(c.drawdown)}下落。底は${yearMonth(c.trough.date)}（${cfg.troughLabel || "この局面の底"}）、回復までの最安値は${yearMonth(ll.date)}の${troughPriceStr({ trough: ll })}（${ddPct(ll.drawdown)}）、高値回復まで${recoverStr(c)}。チャートと当時のニュースで振り返ります。`
      : `${cfg.title}で日経平均は高値から約${ddPct(c.drawdown)}下落。底は${yearMonth(c.trough.date)}、高値回復まで${recoverStr(c)}。週次チャートと当時のニュースで、下落率・底・回復の流れを振り返ります。`
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
      <div class="slv-verdict-grid${ll ? " four" : ""}">
        <div class="slv-vc"><div class="k">最大下落率</div><div class="v neg">${unitize(ddPct(c.drawdown))}</div><div class="note">${ll ? `${yearMonth(c.trough.date)}までの下落` : "高値からの下落"}</div></div>
        <div class="slv-vc"><div class="k">下落前の水準に戻るまで</div><div class="v">${unitize(recoverStr(c))}</div><div class="note">${c.recovered ? esc(cfg.recoveryNote || "下落前の高値を回復") : yearMonth(c.as_of) + "時点で未回復"}</div></div>
        <div class="slv-vc"><div class="k">底値</div><div class="v">${unitize(troughPriceStr(c))}</div><div class="note">${ll ? `${yearMonth(c.trough.date)}・${esc(cfg.troughLabel || "この局面の底")}` : `${yearMonth(c.trough.date)}に大底`}</div></div>${ll ? `
        <div class="slv-vc"><div class="k">回復までの最安値</div><div class="v">${unitize(troughPriceStr({ trough: ll }))}</div><div class="note">${yearMonth(ll.date)}・高値比${ddPct(ll.drawdown)}${cfg.laterLowNote ? `<br>${esc(cfg.laterLowNote)}` : ""}</div></div>` : ""}
      </div>
    </section>` : "";

  // FAQ(タイムラインの後・末尾)。details/summary でJS不要・全文クローラブル
  // 主な企業の株価(年間の高値・安値)。書籍データから描画し、要確認(flags)の値は出さない
  const companiesHtml = companiesTableHtml(cfg.companies);

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
  <link rel="stylesheet" href="/newsletter.css" />
  <script src="/crash-mode.js" data-state="/state.json" defer></script>
  <script src="/newsletter-config.js" defer></script>
  <script type="application/ld+json">${JSON.stringify(jsonld)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>
  ${faqLd ? `<script type="application/ld+json">${JSON.stringify(faqLd)}</script>` : ""}
  <script src="/analytics-config.js"></script>
  <!-- Google Analytics -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-06EHKG0SQ2"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-06EHKG0SQ2');</script>
  <!-- Vercel Web Analytics -->
  <script defer src="/_vercel/insights/script.js"></script>
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
${companiesHtml}
    <noscript>
      <h2>当時の主なニュース</h2>
      <ul>${newsHtml}</ul>
    </noscript>
${faqHtml}
    <aside class="slv-cta">
      <p class="slv-cta-lead">暴落は、歴史的にはいつか戻ってきました。</p>
      <p class="slv-cta-sub">狼狽売りより、次の下落に備えて少額から。長期・積立の第一歩は口座づくりから。</p>
      <a class="slv-cta-btn" href="/start">はじめての証券口座を見る →</a>
    </aside>

    <section class="nl" data-newsletter-block hidden>
      <h2>急落モードの日に、一通だけ。</h2>
      <p class="nl-sub">相場が大きく動いた日に、過去の暴落との比較を1通だけお届けします。しつこい配信はしません。いつでも解除できます。</p>
      <form class="nl-form" data-newsletter novalidate>
        <input type="email" required placeholder="メールアドレス" autocomplete="email" aria-label="メールアドレス" />
        <button type="submit">登録する</button>
        <p class="nl-msg" data-nl-msg style="display:none"></p>
      </form>
      <p class="nl-fine">登録は無料・配信は必要なときだけ。<a href="/privacy">プライバシーポリシー</a></p>
    </section>

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

// ── 全史年表(/timeline) ─────────────────────────────────────────────
// History/events/timeline.json(1953年〜)を静的HTMLに描画する(クローラブル)。
//   event   : events.json の id。詳細ページ(チャート+当時のニュース)へのリンクを付け、
//             metric 未指定なら結論の最大下落率、回復までの期間も自動表示する
//   related : 関連する詳細ページ(同じ局面の一部)へのリンク
const TL_TYPE = { crash: "暴落", boom: "暴騰", turn: "転換点", note: "出来事" };
function timelineHtml(items, info) {
  const url = `${SITE_URL}/timeline`;
  const title = "日本株 暴落・暴騰の年表（1945〜2026）｜StockList";
  const desc = "終戦後のドッジ不況、スターリン暴落、ブラックマンデー、バブル崩壊、リーマンショック、令和のブラックマンデーまで。日経平均・日本株を大きく動かした暴落・暴騰を年表で解説。主要な出来事はチャートと当時のニュースで振り返れます。";
  const ogImg = `${SITE_URL}/IMG_3857.jpg`;
  const breadcrumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "ホーム", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "相場の歴史", item: `${SITE_URL}/history` },
      { "@type": "ListItem", position: 3, name: "暴落・暴騰の年表", item: url },
    ],
  };
  let lastDecade = null;
  const rows = items.map((e) => {
    let head = "";
    const dec = `${Math.floor(Number(e.y) / 10) * 10}年代`;
    if (dec !== lastDecade) { head = `\n      <h2 class="decade">${dec}</h2>`; lastDecade = dec; }
    const ev = e.event ? info[e.event] : null;
    const rel = e.related ? info[e.related] : null;
    const c = ev && ev.c ? ev.c : null;
    const metric = e.metric || (c ? `高値比 ${ddPct(c.drawdown)}` : "");
    const tone = /[−-]/.test(metric) ? " neg" : /\+/.test(metric) ? " pos" : "";
    let more = "";
    if (ev) {
      more = `<div class="tl-foot"><a class="tl-more" href="/events/${ev.slug}">チャートと当時のニュースを見る →</a>` +
        (c ? `<span class="tl-rec">回復まで <b>${esc(recoverStr(c))}</b></span>` : "") + `</div>`;
    } else if (rel) {
      more = `<div class="tl-foot"><a class="tl-more tl-rel" href="/events/${rel.slug}">「${esc(rel.title)}」のチャートで見る →</a></div>`;
    }
    if (e.link) {
      const a = `<a class="tl-more tl-rel" href="${esc(e.link.href)}">${esc(e.link.label)} →</a>`;
      more = more ? more.replace(/<\/div>$/, a + "</div>") : `<div class="tl-foot">${a}</div>`;
    }
    return `${head}
      <article class="tl-item" data-type="${e.type}">
        <div class="tl-year">${esc(e.y)}${e.d ? `<small>${esc(e.d)}</small>` : ""}</div>
        <div class="tl-spine"><span class="tl-node ${e.type}"></span></div>
        <div class="tl-card${ev ? " has-page" : ""}">
          <div class="tl-head"><h3 class="tl-title">${esc(e.title)}</h3><span class="badge ${e.type}">${TL_TYPE[e.type]}</span>${metric ? `<span class="metric${tone}">${esc(metric)}</span>` : ""}</div>
          ${e.era ? `<p class="tl-era"><b>背景</b>　${esc(e.era)}</p>` : ""}
          <p class="tl-cause">${esc(e.cause)}</p>
          ${more}
        </div>
      </article>`;
  }).join("");
  const nPages = items.filter((e) => e.event && info[e.event]).length;

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
  <link rel="stylesheet" href="/crash-mode.css" />
  <link rel="stylesheet" href="/newsletter.css" />
  <script src="/crash-mode.js" data-state="/state.json" defer></script>
  <script src="/newsletter-config.js" defer></script>
  <script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>
  <script src="/analytics-config.js"></script>
  <!-- Google Analytics -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-06EHKG0SQ2"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-06EHKG0SQ2');</script>
  <style>
    :root{ --navy:#1b2538; --navy-2:#243149; --red:#da3c41; --up:#1a7f4b; --amber:#b8860b; --good:#1a7f4b;
      --ink:#16202e; --ink-2:#56606e; --muted:#8a929e; --line:#e7e9ee; --surface:#fff; --plane:#f4f6f9; --accent:#2f6fd0;
      --shadow:0 1px 2px rgba(16,32,46,.06), 0 8px 24px rgba(16,32,46,.07); }
    @media (prefers-color-scheme: dark){ :root{ --navy:#0f1626; --navy-2:#16203a; --red:#e0575c; --up:#35c07d; --amber:#e0b64d; --good:#35c07d;
      --ink:#e9edf4; --ink-2:#aab3c2; --muted:#7d8695; --line:#263042; --surface:#161d2b; --plane:#0e131d; --accent:#6ea3f0;
      --shadow:0 1px 2px rgba(0,0,0,.3), 0 10px 30px rgba(0,0,0,.35); } }
    *{box-sizing:border-box;}
    /* display:grid 等の指定より優先して hidden を効かせる(絞り込みフィルタ用) */
    [hidden]{display:none !important;}
    body{margin:0;background:var(--plane);color:var(--ink);line-height:1.7;
      font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic UI",system-ui,-apple-system,sans-serif;}
    a{color:var(--accent);text-decoration:none;}
    .topbar{background:var(--navy);color:#fff;padding:12px 20px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;}
    .topbar a{color:#cdd7ea;font-weight:600;font-size:14px;} .topbar a:hover{color:#fff;}
    .hero{background:linear-gradient(135deg,var(--navy) 0%,var(--navy-2) 100%);color:#fff;padding:46px 20px 50px;text-align:center;position:relative;overflow:hidden;}
    .hero::after{content:"";position:absolute;left:0;right:0;bottom:0;height:4px;background:var(--red);}
    .hero .eyebrow{font-size:12px;letter-spacing:.22em;color:#9fb0cc;margin:0 0 10px;text-transform:uppercase;}
    .hero h1{font-size:clamp(24px,4.4vw,38px);margin:0 0 10px;font-weight:800;letter-spacing:-.01em;}
    .hero p{margin:0 auto;max-width:36em;color:#c7d1e2;font-size:15px;}
    .wrap{max-width:900px;margin:0 auto;padding:26px 20px 72px;}
    .controls{display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between;margin:0 0 22px;}
    .filters{display:flex;gap:8px;flex-wrap:wrap;}
    .filters button{font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;padding:7px 16px;border-radius:999px;
      border:1px solid var(--line);background:var(--surface);color:var(--ink-2);}
    .filters button[aria-pressed="true"]{background:var(--navy);color:#fff;border-color:var(--navy);}
    .legend{display:flex;gap:14px;font-size:12.5px;color:var(--ink-2);flex-wrap:wrap;margin:0;}
    .legend span{display:inline-flex;align-items:center;gap:6px;}
    .dot{width:11px;height:11px;border-radius:50%;flex:none;display:inline-block;}
    .dot.crash,.tl-node.crash,.badge.crash{background:var(--red);}
    .dot.boom,.tl-node.boom,.badge.boom{background:var(--up);}
    .dot.turn,.tl-node.turn,.badge.turn{background:var(--amber);}
    .dot.note,.tl-node.note,.badge.note{background:var(--muted);}
    .decade{font-size:13px;font-weight:800;letter-spacing:.04em;color:var(--muted);margin:26px 0 12px;padding-bottom:6px;border-bottom:1px dashed var(--line);}
    .tl-item{display:grid;grid-template-columns:62px 22px 1fr;gap:0 14px;}
    .tl-year{text-align:right;font-weight:800;font-size:15px;font-variant-numeric:tabular-nums;padding-top:14px;letter-spacing:-.02em;}
    .tl-year small{display:block;font-weight:600;font-size:11px;color:var(--muted);letter-spacing:0;}
    .tl-spine{position:relative;}
    .tl-spine::before{content:"";position:absolute;left:50%;top:0;bottom:0;width:2px;background:var(--line);transform:translateX(-50%);}
    .tl-node{position:absolute;left:50%;top:22px;width:14px;height:14px;border-radius:50%;transform:translate(-50%,-50%);
      border:3px solid var(--plane);box-shadow:0 0 0 1px var(--line);}
    .tl-card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px 15px;margin:0 0 16px;box-shadow:var(--shadow);min-width:0;}
    .tl-card.has-page{border-left:4px solid var(--accent);}
    .tl-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
    .tl-title{font-size:16.5px;font-weight:800;margin:0;letter-spacing:-.01em;}
    .badge{font-size:11px;font-weight:800;border-radius:999px;padding:2px 9px;color:#fff;flex:none;}
    .metric{font-size:12.5px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--ink-2);background:var(--plane);
      border:1px solid var(--line);border-radius:6px;padding:1px 8px;flex:none;}
    .metric.neg{color:var(--red);} .metric.pos{color:var(--up);}
    .tl-era{font-size:12.5px;color:var(--muted);margin:6px 0 0;} .tl-era b{color:var(--ink-2);}
    .tl-cause{font-size:14px;color:var(--ink-2);margin:6px 0 0;}
    .tl-foot{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;margin-top:10px;}
    .tl-more{font-size:13.5px;font-weight:700;} .tl-more:hover{text-decoration:underline;}
    .tl-rel{font-weight:600;font-size:13px;}
    .tl-rec{font-size:12.5px;color:var(--ink-2);} .tl-rec b{color:var(--good);}
    .cta{background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--red);border-radius:12px;padding:18px 20px;margin:34px 0 0;}
    .cta b{font-size:15.5px;} .cta p{color:var(--ink-2);font-size:14px;margin:4px 0 12px;}
    .btn{display:inline-block;background:var(--red);color:#fff;font-weight:700;padding:11px 20px;border-radius:10px;}
    .foot{color:var(--muted);font-size:12px;margin-top:30px;border-top:1px solid var(--line);padding-top:14px;}
    @media (max-width:560px){ .tl-item{grid-template-columns:54px 16px 1fr;gap:0 10px;} .tl-year{font-size:13.5px;} .tl-year small{font-size:10px;letter-spacing:-.04em;white-space:nowrap;} .tl-title{font-size:15.5px;} }
  </style>
  <!-- Vercel Web Analytics -->
  <script defer src="/_vercel/insights/script.js"></script>
</head>
<body>
  <div class="topbar"><a href="/">← StockList トップ</a><a href="/history">相場の歴史</a><a href="/now">今の下落と比べる</a></div>
  <header class="hero">
    <p class="eyebrow">Nikkei 225 · 1945–2026</p>
    <h1>日本株 暴落・暴騰の年表</h1>
    <p>東証再開（1949年）以降、日本株を大きく揺らした出来事を時系列で。青い線のある${nPages}つの出来事は、週次チャートと当時のニュースで詳しく振り返れます。</p>
  </header>
  <main class="wrap">
    <div class="controls">
      <div class="filters" hidden>
        <button type="button" data-filter="all" aria-pressed="true">すべて</button>
        <button type="button" data-filter="crash" aria-pressed="false">暴落だけ</button>
        <button type="button" data-filter="boom" aria-pressed="false">暴騰だけ</button>
      </div>
      <p class="legend"><span><i class="dot crash"></i>暴落</span><span><i class="dot boom"></i>暴騰</span><span><i class="dot turn"></i>転換点</span><span><i class="dot note"></i>出来事</span></p>
    </div>
    <div id="tl">${rows}
    </div>

    <aside class="cta">
      <b>暴落は、歴史的にはいつか戻ってきました。</b>
      <p>焦って売るより、次の下落に備えて少額から。長期・積立の第一歩は口座づくりから。</p>
      <a class="btn" href="/start">はじめての証券口座を見る →</a>
    </aside>
    <section class="nl" data-newsletter-block hidden>
      <h2>急落モードの日に、一通だけ。</h2>
      <p class="nl-sub">相場が大きく動いた日に、過去の暴落との比較を1通だけお届けします。しつこい配信はしません。いつでも解除できます。</p>
      <form class="nl-form" data-newsletter novalidate>
        <input type="email" required placeholder="メールアドレス" autocomplete="email" aria-label="メールアドレス" />
        <button type="submit">登録する</button>
        <p class="nl-msg" data-nl-msg style="display:none"></p>
      </form>
      <p class="nl-fine">登録は無料・配信は必要なときだけ。<a href="/privacy">プライバシーポリシー</a></p>
    </section>
    <p class="foot">
      ※ 教育・情報提供目的のページです。投資助言ではありません。数値は日経平均の終値などに基づく参考値で、チャートは検証用データ（Stooq/FRED）を使用しています。
    </p>
  </main>
  <script>
  (function () {
    var box = document.querySelector(".filters"); if (!box) return;
    box.hidden = false; // JSが動く環境でだけ絞り込みボタンを出す
    var btns = box.querySelectorAll("button");
    function apply(f) {
      document.querySelectorAll("#tl .tl-item").forEach(function (it) { it.hidden = !(f === "all" || it.getAttribute("data-type") === f); });
      // 表示対象が無くなった年代見出しは隠す
      document.querySelectorAll("#tl .decade").forEach(function (h) {
        var n = h.nextElementSibling, any = false;
        while (n && !n.classList.contains("decade")) { if (!n.hidden) any = true; n = n.nextElementSibling; }
        h.hidden = !any;
      });
    }
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        btns.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        apply(b.getAttribute("data-filter"));
      });
    });
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
    { loc: `${SITE_URL}/start`, pri: "0.9" },
    { loc: `${SITE_URL}/history`, pri: "0.8" },
    { loc: `${SITE_URL}/timeline`, pri: "0.8" },
    { loc: `${SITE_URL}/war-and-stocks`, pri: "0.8" },
    { loc: `${SITE_URL}/now`, pri: "0.7" },
    { loc: `${SITE_URL}/disclosure`, pri: "0.3" },
    { loc: `${SITE_URL}/privacy`, pri: "0.3" },
  ];
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const summary = []; // /now(今の下落 vs 過去の暴落)ページ用の比較データ
  const info = {};    // /timeline 用: id → { slug, title, c(結論) }
  for (const cfg of ALL) {
    const dataPath = path.join(DATA_DIR, `${cfg.id}.json`);
    let series = { points: [], kpi: null, source: "real" };
    if (fs.existsSync(dataPath)) series = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    else console.warn(`[warn] ${cfg.id}.json が無いためチャート無しで生成`);
    const out = path.join(OUT_DIR, `${cfg.slug}.html`);
    fs.writeFileSync(out, pageHtml(cfg, series), "utf8");
    urls.push({ loc: `${SITE_URL}/events/${cfg.slug}`, pri: "0.9" });
    console.log(`[out] events/${cfg.slug}.html`);
    const c = series.conclusion;
    info[cfg.id] = { slug: cfg.slug, title: cfg.title, c: c || null };
    if (c) summary.push({
      slug: cfg.slug, url: `/events/${cfg.slug}`, title: cfg.title, date: cfg.date, category: cfg.category || "",
      drawdown: c.drawdown, drawdown_label: ddPct(c.drawdown),
      recovered: !!c.recovered, months_to_recover: c.months_to_recover, recover_label: recoverStr(c),
      trough_date: c.trough.date, trough_close: c.trough.close,
    });
  }
  // 履歴イベントの要点サマリー(/now ページが state.json と併せて読む・機械算出)
  summary.sort((a, b) => a.drawdown - b.drawdown); // 深い順
  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");
  console.log("[out] events/summary.json");

  // 全史年表(/timeline): timeline.json + 各イベントの結論から静的生成
  const timeline = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "timeline.json"), "utf8"));
  for (const e of timeline) for (const k of ["event", "related"]) {
    if (e[k] && !info[e[k]]) console.warn(`[warn] timeline: ${e.y} ${e.title} の ${k}=${e[k]} が events.json にありません(リンク無しで生成)`);
  }
  fs.writeFileSync(path.join(REPO_ROOT, "timeline.html"), timelineHtml(timeline, info), "utf8");
  console.log(`[out] timeline.html (${timeline.length}件)`);

  // 特集「戦争と株価」: 書籍データ(株価20年) + 現代の戦争の実データ(build_feature_data.mjs)
  const book = loadBook("kabuka20");
  const warPath = path.join(DATA_DIR, "features", "war.json");
  const war = fs.existsSync(warPath) ? JSON.parse(fs.readFileSync(warPath, "utf8")) : null;
  if (!war) console.warn("[warn] features/war.json が無いため、特集の現代の戦争パートは省略");
  fs.writeFileSync(path.join(REPO_ROOT, "war-and-stocks.html"), warFeatureHtml({ book, war, siteUrl: SITE_URL }), "utf8");
  console.log("[out] war-and-stocks.html");

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
