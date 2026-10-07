# 人工衛星みえる予報（試作）

日本の地名を入れると、その場所から肉眼で見えることがある人工衛星（ISS・天宮など約160機）の
「いつ・どの方角に見えるか」と、空の図・地図での位置がわかるサイト。

## ファイル

| 場所 | 中身 |
|---|---|
| `index.html` / `css/style.css` | 画面 |
| `js/app.js` | 画面の動き（地名検索・一覧・空の図・地図） |
| `js/astro.js` | 衛星の位置と「見えるか」の計算 |
| `js/purposes.js` | 衛星の目的（一言）。公表資料で確かめて書く。新しい衛星が加わったら1行足す |
| `iss.html` / `tiangong.html` | 宇宙ステーションのページ（ISS・天宮）。予報のページと同じ画面を、その衛星だけに絞って出し、上と下に説明を足したもの。**`scripts/build-stations.mjs` が `index.html` から作る**ので直接は直さない。`index.html` を直したら `npm run build-stations` で作り直して記録に入れる（公開の仕組みでも毎回作り直すので、公開されるものは常に最新） |
| `favicon.svg` / `favicon.ico` / `apple-touch-icon.png` / `img/ogp.png` | タブのアイコン・スマホのホーム画面のアイコン・SNS で共有したときの画像。元の絵は `img/src/` の SVG（自作）。共有用の画像のサイト名の文字は Noto Sans JP（SIL Open Font License 1.1。利用条件は `img/src/fonts/OFL.txt`。フォントのファイルは大きいので記録に入れていない。無いときは作る仕組みが取ってくる場所を案内して止まる）。`scripts/build-images.py` で作り直す（Chrome と Pillow を使う。Apple シリコンの Mac で Pillow が動かないときは `arch -x86_64 python3 scripts/build-images.py`） |
| `404.html` | 存在しないアドレスを開いたときのページ（GitHub Pages が使う）。読み込むものは「/」から始まるアドレスで書く |
| `sitemap.xml` / `robots.txt` | 検索サイト向けのページの一覧と案内。**ページを足したら `sitemap.xml` にも足す**。各ページの `<link rel="canonical">`（正本のアドレス）も satellite-watch.jp で書いている |
| `zukan.html` / `js/zukan.js` | 衛星図鑑のページ（画像のある衛星を、名前・国・打ち上げ年・目的といっしょに並べる） |
| `js/images.js` | 衛星の画像の表（実物の画像があるものだけ）。足すときは `img/sats/SOURCES.md` にも1行足す |
| `img/sats/` | 衛星の写真・想像図（NASA）。出典と利用条件は `SOURCES.md` |
| `js/worker.js` | 見える回の計算を裏で行う係（画面を固めないため） |
| `js/shared.js` | 衛星のページと図鑑のページで共通のもの（日本時間の扱い・場所の保存・地名検索・現在地） |
| `js/ga.js` | 見た人を数える仕組み（Google アナリティクス）。測定IDはここだけ。satellite-watch.jp で開いたときだけ動く |
| `privacy.html` | プライバシーポリシー（送り先・送る情報・目的）。外へ送る仕組みを変えたら、ここも直して日付を新しくする |
| `lib/satellite.min.js` | 軌道計算の部品 satellite.js 7.1.0（MIT）。`npm run build-lib` で作り直せる |
| `data/sats.json` | 軌道データ（CelesTrak の visual グループ）＋国・打ち上げ日（CelesTrak の衛星登録台帳） |
| `data/muni.json` | 市区町村コード→名前（地名検索で同名の場所を区別するため） |
| `scripts/build-stations.mjs` | 宇宙ステーションのページを作る（`npm run build-stations`）。説明文もここにある。予報のページの作りが変わって置き換える場所が見つからないときは、作らずに止まる |
| `scripts/update-data.mjs` | 軌道データを取り直す（`npm run update-data`） |
| `scripts/serve.py` | 手元で見るための簡易サーバー。ブラウザに古いファイルを覚えさせない |
| `scripts/build-muni.mjs` | 市区町村の対応表を作り直す（市町村合併のとき） |
| `.github/workflows/update-data.yml` | 公開後、軌道データを1日3回自動で取り直し、サイトを公開し直す（本線に保存したときも公開し直す）。サイトに載せるのは「サイトに載せるファイルだけを集める」に書いたファイルだけ。**画面で使うファイルを新しく足したら、ここにも足す** |

星と流星群のページ（試作）は 2026-10-01 に公開から外した。作ったものは枝 `hoshi-ryuseigun` に保管してある。

## 使っている外部のもの

**2026-10-02 に、広告を載せるサイトとして使ってよいかを、配布元の原文で読み直した**（CLAUDE.md の「公開前に読み直す」）。広告を実際に始める前にもう一度読む。

| もの | 使い方 | 利用条件（読んだところ） | 守っていること・残る心配 |
|---|---|---|---|
| 地図：地理院タイル（淡色地図） | 見る人のブラウザが直接読む。夜向けの色に変えて表示 | [地理院タイル一覧](https://maps.gsi.go.jp/development/ichiran.html)：ウェブサイトでリアルタイムに読み込むなら出典の明示だけで申請は要らない。[国土地理院コンテンツ利用規約](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html)（公共データ利用規約 PDL1.0 と同じ）：商用可。加工したら「〜をもとに作成」と加工したことを示し、国土地理院が作ったように見せない | 地図の右下とページの下に出典。ページの下に「色を加工して作成」と書いた |
| 地名検索：国土地理院 地名検索（msearch.gsi.go.jp） | 見る人のブラウザが直接呼ぶ | 国土地理院の回答（[2015年、GitHub](https://github.com/gsi-cyberjapan/gsimaps/issues/29)）：主に地理院地図からの利用を想定しており、**長く提供できるとは限らず、仕様が予告なく変わることがある**。外部での利用を禁じてはいない | 出典を表示。止まったときは「『現在地』ボタンでも場所を選べます」と案内する。**代わりの手段を持っていないのが残る心配**。公開の仕組み（`.github/workflows/update-data.yml` の check-search）が1日1回動いているかを確かめ、止まっていたら失敗として知らせる |
| 市区町村名：国土地理院の市区町村コード表（maps.gsi.go.jp/js/muni.js） | `scripts/build-muni.mjs` で `data/muni.json` に変換して置く | 上の国土地理院コンテンツ利用規約（商用可・出典） | ページの下に「地名検索・市区町村名＝国土地理院」 |
| 軌道データ・衛星登録台帳：CelesTrak | GitHub Actions が1日3回取って `data/sats.json` に保存。見る人のブラウザからは取りに行かない | [CelesTrak の利用方針](https://celestrak.org/usage-policy.php)：取りに行くのは更新ごとに1回まで（軌道データは2時間ごとに更新）。配り直しや商用利用についての記載はない。データのもとは米国宇宙軍：[Space-Track.org の説明](https://www.space-track.org/documentation)では、基本的な軌道データ・登録台帳は「適切な出典を示すこと」を条件に配り直してよいという包括的な許可がある。商用についての記載はない | 1日3回（8時間ごと）で、方針より十分少ない。出典に CelesTrak と「もとは米国宇宙軍が Space-Track.org で公開しているデータ」を書いた。**「商用の配り直しには許可が要る」とする第三者のサイトがあったが、CelesTrak と Space-Track の原文には見当たらなかった** |
| 衛星の画像（図鑑）：NASA の画像ライブラリ | `img/sats/` に縮小して置く | [NASA](https://www.nasa.gov/nasa-brand-center/images-and-media/)：広告を含む商用利用では、NASA が推薦しているように見せない。出典として NASA を示す。見分けのつく人物は許可が要る。[JPL](https://www.jpl.nasa.gov/jpl-image-use-policy/)：推薦に見せない。他者が著作権を持つ画像は商用に制限 | 図鑑に「NASA がこのサイトを推薦しているわけではありません」と出典。詳しくは `img/sats/SOURCES.md` |
| 地図の部品：Leaflet 1.9.4 | cdnjs（Cloudflare の無料の配信）から読む | BSD 2条項ライセンス（商用可。部品を配るときは著作権表示を残す。このサイトは配っていない） | 地図の右下に「Leaflet」と出る |
| 計算の部品：satellite.js 7.1.0 | `lib/satellite.min.js` に入れて配る | MIT ライセンス（商用可。配るときは著作権表示と許諾文を付ける） | `lib/satellite.js-LICENSE.md` も一緒に公開。ページの下に「satellite.js（MITライセンス）」 |
| 共有用の画像の文字：Noto Sans JP | 画像を作るときだけ使い、サイトには載せない | SIL Open Font License 1.1（商用可。作った画像に制限はない） | 本文は `img/src/fonts/OFL.txt` |
| アクセス解析：Google アナリティクス（GA4） | `js/ga.js` が satellite-watch.jp で開いたときだけ読み込む | [Google アナリティクス利用規約](https://marketingplatform.google.com/about/analytics/terms/jp/)：Cookie などの利用と情報の収集をプライバシーポリシーで知らせること | `privacy.html` に書いた。Google シグナル・広告のカスタマイズはオフ。データ共有設定はすべてオフ、データ保持14か月 |
| お問い合わせ：Google フォーム | ページの下からリンク | Google の利用規約 | 返信先のメールアドレスは返信にだけ使う、と `privacy.html` とフォームの説明に書いた |

## 見える条件

衛星が地平線から10°以上／観測地の太陽が-6°より下（空が十分暗い）／衛星に日が当たっている。
「見やすい回」＝最も高いところが40°以上（宇宙ステーションは25°以上）。

## 手元で動かす

```bash
python3 scripts/serve.py
```

http://localhost:8140 を開く。
