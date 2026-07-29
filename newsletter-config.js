/*
 * メルマガ登録 一元管理(証券アフィリの affiliate-config.js と同じ発想)
 * ─────────────────────────────────────────────
 * メール配信サービス(Buttondown / MailerLite 等)の「埋め込みフォーム」の
 * 送信先URLを下の action に貼るだけで、全ページの登録フォームが有効化されます。
 *
 *   action     : ESPのフォーム送信先URL(例 Buttondown: "https://buttondown.com/api/emails/embed-subscribe/<ユーザー名>")
 *   emailField : メール入力の name 属性(既定 "email")
 *   hidden     : 追加の隠しフィールド {name: value}(ESPの埋め込みコードに合わせる。無ければ {})
 *
 * action が空の間、登録フォームは「非表示(hidden)」のまま。実URLを入れると自動で表示され、
 * 送信は隠しiframe経由でページ遷移なし・インラインで完了表示 + GA計測(newsletter_signup)。
 * ※ ダブルオプトイン(確認メール)はESM側の設定に従います。
 */
window.SL_NEWSLETTER = {
  provider: "",        // 参考メモ("buttondown" 等)
  action: "",          // ← ここにESPのフォーム送信先URLを貼ると有効化
  emailField: "email",
  hidden: {},
};

(function () {
  "use strict";
  var CFG = window.SL_NEWSLETTER || {};
  var action = CFG.action ? String(CFG.action).trim() : "";

  function ensureSink() {
    if (document.getElementById("sl-nl-sink")) return;
    var ifr = document.createElement("iframe");
    ifr.name = "sl-nl-sink"; ifr.id = "sl-nl-sink"; ifr.title = "newsletter";
    ifr.style.display = "none";
    document.body.appendChild(ifr);
  }

  function wireForm(form) {
    var input = form.querySelector('input[type="email"], input[name]');
    var msg = form.querySelector("[data-nl-msg]");
    if (input) input.name = CFG.emailField || "email";
    form.setAttribute("action", action);
    form.setAttribute("method", "post");
    form.setAttribute("target", "sl-nl-sink"); // 隠しiframeへPOST=ページ遷移しない
    Object.keys(CFG.hidden || {}).forEach(function (k) {
      if (form.querySelector('input[name="' + k + '"]')) return;
      var h = document.createElement("input");
      h.type = "hidden"; h.name = k; h.value = CFG.hidden[k];
      form.appendChild(h);
    });
    ensureSink();
    form.addEventListener("submit", function () {
      // required による空送信は submit 前にブラウザが弾く
      setTimeout(function () {
        if (msg) { msg.textContent = "登録ありがとうございます。確認メールをご確認ください。"; msg.style.display = "block"; }
        if (input) input.value = "";
        if (typeof window.gtag === "function") window.gtag("event", "newsletter_signup", { page: location.pathname });
      }, 80);
    });
  }

  function wire() {
    // action 未設定の間はブロックを非表示のまま(壊れたフォームを見せない)
    if (!action) return;
    var blocks = document.querySelectorAll("[data-newsletter-block]");
    Array.prototype.forEach.call(blocks, function (block) {
      block.hidden = false;
      var form = block.querySelector("form[data-newsletter]");
      if (form) wireForm(form);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
