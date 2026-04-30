const STATUS_ORDER = [
  { key: "Backlog",      label: "Backlog"      },
  { key: "Em andamento", label: "Em Andamento" },
  { key: "Concluída",    label: "Concluída"    },
  { key: "Cancelada",    label: "Cancelada"    },
];

const TYPE_ORDER = [
  { key: "INTELIDADOS",  label: "INTELIDADOS"  },
  { key: "CYBER",        label: "CYBER"        },
  { key: "AUDITORIA TI", label: "AUDITORIA TI" },
  { key: "CONSUL. TI",   label: "CONSUL. TI"   },
  { key: "DEMANDA INT.", label: "DEMANDA INT."  },
  { key: "OUTROS",       label: "OUTROS"       },
];

const LOCAL_STORAGE_KEY  = "ppc_task_board_data_v1";
const LOCAL_FILTERS_KEY  = "ppc_task_board_filters_v1";

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

  if (["em avaliação", "em avaliacao", "avaliacao", "avaliação", "analise", "análise"].includes(s)) return "Backlog";
  if (["backlog", "to do", "todo", "a fazer", "fila"].includes(s)) return "Backlog";
  if (["em andamento", "andamento", "doing", "in progress", "progresso", "fazendo", "execução"].includes(s)) return "Em andamento";
  if (["bloqueado", "blocked", "impedido"].includes(s)) return "Em andamento";
  if (["teste", "testing", "qa", "homologação", "homologacao", "revisão"].includes(s)) return "Em andamento";
  if (["concluído", "concluido", "done", "finalizado", "entregue", "concluída", "concluida"].includes(s)) return "Concluída";
  if (["cancelado", "dismissed", "descartado", "cancelada"].includes(s)) return "Cancelada";

  return "Backlog";
}

function detectDemandType(row) {
  const intel  = safeStr(row["Intelidados"]);
  const cyber  = safeStr(row["Cybersecurity"]);
  const audit  = safeStr(row["Auditoria TI"]);
  const consul = safeStr(row["Consultoria de TI"]);
  const intern = safeStr(row["Demanda Interna (PPeC)"]);
  const outros = safeStr(row["Outros"]);

  if (intel)  return "INTELIDADOS";
  if (cyber)  return "CYBER";
  if (audit)  return "AUDITORIA TI";
  if (consul) return "CONSUL. TI";
  if (intern) return "DEMANDA INT.";
  if (outros) return "OUTROS";

  const td = safeStr(row["Tipo de Demanda"]).toLowerCase();
  if (td.includes("intel"))                         return "INTELIDADOS";
  if (td.includes("cyber"))                         return "CYBER";
  if (td.includes("aud"))                           return "AUDITORIA TI";
  if (td.includes("consul"))                        return "CONSUL. TI";
  if (td.includes("interna") || td.includes("ppc")) return "DEMANDA INT.";
  return "OUTROS";
}

function _apontamentoHours(a) {
  return toNumber(a.Horas || a.horas || a.HORAS || a.Hora || a.hora || 0);
}

function _apontamentoTipo(a) {
  return safeStr(a["Tipo da hora"] || a.tipo_hora || a.TipoDaHora || a.TipoHora || a.tipo || "").toLowerCase();
}

function _apontamentoNome(a) {
  return safeStr(
    a["Nome colaborador"] || a["Nome Colaborador"] || a.nome_colaborador ||
    a.NomeColaborador || a.Colaborador || a.colaborador || a.nome || a.Nome || ""
  );
}

function _apontamentoRole(a) {
  return safeStr(a.Responsabilidades || a.responsabilidade || a.responsabilidades || a.Responsabilidade || a.papel || a.Papel || "");
}

function normalizeRow(row) {
  const demandType = detectDemandType(row);
  const status     = normalizeStatus(row["Status"]);
  const apontamentos = row._apontamentos || [];

  let hoursTotal = 0, hoursAdm = 0, hoursTraining = 0;
  const participantsMap = new Map();

  apontamentos.forEach(a => {
    const h    = _apontamentoHours(a);
    const tipo = _apontamentoTipo(a);
    const name = _apontamentoNome(a);

    hoursTotal += h;
    if (tipo.includes("adm"))        hoursAdm += h;
    else if (tipo.includes("treinamento")) hoursTraining += h;

    if (name) {
      if (!participantsMap.has(name)) participantsMap.set(name, { name, hours: 0, roles: new Set() });
      const p = participantsMap.get(name);
      p.hours += h;
      const role = _apontamentoRole(a);
      if (role) p.roles.add(role);
    }
  });

  const participants = [...participantsMap.values()].map(p => ({
    name: p.name,
    hours: p.hours,
    role: [...p.roles].join("/")
  }));

  if (participants.length === 0) {
    ["Responsável Demanda", "Responsável Cyber", "Responsável Intelidados", "Trainee do Projeto"].forEach(field => {
      const name = safeStr(row[field]);
      if (name) participants.push({ name, hours: 0, role: "" });
    });
  }

  const responsible  = participants.map(p => p.name).join(", ") || "Sem responsável";
  const hoursProject = Math.max(0, hoursTotal - hoursAdm - hoursTraining);
  const client       = safeStr(row["Nome Cliente"]) || safeStr(row["Contato Cliente"]) || "";
  const scopeSystem  = safeStr(row["Sistema em Escopo"]);
  const prpId        = safeStr(row["ID - PRP (RentSoft)"]);
  const titleDetail  = scopeSystem || safeStr(row["Detalhe da demanda (Escopo)"]).slice(0, 48) || prpId || "Demanda";
  const id           = safeStr(row["id"]) || prpId || crypto.randomUUID();

  return {
    id,
    demandType,
    status,
    title: client || safeStr(row["Área Solicitante"]) || "Cliente não identificado",
    subtitle: titleDetail,
    hoursProject,
    hoursTotal,
    hoursAdm,
    hoursTraining,
    responsible,
    participants,
    raw: row,
    dates: {
      start: safeStr(row["Data Início (Previsão)"]),
      end:   safeStr(row["Data Conclusão (Previsão)"])
    }
  };
}

function getFilteredView(task, personFilter) {
  if (!personFilter) return task;

  const p = personFilter.toLowerCase();
  const allApontamentos = task._apontamentos || task.raw?._apontamentos || [];
  const filtered = allApontamentos.filter(a => {
    const name = _apontamentoNome(a).toLowerCase();
    return name.includes(p) || p.includes(name);
  });

  let hoursTotal = 0, hoursAdm = 0, hoursTraining = 0;
  const participantsMap = new Map();

  filtered.forEach(a => {
    const h    = _apontamentoHours(a);
    const tipo = _apontamentoTipo(a);
    const name = _apontamentoNome(a);

    hoursTotal += h;
    if (tipo.includes("adm"))              hoursAdm += h;
    else if (tipo.includes("treinamento")) hoursTraining += h;

    if (name) {
      if (!participantsMap.has(name)) participantsMap.set(name, { name, hours: 0, roles: new Set() });
      const pp = participantsMap.get(name);
      pp.hours += h;
      const role = _apontamentoRole(a);
      if (role) pp.roles.add(role);
    }
  });

  const participants = [...participantsMap.values()].map(pp => ({
    name: pp.name,
    hours: pp.hours,
    role: [...pp.roles].join("/")
  }));

  return {
    ...task,
    hoursTotal,
    hoursAdm,
    hoursTraining,
    hoursProject: Math.max(0, hoursTotal - hoursAdm - hoursTraining),
    participants,
    responsible: participants.map(pp => pp.name).join(", ") || task.responsible,
    _filteredApontamentos: filtered,
  };
}

let tasks = [];
let filters = { person: "", demandType: "", query: "" };

function loadFilters() {
  try {
    const raw = localStorage.getItem(LOCAL_FILTERS_KEY);
    if (!raw) return;
    filters = { ...filters, ...JSON.parse(raw) };
  } catch (_) {}
}

function saveFilters() {
  localStorage.setItem(LOCAL_FILTERS_KEY, JSON.stringify(filters));
}

function handleDragStart(e, task) {
  e.dataTransfer.setData("text/plain", task.id);
  e.dataTransfer.effectAllowed = "move";
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  e.currentTarget.classList.add("drag-over");
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove("drag-over");
}

function handleDrop(e, targetStatusKey) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");

  const id   = e.dataTransfer.getData("text/plain");
  const task = tasks.find(t => t.id === id);
  if (!task || task.status === targetStatusKey) return;

  const oldStatus = task.status;
  task.status = targetStatusKey;
  render();

  api.updateTask(id, { status: targetStatusKey })
    .then(() => {
      setUpdatedMeta(new Date().toISOString());
      saveToLocalStorage(tasks);
    })
    .catch(() => {
      task.status = oldStatus;
      saveToLocalStorage(tasks);
      render();
      alert("Erro ao atualizar status. Verifique o console.");
    });
}

function _matchesPerson(t, p) {
  const allApontamentos = t._apontamentos || t.raw?._apontamentos || [];
  if (allApontamentos.length > 0) {
    return allApontamentos.some(a => {
      const name = _apontamentoNome(a).toLowerCase();
      return name.includes(p) || p.includes(name);
    });
  }
  return t.responsible.toLowerCase().includes(p) || p.includes(t.responsible.toLowerCase());
}

function _matchesQuery(t, q) {
  const blob = [
    t.title, t.subtitle, t.responsible,
    t.raw?.["Detalhe da demanda (Escopo)"],
    t.raw?.["Sistema em Escopo"],
    t.raw?.["Nome Cliente"],
    t.raw?.["ID - PRP (RentSoft)"],
    t.raw?.["IDPlanner"]
  ].map(safeStr).join(" ").toLowerCase();
  return blob.includes(q);
}

function render() {
  const p = filters.person ? filters.person.toLowerCase() : null;
  const q = filters.query  ? filters.query.toLowerCase()  : null;

  const filtered = tasks
    .filter(t => {
      if (p && !_matchesPerson(t, p))                    return false;
      if (filters.demandType && t.demandType !== filters.demandType) return false;
      if (q && !_matchesQuery(t, q))                     return false;
      return true;
    })
    .map(t => getFilteredView(t, filters.person));

  $("#badgeTotal").textContent = `${filtered.length} demandas`;
  $("#badgeAdm").textContent   = `${filtered.reduce((acc, t) => acc + (t.hoursAdm || 0), 0).toFixed(0)}h ADM`;

  const baseForTypeCounts = tasks.filter(t => {
    if (p && !_matchesPerson(t, p)) return false;
    if (q && !_matchesQuery(t, q))  return false;
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

  const board = $("#board");
  board.innerHTML = "";

  const byStatus = new Map(STATUS_ORDER.map(s => [s.key, []]));
  filtered.forEach(t => byStatus.get(t.status)?.push(t));

  STATUS_ORDER.forEach(s => {
    const col  = document.createElement("div");
    col.className = "column";
    const list   = byStatus.get(s.key) || [];
    const colAdm = list.reduce((acc, t) => acc + (t.hoursAdm || 0), 0);

    col.innerHTML = `
      <div class="col-head">
        <div class="name">${s.label}</div>
        <div class="meta">${list.length} • ${colAdm.toFixed(0)}h</div>
      </div>
      <div class="col-body" data-status="${s.key}"></div>
    `;

    const body = $(".col-body", col);
    body.addEventListener("dragover",  handleDragOver);
    body.addEventListener("dragleave", handleDragLeave);
    body.addEventListener("drop",      (e) => handleDrop(e, s.key));

    list
      .sort((a, b) => (b.hoursAdm - a.hoursAdm) || a.title.localeCompare(b.title))
      .forEach(t => body.appendChild(renderTaskCard(t)));

    board.appendChild(col);
  });
}

function renderTaskCard(t) {
  const el = document.createElement("div");
  el.className = "task";
  el.draggable  = true;
  el.addEventListener("dragstart", (e) => handleDragStart(e, t));

  const projHours  = t.hoursProject || 0;
  const admHours   = t.hoursAdm     || 0;
  const totalHours = t.hoursTotal   || 0;

  const avatars = (t.participants || []).map(p =>
    `<div class="avatar-mini" title="${escapeHTML(p.name)}">${escapeHTML(initials(p.name))}</div>`
  ).join("");

  const avatarStack = avatars ||
    `<div class="avatar-mini" title="${escapeHTML(t.responsible)}">${escapeHTML(initials(t.responsible))}</div>`;

  el.innerHTML = `
    <div class="top">
      <div style="flex:1; min-width:0;">
        <div class="title" title="${escapeHTML(t.title)}">${escapeHTML(t.title)}</div>
        <div class="sub">${escapeHTML(t.subtitle)}</div>
      </div>
      <div class="avatar-stack">${avatarStack}</div>
    </div>
    <div class="hours-grid">
      <div class="tag tag-type">${escapeHTML(t.demandType)}</div>
      ${admHours > 0 ? `<div class="tag tag-adm">${admHours.toFixed(0)}h ADM</div>` : ''}
      <div class="tag tag-project">${projHours.toFixed(0)}h Projeto</div>
      <div class="tag tag-total">${totalHours.toFixed(0)}h Total</div>
    </div>
  `;

  el.addEventListener("click", () => openModal(t));
  return el;
}

function escapeHTML(str) {
  const s = safeStr(str);
  return s.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

async function openModal(task) {
  $("#modalTitle").textContent    = task.title;
  $("#modalSubtitle").textContent = task.subtitle || "";

  const kvs = [
    ["Status",              task.status],
    ["Tipo de demanda",     task.demandType],
    ["Responsáveis",        task.responsible || "—"],
    ["Horas ADM (geral)",   `${(task.hoursAdm   || 0).toFixed(0)}h`],
    ["Horas (total)",       `${(task.hoursTotal || 0).toFixed(0)}h`],
    ["Cliente",             safeStr(task.raw?.["Nome Cliente"])                 || "—"],
    ["Área solicitante",    safeStr(task.raw?.["Área Solicitante"])              || "—"],
    ["Solicitante",         safeStr(task.raw?.["Nome do Solicitante"])           || "—"],
    ["PRP (RentSoft)",      safeStr(task.raw?.["ID - PRP (RentSoft)"])           || "—"],
    ["Sistema em escopo",   safeStr(task.raw?.["Sistema em Escopo"])             || "—"],
    ["Período escopo",      `${safeStr(task.raw?.["Período Escopo (Inicial)"])} → ${safeStr(task.raw?.["Período Escopo (Final)"])}`.trim()],
    ["Início previsto",     safeStr(task.raw?.["Data Início (Previsão)"])        || "—"],
    ["Conclusão prevista",  safeStr(task.raw?.["Data Conclusão (Previsão)"])     || "—"],
    ["Aprovação",           safeStr(task.raw?.["Aprovação Demanda"])             || "—"],
  ];

  const apontamentos = task._filteredApontamentos || task.raw?._apontamentos || [];

  const grid = $("#modalGrid");
  grid.innerHTML = "";
  kvs.forEach(([k, v]) => {
    const d = document.createElement("div");
    d.className = "kv";
    d.innerHTML = `<div class="k">${escapeHTML(k)}</div><div class="v">${escapeHTML(v)}</div>`;
    grid.appendChild(d);
  });

  if (apontamentos.length > 0) {
    const section = document.createElement("div");
    section.style.cssText = "margin-top:20px;border-top:1px solid #e0e0e0;padding-top:20px;";

    const title = document.createElement("h3");
    title.textContent  = "Detalhamento de Apontamentos";
    title.style.cssText = "margin-bottom:10px;font-size:1.1rem;";
    section.appendChild(title);

    const table = document.createElement("table");
    table.style.cssText = "width:100%;border-collapse:collapse;font-size:0.9rem;";

    table.innerHTML = `
      <thead>
        <tr style="background:#f5f5f5;border-bottom:2px solid #ddd;">
          <th style="padding:12px 8px;text-align:left;">Nome Colaborador</th>
          <th style="padding:12px 8px;text-align:left;">Responsabilidade</th>
          <th style="padding:12px 8px;text-align:left;">Tipo</th>
          <th style="padding:12px 8px;text-align:right;">Horas</th>
        </tr>
      </thead>
    `;

    const tbody  = document.createElement("tbody");
    let totalH   = 0;
    const grouped = new Map();

    apontamentos.forEach(a => {
      const name = _apontamentoNome(a) || "Colaborador não identificado";
      if (!grouped.has(name)) grouped.set(name, { name, hours: 0, responsibilities: new Set(), types: new Set() });
      const g = grouped.get(name);
      const h = _apontamentoHours(a);
      g.hours += h;
      totalH  += h;
      const resp = _apontamentoRole(a);
      const tipo = safeStr(a["Tipo da hora"] || a.tipo_hora || a.TipoDaHora || a.TipoHora || a.tipo || "");
      if (resp) g.responsibilities.add(resp);
      if (tipo) g.types.add(tipo);
    });

    [...grouped.values()]
      .sort((a, b) => b.hours - a.hours)
      .forEach((g, idx) => {
        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid #eee";
        if (idx % 2 === 0) tr.style.background = "#fafafa";
        tr.innerHTML = `
          <td style="padding:12px 8px;">${escapeHTML(g.name)}</td>
          <td style="padding:12px 8px;">${escapeHTML([...g.responsibilities].join(", ") || "—")}</td>
          <td style="padding:12px 8px;">${escapeHTML([...g.types].join(", ") || "—")}</td>
          <td style="padding:12px 8px;text-align:right;font-weight:bold;">${g.hours.toFixed(1)}h</td>
        `;
        tbody.appendChild(tr);
      });

    table.appendChild(tbody);
    table.innerHTML += `
      <tfoot>
        <tr style="background:#e8f4f8;border-top:2px solid #ddd;font-weight:bold;">
          <td colspan="3" style="padding:12px 8px;">TOTAL</td>
          <td style="padding:12px 8px;text-align:right;">${totalH.toFixed(1)}h</td>
        </tr>
      </tfoot>
    `;
    section.appendChild(table);
    grid.appendChild(section);
  }

  const desc = safeStr(task.raw?.["Detalhe da demanda (Escopo)"]);
  $("#modalNote").textContent = desc || "Sem detalhes adicionais.";

  let checklistContainer = $("#checklistContainer");
  if (!checklistContainer) {
    checklistContainer = document.createElement("div");
    checklistContainer.id = "checklistContainer";
    checklistContainer.className = "checklist-container";
    $("#modalNote").after(checklistContainer);
  }

  checklistContainer.innerHTML = "<p style='padding:10px;color:#666;'>Carregando checklist...</p>";
  $("#modalBackdrop").classList.add("show");

  try {
    const apiTasks = await loadChecklistFromAPI(task.id);
    task.checklist = apiTasks;
    renderChecklist(task, checklistContainer);
  } catch (_) {
    checklistContainer.innerHTML = "<p style='color:red;'>Erro ao carregar checklist.</p>";
  }
}

function closeModal() {
  $("#modalBackdrop").classList.remove("show");
}

async function loadFromFetch() {
  const resp = await fetch("./data/tasks.json", { cache: "no-store" });
  if (!resp.ok) throw new Error("fetch failed");
  const obj = await resp.json();
  return obj.tasks || [];
}

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw).tasks || null;
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
  const people = new Set();
  tasks.forEach(t => {
    if (t.responsible && t.responsible !== "Sem responsável") {
      t.responsible.split(", ").forEach(p => { if (p.trim()) people.add(p.trim()); });
    }
    const raw = t.raw || {};
    ["Responsável Demanda", "Responsável Cyber", "Responsável Intelidados", "Trainee do Projeto"].forEach(f => {
      const n = safeStr(raw[f]);
      if (n) people.add(n.trim());
    });
  });

  const sorted  = [...people].sort((a, b) => a.localeCompare(b));
  const sel     = $("#personSelect");
  sel.innerHTML = `<option value="">Todos</option>` +
    sorted.map(p => `<option value="${escapeHTML(p)}">${escapeHTML(p)}</option>`).join("");
  sel.value = filters.person || "";
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
  hideBanner();
  render();
}

function setBanner(msg) {
  const el = $("#banner");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function hideBanner() {
  $("#banner").classList.add("hidden");
}

function bindEvents() {
  $("#modalClose").addEventListener("click", closeModal);
  $("#modalBackdrop").addEventListener("click", (e) => { if (e.target.id === "modalBackdrop") closeModal(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

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
}

function normalizeId(val) {
  if (val == null || val === "") return "";
  const s = String(val).trim();
  const n = parseFloat(s);
  return (!isNaN(n) && isFinite(n)) ? String(Math.round(n)) : s;
}

function mergeData(tasksList, apontamentosList) {
  if (!Array.isArray(tasksList))       return [];
  if (!Array.isArray(apontamentosList)) return tasksList;

  const mapById = new Map();
  let semDemandaId = 0;

  apontamentosList.forEach(a => {
    // A API retorna "DemandaId " com espaço no final em alguns casos
    const rawId = a["DemandaId "] ?? a.DemandaId ?? a.demanda_id ?? a.demandaId ?? a.demanda_Id ?? null;
    const key   = rawId != null ? normalizeId(rawId) : "";
    if (key) {
      if (!mapById.has(key)) mapById.set(key, []);
      mapById.get(key).push(a);
    } else {
      semDemandaId++;
    }
  });

  const normC = s => String(s || "").trim().toLowerCase();
  const mapByCliente = new Map();
  apontamentosList.forEach(a => {
    const cliente = normC(a["Nome Cliente"] || a["Nome cliente"] || a.NomeCliente || a.cliente || "");
    if (cliente) {
      if (!mapByCliente.has(cliente)) mapByCliente.set(cliente, []);
      mapByCliente.get(cliente).push(a);
    }
  });

  return tasksList.map(task => {
    const taskId = normalizeId(task.id ?? task.ID ?? task["ID"] ?? "");
    if (mapById.has(taskId)) {
      task._apontamentos = mapById.get(taskId);
    } else if (semDemandaId > 0) {
      const clienteTask = normC(task["Nome Cliente"] || task["Contato Cliente"] || task.cliente || "");
      task._apontamentos = (clienteTask && mapByCliente.has(clienteTask))
        ? mapByCliente.get(clienteTask)
        : [];
    } else {
      task._apontamentos = [];
    }
    return task;
  });
}

function normalizeTasks(list) {
  if (!Array.isArray(list)) return [];
  return list.map(t => (t.raw && t.status) ? t : normalizeRow(t));
}

async function init() {
  loadFilters();
  bindEvents();

  try {
    const [tasksData, apontamentosData] = await Promise.all([
      api.getTasks(),
      api.getApontamentos()
    ]);

    tasks = normalizeTasks(mergeData(tasksData, apontamentosData));
    setUpdatedMeta(new Date().toISOString());
    populatePeopleDropdown();
    syncControls();
    render();
  } catch (e) {
    const cachedTasks = loadFromLocalStorage();
    if (cachedTasks) {
      tasks = normalizeTasks(cachedTasks);
      render();
      setBanner(`API indisponível — exibindo cache local. ${e.message}`);
    } else if (window.__PPC_SAMPLE__) {
      tasks = normalizeTasks(window.__PPC_SAMPLE__);
      render();
      setBanner(`API indisponível — exibindo dados de amostra. ${e.message}`);
    } else {
      setBanner(`Sem dados: API offline e sem cache local. ${e.message}`);
    }
  } finally {
    const loader = $("#loader");
    if (loader) loader.classList.add("hidden");
  }
}

document.addEventListener("DOMContentLoaded", init);

/* -------- Painel de Prazos -------- */

function parseDateForPrazos(str) {
  if (!str) return null;
  const s = String(str).trim();

  const mdyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(date.getTime())) return date;
  }

  const dmyMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(date.getTime())) return date;
  }

  const iso = new Date(s);
  return !isNaN(iso.getTime()) ? iso : null;
}

function formatDatePrazos(date) {
  if (!date) return "—";
  return [
    String(date.getDate()).padStart(2, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    date.getFullYear()
  ].join("/");
}

function openPrazosDrawer() {
  const overlay = document.getElementById("prazosOverlay");
  const drawer  = document.getElementById("prazosDrawer");
  if (!overlay || !drawer) return;
  renderPainelPrazos();
  overlay.classList.add("open");
  drawer.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closePrazosDrawer() {
  const overlay = document.getElementById("prazosOverlay");
  const drawer  = document.getElementById("prazosDrawer");
  if (!overlay || !drawer) return;
  overlay.classList.remove("open");
  drawer.classList.remove("open");
  document.body.style.overflow = "";
}

function renderPainelPrazos() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const aIniciar = [], emAndamento = [], atrasados = [];

  tasks.forEach(task => {
    if (task.status === "Concluída" || task.status === "Cancelada") return;

    const raw = task.raw || task;
    const startDate = parseDateForPrazos(safeStr(raw["Data Início (Previsão)"] || raw["Data Inicio (Previsao)"] || raw.dateStart || ""))
                   || parseDateForPrazos(task.dates?.start);
    const endDate   = parseDateForPrazos(safeStr(raw["Data Conclusão (Previsão)"] || raw["Data Conclusao (Previsao)"] || raw.dateEnd || ""))
                   || parseDateForPrazos(task.dates?.end);

    const entry = {
      cliente:    safeStr(raw["Nome Cliente"] || raw["Contato Cliente"] || task.title || "Cliente não identificado"),
      tipo:       task.demandType || safeStr(raw["Tipo de Demanda"]) || "—",
      responsavel: task.responsible || "Sem responsável",
      startDate,
      endDate,
    };

    if (endDate && endDate < today) {
      atrasados.push(entry);
    } else if (startDate && startDate < today && task.status !== "Em andamento") {
      atrasados.push(entry);
    } else if (task.status === "Em andamento") {
      emAndamento.push(entry);
    } else {
      aIniciar.push(entry);
    }
  });

  const byStart = (a, b) => (a.startDate || new Date(9999, 0)) - (b.startDate || new Date(9999, 0));
  aIniciar.sort(byStart);
  emAndamento.sort(byStart);
  atrasados.sort((a, b) => (a.endDate || new Date(0)) - (b.endDate || new Date(0)));

  const summaryEl = document.getElementById("prazosSummaryRow");
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="prazos-summary-chip chip-start">
        <span class="prazos-summary-num">${aIniciar.length}</span>
        <span class="prazos-summary-lbl">A Iniciar</span>
      </div>
      <div class="prazos-summary-chip chip-ongoing">
        <span class="prazos-summary-num">${emAndamento.length}</span>
        <span class="prazos-summary-lbl">Em Andamento</span>
      </div>
      <div class="prazos-summary-chip chip-late">
        <span class="prazos-summary-num">${atrasados.length}</span>
        <span class="prazos-summary-lbl">Atrasados</span>
      </div>
    `;
  }

  const countStart   = document.getElementById("countStart");
  const countOngoing = document.getElementById("countOngoing");
  const countLate    = document.getElementById("countLate");
  if (countStart)   countStart.textContent   = aIniciar.length;
  if (countOngoing) countOngoing.textContent = emAndamento.length;
  if (countLate)    countLate.textContent    = atrasados.length;

  renderPrazosCards("cardsStart",   aIniciar,    "start");
  renderPrazosCards("cardsOngoing", emAndamento, "ongoing");
  renderPrazosCards("cardsLate",    atrasados,   "late");
}

function renderPrazosCards(containerId, entries, category) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (entries.length === 0) {
    const empty = { start: "Nenhum projeto a iniciar", ongoing: "Nenhum projeto em andamento", late: "Nenhum projeto atrasado 🎉" };
    container.innerHTML = `<div class="prazos-empty">${empty[category] || "Sem dados"}</div>`;
    return;
  }

  container.innerHTML = entries.map(entry => `
    <div class="prazos-project-card card-${category}">
      <div class="prazos-card-top">
        <div class="prazos-card-client">${escapeHTML(entry.cliente)}</div>
        <span class="prazos-card-type type-badge-${category}">${escapeHTML(entry.tipo)}</span>
      </div>
      <div class="prazos-card-dates">
        <div class="prazos-date-item">
          <span class="prazos-date-label">Início</span>
          <span class="prazos-date-value">${formatDatePrazos(entry.startDate)}</span>
        </div>
        <span class="prazos-date-separator">→</span>
        <div class="prazos-date-item">
          <span class="prazos-date-label">Conclusão</span>
          <span class="prazos-date-value ${category === 'late' ? 'overdue' : ''}">${formatDatePrazos(entry.endDate)}</span>
        </div>
      </div>
      <div class="prazos-card-responsible">👤 ${escapeHTML(entry.responsavel)}</div>
    </div>
  `).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  const btnOpen  = document.getElementById("btnPainelPrazos");
  const btnClose = document.getElementById("btnClosePrazos");
  const overlay  = document.getElementById("prazosOverlay");

  if (btnOpen)  btnOpen.addEventListener("click",  openPrazosDrawer);
  if (btnClose) btnClose.addEventListener("click", closePrazosDrawer);
  if (overlay)  overlay.addEventListener("click",  closePrazosDrawer);

  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePrazosDrawer(); });
});
