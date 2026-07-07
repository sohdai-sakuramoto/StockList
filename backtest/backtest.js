#!/usr/bin/env node
/**
 * 急落モード発動ルールのバックテスト
 *
 * 日経平均(^NKX, Stooq)の 2000-01-01〜実行日 の日次終値を使い、
 * 状態機械 (normal / caution / crash / recovery) の発動ルール候補 108 通りを
 * 総当たりで評価して最良設定を選定する。
 *
 * 実行:  node backtest.js
 * option: --data <csvパス>  データファイルを明示指定(キャッシュ/取得をスキップ)
 *         --out  <dir>      出力先ディレクトリ(既定: このスクリプトのあるディレクトリ)
 *
 * 出力:  results.csv / best_config.json / report.md / fires_for_trends.csv
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

export const EPS = 1e-9; // 浮動小数点比較の許容

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
// 日経225 日次終値のデータソース候補。上から順に試し、正規のCSVを返した最初のものを採用する。
// Stooq は近年 bot 対策(JavaScript認証)で自動取得が弾かれることがあるため、
// 認証不要でCSVを配布している FRED (米セントルイス連銀) をフォールバックに置く。
const DATA_SOURCES = [
  { name: "Stooq ^NKX", url: "https://stooq.com/q/d/l/?s=^nkx&i=d" },
  { name: "FRED NIKKEI225", url: "https://fred.stlouisfed.org/graph/fredgraph.csv?id=NIKKEI225" },
];
const CACHE_PATH = path.join(SCRIPT_DIR, "data", "nkx_daily.csv");
const START_DATE = "2000-01-01";

const CAUTION_DD = -0.05;        // normal <-> caution の閾値
const RELEASE_DD = -0.05;        // crash -> recovery: 急落前高値比でここまで回復
const REBOUND_PCT = 0.15;        // crash -> recovery: 最安値から +15% 反発
const REBOUND_HOLD_DAYS = 10;    // 反発状態の継続日数
const MIN_CRASH_DAYS = 10;       // crash の最低継続営業日数
const BUFFER_BDAYS = 10;         // 正解イベント判定の前後バッファ(営業日)

// ---------------------------------------------------------------------------
// 正解データ (ground truth)
// ---------------------------------------------------------------------------

export const MUST_EVENTS = [
  { id: "E01", name: "ITバブル崩壊(初動)",     start: "2000-04-01", end: "2000-04-30" },
  { id: "E02", name: "米同時多発テロ",           start: "2001-09-01", end: "2001-09-30" },
  { id: "E03", name: "パリバショック",           start: "2007-08-01", end: "2007-08-31" },
  { id: "E04", name: "リーマンショック",         start: "2008-09-01", end: "2008-10-31" },
  { id: "E05", name: "東日本大震災",             start: "2011-03-14", end: "2011-03-15" },
  { id: "E06", name: "バーナンキショック",       start: "2013-05-01", end: "2013-06-30" },
  { id: "E07", name: "チャイナショック第1波",    start: "2015-08-01", end: "2015-08-31" },
  { id: "E08", name: "2016年年初暴落",           start: "2016-01-01", end: "2016-02-29" },
  { id: "E09", name: "Brexitショック",           start: "2016-06-24", end: "2016-06-24" },
  { id: "E10", name: "VIXショック",              start: "2018-02-01", end: "2018-02-28" },
  { id: "E11", name: "クリスマスショック",       start: "2018-10-01", end: "2018-12-31" },
  { id: "E12", name: "コロナショック",           start: "2020-02-01", end: "2020-03-31" },
  { id: "E13", name: "令和のブラックマンデー",   start: "2024-07-24", end: "2024-08-05" },
  { id: "E14", name: "トランプ関税ショック",     start: "2025-04-01", end: "2025-04-30" },
];

export const BOUNDARY_EVENTS = [
  { id: "B01", name: "ライブドアショック", start: "2006-01-01", end: "2006-01-31" },
  { id: "B02", name: "岸田ショック",       start: "2021-09-01", end: "2021-10-31" },
];

export const FALSE_FIRE_PERIODS = [
  { id: "F01", name: "2012年通年",   start: "2012-01-01", end: "2012-12-31", weight: 1.0 },
  { id: "F02", name: "2014年10月",   start: "2014-10-01", end: "2014-10-31", weight: 0.5 },
  { id: "F03", name: "2017年通年",   start: "2017-01-01", end: "2017-12-31", weight: 1.0 },
  { id: "F04", name: "2019年通年",   start: "2019-01-01", end: "2019-12-31", weight: 1.0 },
  { id: "F05", name: "2023年通年",   start: "2023-01-01", end: "2023-12-31", weight: 1.0 },
];

// ---------------------------------------------------------------------------
// 探索グリッド (4 × 3 × 3 × 3 = 108)
// ---------------------------------------------------------------------------

export function buildGrid() {
  const depthThs = [-0.06, -0.08, -0.10, -0.12];
  const lookbacks = [60, 120, 250];
  const speeds = [null, { th: -0.08, window: 10 }, { th: -0.08, window: 20 }];
  const singleDayThs = [-0.04, -0.05, -0.06];
  const grid = [];
  for (const depthTh of depthThs)
    for (const lookback of lookbacks)
      for (const speed of speeds)
        for (const singleDayTh of singleDayThs)
          grid.push({ depthTh, lookback, speed, singleDayTh, id: configId({ depthTh, lookback, speed, singleDayTh }) });
  return grid;
}

export function configId(c) {
  const spd = c.speed ? `spd${Math.round(c.speed.th * 100)}w${c.speed.window}` : "spdoff";
  return `lb${c.lookback}_d${Math.round(c.depthTh * 100)}_s1d${Math.round(c.singleDayTh * 100)}_${spd}`;
}

// ---------------------------------------------------------------------------
// データ取得・パース
// ---------------------------------------------------------------------------

export function parseStooqCsv(text, { startDate = START_DATE } = {}) {
  if (/<!doctype html|<html|requires javascript/i.test(text.slice(0, 500))) {
    throw new Error("CSVではなくHTML(bot認証ページ等)が返されました");
  }
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new Error("CSVが空です");
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  // 日付列: "date" を含む最初の列 (Stooq:Date / FRED:observation_date,DATE / Yahoo:Date)
  let iDate = header.findIndex((h) => h.includes("date"));
  if (iDate < 0) iDate = 0;
  // 終値列: close → adj close → (2列だけなら日付以外の列) の優先で決定
  //   Stooq/Yahoo は "Close" 列を持つ。FRED は "DATE,NIKKEI225" の2列形式。
  let iClose = header.indexOf("close");
  if (iClose < 0) iClose = header.findIndex((h) => h.replace(/[ _]/g, "") === "adjclose");
  if (iClose < 0 && header.length === 2) iClose = 1 - iDate;
  if (iClose < 0) throw new Error(`CSVヘッダに終値の列 (Close 等) が見つかりません: ${lines[0]}`);
  const rows = [];
  for (let k = 1; k < lines.length; k++) {
    const cols = lines[k].split(",");
    const date = (cols[iDate] || "").trim();
    const close = Number(cols[iClose]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!Number.isFinite(close) || close <= 0) continue;
    if (date < startDate) continue;
    rows.push({ date, close });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  // 同一日付の重複は最後の行を採用
  const dedup = [];
  for (const r of rows) {
    if (dedup.length && dedup[dedup.length - 1].date === r.date) dedup[dedup.length - 1] = r;
    else dedup.push(r);
  }
  return dedup;
}

async function loadData({ dataPath = null } = {}) {
  if (dataPath) {
    const p = path.resolve(dataPath);
    if (!fs.existsSync(p)) throw new Error(`--data で指定されたファイルがありません: ${p}`);
    console.log(`[data] 指定ファイルを使用: ${p}`);
    return parseStooqCsv(fs.readFileSync(p, "utf8"));
  }
  if (fs.existsSync(CACHE_PATH)) {
    console.log(`[data] キャッシュを使用: ${CACHE_PATH}`);
    return parseStooqCsv(fs.readFileSync(CACHE_PATH, "utf8"));
  }
  const failures = [];
  for (const src of DATA_SOURCES) {
    console.log(`[data] 取得中: ${src.name} (${src.url})`);
    try {
      const res = await fetch(src.url, {
        headers: { "User-Agent": "Mozilla/5.0 (crash-mode-backtest; research use)" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const rows = parseStooqCsv(text);
      if (rows.length < 100) throw new Error(`行数が異常 (${rows.length}行)`);
      fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
      fs.writeFileSync(CACHE_PATH, text, "utf8");
      console.log(`[data] ${src.name} を採用・キャッシュ保存: ${CACHE_PATH} (${rows.length}営業日)`);
      return rows;
    } catch (e) {
      console.warn(`[data] ${src.name} 失敗: ${e.message} → 次のソースを試行`);
      failures.push(`${src.name}: ${e.message}`);
    }
  }
  throw new Error(
    `すべてのデータソースから取得できませんでした。キャッシュ ${CACHE_PATH} も存在しないため停止します。\n` +
    failures.map((f) => `  - ${f}`).join("\n") + "\n" +
    `対処: 到達可能な環境で再実行するか、日経225の日次終値CSVを手動で ${CACHE_PATH} に配置してください。\n` +
    `  例) FRED: https://fred.stlouisfed.org/graph/fredgraph.csv?id=NIKKEI225 をダウンロードして上記パスに保存`
  );
}

// ---------------------------------------------------------------------------
// 状態機械
// ---------------------------------------------------------------------------

/**
 * 1設定分の状態機械を全期間に対して回す。
 *
 * rows: [{date, close}] 昇順
 * cfg:  {lookback, depthTh, singleDayTh, speed: null|{th, window}}
 *
 * 実装メモ:
 *  - peak(rolling): 直近 lookback 営業日(当日含む)の終値最高値。crash 中も更新し続ける。
 *  - preCrashPeak(fixed): crash 発動時点の rolling peak を固定保持し、解除判定に使う。
 *  - 冒頭 lookback 営業日はウォームアップとして判定対象外。
 *  - notify: 同一ドローダウン局面(初回発動時の高値 episodePeak を終値が上回るまで)で初回のみ true。
 */
export function runStateMachine(rows, cfg) {
  const { lookback, depthTh, singleDayTh, speed } = cfg;
  const n = rows.length;
  const states = new Array(n).fill(null); // 判定対象外は null
  const fires = [];        // crash への遷移イベント
  const transitions = [];  // 全状態遷移

  let state = "normal";
  let preCrashPeak = null;      // 発動時点の rolling peak (固定・解除判定用)
  let preCrashPeakIdx = -1;
  let crashStartIdx = -1;
  let crashMin = Infinity;      // 急落期間中の最安値
  let reboundStreak = 0;        // 最安値から +15% を維持した連続営業日数
  let episodeActive = false;    // 同一ドローダウン局面フラグ
  let episodePeak = -Infinity;  // 局面の基準高値 (初回発動時の rolling peak)

  // rolling max 用 monotonic deque (値が厳密に大きい時のみ既存を破棄 → peakIdx は「更新日」)
  const deque = []; // インデックスを保持。closes[deque[0]] が窓内最大
  const push = (i) => {
    while (deque.length && rows[deque[deque.length - 1]].close < rows[i].close - EPS) deque.pop();
    deque.push(i);
  };

  for (let i = 0; i < n; i++) {
    push(i);
    while (deque[0] <= i - lookback) deque.shift(); // 窓は [i-lookback+1, i]
    if (i < lookback) continue; // ウォームアップ (daily_ret 用に i>=1 も同時に満たす)

    const close = rows[i].close;
    const peakIdx = deque[0];
    const peakVal = rows[peakIdx].close;
    const dd = close / peakVal - 1;
    const dailyRet = close / rows[i - 1].close - 1;

    // ドローダウン局面の終了判定 (状態に依らず毎日評価)
    if (episodeActive && close > episodePeak * (1 + EPS)) episodeActive = false;

    if (state === "normal" || state === "caution" || state === "recovery") {
      // 発動条件 (A: 単日 / B: 深さ / C: 速度)
      const conds = [];
      if (dailyRet <= singleDayTh + EPS) conds.push("A");
      if (dd <= depthTh + EPS) conds.push("B");
      if (speed && i - peakIdx <= speed.window && dd <= speed.th + EPS) conds.push("C");

      if (conds.length > 0) {
        const notify = !episodeActive;
        if (!episodeActive) { episodeActive = true; episodePeak = peakVal; }
        transitions.push({ i, date: rows[i].date, from: state, to: "crash", notify });
        state = "crash";
        preCrashPeak = peakVal;
        preCrashPeakIdx = peakIdx;
        crashStartIdx = i;
        crashMin = close;
        reboundStreak = 0;
        fires.push({
          i, date: rows[i].date, dd, dailyRet, close,
          conditions: conds.join("+"), notify,
          peakIdx, peakDate: rows[peakIdx].date, peakClose: peakVal,
          leadDays: i - peakIdx, // peak更新日 → 発動日の営業日数
        });
      } else if (state === "normal") {
        if (dd <= CAUTION_DD + EPS) {
          transitions.push({ i, date: rows[i].date, from: state, to: "caution" });
          state = "caution";
        }
      } else if (state === "caution") {
        if (dd > CAUTION_DD + EPS) {
          transitions.push({ i, date: rows[i].date, from: state, to: "normal" });
          state = "normal";
        }
      } else { // recovery
        if (close > preCrashPeak * (1 + EPS)) {
          transitions.push({ i, date: rows[i].date, from: state, to: "normal" });
          state = "normal";
        }
      }
    } else { // crash
      if (close < crashMin) crashMin = close;
      if (close >= crashMin * (1 + REBOUND_PCT) - EPS) reboundStreak += 1;
      else reboundStreak = 0;

      const daysInCrash = i - crashStartIdx;
      const ddFixed = close / preCrashPeak - 1; // 急落前高値(固定)比のドローダウン
      if (daysInCrash >= MIN_CRASH_DAYS &&
          (ddFixed > RELEASE_DD + EPS || reboundStreak >= REBOUND_HOLD_DAYS)) {
        transitions.push({ i, date: rows[i].date, from: state, to: "recovery" });
        state = "recovery";
      }
    }

    states[i] = state;
  }

  return { states, fires, transitions, startIdx: cfg.lookback };
}

// ---------------------------------------------------------------------------
// 評価
// ---------------------------------------------------------------------------

function lowerBound(rows, date) { // 最初の rows[i].date >= date
  let lo = 0, hi = rows.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (rows[m].date < date) lo = m + 1; else hi = m; }
  return lo;
}
function upperBound(rows, date) { // 最後の rows[i].date <= date (該当なしは -1)
  let lo = 0, hi = rows.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (rows[m].date <= date) lo = m + 1; else hi = m; }
  return lo - 1;
}

/** カレンダー期間 [start, end] を行インデックス範囲に変換し、前後 buffer 営業日拡張する */
export function windowToIdx(rows, start, end, buffer = 0) {
  let lo = lowerBound(rows, start);
  let hi = upperBound(rows, end);
  if (hi < lo) return null; // データ範囲外
  lo = Math.max(0, lo - buffer);
  hi = Math.min(rows.length - 1, hi + buffer);
  return { lo, hi };
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 1設定の全指標を算出する */
export function evaluateConfig(rows, cfg) {
  const run = runStateMachine(rows, cfg);
  const { states, fires } = run;

  // --- 必須イベント ---
  const eventResults = MUST_EVENTS.map((ev) => {
    const w = windowToIdx(rows, ev.start, ev.end, BUFFER_BDAYS);
    if (!w) return { ...ev, detected: false, note: "データ範囲外" };
    const inWin = fires.filter((f) => f.i >= w.lo && f.i <= w.hi);
    const detected = inWin.length > 0;
    // 診断: ウィンドウ中に crash 状態だった日があるか(遷移が無くても)
    let crashStateInWindow = false;
    for (let i = w.lo; i <= w.hi; i++) if (states[i] === "crash") { crashStateInWindow = true; break; }
    const warmupOverlap = w.hi < cfg.lookback;
    const first = inWin[0] || null;
    return {
      ...ev, detected, crashStateInWindow, warmupOverlap,
      fireDate: first ? first.date : null,
      leadDays: first ? first.leadDays : null,
      ddAtFire: first ? first.dd : null,
      conditions: first ? first.conditions : null,
      notify: first ? first.notify : null,
    };
  });
  const detectedCount = eventResults.filter((e) => e.detected).length;
  const recall = detectedCount / MUST_EVENTS.length;
  // 参考指標: 遷移が無くても crash 状態がウィンドウ内にあれば「捕捉」とみなす緩和版
  const recallRelaxed =
    eventResults.filter((e) => e.detected || e.crashStateInWindow).length / MUST_EVENTS.length;

  // --- precision ---
  const mustWindows = MUST_EVENTS
    .map((ev) => windowToIdx(rows, ev.start, ev.end, BUFFER_BDAYS))
    .filter(Boolean);
  const inAnyMust = (i) => mustWindows.some((w) => i >= w.lo && i <= w.hi);
  const precision = fires.length ? fires.filter((f) => inAnyMust(f.i)).length / fires.length : 0;

  // --- 境界イベント ---
  const boundaryResults = BOUNDARY_EVENTS.map((ev) => {
    const w = windowToIdx(rows, ev.start, ev.end, 0);
    if (!w) return { ...ev, violated: false, statesSeen: [], note: "データ範囲外" };
    const fired = fires.some((f) => f.i >= w.lo && f.i <= w.hi);
    const seen = new Set();
    for (let i = w.lo; i <= w.hi; i++) if (states[i]) seen.add(states[i]);
    return { ...ev, violated: fired, statesSeen: [...seen] };
  });
  const boundaryViolations = boundaryResults.filter((b) => b.violated).length;

  // --- 誤発動チェック ---
  const falseFireDetails = FALSE_FIRE_PERIODS.map((p) => {
    const w = windowToIdx(rows, p.start, p.end, 0);
    const list = w ? fires.filter((f) => f.i >= w.lo && f.i <= w.hi) : [];
    return { ...p, count: list.length, weighted: list.length * p.weight, fires: list };
  });
  const falseFires = falseFireDetails.reduce((s, p) => s + p.weighted, 0);

  // --- リードタイム ---
  const leads = eventResults.filter((e) => e.detected).map((e) => e.leadDays);
  const medianLeadTime = median(leads);

  // --- 発動頻度 (notify=true のみ) ---
  const evalStart = rows[Math.min(cfg.lookback, rows.length - 1)].date;
  const evalEnd = rows[rows.length - 1].date;
  const years = Math.max(
    (new Date(evalEnd) - new Date(evalStart)) / (365.25 * 24 * 3600 * 1000), 1e-9);
  const notifyFires = fires.filter((f) => f.notify).length;
  const firesPerYear = notifyFires / years;

  const score = precision - 0.1 * boundaryViolations - 0.05 * falseFires;

  return {
    cfg, run,
    metrics: {
      recall, recallRelaxed, detectedCount, precision,
      boundaryViolations, falseFires, medianLeadTime,
      firesTotal: fires.length, firesNotify: notifyFires, firesPerYear, score,
      years,
    },
    eventResults, boundaryResults, falseFireDetails,
  };
}

// ---------------------------------------------------------------------------
// 選定 (合格基準 → スコア → タイブレーク)
// ---------------------------------------------------------------------------

export function selectBest(results) {
  const byScore = (a, b) =>
    b.metrics.score - a.metrics.score ||
    a.metrics.firesPerYear - b.metrics.firesPerYear ||
    (a.metrics.medianLeadTime ?? Infinity) - (b.metrics.medianLeadTime ?? Infinity);

  let pool = results.filter(
    (r) => r.metrics.recall >= 1 - EPS && r.metrics.firesPerYear <= 2 + EPS);
  let passedSpec = pool.length > 0;
  let note = "合格基準 (recall=1.0 かつ fires_per_year<=2.0) を満たす設定から選定";

  if (!passedSpec) {
    const maxRecall = Math.max(...results.map((r) => r.metrics.recall));
    pool = results.filter(
      (r) => r.metrics.recall >= maxRecall - EPS && r.metrics.firesPerYear <= 2 + EPS);
    note = `【暫定】recall=1.0 を満たす設定が存在しないため、最大 recall=${maxRecall.toFixed(3)} ` +
      `(${Math.round(maxRecall * MUST_EVENTS.length)}/${MUST_EVENTS.length}件) の設定から選定`;
    if (pool.length === 0) {
      pool = results.filter((r) => r.metrics.recall >= maxRecall - EPS);
      note += "(fires_per_year<=2.0 も満たせないため頻度条件も緩和)";
    }
  }
  pool.sort(byScore);
  return { best: pool[0], passedSpec, note };
}

// ---------------------------------------------------------------------------
// 出力
// ---------------------------------------------------------------------------

const pct = (x, digits = 2) => (x == null ? "" : (x * 100).toFixed(digits) + "%");
const num = (x, digits = 4) => (x == null ? "" : Number(x).toFixed(digits));

function writeResultsCsv(outPath, results) {
  const header = [
    "config_id", "lookback", "depth_th", "single_day_th", "speed_th", "speed_window",
    "recall", "recall_relaxed", "detected_events", "precision",
    "boundary_violations", "false_fires", "median_lead_time_bd",
    "fires_total", "fires_notify", "fires_per_year", "score", "passed_criteria",
  ].join(",");
  const lines = results.map((r) => {
    const c = r.cfg, m = r.metrics;
    const passed = m.recall >= 1 - EPS && m.firesPerYear <= 2 + EPS;
    return [
      r.cfg.id, c.lookback, c.depthTh, c.singleDayTh,
      c.speed ? c.speed.th : "", c.speed ? c.speed.window : "",
      num(m.recall), num(m.recallRelaxed), m.detectedCount, num(m.precision),
      m.boundaryViolations, num(m.falseFires, 1),
      m.medianLeadTime == null ? "" : m.medianLeadTime,
      m.firesTotal, m.firesNotify, num(m.firesPerYear, 3), num(m.score), passed,
    ].join(",");
  });
  fs.writeFileSync(outPath, header + "\n" + lines.join("\n") + "\n", "utf8");
}

function bestConfigJson(best, passedSpec, note, dataInfo) {
  const c = best.cfg, m = best.metrics;
  return {
    generated_at: new Date().toISOString(),
    data: dataInfo,
    passed_spec_criteria: passedSpec,
    selection_note: note,
    config: {
      lookback_days: c.lookback,
      caution: { dd_enter: CAUTION_DD, dd_exit: CAUTION_DD },
      crash_triggers: {
        single_day_return_th: c.singleDayTh,
        drawdown_depth_th: c.depthTh,
        speed: c.speed
          ? { enabled: true, dd_th: c.speed.th, window_days: c.speed.window }
          : { enabled: false },
      },
      crash_release: {
        min_days_in_crash: MIN_CRASH_DAYS,
        dd_recover_above: RELEASE_DD,
        dd_reference: "発動時点の rolling peak を固定した急落前高値",
        rebound_from_low: REBOUND_PCT,
        rebound_hold_days: REBOUND_HOLD_DAYS,
        recovery_to_normal: "終値が急落前高値(固定)を上回った日",
      },
      renotify_policy:
        "再発動時も状態は crash に戻すが、notify は同一ドローダウン局面(局面開始時の高値を終値が上回るまで)につき初回のみ true",
    },
    metrics: {
      recall: m.recall,
      recall_relaxed: m.recallRelaxed,
      precision: m.precision,
      boundary_violations: m.boundaryViolations,
      false_fires: m.falseFires,
      median_lead_time_bd: m.medianLeadTime,
      fires_total: m.firesTotal,
      fires_notify: m.firesNotify,
      fires_per_year: m.firesPerYear,
      score: m.score,
    },
  };
}

function describeCfg(c) {
  const spd = c.speed ? `あり (dd<=${pct(c.speed.th, 0)} を peak更新から${c.speed.window}営業日以内)` : "なし";
  return `lookback=${c.lookback}営業日, 深さ(B)=${pct(c.depthTh, 0)}, 単日(A)=${pct(c.singleDayTh, 0)}, 速度(C)=${spd}`;
}

function buildReport(best, passedSpec, note, results, dataInfo) {
  const { cfg, metrics: m, eventResults, boundaryResults, falseFireDetails, run } = best;
  const L = [];
  L.push(`# 急落モード発動ルール バックテスト検証レポート`);
  L.push("");
  L.push(`- 生成日時: ${new Date().toISOString()}`);
  L.push(`- データ: ${dataInfo.source} (${dataInfo.firstDate} 〜 ${dataInfo.lastDate}, ${dataInfo.rows}営業日)`);
  L.push(`- 探索設定数: ${results.length}`);
  L.push("");

  L.push(`## 1. 採用設定`);
  L.push("");
  if (!passedSpec) {
    L.push(`> **⚠ 注意: 合格基準 (recall=1.0) を満たす設定は存在しませんでした。** 下記は ${note} した暫定採用です。`);
    L.push(`> 未検出イベントの多くは「イベント発生前から既に crash 状態が継続しており、ウィンドウ内に *新規遷移* が発生しない」構造的な取りこぼしです(§3の診断列を参照)。`);
    L.push(`> 発動ルールではなくイベント判定方法(遷移ベース→状態ベース)や再発動条件の見直しが有効と考えられます。`);
    L.push("");
  } else {
    L.push(`> ${note}`);
    L.push("");
  }
  L.push(`- **設定ID**: \`${cfg.id}\``);
  L.push(`- **内容**: ${describeCfg(cfg)}`);
  L.push("");
  L.push(`| 指標 | 値 |`);
  L.push(`|---|---|`);
  L.push(`| recall | ${num(m.recall, 3)} (${m.detectedCount}/${MUST_EVENTS.length}) |`);
  L.push(`| recall (状態ベース緩和・参考) | ${num(m.recallRelaxed, 3)} |`);
  L.push(`| precision | ${num(m.precision, 3)} |`);
  L.push(`| boundary_violations | ${m.boundaryViolations} |`);
  L.push(`| false_fires | ${num(m.falseFires, 1)} |`);
  L.push(`| median_lead_time | ${m.medianLeadTime == null ? "-" : m.medianLeadTime + " 営業日"} |`);
  L.push(`| fires_per_year (notify=true) | ${num(m.firesPerYear, 3)} |`);
  L.push(`| crash発動 総数 / notify数 | ${m.firesTotal} / ${m.firesNotify} |`);
  L.push(`| score | ${num(m.score, 4)} |`);
  L.push("");

  L.push(`## 2. 必須イベント14件の検出状況`);
  L.push("");
  L.push(`| ID | イベント | 検出 | 発動日 | リードタイム(営業日) | 発動時DD | 条件 | notify | 診断 |`);
  L.push(`|---|---|---|---|---|---|---|---|---|`);
  for (const e of eventResults) {
    const diag = e.detected ? ""
      : e.warmupOverlap ? "ウォームアップ期間と重複"
      : e.crashStateInWindow ? "既に crash 状態が継続中(新規遷移なし)"
      : "未発動";
    L.push(`| ${e.id} | ${e.name} | ${e.detected ? "✅" : "❌"} | ${e.fireDate ?? "-"} | ${e.leadDays ?? "-"} | ${e.ddAtFire == null ? "-" : pct(e.ddAtFire)} | ${e.conditions ?? "-"} | ${e.notify == null ? "-" : e.notify} | ${diag} |`);
  }
  L.push("");

  L.push(`## 3. 境界イベント(警戒止まりが正解)`);
  L.push("");
  L.push(`| ID | イベント | 期間内に到達した状態 | crash発動 | 判定 |`);
  L.push(`|---|---|---|---|---|`);
  for (const b of boundaryResults) {
    L.push(`| ${b.id} | ${b.name} | ${b.statesSeen.join(", ") || "-"} | ${b.violated ? "あり" : "なし"} | ${b.violated ? "❌ 境界違反 (減点)" : "✅"} |`);
  }
  L.push("");

  L.push(`## 4. 誤発動チェック期間`);
  L.push("");
  L.push(`| ID | 期間 | 発動数 | 加重カウント | 発動日 |`);
  L.push(`|---|---|---|---|---|`);
  for (const p of falseFireDetails) {
    const dates = p.fires.map((f) => `${f.date}(${f.conditions})`).join(", ") || "-";
    L.push(`| ${p.id} | ${p.name} | ${p.count} | ${num(p.weighted, 1)} | ${dates} |`);
  }
  L.push("");

  L.push(`## 5. 全期間の状態遷移履歴(採用設定)`);
  L.push("");
  L.push(`| 日付 | 遷移 | notify |`);
  L.push(`|---|---|---|`);
  for (const t of run.transitions) {
    L.push(`| ${t.date} | ${t.from} → ${t.to} | ${t.to === "crash" ? t.notify : ""} |`);
  }
  L.push("");

  L.push(`## 6. 上位設定の比較(スコア順・上位10件)`);
  L.push("");
  const top = [...results].sort((a, b) =>
    b.metrics.score - a.metrics.score ||
    a.metrics.firesPerYear - b.metrics.firesPerYear)
    .slice(0, 10);
  L.push(`| config_id | recall | precision | 境界違反 | 誤発動 | lead中央値 | 発動/年 | score |`);
  L.push(`|---|---|---|---|---|---|---|---|`);
  for (const r of top) {
    const mm = r.metrics;
    L.push(`| \`${r.cfg.id}\` | ${num(mm.recall, 2)} | ${num(mm.precision, 2)} | ${mm.boundaryViolations} | ${num(mm.falseFires, 1)} | ${mm.medianLeadTime ?? "-"} | ${num(mm.firesPerYear, 2)} | ${num(mm.score, 3)} |`);
  }
  L.push("");

  L.push(`## 付記(実装上の解釈)`);
  L.push("");
  L.push(`- peak は「直近 lookback 営業日(当日含む)の終値最高値」。crash 中も rolling で更新を継続。`);
  L.push(`- crash の解除判定に使う「急落前高値」は発動時点の rolling peak を固定保持 (変数 \`preCrashPeak\`)。`);
  L.push(`- リードタイムは「発動時点の急落前高値の日 → crash 遷移日」の営業日数。`);
  L.push(`- 冒頭 lookback 営業日はウォームアップとして判定対象外。そのため lookback=120/250 は E01 (2000年4月) を構造的に検出できない。`);
  L.push(`- 通知フラグ (notify) は同一ドローダウン局面につき初回のみ true。局面は「局面開始時の高値を終値が上回った日」に終了。`);
  L.push(`- 閾値比較には 1e-9 の許容を付与。`);
  L.push("");
  return L.join("\n");
}

function writeFiresCsv(outPath, best) {
  const lines = ["date,dd,trigger_condition"];
  for (const f of best.run.fires) {
    lines.push(`${f.date},${num(f.dd, 6)},${f.conditions}`);
  }
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { dataPath: null, outDir: SCRIPT_DIR };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--data") args.dataPath = argv[++i];
    else if (argv[i] === "--out") args.outDir = path.resolve(argv[++i]);
  }
  return args;
}

export async function main(argv = process.argv.slice(2)) {
  const { dataPath, outDir } = parseArgs(argv);
  const rows = await loadData({ dataPath });
  if (rows.length < 300) throw new Error(`データが少なすぎます (${rows.length}営業日)。停止します。`);
  const dataInfo = {
    source: dataPath ? `ローカルCSV (${path.basename(dataPath)})` : "Stooq ^NKX 日次 (キャッシュ含む)",
    rows: rows.length,
    firstDate: rows[0].date,
    lastDate: rows[rows.length - 1].date,
  };
  console.log(`[data] ${dataInfo.firstDate} 〜 ${dataInfo.lastDate} (${rows.length}営業日)`);

  const grid = buildGrid();
  console.log(`[grid] ${grid.length} 設定を評価中...`);
  const results = grid.map((cfg) => evaluateConfig(rows, cfg));

  const { best, passedSpec, note } = selectBest(results);
  console.log(`[select] ${note}`);
  console.log(`[select] 採用: ${best.cfg.id}  score=${num(best.metrics.score)}  recall=${num(best.metrics.recall, 3)}  fires/yr=${num(best.metrics.firesPerYear, 3)}`);

  fs.mkdirSync(outDir, { recursive: true });
  const p1 = path.join(outDir, "results.csv");
  const p2 = path.join(outDir, "best_config.json");
  const p3 = path.join(outDir, "report.md");
  const p4 = path.join(outDir, "fires_for_trends.csv");
  writeResultsCsv(p1, results);
  fs.writeFileSync(p2, JSON.stringify(bestConfigJson(best, passedSpec, note, dataInfo), null, 2) + "\n", "utf8");
  fs.writeFileSync(p3, buildReport(best, passedSpec, note, results, dataInfo), "utf8");
  writeFiresCsv(p4, best);
  for (const p of [p1, p2, p3, p4]) console.log(`[out] ${p}`);
  return { results, best, passedSpec };
}

const isDirectRun = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((e) => { console.error(`\nERROR: ${e.message}`); process.exit(1); });
}
