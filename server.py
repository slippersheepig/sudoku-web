from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os

PORT = int(os.environ.get("PORT", "8080"))
ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


with ThreadingHTTPServer(("", PORT), QuietHandler) as httpd:
    print(f"Serving on 0.0.0.0:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
