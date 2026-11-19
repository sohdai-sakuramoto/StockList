/*
 * トップページ(index.html)の本文「ハブ」を静的HTMLで生成する。
 *
 * index.html の <!-- home-hub --> 〜 <!-- /home-hub --> の間を書き換える。
 * build_event_pages.mjs の実行時(平日18時の自動更新を含む)に一緒に更新されるので、
 * いまの日経平均株価・ランキング・出来事カードは常に最新のデータと一致する。
 *
 * 入力(すべて既存データ。手書きの数値は置かない):
 *   state   : state.json(終値・直近高値からの下落率・モード)
 *   daily   : History/events/features/daily-drops.json(1日の下落率ランキング・出典つき)
 *   events  : events/summary.json と同じ形の配列(出来事の下落率・回復期間)
 *   slugOf  : events.json の id → slug
 */
import fs from "node:fs";
import path from "node:path";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const jaDate = (d) => { const [y, m, dd] = d.split("-"); return `${y}年${Number(m)}月${Number(dd)}日`; };
const yen = (v) => Math.round(v).toLocaleString("ja-JP");
const signedPct = (x, digits) => `${x < 0 ? "−" : x > 0 ? "+" : ""}${Math.abs(x * 100).toFixed(digits)}%`;

function eventCard(e) {
  return `<a class="hub-ev" href="${esc(e.url)}"><span class="t">${esc(e.title)}</span><span class="y">${e.date.slice(0, 4)}年・${esc(e.category)}</span><span class="p">${esc(e.drawdown_label)}</span><span class="c">高値回復まで ${esc(e.recover_label)}</span></a>`;
}

export function homeHubHtml({ state, daily, events, slugOf }) {
  const n = events.length;
  const firstYear = Math.min(...events.map((e) => Number(e.date.slice(0, 4))));
  const m = (state && state.metrics) || {};
  const alert = state && (state.mode === "crash" || state.mode === "caution");

  const nowHtml = m.close != null && m.drawdown != null ? `
    <section class="hub-now" aria-label="いまの日経平均株価">
      <div class="hub-now-grid">
        <div><p class="k">日経平均株価（${jaDate(state.as_of)}終値）</p><p class="v">${yen(m.close)}<small>円</small></p></div>
        <div><p class="k">直近高値${m.peak_date ? `（${jaDate(m.peak_date)}）` : ""}から</p><p class="v${m.drawdown < 0 ? " neg" : ""}">${signedPct(m.drawdown, 2)}</p></div>
      </div>
      <a class="hub-btn${alert ? "" : " sub"}" href="/now">いまの下落を過去の暴落と比べる →</a>
      <p class="hub-note">※検証用データ（Stooq/FRED）に基づく参考値です。</p>
    </section>` : "";

  const r = daily && daily.by_rate;
  const rankHtml = r ? `
    <section class="hub-sec" aria-labelledby="hub-rank-h">
      <div class="hub-sec-h"><h2 id="hub-rank-h">1日の下落率ランキング</h2><a href="/crash-ranking">すべて見る →</a></div>
      <ol class="hub-rank">${r.items.slice(0, 5).map((it, i) => {
        const slug = it.event && slugOf[it.event];
        const date = jaDate(it.date);
        return `<li><span class="n">${i + 1}</span><span class="d">${slug ? `<a href="/events/${slug}">${date}</a>` : `<b>${date}</b>`}${it.label ? `<i>${esc(it.label)}</i>` : ""}</span><span class="p">${signedPct(it.pct / 100, 2)}</span></li>`;
      }).join("")}</ol>
      <p class="hub-note">出典：${esc(r.source)}</p>
    </section>` : "";

  const recent = [...events].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const deep = [...events].sort((a, b) => a.drawdown - b.drawdown).slice(0, 4);
  const decades = [...new Set(events.map((e) => Math.floor(Number(e.date.slice(0, 4)) / 10) * 10))].sort();

  return `<main class="hub">
  <div class="hub-wrap">
    <section class="hub-hero">
      <h1>日経平均株価の暴落・急騰を、<br>当時のニュースとともに振り返る</h1>
      <p class="lead">${firstYear}年からの${n}の出来事を、週次チャートと当時のニュースで記録しています。</p>
    </section>
${nowHtml}
${rankHtml}
    <section class="hub-sec" aria-labelledby="hub-recent-h">
      <div class="hub-sec-h"><h2 id="hub-recent-h">最近の出来事</h2><a href="/history">${n}件すべて →</a></div>
      <div class="hub-grid">${recent.map(eventCard).join("")}</div>
    </section>
    <section class="hub-sec" aria-labelledby="hub-deep-h">
      <div class="hub-sec-h"><h2 id="hub-deep-h">下落率が大きかった出来事</h2><a href="/crash-ranking#h-dd">ランキングへ →</a></div>
      <div class="hub-grid">${deep.map(eventCard).join("")}</div>
    </section>
    <section class="hub-sec" aria-labelledby="hub-tl-h">
      <div class="hub-sec-h"><h2 id="hub-tl-h">年表で見る</h2><a href="/timeline">年表へ →</a></div>
      <div class="hub-box">
        <p>1945年から現在まで、日本株の暴落・暴騰・転換点を時系列でたどれます。</p>
        <div class="hub-chips">${decades.map((d) => `<a href="/timeline#d${d}">${d}年代</a>`).join("")}</div>
      </div>
    </section>
    <section class="hub-sec">
      <div class="hub-box hub-cta">
        <h2>暴落に備える第一歩</h2>
        <p>歴史的に、暴落はいつか回復してきました。長期・積立の第一歩は口座づくりから。</p>
        <a class="hub-btn" href="/start">はじめての証券口座を見る →</a>
      </div>
    </section>
  </div>
</main>`;
}

const MARK = /<!-- home-hub -->[\s\S]*?<!-- \/home-hub -->/;

/** index.html のハブ部分を書き換える。変更があれば true */
export function injectHomeHub(root, data) {
  const f = path.join(root, "index.html");
  const html = fs.readFileSync(f, "utf8");
  if (!MARK.test(html)) throw new Error("index.html: <!-- home-hub --> マーカーがありません");
  const next = html.replace(MARK, `<!-- home-hub -->\n${homeHubHtml(data)}\n<!-- /home-hub -->`);
  if (next === html) return false;
  fs.writeFileSync(f, next);
  return true;
}
