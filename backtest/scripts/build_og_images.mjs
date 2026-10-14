#!/usr/bin/env node
/**
 * イベント別の OGP 画像(1200×630)を生成する: og/events/<slug>.png
 *
 * X / Google 広告・SNS でシェアされた時のカード画像。イベント名・発生日・最大下落率・
 * 高値回復までの期間・日経平均の推移(下落前の水準の基準線つき)を載せる。
 * 数値は events/summary.json(build_event_pages.mjs が実データから機械算出)と同じものを使う。
 *
 * 歴史上のイベントは数値がほぼ変わらないため、画像はコミットして静的配信する(CIでは生成しない)。
 * イベントを追加・数値が変わった時にローカルで再実行する。画像が無いイベントは
 * build_event_pages.mjs が共通画像(IMG_3857.jpg)にフォールバックする。
 *
 * 実行: node backtest/scripts/build_og_images.mjs [slug ...]
 *   要 Playwright(Chromium)と日本語フォント Noto Sans JP(TTF)。
 *   フォントはシステムに頼らず @font-face で明示的に読み込む(日本語フォントが無い環境では
 *   中国語フォントで代替描画され「約」などが中国語の字形になるため)。フォントの場所は
 *     1) 環境変数 OG_FONT_DIR(NotoSansJP_400Regular.ttf 等を含むディレクトリ)
 *     2) npm パッケージ @expo-google-fonts/noto-sans-jp(SIL OFL のフォントを同梱)
 *   の順に探し、見つからなければ中止する。
 *   例) npm i --no-save @expo-google-fonts/noto-sans-jp playwright
 *       node backtest/scripts/build_og_images.mjs
 *   実行後に build_event_pages.mjs を再実行すると og:image が差し替わる。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const DATA_DIR = path.join(ROOT, "History", "events");
export const OG_DIR = path.join(ROOT, "og", "events");
export const OG_W = 1200, OG_H = 630;
const FONT = "OG Noto Sans JP";            // @font-face で読み込む名前(システムのフォントと混ざらないよう専用名)
const WEIGHTS = [400, 500, 700, 800];       // 画像内で使うウェイト

// Noto Sans JP の TTF をウェイトごとに探す → { 400: "/path/NotoSansJP_400Regular.ttf", ... }
function findFonts(require) {
  const dirs = [];
  if (process.env.OG_FONT_DIR) dirs.push(process.env.OG_FONT_DIR);
  try { dirs.push(path.dirname(require.resolve("@expo-google-fonts/noto-sans-jp/package.json"))); } catch { /* 未インストール */ }
  for (const dir of dirs) {
    const found = {};
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { const m = /^NotoSansJP[-_](\d00)\w*\.[ot]tf$/i.exec(e.name); if (m) found[m[1]] = p; }
    } };
    if (fs.existsSync(dir)) walk(dir);
    if (WEIGHTS.every((w) => found[w])) return found;
  }
  throw new Error("日本語フォント Noto Sans JP が見つかりません。npm i --no-save @expo-google-fonts/noto-sans-jp するか、OG_FONT_DIR を指定してください");
}
const fontFaceCss = (fonts) => WEIGHTS.map((w) =>
  `@font-face{font-family:"${FONT}";font-weight:${w};font-style:normal;src:url("${pathToFileURL(fonts[w]).href}") format("truetype");}`).join("");

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const jaDate = (d) => { const [y, m, dd] = d.split("-"); return `${y}年${Number(m)}月${Number(dd)}日`; };

// 推移の折れ線(1系列)。下落前の水準(高値)を破線で示し、ラベルは破線の上・左端に置く(線の始点と重ならないよう)
function sparkline(series, W, H) {
  const pts = (series.points || []).map((p) => p.close);
  if (pts.length < 2) return "";
  const c = series.conclusion;
  const lo = Math.min(...pts, c ? c.trough.close : Infinity);
  const hi = Math.max(...pts, c ? c.peak.close : -Infinity);
  const x = (i) => (i / (pts.length - 1)) * W;
  const y = (v) => H - ((v - lo) / (hi - lo)) * H;
  const line = pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const base = c ? `<line x1="0" x2="${W}" y1="${y(c.peak.close).toFixed(1)}" y2="${y(c.peak.close).toFixed(1)}" stroke="#7d8aa3" stroke-dasharray="6 6" stroke-width="2"/>
      <text x="0" y="${(y(c.peak.close) - 12).toFixed(1)}" font-size="20" font-family="${FONT}" fill="#aab3c2">下落前の水準</text>` : "";
  return `<svg width="${W}" height="${H + 60}" viewBox="0 -40 ${W} ${H + 60}" style="flex:none" aria-hidden="true">
      ${base}
      <polyline points="${line}" fill="none" stroke="#ff7a7a" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

export function ogHtml(ev, series, fontCss = "") {
  const t = ev.title;
  const titleSize = t.length <= 6 ? 80 : t.length <= 8 ? 72 : t.length <= 11 ? 56 : 48;
  const gran = series.granularity === "month" ? "月次" : "週次";
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><style>${fontCss}</style><body style="margin:0">
<div style="width:${OG_W}px;height:${OG_H}px;box-sizing:border-box;padding:56px 64px;background:#1b2538;color:#fff;
  font-family:'${FONT}',sans-serif;display:flex;flex-direction:column;justify-content:space-between">
  <div style="font-size:26px;color:#cdd7ea;font-weight:700;letter-spacing:.02em">StockList <span style="color:#7d8aa3;font-weight:500">｜ 日経平均と大きな出来事</span></div>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:40px">
    <div style="min-width:0">
      <div style="font-size:30px;color:#aab3c2;margin-bottom:6px">${esc(jaDate(ev.date))}</div>
      <div style="font-size:${titleSize}px;font-weight:800;line-height:1.15;letter-spacing:-.02em;white-space:nowrap">${esc(t)}</div>
      <div style="display:flex;gap:44px;margin-top:34px;align-items:flex-end">
        <div><div style="font-size:24px;color:#aab3c2">最大下落率</div>
          <div style="font-size:112px;font-weight:800;line-height:1;color:#ff7a7a;letter-spacing:-.02em;white-space:nowrap">${esc(ev.drawdown_label)}</div></div>
        <div><div style="font-size:24px;color:#aab3c2">高値回復まで</div>
          <div style="font-size:64px;font-weight:800;line-height:1.1;white-space:nowrap">${esc(ev.recover_label)}</div></div>
      </div>
    </div>
    ${sparkline(series, 400, 230)}
  </div>
  <div style="font-size:22px;color:#7d8aa3">www.stocklist.jp ・ ${gran}チャートと当時のニュースで振り返る</div>
</div></body></html>`;
}

async function main() {
  const only = process.argv.slice(2);
  const events = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "events.json"), "utf8"));
  const summary = JSON.parse(fs.readFileSync(path.join(ROOT, "events", "summary.json"), "utf8"));
  const require = createRequire(import.meta.url);
  let chromium;
  try { ({ chromium } = require("playwright")); }
  catch { throw new Error("playwright が見つかりません。NODE_PATH=$(npm root -g) を付けるか、npm i -D playwright してください"); }
  const exe = ["/opt/pw-browsers/chromium"].find((p) => fs.existsSync(p));
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const page = await browser.newPage({ viewport: { width: OG_W, height: OG_H } });
  const fontCss = fontFaceCss(findFonts(require));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "og-"));   // file:// のフォントを読めるよう HTML もファイルで開く
  fs.mkdirSync(OG_DIR, { recursive: true });
  for (const cfg of events) {
    if (only.length && !only.includes(cfg.slug)) continue;
    const ev = summary.find((s) => s.slug === cfg.slug);
    const dataPath = path.join(DATA_DIR, `${cfg.id}.json`);
    if (!ev || !fs.existsSync(dataPath)) { console.warn(`[skip] ${cfg.slug}: 結論データなし`); continue; }
    const series = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    const htmlPath = path.join(tmp, `${cfg.slug}.html`);
    fs.writeFileSync(htmlPath, ogHtml({ ...ev, date: cfg.date, title: cfg.title }, series, fontCss));
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    // 使う全ウェイトが実際に読み込まれたことを確認(代替フォントでの描画を防ぐ)
    const loaded = await page.evaluate(async (name) => { await document.fonts.ready;
      return [...document.fonts].filter((f) => f.family.replace(/"/g, "") === name && f.status === "loaded").map((f) => Number(f.weight)); }, FONT);
    const missing = WEIGHTS.filter((w) => !loaded.includes(w));   // 画像内で4ウェイトとも使っている
    if (missing.length) throw new Error(`${cfg.slug}: フォント(${missing.join(",")})が読み込まれていません`);
    const out = path.join(OG_DIR, `${cfg.slug}.png`);
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: OG_W, height: OG_H } });
    console.log(`[out] og/events/${cfg.slug}.png (${Math.round(fs.statSync(out).size / 1024)}KB)`);
  }
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main().catch((e) => { console.error(`\nERROR: ${e.message}`); process.exit(1); });
