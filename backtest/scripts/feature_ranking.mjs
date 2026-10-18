/**
 * 横断ページ「日経平均 暴落の歴史ランキング」(/crash-ranking) の静的HTML生成
 *
 * 入力: build_event_pages.mjs が集めたイベントごとの結論データ(<id>.json の conclusion)と events.json の設定。
 * 表示する数値はすべて結論データから機械的に算出する(手書きの数値は置かない)。
 * 狙う検索: 「株 暴落 歴史」「日経平均 暴落 ランキング」「暴落 回復 期間」など。
 */
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ym = (d) => { const [y, m] = d.split("-"); return `${y}年${Number(m)}月`; };
const ymd = (d) => { const [y, m, dd] = d.split("-"); return `${y}年${Number(m)}月${Number(dd)}日`; };
// 上位が僅差(例: −63.5% と −63.2%)でも順位の理由が分かるよう、小数第1位まで出す
const ddPct = (dd) => `${dd < 0 ? "−" : ""}${Math.abs(dd * 100).toFixed(1)}%`;
const yen = (v) => `${Math.round(v).toLocaleString("ja-JP")}円`;
const recoverStr = (c) => (!c.recovered ? "未回復" : c.months_to_recover >= 24 ? `約${Math.round(c.months_to_recover / 12)}年` : `約${c.months_to_recover}ヶ月`);
const bottomStr = (c) => (c.months_to_bottom >= 1 ? `約${c.months_to_bottom}ヶ月` : `${c.bdays_to_bottom}営業日`);

/**
 * ランキング用の行を作る。rows: [{ cfg, c }](c = conclusion)
 * 返り値: { byDrawdown, byRecovery, facts }
 *   byDrawdown : 最大下落率の深い順
 *   byRecovery : 高値回復までの期間が短い順(未回復は末尾)
 */
export function rankCrashes(rows) {
  const list = rows.filter((r) => r.c).map(({ cfg, c }) => ({
    id: cfg.id, slug: cfg.slug, title: cfg.title, year: cfg.date.slice(0, 4), note: cfg.recoveryNote || "", c,
  }));
  const byDrawdown = [...list].sort((a, b) => a.c.drawdown - b.c.drawdown);
  const rec = (r) => (r.c.recovered ? r.c.months_to_recover : Infinity);
  const byRecovery = [...list].sort((a, b) => rec(a) - rec(b) || a.c.drawdown - b.c.drawdown);
  const recovered = list.filter((r) => r.c.recovered);
  const withinYear = byRecovery.filter((r) => rec(r) <= 12);
  const overFiveYears = recovered.filter((r) => r.c.months_to_recover >= 60);
  const top3 = byDrawdown.slice(0, 3);
  const deepestLater = list.filter((r) => r.c.later_low).sort((a, b) => a.c.later_low.drawdown - b.c.later_low.drawdown)[0] || null;
  return {
    byDrawdown, byRecovery,
    facts: {
      n: list.length,
      deepest: byDrawdown[0],
      deepestLater: deepestLater && deepestLater.c.later_low.drawdown < byDrawdown[0].c.drawdown ? deepestLater : null,
      fastest: recovered.length ? byRecovery[0] : null,
      slowest: recovered.length ? [...recovered].sort((a, b) => b.c.months_to_recover - a.c.months_to_recover)[0] : null,
      withinYear, overFiveYears, top3,
      top3MinYears: Math.floor(Math.min(...top3.map(rec)) / 12),
    },
  };
}

export function crashRankingHtml({ rows, siteUrl }) {
  const { byDrawdown, byRecovery, facts: f } = rankCrashes(rows);
  const url = `${siteUrl}/crash-ranking`;
  const years = byDrawdown.map((r) => Number(r.year));
  const y0 = Math.min(...years), y1 = Math.max(...years);
  const title = `日経平均 暴落の歴史ランキング｜下落率と回復までの期間を比較（${y0}〜${y1}年）｜StockList`;
  const desc = `日経平均株価の過去の暴落${f.n}件を、最大下落率と高値回復までの期間でランキング。最大は${f.deepest.title}の${ddPct(f.deepest.c.drawdown)}。リーマンショック、バブル崩壊、コロナショックなどの下落と回復を一覧で比べられます。`;
  const ogImg = `${siteUrl}/IMG_3857.jpg`;
  const names = (rs) => rs.map((r) => r.title).join("、");

  const faq = [
    {
      q: "日経平均で過去最大の暴落は?",
      a: `高値から底までの下落率で比べると、${f.deepest.title}（${f.deepest.year}年）の約${ddPct(f.deepest.c.drawdown)}が最大です（${f.n}件の比較）。` +
        (f.deepestLater ? `その後の安値まで含めると、${f.deepestLater.title}は${ym(f.deepestLater.c.later_low.date)}に高値から約${ddPct(f.deepestLater.c.later_low.drawdown)}の水準まで下げています。` : "") +
        "1日の下落率では、ブラックマンデー翌日の1987年10月20日（−14.90%）が過去最大です。",
    },
    {
      q: "暴落から回復するまで、どのくらいかかった?",
      a: `${f.n}件のうち、1年以内に下落前の高値を回復したのは${f.withinYear.length}件（${names(f.withinYear)}）、5年以上かかったのは${f.overFiveYears.length}件です。` +
        (f.fastest && f.slowest ? `最短は${f.fastest.title}の${recoverStr(f.fastest.c)}、最長は${f.slowest.title}の${recoverStr(f.slowest.c)}でした。` : ""),
    },
    {
      q: "下落率や回復期間はどうやって計算している?",
      a: "日経平均の終値をもとに、下落前の高値から、その局面の最安値（底）までの下落率を計算しています。回復までの期間は、高値をつけた日から、終値で初めて高値を上回った日までです。",
    },
  ];

  const article = {
    "@context": "https://schema.org", "@type": "Article", headline: title, description: desc,
    dateModified: new Date().toISOString().slice(0, 10), mainEntityOfPage: url, image: ogImg,
    author: { "@type": "Organization", name: "StockList" },
    publisher: { "@type": "Organization", name: "StockList", url: `${siteUrl}/` },
  };
  const breadcrumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "ホーム", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name: "相場の歴史", item: `${siteUrl}/history` },
      { "@type": "ListItem", position: 3, name: "暴落の歴史ランキング", item: url },
    ],
  };
  const itemList = {
    "@context": "https://schema.org", "@type": "ItemList", name: "日経平均 暴落の下落率ランキング",
    itemListElement: byDrawdown.map((r, i) => ({ "@type": "ListItem", position: i + 1, name: r.title, url: `${siteUrl}/events/${r.slug}` })),
  };
  const faqLd = {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faq.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })),
  };

  const ddRows = byDrawdown.map((r, i) => {
    const c = r.c, ll = c.later_low;
    return `<tr>
          <td class="rk">${i + 1}</td>
          <th scope="row"><a href="/events/${esc(r.slug)}">${esc(r.title)}</a><small>${esc(r.year)}年</small></th>
          <td class="neg">${ddPct(c.drawdown)}${ll ? `<small>その後${esc(ym(ll.date))}に${ddPct(ll.drawdown)}</small>` : ""}</td>
          <td class="opt">${yen(c.peak.close)} → ${yen(c.trough.close)}<small>${esc(ym(c.peak.date))} → ${esc(ym(c.trough.date))}</small></td>
          <td class="opt">${bottomStr(c)}</td>
          <td class="rec">${recoverStr(c)}</td>
        </tr>`;
  }).join("\n        ");
  const recRows = byRecovery.map((r, i) => {
    const c = r.c;
    return `<tr>
          <td class="rk">${i + 1}</td>
          <th scope="row"><a href="/events/${esc(r.slug)}">${esc(r.title)}</a><small>${esc(r.year)}年</small></th>
          <td class="rec">${recoverStr(c)}</td>
          <td class="opt">${c.recovered ? esc(ymd(c.recovery_date)) : "—"}</td>
          <td class="neg">${ddPct(c.drawdown)}</td>
          <td class="txt opt">${esc(r.note)}</td>
        </tr>`;
  }).join("\n        ");

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
  <script type="application/ld+json">${JSON.stringify(itemList)}</script>
  <script type="application/ld+json">${JSON.stringify(faqLd)}</script>
  <script defer src="/site-config.js"></script>
  <script defer src="/analytics-config.js"></script>
  <style>
    .sl-legal { display:flex; flex-wrap:wrap; justify-content:center; gap:4px 18px; margin:14px 0 0; padding-top:14px; border-top:1px solid var(--line); font-size:12.5px; } .sl-legal a { color:var(--ink-2); text-decoration:none; padding:6px 0; } .sl-legal a:hover { text-decoration:underline; }
    :root{ --navy:#1b2538; --navy-2:#243149; --red:#da3c41; --good:#1a7f4b; --ink:#16202e; --ink-2:#56606e; --muted:#8a929e;
      --line:#e7e9ee; --surface:#fff; --plane:#f4f6f9; --accent:#2f6fd0;
      --shadow:0 1px 2px rgba(16,32,46,.06), 0 8px 24px rgba(16,32,46,.07); }
    @media (prefers-color-scheme: dark){ :root{ --navy:#0f1626; --navy-2:#16203a; --red:#e0575c; --good:#35c07d; --ink:#e9edf4; --ink-2:#aab3c2;
      --muted:#7d8695; --line:#263042; --surface:#161d2b; --plane:#0e131d; --accent:#6ea3f0;
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
    h2{font-size:21px;margin:0 0 6px;letter-spacing:-.01em;padding-left:12px;border-left:4px solid var(--accent);}
    .lead{color:var(--ink-2);font-size:15px;margin:0 0 12px;}
    .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:0 0 34px;}
    .tile{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px;}
    .tile .k{font-size:12.5px;color:var(--muted);} .tile .v{font-size:30px;font-weight:800;line-height:1.25;margin:2px 0;}
    .tile .n{font-size:12.5px;color:var(--ink-2);}
    table{border-collapse:collapse;width:100%;font-size:14px;}
    .tbl{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:10px 0 0;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);}
    th,td{border-bottom:1px solid var(--line);padding:10px 12px;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;vertical-align:top;}
    tbody tr:last-child th, tbody tr:last-child td{border-bottom:0;}
    thead th{color:var(--muted);font-size:12px;font-weight:700;} thead th:nth-child(2){text-align:left;}
    tbody th{text-align:left;font-weight:700;}
    th small,td small{display:block;font-weight:400;font-size:11.5px;color:var(--muted);}
    td.rk{text-align:center;color:var(--muted);font-weight:800;width:3em;}
    td.neg{color:var(--red);font-weight:800;} td.rec{font-weight:800;} td.txt{text-align:left;color:var(--ink-2);font-size:13px;white-space:normal;min-width:12em;}
    .points{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 20px;margin:10px 0 0;}
    .points ul{margin:0;padding-left:1.2em;} .points li{margin:4px 0;color:var(--ink-2);}
    .faq details{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 16px;margin:10px 0 0;}
    .faq summary{cursor:pointer;font-weight:700;} .faq p{margin:8px 0 0;color:var(--ink-2);font-size:14.5px;}
    .note{color:var(--muted);font-size:12px;margin:10px 0 0;line-height:1.7;}
    .cta{background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--red);border-radius:12px;padding:18px 20px;margin:10px 0 0;}
    .cta b{font-size:15.5px;} .cta p{color:var(--ink-2);font-size:14px;margin:4px 0 12px;}
    .btn{display:inline-block;background:var(--red);color:#fff;font-weight:700;padding:11px 20px;border-radius:10px;} .btn:hover{text-decoration:none;filter:brightness(1.05);}
    .foot{color:var(--muted);font-size:12px;margin-top:30px;border-top:1px solid var(--line);padding-top:14px;}
    /* スマホは主役の列(順位・出来事・下落率・回復まで)だけにして、横スクロールなしで読めるようにする */
    @media (max-width:560px){ .tile .v{font-size:26px;} th,td{padding:9px 8px;font-size:13.5px;} .opt{display:none;}
      tbody th{white-space:normal;min-width:8.5em;} td small{white-space:normal;} td.rk{width:2.2em;} }
  </style>
  <!-- Vercel Web Analytics -->
  <script defer src="/_vercel/insights/script.js"></script>
</head>
<body>
  <div class="topbar"><a href="/">← StockList トップ</a><a href="/history">相場の歴史</a><a href="/timeline">年表</a><a href="/now">今の下落と比べる</a></div>
  <header class="hero">
    <p class="eyebrow">Nikkei 225 · Crash Ranking</p>
    <h1>日経平均 暴落の歴史ランキング</h1>
    <p>${y0}年から${y1}年まで、日経平均株価が大きく下げた${f.n}の局面を、最大下落率と下落前の高値を回復するまでの期間で比べます。数値はすべて日経平均の終値から算出しています。</p>
  </header>
  <main class="wrap">
    <div class="tiles">
      <div class="tile"><div class="k">最大下落率が最も大きい</div><div class="v" style="color:var(--red)">${ddPct(f.deepest.c.drawdown)}</div><div class="n">${esc(f.deepest.title)}（${esc(f.deepest.year)}年）</div></div>
      ${f.fastest ? `<div class="tile"><div class="k">高値の回復が最も早い</div><div class="v">${esc(recoverStr(f.fastest.c))}</div><div class="n">${esc(f.fastest.title)}（${esc(f.fastest.year)}年）</div></div>` : ""}
      <div class="tile"><div class="k">1年以内に高値を回復</div><div class="v">${f.withinYear.length}<span style="font-size:16px">／${f.n}件</span></div><div class="n">${esc(names(f.withinYear))}</div></div>
    </div>

    <section aria-labelledby="h-dd">
      <h2 id="h-dd">下落率ランキング</h2>
      <p class="lead">下落前の高値から、その局面の底までの下落率が大きい順です。出来事の名前から、チャートと当時のニュースを見られます。</p>
      <div class="tbl"><table>
        <thead><tr><th scope="col">順位</th><th scope="col">出来事</th><th scope="col">最大下落率</th><th scope="col" class="opt">高値 → 底</th><th scope="col" class="opt">底まで</th><th scope="col">高値回復まで</th></tr></thead>
        <tbody>
        ${ddRows}
        </tbody>
      </table></div>
      <p class="note">「その後」は、高値を回復するまでの間に最初の底よりさらに安くなった値です。期間は高値をつけた日から数えています。</p>
    </section>

    <section aria-labelledby="h-rec">
      <h2 id="h-rec">回復が早かった順</h2>
      <p class="lead">下落前の高値を、終値で初めて上回るまでの期間が短い順です。</p>
      <div class="tbl"><table>
        <thead><tr><th scope="col">順位</th><th scope="col">出来事</th><th scope="col">高値回復まで</th><th scope="col" class="opt">回復した日</th><th scope="col">最大下落率</th><th scope="col" class="opt">回復の背景</th></tr></thead>
        <tbody>
        ${recRows}
        </tbody>
      </table></div>
    </section>

    <section aria-labelledby="h-pt">
      <h2 id="h-pt">ランキングから分かること</h2>
      <div class="points"><ul>
        <li>下落率が大きい上位3件（${esc(names(f.top3))}）は、いずれも高値の回復に${f.top3MinYears}年以上かかりました。</li>
        <li>1年以内に高値を回復したのは${f.withinYear.length}件（${esc(names(f.withinYear))}）です。下落の大きさと回復の早さは、局面ごとに大きく異なります。</li>
        <li>これは過去の結果をまとめたもので、今後の値動きを示すものではありません。</li>
      </ul></div>
    </section>

    <section class="faq" aria-labelledby="h-faq">
      <h2 id="h-faq">よくある質問</h2>
      ${faq.map((x) => `<details><summary>${esc(x.q)}</summary><p>${esc(x.a)}</p></details>`).join("\n      ")}
    </section>

    <aside class="cta">
      <b>暴落は、歴史的にはいつか戻ってきました。</b>
      <p>焦って売るより、次の下落に備えて少額から。長期・積立の第一歩は口座づくりから。</p>
      <a class="btn" href="/start">はじめての証券口座を見る →</a>
    </aside>
    <section class="nl" data-newsletter-block hidden>
      <h2>急落モードの日に、一通だけ。</h2>
      <p class="nl-sub">相場が大きく動いた日に、過去の暴落との比較を1通だけお届けします。しつこい配信はしません。いつでも解除できます。</p>
      <form class="nl-form" data-newsletter novalidate>
        <input type="email" required placeholder="メールアドレス" autocomplete="email" aria-label="メールアドレス" />
        <button type="submit">登録する</button>
        <p class="nl-msg" data-nl-msg style="display:none"></p>
      </form>
      <p class="nl-fine">登録は無料・配信は必要なときだけ。<a href="/privacy">プライバシーポリシー</a></p>
    </section>
    <p class="foot">
      ※ 教育・情報提供目的のページです。投資助言ではありません。数値は検証用データ（Stooq/FRED）の日経平均の終値から算出した参考値です。
    </p>
    <nav class="sl-legal" aria-label="規約・ポリシー"><a href="/privacy">プライバシーポリシー</a><a href="/privacy#external-transmission">外部送信について</a><a href="/disclosure">アフィリエイト表記・免責事項</a></nav>
  </main>
</body>
</html>
`;
}
