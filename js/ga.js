// 見た人を数える仕組み（Google アナリティクス）。2026-10-04 オーナー判断。扱いは privacy.html に書いたとおりにする
// 測定IDはここだけに書く。手元（localhost など）で開いたときは数えない（実際に見た人の数を正確にするため）
(function () {
  var ID = 'G-G00TVDH5DD';
  var KEY = 'satsite:nocount'; // 保存の名前は場所の保存（satsite:place）とそろえる
  // オーナーの端末を数えない（2026-10-08 オーナー判断。スマホのモバイル通信は IP アドレスが変わり、GA の内部トラフィックの除外が効かないため）。
  // アドレスの末尾に ?nocount を付けて一度開くと、その端末・ブラウザでは以後数えない。?count を付けて開くと元に戻る
  var q = new URLSearchParams(location.search);
  var set = q.has('nocount'), unset = q.has('count');
  if (set || unset) {
    try {
      if (set) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY);
      alert(set ? 'この端末（このブラウザ）では、見た人の数に入れないようにしました。'
        : 'この端末（このブラウザ）でも、見た人の数に入れるように戻しました。');
    } catch (e) {
      alert('このブラウザでは設定を保存できませんでした（プライベートブラウズなど）。');
    }
    // 印をアドレスから外す（ブックマークや共有で、ほかの人に広がらないように）
    q.delete('nocount'); q.delete('count');
    var rest = q.toString();
    history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
  }
  // 測定IDがまだ仮のままなら何もしない（どこにも記録されない通信を送らないため）
  if (!/^G-[A-Z0-9]+$/.test(ID) || ID.indexOf('XXXX') !== -1) return;
  if (location.hostname !== 'satellite-watch.jp') return;
  try { if (localStorage.getItem(KEY) === '1') return; } catch (e) { /* 読めなければ数える */ }
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
