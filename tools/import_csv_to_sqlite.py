#!/usr/bin/env python3
"""
Importa o CSV diário para um SQLite e (opcional) gera data/tasks.json.

Uso:
  python tools/import_csv_to_sqlite.py --csv data/arquivo_do_dia.csv --db data/tasks.db
  python tools/import_csv_to_sqlite.py --csv data/arquivo_do_dia.csv --db data/tasks.db --export-json data/tasks.json

Observações:
- O CSV é o mesmo layout que você mandou.
- Importa tudo como colunas TEXT, e cria algumas colunas numéricas auxiliares.
- Você pode rodar isso todo dia (sobrescrevendo a tabela) ou adaptar para append/histórico.
"""
import argparse, csv, json, sqlite3, os, datetime
from pathlib import Path

def to_number(x: str) -> float:
    s = (x or "").strip()
    if not s:
        return 0.0
    s = s.replace(".", "").replace(",", ".")
    # remove moeda e outros
    out = []
    for ch in s:
        if ch.isdigit() or ch in ".-":
            out.append(ch)
    try:
        return float("".join(out)) if out else 0.0
    except ValueError:
        return 0.0

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True, help="Caminho do CSV do dia")
    ap.add_argument("--db", required=True, help="Caminho do SQLite (.db)")
    ap.add_argument("--table", default="tasks", help="Nome da tabela")
    ap.add_argument("--mode", choices=["replace","append"], default="replace")
    ap.add_argument("--export-json", default=None, help="Se setado, escreve um tasks.json (raw rows) nesse caminho")
    args = ap.parse_args()

    csv_path = Path(args.csv)
    db_path = Path(args.db)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    with csv_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        if not rows:
            raise SystemExit("CSV vazio.")

        cols = reader.fieldnames or []
        # SQLite safe identifiers
        def qident(name: str) -> str:
            return '"' + name.replace('"','""') + '"'

        con = sqlite3.connect(str(db_path))
        cur = con.cursor()

        if args.mode == "replace":
            cur.execute(f'DROP TABLE IF EXISTS {qident(args.table)}')

        # create table if not exists
        col_defs = ", ".join([f'{qident(c)} TEXT' for c in cols])
        cur.execute(f'CREATE TABLE IF NOT EXISTS {qident(args.table)} ({col_defs}, "__imported_at" TEXT, "__horas_num" REAL, "__horas_adm_num" REAL)')

        if args.mode == "replace":
            cur.execute(f'DELETE FROM {qident(args.table)}')

        placeholders = ", ".join(["?"] * (len(cols) + 3))
        insert_sql = f'INSERT INTO {qident(args.table)} ({", ".join([qident(c) for c in cols])}, "__imported_at", "__horas_num", "__horas_adm_num") VALUES ({placeholders})'

        now = datetime.datetime.now(datetime.timezone.utc).isoformat()

        for r in rows:
            vals = [(r.get(c, "") or "") for c in cols]
            horas = to_number(r.get("Horas",""))
            horas_adm = to_number(r.get("Horas ADM",""))
            vals.extend([now, horas, horas_adm])
            cur.execute(insert_sql, vals)

        con.commit()
        con.close()

    print(f"OK: importadas {len(rows)} linhas para {db_path} (tabela {args.table}).")

    if args.export_json:
        out_path = Path(args.export_json)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"updatedAt": now, "tasks": rows}
        out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"OK: gerado JSON em {out_path}.")

if __name__ == "__main__":
    main()
