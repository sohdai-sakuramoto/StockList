/*
 * 証券口座アフィリエイト リンク一元管理
 * ─────────────────────────────────────────────
 * ASP(A8.net / アクセストレード)の審査が通ったら、下の各 url に
 * 発行された「アフィリエイトリンク(遷移先URL)」を貼るだけで全ページに反映されます。
 *
 *   url      : ASPが発行するリンク先URL(例: "https://px.a8.net/svt/ejp?a8mat=...")
 *   official : 未提携の間だけ使う公式サイトURL(アフィリではない通常リンク)
 *   hidden   : true でカード・診断結果を非表示(却下・保留の会社。承認が取れたら外すだけで復活)
 *   asp      : 参考メモ("a8" / "accesstrade" 等)
 *
 * 表示ロジック:
 *   url あり           → アフィリエイトリンク(rel="sponsored nofollow" + GA affiliate_click)
 *   url無し・official有 → 公式サイトへの通常リンク(rel="nofollow" + GA official_click)
 *   url も official も無 → 「準備中」(クリック無効)
 *   hidden:true        → そのカード自体を非表示
 */
window.SL_AFFILIATE = {
  // 表示順(比較ページのカードの並び)
  order: ["sbi", "rakuten", "monex", "matsui", "esmart", "moomoo", "dmm"],
  brokers: {
    sbi:     { url: "", official: "https://www.sbisec.co.jp/", asp: "" },
    rakuten: { url: "", official: "https://www.rakuten-sec.co.jp/", asp: "" },
    monex:   { url: "https://h.accesstrade.net/sp/cc?rk=0100pe6z00ovhd", asp: "accesstrade" },
    matsui:  { url: "https://h.accesstrade.net/sp/cc?rk=01000t2900ovhd", asp: "accesstrade" },
    esmart:  { url: "", hidden: true, asp: "" }, // アクセストレード却下のため一旦非表示。承認が取れたら hidden を外す
    moomoo:  { url: "", official: "https://www.moomoo.com/jp", asp: "" },
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

  function gaEvent(name, id) {
    if (typeof window.gtag === "function") window.gtag("event", name, { broker: id, page: location.pathname });
  }

  function wire() {
    var links = document.querySelectorAll("a[data-aff]");
    Array.prototype.forEach.call(links, function (a) {
      var id = a.getAttribute("data-aff");
      var b = (CFG.brokers || {})[id] || {};

      // 非表示指定: カード/診断結果ごと隠す(hidden を外すだけで復活)
      if (b.hidden) {
        var box = a.closest(".card, .diag-result");
        if (box) box.style.display = "none";
        return;
      }

      var url = b.url ? String(b.url).trim() : "";
      var official = b.official ? String(b.official).trim() : "";
      if (url) {
        // アフィリエイト提携済み
        a.setAttribute("href", url);
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "sponsored noopener nofollow");
        a.classList.remove("is-pending");
        a.addEventListener("click", function () { gaEvent("affiliate_click", id); });
      } else if (official) {
        // 未提携: 公式サイトへの通常リンク(アフィリではないので sponsored は付けない)
        a.setAttribute("href", official);
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener nofollow");
        a.classList.remove("is-pending");
        a.addEventListener("click", function () { gaEvent("official_click", id); });
      } else {
        // url も official も無い: 準備中(クリック無効)
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
