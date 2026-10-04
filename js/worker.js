// 見える回の計算は時間がかかるので、画面が固まらないよう裏で行う
import { makeSat, makeObserver, findPasses } from './astro.js';

let sats = [];

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'data') {
    sats = msg.sats.map(makeSat);
    return;
  }
  if (msg.type === 'passes') {
    const obs = makeObserver(msg.lat, msg.lon);
    let last = 0;
    const passes = findPasses(sats, obs, new Date(msg.start), msg.days, (p) => {
      if (p - last >= 0.1) { last = p; self.postMessage({ type: 'progress', id: msg.id, p }); }
    });
    self.postMessage({ type: 'passes', id: msg.id, passes });
  }
  // 宇宙ステーションのページで7夜とも見えないとき、その先の「次に見え始める日」を探す（1機だけなので速い）
  if (msg.type === 'ahead') {
    const obs = makeObserver(msg.lat, msg.lon);
    const one = sats.filter((s) => s.id === msg.satId);
    const passes = findPasses(one, obs, new Date(msg.start), msg.days, () => {});
    self.postMessage({ type: 'ahead', id: msg.id, passes });
  }
};
