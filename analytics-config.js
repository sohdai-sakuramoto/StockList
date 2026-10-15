/*
 * アクセス解析の読み込みと、運営者自身のアクセスの除外(全ページ共通)
 * ─────────────────────────────────────────────
 * 計測IDは /site-config.js(Vercel の環境変数からビルド時に生成: window.SL_CONFIG)から読む。
 *
 * 除外判定(共通): localStorage に "va-disable" があるブラウザ、または ?va-disable=1 で開いたページ。
 *   判定は window.SL_ANALYTICS.isExcluded() で他のスクリプトからも参照できる。除外に該当する場合:
 *   - Vercel Web Analytics … beforeSend で null を返し送信しない
 *   - GA4(Google アナリティクス) … gtag.js 自体を読み込まない
 *   - X ウェブサイトタグ(リターゲティング用) … ベースコード・イベントコードとも読み込まない
 *
 * 有効化 / 解除:
 *   - URL に ?va-disable=1 を付けて開く → 除外を有効化(スマホの Safari でも可)
 *   - URL に ?va-disable=0 を付けて開く → 除外を解除
 *   - DevTools のコンソール: localStorage.setItem("va-disable", "1") / localStorage.removeItem("va-disable")
 *
 * localStorage が使えない環境(プライベートブラウズの制限等)では例外を握りつぶし、通常どおり計測する。
 *
 * 読み込み: <script defer src="/site-config.js"> → <script defer src="/analytics-config.js"> →
 *           <script defer src="/_vercel/insights/script.js"> の順(defer は記述順に実行される)。
 * ページ遷移はすべて通常の画面読み込み(クライアントサイドルーティング無し)のため、
 * GA4 のページビューは各ページの config 送信で記録される。UTM パラメータは page_location に含まれる。
 */
(function () {
  "use strict";
  var KEY = "va-disable";
  var CFG = window.SL_CONFIG || {};

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

  // 除外判定(共通ロジック)
  function isExcluded() { return param ? param === "on" : stored(); }
  window.SL_ANALYTICS = { isExcluded: isExcluded, config: CFG };

  // Vercel Analytics: 送信直前のフック
  window.va("beforeSend", function (event) {
    if (isExcluded()) return null;
    // 念のため送信URLからも va-disable パラメータを除く
    try {
      var u = new URL(event.url);
      if (u.searchParams.has(KEY)) { u.searchParams.delete(KEY); event.url = u.toString(); }
    } catch (e) { /* URLが解釈できなければそのまま送る */ }
    return event;
  });

  // GA4: 除外対象でなく、測定IDが設定されている時だけ gtag.js を読み込む
  if (!isExcluded() && CFG.gaId) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", CFG.gaId);   // page_view を自動送信(page_location に UTM を含む)
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(CFG.gaId);
    document.head.appendChild(s);
  }

  // X ウェブサイトタグ: ページの表示に影響しないよう、load 後の空き時間に読み込む。
  // ベースコード(uwt.js)の読み込み完了後に、ページビュー毎のイベントコードを送る。
  // (ページ遷移はすべて通常の画面読み込みのため、1ページの読み込み=1ページビュー)
  if (!isExcluded() && CFG.xPixelId) {
    var loadX = function () {
      if (isExcluded()) return;
      var twq = window.twq = window.twq || function () { twq.exe ? twq.exe.apply(twq, arguments) : twq.queue.push(arguments); };
      twq.version = "1.1"; twq.queue = twq.queue || [];
      var x = document.createElement("script");
      x.async = true;
      x.src = "https://static.ads-twitter.com/uwt.js";
      if (CFG.xEventId) x.onload = function () { window.twq("event", CFG.xEventId, {}); };
      document.head.appendChild(x);
      window.twq("config", CFG.xPixelId);
    };
    var idle = function () { (window.requestIdleCallback || function (f) { setTimeout(f, 1); })(loadX, { timeout: 3000 }); };
    if (document.readyState === "complete") idle(); else window.addEventListener("load", idle, { once: true });
  }

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
