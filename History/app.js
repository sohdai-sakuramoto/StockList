console.log("app.js loaded");
import { EVENTS } from "./event.js";

const $eventSelect = document.getElementById("eventSelect");
const $seriesSelect = document.getElementById("seriesSelect");
const $meta = document.getElementById("eventMeta");
const $news = document.getElementById("newsList");
const $note = document.getElementById("dataNote");

const canvas = document.getElementById("chart");
const ctx = canvas.getContext("2d");

let currentEvent = null;
let currentData = null;

function fmt(n){
  if (n === null || n === undefined) return "-";
  return Number(n).toLocaleString("ja-JP", { maximumFractionDigits: 2 });
}

function setOptions(){
  $eventSelect.innerHTML = "";
  for (const e of EVENTS){
    const opt = document.createElement("option");
    opt.value = e.id;
    opt.textContent = e.title;
    $eventSelect.appendChild(opt);
  }
}

function renderNews(newsList) {
    if (!$news) {
      console.error("newsList element not found. Check index.html id='newsList'");
      return;
    }
  
    if (!Array.isArray(newsList) || newsList.length === 0) {
      $news.innerHTML = "<p>関連ニュースはありません</p>";
      return;
    }
  
    $news.innerHTML = newsList.map(n => `
      <article class="news-item">
        <h3>${n.date ?? ""} ${n.title ?? ""}</h3>
        ${n.highlight ? `<h4 class="highlight">【${n.highlight}】</h4>` : ""}
        ${n.body ? `<p>${n.body}</p>` : ""}
        ${n.url ? `<a href="${n.url}" target="_blank" rel="noopener noreferrer">${n.source ?? "リンク"}</a>` : ""}
      </article>
    `).join("");
  }
  

async function loadEvent(eventId){
  currentEvent = EVENTS.find(e => e.id === eventId);
  if (!currentEvent) return;

  // meta
  $meta.innerHTML = `
    <div><div class="k">出来事</div><div class="v">${currentEvent.title}</div></div>
    <div><div class="k">期間</div><div class="v">${currentEvent.startDate} 〜 ${currentEvent.endDate}</div></div>
    <div><div class="k">指数</div><div class="v">${currentEvent.index}</div></div>
    <div><div class="k">概要</div><div class="v">${currentEvent.summary.map(s => `・${s}`).join("<br/>")}</div></div>
  `;
  
  console.log("DEBUG: about to render news");
  console.log("DEBUG currentEvent.id:", currentEvent?.id);
  console.log("DEBUG currentEvent.news:", currentEvent?.news);

  // news

  renderNews(currentEvent.news);
  console.log("DEBUG: renderNews done. innerHTML length:", $news?.innerHTML?.length);



  $note.textContent = currentEvent.dataDisclaimer ?? "";
  

  // data
  const res = await fetch(currentEvent.dataPath, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${currentEvent.dataPath}`);
  currentData = await res.json();

  draw();
}



function draw(){
  if (!currentData) return;

  const mode = $seriesSelect.value; // close / ohlc
  const points = currentData?.points ?? [];
  if (points.length === 0){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    return;
  }

  // chart area
  const W = canvas.width, H = canvas.height;
  const pad = { l: 54, r: 18, t: 18, b: 44 };

  ctx.clearRect(0,0,W,H);

  // choose series
  const values = points.map(p => mode === "close" ? p.close : p.close); // y is close; OHLC is shown in tooltip-like legend below
  const min = Math.min(...values);
  const max = Math.max(...values);

  // background
  ctx.fillStyle = "#0e1220";
  ctx.fillRect(0,0,W,H);

  // grid
  ctx.strokeStyle = "#2a3246";
  ctx.lineWidth = 1;

  const gridY = 5;
  for (let i=0;i<=gridY;i++){
    const y = pad.t + (H-pad.t-pad.b) * (i/gridY);
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(W-pad.r, y);
    ctx.stroke();
  }

  // axes labels (left)
  ctx.fillStyle = "#aab3c7";
  ctx.font = "12px ui-sans-serif, system-ui";
  for (let i=0;i<=gridY;i++){
    const v = max - (max-min) * (i/gridY);
    const y = pad.t + (H-pad.t-pad.b) * (i/gridY);
    ctx.fillText(fmt(v), 6, y+4);
  }

  // x axis ticks (few)
  const tickCount = Math.min(6, points.length);
  for (let i=0;i<tickCount;i++){
    const idx = Math.floor(i*(points.length-1)/(tickCount-1));
    const x = pad.l + (W-pad.l-pad.r) * (idx/(points.length-1));
    const y = H-pad.b;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y+6);
    ctx.stroke();

    const d = points[idx].date;
    ctx.fillText(d.slice(5).replace("-", "/"), x-18, H-18);
  }

  // line
  ctx.strokeStyle = "#6ea8fe";
  ctx.lineWidth = 2;
  ctx.beginPath();

  points.forEach((p, i) => {
    const x = pad.l + (W-pad.l-pad.r) * (i/(points.length-1));
    const y = pad.t + (H-pad.t-pad.b) * (1 - ((p.close - min)/(max-min || 1)));
    if (i === 0) ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // legend
  const last = points[points.length-1];
  const legend = document.getElementById("chartLegend");
  if ($seriesSelect.value === "close"){
    legend.textContent = `最終日 ${last.date} 終値: ${fmt(last.close)}`;
  } else {
    legend.textContent = `最終日 ${last.date} O:${fmt(last.open)} H:${fmt(last.high)} L:${fmt(last.low)} C:${fmt(last.close)}`;
  }
}

function bind(){
  $eventSelect.addEventListener("change", () => loadEvent($eventSelect.value));
  $seriesSelect.addEventListener("change", () => draw());
  window.addEventListener("resize", () => draw());
}

(async function init(){
  setOptions();
  bind();
  await loadEvent(EVENTS[0].id);
})();
