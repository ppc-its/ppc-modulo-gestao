/* =========================
   PPC Task Board - app.js
   Vanilla JS (sem necessidade de build)
   ========================= */

const STATUS_ORDER = [
  { key: "Em Avaliação", label: "Em Avaliação" },
  { key: "Backlog", label: "Backlog" },
  { key: "Em andamento", label: "Em Andamento" },
  { key: "Concluída", label: "Concluída" },
  { key: "Cancelada", label: "Cancelada" },
];

const TYPE_ORDER = [
  { key: "INTELIDADOS", label: "INTELIDADOS" },
  { key: "CYBER", label: "CYBER" },
  { key: "AUDITORIA TI", label: "AUDITORIA TI" },
  { key: "CONSUL. TI", label: "CONSUL. TI" },
  { key: "DEMANDA INT.", label: "DEMANDA INT." },
  { key: "OUTROS", label: "OUTROS" },
];

const LOCAL_STORAGE_KEY = "ppc_task_board_data_v1";
const LOCAL_FILTERS_KEY = "ppc_task_board_filters_v1";
const LOCAL_CSV1_KEY = "ppc_csv1_data_v1";
const LOCAL_CSV2_KEY = "ppc_csv2_data_v1";

function $(sel, el = document) { return el.querySelector(sel); }
function $$(sel, el = document) { return [...el.querySelectorAll(sel)]; }

function safeStr(x) { return (x === null || x === undefined) ? "" : String(x).trim(); }
function toNumber(x) {
  const s = safeStr(x).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function initials(name) {
  const s = safeStr(name);
  if (!s) return "—";
  const parts = s.split(/\s+/).filter(Boolean);
  const a = (parts[0]?.[0] || "").toUpperCase();
  const b = (parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1]) || "";
  return (a + String(b).toUpperCase()).slice(0, 2);
}

function normalizeStatus(raw) {
  const s = safeStr(raw).toLowerCase();

  // "Em Avaliação"
  if (["em avaliação", "em avaliacao", "avaliacao", "avaliação", "analise", "análise"].includes(s)) return "Em Avaliação";

  // "Backlog"
  if (["backlog", "to do", "todo", "a fazer", "fila"].includes(s)) return "Backlog";

  // "Em andamento" (incluindo bloqueado/testando para não perder tarefas)
  if (["em andamento", "andamento", "doing", "in progress", "progresso", "fazendo", "execução"].includes(s)) return "Em andamento";
  if (["bloqueado", "blocked", "impedido"].includes(s)) return "Em andamento"; // Mapeando bloqueado para fazendo
  if (["teste", "testing", "qa", "homologação", "homologacao", "revisão"].includes(s)) return "Em andamento"; // Mapeando testes para fazendo

  // "Concluída"
  if (["concluído", "concluido", "done", "finalizado", "entregue", "concluída", "concluida"].includes(s)) return "Concluída";

  // "Cancelada"
  if (["cancelado", "dismissed", "descartado", "cancelada"].includes(s)) return "Cancelada";

  // Fallback padrão
  return "Backlog";
}

function detectDemandType(row) {
  // O CSV tem múltiplas "colunas de tipo". Vamos inferir o tipo de demanda:
  // Prioridade: Intelidados, Cybersecurity, Auditoria TI, Consultoria de TI, Demanda Interna (PPeC), Outros
  const intel = safeStr(row["Intelidados"]);
  const cyber = safeStr(row["Cybersecurity"]);
  const audit = safeStr(row["Auditoria TI"]);
  const consul = safeStr(row["Consultoria de TI"]);
  const intern = safeStr(row["Demanda Interna (PPeC)"]);
  const outros = safeStr(row["Outros"]);

  if (intel) return "INTELIDADOS";
  if (cyber) return "CYBER";
  if (audit) return "AUDITORIA TI";
  if (consul) return "CONSUL. TI";
  if (intern) return "DEMANDA INT.";
  if (outros) return "OUTROS";

  // fallback por "Tipo de Demanda"
  const td = safeStr(row["Tipo de Demanda"]).toLowerCase();
  if (td.includes("intel")) return "INTELIDADOS";
  if (td.includes("cyber")) return "CYBER";
  if (td.includes("aud")) return "AUDITORIA TI";
  if (td.includes("consul")) return "CONSUL. TI";
  if (td.includes("interna") || td.includes("ppc")) return "DEMANDA INT.";
  return "OUTROS";
}

function normalizeRow(row) {
  const demandType = detectDemandType(row);
  const status = normalizeStatus(row["Status"]);

  // 1. update de normalizeRow (linhas 101)
  const responsible = safeStr(row["Responsável Demanda"]); // Removidos fallbacks para emails/clientes

  const client = safeStr(row["Nome Cliente"]) || safeStr(row["Contato Cliente"]) || "";
  const scopeSystem = safeStr(row["Sistema em Escopo"]);
  const prpId = safeStr(row["ID - PRP (RentSoft)"]);
  const title = scopeSystem ? scopeSystem : (safeStr(row["Detalhe da demanda (Escopo)"]).slice(0, 48) || prpId || "Demanda");

  // PRIORIZAR DADOS DO CSV2 SE DISPONÍVEIS
  const csv2Details = row["_csv2Details"];

  let hoursAdm, hoursTotal, start, end;

  if (csv2Details) {
    // USAR DADOS DO CSV2 (prioritário)
    hoursAdm = csv2Details.horasAdmTotal || 0;
    hoursTotal = csv2Details.horasTotal || 0;
    start = csv2Details.dataInicio || safeStr(row["Data Início (Previsão)"]);
    end = csv2Details.dataFim || safeStr(row["Data Conclusão (Previsão)"]);

    console.log(`[normalizeRow] Usando CSV2 para ID ${safeStr(row["ID"])}: ${hoursTotal}h total (${hoursAdm}h ADM)`);
  } else {
    // FALLBACK: Usar dados do CSV1
    hoursAdm = toNumber(row["Horas ADM"]);
    hoursTotal = toNumber(row["Horas"]);
    start = safeStr(row["Data Início (Previsão)"]);
    end = safeStr(row["Data Conclusão (Previsão)"]);
  }

  const id = safeStr(row["id"]) || prpId || crypto.randomUUID();
  // const numericId = Number(row.id || prpId || crypto.randomUUID());


  return {
    id: id,
    demandType,
    status,
    title: client || safeStr(row["Área Solicitante"]) || "",
    subtitle: title,
    hoursAdm,
    hoursTotal,
    responsible,
    raw: row,
    dates: { start, end }
  };
}

/* -------- Parse de CSV (robusto o suficiente para o arquivo diário) -------- */
function parseCSV(text) {
  // Lida com vírgulas, aspas e quebras de linha em campos entre aspas.
  const rows = [];
  let i = 0, field = "", row = [], inQuotes = false;

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        const next = text[i + 1];
        if (next === '"') { // aspas escapadas
          field += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        field += c;
        i++;
        continue;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (c === ',') {
        row.push(field);
        field = "";
        i++;
        continue;
      }
      if (c === '\r') {
        i++;
        continue;
      }
      if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        i++;
        continue;
      }
      field += c;
      i++;
    }
  }
  // última linha
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const header = rows.shift()?.map(h => h.trim()) || [];
  const data = rows.filter(r => r.some(x => String(x ?? "").trim().length)).map(r => {
    const obj = {};
    header.forEach((h, idx) => obj[h] = r[idx] ?? "");
    return obj;
  });

  return data;
}

/* -------- Estado -------- */
let tasks = [];
let csv1Data = null; // CSV Principal (com coluna ID)
let csv2Data = null; // CSV Complementar (com coluna DemandaId)
let filters = {
  person: "",
  demandType: "",
  query: "",
};

function loadFilters() {
  try {
    const raw = localStorage.getItem(LOCAL_FILTERS_KEY);
    if (!raw) return;
    const f = JSON.parse(raw);
    filters = { ...filters, ...f };
  } catch (_) { }
}
function saveFilters() {
  localStorage.setItem(LOCAL_FILTERS_KEY, JSON.stringify(filters));
}

/* -------- Arrastar e Soltar -------- */
function handleDragStart(e, task) {
  e.dataTransfer.setData("text/plain", task.id);
  e.dataTransfer.effectAllowed = "move";
}

function handleDragOver(e) {
  e.preventDefault(); // Necessário para permitir soltar
  e.dataTransfer.dropEffect = "move";
  e.currentTarget.classList.add("drag-over");
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove("drag-over");
}

function handleDrop(e, targetStatusKey) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");

  const id = e.dataTransfer.getData("text/plain");
  const task = tasks.find(t => t.id === id);

  if (task && task.status !== targetStatusKey) {
    // Atualização Otimista
    const oldStatus = task.status;
    task.status = targetStatusKey;
    render();

    // Chamar API
    api.updateTask(id, { status: targetStatusKey })
      .then(updated => {
        // Confirmar atualização da resposta do servidor se necessário
        console.log("Task updated:", updated);
        // Atualizar meta tempo de atualização se servidor retornar, ou apenas agora
        setUpdatedMeta(new Date().toISOString());
        // Sincronizar com LS para que gráficos sejam atualizados
        saveToLocalStorage(tasks);
      })
      .catch(err => {
        console.error("Failed to update status, reverting", err);
        // Reverter
        task.status = oldStatus;
        saveToLocalStorage(tasks); // Sincronizar reversão
        render();
        alert("Erro ao atualizar status. Verifique o console.");
      });
  }
}

/* -------- UI -------- */
function render() {
  // Calcular filtrados
  const filtered = tasks.filter(t => {
    if (filters.person) {
      const p = filters.person.toLowerCase();
      // Verificar se pessoa existe em qualquer um dos papéis alvo
      const fields = [
        "Responsável Demanda",
        "Trainee do Projeto",
        "Responsável Cyber",
        "Responsável Intelidados",
        "Responsável Desenvolvimento"
      ];
      // Correspondência parcial (includes)
      const match = fields.some(key => {
        const val = safeStr(t.raw?.[key]).toLowerCase();
        return val.includes(p);
      });

      if (!match) return false;
    }
    if (filters.demandType) {
      if (t.demandType !== filters.demandType) return false;
    }
    if (filters.query) {
      const q = filters.query.toLowerCase();
      const blob = [
        t.title, t.subtitle, t.responsible,
        t.raw?.["Detalhe da demanda (Escopo)"],
        t.raw?.["Sistema em Escopo"],
        t.raw?.["Nome Cliente"],
        t.raw?.["ID - PRP (RentSoft)"],
        t.raw?.["IDPlanner"]
      ].map(safeStr).join(" ").toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  // Atualizar badges
  $("#badgeTotal").textContent = `${filtered.length} demandas`;
  const admSum = filtered.reduce((acc, t) => acc + (t.hoursAdm || 0), 0);
  $("#badgeAdm").textContent = `${admSum.toFixed(0)}h ADM`;

  // Contagem de cards por tipo de demanda (nos filtrados, mas ignorando filtro de demandType? Geralmente melhor UX)
  const baseForTypeCounts = tasks.filter(t => {
    // aplicar todos os filtros exceto demandType
    if (filters.person) {
      const p = filters.person.toLowerCase();
      const hay = (t.responsible || "").toLowerCase();
      if (!hay.includes(p)) return false;
    }
    if (filters.query) {
      const q = filters.query.toLowerCase();
      const blob = [
        t.title, t.subtitle, t.responsible,
        t.raw?.["Detalhe da demanda (Escopo)"],
        t.raw?.["Sistema em Escopo"],
        t.raw?.["Nome Cliente"],
        t.raw?.["ID - PRP (RentSoft)"],
        t.raw?.["IDPlanner"]
      ].map(safeStr).join(" ").toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  const typeCounts = {};
  TYPE_ORDER.forEach(t => typeCounts[t.key] = 0);
  baseForTypeCounts.forEach(t => typeCounts[t.demandType] = (typeCounts[t.demandType] || 0) + 1);

  const typeRow = $("#typeRow");
  typeRow.innerHTML = "";
  TYPE_ORDER.filter(t => t.key !== "OUTROS").forEach(t => {
    const el = document.createElement("div");
    el.className = "typecard" + (filters.demandType === t.key ? " active" : "");
    el.innerHTML = `
      <div class="count">${typeCounts[t.key] ?? 0} demandas</div>
      <div class="label">${t.label}</div>
    `;
    el.addEventListener("click", () => {
      filters.demandType = (filters.demandType === t.key) ? "" : t.key;
      saveFilters();
      syncControls();
      render();
    });
    typeRow.appendChild(el);
  });

  // Colunas do Board
  const board = $("#board");
  board.innerHTML = "";

  const byStatus = new Map(STATUS_ORDER.map(s => [s.key, []]));
  filtered.forEach(t => byStatus.get(t.status)?.push(t));

  STATUS_ORDER.forEach(s => {
    const col = document.createElement("div");
    col.className = "column";
    const list = byStatus.get(s.key) || [];
    const colAdm = list.reduce((acc, t) => acc + (t.hoursAdm || 0), 0);

    col.innerHTML = `
      <div class="col-head">
        <div class="name">${s.label}</div>
        <div class="meta">${list.length} • ${colAdm.toFixed(0)}h</div>
      </div>
      <div class="col-body" data-status="${s.key}"></div>
    `;

    const body = $(".col-body", col);

    // Eventos de Drag and Drop para o corpo da coluna
    body.addEventListener("dragover", handleDragOver);
    body.addEventListener("dragleave", handleDragLeave);
    body.addEventListener("drop", (e) => handleDrop(e, s.key));

    list
      .sort((a, b) => (b.hoursAdm - a.hoursAdm) || (a.title.localeCompare(b.title)))
      .forEach(t => body.appendChild(renderTaskCard(t)));

    board.appendChild(col);
  });
}

function renderTaskCard(t) {
  const el = document.createElement("div");
  el.className = "task";
  el.draggable = true;
  el.addEventListener("dragstart", (e) => handleDragStart(e, t));
  const avatar = initials(t.responsible);

  const projHours = t.hoursTotal || 0;
  const admHours = t.hoursAdm || 0;

  // tags: tipo de demanda + horas ADM
  const tagType = `<div class="tag">${t.demandType}</div>`;
  const tagAdm = `<div class="tag">${admHours.toFixed(0)}h ADM</div>`;
  const tagTot = projHours ? `<div class="tag">${projHours.toFixed(0)}h total</div>` : "";

  el.innerHTML = `
    <div class="top">
      <div>
        <div class="title">${escapeHTML(t.title)}</div>
        <div class="sub">${escapeHTML(t.subtitle)}${t.responsible ? " • " + escapeHTML(t.responsible) : ""}</div>
      </div>
      <div class="avatar" title="${escapeHTML(t.responsible)}">${escapeHTML(avatar)}</div>
    </div>
    <div class="hours">
      ${tagType}
      ${tagAdm}
      ${tagTot}
    </div>
  `;

  el.addEventListener("click", () => openModal(t));
  return el;
}

function escapeHTML(str) {
  const s = safeStr(str);
  return s.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

/* -------- Modal -------- */
function openModal(task) {
  $("#modalTitle").textContent = `${task.title}`;
  $("#modalSubtitle").textContent = `${task.subtitle || ""}`;

  const kvs = [
    ["Status", task.status],
    ["Tipo de demanda", task.demandType],
    ["Responsável", task.responsible || "—"],
    ["Horas ADM (geral)", `${(task.hoursAdm || 0).toFixed(0)}h`],
    ["Horas (total)", `${(task.hoursTotal || 0).toFixed(0)}h`],
    ["Cliente", safeStr(task.raw?.["Nome Cliente"]) || "—"],
    ["Área solicitante", safeStr(task.raw?.["Área Solicitante"]) || "—"],
    ["Solicitante", safeStr(task.raw?.["Nome do Solicitante"]) || "—"],
    ["PRP (RentSoft)", safeStr(task.raw?.["ID - PRP (RentSoft)"]) || "—"],
    ["Sistema em escopo", safeStr(task.raw?.["Sistema em Escopo"]) || "—"],
    ["Período escopo", `${safeStr(task.raw?.["Período Escopo (Inicial)"])} → ${safeStr(task.raw?.["Período Escopo (Final)"])}`.replace(" → ", " → ").trim()],
    ["Início previsto", safeStr(task.raw?.["Data Início (Previsão)"]) || "—"],
    ["Conclusão prevista", safeStr(task.raw?.["Data Conclusão (Previsão)"]) || "—"],
    ["Aprovação", safeStr(task.raw?.["Aprovação Demanda"]) || "—"],
  ];

  // Campos extras solicitados (Responsáveis e Horas)
  const extraFields = [
    { label: "Responsável Demanda", key: "Responsável Demanda" },
    { label: "Horas Projeto (Demanda)", key: "Horas Projeto (Responsável Demanda)" },
    { label: "Horas Adm (Demanda)", key: "Horas Adm (Responsável Demanda)" },

    { label: "Trainee do Projeto", key: "Trainee do Projeto" },
    { label: "Horas Projeto (Trainee)", key: "Horas Projeto (Trainee)" },
    { label: "Horas Adm (Trainee)", key: "Horas Adm (Trainee)" },

    { label: "Responsável Cyber", key: "Responsável Cyber" },
    { label: "Horas Projeto (Cyber)", key: "Horas Projeto (Cyber)" },
    { label: "Horas Adm (Cyber)", key: "Horas Adm (Cyber)" },

    { label: "Responsável Intelidados", key: "Responsável Intelidados" },
    { label: "Horas Projeto (Intelidados)", key: "Horas Projeto (Intelidados)" },
    { label: "Horas Adm (Intelidados)", key: "Horas Adm (Intelidados)" },

    { label: "Responsável Desenv.", key: "Responsável Desenvolvimento" },
    { label: "Horas Projeto (Desenv.)", key: "Horas Projeto (Desenvolvimento)" },
    { label: "Horas Adm (Desenv.)", key: "Horas Adm (Desenvolvimento)" },
  ];

  extraFields.forEach(f => {
    const val = safeStr(task.raw?.[f.key]);
    if (val) {
      kvs.push([f.label, val]);
    }
  });

  const grid = $("#modalGrid");
  grid.innerHTML = "";
  kvs.forEach(([k, v]) => {
    const d = document.createElement("div");
    d.className = "kv";
    d.innerHTML = `<div class="k">${escapeHTML(k)}</div><div class="v">${escapeHTML(v)}</div>`;
    grid.appendChild(d);
  });

  // Adicionar detalhamento do CSV2 se disponível
  const csv2Details = task.raw?.["_csv2Details"];
  if (csv2Details && csv2Details.colaboradores && csv2Details.colaboradores.length > 0) {
    const detailsSection = document.createElement("div");
    detailsSection.style.marginTop = "20px";
    detailsSection.style.borderTop = "1px solid #e0e0e0";
    detailsSection.style.paddingTop = "20px";

    const title = document.createElement("h3");
    title.textContent = "📊 Detalhamento de Horas por Colaborador (CSV2)";
    title.style.marginBottom = "10px";
    title.style.fontSize = "1.1rem";
    detailsSection.appendChild(title);

    // Informações de período
    if (csv2Details.dataInicio && csv2Details.dataFim) {
      const periodo = document.createElement("p");
      periodo.textContent = `Período: ${csv2Details.dataInicio} → ${csv2Details.dataFim}`;
      periodo.style.marginBottom = "10px";
      periodo.style.fontSize = "0.9rem";
      periodo.style.color = "#666";
      detailsSection.appendChild(periodo);
    }

    // Tabela de colaboradores
    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    table.style.fontSize = "0.9rem";

    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr style="background: #f5f5f5; border-bottom: 2px solid #ddd;">
        <th style="padding: 8px; text-align: left;">Colaborador</th>
        <th style="padding: 8px; text-align: left;">Responsabilidade</th>
        <th style="padding: 8px; text-align: right;">Horas ADM</th>
        <th style="padding: 8px; text-align: right;">Horas Projeto</th>
        <th style="padding: 8px; text-align: right;">Total</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    csv2Details.colaboradores.forEach((colab, idx) => {
      const tr = document.createElement("tr");
      tr.style.borderBottom = "1px solid #eee";
      if (idx % 2 === 0) tr.style.background = "#fafafa";

      tr.innerHTML = `
        <td style="padding: 8px;">${escapeHTML(colab.colaborador)}</td>
        <td style="padding: 8px;">${escapeHTML(colab.responsabilidades)}</td>
        <td style="padding: 8px; text-align: right;">${colab.horasAdm.toFixed(0)}h</td>
        <td style="padding: 8px; text-align: right;">${colab.horasProjeto.toFixed(0)}h</td>
        <td style="padding: 8px; text-align: right; font-weight: bold;">${colab.horasTotal.toFixed(0)}h</td>
      `;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    // Linha de totais
    const tfoot = document.createElement("tfoot");
    tfoot.innerHTML = `
      <tr style="background: #e8f4f8; border-top: 2px solid #ddd; font-weight: bold;">
        <td colspan="2" style="padding: 8px;">TOTAL</td>
        <td style="padding: 8px; text-align: right;">${csv2Details.horasAdmTotal.toFixed(0)}h</td>
        <td style="padding: 8px; text-align: right;">${csv2Details.horasProjetoTotal.toFixed(0)}h</td>
        <td style="padding: 8px; text-align: right;">${csv2Details.horasTotal.toFixed(0)}h</td>
      </tr>
    `;
    table.appendChild(tfoot);

    detailsSection.appendChild(table);
    grid.appendChild(detailsSection);
  }

  const desc = safeStr(task.raw?.["Detalhe da demanda (Escopo)"]);
  $("#modalNote").textContent = desc || "Sem detalhes adicionais.";

  $("#modalBackdrop").classList.add("show");
}

function closeModal() {
  $("#modalBackdrop").classList.remove("show");
}

/* -------- Carregamento de dados -------- */
async function loadFromFetch() {
  // Funciona quando servido via HTTP (intranet / servidor)
  const resp = await fetch("./data/tasks.json", { cache: "no-store" });
  if (!resp.ok) throw new Error("fetch failed");
  const obj = await resp.json();
  return obj.tasks || [];
}

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj.tasks || null;
  } catch (_) {
    return null;
  }
}

function saveToLocalStorage(taskList) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
    updatedAt: new Date().toISOString(),
    tasks: taskList,
  }));
}

/* -------- Dual CSV Management -------- */
function saveCsv1ToLocalStorage(data) {
  localStorage.setItem(LOCAL_CSV1_KEY, JSON.stringify({
    updatedAt: new Date().toISOString(),
    data: data,
  }));
}

function saveCsv2ToLocalStorage(data) {
  localStorage.setItem(LOCAL_CSV2_KEY, JSON.stringify({
    updatedAt: new Date().toISOString(),
    data: data,
  }));
}

function loadCsv1FromLocalStorage() {
  try {
    const raw = localStorage.getItem(LOCAL_CSV1_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj.data || null;
  } catch (_) {
    return null;
  }
}

function loadCsv2FromLocalStorage() {
  try {
    const raw = localStorage.getItem(LOCAL_CSV2_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj.data || null;
  } catch (_) {
    return null;
  }
}

/**
 * Agrega dados do CSV2 por DemandaId
 * CSV2 tem múltiplas linhas por demanda (uma por colaborador)
 */
function aggregateCsv2ByDemandaId(csv2) {
  const aggregated = new Map();

  if (!csv2 || !Array.isArray(csv2)) return aggregated;

  // Mapeamento flexível de colunas
  const findCol = (row, words) => {
    const keys = Object.keys(row);
    for (const word of words) {
      const found = keys.find(k => k.toLowerCase().trim() === word.toLowerCase());
      if (found) return row[found];
    }
    return null;
  };

  csv2.forEach(row => {
    const demandaId = safeStr(findCol(row, ["DemandaId", "ID Demanda", "Codigo Demanda", "Demanda ID"]));
    if (!demandaId) return;

    // Extrair dados da linha com fallbacks robustos
    const dataStr = safeStr(findCol(row, ["Data", "Data de Lançamento", "Data Lancamento"]));
    const horasStr = findCol(row, ["Horas", "Quantidade de Horas", "Horas Lançadas", "Vlr Lançamento"]);
    const horas = toNumber(horasStr);

    const tipoHoraStr = safeStr(findCol(row, ["Tipo da hora", "Tipo de hora", "Tipo Hora", "Categoria de hora"])).toLowerCase();
    const colaborador = safeStr(findCol(row, ["Colaborador", "Nome Colaborador", "Profissional", "Nome do Colaborador"]));
    const responsabilidades = safeStr(findCol(row, ["Responsabilidades", "Responsabilidade", "Função", "Cargo"]));

    // Normalizar tipo de hora
    let isAdm = tipoHoraStr.includes("adm") || tipoHoraStr.includes("administrativo");
    // Se não for ADM, assumir Projeto como padrão se tiver horas e algum texto no Tipo

    // Inicializar agregação se não existir
    if (!aggregated.has(demandaId)) {
      aggregated.set(demandaId, {
        horasAdmTotal: 0,
        horasProjetoTotal: 0,
        horasTotal: 0,
        datas: [],
        colaboradores: []
      });
    }

    const agg = aggregated.get(demandaId);

    // Acumular horas por tipo
    agg.horasTotal += horas;
    if (isAdm) {
      agg.horasAdmTotal += horas;
    } else {
      agg.horasProjetoTotal += horas; // Fallback para Projeto
    }

    // Coletar datas
    if (dataStr) {
      agg.datas.push(dataStr);
    }

    // Adicionar colaborador (verificar se já existe)
    const existingColabIndex = agg.colaboradores.findIndex(c =>
      c.colaborador === colaborador && c.responsabilidades === responsabilidades
    );

    if (existingColabIndex >= 0) {
      // Colaborador já existe, acumular horas
      const colab = agg.colaboradores[existingColabIndex];
      colab.horasTotal += horas;
      if (isAdm) {
        colab.horasAdm += horas;
      } else {
        colab.horasProjeto += horas;
      }
    } else {
      // Novo colaborador
      agg.colaboradores.push({
        colaborador,
        responsabilidades,
        horasAdm: isAdm ? horas : 0,
        horasProjeto: !isAdm ? horas : 0,
        horasTotal: horas
      });
    }
  });

  // Calcular range de datas para cada demanda
  aggregated.forEach((agg, demandaId) => {
    if (agg.datas.length > 0) {
      // Tentar ordenar datas (assume formato que permita ordenação léxica ou tenta converter)
      agg.datas.sort();
      agg.dataInicio = agg.datas[0];
      agg.dataFim = agg.datas[agg.datas.length - 1];
    }
  });

  console.log(`[CSV2 Aggregation] ${aggregated.size} demandas processadas das ${csv2.length} linhas do CSV2.`);
  return aggregated;
}

/**
 * Mescla CSV2 no CSV1 baseado na relação ID (CSV1) ↔ DemandaId (CSV2)
 * Estratégia: CSV1 como base, CSV2 substitui apenas campos específicos
 * @param {Array} csv1 - Array de objetos do CSV principal (com coluna ID)
 * @param {Array} csv2 - Array de objetos do CSV complementar (com coluna DemandaId)
 * @returns {Array} - Array mesclado
 */
function mergeCsvData(csv1, csv2) {
  if (!csv1 || !Array.isArray(csv1)) return [];
  if (!csv2 || !Array.isArray(csv2)) return csv1;

  // Agregar CSV2 por DemandaId
  const csv2Aggregated = aggregateCsv2ByDemandaId(csv2);

  console.log(`[CSV Merge] CSV1 records: ${csv1.length}, CSV2 aggregated demands: ${csv2Aggregated.size}`);

  // Mesclar CSV2 agregado em CSV1
  const merged = csv1.map(row1 => {
    const id = safeStr(row1["ID"] || row1["id"] || row1["Id"]);

    if (id && csv2Aggregated.has(id)) {
      const csv2Data = csv2Aggregated.get(id);

      // Criar objeto mesclado: CSV1 como base
      const mergedRow = { ...row1 };

      // Substituir campos específicos com dados do CSV2
      mergedRow["Horas ADM"] = csv2Data.horasAdmTotal;
      mergedRow["Horas"] = csv2Data.horasTotal;
      mergedRow["Horas Projeto"] = csv2Data.horasProjetoTotal;

      // Mapear colaboradores para campos de responsáveis
      // Ordenar por horas totais (maior primeiro)
      const colaboradoresOrdenados = [...csv2Data.colaboradores].sort((a, b) => b.horasTotal - a.horasTotal);

      // Mapear responsabilidades conhecidas
      const responsabilidadesMap = {
        "responsável demanda": "Responsável Demanda",
        "trainee do projeto": "Trainee do Projeto",
        "responsável cyber": "Responsável Cyber",
        "responsável intelidados": "Responsável Intelidados",
        "responsável desenvolvimento": "Responsável Desenvolvimento",
        "sócio responsável": "Sócio Responsável",
        "gerente responsável": "Gerente Responsável"
      };

      // Limpar campos antigos do CSV1
      Object.keys(responsabilidadesMap).forEach(key => {
        const fieldName = responsabilidadesMap[key];
        delete mergedRow[fieldName];
        delete mergedRow[`Horas Projeto (${fieldName})`];
        delete mergedRow[`Horas Adm (${fieldName})`];
      });

      // Preencher com dados do CSV2
      colaboradoresOrdenados.forEach(colab => {
        const respKey = colab.responsabilidades.toLowerCase();
        const fieldName = responsabilidadesMap[respKey];

        if (fieldName) {
          mergedRow[fieldName] = colab.colaborador;
          mergedRow[`Horas Projeto (${fieldName})`] = colab.horasProjeto;
          mergedRow[`Horas Adm (${fieldName})`] = colab.horasAdm;
        }
      });

      // Adicionar detalhes completos do CSV2 para uso no modal
      mergedRow["_csv2Details"] = {
        colaboradores: csv2Data.colaboradores,
        dataInicio: csv2Data.dataInicio,
        dataFim: csv2Data.dataFim,
        horasAdmTotal: csv2Data.horasAdmTotal,
        horasProjetoTotal: csv2Data.horasProjetoTotal,
        horasTotal: csv2Data.horasTotal
      };

      console.log(`[CSV Merge] Matched ID: ${id} - ${csv2Data.colaboradores.length} colaboradores, ${csv2Data.horasTotal}h total`);
      return mergedRow;
    }

    return row1; // Sem correspondência, retorna apenas CSV1
  });

  console.log(`[CSV Merge] Merged ${merged.length} records`);
  return merged;
}

function updateCsvStatus() {
  const statusEl = $("#csvStatus");
  if (!statusEl) return;

  const csv1Status = csv1Data ? "✅" : "❌";
  const csv2Status = csv2Data ? "✅" : "❌";

  statusEl.textContent = `CSV Principal: ${csv1Status} | CSV Complementar: ${csv2Status}`;
}

function setUpdatedMeta(tsISO) {
  const d = tsISO ? new Date(tsISO) : new Date();
  $("#badgeUpdated").textContent = `atualizado ${d.toLocaleString()}`;
}

function populatePeopleDropdown() {
  const fields = [
    "Responsável Demanda",
    "Trainee do Projeto",
    "Responsável Cyber",
    "Responsável Intelidados",
    "Responsável Desenvolvimento"
  ];

  const people = new Set();
  tasks.forEach(t => {
    fields.forEach(f => {
      const val = safeStr(t.raw?.[f]);
      if (val) people.add(val);
    });
  });

  const sorted = [...people].sort((a, b) => a.localeCompare(b));
  const sel = $("#personSelect");
  const current = filters.person;

  sel.innerHTML = `<option value="">Todos</option>` + sorted.map(p => `<option value="${escapeHTML(p)}">${escapeHTML(p)}</option>`).join("");
  sel.value = current || "";
}

function syncControls() {
  $("#searchInput").value = filters.query || "";
  $("#personSelect").value = filters.person || "";
  $("#clearTypeBtn").classList.toggle("hidden", !filters.demandType);
}

function resetFilters() {
  filters = { person: "", demandType: "", query: "" };
  saveFilters();
  syncControls();
  render();
}

function setBanner(msg, kind = "info") {
  const el = $("#banner");
  el.textContent = msg;
  el.classList.remove("hidden");
  el.dataset.kind = kind;
}

function hideBanner() {
  $("#banner").classList.add("hidden");
}



/* -------- Eventos -------- */
function bindEvents() {
  $("#modalClose").addEventListener("click", closeModal);
  $("#modalBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "modalBackdrop") closeModal();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  $("#personSelect").addEventListener("change", (e) => {
    filters.person = e.target.value;
    saveFilters();
    render();
  });

  $("#searchInput").addEventListener("input", (e) => {
    filters.query = e.target.value;
    saveFilters();
    render();
  });

  $("#btnReset").addEventListener("click", resetFilters);



  $("#clearTypeBtn").addEventListener("click", () => {
    filters.demandType = "";
    saveFilters();
    syncControls();
    render();
  });

  // --- Upload de CSV Duplo ---
  const btnLoadCsv1 = $("#btnLoadCsv1");
  const fileInput1 = $("#csvFile1");
  const btnLoadCsv2 = $("#btnLoadCsv2");
  const fileInput2 = $("#csvFile2");

  // Handler para CSV1 (Principal - com coluna ID)
  if (btnLoadCsv1 && fileInput1) {
    btnLoadCsv1.addEventListener("click", () => fileInput1.click());

    fileInput1.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target.result;
        try {
          const rawData = parseCSV(text);
          csv1Data = rawData;
          saveCsv1ToLocalStorage(rawData);

          console.log(`[CSV1] Loaded ${rawData.length} records`);

          // Mesclar com CSV2 se disponível
          const mergedData = mergeCsvData(csv1Data, csv2Data);
          tasks = normalizeTasks(mergedData);

          // Salvar tarefas mescladas
          saveToLocalStorage(tasks);

          // Atualizar UI
          setUpdatedMeta(new Date().toISOString());
          populatePeopleDropdown();
          syncControls();
          render();
          updateCsvStatus();

          setBanner("CSV Principal carregado com sucesso! " + (csv2Data ? "Dados mesclados com CSV Complementar." : "Aguardando CSV Complementar para mesclar."), "success");
        } catch (err) {
          console.error(err);
          alert("Erro ao ler CSV Principal: " + err.message);
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    });
  }

  // Handler para CSV2 (Complementar - com coluna DemandaId)
  if (btnLoadCsv2 && fileInput2) {
    btnLoadCsv2.addEventListener("click", () => fileInput2.click());

    fileInput2.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target.result;
        try {
          const rawData = parseCSV(text);
          csv2Data = rawData;
          saveCsv2ToLocalStorage(rawData);

          console.log(`[CSV2] Loaded ${rawData.length} records`);

          // Mesclar com CSV1 se disponível
          if (csv1Data) {
            const mergedData = mergeCsvData(csv1Data, csv2Data);
            tasks = normalizeTasks(mergedData);

            // Salvar tarefas mescladas
            saveToLocalStorage(tasks);

            // Atualizar UI
            setUpdatedMeta(new Date().toISOString());
            populatePeopleDropdown();
            syncControls();
            render();
            updateCsvStatus();

            setBanner("CSV Complementar carregado e mesclado com sucesso!", "success");
          } else {
            updateCsvStatus();
            setBanner("CSV Complementar carregado. Aguardando CSV Principal para mesclar.", "info");
          }
        } catch (err) {
          console.error(err);
          alert("Erro ao ler CSV Complementar: " + err.message);
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    });
  }

  // --- Exportar JSON ---
  const btnExport = $("#btnExportJson");
  if (btnExport) {
    btnExport.addEventListener("click", () => {
      const dataStr = JSON.stringify({ tasks, exportedAt: new Date() }, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ppc_tasks_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }
}

async function init() {
  loadFilters();
  bindEvents();

  // Carregar CSVs salvos do localStorage
  csv1Data = loadCsv1FromLocalStorage();
  csv2Data = loadCsv2FromLocalStorage();
  updateCsvStatus();

  // Carregamento da API
  try {
    const list = await api.getTasks();
    tasks = normalizeTasks(list);
    setUpdatedMeta(new Date().toISOString());
    // SYNC: Salvar o estado da API no LS para que gráficos vejam imediatamente (e vejam a mesma versão)
    saveToLocalStorage(tasks);
    hideBanner();
  } catch (err) {
    console.warn("API load failed, falling back to sample or empty", err);

    // Se temos CSVs carregados, usar dados mesclados
    if (csv1Data) {
      const mergedData = mergeCsvData(csv1Data, csv2Data);
      tasks = normalizeTasks(mergedData);
      setBanner("Modo Local: Usando dados dos CSVs carregados. (API indisponível)", "info");
    } else {
      setBanner("Erro ao carregar dados da API. Mostrando exemplo estático.", "error");
      if (window.__PPC_SAMPLE__) {
        tasks = normalizeTasks(window.__PPC_SAMPLE__);
      }
    }
  }

  populatePeopleDropdown();
  syncControls();
  render();
}

/**
 * Helper para normalizar uma lista de tarefas raw ou semi-raw
 */
function normalizeTasks(list) {
  if (!Array.isArray(list)) return [];
  return list.map(t => {
    // Se parece com nosso objeto 'task' interno (tem id, título...), use-o.
    // Se parece com uma linha CSV raw, normalize-a.
    // O backend pode retornar linhas Raw CSV ou objetos processados. 
    // Assumindo que backend retorna uma lista de dicionários correspondendo às colunas CSV ou a estrutura interna.
    // Vamos assumir que o backend retorna as linhas raw principalmente, similar à estrutura tasks.json.
    if (t.raw) return t; // Já processado
    return normalizeRow(t);
  });
}

document.addEventListener("DOMContentLoaded", init);
