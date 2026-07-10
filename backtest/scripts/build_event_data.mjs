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
const round4 = (x) => Math.round(x * 10000) / 10000;

function shiftMonths(dateStr, m) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + m);
  return d.toISOString().slice(0, 10);
}
function monthsBetween(a, b) {
  const da = new Date(a + "T00:00:00Z"), db = new Date(b + "T00:00:00Z");
  return Math.max(0, Math.round((db - da) / (1000 * 60 * 60 * 24 * 30.4375)));
}

// 高値の探索は「イベント期間開始前の直近◯ヶ月」に限定(遠い別局面の高値を拾わないため)
export const PEAK_LOOKBACK_MONTHS = 15;

/**
 * 「30秒でわかる結論」の数値を実データから機械算出する(指示書の定義に準拠)。
 *  rows: 昇順の [{date, close}](全期間の日次)
 *  ev:   { window:[start,end], date }
 *
 *  高値 peak    = イベント期間開始前(直近 PEAK_LOOKBACK_MONTHS ヶ月)の終値最高値
 *  底  trough   = 高値の日以降・イベント期間終了までの終値最安値
 *  最大下落率    = trough/peak - 1(終値ベース)
 *  底までの期間  = 高値日→底日(営業日数 と 月数)
 *  高値回復まで  = 高値日→ 終値が高値を初めて上回った日(全期間を前方探索)。無ければ未回復
 */
export function computeConclusion(rows, ev) {
  const [wStart, wEnd] = ev.window;
  const peakStart = shiftMonths(wStart, -PEAK_LOOKBACK_MONTHS);
  const pre = rows.filter((r) => r.date >= peakStart && r.date <= wStart);
  if (pre.length < 2) return null;
  let peak = pre[0];
  for (const r of pre) if (r.close > peak.close) peak = r;

  // 底はイベント期間内(window)に限定。高値日〜期間開始の間に別局面の安値があっても拾わない。
  const seg = rows.filter((r) => r.date >= wStart && r.date <= wEnd);
  let trough = seg[0];
  for (const r of seg) if (r.close < trough.close) trough = r;

  const drawdown = trough.close / peak.close - 1;
  const bdaysToBottom = rows.filter((r) => r.date > peak.date && r.date <= trough.date).length;
  const monthsToBottom = monthsBetween(peak.date, trough.date);

  let recovery = null;
  for (const r of rows) { if (r.date <= trough.date) continue; if (r.close >= peak.close) { recovery = r; break; } }

  return {
    peak: { date: peak.date, close: round2(peak.close) },
    trough: { date: trough.date, close: round2(trough.close) },
    drawdown: round4(drawdown),
    bdays_to_bottom: bdaysToBottom,
    months_to_bottom: monthsToBottom,
    recovered: !!recovery,
    recovery_date: recovery ? recovery.date : null,
    months_to_recover: recovery ? monthsBetween(peak.date, recovery.date) : null,
    as_of: rows[rows.length - 1].date,
  };
}

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
    // KPI(最大下落率・底値)はイベント期間(window)基準を維持する。
    // チャートは「下落前の水準に戻るまで」を見せたいので、回復日まで右側に延長する
    // （回復途中に別の暴落を挟んでも、KPIと底マーカーはイベント本体のまま）。
    let peak = -Infinity, trough = Infinity, maxDD = 0;
    for (const r of inWin) {
      if (r.close > peak) peak = r.close;
      const dd = r.close / peak - 1;
      if (dd < maxDD) maxDD = dd;
      if (r.close < trough) trough = r.close;
    }
    const conclusion = computeConclusion(rows, ev);

    // チャート表示範囲: window開始 〜 下落前の水準を回復した日(未回復なら window終了)
    let chartEnd = end;
    if (conclusion && conclusion.recovered && conclusion.recovery_date > end) chartEnd = conclusion.recovery_date;
    const chartRows = rows.filter((r) => r.date >= start && r.date <= chartEnd);
    const points = toWeekly(chartRows);

    const out = {
      id: ev.id,
      title: ev.title,
      source,
      generated_at: new Date().toISOString(),
      window: ev.window,
      chart_range: [start, chartEnd],
      data_range: [chartRows[0].date, chartRows[chartRows.length - 1].date],
      kpi: {
        max_drawdown: round4(maxDD),
        trough_close: round2(trough),
        weeks: points.length,
      },
      conclusion,
      points,
    };
    const outPath = path.join(EVENTS_DIR, `${ev.id}.json`);
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
    const c = conclusion;
    console.log(`[out] ${ev.id}: ${points.length}週(〜${chartEnd}), 結論 DD=${c ? (c.drawdown * 100).toFixed(0) + "%" : "-"} 底=${c ? c.trough.date : "-"} 回復=${c && c.recovered ? c.months_to_recover + "ヶ月" : "未回復"} (source=${source})`);
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main().catch((e) => { console.error(`\nERROR: ${e.message}`); process.exit(1); });
