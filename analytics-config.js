/*
 * アクセス解析の設定(全ページ共通): 運営者自身のアクセスを計測から除外する
 * ─────────────────────────────────────────────
 * localStorage に "va-disable" があるブラウザからは、次の2つとも送信しない。
 *   - Vercel Web Analytics … beforeSend で null を返す
 *   - GA4(Google アナリティクス) … window["ga-disable-<測定ID>"] = true
 *
 * 有効化 / 解除:
 *   - URL に ?va-disable=1 を付けて開く → 除外を有効化(スマホの Safari でも可)
 *   - URL に ?va-disable=0 を付けて開く → 除外を解除
 *   - DevTools のコンソール: localStorage.setItem("va-disable", "1") / localStorage.removeItem("va-disable")
 *
 * localStorage が使えない環境(プライベートブラウズの制限等)では例外を握りつぶし、通常どおり計測する。
 *
 * 読み込み位置: GA4 の停止フラグは gtag() の呼び出しより前に立てる必要があるため、
 * このファイルは defer を付けずに GA タグ(gtag.js)より前で読み込む。
 * Vercel の /_vercel/insights/script.js(defer)より前であること。
 */
(function () {
  "use strict";
  var KEY = "va-disable";
  var GA_IDS = ["G-06EHKG0SQ2"];

  // Vercel Analytics のキュー(script.js の読み込み前に積んだ設定は読み込み後に反映される)
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };

  function stored() {
    try { return !!window.localStorage.getItem(KEY); } catch (e) { return false; }
  }

  // ?va-disable=1 / 0 の切り替え
  var param = null, toggled = null;
  try {
    var params = new URLSearchParams(location.search);
    if (params.has(KEY)) {
      var v = params.get(KEY);
      param = (v === "0" || v === "false") ? "off" : "on";
      try {
        if (param === "off") window.localStorage.removeItem(KEY); else window.localStorage.setItem(KEY, "1");
        toggled = param;
      } catch (e) { /* 保存できなければこのページだけ param に従う */ }
      // アドレスバーから va-disable だけを消す(utm_* など他のパラメータは残す)
      params.delete(KEY);
      var qs = params.toString();
      history.replaceState(history.state, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
    }
  } catch (e) { /* URLSearchParams や history が使えなければ切り替えなし(計測は通常どおり) */ }

  function disabled() { return param ? param === "on" : stored(); }

  // GA4: 停止フラグ(gtag.js が送信時に参照する)
  if (disabled()) GA_IDS.forEach(function (id) { window["ga-disable-" + id] = true; });

  // Vercel Analytics: 送信直前のフック
  window.va("beforeSend", function (event) {
    if (disabled()) return null;
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
