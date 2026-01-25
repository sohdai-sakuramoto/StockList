// ============================
// イベント定義（MVP用 仮データ）
// ============================
const events = [
    {
      id: "20110311",
      name: "東日本大震災（2011年）",
      description: `
  2011年3月11日に発生した未曾有の大地震。
  原発事故や計画停電への懸念から、市場は急落。
  その後、短期的な大幅下落と急速な自律反発を経験。
      `,
      prices: [10200, 10100, 9600, 8600, 9000, 9200, 9500, 9800]
    },
    {
      id: "20080915",
      name: "リーマンショック（2008年）",
      description: `
  米投資銀行リーマン・ブラザーズの破綻をきっかけに、
  世界的な金融システム不安が顕在化。
  長期にわたる下落トレンドの起点となった。
      `,
      prices: [12500, 12000, 11000, 9500, 8800, 8200, 7600, 7200]
    },
    {
      id: "202003",
      name: "コロナショック（2020年）",
      description: `
  新型コロナウイルスの世界的流行により、
  経済活動停止への恐怖が急速に拡大。
  史上最速クラスの下落と、その後の急回復が特徴。
      `,
      prices: [23000, 21000, 19500, 16500, 18000, 20000, 22000, 24000]
    },
    {
      id: "kishida",
      name: "岸田ショック（2022年頃）",
      description: `
  新政権の経済政策・増税懸念・市場との対話不足への不安から、
  外国人投資家を中心にリスクオフが進行。
  「政治的不確実性」が株価に影響した事例。
      `,
      prices: [29000, 28500, 27000, 26500, 26800, 27200]
    },
    {
      id: "ishiba",
      name: "石破ショック（想定・政治不安イベント）",
      description: `
  首相交代観測や政局不安が強まった際に、
  市場が「政策の先行き不透明感」を嫌気して急落するケース。
  政治イベントも市場に影響を与えることを示す例。
  ※特定個人を評価する意図はありません。
      `,
      prices: [33000, 32500, 31000, 30500, 30800, 31500]
    }
  ];
  
  // ============================
  // 初期化
  // ============================
  const select = document.getElementById("eventSelect");
  const title = document.getElementById("eventTitle");
  const description = document.getElementById("eventDescription");
  
  let chart;
  
  // セレクトボックス生成
  events.forEach(e => {
    const opt = document.createElement("option");
    opt.value = e.id;
    opt.textContent = e.name;
    select.appendChild(opt);
  });
  
  // 初期表示
  renderEvent(events[0]);
  
  select.addEventListener("change", () => {
    const event = events.find(e => e.id === select.value);
    renderEvent(event);
  });
  
  // ============================
  // 描画処理
  // ============================
  function renderEvent(event) {
    title.textContent = event.name;
    description.innerText = event.description.trim();
  
    const labels = event.prices.map((_, i) => `Day ${i}`);
  
    if (chart) {
      chart.destroy();
    }
  
    chart = new Chart(
      document.getElementById("indexChart"),
      {
        type: "line",
        data: {
          labels,
          datasets: [{
            label: "日経平均（イメージ）",
            data: event.prices,
            borderColor: "rgba(220, 0, 0, 0.8)",
            backgroundColor: "rgba(220, 0, 0, 0.1)",
            tension: 0.2
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false }
          }
        }
      }
    );
  }
  