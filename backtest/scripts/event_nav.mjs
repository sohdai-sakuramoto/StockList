/**
 * イベントページの回遊導線(比較ブロック・次に読む)。
 * 選定ルールは History/events/navigation.json、数値は各イベントの結論データ(conclusion)から取る。
 *
 *  ev(イベント1件の要約): { id, slug, title, date, drawdown, recover_label }
 *    build_event_pages.mjs が events.json と <id>.json の conclusion から組み立てる。
 *    conclusion の無いイベントは渡さない(推測で埋めない)。
 */

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const jaDate = (d) => { const [y, m, dd] = d.split("-"); return `${y}年${Number(m)}月${Number(dd)}日`; };
const ddPct = (dd) => `${dd < 0 ? "−" : ""}${Math.abs(Math.round(dd * 100))}%`;

/** 比較ブロックの行: 既定セット(またはイベント個別の compare)+いま見ているイベント。深い順。 */
export function selectCompare(currentId, events, nav, override) {
  const byId = new Map(events.map((e) => [e.id, e]));
  const max = (nav.compare && nav.compare.max) || 6;
  const ids = [...(override || (nav.compare && nav.compare.default) || [])].filter((id) => byId.has(id)).slice(0, max);
  if (byId.has(currentId) && !ids.includes(currentId)) {
    // 上限を超える場合は、いま見ているイベントと下落率が最も近い既定イベントと入れ替える
    if (ids.length >= max) {
      const cur = byId.get(currentId);
      let k = 0;
      ids.forEach((id, i) => { if (Math.abs(byId.get(id).drawdown - cur.drawdown) < Math.abs(byId.get(ids[k]).drawdown - cur.drawdown)) k = i; });
      ids.splice(k, 1);
    }
    ids.push(currentId);
  }
  return ids.map((id) => byId.get(id)).sort((a, b) => a.drawdown - b.drawdown || (a.date < b.date ? -1 : 1));
}

/** 次に読む: featured から featuredSlots 件 + 下落率が近いイベント similarSlots 件(イベント個別の related が優先) */
export function selectRelated(currentId, events, nav, override) {
  const byId = new Map(events.map((e) => [e.id, e]));
  const cur = byId.get(currentId);
  if (override && override.length) return override.filter((id) => id !== currentId && byId.has(id)).map((id) => ({ ev: byId.get(id), why: "あわせて読みたい" }));
  const n = nav.next || {};
  const picked = [];
  for (const id of n.featured || []) {
    if (picked.length >= (n.featuredSlots ?? 2)) break;
    if (id !== currentId && byId.has(id)) picked.push({ ev: byId.get(id), why: "記憶に新しい暴落" });
  }
  if (cur) {
    const used = new Set([currentId, ...picked.map((p) => p.ev.id), ...(n.featured || [])]);
    const rest = events.filter((e) => !used.has(e.id))
      .sort((a, b) => Math.abs(a.drawdown - cur.drawdown) - Math.abs(b.drawdown - cur.drawdown) || (a.date > b.date ? -1 : 1));
    for (const e of rest.slice(0, n.similarSlots ?? 1)) picked.push({ ev: e, why: "下落率が近い暴落" });
  }
  return picked;
}

/** 比較ブロック(本文中盤)。横棒の長さ=最大下落率(表示中の行の最大値を100%とする共通スケール) */
export function compareHtml(currentId, rows) {
  if (rows.length < 2) return "";
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.drawdown)));
  const li = rows.map((r) => {
    const cur = r.id === currentId;
    const w = (Math.abs(r.drawdown) / maxAbs * 100).toFixed(1);
    return `<li><a class="slv-cmp-row${cur ? " is-current" : ""}" href="/events/${esc(r.slug)}"${cur ? ' aria-current="page"' : ""}>
          <span class="nm">${esc(r.title)}<small>${esc(r.date.slice(0, 4))}年</small>${cur ? '<span class="tag">このページ</span>' : ""}</span>
          <span class="bar" aria-hidden="true"><span style="width:${w}%"></span></span>
          <span class="pct">${ddPct(r.drawdown)}</span>
          <span class="rec">回復 ${esc(r.recover_label)}</span>
        </a></li>`;
  }).join("\n        ");
  return `
    <section class="slv-cmp" aria-labelledby="slv-cmp-h">
      <h2 id="slv-cmp-h">この下落は、過去の暴落と比べてどれくらい大きかった？</h2>
      <p class="slv-cmp-sub">日経平均の最大下落率（高値→底・終値）と、高値を回復するまでの期間</p>
      <ol class="slv-cmp-list">
        ${li}
      </ol>
    </section>`;
}

/** 次に読む(ページ末尾)+相場の歴史へのリンク */
export function nextReadHtml(related, totalEvents) {
  if (!related.length) return "";
  const cards = related.map(({ ev, why }) => `<a class="slv-next-card" href="/events/${esc(ev.slug)}">
          <span class="why">${esc(why)}</span>
          <span class="t">${esc(ev.title)}</span>
          <span class="meta"><time datetime="${esc(ev.date)}">${jaDate(ev.date)}</time><span class="dd">${ddPct(ev.drawdown)}</span></span>
        </a>`).join("\n        ");
  return `
    <section class="slv-next" aria-labelledby="slv-next-h">
      <h2 id="slv-next-h">次に読む</h2>
      <div class="slv-next-grid">
        ${cards}
      </div>
      <a class="slv-next-all" href="/history">相場の歴史をすべて見る（全${totalEvents}件）<span aria-hidden="true">→</span></a>
    </section>`;
}

// X のロゴ(公式ウィジェットは使わず、インラインSVGのみ。外部スクリプトなし)
const X_LOGO = '<svg class="x-ic" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';

// 読点の後で区切った語句を inline-block にし、語句の途中(「X」と「で」の間など)で改行しないようにする
const phrases = (t) => String(t || "").split(/(?<=、)/).map((p) => `<span class="ph">${esc(p)}</span>`).join("");

/** Xフォロー導線(次に読むの直後)。navigation.json の follow から生成 */
export function followHtml(follow, cls = "slv-follow") {
  if (!follow || !follow.handle) return "";
  const url = `https://x.com/${encodeURIComponent(follow.handle)}`;
  return `
    <aside class="${cls}" aria-label="StockList の X アカウント">
      ${X_LOGO}
      <div class="txt"><p class="lead">${phrases(follow.lead)}</p><p class="sub">@${esc(follow.handle)}</p></div>
      <a class="btn" href="${url}" target="_blank" rel="noopener">${esc(follow.button || "フォローする")}</a>
    </aside>`;
}
