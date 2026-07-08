#!/usr/bin/env node
/**
 * イベント週次データ生成スクリプト
 *
 * History/events/events.json の各イベントの window(約半年)を日次終値データから切り出し、
 * 週次(週足)に集約して History/events/<id>.json に書き出す。
 * EventViewer.html はこの週次データを読んでチャートを描画する。
 *
 * 実行:
 *   node backtest/scripts/build_event_data.mjs                 # 最新データ(Stooq→FRED)を取得して生成
 *   node backtest/scripts/build_event_data.mjs --data <csv>    # 指定CSVで生成(オフライン/デモ用)
 *
 * 週の定義: 月曜起点。各週の open=週初の終値, close=週末の終値, high/low=週内の高安。
 * 出力の source が "real" 以外(demo等)のとき、ページ側に「デモデータ」注記が出る。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadData } from "../backtest.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EVENTS_DIR = path.resolve(SCRIPT_DIR, "..", "..", "History", "events");
const EVENTS_JSON = path.join(EVENTS_DIR, "events.json");

function mondayOf(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // 0=Mon .. 6=Sun
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** 昇順の [{date, close}] を週足に集約 */
function toWeekly(rows) {
  const byWeek = new Map();
  for (const r of rows) {
    const key = mondayOf(r.date);
    if (!byWeek.has(key)) byWeek.set(key, []);
    byWeek.get(key).push(r);
  }
  const out = [];
  for (const key of [...byWeek.keys()].sort()) {
    const arr = byWeek.get(key);
    const closes = arr.map((a) => a.close);
    out.push({
      week: key,
      weekEnd: arr[arr.length - 1].date,
      open: round2(arr[0].close),
      close: round2(arr[arr.length - 1].close),
      high: round2(Math.max(...closes)),
      low: round2(Math.min(...closes)),
      days: arr.length,
    });
  }
  return out;
}

const round2 = (x) => Math.round(x * 100) / 100;

function parseArgs(argv) {
  const a = { dataPath: null };
  for (let i = 0; i < argv.length; i++) if (argv[i] === "--data") a.dataPath = argv[++i];
  return a;
}

async function main() {
  const { dataPath } = parseArgs(process.argv.slice(2));
  const events = JSON.parse(fs.readFileSync(EVENTS_JSON, "utf8"));
  const rows = await loadData({ dataPath });
  const source = dataPath && /demo/i.test(dataPath) ? "demo" : "real";

  for (const ev of events) {
    const [start, end] = ev.window;
    const inWin = rows.filter((r) => r.date >= start && r.date <= end);
    if (inWin.length < 5) {
      console.warn(`[skip] ${ev.id}: window内のデータが不足 (${inWin.length}件, ${start}〜${end})`);
      continue;
    }
    const points = toWeekly(inWin);
    // KPI: window内の高値からの最大ドローダウンと底
    let peak = -Infinity, trough = Infinity, maxDD = 0, peakClose = inWin[0].close;
    for (const r of inWin) {
      if (r.close > peak) peak = r.close;
      const dd = r.close / peak - 1;
      if (dd < maxDD) maxDD = dd;
      if (r.close < trough) trough = r.close;
    }
    const out = {
      id: ev.id,
      title: ev.title,
      source,
      generated_at: new Date().toISOString(),
      window: ev.window,
      data_range: [inWin[0].date, inWin[inWin.length - 1].date],
      kpi: {
        max_drawdown: round4(maxDD),
        trough_close: round2(trough),
        weeks: points.length,
      },
      points,
    };
    const outPath = path.join(EVENTS_DIR, `${ev.id}.json`);
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
    console.log(`[out] ${ev.id}: ${points.length}週 (${out.data_range[0]}〜${out.data_range[1]}, maxDD=${(maxDD * 100).toFixed(1)}%, source=${source})`);
  }
}

const round4 = (x) => Math.round(x * 10000) / 10000;

main().catch((e) => { console.error(`\nERROR: ${e.message}`); process.exit(1); });
