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
