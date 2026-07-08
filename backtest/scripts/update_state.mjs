#!/usr/bin/env node
/**
 * 本番サイト用「現在の急落モード状態」書き出しスクリプト
 *
 * 採用設定(best_config.json 相当)で状態機械を最新データまで回し、
 * 「今サイトがどのモードか」を site 直下の state.json に書き出す。
 * サイト側 (crash-mode.js) はこの state.json を読んで自動でモードを切り替える。
 *
 * 実行:
 *   node backtest/scripts/update_state.mjs                 # 最新データを取得(Stooq→FRED)して更新
 *   node backtest/scripts/update_state.mjs --data <csv>    # 指定CSVで更新(オフライン確認用)
 *   node backtest/scripts/update_state.mjs --out <path>    # 出力先を変更(既定: リポジトリ直下 state.json)
 *
 * ※ データ取得は backtest.js と同じ loadData を再利用(キャッシュ優先・FREDフォールバック)。
 * ※ 当面は手動実行を想定。将来 GitHub Actions 等で定期実行すれば完全自動化できる(本タスクではスコープ外)。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadData, runStateMachine, EPS } from "../backtest.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const BEST_CONFIG_PATH = path.join(SCRIPT_DIR, "..", "best_config.json");

// 採用設定(best_config.json が無い場合のフォールバック)。バックテストで決定した値。
const DEFAULT_CONFIG = { lookback: 60, depthTh: -0.12, singleDayTh: -0.06, speed: null };

// state → 日本語表記・落ち着いたメッセージ(サイトのトーン「暴落しても、焦らないこと」に合わせる)
const MODE_TEXT = {
  normal:   { label: "平常モード",  headline: "市場は落ち着いています。",           tone: "いつもどおり、あわてず。" },
  caution:  { label: "警戒モード",  headline: "少し下げています。まずは深呼吸を。", tone: "警戒はしても、焦らないこと。" },
  crash:    { label: "急落モード",  headline: "大きく下げています。",               tone: "暴落しても、焦らないこと。" },
  recovery: { label: "回復モード",  headline: "底を打ち、戻し始めています。",       tone: "急いで戻さず、ゆっくりと。" },
};

function parseArgs(argv) {
  const a = { dataPath: null, outPath: path.join(REPO_ROOT, "state.json") };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--data") a.dataPath = argv[++i];
    else if (argv[i] === "--out") a.outPath = path.resolve(argv[++i]);
  }
  return a;
}

/** best_config.json(あれば)を内部 cfg 形状に変換。無ければ DEFAULT_CONFIG。 */
function loadConfig() {
  if (!fs.existsSync(BEST_CONFIG_PATH)) {
    console.log(`[cfg] best_config.json が無いため採用設定の既定値を使用`);
    return { ...DEFAULT_CONFIG, source: "default" };
  }
  const j = JSON.parse(fs.readFileSync(BEST_CONFIG_PATH, "utf8"));
  const c = j.config;
  const spd = c.crash_triggers.speed;
  const cfg = {
    lookback: c.lookback_days,
    depthTh: c.crash_triggers.drawdown_depth_th,
    singleDayTh: c.crash_triggers.single_day_return_th,
    speed: spd && spd.enabled ? { th: spd.dd_th, window: spd.window_days } : null,
    source: "best_config.json",
  };
  console.log(`[cfg] best_config.json から採用設定を読み込み`);
  return cfg;
}

async function main() {
  const { dataPath, outPath } = parseArgs(process.argv.slice(2));
  const cfg = loadConfig();
  const rows = await loadData({ dataPath });
  if (rows.length < cfg.lookback + 2) throw new Error(`データが少なすぎます (${rows.length}営業日)`);

  const run = runStateMachine(rows, cfg);
  const last = rows.length - 1;
  const state = run.states[last] || "normal";

  // 現在のドローダウン(直近 lookback 営業日の終値最高値 = rolling peak 比)
  let peakIdx = last;
  for (let i = Math.max(0, last - cfg.lookback + 1); i <= last; i++) {
    if (rows[i].close > rows[peakIdx].close + EPS) peakIdx = i;
  }
  const close = rows[last].close;
  const peakClose = rows[peakIdx].close;
  const dd = close / peakClose - 1;
  const dailyRet = last > 0 ? close / rows[last - 1].close - 1 : 0;

  // 直近の crash 発動(notify=true)を拾う
  const lastNotify = [...run.fires].reverse().find((f) => f.notify) || null;

  const t = MODE_TEXT[state] || MODE_TEXT.normal;
  const state_out = {
    schema: "stocklist-crash-mode/1",
    generated_at: new Date().toISOString(),
    as_of: rows[last].date,
    mode: state,
    label: t.label,
    headline: t.headline,
    message: t.tone,
    metrics: {
      close: Number(close.toFixed(2)),
      drawdown: Number(dd.toFixed(4)),
      daily_return: Number(dailyRet.toFixed(4)),
      peak_date: rows[peakIdx].date,
      peak_close: Number(peakClose.toFixed(2)),
    },
    last_crash_notified: lastNotify ? { date: lastNotify.date, drawdown: Number(lastNotify.dd.toFixed(4)) } : null,
    config_source: cfg.source,
    data_range: [rows[0].date, rows[last].date],
    disclaimer: "検証用データ(Stooq/FRED)に基づく参考値。投資判断は自己責任で。",
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(state_out, null, 2) + "\n", "utf8");
  console.log(`[state] mode=${state} dd=${(dd * 100).toFixed(2)}% as_of=${rows[last].date}`);
  console.log(`[out] ${outPath}`);
}

main().catch((e) => { console.error(`\nERROR: ${e.message}`); process.exit(1); });
