// 見た人を数える仕組み（Google アナリティクス）。2026-10-04 オーナー判断。扱いは privacy.html に書いたとおりにする
// 測定IDはここだけに書く。手元（localhost など）で開いたときは数えない（実際に見た人の数を正確にするため）
(function () {
  var ID = 'G-XXXXXXXXXX';
  // 測定IDがまだ仮のままなら何もしない（どこにも記録されない通信を送らないため）
  if (!/^G-[A-Z0-9]+$/.test(ID) || ID.indexOf('XXXX') !== -1) return;
  if (location.hostname !== 'satellite-watch.jp') return;
  // 注意：場所（地名・緯度経度）をページのアドレスや題名に入れないこと。入れると Google に送られ、privacy.html の約束が崩れる
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  // Google の広告のためには使わない（Google シグナル・広告のカスタマイズをオフ）
  window.gtag('config', ID, { allow_google_signals: false, allow_ad_personalization_signals: false });
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
  document.head.appendChild(s);
})();
