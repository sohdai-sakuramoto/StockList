/*
 * 証券口座アフィリエイト リンク一元管理
 * ─────────────────────────────────────────────
 * ASP(A8.net / アクセストレード)の審査が通ったら、下の各 url に
 * 発行された「アフィリエイトリンク(遷移先URL)」を貼るだけで全ページに反映されます。
 *
 *   url : ASPが発行するリンク先URL(例: "https://px.a8.net/svt/ejp?a8mat=...")
 *   asp : 参考メモ("a8" / "accesstrade" 等)
 *
 * url が空文字の間は、ボタンは自動的に「準備中」表示(クリック無効)になります。
 * 実リンクを入れると自動でクリック可能 + rel="sponsored nofollow" + GA計測が付きます。
 */
window.SL_AFFILIATE = {
  // 表示順(比較ページのカードの並び)
  order: ["sbi", "rakuten", "monex", "matsui", "esmart", "moomoo"],
  brokers: {
    sbi:     { url: "", asp: "" },
    rakuten: { url: "", asp: "" },
    monex:   { url: "", asp: "" },
    matsui:  { url: "https://px.a8.net/svt/ejp?a8mat=4B7WD5+1WGVCI+3XCC+6DRLT", asp: "a8" },
    esmart:  { url: "", asp: "" },
    moomoo:  { url: "", asp: "" },
  },
};

(function () {
  "use strict";
  var CFG = window.SL_AFFILIATE || { brokers: {} };
  function wire() {
    var links = document.querySelectorAll("a[data-aff]");
    Array.prototype.forEach.call(links, function (a) {
      var id = a.getAttribute("data-aff");
      var b = (CFG.brokers || {})[id];
      var url = b && b.url ? String(b.url).trim() : "";
      if (url) {
        a.setAttribute("href", url);
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "sponsored noopener nofollow");
        a.classList.remove("is-pending");
        a.addEventListener("click", function () {
          if (typeof window.gtag === "function") {
            window.gtag("event", "affiliate_click", { broker: id, page: location.pathname });
          }
        });
      } else {
        // 未設定: 準備中表示・クリック無効
        a.classList.add("is-pending");
        a.setAttribute("aria-disabled", "true");
        if (!a.dataset.label) a.dataset.label = a.textContent;
        a.textContent = "準備中";
        a.addEventListener("click", function (e) { e.preventDefault(); });
      }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
