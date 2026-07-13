/*
 * 急落モード バナー — サイト共通スクリプト
 *
 * リポジトリ直下の state.json を読み込み、現在のモード(normal/caution/crash/recovery)に
 * 応じた状態バナーを <body> の先頭に差し込む。state.json は
 * backtest/scripts/update_state.mjs が最新データから生成する。
 *
 * 使い方(各ページの <head> に追加):
 *   <link rel="stylesheet" href="crash-mode.css">
 *   <script src="crash-mode.js" data-state="state.json" defer></script>
 * サブディレクトリのページからは data-state を相対パスで指定する。
 *   例) History/History.html なら  data-state="../state.json"
 *
 * state.json が取得できない/normal のときはバナーを出さない設計(邪魔をしない)。
 */
(function () {
  "use strict";

  var script = document.currentScript;
  var STATE_URL = (script && script.getAttribute("data-state")) || "state.json";
  // normal のときもバナーを出したい場合は data-show-normal="true" を付与
  var SHOW_NORMAL = script && script.getAttribute("data-show-normal") === "true";
  // 株価スナップショット(市場時間中に GitHub Actions が15分毎更新する market-data ブランチ)
  var QUOTES_URL = (script && script.getAttribute("data-quotes")) ||
    "https://raw.githubusercontent.com/sohdai-sakuramoto/StockList/market-data/quotes.json";
  var QUOTES_REFRESH_MS = 5 * 60 * 1000; // ページを開いたまま5分毎に再取得

  function pct(x) {
    if (x === null || x === undefined || isNaN(x)) return "-";
    return (x * 100).toFixed(2) + "%";
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function render(state) {
    if (!state || !state.mode) return;
    if (state.mode === "normal" && !SHOW_NORMAL) return;

    var m = state.metrics || {};
    var banner = document.createElement("div");
    banner.className = "cm-banner";
    banner.setAttribute("data-mode", state.mode);
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");

    var metricsHtml =
      '<div class="cm-metrics">' +
      '<span>ドローダウン <b>' + pct(m.drawdown) + "</b></span>" +
      (m.close != null ? '<span>終値 <b>' + Number(m.close).toLocaleString("ja-JP") + "</b></span>" : "") +
      "</div>";

    banner.innerHTML =
      '<span class="cm-dot" aria-hidden="true"></span>' +
      '<span class="cm-label">' + esc(state.label || state.mode) + "</span>" +
      '<span class="cm-text">' +
        '<span class="cm-headline">' + esc(state.headline || "") + "</span> " +
        '<span class="cm-tone">' + esc(state.message || "") + "</span>" +
      "</span>" +
      metricsHtml +
      '<span class="cm-asof">' + esc(state.as_of || "") + " 時点</span>";

    var body = document.body;
    if (body) body.insertBefore(banner, body.firstChild);
    startQuotes(banner);
  }

  /* ── 株価ストリップ(2段目): 日経平均+主要銘柄の遅延価格。取得失敗時は出さない ── */
  function signPct(x) {
    if (x === null || x === undefined || isNaN(x)) return "";
    var v = (x * 100).toFixed(2);
    return (x >= 0 ? "+" : "−") + Math.abs(v).toFixed(2) + "%";
  }
  function jstTime(epochSec) {
    if (!epochSec) return "";
    try {
      return new Date(epochSec * 1000).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });
    } catch (e) { return ""; }
  }
  function quoteHtml(name, price, changePct) {
    if (price == null) return "";
    var cls = changePct == null ? "" : changePct >= 0 ? " up" : " down";
    return '<span class="cm-q">' + esc(name) + ' <b>' + Number(price).toLocaleString("ja-JP") + "</b>" +
      (changePct == null ? "" : ' <i class="cm-chg' + cls + '">' + signPct(changePct) + "</i>") + "</span>";
  }
  function renderQuotes(banner, q) {
    if (!q || !q.nikkei || q.nikkei.price == null) return;
    var row = banner.querySelector(".cm-quotes");
    if (!row) {
      row = document.createElement("div");
      row.className = "cm-quotes";
      banner.appendChild(row);
    }
    var parts = [quoteHtml(q.nikkei.name || "日経平均", q.nikkei.price, q.nikkei.change_pct)];
    (q.stocks || []).forEach(function (s) { parts.push(quoteHtml(s.name, s.price, s.change_pct)); });
    row.innerHTML =
      '<div class="cm-quotes-scroll">' + parts.join('<span class="cm-sep" aria-hidden="true">·</span>') + "</div>" +
      '<span class="cm-delay">約20分遅延' + (q.nikkei.market_time ? " · " + jstTime(q.nikkei.market_time) + "時点" : "") + "</span>";
  }
  function startQuotes(banner) {
    function tick() {
      fetch(QUOTES_URL + (QUOTES_URL.indexOf("?") < 0 ? "?t=" : "&t=") + Math.floor(Date.now() / 60000), { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error("quotes " + r.status); return r.json(); })
        .then(function (q) { renderQuotes(banner, q); })
        .catch(function (e) {
          // 未生成・取得失敗時はストリップを出さないだけ(バナー本体は維持)
          if (window.console) console.warn("[crash-mode] 株価を取得できませんでした:", e.message);
        });
    }
    tick();
    setInterval(tick, QUOTES_REFRESH_MS);
  }

  function boot() {
    fetch(STATE_URL, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("state.json " + r.status); return r.json(); })
      .then(render)
      .catch(function (e) {
        // 取得失敗時は何も表示しない(サイトの通常表示を妨げない)
        if (window.console) console.warn("[crash-mode] 状態を取得できませんでした:", e.message);
      });
  }

  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
