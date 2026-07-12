/*
 * イベントビューア 共有描画エンジン
 * StockListViewer.render(rootEl, cfg, series) で、1イベント分の
 * 週次チャート + KPI + その週のニュース を rootEl 内に描画する。
 * 静的個別ページ(events/<id>.html)と EventViewer.html の双方から使う。
 *
 *  cfg    : { id, title, category, date, summary, news:[{date,title,body,source,url}] }
 *  series : { source, window, data_range, kpi:{max_drawdown,trough_close,weeks}, points:[{week,weekEnd,open,close,high,low}] }
 */
(function () {
  "use strict";
  var NS = {};

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function pct(x) { return (x * 100).toFixed(1) + "%"; }
  function jpNum(x) { return Number(x).toLocaleString("ja-JP"); }
  function mondayOf(dateStr) {
    var d = new Date(dateStr + "T00:00:00Z");
    var dow = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dow);
    return d.toISOString().slice(0, 10);
  }
  function fmtWeek(p) { return p.week.slice(5).replace("-", "/") + "週"; }

  NS.render = function (root, cfg, series) {
    root.innerHTML =
      '<div class="slv-demo' + (series.source && series.source !== "real" ? " show" : "") + '">' +
        '<span aria-hidden="true">⚠</span><span>表示中の株価は<b>動作確認用のデモデータ</b>です。</span></div>' +
      '<div class="slv-grid">' +
        '<section class="slv-card">' +
          '<h2>日経平均（週次）</h2>' +
          '<p class="slv-cap">1点=1週(週末終値)。<b>下落前の水準</b>に戻るまでを表示（横スクロールで全期間、途中の別局面の変動も含む）。<b>●</b>はニュース週。ホバー/タップで価格を表示。</p>' +
          '<div class="slv-chartwrap"><div class="slv-tip"></div></div>' +
          '<div class="slv-kpis">' +
            '<div class="slv-kpi"><div class="k">最大下落率（イベント期間）</div><div class="v neg" data-kpi="dd">-</div></div>' +
            '<div class="slv-kpi"><div class="k">底値（イベント期間）</div><div class="v" data-kpi="trough">-</div></div>' +
            '<div class="slv-kpi"><div class="k">表示期間（回復まで）</div><div class="v" data-kpi="weeks">-</div></div>' +
          '</div>' +
        '</section>' +
        '<section class="slv-card">' +
          '<h2>大きな出来事（その週のニュース）</h2>' +
          '<p class="slv-cap">株価に影響した当時の報道。日付とチャートの週が対応します。</p>' +
          '<div class="slv-news"></div>' +
        '</section>' +
      '</div>';

    var pts = series.points || [];
    var weekIndex = {}, newsByWeek = {};
    pts.forEach(function (p, i) { weekIndex[p.week] = i; });
    (cfg.news || []).forEach(function (n) { var wk = mondayOf(n.date); (newsByWeek[wk] = newsByWeek[wk] || []).push(n); });

    if (series.kpi) {
      root.querySelector('[data-kpi="dd"]').textContent = pct(series.kpi.max_drawdown);
      root.querySelector('[data-kpi="trough"]').textContent = jpNum(Math.round(series.kpi.trough_close)) + " 円";
      root.querySelector('[data-kpi="weeks"]').textContent = pts.length + " 週";
    }

    drawChart(root, cfg, pts, newsByWeek, series);
    renderNews(root, cfg, series, weekIndex, newsByWeek);
  };

  function drawChart(root, cfg, pts, newsByWeek, series) {
    var wrap = root.querySelector(".slv-chartwrap");
    var n = pts.length;
    if (!n) return;
    var H = 340, ML = 54, MR = 54, MT = 20, MB = 40, ih = H - MT - MB;
    // 週あたりの最小ピクセル幅を確保。データが多いと横幅が伸び、コンテナを超えると横スクロールになる
    var PX_PER_WEEK = 16;
    var host = wrap.clientWidth || 700;
    var iw = Math.max(host - ML - MR, n * PX_PER_WEEK);
    var W = ML + iw + MR;

    var conc = series && series.conclusion ? series.conclusion : null;
    var closes = pts.map(function (p) { return p.close; });
    var lo = Math.min.apply(null, closes), hi = Math.max.apply(null, closes);
    if (conc) { lo = Math.min(lo, conc.trough.close, conc.peak.close); hi = Math.max(hi, conc.peak.close); }
    var pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
    var x = function (i) { return ML + (n <= 1 ? 0 : i / (n - 1)) * iw; };
    var y = function (v) { return MT + (1 - (v - lo) / (hi - lo)) * ih; };

    // イベント本体の底(結論の底)の週インデックス。無ければ表示区間の最安値
    function weekIdxOf(dateStr) {
      if (!dateStr) return -1;
      var wk = mondayOf(dateStr);
      for (var j = 0; j < n; j++) if (pts[j].week === wk) return j;
      return -1;
    }
    var tIdx = conc ? weekIdxOf(conc.trough.date) : -1;
    if (tIdx < 0) { tIdx = 0; for (var k = 1; k < n; k++) if (pts[k].close < pts[tIdx].close) tIdx = k; }
    var recIdx = conc && conc.recovered ? weekIdxOf(conc.recovery_date) : -1;

    var s = '<defs><linearGradient id="slvarea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--area-top)"/><stop offset="1" stop-color="var(--area-bot)"/></linearGradient></defs>';
    for (var t = 0; t <= 4; t++) {
      var v = lo + (hi - lo) * t / 4, yy = y(v), lbl = Math.round(v).toLocaleString("ja-JP");
      s += '<line x1="' + ML + '" x2="' + (W - MR) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '" stroke="var(--line)" stroke-width="1"/>';
      // 横スクロール時に軸が流れても読めるよう左右両端に値ラベル
      s += '<text x="' + (ML - 8) + '" y="' + (yy + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="var(--muted)" style="font-variant-numeric:tabular-nums">' + lbl + '</text>';
      s += '<text x="' + (W - MR + 8) + '" y="' + (yy + 4).toFixed(1) + '" text-anchor="start" font-size="11" fill="var(--muted)" style="font-variant-numeric:tabular-nums">' + lbl + '</text>';
    }
    var numTicks = Math.max(4, Math.round(iw / 96));
    var step = Math.max(1, Math.round(n / numTicks));
    for (var i = 0; i < n; i += step) {
      var xx = x(i);
      s += '<line x1="' + xx.toFixed(1) + '" x2="' + xx.toFixed(1) + '" y1="' + (MT + ih) + '" y2="' + (MT + ih + 4) + '" stroke="var(--muted)" stroke-width="1"/>';
      s += '<text x="' + xx.toFixed(1) + '" y="' + (MT + ih + 18) + '" text-anchor="middle" font-size="10.5" fill="var(--muted)" style="font-variant-numeric:tabular-nums">' + pts[i].week.slice(2).replace(/-/g, "/") + '</text>';
    }

    // 下落前の水準(=高値)の基準線。ここに戻れば「回復」
    if (conc) {
      var py = y(conc.peak.close);
      s += '<line x1="' + ML + '" x2="' + (W - MR) + '" y1="' + py.toFixed(1) + '" y2="' + py.toFixed(1) + '" stroke="var(--accent)" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.85"/>';
      s += '<text x="' + (ML + 6) + '" y="' + (py - 6).toFixed(1) + '" font-size="11" font-weight="700" fill="var(--accent)">下落前の水準</text>';
    }

    var line = pts.map(function (p, i) { return x(i).toFixed(1) + "," + y(p.close).toFixed(1); }).join(" ");
    s += '<polygon points="' + ML + ',' + (MT + ih) + ' ' + line + ' ' + (W - MR) + ',' + (MT + ih) + '" fill="url(#slvarea)"/>';
    s += '<polyline points="' + line + '" fill="none" stroke="var(--red)" stroke-width="2" stroke-linejoin="round"/>';

    // 回復地点(下落前の水準を回復した週)のマーカー
    if (recIdx >= 0) {
      var rx = x(recIdx), ry = y(pts[recIdx].close);
      s += '<line x1="' + rx.toFixed(1) + '" x2="' + rx.toFixed(1) + '" y1="' + MT + '" y2="' + (MT + ih) + '" stroke="var(--accent)" stroke-width="1" stroke-dasharray="3 3" opacity="0.6"/>';
      s += '<circle cx="' + rx.toFixed(1) + '" cy="' + ry.toFixed(1) + '" r="4.5" fill="var(--accent)" stroke="var(--surface)" stroke-width="1.6"/>';
      s += '<text x="' + rx.toFixed(1) + '" y="' + (MT - 6).toFixed(1) + '" text-anchor="middle" font-size="11" font-weight="700" fill="var(--accent)">回復</text>';
    }
    // イベント本体の底マーカー(回復途中の別局面の安値と区別するためラベル付き)
    var tx = x(tIdx), ty = y(pts[tIdx].close);
    s += '<circle cx="' + tx.toFixed(1) + '" cy="' + ty.toFixed(1) + '" r="3.8" fill="none" stroke="var(--red)" stroke-width="1.8"/>';
    s += '<text x="' + tx.toFixed(1) + '" y="' + (ty + 17).toFixed(1) + '" text-anchor="middle" font-size="11" font-weight="700" fill="var(--red)">底</text>';

    pts.forEach(function (p, i) { if (newsByWeek[p.week]) s += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.close).toFixed(1) + '" r="4.5" fill="var(--red)" stroke="var(--surface)" stroke-width="1.6"/>'; });
    s += '<circle class="slv-hoverdot" r="4.5" fill="var(--navy)" stroke="var(--surface)" stroke-width="1.6" style="display:none"/>';
    s += '<circle class="slv-pulse" r="7" fill="none" stroke="var(--red)" stroke-width="2" style="display:none"/>';

    var old = wrap.querySelector("svg"); if (old) old.remove();
    // width/height をpx実寸で与え、コンテナ超過分は wrap の横スクロールで見る(高さは一定)
    wrap.insertAdjacentHTML("afterbegin",
      '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(cfg.title) + 'の週次日経平均">' + s + '</svg>');

    var svg = wrap.querySelector("svg"), tip = wrap.querySelector(".slv-tip"), hoverdot = svg.querySelector(".slv-hoverdot");
    NS._geom = { x: x, y: y, W: W, H: H, ML: ML, MR: MR, iw: iw, n: n, pts: pts, svg: svg };
    // 指定したクライアントX座標に最も近い週の価格・ニュースをツールチップ表示する
    function showAt(clientX) {
      var r = svg.getBoundingClientRect();
      var px = ((clientX - r.left) / r.width) * W;
      var i = Math.round((px - ML) / iw * (n - 1));
      if (i < 0) i = 0; else if (i >= n) i = n - 1; // 端は最寄りの点にスナップ(タップしやすく)
      var p = pts[i];
      hoverdot.setAttribute("cx", x(i)); hoverdot.setAttribute("cy", y(p.close)); hoverdot.style.display = "";
      var nw = newsByWeek[p.week];
      tip.innerHTML = '<span class="d">' + fmtWeek(p) + ' (' + p.weekEnd + ')</span><br><b>' + jpNum(p.close) + '</b> 円' + (nw ? '<div class="nw">📰 ' + esc(nw[0].title) + (nw.length > 1 ? ' ほか' + (nw.length - 1) + '件' : '') + '</div>' : '');
      tip.style.display = "block";
      // svgはpx実寸(1:1)なので x(i)/y() をそのまま座標に使える。スクロール位置を考慮して右端で反転
      var tw = tip.offsetWidth, view = wrap.scrollLeft + wrap.clientWidth;
      var left = x(i) + 12; if (left + tw > view - 4) left = x(i) - tw - 12;
      tip.style.left = Math.max(wrap.scrollLeft + 2, left) + "px";
      tip.style.top = Math.max(0, y(p.close) - 60) + "px";
    }
    function hideTip() { tip.style.display = "none"; hoverdot.style.display = "none"; }

    // マウス/ペンのみ: ホバーで価格に追従、離れたら消す(タッチは追従・自動非表示しない)
    svg.addEventListener("pointermove", function (e) {
      if (e.pointerType === "mouse" || e.pointerType === "pen") showAt(e.clientX);
    });
    svg.addEventListener("pointerleave", function (e) {
      if (e.pointerType === "mouse" || e.pointerType === "pen") hideTip();
    });
    // クリック/タップ: その点の価格を表示して残す(タッチ端末の主操作)。
    // 横スクロール(ドラッグ)中は click が発火しないので、タップと横スクロールが両立する。
    svg.addEventListener("click", function (e) { showAt(e.clientX); });
  }

  function renderNews(root, cfg, series, weekIndex, newsByWeek) {
    var box = root.querySelector(".slv-news");
    var items = (cfg.news || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (!items.length) { box.innerHTML = '<p style="color:var(--muted)">ニュースは準備中です。</p>'; return; }
    box.innerHTML = items.map(function (n) {
      var wk = mondayOf(n.date), hasWeek = (wk in weekIndex);
      return '<div class="slv-item" data-week="' + wk + '">' +
        '<div class="nd">' + esc(n.date) + (hasWeek ? '<span class="wk">この週</span>' : '') + '</div>' +
        '<div class="nt">' + esc(n.title) + '</div>' +
        (n.body ? '<div class="nb">' + esc(n.body) + '</div>' : '') +
        (n.source ? '<div class="src">' + (n.url ? '<a href="' + esc(n.url) + '" target="_blank" rel="noopener noreferrer">' + esc(n.source) + ' ↗</a>' : esc(n.source)) + '</div>' : '') +
      '</div>';
    }).join("");
    box.querySelectorAll(".slv-item").forEach(function (it) {
      it.addEventListener("click", function (e) {
        if (e.target.closest("a")) return;
        box.querySelectorAll(".slv-item").forEach(function (x) { x.classList.remove("active"); });
        it.classList.add("active");
        highlightWeek(root, it.getAttribute("data-week"), weekIndex);
      });
    });
  }

  function highlightWeek(root, wk, weekIndex) {
    var g = NS._geom; if (!g || !(wk in weekIndex)) return;
    var i = weekIndex[wk], pulse = g.svg.querySelector(".slv-pulse");
    pulse.setAttribute("cx", g.x(i).toFixed(1)); pulse.setAttribute("cy", g.y(g.pts[i].close).toFixed(1)); pulse.style.display = "";
    // 横スクロールしている場合は該当週を表示領域の中央へスクロール
    var wrap = root.querySelector(".slv-chartwrap");
    if (wrap && wrap.scrollWidth > wrap.clientWidth + 1) {
      var target = g.x(i) - wrap.clientWidth / 2;
      wrap.scrollTo({ left: Math.max(0, Math.min(target, wrap.scrollWidth - wrap.clientWidth)), behavior: "smooth" });
    }
  }

  window.StockListViewer = NS;
})();
