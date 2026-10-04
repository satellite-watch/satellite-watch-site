// 国土地理院の市区町村コード表（https://maps.gsi.go.jp/js/muni.js）から、
// 地名検索の結果に「どの市区町村か」を添えるための対応表 data/muni.json を作る。
// 市町村合併があったときに作り直す： node scripts/build-muni.mjs
import { writeFile } from 'node:fs/promises';

const res = await fetch('https://maps.gsi.go.jp/js/muni.js');
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const text = await res.text();
const out = {};
for (const m of text.matchAll(/MUNI_ARRAY\["(\d+)"\]\s*=\s*'([^']*)'/g)) {
  const [, pref, , city] = m[2].split(',');
  out[String(Number(m[1]))] = `${pref}${city.replace(/[\s　]+/g, '')}`;
}
if (Object.keys(out).length < 1500) throw new Error('件数が少なすぎます');
await writeFile(new URL('../data/muni.json', import.meta.url), JSON.stringify(out));
console.log(`保存しました：${Object.keys(out).length}件`);
