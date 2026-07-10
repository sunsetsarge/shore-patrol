#!/usr/bin/env python3
# No-cache static server for local dev. python's http.server sends no
# cache-control headers, so browsers heuristically cache ES modules + JSON and
# you end up debugging stale code (this bit us repeatedly). This handler forces
# no-store on everything, so a plain reload always fetches fresh files.
# Usage: python serve_nocache.py [port]
import http.server, socketserver, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
    print(f"No-cache server on http://localhost:{PORT} (Ctrl+C to stop)")
    httpd.serve_forever()
