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
  order: ["sbi", "rakuten", "monex", "matsui", "esmart", "moomoo", "dmm"],
  brokers: {
    sbi:     { url: "", asp: "" },
    rakuten: { url: "", asp: "" },
    monex:   { url: "https://h.accesstrade.net/sp/cc?rk=0100pe6z00ovhd", asp: "accesstrade" },
    matsui:  { url: "https://h.accesstrade.net/sp/cc?rk=01000t2900ovhd", asp: "accesstrade" },
    esmart:  { url: "", asp: "" },
    moomoo:  { url: "", asp: "" },
    dmm:     { url: "https://h.accesstrade.net/sp/cc?rk=0100mjw300ovhd", asp: "accesstrade" },
  },
};

(function () {
  "use strict";
  var CFG = window.SL_AFFILIATE || { brokers: {} };

  // 提携が有効(遷移先URLが設定済み)か
  function isActive(id) {
    var b = (CFG.brokers || {})[id];
    return !!(b && b.url && String(b.url).trim());
  }

  // 比較カードを「有効(申込可能)なものが上」に並べ替える。
  // 各グループ内は元のHTML順を維持(stable)。承認が増えれば自動で上がる。
  function reorderCards() {
    var grid = document.getElementById("broker-cards");
    if (!grid) return;
    var cards = Array.prototype.slice.call(grid.querySelectorAll(".card"));
    var active = [], pending = [];
    cards.forEach(function (c) {
      var a = c.querySelector("a[data-aff]");
      (a && isActive(a.getAttribute("data-aff")) ? active : pending).push(c);
    });
    active.concat(pending).forEach(function (c) { grid.appendChild(c); });
  }

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
    reorderCards();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
