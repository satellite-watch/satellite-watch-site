// 衛星の位置・見え方の計算（画面側と、裏で動く計算係の両方から使う）
import {
  json2satrec, propagate, gstime, eciToEcf, eciToGeodetic, ecfToLookAngles, sunPos, shadowFraction, jday,
} from '../lib/satellite.min.js';
import { purposeOf } from './purposes.js';

const DEG = 180 / Math.PI;
const AU_KM = 149597870.7;

// 見える条件：衛星が地平線から10°以上／観測地の太陽が-6°より下（空が十分暗い）／衛星に日が当たっている
export const MIN_EL = 10;
export const SUN_LIMIT = -6;

// 日本語名（有名なものだけ。ほかは登録名のまま）。国は別に出すので名前には入れない
const JP_NAMES = {
  25544: '国際宇宙ステーション（ISS）',
  48274: '天宮（宇宙ステーション）',
  20580: 'ハッブル宇宙望遠鏡',
  16908: 'あじさい（測地衛星）',
  27597: 'みどりII（地球観測衛星）',
  28931: 'だいち（地球観測衛星）',
  39766: 'だいち2号（地球観測衛星）',
  41337: 'ひとみ（X線天文衛星）',
  57800: 'XRISM（X線天文衛星）',
  10967: 'シーサット（海洋観測衛星）',
  25994: 'テラ（地球観測衛星）',
  27424: 'アクア（地球観測衛星）',
  27386: 'エンビサット（地球観測衛星）',
};

// 衛星の登録台帳の「所有者」の記号 → 日本語
const OWNERS = {
  CIS: 'ロシア（旧ソ連）', US: 'アメリカ', PRC: '中国', JPN: '日本', FR: 'フランス',
  ESA: '欧州宇宙機関', ARGN: 'アルゼンチン', CA: 'カナダ', ISS: '国際共同', IT: 'イタリア',
  IND: 'インド', UK: 'イギリス', GER: 'ドイツ', SKOR: '韓国', ISRA: 'イスラエル',
  BRAZ: 'ブラジル', SPN: 'スペイン', AUS: 'オーストラリア', NETH: 'オランダ', UAE: 'アラブ首長国連邦',
  EUME: '欧州気象衛星機関', EUTE: 'ユーテルサット',
};

const STATIONS = new Set([25544, 48274]);

// 「明るい衛星」の目安：レーダーで測った大きさが10㎡以上（大きいほど太陽の光を多く反射する）。
// 大きさの値がない新しい衛星のうち、宇宙ステーションと大型通信衛星 BlueBird（アンテナ約64㎡）は含める
export const BIG_RCS = 10;
const isBig = (id, name, rcs) => STATIONS.has(id) || /^SPACEMOBILE/.test(name) || (rcs ?? 0) >= BIG_RCS;

export function makeSat(omm) {
  const id = omm.NORAD_CAT_ID;
  const name = omm.OBJECT_NAME;
  let kind = '人工衛星';
  if (STATIONS.has(id)) kind = '宇宙ステーション';
  else if (/R\/B/.test(name) || id === 694) kind = 'ロケットの一部'; // 694 は名前に R/B がないがロケットの上の段
  else if (/\bDEB\b/.test(name)) kind = '破片';
  let jp = JP_NAMES[id] || null;
  if (!jp && /^H-2A R\/B/.test(name)) jp = 'H-IIAロケットの一部';
  if (!jp && /^SPACEMOBILE/.test(name)) jp = `通信衛星 ${name.replace('SPACEMOBILE-', 'BlueBird ')}（大型）`;
  let satrec = null;
  try { satrec = json2satrec(omm); } catch { satrec = null; }
  const country = OWNERS[omm.OWNER] || null;
  const launchYear = /^\d{4}/.exec(omm.LAUNCH_DATE || '')?.[0] || null;
  return {
    id, name, jp, kind, country, launchYear, satrec, epoch: omm.EPOCH,
    owner: omm.OWNER || null, // 登録台帳の所有者の記号（地図の国別の色分けに使う）
    purpose: purposeOf(id, name), // 目的（一言）
    bright: STATIONS.has(id), // 宇宙ステーション（とても明るい）
    big: isBig(id, name, omm.RCS), // 明るい衛星（街中でも見つけやすい目安）
  };
}

export function displayName(sat) {
  return sat.jp || sat.name;
}

// 「ロシア（旧ソ連）・1989年打ち上げ」
export function originText(sat) {
  return [sat.country, sat.launchYear && `${sat.launchYear}年打ち上げ`].filter(Boolean).join('・');
}

export function makeObserver(lat, lon, heightM = 0) {
  return { latitude: lat / DEG, longitude: lon / DEG, height: heightM / 1000 };
}

function sunEciKm(date) {
  const { rsun } = sunPos(jday(date));
  return { rsunAU: rsun, km: { x: rsun.x * AU_KM, y: rsun.y * AU_KM, z: rsun.z * AU_KM } };
}

// 観測地から見た太陽の高さ（度）
export function sunElevation(obs, date) {
  const gmst = gstime(date);
  const { km } = sunEciKm(date);
  return ecfToLookAngles(obs, eciToEcf(km, gmst)).elevation * DEG;
}

// ある時刻の衛星の状態（方角・高さ・真下の地点・日が当たっているか）
export function satState(sat, obs, date, gmst = gstime(date), sun = null) {
  if (!sat.satrec) return null;
  let pv;
  try { pv = propagate(sat.satrec, date); } catch { return null; }
  if (!pv || !pv.position || Number.isNaN(pv.position.x)) return null;
  const eci = pv.position;
  const look = ecfToLookAngles(obs, eciToEcf(eci, gmst));
  const geo = eciToGeodetic(eci, gmst);
  const s = sun || sunEciKm(date);
  return {
    az: ((look.azimuth * DEG) % 360 + 360) % 360,
    el: look.elevation * DEG,
    range: look.rangeSat,
    lat: geo.latitude * DEG,
    lon: geo.longitude * DEG,
    alt: geo.height,
    sunlit: shadowFraction(s.rsunAU, eci) < 0.5,
  };
}

// 見え方の3区分
export function visibility(state, sunEl) {
  if (!state || state.el < 0) return 'below';
  if (sunEl > SUN_LIMIT) return 'daylight'; // 空が明るくて見えない
  if (!state.sunlit) return 'shadow'; // 地球の影に入っていて見えない
  if (state.el < MIN_EL) return 'low'; // 低すぎて見えにくい
  return 'visible';
}

// ある時刻に空に出ている衛星と、全衛星の真下の地点
export function snapshot(sats, obs, date) {
  const gmst = gstime(date);
  const sun = sunEciKm(date);
  const sunEl = sunElevation(obs, date);
  const list = [];
  for (const sat of sats) {
    const st = satState(sat, obs, date, gmst, sun);
    if (!st) continue;
    list.push({ sat, st, vis: visibility(st, sunEl) });
  }
  return { sunEl, list };
}

// 地図に描く通り道（真下の地点の連なり）
export function groundTrack(sat, date, beforeMin = 45, afterMin = 90, stepMin = 1) {
  const pts = [];
  for (let m = -beforeMin; m <= afterMin; m += stepMin) {
    const d = new Date(date.getTime() + m * 60000);
    let pv;
    try { pv = propagate(sat.satrec, d); } catch { continue; }
    if (!pv || !pv.position) continue;
    const g = eciToGeodetic(pv.position, gstime(d));
    pts.push([g.latitude * DEG, g.longitude * DEG]);
  }
  return pts;
}

// 見える回（パス）を探す。start から days 日間
export function findPasses(sats, obs, start, days, onProgress) {
  const STEP = 60; // 秒
  const t0 = start.getTime();
  const n = Math.ceil((days * 86400) / STEP);

  // 1) 空が暗い時刻の一覧（衛星ごとに毎回計算しないよう先に作る）
  const dark = new Uint8Array(n + 1);
  const gmsts = new Float64Array(n + 1);
  const suns = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const d = new Date(t0 + i * STEP * 1000);
    gmsts[i] = gstime(d);
    if (sunElevation(obs, d) <= SUN_LIMIT) {
      dark[i] = 1;
      suns[i] = sunEciKm(d);
    }
  }

  // 観測地の向き（地球の中心から見た単位ベクトル）
  const ou = {
    x: Math.cos(obs.latitude) * Math.cos(obs.longitude),
    y: Math.cos(obs.latitude) * Math.sin(obs.longitude),
    z: Math.sin(obs.latitude),
  };

  const passes = [];
  sats.forEach((sat, si) => {
    if (!sat.satrec) return;
    const reach = reachOf(sat.satrec);
    let runStart = -1;
    let i = 0;
    while (i <= n + 1) {
      let ok = false;
      let skip = 1;
      if (i <= n && dark[i]) {
        const r = quickVisible(sat, obs, ou, reach, t0 + i * STEP * 1000, gmsts[i], suns[i]);
        ok = r.ok;
        skip = r.skip;
      }
      if (ok && runStart < 0) runStart = i;
      if (!ok && runStart >= 0) {
        const p = refinePass(sat, obs, t0 + runStart * STEP * 1000, t0 + (i - 1) * STEP * 1000, STEP);
        if (p) passes.push(p);
        runStart = -1;
      }
      i += ok ? 1 : skip;
    }
    if (onProgress) onProgress((si + 1) / sats.length);
  });
  passes.sort((a, b) => a.start.t - b.start.t);
  return passes;
}

// 衛星ごとの「見える範囲の広さ」と「1分で動く角度の上限」（計算を飛ばしてよい量を決めるため）
function reachOf(satrec) {
  const XKE = 0.0743669161; // 地球半径・分の単位での重力定数
  const e = satrec.ecco;
  const a = Math.pow(XKE / satrec.no, 2 / 3); // 地球半径を1とした長半径
  const apogee = a * (1 + e); // いちばん遠いときの地球中心からの距離
  const elR = MIN_EL / DEG;
  const maxAngle = (Math.acos(Math.min(1, Math.cos(elR) / apogee)) - elR) * DEG; // 見える範囲（地球中心から見た角度）
  const rate = satrec.no * DEG * Math.pow(1 + e, 2) / Math.pow(1 - e * e, 1.5) * 1.1 + 0.26; // 度/分（地球の自転分を足す）
  return { maxAngle: maxAngle + 1, rate };
}

// 粗く探すとき用の軽い判定。見えないときは「あと何分は見えるはずがないか」も返す
function quickVisible(sat, obs, ou, reach, ms, gmst, sun) {
  let pv;
  try { pv = propagate(sat.satrec, new Date(ms)); } catch { return { ok: false, skip: 1 }; }
  if (!pv || !pv.position || Number.isNaN(pv.position.x)) return { ok: false, skip: 1 };
  const ecf = eciToEcf(pv.position, gmst);
  const r = Math.hypot(ecf.x, ecf.y, ecf.z);
  const angle = Math.acos(Math.max(-1, Math.min(1, (ecf.x * ou.x + ecf.y * ou.y + ecf.z * ou.z) / r))) * DEG;
  if (angle > reach.maxAngle) {
    return { ok: false, skip: Math.max(1, Math.floor((angle - reach.maxAngle) / reach.rate)) };
  }
  const el = ecfToLookAngles(obs, ecf).elevation * DEG;
  if (el < MIN_EL) return { ok: false, skip: 1 };
  return { ok: shadowFraction(sun.rsunAU, pv.position) < 0.5, skip: 1 };
}

// 粗く見つけた回を、5秒きざみで細かく調べ直す
function refinePass(sat, obs, firstMs, lastMs, stepSec) {
  const FINE = 5000;
  const from = firstMs - stepSec * 1000;
  const to = lastMs + stepSec * 1000;
  const track = [];
  let start = null, end = null, max = null;
  for (let t = from; t <= to; t += FINE) {
    const d = new Date(t);
    const st = satState(sat, obs, d);
    if (!st) continue;
    const sunEl = sunElevation(obs, d);
    const ok = st.el >= MIN_EL && st.sunlit && sunEl <= SUN_LIMIT;
    if (ok) {
      const pt = { t, az: st.az, el: st.el };
      if (!start) start = { ...pt, why: startReason(sat, obs, t - FINE) };
      end = pt;
      if (!max || st.el > max.el) max = pt;
      track.push(pt);
    } else if (start && !end.why) {
      end.why = st.el < MIN_EL ? 'horizon' : !st.sunlit ? 'shadow' : 'dawn';
    }
  }
  if (!start || track.length < 2) return null;
  if (!end.why) end.why = 'horizon';
  return { satId: sat.id, start, max, end, track: thin(track, 15000) };
}

// 見え始めの理由：地平線から上がってきたのか、影から出てきたのか
function startReason(sat, obs, prevMs) {
  const d = new Date(prevMs);
  const st = satState(sat, obs, d);
  if (!st || st.el < MIN_EL) return 'horizon';
  if (!st.sunlit) return 'shadow';
  return 'dusk';
}

function thin(track, everyMs) {
  const out = [];
  let last = -Infinity;
  track.forEach((p, i) => {
    if (p.t - last >= everyMs || i === track.length - 1) {
      out.push(p);
      last = p.t;
    }
  });
  return out;
}

// 方角を8方位の日本語に
const DIRS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
export function dirName(az) {
  return DIRS[Math.round(az / 45) % 8];
}

// 高さを言葉に
export function heightWord(el) {
  el = Math.round(el); // 画面に出す数字（四捨五入）と言葉をそろえる
  if (el >= 75) return 'ほぼ真上';
  if (el >= 50) return '高い';
  if (el >= 30) return '中くらい';
  return '低め';
}
