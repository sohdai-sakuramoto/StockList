/**
 * 特集「戦争と株価：有名企業の20年」(/war-and-stocks) の静的HTML生成
 *
 * 入力:
 *   book : History/events/books/kabuka20.json (株価20年・東洋経済新報社。年別の高値・安値と資本異動)
 *   war  : History/events/features/war.json   (build_feature_data.mjs が日経平均の日次データから算出)
 * グラフはサーバー側でSVGを生成(JSなしでも読める・クローラブル)。ホバーのツールチップのみJS。
 * 色は単一系列(アクセント青)のみ。前身企業の期間などの区別は色ではなくラベルで示す。
 */
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const yen = (v) => Number(v).toLocaleString("ja-JP", { maximumFractionDigits: 1 });
const pct = (x, digits = 1) => `${x > 0 ? "+" : x < 0 ? "−" : "±"}${Math.abs(x * 100).toFixed(digits)}%`;
const ym = (d) => { const [y, m] = d.split("-"); return `${y}年${Number(m)}月`; };
const ymd = (d) => { const [y, m, dd] = d.split("-"); return `${y}年${Number(m)}月${Number(dd)}日`; };

const Y0 = 1938, Y1 = 1957, YEARS = Array.from({ length: Y1 - Y0 + 1 }, (_, i) => Y0 + i);
// 企業チャートの共通対数目盛(7.2円〜1,196円を収める)
const LOG_MIN = 5, LOG_MAX = 1500, LOG_TICKS = [10, 30, 100, 300, 1000];
// 時代区分(背景の帯)。年単位の棒に合わせて年の境界で区切る
const PHASES = [
  { from: 1938, to: 1945, label: "戦時中", shade: true },
  { from: 1946, to: 1948, label: "閉鎖期", shade: true },
  { from: 1949, to: 1957, label: "東証再開後", shade: false },
];

/** 企業1社分の小さな複数グラフ(年間の高値〜安値の範囲棒) */
function companyChart(c) {
  const W = 340, H = 196, ML = 34, MR = 8, MT = 22, MB = 30;
  const iw = W - ML - MR, ih = H - MT - MB, slot = iw / YEARS.length;
  const x = (y) => ML + (y - Y0 + 0.5) * slot;
  const ly = (v) => MT + (1 - (Math.log(v) - Math.log(LOG_MIN)) / (Math.log(LOG_MAX) - Math.log(LOG_MIN))) * ih;
  const capYears = new Set(c.capital.map((k) => Number(k.ym.slice(0, 4))));
  let s = "";
  for (const p of PHASES) {
    const x0 = ML + (p.from - Y0) * slot, x1 = ML + (p.to - Y0 + 1) * slot;
    if (p.shade) s += `<rect x="${x0.toFixed(1)}" y="${MT}" width="${(x1 - x0).toFixed(1)}" height="${ih}" fill="var(--band)"/>`;
    s += `<text x="${((x0 + x1) / 2).toFixed(1)}" y="${MT - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${p.label}</text>`;
  }
  for (const t of LOG_TICKS) {
    const yy = ly(t).toFixed(1);
    s += `<line x1="${ML}" x2="${W - MR}" y1="${yy}" y2="${yy}" stroke="var(--line)" stroke-width="1"/>`;
    s += `<text x="${ML - 5}" y="${(Number(yy) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--muted)" style="font-variant-numeric:tabular-nums">${t.toLocaleString("ja-JP")}</text>`;
  }
  for (const y of [1938, 1945, 1949, 1957]) s += `<text x="${x(y).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--muted)" style="font-variant-numeric:tabular-nums">${y}</text>`;
  if (c.predecessor) { // 前身企業の期間はラベル(色ではなく)で示す
    const x0 = ML + (Y0 - Y0) * slot + 2, x1 = ML + (c.predecessor.until - Y0 + 1) * slot - 2, yb = MT + ih + 4;
    s += `<path d="M${x0.toFixed(1)},${yb} v4 H${x1.toFixed(1)} v-4" fill="none" stroke="var(--muted)" stroke-width="1"/>`;
  }
  const bw = Math.min(9, slot * 0.55);
  for (const y of YEARS) {
    const v = c.annual[String(y)];
    const cap = capYears.has(y);
    if (v) {
      const yt = ly(v[0]), yb = Math.max(ly(v[1]), yt + 3); // 高値=安値の年も見えるよう最小3px
      s += `<rect x="${(x(y) - bw / 2).toFixed(1)}" y="${yt.toFixed(1)}" width="${bw.toFixed(1)}" height="${(yb - yt).toFixed(1)}" rx="3" fill="var(--series)"/>`;
    }
    if (cap) s += `<path d="M${x(y).toFixed(1)},${MT + ih + 6} l3.5,6 h-7 z" fill="var(--muted)"/>`;
    const pre = c.predecessor && y <= c.predecessor.until ? `（前身の${c.predecessor.name}）` : "";
    const tt = v ? `${y}年${pre}｜高値 ${yen(v[0])}円・安値 ${yen(v[1])}円${cap ? "｜増資あり" : ""}` : `${y}年｜記録なし${cap ? "｜増資あり" : ""}`;
    s += `<rect class="hit" x="${(x(y) - slot / 2).toFixed(1)}" y="${MT}" width="${slot.toFixed(1)}" height="${ih + 14}" fill="transparent" data-tt="${esc(tt)}"/>`;
  }
  const label = `${c.name}の年間の高値と安値（${Y0}〜${Y1}年、対数目盛）`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(label)}">${s}</svg>`;
}

/** 現代の戦争1件分の指数チャート(前営業日=100) */
function warChart(w, dom) {
  const W = 340, H = 170, ML = 30, MR = 44, MT = 14, MB = 24;
  const iw = W - ML - MR, ih = H - MT - MB;
  const t0 = w.series[0].t, t1 = w.series[w.series.length - 1].t;
  const x = (t) => ML + (t - t0) / Math.max(1, t1 - t0) * iw;
  const y = (v) => MT + (1 - (v - dom[0]) / (dom[1] - dom[0])) * ih;
  let s = "";
  for (const v of [90, 100, 110, 120]) {
    if (v < dom[0] || v > dom[1]) continue;
    s += `<line x1="${ML}" x2="${W - MR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--line)" stroke-width="${v === 100 ? 1.5 : 1}"/>`;
    s += `<text x="${ML - 5}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--muted)" style="font-variant-numeric:tabular-nums">${v}</text>`;
  }
  s += `<line x1="${x(0).toFixed(1)}" x2="${x(0).toFixed(1)}" y1="${MT}" y2="${MT + ih}" stroke="var(--muted)" stroke-width="1"/>`;
  s += `<text x="${(x(0) + 4).toFixed(1)}" y="${MT + 9}" font-size="10" fill="var(--muted)">前営業日=100</text>`;
  for (const [t, lb] of [[-10, "−10日"], [0, "0"], [30, "30日"], [60, "60日"]]) {
    if (t < t0 || t > t1) continue;
    s += `<text x="${x(t).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--muted)">${lb}</text>`;
  }
  const pts = w.series.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  s += `<polyline points="${pts}" fill="none" stroke="var(--series)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  // 選択的なラベル: 最安値と終点のみ
  const mn = w.series.reduce((a, p) => (p.t > 0 && p.v < a.v ? p : a), { v: Infinity });
  if (mn.v < 100) {
    s += `<circle cx="${x(mn.t).toFixed(1)}" cy="${y(mn.v).toFixed(1)}" r="4" fill="var(--series)" stroke="var(--surface)" stroke-width="2"/>`;
    s += `<text x="${x(mn.t).toFixed(1)}" y="${(y(mn.v) + 15).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--ink)">最安 ${pct(mn.v / 100 - 1)}</text>`;
  }
  const last = w.series[w.series.length - 1];
  s += `<circle cx="${x(last.t).toFixed(1)}" cy="${y(last.v).toFixed(1)}" r="4" fill="var(--series)" stroke="var(--surface)" stroke-width="2"/>`;
  s += `<text x="${(x(last.t) + 6).toFixed(1)}" y="${(y(last.v) + 3.5).toFixed(1)}" font-size="10.5" font-weight="700" fill="var(--ink)">${pct(last.v / 100 - 1)}</text>`;
  const data = esc(JSON.stringify(w.series.map((p) => [p.t, p.d, p.c, p.v])));
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(w.title)}前後の日経平均（前営業日=100）" data-series="${data}" data-geom="${[ML, MR, MT, MB, W, H, t0, t1, dom[0], dom[1]].join(",")}">${s}<line class="xh" y1="${MT}" y2="${MT + ih}" stroke="var(--ink-2)" stroke-width="1" style="display:none"/></svg>`;
}

export function warFeatureHtml({ book, war, siteUrl }) {
  const url = `${siteUrl}/war-and-stocks`;
  const title = "戦争と株価：有名企業の20年（1938〜1957）と現代の戦争｜StockList";
  const desc = "戦時中から敗戦、取引所の閉鎖、東証再開まで、トヨタ・東芝・日立など有名企業7社の株価を『株価20年』（東洋経済新報社）でたどる特集。ウクライナ侵攻やイラン攻撃など現代の戦争と日経平均の関係も実データで検証。";
  const ogImg = `${siteUrl}/IMG_3857.jpg`;
  const C = (id) => book.companies.find((c) => c.id === id);
  const order = ["toyota", "matsushita", "toshiba", "hitachi", "yawata", "toyobo", "tokiomarine"].map(C).filter(Boolean);

  // ── 敗戦をはさむ下落(1945年の高値→1946年の安値。45年が無い社は直近の記録年) ──
  const defeat = order.map((c) => {
    let fy = null; for (const y of [1945, 1944, 1943]) if (c.annual[String(y)]) { fy = y; break; }
    const lo = c.annual["1946"];
    if (!fy || !lo) return null;
    const hi = c.annual[String(fy)][0];
    return { c, fy, hi, lo: lo[1], ret: lo[1] / hi - 1 };
  }).filter(Boolean);
  const worstDefeat = defeat.reduce((a, d) => (d.ret < a.ret ? d : a));
  const big = defeat.filter((d) => d.ret <= -0.6);
  const bigRange = `${Math.round(-Math.max(...big.map((d) => d.ret)) * 10)}〜${Math.round(-Math.min(...big.map((d) => d.ret)) * 10)}割`;
  const defeatSummary = `${defeat.length}社中${big.length}社で株価が${bigRange}下落`;
  // ── 戦前(1938年)と1949年の名目株価の比較 ──
  const WPI_1949 = 208.8; // 卸売物価 1949年(1934〜36年平均=1)
  const nominal = order.map((c) => {
    const a = c.annual["1938"], b = c.annual["1949"];
    return a && b ? { c, a: a[0], b: b[0], mult: b[0] / a[0] } : null;
  }).filter(Boolean);
  const maxMult = Math.max(...nominal.map((n) => n.mult));

  // ── 現代の戦争 ──
  const wars = war ? war.wars : [];
  const vals = wars.flatMap((w) => w.series.map((p) => p.v));
  const dom = vals.length ? [Math.floor((Math.min(...vals) - 2) / 5) * 5, Math.ceil((Math.max(...vals) + 2) / 5) * 5] : [85, 125];
  const recovered = wars.filter((w) => w.recovered);
  const recDays = wars.filter((w) => w.worst.ret < 0 && w.recovered).map((w) => w.recovery.tdays);
  const maxRecDays = Math.max(0, ...recDays), minRecDays = recDays.length ? Math.min(...recDays) : 0;
  const up60 = wars.filter((w) => w.after60 && w.after60.ret > 0).length;
  const deepest = wars.reduce((a, w) => (!a || w.worst.ret < a.worst.ret ? w : a), null);

  const companyCards = order.map((c) => `
        <figure class="co-card">
          <figcaption><b>${esc(c.name)}</b><small>現 ${esc(c.now)}</small>${c.predecessor ? `<small class="pre">⎣ 〜${c.predecessor.until}年は前身の${esc(c.predecessor.name)}</small>` : ""}</figcaption>
          ${companyChart(c)}
        </figure>`).join("");

  const tableRows = YEARS.map((y) => `<tr><th scope="row">${y}</th>${order.map((c) => {
    const v = c.annual[String(y)];
    const cap = c.capital.some((k) => Number(k.ym.slice(0, 4)) === y);
    return `<td>${v ? `${yen(v[0])}〜${yen(v[1])}` : "—"}${cap ? " ▲" : ""}</td>`;
  }).join("")}</tr>`).join("");

  const warCards = wars.map((w) => `
        <figure class="war-card">
          <figcaption><b>${esc(w.title)}</b><small>${ymd(w.date)}・${esc(w.where)}</small></figcaption>
          ${warChart(w, dom)}
        </figure>`).join("");

  const warRows = wars.map((w) => `<tr>
          <th scope="row">${esc(w.title)}<small>${ymd(w.date)}</small></th>
          <td class="${w.d1.ret < 0 ? "neg" : "pos"}">${pct(w.d1.ret)}</td>
          <td class="${w.worst.ret < 0 ? "neg" : ""}">${w.worst.ret < 0 ? `${pct(w.worst.ret)}<small>${ym(w.worst.date)}</small>` : "下回らず"}</td>
          <td>${w.worst.ret >= 0 ? "—" : w.recovered ? `${w.recovery.tdays}営業日<small>${ym(w.recovery.date)}</small>` : "未回復"}</td>
          <td class="${w.after60 && w.after60.ret < 0 ? "neg" : "pos"}">${w.after60 ? pct(w.after60.ret) : "—"}</td>
        </tr>`).join("");

  const article = {
    "@context": "https://schema.org", "@type": "Article", headline: "戦争と株価：有名企業の20年と現代の戦争", description: desc,
    datePublished: "2026-10-11", dateModified: (war && war.as_of) || "2026-10-11", mainEntityOfPage: url, image: ogImg,
    author: { "@type": "Organization", name: "StockList" }, publisher: { "@type": "Organization", name: "StockList", url: `${siteUrl}/` },
  };
  const breadcrumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "ホーム", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name: "相場の歴史", item: `${siteUrl}/history` },
      { "@type": "ListItem", position: 3, name: "戦争と株価", item: url },
    ],
  };
  const src = book.source;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="StockList" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${ogImg}" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="stylesheet" href="/crash-mode.css" />
  <link rel="stylesheet" href="/newsletter.css" />
  <script src="/crash-mode.js" data-state="/state.json" defer></script>
  <script src="/newsletter-config.js" defer></script>
  <script type="application/ld+json">${JSON.stringify(article)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>
  <!-- Google Analytics -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-06EHKG0SQ2"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-06EHKG0SQ2');</script>
  <style>
    :root{ --navy:#1b2538; --navy-2:#243149; --red:#da3c41; --good:#1a7f4b; --ink:#16202e; --ink-2:#56606e; --muted:#8a929e;
      --line:#e7e9ee; --surface:#fff; --plane:#f4f6f9; --accent:#2f6fd0; --series:#2f6fd0; --band:#f1f3f7;
      --shadow:0 1px 2px rgba(16,32,46,.06), 0 8px 24px rgba(16,32,46,.07); }
    @media (prefers-color-scheme: dark){ :root{ --navy:#0f1626; --navy-2:#16203a; --red:#e0575c; --good:#35c07d; --ink:#e9edf4; --ink-2:#aab3c2;
      --muted:#7d8695; --line:#263042; --surface:#161d2b; --plane:#0e131d; --accent:#6ea3f0; --series:#5b93e8; --band:#1c2436;
      --shadow:0 1px 2px rgba(0,0,0,.3), 0 10px 30px rgba(0,0,0,.35); } }
    *{box-sizing:border-box;} [hidden]{display:none !important;}
    body{margin:0;background:var(--plane);color:var(--ink);line-height:1.8;
      font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic UI",system-ui,-apple-system,sans-serif;}
    a{color:var(--accent);text-decoration:none;} a:hover{text-decoration:underline;}
    .topbar{background:var(--navy);color:#fff;padding:12px 20px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;}
    .topbar a{color:#cdd7ea;font-weight:600;font-size:14px;} .topbar a:hover{color:#fff;text-decoration:none;}
    .hero{background:linear-gradient(135deg,var(--navy) 0%,var(--navy-2) 100%);color:#fff;padding:46px 20px 50px;text-align:center;position:relative;}
    .hero::after{content:"";position:absolute;left:0;right:0;bottom:0;height:4px;background:var(--red);}
    .hero .eyebrow{font-size:12px;letter-spacing:.22em;color:#9fb0cc;margin:0 0 10px;text-transform:uppercase;}
    .hero h1{font-size:clamp(24px,4.6vw,38px);margin:0 0 12px;font-weight:800;letter-spacing:-.01em;line-height:1.35;}
    .hero p{margin:0 auto;max-width:40em;color:#c7d1e2;font-size:15px;}
    .wrap{max-width:1040px;margin:0 auto;padding:28px 20px 72px;}
    section{margin:0 0 44px;}
    h2{font-size:21px;margin:0 0 6px;letter-spacing:-.01em;} h3{font-size:16px;margin:22px 0 4px;}
    .lead{color:var(--ink-2);font-size:15px;margin:0 0 16px;}
    .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:0 0 34px;}
    .tile{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px;}
    .tile .k{font-size:12.5px;color:var(--muted);} .tile .v{font-size:30px;font-weight:800;line-height:1.25;margin:2px 0;}
    .tile .n{font-size:12.5px;color:var(--ink-2);}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;}
    figure{margin:0;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 12px 6px;position:relative;box-shadow:var(--shadow);}
    figcaption{font-size:14px;margin:0 2px 2px;} figcaption small{display:block;color:var(--muted);font-size:11.5px;line-height:1.5;}
    figcaption small.pre{color:var(--ink-2);}
    .keys{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:12.5px;color:var(--ink-2);margin:10px 0 0;}
    .keys i{display:inline-block;vertical-align:-1px;margin-right:6px;}
    .k-bar{width:8px;height:14px;border-radius:3px;background:var(--series);}
    .k-band{width:14px;height:12px;background:var(--band);border:1px solid var(--line);}
    .k-tri{width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:7px solid var(--muted);}
    .note{color:var(--muted);font-size:12px;margin:10px 0 0;line-height:1.7;}
    .card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:12px 0 0;}
    .card p{margin:6px 0 0;color:var(--ink-2);font-size:14.5px;}
    .card .tag{display:inline-block;font-size:11.5px;font-weight:800;color:#fff;background:var(--navy);border-radius:999px;padding:1px 10px;margin-right:6px;}
    table{border-collapse:collapse;width:100%;font-size:13.5px;}
    .tbl{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:10px 0 0;background:var(--surface);border:1px solid var(--line);border-radius:12px;}
    th,td{border-bottom:1px solid var(--line);padding:8px 10px;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;}
    thead th{color:var(--muted);font-size:12px;font-weight:700;} tbody th{text-align:left;font-weight:700;}
    th small,td small{display:block;font-weight:400;font-size:11px;color:var(--muted);}
    td.neg{color:var(--red);font-weight:700;} td.pos{color:var(--good);font-weight:700;}
    details{margin:12px 0 0;} summary{cursor:pointer;font-weight:700;font-size:14px;color:var(--accent);}
    .tt{position:fixed;pointer-events:none;z-index:20;background:var(--navy);color:#fff;font-size:12.5px;line-height:1.5;border-radius:8px;padding:6px 10px;box-shadow:0 6px 18px rgba(0,0,0,.22);display:none;max-width:280px;}
    .tt b{font-size:14px;}
    .maxim{border-left:4px solid var(--accent);background:var(--surface);border-radius:0 12px 12px 0;padding:14px 18px;margin:0 0 16px;}
    .maxim b{font-size:17px;}
    .cta{background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--red);border-radius:12px;padding:18px 20px;margin:10px 0 0;}
    .cta b{font-size:15.5px;} .cta p{color:var(--ink-2);font-size:14px;margin:4px 0 12px;}
    .btn{display:inline-block;background:var(--red);color:#fff;font-weight:700;padding:11px 20px;border-radius:10px;} .btn:hover{text-decoration:none;filter:brightness(1.05);}
    .src{font-size:12.5px;color:var(--ink-2);padding-left:1.2em;} .src li{margin:3px 0;}
    .foot{color:var(--muted);font-size:12px;margin-top:30px;border-top:1px solid var(--line);padding-top:14px;}
    svg .hit{cursor:crosshair;} svg text{font-family:inherit;}
    @media (max-width:560px){ .tile .v{font-size:26px;} .grid{grid-template-columns:1fr;} }
  </style>
  <!-- Vercel Web Analytics -->
  <script defer src="/analytics-config.js"></script>
  <script defer src="/_vercel/insights/script.js"></script>
</head>
<body>
  <div class="topbar"><a href="/">← StockList トップ</a><a href="/history">相場の歴史</a><a href="/timeline">年表</a></div>
  <header class="hero">
    <p class="eyebrow">Special Feature · War and the Stock Market</p>
    <h1>戦争と株価<br>有名企業の20年と、現代の戦争</h1>
    <p>日経平均が生まれる前の戦時中から、敗戦、取引所の閉鎖、東証再開まで。トヨタや東芝など7社の株価を、当時の記録『${esc(src.title)}』（${esc(src.publisher || "")}）でたどります。後半では、ウクライナ侵攻やイラン攻撃など現代の戦争で日経平均がどう動いたかを、実データで検証します。</p>
  </header>
  <main class="wrap">
    <div class="tiles">
      <div class="tile"><div class="k">敗戦をはさんだ株価の下落（最大）</div><div class="v" style="color:var(--red)">${pct(worstDefeat.ret, 0)}</div><div class="n">${esc(worstDefeat.c.predecessor && worstDefeat.fy <= worstDefeat.c.predecessor.until ? worstDefeat.c.predecessor.name : worstDefeat.c.name)}：${worstDefeat.fy}年の高値→1946年の安値</div></div>
      <div class="tile"><div class="k">1949年の物価（戦前比・卸売物価）</div><div class="v">約${Math.round(WPI_1949)}倍</div><div class="n">1934〜36年平均を1とした水準</div></div>
      ${wars.length ? `<div class="tile"><div class="k">現代の戦争${wars.length}件のうち、3ヶ月後に上昇</div><div class="v" style="color:var(--good)">${up60}件</div><div class="n">日経平均・開戦前営業日との比較</div></div>` : ""}
    </div>

    <section aria-labelledby="s1">
      <h2 id="s1">有名企業7社の20年（1938〜1957年）</h2>
      <p class="lead">各年の棒は、その年の<b>最高値から最安値までの幅</b>です。値動きの大きさを比べやすいよう、縦軸は全社共通の対数目盛にしています。棒にカーソルを合わせる（タップする）と、数値が表示されます。</p>
      <div class="grid">${companyCards}
      </div>
      <p class="keys"><span><i class="k-bar"></i>年間の高値〜安値</span><span><i class="k-band"></i>戦時中・取引所の閉鎖期</span><span><i class="k-tri"></i>増資のあった年（その年の値幅には権利落ちの影響を含む）</span></p>
      <details><summary>表で見る（全データ）</summary>
        <div class="tbl"><table>
          <thead><tr><th scope="col">年</th>${order.map((c) => `<th scope="col">${esc(c.name)}</th>`).join("")}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table></div>
      </details>
      <p class="note">出典：『${esc(src.title)}』${esc(src.publisher || "")}（運営者による転記）。単位は円。年間の最高値〜最安値で、増資による株価の切り下がり（権利落ち）は調整していません。空白は記録のない年（1944〜45年は一部企業で記録なし、取引所の閉鎖期は取引所外の「集団取引」の価格）。当時の株価は額面や株式分割の違いから、現在の株価とは比べられません。</p>
    </section>

    <section aria-labelledby="s2">
      <h2 id="s2">4つの時代で読む</h2>
      <div class="card"><span class="tag">1938〜1945</span><b>戦時中：統制と買い支えで「動かない」株価</b>
        <p>政府は株価の急落を防ぐため、日本証券投資（1940年）、日本協同証券（1941年）を設け、1941年8月には株式価格統制令を公布しました。戦局が悪化した1944年以降は戦時金融金庫が無制限に株を買い支えています。グラフでも1942〜45年は値幅が小さく、たとえば日本製鐵（のちの八幡製鐵）の1943年は${yen(C("yawata").annual["1943"][1])}〜${yen(C("yawata").annual["1943"][0])}円にとどまりました。市場の自由な値付けが失われていた時代です。</p></div>
      <div class="card"><span class="tag">1945〜1946</span><b>敗戦：取引所は休会、${defeatSummary}</b>
        <p>1945年8月10日、全国の証券取引所は休会に入り、そのまま終戦を迎えました。GHQは取引所の再開を認めず、株式は取引所外の「集団取引」で売買されます。財閥解体、新円切替、戦時補償の打ち切りが重なり、株価は大きく崩れました。</p>
        <div class="tbl"><table>
          <thead><tr><th scope="col">企業</th><th scope="col">戦時中の高値</th><th scope="col">1946年の安値</th><th scope="col">下落率</th></tr></thead>
          <tbody>${defeat.map((d) => `<tr><th scope="row">${esc(d.c.predecessor && d.fy <= d.c.predecessor.until ? `${d.c.predecessor.name}（のち${d.c.name}）` : d.c.name)}</th><td>${yen(d.hi)}円<small>${d.fy}年${d.fy !== 1945 ? "（44〜45年は記録なし）" : ""}</small></td><td>${yen(d.lo)}円</td><td class="neg">${pct(d.ret, 0)}</td></tr>`).join("")}</tbody>
        </table></div></div>
      <div class="card"><span class="tag">1946〜1949</span><b>インフレ：名目では上がっても、実質は大暴落</b>
        <p>戦後の激しいインフレで、1949年の卸売物価は戦前（1934〜36年平均）の<b>約${Math.round(WPI_1949)}倍</b>になりました。株価も名目では戦前を上回りましたが、1938年と1949年の最高値を比べると、上昇は最大でも約${maxMult.toFixed(1)}倍（${esc(nominal.find((n) => n.mult === maxMult).c.name)}）。物価の上昇分を差し引くと、株の実質的な価値は戦前の数%程度まで目減りした計算になります。</p>
        <div class="tbl"><table>
          <thead><tr><th scope="col">企業</th><th scope="col">1938年の高値</th><th scope="col">1949年の高値</th><th scope="col">名目の倍率</th></tr></thead>
          <tbody>${nominal.map((n) => `<tr><th scope="row">${esc(n.c.predecessor ? `${n.c.predecessor.name}（のち${n.c.name}）` : n.c.name)}</th><td>${yen(n.a)}円</td><td>${yen(n.b)}円</td><td>${n.mult.toFixed(1)}倍</td></tr>`).join("")}<tr><th scope="row">参考：卸売物価</th><td>1934〜36年平均＝1</td><td>${WPI_1949}</td><td><b>約${Math.round(WPI_1949)}倍</b></td></tr></tbody>
        </table></div>
        <p class="note">※ 1949年の株価には1948〜49年の増資による切り下がりを含みます。物価の基準年（1934〜36年平均）と株価の比較年（1938年）は一致しないため、実質価値の目減りは概算です。</p></div>
      <div class="card"><span class="tag">1949〜1953</span><b>東証再開、ドッジ不況、そして朝鮮特需</b>
        <p>1949年5月16日に東京証券取引所が再開しましたが、緊縮政策「ドッジ・ライン」によるデフレ不況で株価は下落し、1950年7月6日に日経平均は史上最安値の85円25銭をつけました。その直前の6月25日に始まった朝鮮戦争の「特需」で日本経済は息を吹き返し、株価は大きく反転します。<a href="/events/dodge-recession">ドッジ不況のチャートと当時のニュース →</a></p></div>
    </section>

    ${wars.length ? `<section aria-labelledby="s3">
      <h2 id="s3">現代の戦争と株価：「遠くの戦争は買い」は本当か</h2>
      <div class="maxim"><b>「遠くの戦争は買い、近くの戦争は売り」</b><p class="lead" style="margin:6px 0 0">古くからの相場格言です。自国が戦場や当事者になる戦争は経済に深い傷を残す一方、遠い地域の戦争では株価の下落は一時的で、むしろ買い場になることが多かった、という経験則です。</p></div>
      <p class="lead">朝鮮戦争から2026年のイラン攻撃まで、${wars.length}つの出来事の前後で日経平均がどう動いたかを、開戦前の営業日を100として比べました（終値ベース、${war.as_of}時点のデータ）。</p>
      <div class="grid">${warCards}
      </div>
      <div class="tbl"><table>
        <thead><tr><th scope="col">出来事</th><th scope="col">反応した日</th><th scope="col">約3ヶ月内の最大下落</th><th scope="col">元の水準に戻るまで</th><th scope="col">60営業日後</th></tr></thead>
        <tbody>${warRows}</tbody>
      </table></div>
      <h3>データから見えること</h3>
      <div class="card"><b>① ${recovered.length === wars.length ? "どの戦争でも、株価は短期間で元に戻った" : "多くの戦争で、株価は短期間で元に戻った"}</b>
        <p>${wars.length}件のうち${recovered.length}件で、日経平均は開戦前の水準を回復しました。下落した場合でも、元に戻るまでは長くて${maxRecDays}営業日（約${Math.max(1, Math.round(maxRecDays / 21))}ヶ月）でした。60営業日後（約3ヶ月後）には${up60}件で開戦前を上回っています。敗戦で${defeatSummary}し、インフレで実質価値の大半を失った1945年とは、まったく異なる結果です。</p></div>
      ${deepest ? `<div class="card"><b>② 日本への影響は「距離」より「原油」で決まる</b>
        <p>最も下げが大きかったのは${esc(deepest.title)}（${ym(deepest.date)}）で、${pct(deepest.worst.ret)}まで下落しました。ホルムズ海峡をめぐる緊張で原油価格が急騰し、原油の多くを中東から輸入する日本経済への打撃が意識されたためです。ロシアのウクライナ侵攻でも、資源高やインフレへの懸念が重荷になりました。地理的に遠い戦争でも、エネルギーや物価を通じて日本株に影響が及ぶ点には注意が必要です。</p></div>` : ""}
      <div class="card"><b>③ 朝鮮戦争は「特需」で大相場の起点に</b>
        <p>朝鮮戦争の開戦直後、日経平均は史上最安値まで下げましたが、その後は米軍の特需で企業業績が急回復し、3ヶ月後には開戦前を2割上回りました。「遠くの戦争は買い」の典型例とされます。</p></div>
      <p class="note">※ 過去の値動きであり、将来の株価を保証するものではありません。戦争の影響は、規模・期間・エネルギー価格・金融政策などで大きく変わります。件数も限られるため、経験則として受け止めてください。本ページは教育・情報提供を目的としたもので、投資助言ではありません。</p>
    </section>` : ""}

    <section aria-labelledby="s4">
      <h2 id="s4">まとめ</h2>
      <p>自国が戦争に敗れた1945年前後には${defeatSummary}し、インフレによって実質的な価値の大半が失われました。一方、戦後の日本から見て「遠い」戦争では、株価の下落は一時的で、${minRecDays}営業日から${maxRecDays}営業日（約${Math.max(1, Math.round(maxRecDays / 21))}ヶ月）ほどで元の水準に戻っています。ただし、原油高のように日本経済に直接響く経路がある場合は、下落が深くなることもあります。歴史は、慌てて売るより、落ち着いて長い目で見ることの大切さを教えてくれます。</p>
      <aside class="cta">
        <b>暴落は、歴史的にはいつか戻ってきました。</b>
        <p>焦って売るより、次の下落に備えて少額から。長期・積立の第一歩は口座づくりから。</p>
        <a class="btn" href="/start/">はじめての証券口座を見る →</a>
      </aside>
      <section class="nl" data-newsletter-block hidden>
        <h2>急落モードの日に、一通だけ。</h2>
        <p class="nl-sub">相場が大きく動いた日に、過去の暴落との比較を1通だけお届けします。しつこい配信はしません。いつでも解除できます。</p>
        <form class="nl-form" data-newsletter novalidate>
          <input type="email" required placeholder="メールアドレス" autocomplete="email" aria-label="メールアドレス" />
          <button type="submit">登録する</button>
          <p class="nl-msg" data-nl-msg style="display:none"></p>
        </form>
        <p class="nl-fine">登録は無料・配信は必要なときだけ。<a href="/privacy/">プライバシーポリシー</a></p>
      </section>
    </section>

    <section aria-labelledby="s5">
      <h2 id="s5">出典・参考資料</h2>
      <ul class="src">
        <li>『${esc(src.title)}』${esc(src.publisher || "")}（企業別の年別相場・資本異動。運営者による転記）</li>
        <li>日経平均：FRED「Nikkei Stock Average, Nikkei 225」（現代の戦争の検証に使用）</li>
        <li><a href="https://www.jsri.or.jp/publish/research/pdf/109/109_05.pdf" target="_blank" rel="noopener">平山賢一「戦時末期の株式投資成果」証券経済研究 第109号（日本証券経済研究所）</a></li>
        <li><a href="https://www.jsri.or.jp/publish/market/pdf/market_31/31_18.pdf" target="_blank" rel="noopener">日本証券経済研究所「証券年表」</a></li>
        <li><a href="https://www.imes.boj.or.jp/research/papers/japanese/kk31-1-7.pdf" target="_blank" rel="noopener">伊藤正直「戦後ハイパー・インフレと中央銀行」日本銀行金融研究所</a>（卸売物価の倍率）</li>
        <li><a href="https://www.jpx.co.jp/corporate/about-jpx/history/01-02.html" target="_blank" rel="noopener">日本取引所グループ「立会場の歴史」</a></li>
        <li><a href="https://media.rakuten-sec.net/articles/-/27487" target="_blank" rel="noopener">楽天証券 トウシル「遠くの戦争は買い、近くの戦争は売り」</a></li>
      </ul>
      <p class="foot">関連：<a href="/timeline">暴落・暴騰の年表</a> ／ <a href="/events/dodge-recession">ドッジ不況</a> ／ <a href="/now">今の下落を過去と比べる</a></p>
    </section>
  </main>
  <div class="tt" role="status" aria-live="polite"></div>
  <script>
  (function () {
    var tt = document.querySelector(".tt");
    function show(html, e) {
      tt.innerHTML = html; tt.style.display = "block";
      var x = e.clientX + 14, y = e.clientY + 14, w = tt.offsetWidth, h = tt.offsetHeight;
      if (x + w > innerWidth - 8) x = e.clientX - w - 14; if (y + h > innerHeight - 8) y = e.clientY - h - 14;
      tt.style.left = x + "px"; tt.style.top = y + "px";
    }
    function hide() { tt.style.display = "none"; }
    function txt(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
    // 企業チャート: 各年の列(棒より広い当たり判定)にツールチップ
    document.querySelectorAll("svg .hit").forEach(function (r) {
      function on(e) { var p = r.getAttribute("data-tt").split("｜"); show("<b>" + txt(p[0]) + "</b><br>" + p.slice(1).map(txt).join("<br>"), e); }
      r.addEventListener("pointermove", on); r.addEventListener("click", on); r.addEventListener("pointerleave", hide);
    });
    // 戦争チャート: 縦のクロスヘアが最寄りの営業日にスナップ
    document.querySelectorAll("svg[data-series]").forEach(function (svg) {
      var S = JSON.parse(svg.getAttribute("data-series")), g = svg.getAttribute("data-geom").split(",").map(Number);
      var ML = g[0], MR = g[1], W = g[4], t0 = g[6], t1 = g[7], xh = svg.querySelector(".xh");
      function on(e) {
        var r = svg.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * W;
        var t = Math.round(t0 + (px - ML) / (W - ML - MR) * (t1 - t0)), best = S[0];
        S.forEach(function (p) { if (Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p; });
        var X = ML + (best[0] - t0) / Math.max(1, t1 - t0) * (W - ML - MR);
        xh.setAttribute("x1", X); xh.setAttribute("x2", X); xh.style.display = "";
        var chg = best[3] - 100;
        show("<b>" + (chg >= 0 ? "+" : "−") + Math.abs(chg).toFixed(1) + "%</b>（指数 " + best[3].toFixed(1) + "）<br>" + txt(best[1]) + "・終値 " + Number(best[2]).toLocaleString("ja-JP") + "円", e);
      }
      svg.addEventListener("pointermove", on); svg.addEventListener("click", on);
      svg.addEventListener("pointerleave", function () { hide(); xh.style.display = "none"; });
    });
  })();
  </script>
</body>
</html>
`;
}
