#!/usr/bin/env python3
# Screenshot sink for the Fable-judge loop. The game page POSTs its canvas PNG
# here (cross-origin from :8123) and we write it to disk so a Fable subagent can
# Read + judge the exact frame. Usage: python screenshot_sink.py [port] [outdir]
import http.server, socketserver, sys, os, urllib.parse

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8200
OUT  = sys.argv[2] if len(sys.argv) > 2 else "shots"
os.makedirs(OUT, exist_ok=True)

class H(http.server.BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_POST(self):
        q = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(q.query)
        name = (params.get('name', ['shot'])[0])
        name = ''.join(c for c in name if c.isalnum() or c in '_-') or 'shot'
        n = int(self.headers.get('Content-Length', 0))
        data = self.rfile.read(n)
        path = os.path.join(OUT, name + '.png')
        with open(path, 'wb') as f:
            f.write(data)
        print("saved", path, len(data), "bytes", flush=True)
        self.send_response(200); self._cors(); self.end_headers()
        self.wfile.write(b'ok')
    def log_message(self, *a): pass

with socketserver.TCPServer(("", PORT), H) as s:
    print(f"screenshot sink on :{PORT} -> {OUT}/", flush=True)
    s.serve_forever()
