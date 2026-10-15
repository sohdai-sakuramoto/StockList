#!/usr/bin/env node
/**
 * Vercel の環境変数から、ブラウザで読む計測設定 /site-config.js を書き出す(Vercel のビルドで実行)。
 *
 * このサイトは素のHTMLでビルド工程が無く、ページから環境変数を直接読めないため、
 * vercel.json の buildCommand でデプロイ毎にこのスクリプトを実行し、値を site-config.js に埋め込む。
 * site-config.js は生成物なのでコミットしない(.gitignore)。値を変えたら再デプロイで反映される。
 *
 *   環境変数                 例                 用途
 *   GA_MEASUREMENT_ID        G-XXXXXXXXXX       GA4 の測定ID
 *
 * 値の形式が不正・未設定の項目は null にし、その計測は読み込まない(ビルドは失敗させない)。
 * 実行: GA_MEASUREMENT_ID=G-XXXX node backtest/scripts/write_site_config.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(ROOT, "site-config.js");

// 環境変数名 → 設定キーと許可する形式(HTML/JSに埋め込むため英数字等に限定)
export const ENV_SPEC = [
  { env: "GA_MEASUREMENT_ID", key: "gaId", re: /^G-[A-Z0-9]{4,20}$/ },
];

export function buildConfig(env) {
  const cfg = {};
  const warnings = [];
  for (const { env: name, key, re } of ENV_SPEC) {
    const v = (env[name] || "").trim();
    if (!v) { cfg[key] = null; warnings.push(`${name} が未設定のため無効`); continue; }
    if (!re.test(v)) { cfg[key] = null; warnings.push(`${name} の形式が不正なため無効: ${JSON.stringify(v)}`); continue; }
    cfg[key] = v;
  }
  return { cfg, warnings };
}

export function configJs(cfg) {
  return `/* 自動生成(backtest/scripts/write_site_config.mjs)。Vercel の環境変数から作るので編集しない */\nwindow.SL_CONFIG = ${JSON.stringify(cfg)};\n`;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const { cfg, warnings } = buildConfig(process.env);
  warnings.forEach((w) => console.warn(`[site-config] ${w}`));
  fs.writeFileSync(OUT, configJs(cfg), "utf8");
  console.log(`[site-config] site-config.js を出力: ${JSON.stringify(cfg)}`);
}
