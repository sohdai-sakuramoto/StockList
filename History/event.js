export const EVENTS = [
    {
      id: "great-east-japan",
      title: "東日本大震災（2011/03/11）",
      startDate: "2011-03-11",
      endDate: "2011-04-11",
      index: "Nikkei 225",
      dataPath: "./data/nikkei225_great-east-japan.json",
      summary: [
        "震災と原発事故報道でリスクオフが進行。",
        "短期で大きく下落した後、戻りも混在する局面。"
      ],
      news: [
        { title: "あなたの既存HTMLで整理しているニュース（例）", url: "#", source: "既存データ" }
      ],
      dataDisclaimer:
        "データはJSON同梱（MVP）。本番運用はライセンス・取得元規約を確認してください。"
    },
  
    {
      id: "lehman",
      title: "リーマンショック（2008/09/15 近辺）",
      startDate: "2008-09-15",
      endDate: "2008-10-15",
      index: "Nikkei 225",
      dataPath: "./data/nikkei225_lehman.json",
      summary: [
        "世界的な信用収縮・金融不安が顕在化。",
        "ボラティリティが急騰し、下落が連鎖しやすい局面。"
      ],
      news: [
        { title: "あなたの既存HTMLで整理しているニュース（例）", url: "#", source: "既存データ" }
      ],
      dataDisclaimer:
        "データはJSON同梱（MVP）。本番運用はライセンス・取得元規約を確認してください。"
    },
  
    {
      id: "covid",
      title: "コロナショック（2020/02/20 起点例）",
      startDate: "2020-02-20",
      endDate: "2020-03-20",
      index: "Nikkei 225",
      dataPath: "./data/nikkei225_covid.json",
      summary: [
        "感染拡大とロックダウン懸念でグローバル同時株安。",
        "急落と急反発が交互に出やすい局面。"
      ],
      news: [
        {
          date: "2020-04-01",
          title: "感染拡大で警戒感、851円安（4.50%）",
          body: "経済活動が停滞する警戒感から米株価指数先物が大幅安となり、日経平均の下げ幅は一時1000円を超えた。",
          url: "https://www.nikkei.com/article/DGXLASS0ISS16_R00C20A4000000/",
          source: "日本経済新聞"
        },
        {
          date: "2020-04-02",
          title: "米株安・国内感染悪化で246円安",
          body: "海外投資家の売りが先行したが、日銀のETF買い入れで下げ渋る場面もあった。",
          url: "https://www.nikkei.com/article/DGXLASS0ISS16_S0A400C2000000/",
          source: "日本経済新聞"
        },
        {
          date: "2020-04-07",
          title: "緊急事態宣言、756円高",
          body: "米国での感染ピーク期待や短期筋の買いで急反発。",
          url: "https://www.nikkei.com/article/DGXLASS0ISS16_W0A400C2000000/",
          source: "日本経済新聞",
          highlight: "東京など7都府県に緊急事態宣言"
        }
      ],
      dataDisclaimer:
        "コロナショックの起点日は便宜上の例です（サイト方針で起点日を固定してください）。"
    },
  
    {
      id: "ishiba",
      title: "石破ショック（2024/09/27 自民党総裁選）",
      startDate: "2024-09-27",
      endDate: "2024-10-27",
      index: "Nikkei 225",
      dataPath: "./data/nikkei225_ishiba.json",
      summary: [
        "総裁選結果を受け、政策不安（財政・金融、金融所得課税への警戒など）からリスクオフが意識されたとされる。",
        "週明け9/30は日経平均が大幅反落し、『石破ショック』と呼ばれる文脈で語られた。"
      ],
      news: [
        {
          title: "石破ショックは2度来る？（背景：円高・先物急落、金融所得課税への警戒）",
          url: "https://www.smd-am.co.jp/market/shiraki/2024/devil241018gl/",
          source: "三井住友DSアセットマネジメント"
        },
        {
          title: "2024/9/30 市況：石破氏勝利を受け大幅安（終値 37,919円）",
          url: "https://kabutan.jp/news/marketnews/?b=n202409300876",
          source: "株探（市況）"
        },
        {
          title: "『石破ショック』で株価急落（9/30 一時 37,797円まで下落）",
          url: "https://go.sbisec.co.jp/media/report/ma_flash/ma_flash_240930.html",
          source: "SBI証券"
        }
      ],
      dataDisclaimer:
        "石破ショックの説明は上記ソースを参考。本番の指数データ利用は権利・規約を必ず確認してください。"
    }
  ];  