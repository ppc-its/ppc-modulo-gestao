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
// const LOCAL_CSV1_KEY = "ppc_csv1_data_v1";
// const LOCAL_CSV2_KEY = "ppc_csv2_data_v1";

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

  const apontamentos = row._apontamentos || [];

  let hoursTotal = 0;
  let hoursAdm = 0;
  const participantsMap = new Map();

  apontamentos.forEach(a => {
    const h = toNumber(a.Horas || a.horas || 0);
    hoursTotal += h;

    const tipo = safeStr(a["Tipo da hora"] || a.tipo_hora).toLowerCase();
    if (tipo.includes("adm")) hoursAdm += h;

    const name = safeStr(a["Nome colaborador"] || a["Nome Colaborador"] || a.nome_colaborador || a.NomeColaborador || a.Colaborador || a.colaborador);
    if (name) {
      if (!participantsMap.has(name)) {
        participantsMap.set(name, { name, hours: 0, roles: new Set() });
      }
      const p = participantsMap.get(name);
      p.hours += h;
      const role = safeStr(a.Responsabilidades || a.responsabilidade || a.responsabilidades);
      if (role) p.roles.add(role);
    }
  });

  const participants = [...participantsMap.values()].map(p => ({
    name: p.name,
    hours: p.hours,
    role: [...p.roles].join("/")
  }));

  const responsible = participants.map(p => p.name).join(", ") || safeStr(row["Responsável Demanda"]) || "Sem responsável";
  const hoursProject = Math.max(0, hoursTotal - hoursAdm);

  const client = safeStr(row["Nome Cliente"]) || safeStr(row["Contato Cliente"]) || "";

  const scopeSystem = safeStr(row["Sistema em Escopo"]);
  const prpId = safeStr(row["ID - PRP (RentSoft)"]);

  const titleDetail = scopeSystem ? scopeSystem : (safeStr(row["Detalhe da demanda (Escopo)"]).slice(0, 48) || prpId || "Demanda");

  const start = safeStr(row["Data Início (Previsão)"]);
  const end = safeStr(row["Data Conclusão (Previsão)"]);

  const id = safeStr(row["id"]) || prpId || crypto.randomUUID();

  return {
    id: id,
    demandType,
    status,
    title: client || safeStr(row["Área Solicitante"]) || "Cliente não identificado",
    subtitle: titleDetail,
    hoursProject,
    hoursTotal,
    hoursAdm,
    responsible,
    participants,
    raw: row,
    dates: { start, end }
  };
}

// Funções de parseCSV REMOVIDAS (não mais utilizadas no front)

/* -------- Estado -------- */
let tasks = [];
/*
let csv1Data = null; // CSV Principal (com coluna ID)
let csv2Data = null; // CSV Complementar (com coluna DemandaId)
*/
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
      if (!t.responsible.toLowerCase().includes(p)) return false;
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

  const projHours = t.hoursProject || 0;
  const admHours = t.hoursAdm || 0;
  const totalHours = t.hoursTotal || 0;

  // Gerar avatares para o stack no canto superior
  const avatars = (t.participants || []).map(p => {
    const init = initials(p.name);
    return `<div class="avatar-mini" title="${escapeHTML(p.name)}">${escapeHTML(init)}</div>`;
  }).join("");

  // Fallback se não houver participantes alocados
  const avatarStackHtml = avatars || `<div class="avatar-mini" title="${escapeHTML(t.responsible)}">${escapeHTML(initials(t.responsible))}</div>`;

  el.innerHTML = `
    <div class="top">
      <div style="flex:1; min-width:0;">
        <div class="title" title="${escapeHTML(t.title)}">${escapeHTML(t.title)}</div>
        <div class="sub">${escapeHTML(t.subtitle)}</div>
      </div>
      <div class="avatar-stack">
        ${avatarStackHtml}
      </div>
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

/* -------- Modal -------- */
async function openModal(task) {
  $("#modalTitle").textContent = `${task.title}`;
  $("#modalSubtitle").textContent = `${task.subtitle || ""}`;

  const kvs = [
    ["Status", task.status],
    ["Tipo de demanda", task.demandType],
    ["Responsáveis", task.responsible || "—"],
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

  const apontamentos = task.raw?._apontamentos || [];

  const grid = $("#modalGrid");
  grid.innerHTML = "";
  kvs.forEach(([k, v]) => {
    const d = document.createElement("div");
    d.className = "kv";
    d.innerHTML = `<div class="k">${escapeHTML(k)}</div><div class="v">${escapeHTML(v)}</div>`;
    grid.appendChild(d);
  });

  if (apontamentos.length > 0) {
    const detailsSection = document.createElement("div");
    detailsSection.style.marginTop = "20px";
    detailsSection.style.borderTop = "1px solid #e0e0e0";
    detailsSection.style.paddingTop = "20px";

    const title = document.createElement("h3");
    title.textContent = "📊 Detalhamento de Apontamentos (API)";
    title.style.marginBottom = "10px";
    title.style.fontSize = "1.1rem";
    detailsSection.appendChild(title);

    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    table.style.fontSize = "0.9rem";

    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr style="background: #f5f5f5; border-bottom: 2px solid #ddd;">
        <th style="padding: 8px; text-align: left;">Data</th>
        <th style="padding: 8px; text-align: left;">Nome Colaborador</th>
        <th style="padding: 8px; text-align: left;">Responsabilidade</th>
        <th style="padding: 8px; text-align: left;">Tipo</th>
        <th style="padding: 8px; text-align: right;">Horas</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    let totalH = 0;
    apontamentos.forEach((a, idx) => {
      const tr = document.createElement("tr");
      tr.style.borderBottom = "1px solid #eee";
      if (idx % 2 === 0) tr.style.background = "#fafafa";

      const h = toNumber(a.Horas || a.horas || 0);
      totalH += h;

      // Priorizar 'Nome colaborador' (c minúsculo) conforme indicação do usuário
      const nomeColab = a["Nome colaborador"] || a["Nome Colaborador"] || a.nome_colaborador || a.NomeColaborador || a.Colaborador || a.colaborador || "—";
      const resp = a.Responsabilidades || a.responsabilidade || "—";
      const tipo = a["Tipo da hora"] || a.tipo_hora || "—";

      tr.innerHTML = `
        <td style="padding: 8px;">${escapeHTML(a.Data || a.data || "—")}</td>
        <td style="padding: 8px;">${escapeHTML(nomeColab)}</td>
        <td style="padding: 8px;">${escapeHTML(resp)}</td>
        <td style="padding: 8px;">${escapeHTML(tipo)}</td>
        <td style="padding: 8px; text-align: right; font-weight: bold;">${h.toFixed(1)}h</td>
      `;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    const tfoot = document.createElement("tfoot");
    tfoot.innerHTML = `
      <tr style="background: #e8f4f8; border-top: 2px solid #ddd; font-weight: bold;">
        <td colspan="4" style="padding: 8px;">TOTAL</td>
        <td style="padding: 8px; text-align: right;">${totalH.toFixed(1)}h</td>
      </tr>
    `;
    table.appendChild(tfoot);
    detailsSection.appendChild(table);
    grid.appendChild(detailsSection);
  }

  const desc = safeStr(task.raw?.["Detalhe da demanda (Escopo)"]);
  $("#modalNote").textContent = desc || "Sem detalhes adicionais.";

  // --- Lógica de Checklist Atualizada com API ---
  let checklistContainer = $("#checklistContainer");
  if (!checklistContainer) {
    checklistContainer = document.createElement("div");
    checklistContainer.id = "checklistContainer";
    checklistContainer.className = "checklist-container";
    $("#modalNote").after(checklistContainer);
  }

  // Exibe estado de carregamento
  checklistContainer.innerHTML = "<p style='padding:10px; color:#666;'>⏳ Carregando checklist...</p>";

  // Abre o modal primeiro para não parecer travado
  $("#modalBackdrop").classList.add("show");

  // Busca dados da API e renderiza
  try {
    const apiTasks = await loadChecklistFromAPI(task.id);
    task.checklist = apiTasks; // Atualiza o objeto da task na memória
    renderChecklist(task, checklistContainer);
  } catch (err) {
    checklistContainer.innerHTML = "<p style='color:red;'>Erro ao carregar checklist.</p>";
  }
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
/*
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
*/

// Funções de CSV removidas

/*
function updateCsvStatus() {
  const statusEl = $("#csvStatus");
  if (!statusEl) return;

  const csv1Status = csv1Data ? "✅" : "❌";
  const csv2Status = csv2Data ? "✅" : "❌";

  statusEl.textContent = `CSV Principal: ${csv1Status} | CSV Complementar: ${csv2Status}`;
}
*/

function setUpdatedMeta(tsISO) {
  const d = tsISO ? new Date(tsISO) : new Date();
  $("#badgeUpdated").textContent = `atualizado ${d.toLocaleString()}`;
}

function populatePeopleDropdown() {
  const people = new Set();
  tasks.forEach(t => {
    if (t.responsible && t.responsible !== "Sem responsável") {
      t.responsible.split(", ").forEach(p => people.add(p.trim()));
    }
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

  /*
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
  */

  /*
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
  */
}

// New Init using API
async function init() {
  loadFilters();
  bindEvents();
  // updateCsvStatus(); // Mostra o status inicial dos CSVs

  console.log("Iniciando carregamento de dados via API...");
  try {
    // 1. Busca os dados da API (Tarefas e Apontamentos)
    const [tasksData, apontamentosData] = await Promise.all([
      api.getTasks(),
      api.getApontamentos()
    ]);

    // 2. Mescla os dados
    const merged = mergeData(tasksData, apontamentosData);

    // 3. Normaliza os dados usando a normalizeTasks
    tasks = normalizeTasks(merged);

    // 4. Atualiza metadados e UI
    setUpdatedMeta(new Date().toISOString());
    populatePeopleDropdown();
    syncControls(); // Garante que os inputs reflitam o 'filters' carregado
    render();

    console.log("Inicialização via API concluída.", tasks.length, "tarefas.");
  } catch (e) {
    console.error("Erro fatal ao carregar dados da API:", e);


    // Fallback para LocalStorage se a API falhar
    const cachedTasks = loadFromLocalStorage();
    if (cachedTasks) {
      tasks = normalizeTasks(cachedTasks);
      render();
      setBanner("Aviso: Mostrando dados do cache local (API offline).", "info");
    } else if (window.__PPC_SAMPLE__) {
      tasks = normalizeTasks(window.__PPC_SAMPLE__);
      render();
      setBanner("Aviso: Mostrando dados de amostra.", "info");
    }
  }
}

function mergeData(tasksList, apontamentosList) {
  if (!Array.isArray(tasksList)) return [];
  if (!Array.isArray(apontamentosList)) return tasksList;

  // Criar mapa de apontamentos agrupados por ID da demanda
  const map = new Map();
  apontamentosList.forEach(a => {
    const key = String(a.DemandaId || a.demanda_id || a.id || "").trim();
    if (key) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(a);
    }
  });

  return tasksList.map(task => {
    const taskId = String(task.id || task.ID || task["ID"] || "").trim();
    if (map.has(taskId)) {
      // Anexa a lista de apontamentos no objeto da tarefa
      task._apontamentos = map.get(taskId);
    } else {
      task._apontamentos = [];
    }
    return task;
  });
}

/**
 * Helper para normalizar uma lista de tarefas raw ou semi-raw
 */
function normalizeTasks(list) {
  if (!Array.isArray(list)) return [];
  return list.map(t => {
    // Se parece com nosso objeto 'task' interno (tem id, título...), use-o.
    // Se parece com uma linha CSV raw, normalize-a.
    if (t.raw && t.status) return t; // Já processado
    return normalizeRow(t);
  });
}

document.addEventListener("DOMContentLoaded", init);
