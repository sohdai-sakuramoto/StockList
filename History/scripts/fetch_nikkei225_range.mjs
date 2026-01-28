import fs from "node:fs";

const [startYmd, endYmd, outPath] = process.argv.slice(2);
if (!startYmd || !endYmd || !outPath) {
  console.error("Usage: node fetch_nikkei225_range.mjs <startYYYYMMDD> <endYYYYMMDD> <outPath>");
  process.exit(1);
}

function ymdToDate(ymd){
  const y = Number(ymd.slice(0,4));
  const m = Number(ymd.slice(4,6)) - 1;
  const d = Number(ymd.slice(6,8));
  return new Date(Date.UTC(y,m,d));
}
function dateToISO(d){
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth()+1).padStart(2,"0");
  const day = String(d.getUTCDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function dateToYMD(d){
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth()+1).padStart(2,"0");
  const day = String(d.getUTCDate()).padStart(2,"0");
  return `${y}${m}${day}`;
}
function isWeekend(d){
  const w = d.getUTCDay();
  return w === 0 || w === 6;
}

// 日経公式のDaily Summary（英語）
// 例: https://indexes.nikkei.co.jp/en/nkave/archives/summary?dt=03152011  (2011/03/15) :contentReference[oaicite:5]{index=5}
function summaryUrl(ymd){
  const mm = ymd.slice(4,6);
  const dd = ymd.slice(6,8);
  const yyyy = ymd.slice(0,4);
  return `https://indexes.nikkei.co.jp/en/nkave/archives/summary?dt=${mm}${dd}${yyyy}`;
}

function parseNumberFromHtml(html, label){
  // label例: "Open", "High", "Low"
  // HTML構造は変わり得るので、まずは保守的に数字っぽい部分を拾う
  const re = new RegExp(`${label}\\s+([0-9,]+\\.[0-9]+|[0-9,]+)`, "i");
  const m = html.match(re);
  if (!m) return null;
  return Number(m[1].replaceAll(",",""));
}

function parseClose(html){
  // ページ内に「Nikkei Stock Average (Nikkei 225)」の直下に大きな数値が出る（例：2011/03/15は 8,605.15） :contentReference[oaicite:6]{index=6}
  const m = html.match(/Nikkei Stock Average \(Nikkei 225\)[\s\S]*?\n\s*([0-9,]+\.[0-9]+)/i);
  if (!m) return null;
  return Number(m[1].replaceAll(",",""));
}

async function fetchOne(ymd){
  const url = summaryUrl(ymd);
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; StockShockTimeline/1.0)" }
  });
  if (!res.ok) return null; // 休場日などは落ちる可能性あり
  const html = await res.text();

  const close = parseClose(html);
  const open = parseNumberFromHtml(html, "Open");
  const high = parseNumberFromHtml(html, "High");
  const low  = parseNumberFromHtml(html, "Low");

  if ([open, high, low, close].some(v => v === null)) return null;

  return {
    date: dateToISO(ymdToDate(ymd)),
    open, high, low, close
  };
}

const start = ymdToDate(startYmd);
const end = ymdToDate(endYmd);

const points = [];
for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)){
  if (isWeekend(d)) continue;
  const ymd = dateToYMD(d);
  const row = await fetchOne(ymd);
  if (row) points.push(row);
}

const out = {
  index: "Nikkei 225",
  startDate: dateToISO(start),
  endDate: dateToISO(end),
  points,
  sourceNote: "Nikkei Indexes 'Daily Summary' pages were used to compile OHLC/Close values. Check license/terms before publishing."
};

fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf-8");
console.log(`Wrote ${points.length} points -> ${outPath}`);
