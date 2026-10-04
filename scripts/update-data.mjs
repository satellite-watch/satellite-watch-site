// 軌道データを CelesTrak から取ってきて data/sats.json に保存する。
// GitHub Actions が1日に数回動かす（見る人のブラウザは CelesTrak に直接アクセスしない）。
// 手元で動かすとき： npm run update-data
import { readFile, writeFile } from 'node:fs/promises';

const GROUPS = ['visual']; // 肉眼で見える明るい衛星（ISS・天宮を含む）
const URL_BASE = 'https://celestrak.org/NORAD/elements/gp.php';
// 取りに行くときの名乗り。提供元が誰のアクセスか分かるよう、サイトのアドレスを入れる
const UA = 'satellite-watch.jp data updater (https://satellite-watch.jp/)';
const KEEP = [
  'OBJECT_NAME', 'OBJECT_ID', 'EPOCH', 'MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION',
  'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'EPHEMERIS_TYPE',
  'CLASSIFICATION_TYPE', 'NORAD_CAT_ID', 'ELEMENT_SET_NO', 'REV_AT_EPOCH',
  'BSTAR', 'MEAN_MOTION_DOT', 'MEAN_MOTION_DDOT',
];

const byId = new Map();
for (const group of GROUPS) {
  const res = await fetch(`${URL_BASE}?GROUP=${group}&FORMAT=json`, {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`${group}: HTTP ${res.status}`);
  const list = await res.json();
  if (!Array.isArray(list) || list.length === 0) throw new Error(`${group}: データが空です`);
  for (const o of list) {
    byId.set(o.NORAD_CAT_ID, Object.fromEntries(KEEP.map((k) => [k, o[k]])));
  }
}

// 宇宙ステーション（ISS・天宮）は専用のページがあるので、visual グループから外れても番号を指定して取りに行く。
// それでも取れないときは保存しない（ステーションのページが空にならないように）
for (const id of [25544, 48274]) {
  if (byId.has(id)) continue;
  const res = await fetch(`${URL_BASE}?CATNR=${id}&FORMAT=json`, { headers: { 'User-Agent': UA } });
  const list = res.ok ? await res.json().catch(() => []) : [];
  if (!Array.isArray(list) || list.length === 0) throw new Error(`宇宙ステーション（${id}）の軌道データを取れませんでした`);
  byId.set(id, Object.fromEntries(KEEP.map((k) => [k, list[0][k]])));
}

// 衛星の登録台帳から、国（所有者）と打ち上げ日を足す。
// 台帳はほとんど変わらないので、取りに行くのは1日1回（UTCの0〜7時台に動いた回）か、国が分からない衛星があるときだけ。
// 取れなくても軌道データの更新は止めず、前回保存した国情報を使う
const OUT = new URL('../data/sats.json', import.meta.url);
const prev = new Map();
let prevSats = null;
try {
  prevSats = JSON.parse(await readFile(OUT, 'utf8')).sats;
  for (const o of prevSats) prev.set(o.NORAD_CAT_ID, o);
} catch { /* 初回は前回分なし */ }
const needCatalog = process.env.FORCE_CATALOG === '1' || new Date().getUTCHours() < 8
  || [...byId.keys()].some((id) => !prev.get(id)?.OWNER);
const cat = new Map();
for (const group of needCatalog ? GROUPS : []) {
  try {
    const res = await fetch(`https://celestrak.org/satcat/records.php?GROUP=${group}&FORMAT=json`, {
      headers: { 'User-Agent': UA },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    for (const r of await res.json()) cat.set(r.NORAD_CAT_ID, r);
  } catch (e) {
    console.warn(`登録台帳（${group}）を取れませんでした。前回の国情報を使います：${e.message}`);
  }
}
// 番号を指定して取った宇宙ステーションなど、visual グループの台帳に無い衛星は、番号を指定して台帳を取る
// （取らないと国が付かず、「国が分からない衛星がある」として毎回台帳を取りに行ってしまうため）
for (const id of byId.keys()) {
  if (!needCatalog || cat.has(id) || prev.get(id)?.OWNER) continue;
  try {
    const res = await fetch(`https://celestrak.org/satcat/records.php?CATNR=${id}&FORMAT=json`, { headers: { 'User-Agent': UA } });
    if (res.ok) for (const r of await res.json()) cat.set(r.NORAD_CAT_ID, r);
  } catch (e) {
    console.warn(`登録台帳（${id}）を取れませんでした：${e.message}`);
  }
}
for (const [id, o] of byId) {
  const src = cat.get(id) || prev.get(id);
  if (src?.OWNER) o.OWNER = src.OWNER;
  if (src?.LAUNCH_DATE) o.LAUNCH_DATE = src.LAUNCH_DATE;
  // レーダーで測った大きさ（㎡）。明るさの目安に使う。新しい衛星は空のことがある
  const rcs = Number(src?.RCS);
  if (src?.RCS != null && src.RCS !== '' && Number.isFinite(rcs)) o.RCS = rcs;
}

// 念のため：数が極端に減っていたら保存しない（配布元の不調で空に近いデータを配らないため）
if (byId.size < 50) throw new Error(`衛星の数が少なすぎます（${byId.size}機）。保存を中止しました`);

const sats = [...byId.values()].sort((a, b) => a.NORAD_CAT_ID - b.NORAD_CAT_ID);
// 中身が前回と同じなら保存しない（取得時刻だけが変わった記録を増やさないため）
if (prevSats && JSON.stringify(prevSats) === JSON.stringify(sats)) {
  console.log(`変更なし：${sats.length}機。保存しませんでした`);
  process.exit(0);
}
const out = {
  updated: new Date().toISOString(),
  source: 'CelesTrak (https://celestrak.org/)',
  sats,
};
await writeFile(OUT, JSON.stringify(out));
const noOwner = out.sats.filter((o) => !o.OWNER).length;
console.log(`保存しました：${out.sats.length}機（${out.updated}）${noOwner ? `／国が不明：${noOwner}機` : ''}`);
