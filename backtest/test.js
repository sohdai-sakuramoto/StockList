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
import { computeConclusion } from "./scripts/build_event_data.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

test("computeConclusion: 高値・底・回復・下落率が定義どおり算出される", () => {
  const rows = [
    { date: "2019-06-03", close: 90 },
    { date: "2019-12-02", close: 95 },
    { date: "2020-01-06", close: 100 },   // 高値(イベント期間前の直近最高値)
    { date: "2020-02-03", close: 88 },     // 期間開始後
    { date: "2020-02-17", close: 60 },     // 底(期間内の最安値)
    { date: "2020-03-02", close: 75 },
    { date: "2020-04-06", close: 92 },
    { date: "2020-08-03", close: 101 },    // 高値を初めて上回った日=回復
    { date: "2020-09-07", close: 105 },
  ];
  const c = computeConclusion(rows, { window: ["2020-02-01", "2020-05-01"], date: "2020-02-10" });
  assert.equal(c.peak.close, 100);
  assert.equal(c.peak.date, "2020-01-06");
  assert.equal(c.trough.close, 60);
  assert.equal(c.trough.date, "2020-02-17");
  assert.ok(Math.abs(c.drawdown - -0.4) < 1e-9, "最大下落率 = 60/100 - 1 = -0.4");
  assert.equal(c.recovered, true);
  assert.equal(c.recovery_date, "2020-08-03");
  assert.equal(c.recovery_close, 101);
  assert.deepEqual(c.event_day, { date: "2020-02-03", close: 88 }, "イベント日が休場なら直前の営業日");
});

test("computeConclusion: troughFrom があれば底はその日以降に限る(期間の開始は変えない)", () => {
  const rows = [
    { date: "2019-12-02", close: 95 },
    { date: "2020-01-06", close: 100 },   // 高値
    { date: "2020-02-03", close: 70 },    // troughFrom より前の安値(底にしない)
    { date: "2020-02-17", close: 85 },
    { date: "2020-03-02", close: 80 },    // troughFrom 以降の最安値 = 底
    { date: "2020-04-06", close: 101 },
  ];
  const c = computeConclusion(rows, { window: ["2020-02-01", "2020-05-01"], date: "2020-02-10", troughFrom: "2020-02-10" });
  assert.equal(c.peak.date, "2020-01-06");
  assert.equal(c.trough.date, "2020-03-02");
  assert.ok(Math.abs(c.drawdown - -0.2) < 1e-9);
});

test("computeConclusion: peakFrom があれば高値はその日以降に限る(前の局面の高値を拾わない)", () => {
  const rows = [
    { date: "2019-12-02", close: 150 },   // peakFrom より前の高値(高値にしない)
    { date: "2020-01-31", close: 100 },   // peakFrom = 期間開始 = 高値
    { date: "2020-02-03", close: 90 },    // 底
    { date: "2020-02-17", close: 101 },   // 回復
  ];
  const c = computeConclusion(rows, { window: ["2020-01-31", "2020-05-01"], date: "2020-01-31", peakFrom: "2020-01-31" });
  assert.equal(c.peak.date, "2020-01-31");
  assert.equal(c.trough.date, "2020-02-03");
  assert.equal(c.recovery_date, "2020-02-17");
  assert.ok(Math.abs(c.drawdown - -0.1) < 1e-9);
});

test("computeConclusion: データ期間内に回復しなければ未回復", () => {
  const rows = [
    { date: "2019-12-02", close: 95 },
    { date: "2020-01-06", close: 100 },
    { date: "2020-02-17", close: 60 },
    { date: "2020-04-06", close: 80 },
  ];
  const c = computeConclusion(rows, { window: ["2020-02-01", "2020-05-01"], date: "2020-02-10" });
  assert.equal(c.recovered, false);
  assert.equal(c.recovery_date, null);
  assert.equal(c.recovery_close, null);
  assert.equal(c.later_low, null, "底より安い値がなければ later_low は null");
});

test("computeConclusion: 期間後〜回復までに底より安い値があれば later_low に出す(回復後は対象外)", () => {
  const rows = [
    { date: "2019-12-02", close: 95 },
    { date: "2020-01-06", close: 100 },    // 高値
    { date: "2020-02-17", close: 60 },     // 期間内の底
    { date: "2020-06-01", close: 80 },
    { date: "2020-09-01", close: 50 },     // 期間後のさらに安い値
    { date: "2020-10-01", close: 55 },
    { date: "2021-01-04", close: 101 },    // 回復
    { date: "2021-03-01", close: 40 },     // 回復後(対象外)
  ];
  const c = computeConclusion(rows, { window: ["2020-02-01", "2020-05-01"], date: "2020-02-10" });
  assert.equal(c.trough.date, "2020-02-17", "底は期間内のまま");
  assert.deepEqual(c.later_low, { date: "2020-09-01", close: 50, drawdown: -0.5 });
});

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

test("parseStooqCsv: FRED形式 (DATE,NIKKEI225 の2列・欠測は '.') も読める", () => {
  const csv = [
    "observation_date,NIKKEI225",
    "1999-12-30,18934.34",   // 2000年以前は除外
    "2000-01-04,19002.86",
    "2000-01-05,.",           // 欠測はスキップ
    "2000-01-06,18542.55",
  ].join("\n");
  const rows = parseStooqCsv(csv);
  assert.deepEqual(rows.map((r) => r.date), ["2000-01-04", "2000-01-06"]);
  assert.equal(rows[0].close, 19002.86);
});

test("parseStooqCsv: HTML(bot認証ページ)は明示エラーで弾く", () => {
  assert.throws(
    () => parseStooqCsv('<!DOCTYPE html><html><head></head><body>This site requires JavaScript</body></html>'),
    /HTML/,
  );
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

test("vercel.json: リダイレクトはすべて301で、転送先(固定パス)のページが実在する", () => {
  const ROOT = path.resolve(SCRIPT_DIR, "..");
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  const pageExists = (p) => p === "/" || [`${p}.html`, `${p}/index.html`].some((f) => fs.existsSync(path.join(ROOT, f)));
  for (const r of cfg.redirects) {
    assert.equal(r.statusCode, 301, `${r.source} は statusCode:301 にする(permanent:true は308になる)`);
    assert.ok(!("permanent" in r), `${r.source}: permanent と statusCode は併用不可`);
    if (!r.destination.includes(":")) assert.ok(pageExists(r.destination), `${r.source} → ${r.destination} の転送先ページがない`);
    assert.ok(!r.destination.endsWith("/") || r.destination === "/", `${r.destination}: trailingSlash:false なので末尾スラッシュなし`);
  }
});

test("og/events/*.png: OGP画像は 1200×630 のPNGで、対応するイベントがある", () => {
  const ROOT = path.resolve(SCRIPT_DIR, "..");
  const dir = path.join(ROOT, "og", "events");
  if (!fs.existsSync(dir)) return;
  const slugs = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, "History", "events", "events.json"), "utf8")).map((e) => e.slug));
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".png"))) {
    const b = fs.readFileSync(path.join(dir, f));
    assert.equal(b.toString("ascii", 1, 4), "PNG", `${f} はPNG`);
    assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [1200, 630], `${f} のサイズ`);
    assert.ok(slugs.has(f.replace(/\.png$/, "")), `${f} に対応するイベントが events.json にない`);
  }
});

test("event_nav: 比較ブロックは既定セット+現在のイベントを深い順に、上限超過時は下落率が近い既定イベントと入れ替える", async () => {
  const { selectCompare } = await import("./scripts/event_nav.mjs");
  const ev = (id, dd, date) => ({ id, slug: id, title: id, date, drawdown: dd, recover_label: "" });
  const events = [ev("a", -0.6, "1990-01-01"), ev("b", -0.3, "2020-01-01"), ev("c", -0.22, "1987-01-01"), ev("d", -0.25, "2024-01-01")];
  assert.deepEqual(selectCompare("d", events, { compare: { default: ["a", "b", "c"], max: 6 } }).map((e) => e.id), ["a", "b", "d", "c"]);
  assert.deepEqual(selectCompare("b", events, { compare: { default: ["a", "b", "c"] } }).map((e) => e.id), ["a", "b", "c"], "既定に含まれていれば追加しない");
  assert.deepEqual(selectCompare("d", events, { compare: { default: ["a", "b", "c"], max: 3 } }).map((e) => e.id), ["a", "b", "d"], "上限3: -25%に最も近い c(-22%) と入れ替え");
  assert.deepEqual(selectCompare("d", events, { compare: { default: ["a"] } }, ["c"]).map((e) => e.id), ["d", "c"], "イベント個別の compare が優先");
});

test("event_nav: 次に読むは featured から2件+下落率が近いイベント1件(現在・featured を除く)", async () => {
  const { selectRelated } = await import("./scripts/event_nav.mjs");
  const ev = (id, dd, date) => ({ id, slug: id, title: id, date, drawdown: dd, recover_label: "" });
  const events = [ev("old1", -0.5, "1950-01-01"), ev("old2", -0.22, "1987-01-01"), ev("f1", -0.16, "2024-09-01"), ev("f2", -0.31, "2020-02-01"), ev("f3", -0.25, "2024-08-01")];
  const nav = { next: { featured: ["f1", "f2", "f3"], featuredSlots: 2, similarSlots: 1 } };
  const ids = (cur, o) => selectRelated(cur, events, nav, o).map((r) => r.ev.id);
  assert.deepEqual(ids("old1"), ["f1", "f2", "old2"]);
  assert.deepEqual(ids("f1"), ["f2", "f3", "old2"], "自分自身は featured から除く");
  assert.deepEqual(ids("f3"), ["f1", "f2", "old2"]);
  assert.deepEqual(ids("old1", ["f3", "old1"]), ["f3"], "イベント個別の related が優先(自分は除く)");
});

test("site-config: 環境変数の計測IDを形式チェックして埋め込み、不正・未設定は null", async () => {
  const { buildConfig, configJs } = await import("./scripts/write_site_config.mjs");
  assert.deepEqual(buildConfig({ GA_MEASUREMENT_ID: "G-T0G5R1TXTF" }).cfg.gaId, "G-T0G5R1TXTF");
  assert.equal(buildConfig({}).cfg.gaId, null);
  assert.equal(buildConfig({ GA_MEASUREMENT_ID: 'G-X";alert(1)//' }).cfg.gaId, null, "スクリプト注入になる値は拒否");
  assert.match(configJs({ gaId: "G-ABC123" }), /^\/\*[^\n]*\*\/\nwindow\.SL_CONFIG = \{"gaId":"G-ABC123"\};\n$/);
  const x = buildConfig({ X_PIXEL_ID: "rh6rz", X_PIXEL_EVENT_ID: "tw-rh6rz-rhaa7" }).cfg;
  assert.equal(x.xPixelId, "rh6rz");
  assert.equal(x.xEventId, "tw-rh6rz-rhaa7");
  assert.equal(buildConfig({ X_PIXEL_ID: "rh6rz');alert(1)//" }).cfg.xPixelId, null);
  assert.equal(buildConfig({ X_PIXEL_EVENT_ID: "rhaa7" }).cfg.xEventId, null, "tw-<ピクセルID>-<イベント> 形式のみ");
});

test("計測IDはHTMLに直書きしない(site-config.js 経由で環境変数から読む)", () => {
  const ROOT = path.resolve(SCRIPT_DIR, "..");
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.name.startsWith(".") || e.name === "node_modules" ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const files = walk(ROOT).filter((f) => /\.(html|mjs)$/.test(f) && !f.includes(`${path.sep}backtest${path.sep}test`));
  for (const f of files) {
    const s = fs.readFileSync(f, "utf8");
    assert.ok(!/googletagmanager\.com\/gtag\/js\?id=G-/.test(s), `${path.relative(ROOT, f)} に GA の測定IDが直書きされている`);
  }
});

test("暴落ランキング: 下落率の深い順・回復の早い順(未回復は末尾)に並び、事実を結論データから算出", async () => {
  const { rankCrashes } = await import("./scripts/feature_ranking.mjs");
  const ev = (id, date, drawdown, months, later) => ({
    cfg: { id, slug: id, title: id, date },
    c: { drawdown, recovered: months != null, months_to_recover: months, later_low: later || null },
  });
  const { byDrawdown, byRecovery, facts } = rankCrashes([
    ev("a", "2000-01-01", -0.3, 10),
    ev("b", "2001-01-01", -0.6, 90, { date: "2003-01-01", drawdown: -0.8 }),
    ev("c", "2002-01-01", -0.2, null),
    ev("d", "2003-01-01", -0.5, 70),
    { cfg: { id: "x", slug: "x", title: "x", date: "2004-01-01" }, c: null },
  ]);
  assert.deepEqual(byDrawdown.map((r) => r.id), ["b", "d", "a", "c"], "結論データの無いイベントは除外");
  assert.deepEqual(byRecovery.map((r) => r.id), ["a", "d", "b", "c"]);
  assert.equal(facts.n, 4);
  assert.equal(facts.deepest.id, "b");
  assert.equal(facts.deepestLater.id, "b", "その後の安値が最初の底より深ければ出す");
  assert.deepEqual(facts.withinYear.map((r) => r.id), ["a"]);
  assert.deepEqual(facts.overFiveYears.map((r) => r.id).sort(), ["b", "d"]);
  assert.equal(facts.slowest.id, "b");
  assert.equal(facts.top3MinYears, 0, "上位3件(b,d,a)の最短は10ヶ月=0年");
});
