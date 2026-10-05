// 宇宙ステーションのページ（iss.html・tiangong.html）を index.html から作る（npm run build-stations）
// 画面は予報のページと同じで、その衛星の回だけを出す（2026-10-02 オーナー判断）。
// 予報のページを直したら、これを動かして作り直す（公開の仕組みでも、公開の前に毎回作り直している）。
// 説明の事実は公表資料とこのサイトの軌道データで確かめた（2026-10-02）。推測で書かない
import { readFileSync, writeFileSync } from 'node:fs';

const STATIONS = [
  {
    file: 'iss.html',
    id: 25544,
    title: 'ISS（国際宇宙ステーション）が見える時間と方角 | 人工衛星みえる予報',
    description: '国際宇宙ステーション（ISS）が、日本のあなたの街からいつ・どの方角に見えるかを、地図と空の図で調べられます。今夜から7夜分の予報です。',
    h1: 'ISS<span class="nowrap">（国際宇宙ステーション）</span>が見える時間',
    lead: '場所を選ぶと、国際宇宙ステーション（ISS）が今夜から7夜のうち、いつ・どの方角に見えるかがわかります。低い空を通る回も含めて出しています。',
    about: `
    <h2 id="h-about" class="card-title">国際宇宙ステーション（ISS）について</h2>
    <div class="faq-list">
      <h3>どんな施設？</h3>
      <p>アメリカ・ロシア・日本・カナダと欧州の国々、あわせて15か国が協力して進めている、人が暮らしながら実験をする施設です。地上から約400kmの高さを、約90分で地球を1周しています。大きさはサッカーのフィールドと同じくらい（約108.5m×約72.8m）で、日本の実験棟「きぼう」もつながっています。</p>

      <h3>どう見える？</h3>
      <p>条件がよければ木星くらい（−2等級）の明るさになり、真上近くを通るときは金星や木星より明るく見えることもあります。点滅せず、明るい光のまま空をすーっと動いていきます。見えるのは主に日の入り後と日の出前の2時間ほどで、見える回のない日が何日も続くこともあります。空の途中で急に現れたり消えたりするのは、地球の影から出入りするためです。</p>

      <h3>ほかの予報も見たいときは</h3>
      <p>ISS の予報は、JAXA の支援のもとで運営されている<a href="https://lookup.kibo.space/" target="_blank" rel="noopener">「#きぼうを見よう」</a>でも調べられます。このサイトでは、ISS のほかに<a href="tiangong.html">天宮（中国の宇宙ステーション）が見える時間</a>や、<a href="index.html">ほかの人工衛星もまとめた予報</a>も見られます。見え方の疑問は<a href="index.html#faq">よくある質問</a>にまとめています。</p>

      <p class="about-src">出典：JAXA<a href="https://humans-in-space.jaxa.jp/iss/about/" target="_blank" rel="noopener">「国際宇宙ステーション（ISS）とは」</a>・<a href="https://iss.jaxa.jp/iss/map/guide.html" target="_blank" rel="noopener">「「きぼう」を見よう」</a>・<a href="https://fanfun.jaxa.jp/faq/detail/78.html" target="_blank" rel="noopener">よくある質問「地上から肉眼で「きぼう」/ISSを見ることはできますか？」</a>、<a href="https://lookup.kibo.space/howto/" target="_blank" rel="noopener">#きぼうを見よう</a></p>
    </div>`,
  },
  {
    file: 'tiangong.html',
    id: 48274,
    title: '天宮（中国の宇宙ステーション）が見える時間と方角 | 人工衛星みえる予報',
    description: '中国の宇宙ステーション「天宮」が、日本のあなたの街からいつ・どの方角に見えるかを、地図と空の図で調べられます。今夜から7夜分の予報です。',
    h1: '天宮<span class="nowrap">（中国の宇宙ステーション）</span>が見える時間',
    lead: '場所を選ぶと、中国の宇宙ステーション「天宮」が今夜から7夜のうち、いつ・どの方角に見えるかがわかります。低い空を通る回も含めて出しています。',
    about: `
    <h2 id="h-about" class="card-title">天宮（中国の宇宙ステーション）について</h2>
    <div class="faq-list">
      <h3>どんな施設？</h3>
      <p>中国が運用している宇宙ステーションです。中心となる「天和」（2021年打ち上げ）に、実験施設の「問天」と「夢天」がつながった T 字形で、2022年11月に基本の形ができあがりました。</p>
      <p>このサイトの軌道データでは、地上から約390kmの高さを、約90分で地球を1周しています。通り道は北緯41〜42度あたりまでで、それより北の地域では真上を通りません。ただ、札幌からも、南寄りの空の高いところを通る回があります。</p>

      <h3>どう見える？</h3>
      <p>ISS と同じく、太陽の光を反射して、空をすーっと動く光として見えます。見えるのは主に日の入り後と日の出前で、見える回のない日が何日も続くこともあります。空の途中で急に現れたり消えたりするのは、地球の影から出入りするためです。</p>

      <h3>ほかの予報も見たいときは</h3>
      <p>このサイトでは、<a href="iss.html">ISS（国際宇宙ステーション）が見える時間</a>や、<a href="index.html">ほかの人工衛星もまとめた予報</a>も見られます。見え方の疑問は<a href="index.html#faq">よくある質問</a>にまとめています。</p>

      <p class="about-src">出典：<a href="https://www.astroarts.co.jp/article/hl/a/12747_css" target="_blank" rel="noopener">アストロアーツ「中国宇宙ステーションが完成」</a>、軌道データ＝<a href="https://celestrak.org/" target="_blank" rel="noopener">CelesTrak</a></p>
    </div>`,
  },
];

const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// 置き換える場所が見つからないとき（予報のページの作りが変わったとき）は、作らずに止める
function swap(html, from, to) {
  const found = typeof from === 'string' ? html.includes(from) : from.test(html);
  if (!found) throw new Error(`index.html に見つかりません：${String(from).slice(0, 60)}`);
  return html.replace(from, to);
}
const block = (html, start, end, to) => {
  const i = html.indexOf(start);
  const j = html.indexOf(end, i);
  if (i < 0 || j < 0) throw new Error(`index.html に見つかりません：${start.slice(0, 60)}`);
  return html.slice(0, i) + to + html.slice(j + end.length);
};

for (const s of STATIONS) {
  let h = src;
  h = swap(h, '<!doctype html>\n', '<!doctype html>\n<!-- このファイルは scripts/build-stations.mjs で index.html から作っています。直接は直さず、index.html か scripts/build-stations.mjs を直して npm run build-stations で作り直す -->\n');
  h = swap(h, /<title>[^<]*<\/title>/, `<title>${s.title}</title>`);
  h = swap(h, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${s.description}">`);
  // 検索サイトに、このページの正本はこのアドレスだと伝える（予報のページの ?sat=番号 と同じ中身になるため）
  h = swap(h, '<link rel="canonical" href="https://satellite-watch.jp/">', `<link rel="canonical" href="https://satellite-watch.jp/${s.file}">`);
  h = swap(h, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${s.title}">`);
  h = swap(h, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${s.description}">`);
  h = swap(h, '<meta property="og:url" content="https://satellite-watch.jp/">', `<meta property="og:url" content="https://satellite-watch.jp/${s.file}">`);
  h = swap(h, '<body>', `<body data-sat="${s.id}">`);
  // 上部は予報のページと同じ。サイト名は予報のページへのリンクにし、このページの大見出し（h1）は本文の先頭に置く（図鑑と同じ形）
  h = swap(h, '<h1 class="site-title">人工衛星みえる予報</h1>', '<p class="site-title"><a class="site-title-link" href="index.html">人工衛星みえる予報</a></p>');
  // 予報の中の1ページなので「予報」のタブを選んだ形で見せる（ただし、このページそのものではないので page ではなく true）
  h = swap(h, '<a href="index.html" aria-current="page">予報</a>', '<a href="index.html" aria-current="true">予報</a>');
  h = swap(h, '<main>\n', `<main>\n<section class="wrap station-intro" aria-labelledby="h-station">\n  <h1 id="h-station" class="station-title">${s.h1}</h1>\n  <p class="station-lead">${s.lead}</p>\n</section>\n`);
  // 一覧の見出し：上の大見出し（「○○が見える時間」）と同じ言葉が続かないよう、このページでは「見える日と時刻」にする（2026-10-06 sat-designer の指摘）
  h = swap(h, '<h2 id="h-passes" class="card-title" tabindex="-1">衛星が見える時間</h2>', '<h2 id="h-passes" class="card-title" tabindex="-1">見える日と時刻</h2>');
  // 「解除」の代わりに、ほかの衛星もまとめた予報へのリンク
  h = swap(h, '<button type="button" id="sat-only-clear" class="btn btn-ghost">解除</button>', '<a id="sat-only-clear" class="btn btn-ghost" href="index.html">ほかの衛星も見る</a>');
  // よくある質問の代わりに、その宇宙ステーションの説明（よくある質問は予報のページにリンクする）
  h = block(h, '  <!-- よくある質問。', '<!-- よくある質問ここまで（scripts/build-stations.mjs がこの目印までを差し替える） -->\n', `  <section id="about" class="wrap faq" aria-labelledby="h-about">${s.about}\n  </section>\n`);
  // 絞り込み：「明るい衛星だけ」「宇宙ステーションだけ」はこのページでは効き目がないので隠す（2026-10-02 オーナー判断）。
  // 画面の動き（js/app.js）が同じ部品を使うので、消さずに hidden にする。「見やすい回だけ」の説明は宇宙ステーションの基準（25°）にする
  h = swap(h, '<label class="chip"><input type="checkbox" id="only-big" checked>', '<label class="chip" hidden><input type="checkbox" id="only-big" checked>');
  h = swap(h, '<label class="chip"><input type="checkbox" id="only-stations">', '<label class="chip" hidden><input type="checkbox" id="only-stations">');
  h = swap(h, '<small class="chip-sub">高さ40°以上を通る</small>', '<small class="chip-sub">高さ25°以上を通る</small>');
  // 地図の凡例の「見える範囲の目安」の輪は ISS の高さで描いている。天宮（約390km）でもほぼ同じなので、言葉だけ合わせる
  if (s.id !== 25544) h = h.replaceAll('ISSが入ってくると見える範囲の目安', '宇宙ステーションが入ってくると見える範囲の目安（ISS の高さで描いた目安）');
  // ページの下の宇宙ステーションへのリンクのうち、いま見ているページ自身はリンクにしない（押すと選んだ場所や回が消えるため）
  h = h.replace(new RegExp(`<a href="${s.file}">([^<]*)</a>`), '<b aria-current="page">$1</b>');
  writeFileSync(new URL(`../${s.file}`, import.meta.url), h);
  console.log(`${s.file} を作りました`);
}
