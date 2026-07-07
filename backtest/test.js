/**
 * 状態機械・評価ロジックのユニットテスト
 * 実行: node --test test.js   (または node test.js)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runStateMachine, parseStooqCsv, windowToIdx, EPS } from "./backtest.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

/** 2020-01-06(月)起点の連続営業日で終値列から rows を作る */
function makeRows(closes) {
  const rows = [];
  let d = new Date(Date.UTC(2020, 0, 6));
  for (const close of closes) {
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() + 86400000);
    rows.push({ date: d.toISOString().slice(0, 10), close });
    d = new Date(d.getTime() + 86400000);
  }
  return rows;
}

const flat = (n, v = 100) => Array(n).fill(v);
/** 緩やかに上昇する系列 (peak日 = 末尾になるようにするため) */
function rise(n, start = 100, rate = 1.0005) {
  return Array.from({ length: n }, (_, i) => start * rate ** i);
}

test("条件A: 単日 -6% で crash 発動 (single_day_th=-5%)", () => {
  const closes = [...flat(12), 94]; // 12日フラット後に -6%
  const { fires, states } = runStateMachine(makeRows(closes), {
    lookback: 5, depthTh: -0.12, singleDayTh: -0.05, speed: null,
  });
  assert.equal(fires.length, 1);
  assert.match(fires[0].conditions, /A/);
  assert.equal(fires[0].notify, true);
  assert.equal(states[12], "crash");
  // dd は -6% までなので深さ条件(-12%)は成立していない
  assert.doesNotMatch(fires[0].conditions, /B/);
});

test("条件B: 緩やかな下落で caution を経て深さ -8% で crash", () => {
  // 毎日 -1.7%: 単日条件(-4%)には掛からず、累積DDで発動
  const closes = [...flat(32)];
  let v = 100;
  for (let k = 0; k < 8; k++) { v *= 0.983; closes.push(v); }
  const { fires, transitions } = runStateMachine(makeRows(closes), {
    lookback: 30, depthTh: -0.08, singleDayTh: -0.04, speed: null,
  });
  assert.equal(fires.length, 1);
  assert.equal(fires[0].conditions, "B");
  // crash の前に normal→caution 遷移がある (dd<=-5% が先に成立)
  const cautionIdx = transitions.findIndex((t) => t.to === "caution");
  const crashIdx = transitions.findIndex((t) => t.to === "crash");
  assert.ok(cautionIdx >= 0 && cautionIdx < crashIdx);
});

test("条件C: 速度条件は speed_window 内のみ成立する", () => {
  const cfgBase = { lookback: 30, depthTh: -0.12, singleDayTh: -0.04 };
  // 上昇でpeakを付けた直後、毎日 -1.2% × 8日 → dd≈-8.1% を7営業日で達成
  // (単日-4%・深さ-12%には掛からない)
  const fastCloses = [...rise(32)];
  let v = fastCloses[fastCloses.length - 1];
  for (let k = 0; k < 8; k++) { v *= 0.988; fastCloses.push(v); }
  const fast = runStateMachine(makeRows(fastCloses), { ...cfgBase, speed: { th: -0.08, window: 10 } });
  assert.equal(fast.fires.length, 1);
  assert.equal(fast.fires[0].conditions, "C");
  assert.ok(fast.fires[0].leadDays <= 10);

  const noSpeed = runStateMachine(makeRows(fastCloses), { ...cfgBase, speed: null });
  assert.equal(noSpeed.fires.length, 0);

  // 同程度の深さでも 16営業日かけて下がると window=10 では発動しない
  const slowCloses = [...rise(32)];
  v = slowCloses[slowCloses.length - 1];
  for (let k = 0; k < 16; k++) { v *= 0.994; slowCloses.push(v); }
  const slowRun = runStateMachine(makeRows(slowCloses), { ...cfgBase, speed: { th: -0.08, window: 10 } });
  assert.equal(slowRun.fires.length, 0);
  const slowRun20 = runStateMachine(makeRows(slowCloses), { ...cfgBase, speed: { th: -0.08, window: 20 } });
  assert.equal(slowRun20.fires.length, 1);
  assert.equal(slowRun20.fires[0].conditions, "C");
});

test("解除: 10営業日経過 + 急落前高値比 -5% 回復で recovery → 高値更新で normal", () => {
  // 100 → 90 (crash) → 低迷 → 96 (dd_fixed=-4%) → 101 (peak更新)
  const closes = [...flat(8), 90, ...flat(11, 90), 96, 96, 101, 102];
  const { states, transitions, fires } = runStateMachine(makeRows(closes), {
    lookback: 5, depthTh: -0.09, singleDayTh: -0.05, speed: null,
  });
  assert.equal(fires.length, 1);
  const seq = transitions.map((t) => `${t.from}>${t.to}`);
  assert.deepEqual(seq, ["normal>crash", "crash>recovery", "recovery>normal"]);
  // recovery は 96 の日 (crash 開始から10営業日経過後)
  const rec = transitions.find((t) => t.to === "recovery");
  assert.ok(rec.i - fires[0].i >= 10);
  assert.equal(states[states.length - 1], "normal");
});

test("解除(最低継続): 10営業日未満では dd が回復しても crash を維持", () => {
  const closes = [...flat(8), 90, 96, 96, 96, 96, 96];
  const { states } = runStateMachine(makeRows(closes), {
    lookback: 5, depthTh: -0.09, singleDayTh: -0.05, speed: null,
  });
  // 発動から5営業日しか経っていないので crash のまま
  assert.equal(states[states.length - 1], "crash");
});

test("notify: 同一ドローダウン局面内の再発動は notify=false、高値更新後は true に戻る", () => {
  const closes = [
    ...flat(8),
    90,                    // 1回目 crash (notify=true), episodePeak=100
    ...flat(11, 90),
    96,                    // recovery (dd_fixed=-4%)
    92,                    // recovery 中に単日 -4.2% → 再 crash (notify=false)
    ...flat(11, 92),
    97, 97,                // recovery (92比 dd_fixed... preCrashPeak=96窓内peak)
    101,                   // episodePeak=100 を上回り局面終了 + normal 復帰
    ...flat(6, 101),
    95,                    // 単日 -5.9% → 新局面 crash (notify=true)
  ];
  const { fires } = runStateMachine(makeRows(closes), {
    lookback: 5, depthTh: -0.09, singleDayTh: -0.04, speed: null,
  });
  assert.equal(fires.length, 3);
  assert.deepEqual(fires.map((f) => f.notify), [true, false, true]);
});

test("EPS: 閾値ちょうどの単日下落 (-5.000000000%) でも発動する", () => {
  const closes = [...flat(12), 95]; // ちょうど -5%
  const { fires } = runStateMachine(makeRows(closes), {
    lookback: 5, depthTh: -0.12, singleDayTh: -0.05, speed: null,
  });
  assert.equal(fires.length, 1, "1e-9 の許容で境界値も成立するべき");
});

test("parseStooqCsv: 2000年以前の行・不正行を除外し昇順で返す", () => {
  const csv = [
    "Date,Open,High,Low,Close,Volume",
    "1999-12-30,18000,18100,17900,18050,0",
    "2000-01-04,19000,19100,18900,19002,0",
    "2000-01-05,19002,19100,18900,19050,0",
    "bad,row,,,x,0",
    "2000-01-06,19050,19100,18900,,0",
  ].join("\n");
  const rows = parseStooqCsv(csv);
  assert.deepEqual(rows.map((r) => r.date), ["2000-01-04", "2000-01-05"]);
  assert.equal(rows[0].close, 19002);
});

test("windowToIdx: 前後バッファが営業日単位で効く", () => {
  const rows = makeRows(flat(30));
  const w = windowToIdx(rows, rows[15].date, rows[15].date, 10);
  assert.deepEqual([w.lo, w.hi], [5, 25]);
});

// --- 実データがキャッシュ済みの場合のみ実行する検証 ---
test("実データ: 東日本大震災期間 (2011-03) に単日 -4% 以下の日が存在する (条件A成立)", (t) => {
  const cache = path.join(SCRIPT_DIR, "data", "nkx_daily.csv");
  if (!fs.existsSync(cache)) return t.skip("data/nkx_daily.csv 未取得のためスキップ");
  const rows = parseStooqCsv(fs.readFileSync(cache, "utf8"));
  const w = windowToIdx(rows, "2011-03-14", "2011-03-31", 0);
  assert.ok(w, "2011年3月のデータが存在するはず");
  let found = false;
  for (let i = Math.max(w.lo, 1); i <= w.hi; i++) {
    const ret = rows[i].close / rows[i - 1].close - 1;
    if (ret <= -0.04 + EPS) { found = true; break; }
  }
  assert.ok(found, "2011-03-14/15 のいずれかで -4% 超の下落があるはず");
});
