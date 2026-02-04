#!/usr/bin/env python3
"""
Exporta tasks do SQLite para um JSON consumido pelo front-end (data/tasks.json).

Uso:
  python tools/export_sqlite_to_json.py --db data/tasks.db --out data/tasks.json
"""
import argparse, json, sqlite3, datetime
from pathlib import Path

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--table", default="tasks")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    con = sqlite3.connect(args.db)
    con.row_factory = sqlite3.Row
    cur = con.cursor()
    rows = cur.execute(f'SELECT * FROM "{args.table}"').fetchall()
    con.close()

    # remove colunas auxiliares
    tasks = []
    for r in rows:
        d = dict(r)
        d.pop("__imported_at", None)
        d.pop("__horas_num", None)
        d.pop("__horas_adm_num", None)
        tasks.append(d)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"updatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "tasks": tasks}
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK: exportadas {len(tasks)} demandas para {out_path}")

if __name__ == "__main__":
    main()
