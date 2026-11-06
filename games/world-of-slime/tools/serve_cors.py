"""http.server có header CORS, để trang game (cổng khác) tải asset cục bộ như từ Pages (Pages trả CORS *).

py -3.12 -I games/world-of-slime/tools/serve_cors.py 8842 D:/world-of-slime-assets
Bẫy: `py -m http.server` trần không gửi Access-Control-Allow-Origin, fetch/GLTFLoader từ cổng khác bị chặn.
"""
import functools
import http.server
import sys


class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, *a):
        pass


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8842
root = sys.argv[2] if len(sys.argv) > 2 else '.'
http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(H, directory=root)).serve_forever()
