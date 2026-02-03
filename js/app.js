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

  let hoursAdm, hoursTotal, hoursProject, start, end;

  if (csv2Details) {
    // USAR DADOS DO CSV2 (prioritário)
    hoursAdm = csv2Details.horasAdmTotal || 0;
    hoursTotal = csv2Details.horasTotal || 0;
    hoursProject = csv2Details.horasProjetoTotal || 0; // Novo campo
    start = csv2Details.dataInicio || safeStr(row["Data Início (Previsão)"]);
    end = csv2Details.dataFim || safeStr(row["Data Conclusão (Previsão)"]);

    console.log(`[normalizeRow] Usando CSV2 para ID ${safeStr(row["ID"])}: ${hoursTotal}h total (${hoursAdm}h ADM, ${hoursProject}h PROJ)`);
  } else {
    // FALLBACK: Usar dados do CSV1
    hoursAdm = toNumber(row["Horas ADM"]);
    hoursTotal = toNumber(row["Horas"]);
    hoursProject = Math.max(0, hoursTotal - hoursAdm); // Derivado no fallback
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
    hoursProject, // Expor
    hoursTotal,
    responsible,
    raw: row,
    dates: { start, end }
  };
}

// Funções de parseCSV REMOVIDAS (não mais utilizadas no front)

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

  const projHours = t.hoursProject || 0; // Usar hoursProject explícito (calculado no normalizeRow)
  const admHours = t.hoursAdm || 0;
  const totalHours = t.hoursTotal || 0;

  // tags: tipo de demanda + horas ADM + horas Projeto + Total
  const tagType = `<div class="tag">${t.demandType}</div>`;
  const tagAdm = `<div class="tag" style="background:#e0f7fa; color:#006064;">${admHours.toFixed(0)}h ADM</div>`;
  const tagProj = projHours > 0 ? `<div class="tag" style="background:#fff3e0; color:#e65100;">${projHours.toFixed(0)}h Projeto</div>` : "";
  const tagTot = totalHours > 0 ? `<div class="tag" style="font-weight:bold;">${totalHours.toFixed(0)}h Total</div>` : "";

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
      ${tagProj}
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
  // Campos extras DINÂMICOS baseados no CSV2
  const csv2Details = task.raw?.["_csv2Details"];

  if (csv2Details && csv2Details.colaboradores && csv2Details.colaboradores.length > 0) {
    csv2Details.colaboradores.forEach(colab => {
      // Adiciona Responsável
      kvs.push([`Responsável (${colab.responsabilidades})`, colab.colaborador]);

      // Adiciona Horas se houver
      if (colab.horasProjeto > 0) {
        kvs.push([`Horas Projeto (${colab.responsabilidades})`, `${colab.horasProjeto.toFixed(0)}h`]);
      }
      if (colab.horasAdm > 0) {
        kvs.push([`Horas ADM (${colab.responsabilidades})`, `${colab.horasAdm.toFixed(0)}h`]);
      }
    });
  } else {
    // Fallback mínimo se não tiver CSV2 (opcional, ou não mostrar nada)
    // Se quiser manter comportamento antigo de mostrar se existir no raw do CSV1:
    const oldFields = [
      "Responsável Demanda", "Responsável Cyber", "Responsável Intelidados",
      "Trainee do Projeto", "Responsável Desenvolvimento"
    ];
    oldFields.forEach(key => {
      const val = safeStr(task.raw?.[key]);
      if (val) kvs.push([key, val]);
    });
  }

  const grid = $("#modalGrid");
  grid.innerHTML = "";
  kvs.forEach(([k, v]) => {
    const d = document.createElement("div");
    d.className = "kv";
    d.innerHTML = `<div class="k">${escapeHTML(k)}</div><div class="v">${escapeHTML(v)}</div>`;
    grid.appendChild(d);
  });

  // Adicionar detalhamento do CSV2 se disponível (Variável já declarada acima)
  // const csv2Details = task.raw?.["_csv2Details"];
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

  // Checklist Container
  let checklistContainer = $("#checklistContainer");
  if (!checklistContainer) {
    checklistContainer = document.createElement("div");
    checklistContainer.id = "checklistContainer";
    checklistContainer.className = "checklist-container";
    $("#modalNote").after(checklistContainer);
  }

  // Renderizar Checklist
  renderChecklist(task, checklistContainer);

  $("#modalBackdrop").classList.add("show");
}

function closeModal() {
  $("#modalBackdrop").classList.remove("show");
}

/* -------- Checklist Logic -------- */
function renderChecklist(task, container) {
  // Garantir array de checklist
  if (!task.checklist) task.checklist = [];

  container.innerHTML = `
    <div class="checklist-title">
      <span>✅</span> Checklist da Demanda
    </div>
    <div class="checklist-items" id="checklistItems"></div>
    <div class="checklist-input-row">
      <span style="font-size:16px;">➕</span>
      <input type="text" class="checklist-add-input" placeholder="Adicionar nova etapa (Enter)..." id="checklistInput">
    </div>
  `;

  const itemsContainer = container.querySelector("#checklistItems");

  task.checklist.forEach((item, index) => {
    const itemEl = document.createElement("div");
    itemEl.className = "checklist-item";
    itemEl.innerHTML = `
      <input type="checkbox" class="checklist-checkbox" ${item.done ? "checked" : ""}>
      <input type="text" class="checklist-text ${item.done ? "done" : ""}" value="${escapeHTML(item.text)}">
       <button class="checklist-delete" title="Remover item">✖</button>
    `;

    // Eventos do Item
    const checkbox = itemEl.querySelector(".checklist-checkbox");
    checkbox.addEventListener("change", () => {
      item.done = checkbox.checked;
      itemEl.querySelector(".checklist-text").classList.toggle("done", item.done);
      saveChecklist(task);
    });

    const textInput = itemEl.querySelector(".checklist-text");
    textInput.addEventListener("change", () => {
      item.text = textInput.value;
      saveChecklist(task);
    });

    const delBtn = itemEl.querySelector(".checklist-delete");
    delBtn.addEventListener("click", () => {
      task.checklist.splice(index, 1);
      saveChecklist(task);
      renderChecklist(task, container); // Re-render para atualizar índices
    });

    itemsContainer.appendChild(itemEl);
  });

  // Evento de Adicionar
  const addInput = container.querySelector("#checklistInput");
  addInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && addInput.value.trim()) {
      task.checklist.push({ text: addInput.value.trim(), done: false });
      saveChecklist(task);
      renderChecklist(task, container);
      // Manter foco no input após re-render? 
      // O re-render destroi o input. 
      // Melhor: focar no novo input criado após render
      setTimeout(() => {
        const newInput = container.querySelector("#checklistInput");
        if (newInput) newInput.focus();
      }, 0);
    }
  });
}

function saveChecklist(task) {
  // A task já é uma referência ao objeto dentro do array global 'tasks' ou 'APP_DATA'?
  // Em app.js, 'tasks' é a variável global. O objeto 'task' passado para openModal vem dela?
  // Sim, openModal é chamado com objetos de 'tasks'.
  // Então, basta salvar 'tasks' no LocalStorage.
  saveToLocalStorage(tasks);
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

// Funções de CSV removidas

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

// New Init using API
async function init() {
  loadFilters();
  bindEvents();

  try {
    const data = await api.getAllData();
    tasks = normalizeTasks(data);
    setUpdatedMeta(new Date().toISOString());
    populatePeopleDropdown();
    render();
    console.log("Inicialização via API concluída.", tasks.length, "tarefas.");
  } catch (e) {
    console.error("Erro fatal ao carregar dados:", e);
    setBanner("Erro ao carregar dados do servidor. Verifique o console.", "error");
    // Fallback para tarefas vazias ou sample se desejar
  }
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
