
/* =========================
   PPC Task Board - app.js
   Vanilla JS (no build needed)
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

  // "Em andamento" (incluindo blocked/testing pra não perder tasks)
  if (["em andamento", "andamento", "doing", "in progress", "progresso", "fazendo", "execução"].includes(s)) return "Em andamento";
  if (["bloqueado", "blocked", "impedido"].includes(s)) return "Em andamento"; // Mapping blocked to doing
  if (["teste", "testing", "qa", "homologação", "homologacao", "revisão"].includes(s)) return "Em andamento"; // Mapping testing to doing

  // "Concluída"
  if (["concluído", "concluido", "done", "finalizado", "entregue", "concluída", "concluida"].includes(s)) return "Concluída";

  // "Cancelada"
  if (["cancelado", "dismissed", "descartado", "cancelada"].includes(s)) return "Cancelada";

  // Default fallback
  return "Backlog";
}

function detectDemandType(row) {
  // The CSV has multiple "type columns". We'll infer the demand type:
  // Priority: Intelidados, Cybersecurity, Auditoria TI, Consultoria de TI, Demanda Interna (PPeC), Outros
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

  // fallback by "Tipo de Demanda"
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

  // 1. normalizeRow update (lines 101)
  const responsible = safeStr(row["Responsável Demanda"]); // Removed fallbacks to emails/clients

  const client = safeStr(row["Nome Cliente"]) || safeStr(row["Contato Cliente"]) || "";
  const scopeSystem = safeStr(row["Sistema em Escopo"]);
  const prpId = safeStr(row["ID - PRP (RentSoft)"]);
  const title = scopeSystem ? scopeSystem : (safeStr(row["Detalhe da demanda (Escopo)"]).slice(0, 48) || prpId || "Demanda");
  const hoursAdm = toNumber(row["Horas ADM"]);

  const hoursTotal = toNumber(row["Horas"]);
  const start = safeStr(row["Data Início (Previsão)"]);
  const end = safeStr(row["Data Conclusão (Previsão)"]);
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

/* -------- CSV parsing (robust-enough for the daily file) -------- */
function parseCSV(text) {
  // Handles commas, quotes, and newlines in quoted fields.
  const rows = [];
  let i = 0, field = "", row = [], inQuotes = false;

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        const next = text[i + 1];
        if (next === '"') { // escaped quote
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
  // last line
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

/* -------- State -------- */
let tasks = [];
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

/* -------- Drag and Drop -------- */
function handleDragStart(e, task) {
  e.dataTransfer.setData("text/plain", task.id);
  e.dataTransfer.effectAllowed = "move";
}

function handleDragOver(e) {
  e.preventDefault(); // Necessary to allow dropping
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
    // Optimistic Update
    const oldStatus = task.status;
    task.status = targetStatusKey;
    render();

    // Call API
    api.updateTask(id, { status: targetStatusKey })
      .then(updated => {
        // Confirm update from server response if needed
        console.log("Task updated:", updated);
        // Update meta updated time if server returns it, or just now
        setUpdatedMeta(new Date().toISOString());
      })
      .catch(err => {
        console.error("Failed to update status, reverting", err);
        // Revert
        task.status = oldStatus;
        render();
        alert("Erro ao atualizar status. Verifique o console.");
      });
  }
}

/* -------- UI -------- */
function render() {
  // Compute filtered
  const filtered = tasks.filter(t => {
    if (filters.person) {
      const p = filters.person.toLowerCase();
      // Check if person exists in any of the target roles
      const fields = [
        "Responsável Demanda",
        "Trainee do Projeto",
        "Responsável Cyber",
        "Responsável Intelidados",
        "Responsável Desenvolvimento"
      ];
      // Match partial (includes)
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

  // Update badges
  $("#badgeTotal").textContent = `${filtered.length} demandas`;
  const admSum = filtered.reduce((acc, t) => acc + (t.hoursAdm || 0), 0);
  $("#badgeAdm").textContent = `${admSum.toFixed(0)}h ADM`;

  // Demand type cards counts (on filtered, but ignoring demandType filter? Usually better UX)
  const baseForTypeCounts = tasks.filter(t => {
    // apply all filters except demandType
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

  // Board columns
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

    // Drag and Drop events for the column body
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

  // tags: demand type + ADM hours
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
  // Só aparecem se o campo principal (nome) ou as horas estiverem preenchidos?
  // A regra diz: "só apareça o campo quando ele for preenchido com algo"

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
    { label: "Horas Projeto (Desenv.)", key: "Horas Projeto (Desenvolvimento)" }, // Assumed key pattern
    { label: "Horas Adm (Desenv.)", key: "Horas Adm (Desenvolvimento)" },         // Assumed key pattern
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

  const desc = safeStr(task.raw?.["Detalhe da demanda (Escopo)"]);
  $("#modalNote").textContent = desc || "Sem detalhes adicionais.";

  $("#modalBackdrop").classList.add("show");
}

function closeModal() {
  $("#modalBackdrop").classList.remove("show");
}

/* -------- Data loading -------- */
async function loadFromFetch() {
  // Works when served via HTTP (intranet / server)
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

function exportFilteredJSON() {
  const filtered = tasks.filter(t => {
    if (filters.person && !(t.responsible || "").toLowerCase().includes(filters.person.toLowerCase())) return false;
    if (filters.demandType && t.demandType !== filters.demandType) return false;
    if (filters.query) {
      const q = filters.query.toLowerCase();
      const blob = [t.title, t.subtitle, t.responsible, t.raw?.["Detalhe da demanda (Escopo)"]].map(safeStr).join(" ").toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  const content = JSON.stringify({ exportedAt: new Date().toISOString(), tasks: filtered.map(t => t.raw) }, null, 2);
  const blob = new Blob([content], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ppc_tasks_export_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* -------- Events -------- */
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

  $("#btnLoadCsv").addEventListener("click", () => $("#csvInput").click());
  $("#csvInput").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setBanner("Enviando CSV para o servidor...", "info");
      const updatedList = await api.uploadCSV(file);

      // Normalize received data
      tasks = normalizeTasks(updatedList);

      setUpdatedMeta(new Date().toISOString());
      populatePeopleDropdown();
      setBanner("Dados atualizados com sucesso!", "success");
      setTimeout(hideBanner, 3000);
      render();
    } catch (err) {
      setBanner("Erro ao enviar CSV: " + err.message, "error");
    } finally {
      // Reset input
      e.target.value = "";
    }
  });

  $("#clearTypeBtn").addEventListener("click", () => {
    filters.demandType = "";
    saveFilters();
    syncControls();
    render();
  });

  $("#btnExport").addEventListener("click", exportFilteredJSON);
}

async function init() {
  loadFilters();
  bindEvents();

  // API Load
  try {
    const list = await api.getTasks();
    tasks = normalizeTasks(list);
    setUpdatedMeta(new Date().toISOString());
    hideBanner();
  } catch (err) {
    console.warn("API load failed, falling back to sample or empty", err);
    setBanner("Erro ao carregar dados da API. Mostrando exemplo estático.", "error");
    if (window.__PPC_SAMPLE__) {
      tasks = normalizeTasks(window.__PPC_SAMPLE__);
    }
  }

  populatePeopleDropdown();
  syncControls();
  render();
}

/**
 * Helper to normalize a list of raw or semi-raw tasks
 */
function normalizeTasks(list) {
  if (!Array.isArray(list)) return [];
  return list.map(t => {
    // If it looks like our internal 'task' object (has id, title...), use it.
    // If it looks like raw CSV row, normalize it.
    // The backend might return Raw CSV rows or processed objects. 
    // Assuming backend returns a list of dictionaries matching the CSV columns or the internal structure.
    // Let's assume the backend returns the raw rows mainly, similar to tasks.json structure.
    if (t.raw) return t; // Already processed
    return normalizeRow(t);
  });
}

document.addEventListener("DOMContentLoaded", init);
