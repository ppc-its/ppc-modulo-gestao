# PPC Task Board (HTML + CSS + JS)

Este pacote é **100% editável** e funciona de dois jeitos:

## 1) Abrindo o HTML direto (file://)
- Abra `index.html`
- Clique em **Carregar CSV** e selecione o arquivo do dia (mesmo layout que vocês já extraem)
- O dashboard salva um cache local (localStorage) para facilitar

✅ Esse modo atende o requisito de “qualquer um clicar no HTML e ver/interagir”.

## 2) Hospedando em um servidor (recomendado)
### Opção A — Servidor estático simples
- Coloque a pasta em um servidor interno (IIS, Apache, Nginx, etc.)
- Atualize o arquivo `data/tasks.json` diariamente (pode ser gerado via script)

### Opção B — Servidor simples + SQLite (stdlib Python)
1. Importar o CSV para SQLite:
   ```bash
   python tools/import_csv_to_sqlite.py --csv data/tasks.sample.csv --db data/tasks.db
   ```
2. (Opcional) Gerar `data/tasks.json` para o front:
   ```bash
   python tools/import_csv_to_sqlite.py --csv data/tasks.sample.csv --db data/tasks.db --export-json data/tasks.json
   ```
3. Subir o servidor:
   ```bash
   python server/simple_api.py --root . --db data/tasks.db --port 8000
   ```

## Onde editar coisas
- **Visual**: `css/styles.css`
- **Regras de status**: `js/app.js` → função `normalizeStatus()`
- **Regra de “tipo de demanda”**: `js/app.js` → função `detectDemandType()`
- **Campos do modal**: `js/app.js` → `openModal()`

## Input esperado (CSV)
O dashboard usa o cabeçalho do CSV como chaves. Se o time mudar nomes de colunas no export, basta ajustar a regra no JS (sem build).

---
Feito para ser “bonito e organizado” e ao mesmo tempo fácil de manter.
