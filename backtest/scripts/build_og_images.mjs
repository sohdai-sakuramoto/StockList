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
 *   要 Playwright(Chromium)と日本語フォント(Noto Sans CJK JP 等)。
 *   例) NODE_PATH=$(npm root -g) node backtest/scripts/build_og_images.mjs
 *   実行後に build_event_pages.mjs を再実行すると og:image が差し替わる。
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const DATA_DIR = path.join(ROOT, "History", "events");
export const OG_DIR = path.join(ROOT, "og", "events");
export const OG_W = 1200, OG_H = 630;

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
      <text x="0" y="${(y(c.peak.close) - 12).toFixed(1)}" font-size="20" fill="#aab3c2">下落前の水準</text>` : "";
  return `<svg width="${W}" height="${H + 60}" viewBox="0 -40 ${W} ${H + 60}" style="flex:none" aria-hidden="true">
      ${base}
      <polyline points="${line}" fill="none" stroke="#ff7a7a" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

export function ogHtml(ev, series) {
  const t = ev.title;
  const titleSize = t.length <= 6 ? 80 : t.length <= 8 ? 72 : t.length <= 11 ? 56 : 48;
  const gran = series.granularity === "month" ? "月次" : "週次";
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><body style="margin:0">
<div style="width:${OG_W}px;height:${OG_H}px;box-sizing:border-box;padding:56px 64px;background:#1b2538;color:#fff;
  font-family:'Noto Sans CJK JP','Noto Sans JP','Hiragino Sans',sans-serif;display:flex;flex-direction:column;justify-content:space-between">
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
  fs.mkdirSync(OG_DIR, { recursive: true });
  for (const cfg of events) {
    if (only.length && !only.includes(cfg.slug)) continue;
    const ev = summary.find((s) => s.slug === cfg.slug);
    const dataPath = path.join(DATA_DIR, `${cfg.id}.json`);
    if (!ev || !fs.existsSync(dataPath)) { console.warn(`[skip] ${cfg.slug}: 結論データなし`); continue; }
    const series = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    await page.setContent(ogHtml({ ...ev, date: cfg.date, title: cfg.title }, series), { waitUntil: "load" });
    const out = path.join(OG_DIR, `${cfg.slug}.png`);
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: OG_W, height: OG_H } });
    console.log(`[out] og/events/${cfg.slug}.png (${Math.round(fs.statSync(out).size / 1024)}KB)`);
  }
  await browser.close();
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main().catch((e) => { console.error(`\nERROR: ${e.message}`); process.exit(1); });
