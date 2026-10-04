// 衛星の画像（図鑑のページ zukan.html で使う。2026-10-01 オーナー判断で一覧の札の中からは外した。地図と空の図の吹き出しにも出さない）。
// 実物の画像があるのは一部だけ。ない衛星には何も出さない。
// 画像の出典と利用条件は img/sats/SOURCES.md。**使ってよいと確かめた画像だけを足す**
// このサイトは広告を載せる前提（2026-09-30 オーナー判断）。商用でも使える画像だけを入れる
// kind：写真か想像図か。note：いつ・どこから撮ったか。credit：画面に出す出典（ライブラリの記載どおり。省かない）。w・h：画像の大きさ（px）
// ここの値は画面にそのまま入れている。外のデータから作るように変えるときは、無害化（エスケープ）を足すこと

export const PHOTOS = {
  25544: { file: '25544.jpg', kind: '写真', note: '2011年、スペースシャトルから撮影', credit: 'NASA', w: 900, h: 598 },
  20580: { file: '20580.jpg', kind: '写真', note: '2009年、スペースシャトルから撮影', credit: 'NASA', w: 900, h: 597 },
  25994: { file: '25994.jpg', kind: '想像図', note: '', credit: 'NASA/JPL/Shigeru Suzuki and Eric M. De Jong, Solar System Visualization Project', w: 400, h: 309 },
  27424: { file: '27424.jpg', kind: '想像図', note: '', credit: 'NASA', w: 900, h: 506 },
  10967: { file: '10967.jpg', kind: 'イラスト', note: '', credit: 'NASA/JPL-Caltech', w: 900, h: 589 }, // ライブラリの説明に「想像図」の語がないので「イラスト」と呼ぶ
};
