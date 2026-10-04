# サイトのアイコンと共有用の画像（PNG・ICO）を、img/src/ の SVG から作る（手元で動かす：python3 scripts/build-images.py。Apple シリコンの Mac で Pillow が動かないときは arch -x86_64 python3 scripts/build-images.py）
# Chrome（画面を出さずに動かす）で SVG を描き、Python の画像の部品（Pillow）で大きさをそろえる。
# 作ったファイルは記録に入れる（公開の仕組みでは作らない）。絵を変えたら、これを動かして作り直す
import subprocess, tempfile, pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'img' / 'src'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'


FONT = SRC / 'fonts' / 'NotoSansJP-wght.ttf'  # 記録には入れていない。無い場合は下の説明を見て取ってくる


def render(svg, w, h, out):
    # SVG をそのままの大きさで描いて PNG にする（余白なし）。
    # 文字の入った絵は、フォントを読めるようページの中に直接 SVG を置く（<img> で読むと外のフォントを使えないため）
    text = svg.read_text()
    if '<text' in text:
        if not FONT.exists():
            raise SystemExit(f'{FONT} がありません。Google Fonts の配布元（https://github.com/google/fonts/tree/main/ofl/notosansjp）から NotoSansJP[wght].ttf を取ってきて、この名前で置いてください（利用条件は同じ場所の OFL.txt）')
        body = f'<style>@font-face{{font-family:"Noto Sans JP";src:url("{FONT.as_uri()}");font-weight:100 900}}</style>{text}'
    else:
        body = f'<img src="{svg.as_uri()}" width="{w}" height="{h}" style="display:block">'
    html = f'<html><body style="margin:0;background:transparent">{body}</body></html>'
    with tempfile.TemporaryDirectory() as d:
        page = pathlib.Path(d) / 'p.html'
        page.write_text(html)
        shot = pathlib.Path(d) / 'shot.png'
        subprocess.run([CHROME, '--headless=new', '--allow-file-access-from-files', '--virtual-time-budget=3000', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
                        '--default-background-color=00000000', f'--window-size={w},{h}', f'--screenshot={shot}', page.as_uri()],
                       check=True, capture_output=True)
        Image.open(shot).convert('RGBA').crop((0, 0, w, h)).save(out)


render(SRC / 'ogp.svg', 1200, 630, ROOT / 'img' / 'ogp.png')
# 文字が本当に Noto Sans JP で描かれたかを確かめる。フォントを読めないと、黙ってパソコンの別の文字（ヒラギノなど。
# 広告つきのサイトでの利用条件を確かめていない）で描かれてしまうため、存在しない文字の名前で描いたものと比べて、同じなら止める
with tempfile.TemporaryDirectory() as d:
    alt = pathlib.Path(d) / 'alt.svg'
    alt.write_text((SRC / 'ogp.svg').read_text().replace('font-family="Noto Sans JP"', 'font-family="NoSuchFont"'))
    render(alt, 1200, 630, pathlib.Path(d) / 'alt.png')
    a_, b_ = (Image.open(f).convert('RGB').crop((0, 520, 1200, 630)) for f in (ROOT / 'img' / 'ogp.png', pathlib.Path(d) / 'alt.png'))
    if a_.tobytes() == b_.tobytes():
        raise SystemExit('共有用の画像の文字が Noto Sans JP で描かれていません（フォントを読めていない）。作るのを止めました')
# ほかの画面と同じく、色の数を減らして軽くする（共有用の画像は 1MB 未満が目安）
Image.open(ROOT / 'img' / 'ogp.png').convert('RGB').quantize(256).save(ROOT / 'img' / 'ogp.png', optimize=True)
render(SRC / 'icon-full.svg', 180, 180, ROOT / 'apple-touch-icon.png')
big = ROOT / 'img' / 'src' / '_icon256.png'
render(SRC / 'icon.svg', 256, 256, big)
Image.open(big).save(ROOT / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
big.unlink()
(ROOT / 'favicon.svg').write_text((SRC / 'icon.svg').read_text())
for f in ['img/ogp.png', 'apple-touch-icon.png', 'favicon.ico', 'favicon.svg']:
    print(f, (ROOT / f).stat().st_size, 'バイト')
