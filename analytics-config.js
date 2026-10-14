/*
 * Vercel Web Analytics の設定(全ページ共通)
 * ─────────────────────────────────────────────
 * 運営者自身のアクセスを計測から除外する。
 *
 *   localStorage に "va-disable" があるブラウザからは、ページビュー・イベントを送信しない
 *   (Vercel Analytics の beforeSend で null を返すと送信されない)。
 *
 * 有効化 / 解除:
 *   - URL に ?va-disable=1 を付けて開く → 除外を有効化(スマホの Safari でも可)
 *   - URL に ?va-disable=0 を付けて開く → 除外を解除
 *   - DevTools のコンソール: localStorage.setItem("va-disable", "1") / localStorage.removeItem("va-disable")
 *
 * localStorage が使えない環境(プライベートブラウズの制限等)では例外を握りつぶし、通常どおり計測する。
 * このファイルは /_vercel/insights/script.js より前に(defer の順序で)読み込むこと。
 */
(function () {
  "use strict";
  var KEY = "va-disable";

  // Vercel Analytics のキュー(script.js の読み込み前に積んだ設定は読み込み後に反映される)
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };

  function isDisabled() {
    try { return !!window.localStorage.getItem(KEY); } catch (e) { return false; }
  }

  // ?va-disable=1 / 0 の切り替え
  var toggled = null;
  try {
    var params = new URLSearchParams(location.search);
    if (params.has(KEY)) {
      var v = params.get(KEY);
      if (v === "0" || v === "false") { window.localStorage.removeItem(KEY); toggled = "off"; }
      else { window.localStorage.setItem(KEY, "1"); toggled = "on"; }
      // アドレスバーから va-disable だけを消す(utm_* など他のパラメータは残す)
      params.delete(KEY);
      var qs = params.toString();
      history.replaceState(history.state, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
    }
  } catch (e) { /* localStorage や history が使えなければ切り替えなし(計測は通常どおり) */ }

  window.va("beforeSend", function (event) {
    if (isDisabled()) return null;
    // 念のため送信URLからも va-disable パラメータを除く
    try {
      var u = new URL(event.url);
      if (u.searchParams.has(KEY)) { u.searchParams.delete(KEY); event.url = u.toString(); }
    } catch (e) { /* URLが解釈できなければそのまま送る */ }
    return event;
  });

  // 切り替えた時だけ、画面下に数秒だけ結果を表示(スマホで確認しやすいように)
  if (toggled) {
    var show = function () {
      var el = document.createElement("div");
      el.setAttribute("role", "status");
      el.textContent = toggled === "on"
        ? "このブラウザのアクセスを計測から除外しました（解除: ?va-disable=0）"
        : "このブラウザのアクセス除外を解除しました";
      el.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483647;" +
        "max-width:calc(100% - 32px);padding:10px 14px;border-radius:10px;background:#1b2538;color:#fff;" +
        "font:600 13px/1.5 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);text-align:center;";
      document.body.appendChild(el);
      setTimeout(function () { el.remove(); }, 4000);
    };
    if (document.body) show(); else document.addEventListener("DOMContentLoaded", show);
  }
})();
