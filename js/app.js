// 画面の動き：場所・日時の入力、見える回の一覧、空の図、地図
import {
  makeSat, makeObserver, snapshot, groundTrack, displayName, originText, dirName, heightWord,
  sunElevation, SUN_LIMIT,
} from './astro.js';
import {
  $, esc, DEFAULT_PLACE, scrollBehavior,
  jstParts, toInputValue, fromInputValue, hm, md, mdShort, nightKey, nightNoon,
  loadPlace, savePlace, searchPlace, useGeolocation,
} from './shared.js';
import { PHOTOS } from './images.js';

// 予報を出すのは「今夜から7夜分」まで（今日から7日先の朝まで）。先ほど軌道の予報がずれやすいため。
// 先の日付を選ぶと、その分だけ夜の数が減る（2026-09-29 オーナー判断）
const NIGHTS = 7;
const PAST_DAYS = 3; // 選べる日付：今日の3日前から
const EASY_EL = 40; // 見やすい回＝最も高いところが40°以上（宇宙ステーションは STATION_MIN_EL）
const ISS_RANGE_KM = 1390; // 高さ約420kmのISSが高さ10°以上に見える範囲の目安
// 宇宙ステーションのページ（iss.html・tiangong.html）では、その衛星の回だけをいつも出す（<body data-sat="番号">）
const FIXED_SAT = Number(document.body.dataset.sat) || null;
// 7夜とも見えないとき、その先どこまで「次に見え始める日」を探すか（今日から約3週間。2026-10-02 オーナー判断：日付だけ出す）
const AHEAD_DAYS = 14;

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const savedPlace = loadPlace();
const state = {
  sats: [],
  satById: new Map(),
  place: savedPlace || DEFAULT_PLACE,
  firstVisit: !savedPlace, // まだ場所を選んだことがない（仮に東京で表示している）
  baseTime: Date.now(),
  passes: [],
  night: null,
  minEl: EASY_EL,
  onlyBig: true, // 最初は明るい衛星だけ
  onlyStations: false,
  onlySat: null, // 図鑑の「この衛星が見える時間を調べる」から来たとき、その衛星の番号（その衛星の回だけを出す）
  jumpToSat: false, // その衛星が見える最初の夜を選ぶ（計算が終わったときに1回だけ。場所や日時を変えたときも選び直す）
  ahead: null, // 宇宙ステーションのページで7夜とも見えないときの、その先の回（null＝探していない／'loading'／見つかった回の配列）
  computing: false, // 見える回を計算しているあいだ（「見える回がありません」を早まって出さないため）
  scrollToList: false, // 図鑑から来たとき、最初の計算が終わったら一覧へ移る（1回だけ）
  selected: null, // 選んだ回
  anchor: Date.now(), // 時刻つまみの中心
  offset: 0, // 分
  playTimer: null,
  reqId: 0,
  data: 'loading', // 軌道データ：loading／ok／error
  colorMode: 'vis', // 地図の点の色分け：vis（見えるかどうか）／country（国別）。開くたびに「見えるかどうか」から始める（2026-09-30 オーナー判断）
};

// ---------- 日時 ----------
// その時刻から見た「今夜」。午前中でも、空が明るくなって夜が終わっていれば、その日の夕方からの夜を指す
function currentNightKey(ms) {
  if (jstParts(ms).h < 12) {
    const obs = makeObserver(state.place.lat, state.place.lon);
    if (sunElevation(obs, new Date(ms)) > SUN_LIMIT) return nightKey(ms + 12 * 3600000);
  }
  return nightKey(ms);
}

// ---------- 場所 ----------
function setColorMode(mode) {
  state.colorMode = mode;
  document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  $('legend-vis').hidden = mode !== 'vis';
  $('legend-country').hidden = mode !== 'country';
  // 国別は凡例がないと色の意味が分からない（中国の黄色を「見える」と読み違える）ので、自動で開く
  if (mode === 'country') setLegendOpen(true);
  renderView();
}
function setLegendOpen(open) {
  $('legends').classList.toggle('is-collapsed', !open);
  $('legend-toggle').setAttribute('aria-expanded', String(open));
  $('legend-arrow').textContent = open ? ' ▴' : ' ▾';
}

function setPlace(p) {
  state.place = p;
  savePlace(p);
  state.firstVisit = false;
  $('place-notice').hidden = true;
  $('place-name').textContent = p.name;
  updateSummary();
  // スマホでも「場所と日時」は開いたままにする（続けて日時も変えられるように。閉じるのは「閉じる」ボタンで。2026-10-05 オーナー判断）
  $('place-results').hidden = true;
  // 欄が開いたままなので、切り替わったことを一言で知らせる（#place-msg は読み上げにも伝わる）
  $('place-msg').classList.remove('is-error');
  $('place-msg').textContent = `${p.name}の予報に切り替えました。続けて日時も変えられます。`;
  $('to-map').hidden = false; // スマホだけに出る（CSS）。地図へひと押しで移れるように
  state.selected = null;
  if (state.onlySat) state.jumpToSat = true; // 1機に絞っているときは、新しい場所でその衛星が見える最初の夜を選び直す
  updateObserverOnMap(true);
  requestPasses();
  renderView();
}

// スマホで畳んでいる「場所と日時」の要約と開け閉め
function updateSummary() {
  // 仮の場所（東京）のときは、畳んでいるあいだだけ要約で伝える（開いているときは上の案内の枠で伝えている）
  $('sum-place').textContent = state.firstVisit && $('controls').classList.contains('is-collapsed') ? '仮に東京（千代田区）で表示しています' : state.place.name;
  $('sum-time').textContent = state.data === 'error' ? '' : `${mdShort(state.baseTime)} ${hm(state.baseTime)}から${nightKeys().length}夜分`;
  $('sum-msg').textContent = state.data === 'error' ? '軌道データを読み込めませんでした' : '';
}
function toggleControls(open) {
  $('controls').classList.toggle('is-collapsed', !open);
  $('controls-toggle').setAttribute('aria-expanded', String(open));
  $('controls-toggle').textContent = open ? '閉じる' : '変える';
  updateSummary();
}

// ---------- 見える回の計算（裏で行う） ----------
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
worker.onmessage = (e) => {
  const m = e.data;
  if (m.id !== state.reqId) return; // 古い依頼の結果は捨てる
  if (m.type === 'progress') {
    $('passes-status').textContent = `計算しています…（${Math.round(m.p * 100)}%）`;
  } else if (m.type === 'ahead') {
    state.ahead = m.passes;
    renderPasses();
    renderView();
  } else if (m.type === 'passes') {
    state.passes = m.passes;
    state.computing = false;
    requestAhead();
    const keys = nightKeys();
    if (!keys.includes(state.night)) state.night = keys[0];
    // 図鑑から来たときは、その衛星が見える最初の夜を選んでおく
    if (state.jumpToSat) {
      state.jumpToSat = false;
      state.night = keys.find((k) => filteredPasses(k).length > 0) || state.night;
      // 図鑑から来たのはこの衛星の見える時間を知るためなので、一覧へ移る（最初の1回だけ）
      // （宇宙ステーションのページは、先頭の見出しと説明から読んでもらうので移らない）
      if (state.scrollToList) $('passes').scrollIntoView({ behavior: 'auto', block: 'start' });
      state.scrollToList = false;
    }
    renderNightTabs();
    renderPasses();
    renderView(); // 「次に見える回」の案内を出すため
  }
};
worker.onerror = () => {
  $('passes-status').textContent = '計算できませんでした。ページを読み込み直してください。';
};

function requestPasses() {
  if (state.sats.length === 0) return;
  state.reqId += 1;
  state.passes = [];
  state.computing = true;
  renderNightTabs(); // 前の場所や日時の回数を出したままにしない（計算が終わるまで「…」）
  $('pass-list').innerHTML = '';
  $('passes-status').textContent = '計算しています…';
  // 最後の夜も明け方まで計算する（途中で切れた夜を作らない）
  const keys = nightKeys();
  const end = nightNoon(keys[keys.length - 1]) + 86400000;
  const days = (end - state.baseTime) / 86400000;
  worker.postMessage({ type: 'passes', id: state.reqId, lat: state.place.lat, lon: state.place.lon, start: state.baseTime, days });
}

// 宇宙ステーションのページで、7夜のうちに一度も見えない（低い回も含めて）とき、
// または低い回しかないとき（2026-10-05 オーナー判断）に、その先を探す。
// 7夜より先は軌道の変化で時刻がずれやすいので、画面には日付だけを出す
function requestAhead() {
  state.ahead = null;
  state.aheadEasyOnly = false;
  const sat = state.satById.get(FIXED_SAT);
  const mine = state.passes.filter((p) => p.satId === FIXED_SAT);
  if (!FIXED_SAT || !sat || mine.some((p) => isEasy(p, sat))) return;
  state.aheadEasyOnly = mine.length > 0; // 低い回はあるが、見やすい回（25°以上）がない
  state.ahead = 'loading';
  const keys = nightKeys();
  const start = nightNoon(keys[keys.length - 1]) + 86400000;
  worker.postMessage({ type: 'ahead', id: state.reqId, lat: state.place.lat, lon: state.place.lon, start, days: AHEAD_DAYS, satId: FIXED_SAT });
}
// 「次は○月○日ごろの明け方から見え始める見込み」の文（日付だけ。時刻は出さない）
function aheadText() {
  if (!Array.isArray(state.ahead)) return '';
  if (state.aheadEasyOnly) { // 7夜のうちに低い回しかないときは、「見やすい回」がいつからかだけを言う
    const easy = state.ahead.find((p) => Math.round(p.max.el) >= STATION_MIN_EL);
    return easy
      ? `見やすい回（高さ${STATION_MIN_EL}°以上）は、<b>${md(easy.start.t)}ごろの${whenWord(easy.start.t).split(' ')[1]}</b>から見える見込みです。日が近づいたら、もう一度確かめてください。`
      : `見やすい回（高さ${STATION_MIN_EL}°以上）は、その先${AHEAD_DAYS}日ほども無い見込みです。`;
  }
  const first = state.ahead[0];
  if (!first) return `その先${AHEAD_DAYS}日ほども見える回はない見込みです。`;
  const when = (p) => `<b>${md(p.start.t)}ごろの${whenWord(p.start.t).split(' ')[1]}</b>`; // 日付だけ太く（文の中で目で拾いやすく）
  const easy = state.ahead.find((p) => Math.round(p.max.el) >= STATION_MIN_EL);
  const high = easy && easy !== first ? `（見やすい回（高さ${STATION_MIN_EL}°以上）は${when(easy)}から）` : '';
  return `次は${when(first)}から見え始める見込みです${high}。日が近づいたら、もう一度確かめてください。`;
}

// 予報を出せる最後の夜（今日から見た「今夜」を含めて7夜目）
function lastNightKey() {
  return nightKey(nightNoon(currentNightKey(Date.now())) + (NIGHTS - 1) * 86400000 + 3600000);
}
// 予報を出す夜の一覧（選んだ日時から見た「今夜」から、最後の夜まで。多くて7夜分）
function nightKeys() {
  const first = nightNoon(currentNightKey(state.baseTime));
  const last = nightNoon(lastNightKey());
  const n = Math.max(1, Math.min(NIGHTS, Math.round((last - first) / 86400000) + 1));
  return Array.from({ length: n }, (_, i) => nightKey(first + i * 86400000 + 3600000));
}

// 見やすい回＝高さ40°以上。宇宙ステーションはとても明るいので25°以上も含める
const STATION_MIN_EL = 25;
const SHORT_SEC = 120; // 「短い」の目印：見えている時間が2分未満
// 見やすい回か（絞り込みの「見やすい回だけ」と同じ基準。札に「見やすい」を出すのに使う）
// 高さは画面に出す数字（四捨五入した値）で比べる。「40°」と出ているのに見やすい回に入らない、を防ぐ
const isEasy = (p, sat) => Math.round(p.max.el) >= (sat?.bright ? STATION_MIN_EL : EASY_EL);
// 絞り込み。f で一部の条件を外した数も数えられる（0回のときの案内に使う）
function filteredPasses(key, f = {}) {
  return state.passes.filter((p) => nightKey(p.start.t) === key && matchesFilters(p, f));
}
// いまの絞り込み（見やすい回だけ・明るい衛星だけ・宇宙ステーションだけ）に合う回か
function matchesFilters(p, f = {}) {
  const minEl = f.minEl ?? state.minEl;
  const onlyBig = f.onlyBig ?? state.onlyBig;
  const onlyStations = f.onlyStations ?? state.onlyStations;
  const sat = state.satById.get(p.satId);
  if (Math.round(p.max.el) < (sat?.bright ? Math.min(minEl, STATION_MIN_EL) : minEl)) return false; // 画面の数字とそろえて四捨五入で比べる
  return satMatches(sat, p.satId, onlyBig, onlyStations);
}
// 衛星そのものが絞り込み（1機だけ・宇宙ステーションだけ・明るい衛星だけ）に合うか
function satMatches(sat, id = sat?.id, onlyBig = state.onlyBig, onlyStations = state.onlyStations) {
  if (state.onlySat && id !== state.onlySat) return false;
  if (onlyStations && !sat?.bright) return false;
  if (onlyBig && !sat?.big) return false;
  return true;
}
// 1機に絞っていて、この先の夜に条件に合う回がないときの文。
// 「見やすい回だけ」で0回になっているだけなら、そう言い、外すと何回あるかも添える（「見える回がない」と言い切らない）
function satNoneText(name) {
  const keys = nightKeys();
  const easyOnly = state.minEl > 10;
  const low = easyOnly ? keys.reduce((n, k) => n + filteredPasses(k, { minEl: 10 }).length, 0) : 0;
  return `この先${keys.length}夜は、${name ? `${name}の` : ''}${easyOnly ? '見やすい回' : '見える回'}がありません。${low ? `「見やすい回だけ」を外すと${low}回あります。` : ''}`;
}

// ---------- 図鑑から来たとき：その衛星の回だけを出す ----------
// 図鑑の「この衛星が見える時間を調べる」は index.html?sat=番号 で来る。
// その衛星を見るのが目的なので、低い回も含めて全部出す（絞り込みのチェックも外して見せる。2026-10-01 オーナー判断）
function applySatFromUrl() {
  const id = FIXED_SAT || Number(new URLSearchParams(location.search).get('sat'));
  const sat = id && state.satById.get(id);
  // 宇宙ステーションのページで、その衛星が軌道データに入っていないとき：ほかの衛星を出さず、取れていないことを知らせる（renderPasses）
  if (FIXED_SAT && !sat) { state.onlySat = FIXED_SAT; return; }
  if (!sat) return;
  state.onlySat = id;
  state.jumpToSat = true;
  state.scrollToList = !FIXED_SAT;
  state.onlyBig = false; state.minEl = 10; state.onlyStations = false;
  $('only-big').checked = false; $('only-easy').checked = false; $('only-stations').checked = false;
  // 1機に絞っているあいだは「明るい衛星だけ」「宇宙ステーションだけ」を隠す（その衛星が当てはまらないと、全部の夜が0回になって
  // 「7夜とも見えない」と事実と違う知らせになるため。当てはまる衛星では押しても何も変わらない）
  setSatOnlyChips(true);
  $('sat-only-name').textContent = displayName(sat);
  $('sat-only').hidden = false;
  $('notice-station').hidden = true; // 1機に絞っているあいだは「25°以上」の説明は当てはまらない
}
function setSatOnlyChips(hide) {
  $('only-big').closest('.chip').hidden = hide;
  $('only-stations').closest('.chip').hidden = hide;
  // 「見やすい回だけ」の説明の高さも、いまの衛星に合わせる（宇宙ステーションは25°以上）
  const sat = state.onlySat && state.satById.get(state.onlySat);
  $('only-easy').closest('.chip').querySelector('.chip-sub').textContent = `高さ${hide && sat?.bright ? STATION_MIN_EL : EASY_EL}°以上を通る`;
}
function clearOnlySat() {
  state.onlySat = null;
  $('sat-only').hidden = true;
  $('notice-station').hidden = false;
  // 絞り込みも最初の状態（明るい衛星だけ・見やすい回だけ）に戻す（2026-10-01 オーナー判断）
  state.onlyBig = true; state.minEl = EASY_EL; state.onlyStations = false;
  $('only-big').checked = true; $('only-easy').checked = true; $('only-stations').checked = false;
  setSatOnlyChips(false);
  history.replaceState(null, '', location.pathname); // 読み込み直しても戻らないよう、アドレスからも外す
  renderNightTabs();
  renderPasses();
  renderView();
  $('h-passes').focus({ preventScroll: true }); // 押したボタンが消えるので、操作位置を一覧の見出しへ
}

// 地図の時刻に見える衛星がないとき、次に見える回（いまの絞り込みに合うもの）を案内する
function nextPassAfter(t) {
  return state.passes.find((p) => p.end.t > t && matchesFilters(p)) || null;
}
function showPass(p) {
  state.night = nightKey(p.start.t);
  renderNightTabs();
  selectPass(p);
}

function nightLabel(key) {
  const now = Date.now();
  const today = currentNightKey(now);
  const diff = Math.round((nightNoon(key) - nightNoon(today)) / 86400000);
  // 深夜0時すぎ〜夜明け（まだ前の晩の続き）は、前の晩を「明け方まで」、その日の夜を「今夜」と呼ぶ
  // （日付が変わってから見た人にとって「今夜」はその日の夜のため）
  const afterMidnight = jstParts(now).h < 12 && today !== nightKey(now + 12 * 3600000);
  if (afterMidnight) {
    if (diff === 0) return '明け方まで';
    if (diff === 1) return '今夜';
    if (diff === 2) return '明日の夜';
  } else {
    if (diff === 0) return '今夜';
    if (diff === 1) return '明日の夜';
    if (diff === -1) return '昨夜';
  }
  return mdShort(nightNoon(key));
}

function renderNightTabs() {
  const box = $('night-tabs');
  box.innerHTML = nightKeys().map((k) => {
    // 計算しているあいだは回数を出さない（まだ回が無いので「0回」と出てしまうため）
    const n = state.computing ? '…' : `${filteredPasses(k).length}回`;
    const sel = k === state.night;
    return `<button type="button" class="night-tab" data-k="${k}" aria-pressed="${sel}">${esc(nightLabel(k))}<small>${n}</small></button>`;
  }).join('');
}

function routeText(p) {
  const s = p.start, m = p.max, e = p.end;
  const startTxt = {
    horizon: `<b>${dirName(s.az)}</b>の低い空から現れ`,
    shadow: `<b>${dirName(s.az)}</b>の空（高さ${Math.round(s.el)}°）で急に現れ`,
    dusk: `<b>${dirName(s.az)}</b>の空（高さ${Math.round(s.el)}°）で見え始め`,
  }[s.why];
  const maxTxt = `<b>${dirName(m.az)}</b>で最も高く <b>${Math.round(m.el)}°（${heightWord(m.el)}）</b>`;
  const endTxt = {
    horizon: `<b>${dirName(e.az)}</b>の低い空へ沈む`,
    shadow: `<b>${dirName(e.az)}</b>の空で消える（地球の影に入る）`,
    dawn: `<b>${dirName(e.az)}</b>の空で見えなくなる（空が明るくなる）`,
  }[e.why];
  return `${startTxt}、${maxTxt}、${endTxt}。`;
}

// 絞り込みを変えたとき。選んでいた回が条件に合わなくなったら、選択を外す（地図に「選んだ回」が残らないように）
function onFilterChange() {
  if (state.selected && !matchesFilters(state.selected)) state.selected = null;
  renderNightTabs();
  renderPasses();
  renderView();
}

// 1機に絞っているときの帯：低い回まで出しているか、7夜とも見えないかを、いまの計算と絞り込みに合わせて出し直す
function updateSatOnlyBar() {
  const keys = nightKeys();
  const none = !state.computing && !keys.some((k) => filteredPasses(k).length > 0);
  // 7夜とも見えないときは、帯の中で知らせる（一覧の上の案内文は、スマホでは画面の外になりやすいため）。
  // 低い回しかないときも、見やすい回がいつからかを帯で知らせる
  const lowOnly = !none && state.aheadEasyOnly && Array.isArray(state.ahead);
  $('sat-only-low').hidden = state.minEl > 10 || lowOnly; // 低い回しかないときは、すぐ下の文と重なるので出さない
  $('sat-only-none').innerHTML = none ? `${satNoneText()}${aheadText()}`
    : lowOnly ? `この先${keys.length}夜は、低い空を通る回だけです。${aheadText()}` : '';
  $('sat-only-none').hidden = !(none || lowOnly);
  // 場所をまだ選んでいない人（図鑑や検索から初めて来た人）には、仮に東京の予報だと帯でも伝える（一覧へ移ると上の案内が見えなくなるため）
  $('sat-only-place').hidden = !state.firstVisit;
}

function renderPasses() {
  const list = filteredPasses(state.night);
  const status = $('passes-status');
  status.classList.remove('is-error', 'is-notice');
  if (FIXED_SAT && !state.satById.get(FIXED_SAT)) {
    status.textContent = 'いまは、この衛星の軌道データを取得できていません。時間をおいて、ページを読み込み直してください。';
    status.classList.add('is-notice');
    $('pass-list').innerHTML = '';
    return;
  }
  if (state.computing) { // 計算が終わるまでは「回がない」と言わない
    status.textContent = '計算しています…';
    $('pass-list').innerHTML = '';
    return;
  }
  if (state.onlySat) updateSatOnlyBar();
  // この先の夜に押せる回が1つもないときは、「下の一覧から見たい時間を押すと…」の案内を出さない
  $('notice-pick').hidden = !nightKeys().some((k) => filteredPasses(k).length > 0);
  const label = nightLabel(state.night);
  if (list.length === 0) {
    // どの絞り込みを外せば回が出るかを、1つずつ試して案内する
    const tries = [
      [state.onlyStations, '宇宙ステーションだけ', { onlyStations: false }],
      [state.onlyBig, '明るい衛星だけ', { onlyBig: false }],
      [state.minEl > 10, '見やすい回だけ', { minEl: 10 }],
    ];
    const hit = tries.map(([on, name, f]) => on && [name, filteredPasses(state.night, f).length]).find((x) => x && x[1] > 0);
    const only = state.onlySat && state.satById.get(state.onlySat);
    if (only && !hit) {
      // その衛星だけを出しているとき：ほかの夜に回があるかで言い分ける
      const any = nightKeys().some((k) => filteredPasses(k).length > 0);
      status.textContent = any
        ? `${label}は、${displayName(only)}の${state.minEl > 10 ? '見やすい回' : '見える回'}がありません。ほかの日を選んでください。`
        : ''; // 7夜とも無いことは、上の帯（#sat-only-none）で知らせている。同じ知らせを重ねると「次は○日ごろから」が埋もれるため
      status.classList.add('is-notice'); // 残念な知らせなので、件数の表示より目立たせる
    } else {
      status.textContent = hit
        ? `${label}は、条件に合う回がありません。「${hit[0]}」を外すと${hit[1]}回あります。`
        : `${label}は、見える回がありません。ほかの日を選んでください。`;
    }
  } else {
    // 選んだ日時が夜の途中なら、そこから後の分だけだと分かるようにする
    const noon = nightNoon(state.night);
    const range = state.baseTime > noon
      ? `${md(state.baseTime)} ${hm(state.baseTime)}以降〜${jstParts(state.baseTime).h < 12 ? '朝' : '翌朝'}`
      : `${md(noon)}の夕方〜翌朝`;
    status.textContent = label.includes('/') ? `${range}：${list.length}回` : `${label}（${range}）：${list.length}回`;
  }
  $('pass-list').innerHTML = list.map((p) => {
    const sat = state.satById.get(p.satId);
    const i = state.passes.indexOf(p);
    const sec = (p.end.t - p.start.t) / 1000;
    // 2分未満は「約2分間」と丸めると「短い（2分未満）」の目印と食い違うので、細かく言う
    const minsText = sec < 45 ? '1分未満' : sec < 75 ? '約1分間' : sec < SHORT_SEC ? '約1分半' : `約${Math.round(sec / 60)}分間`;
    // 「見やすい」はいつも出す（「明るい」と同じ扱い。2026-10-01 オーナー判断）
    const easy = isEasy(p, sat) ? '<span class="tag tag-easy">見やすい</span>' : '';
    // 「短い」：見えている時間が2分未満の回。見つけにくいことを前もって伝える（2026-10-02 オーナー判断。すべての一覧で同じ基準）
    const short = sec < SHORT_SEC ? '<span class="tag tag-short">短い（2分未満）</span>' : '';
    const tags = sat.bright
      ? `<span class="tag tag-station">とても明るい</span>${easy}${short}`
      : `${sat.big ? '<span class="tag tag-big">明るい</span>' : ''}${easy}${short}<span class="tag">${esc(sat.kind)}</span>`;
    const pressed = state.selected === p;
    return `<li><button type="button" class="pass" data-i="${i}" aria-pressed="${pressed}">
      <span class="pass-when">${esc(whenWord(p.start.t))}</span>
      <span class="pass-head"><span class="pass-time">${hm(p.start.t)}〜${hm(p.end.t)}</span><span class="pass-name">${esc(displayName(sat))}</span></span>
      <span class="pass-origin">${tags}<span>${esc(originText(sat))}</span></span>
      <span class="pass-purpose">目的：${esc(sat.purpose)}</span>
      <span class="pass-route">${minsText}。${routeText(p)}</span>
    </button>${pressed ? `<button type="button" class="btn pass-map">地図で通り道を見る</button>${zukanLink(sat)}` : ''}</li>`;
  }).join('');
  updateToTop(); // 日付を変えて一覧が短くなったとき、ボタンが残らないように
}

// 「先頭へ戻る」ボタン（一覧と空の図で共通）。PCはそれぞれの箱の中、スマホはページ全体がスクロールする。
// mark（日付タブ／空の図）が隠れたらボタンを出し、押すとそのエリアの見出しへ戻る
const BAR_H = 64; // スマホの上部の移動バーの高さ
const TO_TOP = [
  { box: 'passes', btn: 'to-top', heading: 'h-passes', mark: 'night-tabs', part: 1 },   // 日付タブの下端が隠れたら
  // 空の図：スマホは図が半分隠れたら。PC（箱の中だけ動く）は図の上端が隠れたら。
  // PC は箱の中が少ししか動かないことが多く、「半分」だと下まで送っても出ないため（2026-10-05 オーナーの指摘）
  { box: 'sky', btn: 'sky-top', heading: 'h-sky', mark: 'sky-svg', part: 0.5, pcPart: 0 },
];
const boxScrolls = (el) => getComputedStyle(el).overflowY === 'auto';
function updateToTop() {
  for (const t of TO_TOP) {
    const box = $(t.box), mark = $(t.mark);
    const m = mark.getBoundingClientRect();
    const pc = boxScrolls(box);
    const edge = m.top + m.height * (pc && t.pcPart != null ? t.pcPart : t.part); // この線が見えなくなったら出す
    const top = pc ? box.getBoundingClientRect().top : BAR_H;
    $(t.btn).hidden = edge > top;
  }
  // 「地図で通り道を見る」が右下の「先頭へ」の場所に来ているあいだは、「先頭へ」を隠す（重なって押し間違えないように）
  const pm = document.querySelector('.pass-map');
  if (pm && !$('to-top').hidden) {
    // ボタンの上端から、その札のいちばん下の部品（図鑑へのリンクがあればリンク）の下端までを見る
    const box = $('passes');
    const bottom = boxScrolls(box) ? Math.min(box.getBoundingClientRect().bottom, window.innerHeight) : window.innerHeight;
    const top = pm.getBoundingClientRect().top;
    const last = pm.closest('li').lastElementChild.getBoundingClientRect().bottom;
    // 「先頭へ」は下から24pxの位置に高さ48pxで貼り付く。まわりの輪のぶん少し広めに見る
    if (last > bottom - 24 - 48 - 12 && top < bottom - 12) $('to-top').hidden = true;
  }
}
function bindToTop() {
  for (const t of TO_TOP) {
    const box = $(t.box);
    box.addEventListener('scroll', updateToTop, { passive: true });
    $(t.btn).addEventListener('click', () => {
      if (boxScrolls(box)) box.scrollTo({ top: 0, behavior: scrollBehavior() });
      // スマホはページごと移動。PCでも、ページを下まで送って箱の上が画面の外に出ているときはページも動かす
      if (!boxScrolls(box) || box.getBoundingClientRect().top < 0) box.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      $(t.heading).focus({ preventScroll: true }); // キーボード操作の位置もエリアの先頭へ
    });
  }
  window.addEventListener('scroll', updateToTop, { passive: true });
  window.addEventListener('resize', updateToTop);
}

// 図鑑に画像がある衛星だけ、図鑑のその衛星の札へのリンクを出す。
// 新しいタブで開く（このページの計算や選んだ回をそのまま残すため。2026-10-01 オーナー判断）
function zukanLink(sat) {
  if (!PHOTOS[sat.id]) return '';
  // 「別のタブ」と文字でも書く（元の画面が残ることを伝えるため）。\uFE0E：iPhone で↗が絵文字にならないように
  return `<a class="pass-zukan" href="zukan.html#sat-${sat.id}" target="_blank" rel="noopener">図鑑で画像を見る（別のタブ）<span aria-hidden="true">↗\uFE0E</span></a>`;
}

// 夕方〜夜の回か、明け方の回か（同じ「夜」のタブに両方が入るため）
function whenWord(ms) {
  const h = jstParts(ms).h;
  // 0〜4時は「未明」（「深夜」だと前の日の夜の続きと読まれ、1日遅れて外に出る人が出るため。2026-10-05 オーナー判断）
  return `${mdShort(ms)} ${h < 4 ? '未明' : h < 12 ? '明け方' : h < 19 ? '夕方' : '夜'}`;
}

function selectPass(p) {
  stopPlay();
  const sel = `.pass[data-i="${state.passes.indexOf(p)}"]`;
  const topBefore = document.querySelector(sel)?.getBoundingClientRect().top;
  if (state.selected === p) {
    state.selected = null;
  } else {
    state.selected = p;
    state.anchor = p.max.t;
    state.offset = 0;
  }
  renderPasses();
  renderView();
  // 一覧を作り直すとキーボードの操作位置が消えるので、押した回に戻す
  const btn = document.querySelector(sel);
  btn?.focus({ preventScroll: true });
  // 先に選んでいた上の札が縮むと、押した札が上へ飛ぶ。押した札が画面の同じ位置に残るよう、ずれた分だけ送り直す
  if (btn && topBefore !== undefined) {
    const shift = btn.getBoundingClientRect().top - topBefore;
    if (Math.abs(shift) > 1) {
      if (boxScrolls($('passes'))) $('passes').scrollTop += shift;
      else window.scrollBy({ top: shift, behavior: 'instant' });
    }
  }
  // ボタンのぶん札の下が伸びるので、「地図で通り道を見る」ボタンまで見える位置へ送る（地図へは移動しない）
  if (state.selected && btn) {
    const li = btn.closest('li');
    if (boxScrolls($('passes'))) {
      li.scrollIntoView({ block: 'nearest' }); // PC：一覧の箱の中で送る
    } else {
      // スマホ：はみ出した分だけ上へ送る。ただし札の上が上部の移動バーに隠れない範囲まで
      const over = li.getBoundingClientRect().bottom - (window.innerHeight - 16);
      const room = btn.getBoundingClientRect().top - (BAR_H + 8);
      if (over > 0 && room > 0) window.scrollBy({ top: Math.min(over, room), behavior: scrollBehavior() });
    }
  }
  updateToTop();
  // 回を選んでも地図へは自動で移動しない（2026-09-30 オーナー判断。当初の理由だった札の中の画像は 2026-10-01 にやめた）。
  // 地図へは、選んだ札の下に出る「地図で通り道を見る」ボタンで移動する
}

// ---------- 空の図 ----------
const R = 150;
function skyXY(az, el) {
  const r = (R * (90 - Math.max(0, el))) / 90;
  const a = (az * Math.PI) / 180;
  return [r * Math.sin(a), -r * Math.cos(a)];
}

function renderSky(snap, viewTime) {
  const parts = [`<title id="sky-title">空の図</title>`];
  parts.push(`<circle class="sky-bg" r="${R}"/>`);
  for (const el of [30, 60]) parts.push(`<circle class="sky-ring" r="${(R * (90 - el)) / 90}"/>`);
  for (const [t, az] of [['北', 0], ['東', 90], ['南', 180], ['西', 270]]) {
    const a = (az * Math.PI) / 180;
    parts.push(`<text class="sky-dir" x="${(R + 12) * Math.sin(a)}" y="${-(R + 12) * Math.cos(a)}">${t}</text>`);
  }

  const sel = state.selected;
  let selEnds = []; // 選んだ回の「現れる」「消える」の位置（ほかの文字と重ならないようにするため）
  const selLabels = []; // 選んだ回の時刻の文字。点をすべて描いたあとに足す（いまの衛星の点に隠れないように）
  if (sel) {
    const pts = sel.track.map((q) => skyXY(q.az, q.el).map((v) => v.toFixed(1)).join(',')).join(' ');
    parts.push(`<polyline class="sky-track" points="${pts}"/>`);
    const [sx, sy] = skyXY(sel.start.az, sel.start.el);
    const [ex, ey] = skyXY(sel.end.az, sel.end.el);
    // 現れる位置は中を塗らない輪にする（黄色の丸だと「見える衛星がもう1機ある」と見誤るため）。
    // 選んだ直後は、いまの衛星の点（半径7）が同じ場所に来るので、その外にのぞく大きさにする
    parts.push(`<circle class="sky-start" cx="${sx}" cy="${sy}" r="9"/>`);
    parts.push(`<path class="sky-dot-vis" d="${arrowHead(sel)}"/>`);
    // とても短い回で「現れる」「消える」が近いときは、文字を左右に振り分ける（「現れる」は来た側、「消える」は進む側）
    const close = Math.hypot(sx - ex, sy - ey) < 30;
    const goRight = ex >= sx;
    selLabels.push(skyLabel(sx, sy, `${hm(sel.start.t)} 現れる`, 12, 4, close ? (goRight ? 'left' : 'right') : null));
    selLabels.push(skyLabel(ex, ey, `${hm(sel.end.t)} 消える`, 10, 4, close ? (goRight ? 'right' : 'left') : null));
    selEnds = [[sx, sy], [ex, ey]];
  }
  const nearSelEnd = (x, y, d) => selEnds.some(([qx, qy]) => Math.hypot(qx - x, qy - y) < d);
  // 高さの目盛り（30°・60°）。通り道の線より上に描く。選んだ回の時刻の文字と重なるところでは出さない
  for (const [deg, r] of [['30°', (R * 60) / 90], ['60°', (R * 30) / 90]]) {
    if (!nearSelEnd(17, -r + 9, 40)) parts.push(`<text class="sky-deg" x="3" y="${-r + 14}">${deg}</text>`);
  }

  // 空に出ている衛星（見えないものを先に描き、見えるものを上に重ねる）
  const up = snap.list.filter((x) => x.st.el > 0).sort((a, b) => (a.vis === 'visible') - (b.vis === 'visible'));
  for (const x of up) {
    const [cx, cy] = skyXY(x.st.az, x.st.el);
    const isSel = sel && x.sat.id === sel.satId;
    // 選んだ衛星は「白＋黄色のふち」（見えないときは灰色＋黄色のふち）。地図と同じ描き方
    if (isSel) {
      parts.push(`<circle class="${x.vis === 'visible' ? 'sky-now' : 'sky-sel-shadow'}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="7"/>`);
    } else if (x.vis === 'visible') {
      const cls = x.sat.bright ? 'sky-dot-station' : 'sky-dot-vis';
      parts.push(`<circle class="${cls}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${x.sat.bright ? 6 : 4}"/>`);
    } else {
      parts.push(`<circle class="sky-dot-shadow" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${x.sat.bright ? 5 : 3}"/>`);
    }
    // 名前は、選んだ回の「現れる」「消える」の近くでは出さない（時刻の文字と重なるため。選んだ衛星の名前は地図の説明に出ている）
    if ((x.sat.bright || isSel) && !nearSelEnd(cx, cy, isSel ? 30 : 40)) parts.push(skyLabel(cx, cy, esc(shortName(x.sat)), 9, -8));
    if (x.sat.id === skyTip.id) {
      parts.push(`<circle class="sky-hover" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="10"/>`);
    }
  }
  parts.push(...selLabels);
  $('sky-svg').innerHTML = parts.join('');
  skyTip.dots = up.map((x) => ({ x, xy: skyXY(x.st.az, x.st.el) }));
  placeSkyTip();
}

// 空の図の文字。図の右寄りでは点の左に、下の端では点の上に置いて、図の外に切れないようにする。
// side（'left'／'right'）を渡すと、その側に置く。文字の幅をおおまかに見積もり、図の外にはみ出すなら反対側に置く
const SKY_EDGE = 168;
function skyLabel(x, y, text, dx, dy, side = null) {
  const w = [...text.replace(/&[a-z]+;/g, '&')].reduce((n, c) => n + (/[A-Z0-9]/.test(c) ? 11 : c.charCodeAt(0) < 0x80 ? 9 : 16), 0); // 文字の大きさ16の目安（英大文字・数字は広め）
  const fitsStart = x + dx + w <= SKY_EDGE; // 点の右に置いて収まるか
  const fitsEnd = x - dx - w >= -SKY_EDGE; // 点の左に置いて収まるか
  let ty = y + dy;
  if (y > 140) ty = y - 10;
  else if (y < -140) ty = y + 18;
  if (!fitsStart && !fitsEnd) {
    // どちらに置いてもはみ出す長い名前は、点の上（上の端では下）に、図の中に収まるよう中央寄せで置く
    const mx = Math.max(-SKY_EDGE + w / 2, Math.min(SKY_EDGE - w / 2, x));
    return `<text class="sky-label" text-anchor="middle" x="${mx.toFixed(1)}" y="${(y < -130 ? y + 22 : y - 12).toFixed(1)}">${text}</text>`;
  }
  let right = side ? side === 'left' : x > 40; // right＝点の左に置く（右寄せ）
  if (!right && !fitsStart) right = true;
  else if (right && !fitsEnd) right = false;
  return `<text class="sky-label" text-anchor="${right ? 'end' : 'start'}" x="${(right ? x - dx : x + dx).toFixed(1)}" y="${ty.toFixed(1)}">${text}</text>`;
}

// ---------- 空の図：点に合わせる（PC）／タップする（スマホ）と衛星名を出す ----------
const skyTip = { id: null, dots: [] };
const SKY_BOX = 352; // 空の図の viewBox の幅（index.html の -176 -176 352 352 と合わせる）
const HIT_PX = 22; // 反応する範囲（半径）。指先の大きさ＝約44pxに合わせる

function nearestDot(e) {
  const svg = $('sky-svg');
  const rect = svg.getBoundingClientRect();
  const unit = SKY_BOX / rect.width; // 画面の1pxが図の何単位か
  const px = (e.clientX - rect.left) * unit - SKY_BOX / 2;
  const py = (e.clientY - rect.top) * unit - SKY_BOX / 2;
  let best = null, bestD = HIT_PX * unit;
  for (const d of skyTip.dots) {
    const dist = Math.hypot(d.xy[0] - px, d.xy[1] - py);
    if (dist <= bestD) { best = d; bestD = dist; }
  }
  return best;
}

function setSkyTip(id) {
  if (skyTip.id === id) return;
  skyTip.id = id;
  renderView();
}

function placeSkyTip() {
  const tip = $('sky-tip');
  const d = skyTip.dots.find((q) => q.x.sat.id === skyTip.id);
  if (!d) { // 地平線の下に沈んだら消す
    skyTip.id = null;
    tip.hidden = true;
    return;
  }
  const { sat, st, vis } = d.x;
  const kind = sat.jp ? '' : `（${esc(sat.kind)}）`;
  const origin = originText(sat);
  // 吹き出しに衛星の画像は入れない（大きくなって空の図を隠すため。2026-09-30 オーナー判断。地図の吹き出しと同じ）
  tip.innerHTML = `<b>${esc(displayName(sat))}</b>${kind}<br>${origin ? `<span class="tip-origin">${esc(origin)}</span><br>` : ''}<span class="tip-origin">目的：${esc(sat.purpose)}</span><br>${dirName(st.az)}・${heightText(st.el)}・<span class="${STATE_WORD[vis][1]}">${STATE_WORD[vis][0]}</span>`;
  tip.hidden = false;
  const fig = $('sky-svg').parentElement.getBoundingClientRect();
  const rect = $('sky-svg').getBoundingClientRect();
  const scale = rect.width / SKY_BOX;
  const left = rect.left - fig.left + (d.xy[0] + SKY_BOX / 2) * scale;
  const top = rect.top - fig.top + (d.xy[1] + SKY_BOX / 2) * scale;
  const w = tip.offsetWidth;
  tip.style.left = `${Math.max(0, Math.min(fig.width - w, left - w / 2))}px`;
  // 上に出すと図からはみ出すときは、点の下に出す
  const above = top - tip.offsetHeight - 14;
  tip.style.top = `${above >= 0 ? above : top + 14}px`;
}

// 通り道の終わりに向きを示す三角
function arrowHead(p) {
  const n = p.track.length;
  const [x1, y1] = skyXY(p.track[n - 2].az, p.track[n - 2].el);
  const [x2, y2] = skyXY(p.track[n - 1].az, p.track[n - 1].el);
  const a = Math.atan2(y2 - y1, x2 - x1);
  const L = 12, W = 7;
  const bx = x2 - L * Math.cos(a), by = y2 - L * Math.sin(a);
  const pt = (x, y) => `${x.toFixed(1)},${y.toFixed(1)}`;
  return `M${pt(x2, y2)} L${pt(bx + W * Math.sin(a), by - W * Math.cos(a))} L${pt(bx - W * Math.sin(a), by + W * Math.cos(a))} Z`;
}

function shortName(sat) {
  if (sat.id === 25544) return 'ISS';
  if (sat.id === 48274) return '天宮';
  return (sat.jp || sat.name).replace(/（.*$/, '');
}

const heightText = (el) => (el < 1 ? '地平線すれすれ' : `高さ${Math.round(el)}°`);

const STATE_WORD = {
  visible: ['見える', 'state-vis'],
  shadow: ['地球の影に入っていて見えない', 'state-shadow'],
  daylight: ['空が明るくて見えない', 'state-daylight'],
  low: ['低すぎて見えにくい', 'state-low'],
};

function renderSkyList(snap) {
  const selId = state.selected?.satId;
  const up = snap.list.filter((x) => x.st.el > 0)
    .sort((a, b) => (b.sat.id === selId) - (a.sat.id === selId)
      || (b.vis === 'visible') - (a.vis === 'visible')
      || b.sat.bright - a.sat.bright
      || b.st.el - a.st.el);
  const ul = $('sky-list');
  if (state.data !== 'ok') {
    ul.innerHTML = `<li>${state.data === 'error' ? '軌道データを読み込めませんでした。ページを読み込み直してください。' : '軌道データを読み込んでいます…'}</li>`;
    return;
  }
  if (up.length === 0) {
    ul.innerHTML = '<li>この時刻は、空に出ている衛星がありません。</li>';
    return;
  }
  ul.innerHTML = up.map((x) => {
    const [w, c] = STATE_WORD[x.vis];
    const kind = `<span class="kind">${esc([x.sat.jp ? '' : x.sat.kind, originText(x.sat)].filter(Boolean).join('・'))}</span>`;
    const purpose = `<span class="kind">目的：${esc(x.sat.purpose)}</span>`;
    return `<li><span class="nm">${esc(displayName(x.sat))}${kind}${purpose}</span><span class="pos">${dirName(x.st.az)}・${heightText(x.st.el)}</span><span class="${c}">${w}</span></li>`;
  }).join('');
}

// ---------- 地図 ----------
let map, observerMarker, observerCircle, trackLine;
let lastMap = null; // 最後に描いた時刻の衛星の位置（地図を動かしたときに置き直すため）
const satMarkers = new Map();

// 点を描く係。地図の部品は「最後に止まったときの画面のまわり」しか描かないので、
// 動かしている最中も描く範囲を置き直す（下の move の処理）
let dotRenderer;

function initMap() {
  // canvas で描くと「点のまわり何pxまで反応するか」（tolerance）を決められる。
  // 点は小さい（半径2.5〜8px）ので、まわり18pxまで反応させて、指先の大きさ（直径約44px）に近づける
  dotRenderer = L.canvas({ padding: 0.5, tolerance: 18 });
  map = L.map('map', {
    minZoom: 2, maxZoom: 8, // 地理院タイルはズーム2から
    renderer: dotRenderer,
    // マウスのホイールで拡大・縮小しない（PCで上へ戻るとき、地図の上でページが止まってしまうため。2026-10-01 オーナー判断）。
    // 拡大・縮小は ＋−ボタンで。ドラッグでの移動とスマホの2本指の操作はそのまま
    scrollWheelZoom: false,
  })
    .setView([state.place.lat, state.place.lon], window.matchMedia('(min-width: 960px)').matches ? 4 : 3);
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>',
    maxZoom: 8,
  }).addTo(map);
  observerCircle = L.circle([0, 0], { radius: ISS_RANGE_KM * 1000, color: css('--observer'), weight: 1.5, dashArray: '6 6', fill: false, interactive: false }).addTo(map);
  observerMarker = L.circleMarker([0, 0], { radius: 7, color: css('--white'), weight: 2, fillColor: css('--observer'), fillOpacity: 1 }).addTo(map);
  updateObserverOnMap(false);
  // 地図を動かしている最中も、いま見ている範囲に合わせて点を置き直す（1コマに1回まで）
  let queued = false;
  map.on('move', () => {
    if (queued || !lastMap) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      dotRenderer._update(); // Leaflet 1.9 の内部の処理。版を上げるときは動作を確かめる
      updateObserverOnMap(false);
      renderMap(lastMap.snap, lastMap.t);
    });
  });
}

function updateObserverOnMap(pan) {
  if (!map) return;
  if (pan) map.setView([state.place.lat, state.place.lon], map.getZoom());
  const ll = [state.place.lat, nearLon(state.place.lon)];
  observerMarker.setLatLng(ll).bindTooltip(esc(state.place.name));
  observerCircle.setLatLng(ll);
}

// いま見ている地図の中心に近い側の経度に寄せる。
// 地図は横に何周もつながっているので、こうしないと点が画面の外の「隣の地球」に置かれてしまう
const nearLon = (lon) => {
  const ref = map ? map.getCenter().lng : state.place.lon;
  return lon + 360 * Math.round((ref - lon) / 360);
};

// 国別の色（多い4か国と、その他）
const COUNTRY_VAR = { CIS: '--c-ru', US: '--c-us', PRC: '--c-cn', JPN: '--c-jp' };
function countryColor(sat) {
  return css(COUNTRY_VAR[sat.owner] || '--c-other');
}

function newSatMarker(sat) {
  const m = L.circleMarker([0, 0], { weight: 0, fillOpacity: 1 }).addTo(map);
  // 地図の吹き出しは名前と国だけ（目的まで入れると大きくなり、まわりの点を隠すため。目的は一覧と空の図に出す）
  const full = `<b>${esc(displayName(sat))}</b><br>${esc(originText(sat))}`;
  if (sat.bright) {
    // 宇宙ステーションは名前の札を常に出し、カーソルを合わせたときだけ札を詳しい説明に替える
    // （1つの点に付けられる札は1つだけなので、中身を入れ替える）
    const short = esc(shortName(sat));
    m.bindTooltip(short, { permanent: true, direction: 'right', className: 'sat-label', offset: [6, 0] });
    m.on('mouseover', () => m.setTooltipContent(full));
    m.on('mouseout', () => m.setTooltipContent(short));
    // スマホ（カーソルがない）は、タップすると4秒だけ詳しい説明を出す
    let timer = null;
    m.on('click', () => {
      m.setTooltipContent(full);
      clearTimeout(timer);
      timer = setTimeout(() => m.setTooltipContent(short), 4000);
    });
  } else {
    m.bindTooltip(full);
  }
  return m;
}

function renderMap(snap, viewTime) {
  if (!map) return;
  lastMap = { snap, t: viewTime };
  const colVis = css('--accent'), colStation = css('--station'), colShadow = css('--shadow-sat');
  // 縮めて世界が横に2回並んで見えるときは、両方に点を出す
  const bounds = map.getBounds();
  const west = bounds.getWest(), east = bounds.getEast();
  for (const x of snap.list) {
    const base = nearLon(x.st.lon);
    const lons = [base];
    if (base - 360 >= west) lons.push(base - 360);
    if (base + 360 <= east) lons.push(base + 360);
    const ms = satMarkers.get(x.sat.id) || [];
    while (ms.length < lons.length) ms.push(newSatMarker(x.sat));
    while (ms.length > lons.length) ms.pop().remove();
    satMarkers.set(x.sat.id, ms);

    const isSel = state.selected && x.sat.id === state.selected.satId;
    const visible = x.vis === 'visible';
    let style;
    if (state.colorMode === 'country') {
      // 国別：色＝国、大きさ＝見えるかどうか（色の意味を1つにするため）。
      // 見えないときは明るい衛星も小さくし、「大きい点＝見える」とそろえる。
      // 暗いふちを付けて、通り道の線（黄）と点を形で区別できるようにする
      const fill = countryColor(x.sat);
      if (visible) style = { radius: x.sat.bright ? 7 : 6, fillColor: fill, fillOpacity: 1 };
      else if (x.st.el > 0) style = { radius: 3.5, fillColor: fill, fillOpacity: 1 };
      else style = { radius: 2.5, fillColor: fill, fillOpacity: 0.8 };
      Object.assign(style, { weight: 1, color: css('--bg') });
    } else {
      // 見えるかどうか：宇宙ステーションは見えるときだけ橙。見えないときは灰色（大きさと名前で区別）。空の図と同じ基準
      if (x.sat.bright) style = { radius: 6, fillColor: visible ? colStation : colShadow, fillOpacity: 1 };
      else if (visible) style = { radius: 5, fillColor: colVis, fillOpacity: 1 };
      else if (x.st.el > 0) style = { radius: 3.5, fillColor: colShadow, fillOpacity: 1 };
      else style = { radius: 2.5, fillColor: colShadow, fillOpacity: 0.8 };
      style.weight = 0;
    }
    // 選んだ衛星は、どちらの色分けでも「白＋黄色のふち」（見えないときは灰色＋黄色のふち）
    if (isSel) Object.assign(style, { radius: 8, fillColor: visible ? css('--white') : colShadow, fillOpacity: 1, weight: 3, color: colVis });
    ms.forEach((m, i) => {
      m.setLatLng([x.st.lat, lons[i]]);
      m.setStyle(style);
      if (isSel) m.bringToFront();
    });
  }

  if (trackLine) { trackLine.remove(); trackLine = null; }
  if (state.selected) {
    const sat = state.satById.get(state.selected.satId);
    const BEFORE = 45; // 通り道は、地図の時刻の45分前から90分後まで（1分ごと）
    const pts = groundTrack(sat, new Date(viewTime), BEFORE, 90, 1);
    // 経度をつなげて、線が地図の端で折り返さないようにする
    let prev = null;
    const line = pts.map(([la, lo]) => {
      const l = prev === null ? lo : lo + 360 * Math.round((prev - lo) / 360);
      prev = l;
      return [la, l];
    });
    // つなげていくと、西向きに進む衛星などは線全体が「隣の地球」へずれるので、
    // 地図の時刻の地点が地図の中心に近くなるよう、線全体を地球1周分ずつ動かす
    const here = line[Math.min(BEFORE, line.length - 1)];
    if (here) {
      const shift = nearLon(here[1]) - here[1];
      line.forEach((q) => { q[1] += shift; });
    }
    trackLine = L.polyline(line, { color: colVis, weight: 2, opacity: 0.8, interactive: false }).addTo(map);
  }
}

// ---------- 空の図と地図をまとめて描き直す ----------
function viewTime() {
  return state.anchor + state.offset * 60000;
}

function renderView() {
  const t = viewTime();
  // 軌道データがないあいだは、再生とつまみを押せないようにする
  $('play-btn').disabled = state.data !== 'ok';
  $('time-slider').disabled = state.data !== 'ok';
  const obs = makeObserver(state.place.lat, state.place.lon);
  const snap = snapshot(state.sats, obs, new Date(t));
  const when = `${md(t)} ${hm(t)}`;
  const bright = snap.sunEl > SUN_LIMIT ? '<br><span class="hint">空が明るい時間なので、衛星は見えません。</span>' : '';
  let cap = `${when} の衛星の位置${bright}`;
  let nextIdx = -1;
  if (state.data === 'loading') {
    cap = '軌道データを読み込んでいます…';
  } else if (state.data === 'error') {
    cap = '<span class="msg is-error">軌道データを読み込めませんでした。ページを読み込み直してください。</span>';
  } else if (state.selected) {
    const sat = state.satById.get(state.selected.satId);
    cap += `<br><span class="hint">選んだ回：${esc(displayName(sat))}（${hm(state.selected.start.t)}〜${hm(state.selected.end.t)}）。黄色の線が通り道です。▶︎を押すと動きを見られます。</span>`;
  } else {
    // 回を選んでいないとき：いまの絞り込みに合う衛星が見えていなければ、次に見える回を案内する
    // （ISS・天宮のページで、ほかの衛星が見えている夕方にも「次の ISS」を出すため、絞り込みに合う衛星だけで調べる）
    const anyVisible = snap.list.some((x) => x.vis === 'visible');
    const next = snap.list.some((x) => x.vis === 'visible' && satMatches(x.sat)) ? null : nextPassAfter(t);
    if (next) {
      const sat = state.satById.get(next.satId);
      const day = jstParts(next.start.t).d === jstParts(t).d ? '' : `${mdShort(next.start.t)} `; // 日付が変わるときだけ日付も出す
      const at = `<b>${day}${hm(next.start.t)}ごろ</b>（${esc(shortName(sat))}）`;
      // 昼間は「見えません」が2回続かないよう、1文にまとめる
      cap = snap.sunEl > SUN_LIMIT
        ? `${when} の衛星の位置<br><span class="hint">空が明るい時間なので、衛星は見えません。次に見えるのは ${at}です。</span>`
        : `${when} の衛星の位置<br><span class="hint">${!anyVisible ? 'この時刻は、見える衛星がありません。'
          : state.onlySat ? `この時刻は、${esc(shortName(state.satById.get(state.onlySat)))}は見えません。`
            : 'この時刻は、絞り込みの条件に合う衛星は見えません。'}次は ${at}です。</span>`;
    } else if (state.onlySat && !state.computing && state.satById.get(state.onlySat)
      && !nightKeys().some((k) => filteredPasses(k).length > 0)) {
      // 1機に絞っていて、7夜とも見える回がないとき（押せる回がないので、一覧へ誘わない）
      cap += `<br><span class="hint">${satNoneText(esc(displayName(state.satById.get(state.onlySat))))}${aheadText()}</span>`;
    } else {
      cap += '<br><span class="hint">「衛星が見える時間」の一覧から見たい時間を押すと、その衛星の通り道を出します。</span>';
    }
    nextIdx = next ? state.passes.indexOf(next) : -1;
  }
  // 「次の回の通り道を見る」ボタン（2026-10-05 オーナー判断で「その時刻を見る」から変更。押すと説明文の次の回を選んで通り道を出す）は作り直さず、出し入れだけする（再生中も押せるように）。
  // 回を選んでいないあいだはボタンの場所を常に取っておき、出たり消えたりしても地図が上下に動かないようにする
  // ただし、この先の夜に条件に合う回が1つもないときは場所も取らない（空白が「読み込み損ね」に見えるため）
  const anyPass = state.computing || nightKeys().some((k) => filteredPasses(k).length > 0);
  $('view-next').hidden = !(state.data === 'ok' && !state.selected && anyPass);
  $('next-btn').classList.toggle('is-off', nextIdx < 0);
  $('next-btn').dataset.next = String(nextIdx);
  $('view-caption').innerHTML = cap;
  $('sky-caption').innerHTML = `<b>${esc(state.place.name)}</b>の空　${when}${bright}`;
  // 何の時刻か分かるよう「地図の時刻」と添える（地図と空の図は、この時刻の位置を出している）
  $('slider-time').textContent = `地図の時刻 ${nightKey(t) === nightKey(state.anchor) ? '' : `${mdShort(t)} `}${hm(t)}`;
  $('time-slider').value = String(Math.round(state.offset));
  renderSky(snap, t);
  renderSkyList(snap);
  renderMap(snap, t);
}

// ---------- 時刻つまみと再生 ----------
function stopPlay() {
  if (state.playTimer) clearInterval(state.playTimer);
  state.playTimer = null;
  $('play-btn').textContent = '▶︎'; // 末尾の記号で、iPhone で絵文字にならないようにする
  $('play-btn').setAttribute('aria-label', '時間を進める');
}
function togglePlay() {
  if (state.playTimer) { stopPlay(); return; }
  // 選んだ回があれば、その回の始まりから終わりまでを再生する
  const from = state.selected ? (state.selected.start.t - state.anchor) / 60000 - 1 : -180;
  const to = state.selected ? Math.min(180, (state.selected.end.t - state.anchor) / 60000 + 1) : 180;
  if (state.offset >= to) state.offset = from;
  $('play-btn').textContent = '❚❚';
  $('play-btn').setAttribute('aria-label', '止める');
  state.playTimer = setInterval(() => {
    state.offset += 1 / 6; // 0.1秒ごとに10秒進む（実際の100倍の速さ）
    if (state.offset >= to) { state.offset = to; stopPlay(); }
    renderView();
  }, 100);
}

// ---------- 起動 ----------
function setBaseTime(ms) {
  stopPlay();
  state.baseTime = ms;
  state.anchor = ms;
  state.offset = 0;
  state.selected = null;
  state.night = currentNightKey(ms);
  if (state.onlySat) state.jumpToSat = true; // 1機に絞っているときは、その衛星が見える最初の夜を選び直す
  $('time-input').value = toInputValue(ms);
  updateSummary();
  requestPasses();
  renderView();
}

function timeRange() {
  const now = Date.now();
  // 最後の夜の日付の 23:59 まで選べる（それより後は、予報を出せる夜が残らない）
  return { min: now - PAST_DAYS * 86400000, max: nightNoon(lastNightKey()) + 12 * 3600000 - 60000 };
}
function setTimeLimits() {
  const { min, max } = timeRange();
  $('time-input').min = toInputValue(min);
  $('time-input').max = toInputValue(max);
}
// 入力欄の上限・下限を守らないブラウザもあるので、受け取った側でも範囲に収める
function onTimeInput(v) {
  const ms = fromInputValue(v);
  if (ms === null) return;
  const { min, max } = timeRange();
  const msg = $('time-msg');
  msg.classList.remove('is-error');
  msg.textContent = '';
  if (ms < min || ms > max) {
    msg.classList.add('is-error');
    msg.textContent = `選べるのは、${md(min)}から${md(max)}までです。いちばん近い日時にしました。`;
  }
  setBaseTime(Math.min(max, Math.max(min, ms)));
}

// 軌道データの古さ。取ってきた時刻ではなく、軌道そのものが作られた時刻（ISS の EPOCH）で測る
function showDataAge(data) {
  const el = $('data-age');
  const warn = $('data-warn');
  const t = Date.parse(data.updated);
  const iss = data.sats.find((o) => o.NORAD_CAT_ID === 25544);
  const epoch = iss ? Date.parse(`${iss.EPOCH}Z`) : NaN;
  el.textContent = `軌道データの取得：${Number.isFinite(t) ? `${md(t)} ${hm(t)}` : '日時不明'}（${state.sats.length}機）`;
  const days = Number.isFinite(epoch) ? (Date.now() - epoch) / 86400000 : Infinity;
  if (days > 10) {
    warn.textContent = `軌道データが${Number.isFinite(days) ? `${Math.floor(days)}日前` : '古い'}ものです。予報の時刻や方角が大きくずれている可能性があります。`;
  } else if (days > 3) {
    warn.textContent = `軌道データが${Math.floor(days)}日前のものです。予報の時刻が数分ずれることがあります。`;
  }
  warn.hidden = !(days > 3);
  el.classList.toggle('is-old', days > 3);
}

async function start() {
  window.__appStarted = true;
  // 読み込みが遅くて見張り役（index.html）のエラー文が先に出ていたら消す
  for (const id of ['passes-status', 'place-msg']) {
    const el = $(id);
    if (el.classList.contains('is-error')) { el.classList.remove('is-error'); el.textContent = ''; }
  }
  $('passes-status').textContent = '軌道データを読み込んでいます…';
  $('place-name').textContent = state.place.name;
  updateSummary();
  // 初めて来た人には、仮の場所だと伝えて「場所と日時」を開いておく。
  // ただし宇宙ステーションのページは閉じたままにし、要約で仮の場所だと伝える（検索で来た人に、まず地図と「いつ見えるか」を見せるため。2026-10-05 オーナー判断）
  if (state.firstVisit) {
    $('place-notice').hidden = false;
    if (!FIXED_SAT) toggleControls(true);
  }
  setTimeLimits();
  $('time-input').value = toInputValue(state.baseTime);

  $('place-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('place-input').value.trim();
    if (q) searchPlace(q, setPlace);
  });
  $('geo-btn').addEventListener('click', () => useGeolocation(setPlace));
  // 帯の「見る場所を選ぶ」：「場所と日時」を開いてから、そこへ移る（移るのはリンクのふつうの動き）
  $('sat-only-place').addEventListener('click', (e) => {
    if (!e.target.closest('a')) return;
    e.preventDefault();
    toggleControls(true);
    $('controls').scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    $('place-input').focus({ preventScroll: true }); // すぐ打ち込めるように
  });
  $('to-map').addEventListener('click', () => {
    $('view').scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    $('h-view').focus({ preventScroll: true });
  });
  $('controls-toggle').addEventListener('click', () => {
    const open = $('controls').classList.contains('is-collapsed');
    toggleControls(open);
  });
  $('now-btn').addEventListener('click', () => { setTimeLimits(); $('time-msg').textContent = ''; setBaseTime(Date.now()); $('to-map').hidden = false; });
  $('time-input').addEventListener('change', (e) => { onTimeInput(e.target.value); $('to-map').hidden = false; }); // 日時を変えたあとも地図へ移れるように
  $('night-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.night-tab');
    if (!b) return;
    state.night = b.dataset.k;
    renderNightTabs();
    renderPasses();
  });
  $('only-big').addEventListener('change', (e) => {
    state.onlyBig = e.target.checked;
    onFilterChange();
  });
  $('only-easy').addEventListener('change', (e) => {
    state.minEl = e.target.checked ? EASY_EL : 10;
    onFilterChange();
  });
  if (!FIXED_SAT) $('sat-only-clear').addEventListener('click', clearOnlySat); // 宇宙ステーションのページではリンクとして予報のページへ移る
  $('only-stations').addEventListener('change', (e) => {
    state.onlyStations = e.target.checked;
    onFilterChange();
  });
  $('next-btn').addEventListener('click', () => {
    const p = state.passes[+$('next-btn').dataset.next];
    if (!p) return;
    showPass(p);
    // 次の操作（▶︎で動きを見る）に操作位置を移す。一覧の回に移ると、もう一度押したとき選択が外れるため
    $('play-btn').focus({ preventScroll: true });
  });
  bindToTop();
  $('pass-list').addEventListener('click', (e) => {
    if (e.target.closest('.pass-map')) {
      $('view').scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      $('play-btn').focus({ preventScroll: true }); // 次の操作（▶︎で動きを見る）へ
      return;
    }
    const b = e.target.closest('.pass');
    if (b) selectPass(state.passes[+b.dataset.i]);
  });
  $('time-slider').addEventListener('input', (e) => {
    stopPlay();
    state.offset = +e.target.value;
    renderView();
  });
  $('play-btn').addEventListener('click', togglePlay);
  $('legend-toggle').addEventListener('click', () => setLegendOpen($('legends').classList.contains('is-collapsed')));
  document.querySelector('.seg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setColorMode(b.dataset.mode);
  });
  const sky = $('sky-svg');
  sky.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const d = nearestDot(e);
    setSkyTip(d ? d.x.sat.id : null);
  });
  sky.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') setSkyTip(null); });
  sky.addEventListener('click', (e) => {
    const d = nearestDot(e);
    setSkyTip(d ? d.x.sat.id : null);
  });
  // スマホ：図の外をタップしたら消す
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' && !sky.contains(e.target)) setSkyTip(null);
  });

  try {
    initMap();
  } catch {
    $('map').textContent = '地図を読み込めませんでした。通信状態を確かめて、ページを読み込み直してください。';
  }
  renderView(); // 読み込み中も、空の図の枠と案内を先に出しておく

  try {
    const res = await fetch('data/sats.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    state.sats = data.sats.map(makeSat);
    state.sats.forEach((s) => state.satById.set(s.id, s));
    worker.postMessage({ type: 'data', sats: data.sats });
    state.data = 'ok';
    showDataAge(data);
    applySatFromUrl();
  } catch {
    state.data = 'error';
    const st = $('passes-status');
    st.classList.add('is-error');
    st.textContent = '軌道データを読み込めませんでした。ページを読み込み直してください。';
    updateSummary();
    renderView();
    return;
  }
  setBaseTime(state.baseTime);
}

start();
