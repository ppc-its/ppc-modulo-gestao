#!/usr/bin/env python3
"""
Servidor simples (stdlib) para:
- Servir o dashboard (index.html) em http://localhost:8000
- Expor /api/tasks (lendo do SQLite)

Uso:
  python server/simple_api.py --root . --db data/tasks.db --port 8000

Depois, no front-end, você pode trocar o fetch de data/tasks.json para /api/tasks
(se quiser). Por padrão, o front carrega data/tasks.json.
"""
import argparse, json, sqlite3, os
from http.server import SimpleHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, root_dir=None, db_path=None, **kwargs):
        self.root_dir = root_dir
        self.db_path = db_path
        super().__init__(*args, directory=root_dir, **kwargs)

    def do_GET(self):
        p = urlparse(self.path)
        if p.path == "/api/health":
            self._json({"ok": True})
            return
        if p.path == "/api/tasks":
            try:
                con = sqlite3.connect(self.db_path)
                con.row_factory = sqlite3.Row
                cur = con.cursor()
                rows = cur.execute('SELECT * FROM "tasks"').fetchall()
                con.close()
                tasks = []
                for r in rows:
                    d = dict(r)
                    # remove cols auxiliares se existirem
                    d.pop("__imported_at", None)
                    d.pop("__horas_num", None)
                    d.pop("__horas_adm_num", None)
                    tasks.append(d)
                self._json({"tasks": tasks})
            except Exception as e:
                self.send_error(500, f"Erro ao ler DB: {e}")
            return

        return super().do_GET()

    def _json(self, obj, code=200):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".", help="Pasta raiz do dashboard (onde está o index.html)")
    ap.add_argument("--db", default="data/tasks.db", help="Caminho do SQLite")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()

    os.chdir(args.root)
    httpd = HTTPServer(("0.0.0.0", args.port), lambda *a, **kw: Handler(*a, root_dir=args.root, db_path=args.db, **kw))
    print(f"OK: servindo {args.root} em http://localhost:{args.port}  (API: /api/tasks)")
    httpd.serve_forever()

if __name__ == "__main__":
    main()
