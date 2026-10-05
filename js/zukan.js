// 衛星図鑑のページ：画像のある衛星を、名前・国・打ち上げ年・目的といっしょに並べる
import { makeSat, displayName } from './astro.js';
import { PHOTOS } from './images.js';
import { $, esc } from './shared.js';

// 宇宙ステーションには専用のページがあるので、そちらへ案内する
const STATION_PAGES = { 25544: 'iss.html', 48274: 'tiangong.html' };

function card(sat) {
  const p = PHOTOS[sat.id];
  // 日本語名がある衛星は、登録名（英語）も小さく添える
  const reg = sat.jp ? `<p class="zukan-reg">登録名：${esc(sat.name)}</p>` : '';
  const facts = [
    ['種類', sat.kind],
    ['国', sat.country || '—'],
    ['打ち上げ', sat.launchYear ? `${sat.launchYear}年` : '—'],
    ['目的', sat.purpose],
    ['画像', `${p.kind}${p.note ? `（${p.note}）` : ''}`], // 写真か想像図かを、ひと目で分かるように
  ];
  return `<li id="sat-${sat.id}"><figure class="zukan-card">
    <img class="zukan-photo" src="img/sats/${p.file}" width="${p.w}" height="${p.h}" alt="${esc(displayName(sat))}の${p.kind}" loading="lazy">
    <figcaption class="zukan-body">
      <h2 class="zukan-name">${esc(displayName(sat))}</h2>${reg}
      <dl class="zukan-facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <p class="zukan-cap">出典：${esc(p.credit)}</p>
      <a class="btn btn-ghost zukan-go" href="${STATION_PAGES[sat.id] || `index.html?sat=${sat.id}`}">この衛星が見える時間を調べる</a>
    </figcaption>
  </figure></li>`;
}

async function start() {
  window.__appStarted = true;
  const status = $('zukan-status');
  try {
    // 国・打ち上げ年は軌道データと同じファイル（衛星登録台帳の値）から読む
    const res = await fetch('data/sats.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const sats = data.sats.filter((o) => PHOTOS[o.NORAD_CAT_ID]).map(makeSat);
    // 宇宙ステーション → 打ち上げの新しい順
    sats.sort((a, b) => b.bright - a.bright || (b.launchYear || 0) - (a.launchYear || 0));
    $('zukan-list').innerHTML = sats.map(card).join('');
    status.textContent = `載せている衛星：${sats.length}機`;
    // 衛星のページの「図鑑で画像を見る」から来たときは、その衛星の札まで送って目立たせる
    // （札は読み込んだあとに作るので、ブラウザの自動の移動では届かない）
    const target = location.hash && document.getElementById(location.hash.slice(1));
    if (target) {
      target.classList.add('is-target');
      // 黄色のふちの理由を札の中に添える（新しいタブで開くと、見出しや説明が画面の外になるため）
      target.querySelector('.zukan-body').insertAdjacentHTML('afterbegin', '<p class="zukan-picked">予報で選んだ衛星</p>');
      target.scrollIntoView({ block: 'start' });
    }
  } catch {
    status.classList.add('is-error');
    status.textContent = '読み込めませんでした。ページを読み込み直してください。';
  }
}

start();
