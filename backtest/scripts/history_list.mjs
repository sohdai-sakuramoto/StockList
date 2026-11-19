/*
 * 「出来事一覧」(/history)の本文を静的HTMLで生成する。
 *
 * history.html の <!-- history-list --> 〜 <!-- /history-list --> の間を書き換える。
 * build_event_pages.mjs の実行時に一緒に更新されるので、件数・下落率・回復期間は
 * 常に events/summary.json と同じデータになる(手書きの数値は置かない)。
 *
 * - 並べ替え・絞り込みは JS が動く環境だけで出す。JSなしでも全件が下落率の深い順で読める。
 * - 「一覧で見る／年表で見る」の切り替え(viewToggleHtml)は /timeline でも使う。
 */
import fs from "node:fs";
import path from "node:path";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** 一覧と年表の切り替え(同じ場所に置く)。active は "list" | "timeline" */
export function viewToggleHtml(active) {
  const a = (key, href, label) => key === active
    ? `<a href="${href}" aria-current="page">${label}</a>`
    : `<a href="${href}">${label}</a>`;
  return `<nav class="vw-toggle" aria-label="表示の切り替え">${a("list", "/history", "一覧で見る")}${a("timeline", "/timeline", "年表で見る")}</nav>`;
}

/** 一覧と年表で共通の切り替えボタンのスタイル(各ページの <style> に入れる) */
export const VIEW_TOGGLE_CSS = `.vw-toggle{display:flex;gap:3px;background:color-mix(in srgb,var(--muted) 18%,var(--plane));border-radius:12px;padding:4px;margin:0 0 18px;max-width:420px;}
    .vw-toggle a{flex:1;text-align:center;font-size:14px;font-weight:800;color:var(--ink-2);padding:9px 4px;border-radius:9px;text-decoration:none;}
    .vw-toggle a:hover{color:var(--ink);text-decoration:none;}
    .vw-toggle a[aria-current="page"]{background:var(--surface);color:var(--ink);box-shadow:0 1px 3px rgba(16,32,46,.14);}`;

const SORTS = [
  ["dd", "下落率が大きい順"],
  ["new", "新しい順"],
  ["old", "古い順"],
  ["rec", "回復が早い順"],
];

export function historyListHtml({ events }) {
  const rows = [...events].sort((a, b) => a.drawdown - b.drawdown);
  const n = rows.length;
  const years = rows.map((e) => Number(e.date.slice(0, 4)));
  const y0 = Math.min(...years), y1 = Math.max(...years);
  // 絞り込みのカテゴリ: 件数の多い順(同数は初出の古い順)
  const cats = new Map();
  for (const e of [...rows].sort((a, b) => a.date.localeCompare(b.date))) if (e.category) cats.set(e.category, (cats.get(e.category) || 0) + 1);
  const catList = [...cats.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);

  const li = rows.map((e) => {
    const rec = e.recovered ? `回復 ${esc(e.recover_label)}` : "未回復";
    return `
        <li data-cat="${esc(e.category)}" data-date="${esc(e.date)}" data-dd="${e.drawdown}" data-rec="${e.recovered ? e.months_to_recover : 99999}"><a href="${esc(e.url)}">
          <span class="hl-main"><b>${esc(e.title)}</b><small>${e.date.slice(0, 4)}年・${esc(e.category)}</small></span>
          <span class="hl-rec">${rec}</span>
          <span class="hl-dd">${esc(e.drawdown_label)}</span>
        </a></li>`;
  }).join("");

  return `<main class="wrap">
    <div class="pg-head">
      <h1>日経平均が大きく下げた出来事一覧（${n}件）</h1>
      <p>${y0}年から${y1}年までに日経平均株価が大きく下げた${n}の出来事を、高値からの最大下落率と、下落前の高値を回復するまでの期間で比べられます。出来事を選ぶと、週次チャートと当時のニュースを見られます。</p>
    </div>
    ${viewToggleHtml("list")}
    <div class="hl-controls" hidden>
      <div class="hl-chips" role="group" aria-label="種類で絞り込む"><button type="button" data-cat="" aria-pressed="true">すべて</button>${catList.map((c) => `<button type="button" data-cat="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join("")}</div>
      <div class="hl-sort" role="group" aria-label="並べ替え"><span>並べ替え：</span>${SORTS.map(([k, l], i) => `<button type="button" data-sort="${k}" aria-pressed="${i === 0}">${l}</button>`).join("")}</div>
    </div>
    <ol class="hl-list" id="hl-list">${li}
    </ol>
    <p class="hl-empty" hidden>該当する出来事はありません。</p>
    <p class="hl-rel">あわせて見る：<a href="/crash-ranking">暴落ランキング（1日の下落率・回復の早さ）</a>　<a href="/war-and-stocks">特集「戦争と株価」</a></p>
    <p class="foot-note">
      下落率は高値から底値までの終値ベース、回復は下落前の高値を終値で上回るまでの期間です。株価データは検証用（Stooq/FRED）に基づく参考値です。
      <a href="/disclosure">免責事項</a>
    </p>
    <nav class="sl-legal" aria-label="規約・ポリシー"><a href="/privacy">プライバシーポリシー</a><a href="/privacy#external-transmission">外部送信について</a><a href="/disclosure">アフィリエイト表記・免責事項</a></nav>
  </main>
  <script>
  (function () {
    var box = document.querySelector(".hl-controls"), list = document.getElementById("hl-list");
    if (!box || !list) return;
    box.hidden = false; // JSが動く環境でだけ絞り込み・並べ替えを出す
    var items = [].slice.call(list.children), cat = "", sort = "dd";
    var key = {
      dd: function (a, b) { return a.dataset.dd - b.dataset.dd; },
      "new": function (a, b) { return a.dataset.date < b.dataset.date ? 1 : -1; },
      old: function (a, b) { return a.dataset.date < b.dataset.date ? -1 : 1; },
      rec: function (a, b) { return (a.dataset.rec - b.dataset.rec) || (a.dataset.dd - b.dataset.dd); }
    };
    function apply() {
      items.sort(key[sort]).forEach(function (it) { list.appendChild(it); it.hidden = !!cat && it.dataset.cat !== cat; });
      document.querySelector(".hl-empty").hidden = items.some(function (it) { return !it.hidden; });
    }
    function group(sel, attr, set) {
      var btns = [].slice.call(box.querySelectorAll(sel + " button"));
      btns.forEach(function (b) {
        b.addEventListener("click", function () {
          btns.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
          set(b.getAttribute(attr)); apply();
        });
      });
    }
    group(".hl-chips", "data-cat", function (v) { cat = v; });
    group(".hl-sort", "data-sort", function (v) { sort = v; });
  })();
  </script>`;
}

const MARK = /<!-- history-list -->[\s\S]*?<!-- \/history-list -->/;

/** history.html の本文を書き換える。変更があれば true */
export function injectHistoryList(root, data) {
  const f = path.join(root, "history.html");
  const html = fs.readFileSync(f, "utf8");
  if (!MARK.test(html)) throw new Error("history.html: <!-- history-list --> マーカーがありません");
  const next = html.replace(MARK, `<!-- history-list -->\n  ${historyListHtml(data)}\n  <!-- /history-list -->`);
  if (next === html) return false;
  fs.writeFileSync(f, next);
  return true;
}
