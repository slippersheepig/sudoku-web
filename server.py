import os
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

PORT = int(os.environ.get("PORT", "8080"))
ROOT = os.path.dirname(os.path.abspath(__file__))
ALLOWED_PATHS = {"/", "/index.html", "/style.css", "/script.js"}


class StaticHandler(SimpleHTTPRequestHandler):
    def _is_allowed(self):
        return urlsplit(self.path).path in ALLOWED_PATHS

    def do_GET(self):
        if not self._is_allowed():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        super().do_GET()

    def do_HEAD(self):
        if not self._is_allowed():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        super().do_HEAD()

    def log_message(self, fmt, *args):
        pass


def main():
    handler = partial(StaticHandler, directory=ROOT)
    with ThreadingHTTPServer(("", PORT), handler) as httpd:
        print(f"Serving on 0.0.0.0:{PORT}", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
