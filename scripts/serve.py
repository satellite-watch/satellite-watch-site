# 手元で見るための簡易サーバー（http://localhost:8140）。
# ふつうの python3 -m http.server だと、ブラウザが古いファイルを覚えたまま使い、
# 直したはずの画面が古いまま・途中で止まったままになることがある。毎回取り直させるため「覚えないで」と伝える。
# 使い方：python3 scripts/serve.py
import functools, http.server, os

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
http.server.ThreadingHTTPServer(('127.0.0.1', 8140), functools.partial(NoCache, directory=root)).serve_forever()
