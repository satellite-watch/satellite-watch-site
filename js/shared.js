// 衛星のページと星のページで共通に使うもの：日時（日本時間）の扱い、場所の保存、地名検索、現在地
export const JST = 9 * 3600000;
export const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
export const DEFAULT_PLACE = { name: '東京都千代田区', lat: 35.694003, lon: 139.753595 };

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 端末で「動きを減らす」設定をしている人には、なめらかな移動をしない
export const scrollBehavior = () => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

// ---------- 日時（日本時間で扱う） ----------
export function jstParts(ms) {
  const d = new Date(ms + JST);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), w: d.getUTCDay() };
}
export const pad = (n) => String(n).padStart(2, '0');
export const hm = (ms) => { const p = jstParts(ms); return `${p.h}:${pad(p.mi)}`; };
export const md = (ms) => { const p = jstParts(ms); return `${p.mo}月${p.d}日（${WEEK[p.w]}）`; };
export const mdShort = (ms) => { const p = jstParts(ms); return `${p.mo}/${p.d}（${WEEK[p.w]}）`; };
// 「夜」は正午から翌日の正午まで（夕方と明け方を同じ夜としてまとめる）
export function nightKey(ms) {
  const p = jstParts(ms - 12 * 3600000);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
}
export function nightNoon(key) {
  const [y, mo, d] = key.split('-').map(Number);
  return Date.UTC(y, mo - 1, d, 12) - JST;
}

// ---------- 場所（2つのページで同じ場所を使う） ----------
export function loadPlace() {
  try {
    const p = JSON.parse(localStorage.getItem('satsite:place'));
    if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.name) return p;
  } catch { /* 保存が使えない環境でも動くように */ }
  return null;
}
export function savePlace(p) {
  try { localStorage.setItem('satsite:place', JSON.stringify(p)); } catch { /* 無視 */ }
}

// 市区町村コード→「神奈川県平塚市」の対応表（同じ地名がたくさんあるとき区別するため）
let muniTable = null;
async function loadMuni() {
  if (muniTable) return muniTable;
  try {
    const res = await fetch('data/muni.json');
    muniTable = res.ok ? await res.json() : {};
  } catch { muniTable = {}; }
  return muniTable;
}

// 国土地理院の地名検索。市区町村そのもの → 名前がぴったり合うもの → その他、の順に並べる
function rankPlaces(q, list, muni) {
  const score = (t) => {
    // 「東京」「大阪」のように都道府県名を短く入れたときは、その都道府県を先頭に
    if (/^.{2,3}[都道府県]$/.test(t) && t.slice(0, -1) === q) return 0;
    if (new RegExp(`[都道府県]${escRe(q)}[市区町村]?$`).test(t)) return 0;
    if (t === q) return 1;
    if (/^.{2,3}[都道府県].+[市区町村]$/.test(t) && t.includes(q)) return 2;
    if (t.startsWith(q)) return 3;
    return 4;
  };
  const seen = new Set();
  return list
    .map((f) => {
      const title = f.properties.title;
      const city = muni[String(Number(f.properties.addressCode))];
      const pref = city ? /^.{2,3}?[都道府県]/.exec(city)?.[0] : null;
      const name = city && !title.startsWith(pref) ? `${city} ${title}` : title;
      return { title, name, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
    })
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && !seen.has(p.name) && seen.add(p.name))
    .map((p, i) => ({ ...p, s: score(p.title), i }))
    .sort((a, b) => a.s - b.s || a.i - b.i);
}
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 「東京」「神奈川」のように都道府県名を短く入れたとき、その都道府県の正式な名前（東京都など）を返す
function prefectureFor(q, muni) {
  if (/[都道府県]$/.test(q)) return null;
  for (const city of Object.values(muni)) {
    const pref = /^.{2,3}?[都道府県]/.exec(city)?.[0];
    if (pref && pref.slice(0, -1) === q) return pref;
  }
  return null;
}
const gsiSearch = async (q) => {
  const res = await fetch(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(res.status);
  return res.json();
};

// 地名を探して候補を出す。選ばれたら onPick({ name, lat, lon }) を呼ぶ
// （画面の部品は #place-msg・#place-results。2つのページで同じ名前にしてある）
let searchSeq = 0;
export async function searchPlace(q, onPick) {
  const msg = $('place-msg');
  const ul = $('place-results');
  const seq = ++searchSeq; // 続けて押したとき、古い検索の結果で上書きしないように
  msg.classList.remove('is-error');
  msg.textContent = '探しています…';
  ul.hidden = true;
  try {
    const muni = await loadMuni();
    const ranked = rankPlaces(q, await gsiSearch(q), muni);
    // 検索結果に都道府県そのものが入っていないことがあるので、正式な名前でも探して先頭に加える
    // （位置は都道府県庁のあたり）
    const pref = prefectureFor(q, muni);
    if (pref && !ranked.some((p) => p.title === pref)) {
      const hit = (await gsiSearch(pref)).find((f) => f.properties.title === pref);
      if (hit) ranked.unshift({ title: pref, name: pref, lon: hit.geometry.coordinates[0], lat: hit.geometry.coordinates[1] });
    }
    if (seq !== searchSeq) return;
    if (ranked.length === 0) {
      msg.textContent = `「${q}」は見つかりませんでした。市区町村名（例：札幌市、新宿区）で試してみてください。`;
      return;
    }
    const top = ranked.slice(0, 8);
    ul.innerHTML = top.map((p, i) => `<li><button type="button" data-i="${i}">${esc(p.name)}</button></li>`).join('');
    ul.hidden = false;
    ul.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const p = top[+b.dataset.i];
      msg.textContent = ''; // 選ぶ側（onPick）が案内を出すことがあるので、先に消す
      onPick({ name: p.name, lat: p.lat, lon: p.lon });
    };
    msg.textContent = ranked.length > 8
      ? `${ranked.length}件見つかりました。上から8件を出しています。選んでください。`
      : '選んでください。';
  } catch {
    if (seq !== searchSeq) return;
    msg.classList.add('is-error');
    // 地名検索（国土地理院）は長く提供される保証がない（2015年の国土地理院の回答）ので、止まったときの代わりの手段も伝える
    msg.textContent = '地名を探せませんでした。通信状態を確かめて、もう一度お試しください。「現在地」ボタンでも場所を選べます。';
  }
}

export function useGeolocation(onPick) {
  const msg = $('place-msg');
  msg.classList.remove('is-error');
  if (!navigator.geolocation) {
    msg.classList.add('is-error');
    msg.textContent = 'この端末では現在地を使えません。地名で探してください。';
    return;
  }
  msg.textContent = '現在地を調べています…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      // 約1kmに丸める（予報には十分。細かい位置を端末に残さないため）
      const lat = Math.round(pos.coords.latitude * 100) / 100;
      const lon = Math.round(pos.coords.longitude * 100) / 100;
      msg.textContent = ''; // 選ぶ側（onPick）が案内を出すことがあるので、先に消す
      onPick({ name: `現在地（北緯${lat.toFixed(2)}°・東経${lon.toFixed(2)}°）`, lat, lon });
    },
    (err) => {
      msg.classList.add('is-error');
      msg.textContent = err.code === 1
        ? '現在地の利用が許可されていません。地名で探してください。'
        : '現在地がわかりませんでした。地名で探してください。';
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
  );
}
