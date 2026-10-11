#!/usr/bin/env node
/**
 * 特集「戦争と株価」用データ生成
 *
 * 戦争・軍事衝突の勃発時に、日経平均(日次終値)がどう動いたかを実データから機械算出し、
 * History/events/features/war.json に書き出す。build_event_pages.mjs が特集ページを生成する。
 *
 *  base   : 東京市場が最初に反応した日(react)の前営業日の終値 = 100
 *  d1     : 反応日の騰落率
 *  worst  : base 以降 60営業日(約3ヶ月)以内の最安値と、その base 比
 *  rec    : 最安値の後、終値が base 以上に戻った最初の日(無ければ未回復)
 *  after60: 60営業日後の base 比
 *  series : base の10営業日前〜60営業日後の指数(base=100)
 *
 * 実行: node backtest/scripts/build_feature_data.mjs [--data <csv>]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadData } from "../backtest.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(SCRIPT_DIR, "..", "..", "History", "events", "features");
const BEFORE = 10, AFTER = 60;

// react = 東京市場が最初に反応できた営業日(週末・日本時間の夜間に起きた場合は翌営業日)
export const WARS = [
  { id: "korea-1950", title: "朝鮮戦争", date: "1950-06-25", react: "1950-06-26", where: "朝鮮半島", note: "日曜に勃発" },
  { id: "gulf-1991", title: "湾岸戦争（開戦）", date: "1991-01-17", react: "1991-01-17", where: "中東", note: "多国籍軍の空爆開始は日本時間の朝" },
  { id: "sept11-2001", title: "米同時多発テロ", date: "2001-09-11", react: "2001-09-12", where: "米国", note: "日本時間の夜に発生" },
  { id: "iraq-2003", title: "イラク戦争", date: "2003-03-20", react: "2003-03-20", where: "中東", note: "開戦は日本時間の昼" },
  { id: "ukraine-2022", title: "ロシアのウクライナ侵攻", date: "2022-02-24", react: "2022-02-24", where: "欧州", note: "侵攻開始は日本時間の昼" },
  { id: "iran-2025", title: "イスラエルのイラン攻撃", date: "2025-06-13", react: "2025-06-13", where: "中東", note: "12日間の交戦へ" },
  { id: "iran-2026", title: "米国・イスラエルのイラン攻撃", date: "2026-02-28", react: "2026-03-02", where: "中東", note: "土曜に開始" },
];

const r2 = (x) => Math.round(x * 100) / 100;
const r4 = (x) => Math.round(x * 10000) / 10000;
function monthsBetween(a, b) {
  return Math.max(0, Math.round((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24 * 30.4375)));
}

export function warReaction(rows, w) {
  const idx = rows.findIndex((r) => r.date >= w.react);
  if (idx <= 0) return null;
  const b = idx - 1, base = rows[b];
  const end = Math.min(rows.length - 1, b + AFTER);
  let wi = b + 1;
  for (let i = b + 1; i <= end; i++) if (rows[i].close < rows[wi].close) wi = i;
  let rec = null;
  for (let i = wi + 1; i < rows.length; i++) if (rows[i].close >= base.close) { rec = rows[i]; break; }
  const series = [];
  for (let i = Math.max(0, b - BEFORE); i <= end; i++) series.push({ d: rows[i].date, c: r2(rows[i].close), v: r2(rows[i].close / base.close * 100), t: i - b });
  return {
    ...w,
    base: { date: base.date, close: r2(base.close) },
    d1: { date: rows[idx].date, close: r2(rows[idx].close), ret: r4(rows[idx].close / base.close - 1) },
    worst: { date: rows[wi].date, close: r2(rows[wi].close), ret: r4(rows[wi].close / base.close - 1), tdays: wi - b },
    recovered: !!rec,
    recovery: rec ? { date: rec.date, tdays: rows.indexOf(rec) - b, months: monthsBetween(base.date, rec.date) } : null,
    after60: end - b >= AFTER ? { date: rows[end].date, ret: r4(rows[end].close / base.close - 1) } : null,
    series,
  };
}

async function main() {
  const i = process.argv.indexOf("--data");
  const rows = await loadData({ dataPath: i > 0 ? process.argv[i + 1] : null, startDate: "1949-01-01" });
  const wars = [];
  for (const w of WARS) {
    const r = warReaction(rows, w);
    if (!r) { console.warn(`[skip] ${w.id}: データ不足`); continue; }
    wars.push(r);
    console.log(`[war] ${w.id}: 反応日 ${(r.d1.ret * 100).toFixed(1)}% / 最安 ${(r.worst.ret * 100).toFixed(1)}%(${r.worst.date}) / 回復 ${r.recovered ? r.recovery.date : "未回復"} / 60日後 ${r.after60 ? (r.after60.ret * 100).toFixed(1) + "%" : "-"}`);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "war.json"),
    JSON.stringify({ generated_at: new Date().toISOString(), as_of: rows[rows.length - 1].date, before: BEFORE, after: AFTER, wars }, null, 1) + "\n", "utf8");
  console.log("[out] History/events/features/war.json");
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main().catch((e) => { console.error(`\nERROR: ${e.message}`); process.exit(1); });
