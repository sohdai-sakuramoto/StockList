/*
 * サイト共通ヘッダー(ロゴ・メニュー・☰ドロワー・パンくず)
 *
 * - 生成ページ(events/*.html・timeline・crash-ranking・war-and-stocks)は
 *   build_event_pages.mjs / feature_*.mjs が siteHeaderHtml() を直接埋め込む。
 * - 手書きページ(index・history・now・start・privacy・disclosure)は、
 *   <!-- site-header --> 〜 <!-- /site-header --> の間を injectStaticPages() が書き換える。
 *   build_event_pages.mjs の実行時に一緒に更新される(単体: node backtest/scripts/site_header.mjs)。
 * - スタイルは /site-header.css。JS 不要(☰ は <details>)。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// 全ページ共通のメニュー(5項目)
export const NAV = [
  { key: "home", href: "/", label: "ホーム" },
  { key: "ranking", href: "/crash-ranking", label: "暴落ランキング" },
  { key: "events", href: "/history", label: "出来事一覧" },
  { key: "timeline", href: "/timeline", label: "年表" },
  { key: "now", href: "/now", label: "いまの相場" },
];

// ☰ ドロワーの中身(グループ別)
export const DRAWER = [
  { title: "相場の歴史", links: [
    { href: "/crash-ranking", label: "暴落ランキング" },
    { href: "/history", label: "出来事一覧" },
    { href: "/timeline", label: "年表" },
  ] },
  { title: "特集", links: [
    { href: "/war-and-stocks", label: "戦争と株価" },
  ] },
  { title: "いまの相場", links: [
    { href: "/now", label: "いまの下落と過去の暴落を比べる" },
    { href: "/start", label: "はじめての証券口座" },
  ] },
  { title: "StockList", links: [
    { href: "/", label: "ホーム" },
    { href: "/ContactForm", label: "お問い合わせ" },
  ] },
];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/**
 * @param {object} o
 * @param {string|null} o.active  NAV の key(該当なしは null)
 * @param {Array<{label:string, href?:string}>} [o.crumbs]  ホームより後のパンくず。最後が現在ページ
 */
export function siteHeaderHtml({ active = null, crumbs = [] } = {}) {
  const nav = NAV.map((n) =>
    `<a href="${n.href}"${n.key === active ? ' aria-current="page"' : ""}>${esc(n.label)}</a>`).join("");
  const drawer = DRAWER.map((g) =>
    `<p class="sh-group">${esc(g.title)}</p>${g.links.map((l) => `<a href="${l.href}">${esc(l.label)}</a>`).join("")}`).join("");
  const bc = crumbs.length ? `
  <nav class="sh-bc" aria-label="パンくずリスト"><ol><li><a href="/">ホーム</a></li>${crumbs.map((c, i) =>
    i === crumbs.length - 1 || !c.href
      ? `<li><span aria-current="page">${esc(c.label)}</span></li>`
      : `<li><a href="${c.href}">${esc(c.label)}</a></li>`).join("")}</ol></nav>` : "";
  return `<header class="sh">
  <div class="sh-bar">
    <a class="sh-logo" href="/" aria-label="StockList ホーム">Stock<span>List</span></a>
    <nav class="sh-nav" aria-label="メインメニュー">${nav}</nav>
    <details class="sh-more">
      <summary aria-label="メニューを開く"><span class="sh-burger" aria-hidden="true"></span></summary>
      <nav class="sh-drawer" aria-label="すべてのページ"><button type="button" class="sh-close" aria-label="メニューを閉じる" onclick="this.closest('details').open=false">×</button>${drawer}</nav>
    </details>
  </div>${bc}
</header>`;
}

/** JSON-LD の BreadcrumbList(画面のパンくずと同じ並び) */
export function breadcrumbLd(siteUrl, crumbs, currentUrl) {
  const items = [{ name: "ホーム", item: `${siteUrl}/` }, ...crumbs.map((c, i) => ({
    name: c.label, item: i === crumbs.length - 1 ? currentUrl : `${siteUrl}${c.href}`,
  }))];
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: items.map((x, i) => ({ "@type": "ListItem", position: i + 1, name: x.name, item: x.item })),
  };
}

// 手書きページの設定
export const STATIC_PAGES = [
  { file: "index.html", active: "home", crumbs: [] },
  { file: "history.html", active: "events", crumbs: [{ label: "出来事一覧" }] },
  { file: "now.html", active: "now", crumbs: [{ label: "いまの相場" }] },
  { file: "start/index.html", active: null, crumbs: [{ label: "はじめての証券口座" }] },
  { file: "privacy/index.html", active: null, crumbs: [{ label: "プライバシーポリシー" }] },
  { file: "disclosure/index.html", active: null, crumbs: [{ label: "アフィリエイト表記・免責事項" }] },
];

const MARK = /<!-- site-header -->[\s\S]*?<!-- \/site-header -->/;

export function injectStaticPages(root = ROOT) {
  const changed = [];
  for (const p of STATIC_PAGES) {
    const f = path.join(root, p.file);
    const html = fs.readFileSync(f, "utf8");
    if (!MARK.test(html)) throw new Error(`${p.file}: <!-- site-header --> マーカーがありません`);
    const next = html.replace(MARK, `<!-- site-header -->\n${siteHeaderHtml(p)}\n<!-- /site-header -->`);
    if (next !== html) { fs.writeFileSync(f, next); changed.push(p.file); }
  }
  return changed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const changed = injectStaticPages();
  console.log(changed.length ? `site header updated: ${changed.join(", ")}` : "site header: no changes");
}
