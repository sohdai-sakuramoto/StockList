/*
 * 投資シミュレーション(一括投資)
 * StockListSimulator.render(rootEl, cfg, series) で、
 * 「その時点で日経平均に◯円投資していたら、回復時点・最新でいくらになったか」を rootEl 内に描画する。
 *
 *  購入時点 : 直前の高値(conclusion.peak) / 出来事の日(conclusion.event_day) / 底値(conclusion.trough)
 *  評価時点 : 高値を回復した日(conclusion.recovery_close) / 最新の終値(/state.json の metrics.close)
 *  途中の最安 : 購入日より後の trough / later_low のうち最も安い終値(回復日まで)
 *
 * 計算は「指数そのもの」の値動き(評価額 = 金額 × 評価時点の終値 ÷ 購入時点の終値)。
 * 配当・手数料・税金・信託報酬は含まない。
 */
(function () {
  "use strict";
  var NS = {};
  var PRESETS = [10, 100, 1000];   // 万円
  var DEFAULT_MAN = 100;
  var MAX_MAN = 100000;
  var SHARE_MAX = 115;   // シェア文の上限(文字)。X は全角1字=2カウントで上限280、URL(23)の分を残す

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function jpDate(d) { return Number(d.slice(0, 4)) + "年" + Number(d.slice(5, 7)) + "月" + Number(d.slice(8, 10)) + "日"; }
  function jpNum(x) { return Math.round(x).toLocaleString("ja-JP"); }
  // 円 → 「1,234万円」/ 1億以上は「1億2,345万円」/ 1万未満は「9,999円」
  function yen(x) {
    var v = Math.round(x);
    if (Math.abs(v) < 10000) return v.toLocaleString("ja-JP") + "円";
    var man = Math.round(v / 10000);
    var oku = Math.trunc(man / 10000), rest = Math.abs(man % 10000);
    if (oku) return oku.toLocaleString("ja-JP") + "億" + (rest ? rest.toLocaleString("ja-JP") + "万" : "") + "円";
    return man.toLocaleString("ja-JP") + "万円";
  }
  function signedYen(x) { return (x >= 0 ? "+" : "−") + yen(Math.abs(x)); }
  function signedPct(r) { var p = Math.round(r * 100); return (p >= 0 ? "+" : "−") + Math.abs(p).toLocaleString("ja-JP") + "%"; }
  function monthsBetween(a, b) {
    var ya = +a.slice(0, 4), ma = +a.slice(5, 7), yb = +b.slice(0, 4), mb = +b.slice(5, 7);
    return (yb - ya) * 12 + (mb - ma) - (+b.slice(8, 10) < +a.slice(8, 10) ? 1 : 0);
  }
  function spanStr(a, b) {
    var m = monthsBetween(a, b);
    if (m < 1) return "1ヶ月未満";
    if (m < 24) return "約" + m + "ヶ月";
    var y = Math.floor(m / 12), r = m % 12;
    return "約" + y + "年" + (r ? r + "ヶ月" : "");
  }
  function track(name, params) {
    try { if (typeof window.gtag === "function") window.gtag("event", name, params); } catch (e) { /* 計測失敗は無視 */ }
  }

  // 購入時点の候補(データにあるものだけ)
  function buyOptions(c) {
    var out = [];
    if (c.peak) out.push({ key: "peak", label: "直前の高値", note: "いちばん高いところで買った場合", date: c.peak.date, close: c.peak.close });
    if (c.event_day) out.push({ key: "event", label: "出来事の日", note: "ニュースの日に持っていた場合", date: c.event_day.date, close: c.event_day.close });
    if (c.trough) out.push({ key: "trough", label: "底値", note: "いちばん安いところで買えた場合", date: c.trough.date, close: c.trough.close });
    return out;
  }

  // 回復日の終値: conclusion.recovery_close。古いデータではチャート末尾(=回復日)の終値で代用
  function recoveryClose(c, series) {
    if (!c.recovered || !c.recovery_date) return null;
    if (c.recovery_close) return c.recovery_close;
    var pts = series.points || [], last = pts[pts.length - 1];
    if (last && series.data_range && series.data_range[1] === c.recovery_date) return last.close;
    return null;
  }

  // 購入日より後(回復日まで)で最も安い終値。trough / later_low の日次終値から選ぶ
  function worstAfter(c, buy) {
    var cands = [c.trough, c.later_low].filter(function (x) { return x && x.date > buy.date && x.close < buy.close; });
    var w = null;
    cands.forEach(function (x) { if (!w || x.close < w.close) w = x; });
    return w;
  }

  NS.render = function (root, cfg, series) {
    var c = series && series.conclusion;
    if (!root || !c) return;
    var opts = buyOptions(c);
    if (!opts.length) return;
    var recClose = recoveryClose(c, series);
    var latest = null;   // { date, close } /state.json から非同期で取得
    var state = { buy: (opts.filter(function (o) { return o.key === "event"; })[0] || opts[0]).key, man: DEFAULT_MAN };
    // シェアされたURL(?buy=&amt=)で開いたら、その条件で表示する
    try {
      var q = new URLSearchParams(location.search), qb = q.get("buy"), qm = Math.floor(Number(q.get("amt")));
      if (opts.some(function (o) { return o.key === qb; })) state.buy = qb;
      if (qm >= 1) state.man = Math.min(qm, MAX_MAN);
    } catch (e) { /* 既定の条件で表示 */ }

    root.innerHTML =
      '<h2 id="slv-sim-h">もし、このとき日経平均に投資していたら？</h2>' +
      '<p class="slv-sim-sub">' + esc(cfg.title) + 'のときに日経平均株価と同じ値動きをする資産を一括で買い、持ち続けた場合の概算です。</p>' +
      '<div class="slv-sim-form">' +
        '<div class="slv-sim-field"><div class="lbl" id="slv-sim-amt-l">投資額</div>' +
          '<div class="slv-sim-amt" role="group" aria-labelledby="slv-sim-amt-l">' +
            PRESETS.map(function (m) { return '<button type="button" data-man="' + m + '">' + jpNum(m) + '万円</button>'; }).join("") +
            '<label class="free"><input type="number" inputmode="numeric" min="1" max="' + MAX_MAN + '" step="1" value="' + state.man + '" aria-label="投資額(万円)" /><span>万円</span></label>' +
          '</div></div>' +
        '<div class="slv-sim-field"><div class="lbl" id="slv-sim-buy-l">買ったタイミング</div>' +
          '<div class="slv-sim-buy" role="radiogroup" aria-labelledby="slv-sim-buy-l">' +
            opts.map(function (o) {
              return '<button type="button" role="radio" data-buy="' + o.key + '">' +
                '<span class="t">' + esc(o.label) + '</span>' +
                '<span class="d">' + jpDate(o.date) + '・' + jpNum(o.close) + '円</span></button>';
            }).join("") +
          '</div></div>' +
      '</div>' +
      '<div class="slv-sim-out" aria-live="polite"></div>' +
      '<div class="slv-sim-share"><a class="slv-sim-x" target="_blank" rel="noopener">結果をXでシェア</a></div>' +
      '<p class="slv-sim-note">※ 日経平均株価（指数）の終値で計算した概算です。配当・手数料・税金・投資信託の信託報酬は含みません。' +
        '過去の値動きをもとにした結果であり、将来の運用成果を示すものではありません。特定の金融商品の売買をすすめるものではありません。</p>';

    var out = root.querySelector(".slv-sim-out");
    var input = root.querySelector(".slv-sim-amt input");
    var xLink = root.querySelector(".slv-sim-x");

    function card(label, date, value, amount, extra) {
      var r = value / amount - 1;
      var cls = r > 0.0005 ? "pos" : r < -0.0005 ? "neg" : "";
      return '<div class="slv-sim-res">' +
        '<div class="k">' + label + '<span>' + (date ? jpDate(date) : "") + '</span></div>' +
        '<div class="v">' + yen(value) + '</div>' +
        '<div class="g ' + cls + '">' + signedYen(value - amount) + '（' + signedPct(r) + '）</div>' +
        (extra ? '<div class="x">' + extra + '</div>' : "") +
      '</div>';
    }

    function update() {
      var buy = opts.filter(function (o) { return o.key === state.buy; })[0];
      var amount = state.man * 10000;
      root.querySelectorAll("[data-buy]").forEach(function (b) { b.setAttribute("aria-checked", b.getAttribute("data-buy") === state.buy ? "true" : "false"); });
      root.querySelectorAll("[data-man]").forEach(function (b) { b.setAttribute("aria-pressed", +b.getAttribute("data-man") === state.man ? "true" : "false"); });

      var html = '<p class="slv-sim-lead">' + jpDate(buy.date) + '（' + esc(buy.label) + '）に <b>' + yen(amount) + '</b> 投資していたら…</p><div class="slv-sim-grid">';
      var worst = worstAfter(c, buy);
      if (worst) {
        html += card("途中でいちばん減ったとき", worst.date, amount * worst.close / buy.close, amount, "買ってから" + spanStr(buy.date, worst.date) + "後");
      }
      var recVal = null;
      if (recClose && c.recovery_date > buy.date) {
        recVal = amount * recClose / buy.close;
        html += card("高値を回復した日", c.recovery_date, recVal, amount, "買ってから" + spanStr(buy.date, c.recovery_date) + "後");
      } else if (!c.recovered) {
        html += '<div class="slv-sim-res"><div class="k">高値を回復した日</div><div class="v sm">まだ回復していません</div></div>';
      }
      if (latest) {
        html += card("最新（" + jpDate(latest.date) + "）", "", amount * latest.close / buy.close, amount, "買ってから" + spanStr(buy.date, latest.date) + "後");
      }
      html += '</div>';
      out.innerHTML = html;

      // シェア文: 値上がり率より「どれだけ減り、どれだけ待ったか」を前に出す(煽りに見せない)。
      // 高値で買った場合は 回復日 = 元本に戻った日。それ以外は回復日の評価額。最新は字数に余裕があれば添える
      var head = cfg.title + "の" + buy.label + "（" + jpDate(buy.date) + "）に日経平均へ" + yen(amount) + "投資していたら、" +
        (worst ? "途中" + yen(amount * worst.close / buy.close) + "まで減り、" : "");
      var mid = recVal == null ? ""
        : buy.key === "peak" ? "元本に戻るまで" + spanStr(buy.date, c.recovery_date) + "かかりました。"
        : "高値を回復した" + jpDate(c.recovery_date) + "には" + yen(recVal) + "でした。";
      var last = latest ? jpDate(latest.date) + "時点では" + yen(amount * latest.close / buy.close) + "です。" : "";
      var foot = "※指数終値の概算";
      var text = head + mid + (head.length + mid.length + last.length + foot.length <= SHARE_MAX ? last : "") + foot;
      xLink.href = "https://x.com/intent/post?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(shareUrl());
    }

    // シェアURL: 開いた人にも同じ条件で表示されるよう buy/amt を付け、シェア経由の流入を GA4 で区別する UTM を付ける
    function shareUrl() {
      return location.origin + location.pathname + "?buy=" + state.buy + "&amt=" + state.man +
        "&utm_source=x&utm_medium=social&utm_campaign=sim";
    }

    root.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b || !root.contains(b)) return;
      if (b.hasAttribute("data-buy")) state.buy = b.getAttribute("data-buy");
      else if (b.hasAttribute("data-man")) { state.man = +b.getAttribute("data-man"); input.value = state.man; }
      else return;
      update();
      track("simulate", { event_id: cfg.id, buy: state.buy, amount_man: state.man });
    });
    input.addEventListener("input", function () {
      var v = Math.floor(Number(input.value));
      if (!(v >= 1)) return;
      state.man = Math.min(v, MAX_MAN);
      update();
    });
    input.addEventListener("change", function () { track("simulate", { event_id: cfg.id, buy: state.buy, amount_man: state.man }); });
    xLink.addEventListener("click", function () { track("simulate_share", { event_id: cfg.id, buy: state.buy, amount_man: state.man }); });

    update();

    // 最新の終値は急落モードと同じ /state.json から(取れなければ回復時点のみ表示)
    if (window.fetch) {
      fetch("/state.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (s) {
        var m = s && s.metrics;
        if (m && m.close > 0 && s.as_of) { latest = { date: s.as_of, close: m.close }; update(); }
      }).catch(function () { /* 最新は出さない */ });
    }
  };

  window.StockListSimulator = NS;
})();
