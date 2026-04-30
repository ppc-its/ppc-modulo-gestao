const COLORS = {
    primary: '#0b4f78',
    secondary: '#123e5d',
    accent: '#0C9DE4',
    muted: 'rgba(10, 15, 26, 0.5)',
    bg: '#f6f8fb',
    charts: [
        '#0b4f78', // panel
        '#36A2EB', // bright blue
        '#FF6384', // red/pink
        '#4BC0C0', // teal
        '#FF9F40', // orange
        '#9966FF', // purple
        '#C9CBCF'  // grey
    ]
};

const HOLIDAYS = [
    '2024-01-01',
    '2024-02-12',
    '2024-02-13',
    '2024-03-29',
    '2024-04-21',
    '2024-05-01',
    '2024-05-30',
    '2024-09-07',
    '2024-10-12',
    '2024-11-02',
    '2024-11-15',
    '2024-11-20',
    '2024-12-25',

    '2025-01-01',
    '2025-03-03',
    '2025-03-04',
    '2025-04-18',
    '2025-04-21',
    '2025-05-01',
    '2025-06-19',
    '2025-09-07',
    '2025-10-12',
    '2025-11-02',
    '2025-11-15',
    '2025-11-20',
    '2025-12-25'
];

function getMonthlyCapacity(year, month) {
    let d = new Date(year, month, 1);
    let businessDays = 0;

    while (d.getMonth() === month) {
        const day = d.getDay();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dayStr = String(d.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${dayStr}`;

        if (day !== 0 && day !== 6) {
            if (!HOLIDAYS.includes(dateStr)) {
                businessDays++;
            }
        }
        d.setDate(d.getDate() + 1);
    }
    return businessDays * 8;
}

let chartTypeInstance = null;
let chartStatusInstance = null;
let chartResponsibleInstance = null;
let selectedHourType = null;
let APP_DATA = [];
const LOCAL_STORAGE_KEY = "ppc_task_board_data_v1";
const TODAY = new Date();

document.addEventListener("DOMContentLoaded", () => {
    init();
});

if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
}

async function init() {
    try {
        await loadData();
        populateFilters();
        document.getElementById('metricSelect').value = 'all';
        initCharts(APP_DATA, 'all');
        setupEventListeners();
        applyFilters();
    } catch (e) {
    } finally {
        const loader = document.getElementById('loader');
        if (loader) loader.classList.add('hidden');
    }
}

function safeStr(x) { return (x === null || x === undefined) ? "" : String(x).trim(); }
function toNumber(x) {
    const s = safeStr(x).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
}

async function loadData() {
    try {
        const [tasksData, apontamentosData] = await Promise.all([
            api.getTasks(),
            api.getApontamentos()
        ]);

        const merged = mergeData(tasksData, apontamentosData);
        APP_DATA = processTasks(merged);

    } catch (e) {
        APP_DATA = [];

        // Fallback: tentar carregar tasks.json local
        try {
            const resp = await fetch("./data/tasks.json", { cache: "no-store" });
            if (resp.ok) {
                const obj = await resp.json();
                const rawTasks = obj.tasks || [];
                APP_DATA = processTasks(rawTasks.map(t => ({ ...t, _apontamentos: [] })));
                _showGraphsBanner(`⚠️ API indisponível (${e.message}) — exibindo dados do cache local sem horas/responsáveis`, "warn");
            }
        } catch (_) { /* sem fallback disponível */ }

        if (APP_DATA.length === 0) {
            _showGraphsBanner(`❌ Erro ao carregar dados: ${e.message} — verifique se o servidor Flask está rodando em ${API_BASE_URL}`, "error");
        }
    }
}

function _showGraphsBanner(msg, type = "info") {
    let banner = document.getElementById("graphsBanner");
    if (!banner) {
        banner = document.createElement("div");
        banner.id = "graphsBanner";
        banner.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9999;padding:10px 20px;font-size:13px;font-weight:600;text-align:center;";
        document.body.prepend(banner);
    }
    banner.textContent = msg;
    banner.style.background = type === "error" ? "#e63946" : type === "warn" ? "#f4a261" : "#2a9d8f";
    banner.style.color = "#fff";
}

function normalizeId(val) {
    if (val == null || val === "") return "";
    const s = String(val).trim();
    const n = parseFloat(s);
    return (!isNaN(n) && isFinite(n)) ? String(Math.round(n)) : s;
}

function mergeData(tasksList, apontamentosList) {
    if (!Array.isArray(tasksList)) return [];
    if (!Array.isArray(apontamentosList)) return tasksList.map(t => ({ ...t, _apontamentos: [] }));

    const mapById = new Map();
    let withoutId = 0;

    apontamentosList.forEach(a => {
        const rawId = a["DemandaId "] || a.DemandaId || a.demanda_id || a.demandaId || a.demanda_Id || null;
        const key = rawId != null ? normalizeId(rawId) : null;
        if (key) {
            if (!mapById.has(key)) mapById.set(key, []);
            mapById.get(key).push(a);
        } else {
            withoutId++;
        }
    });

    const norm = s => String(s || "").trim().toLowerCase();
    const mapByCliente = new Map();
    apontamentosList.forEach(a => {
        const cliente = norm(a["Nome Cliente"] || a["Nome cliente"] || a.NomeCliente || a.cliente || "");
        if (cliente) {
            if (!mapByCliente.has(cliente)) mapByCliente.set(cliente, []);
            mapByCliente.get(cliente).push(a);
        }
    });

    const result = tasksList.map(task => {
        const taskId = normalizeId(task.id ?? task.ID ?? task["ID"] ?? task.Id ?? "");
        let apontamentos = taskId && mapById.has(taskId) ? mapById.get(taskId) : [];

        if (apontamentos.length === 0 && withoutId > 0) {
            const clienteTask = norm(task["Nome Cliente"] || task["Contato Cliente"] || task.cliente || "");
            if (clienteTask && mapByCliente.has(clienteTask)) {
                apontamentos = mapByCliente.get(clienteTask);
            }
        }

        return { ...task, _apontamentos: apontamentos };
    });

    return result;
}


function processTasks(tasks) {
    const processed = tasks.map((t, index) => {
        const raw = t.raw || t;
        const apontamentos = t._apontamentos || [];
        const taskId = t.id || t.prpId || raw.ID || raw.id || `task-${index}`;
        const metrics = calculateTaskMetrics(apontamentos, taskId, index);


        const { hoursProject: hProject, hoursAdm: hAdm, assignments } = metrics;

        if (assignments.length === 0) {
            const directFields = [
                "Responsável Demanda", "Responsável Cyber",
                "Responsável Intelidados", "Trainee do Projeto"
            ];
            directFields.forEach(field => {
                const name = safeStr(raw[field]);
                if (name) assignments.push({ person: name, hours: 0, role: "" });
            });
        }

        const owner = assignments.map(a => a.person).join(", ") || "Sem Responsável";

        let client = "SEM CLIENTE";
        if (apontamentos.length > 0) {
            const firstAppt = apontamentos[0];
            client =
                firstAppt["Nome Cliente"] ||
                firstAppt["Nome cliente"] ||
                firstAppt.nome_cliente ||
                firstAppt.NomeCliente ||
                firstAppt.cliente ||
                firstAppt.Cliente ||
                t.client ||
                raw["Nome Cliente"] ||
                raw["Contato Cliente"] ||
                raw["Cliente"] ||
                raw.cliente ||
                "SEM CLIENTE";
        } else {
            // Se não houver apontamentos, tentar pegar da tarefa
            client =
                t.client ||
                raw["Nome Cliente"] ||
                raw["Contato Cliente"] ||
                raw["Cliente"] ||
                raw.cliente ||
                raw.Client ||
                "SEM CLIENTE";
        }

        // Título/Descrição da demanda - tentar múltiplas variações
        // Se não houver, deixar vazio (não mostrar "SEM TÍTULO")
        const title =
            raw["Demanda"] ||
            raw["Detalhe da demanda (Escopo)"] ||
            raw["Demanda Interna (PPeC)"] ||
            raw.demanda ||
            raw.Demanda ||
            raw.Title ||
            raw.title ||
            t.title ||
            "";

        const dateStartStr =
            raw["Data Início (Previsão)"] ||
            raw["Data Inicio (Previsao)"] ||
            raw["Data Inicio (previsao)"] ||
            raw["Data Início (previsao)"] ||
            raw["Data Inicio (Pre Inicio)"] ||
            raw["Data de Início"] ||
            raw.data_inicio ||
            raw.DataInicio ||
            t.dateStart ||
            "";

        const dateEndStr =
            raw["Data Conclusão (Previsão)"] ||
            raw["Data Conclusao (Previsao)"] ||
            raw["Data conclusao (previsao)"] ||
            raw["Data Conclusão (previsao)"] ||
            raw["Data Conclusao (previsao)"] ||
            raw["Data de Entrega"] ||
            raw.data_entrega ||
            raw.DataEntrega ||
            raw["Prazo"] ||
            raw.prazo ||
            t.dateEnd ||
            "";

        const type =
            t.demandType ||
            raw["Tipo de Demanda"] ||
            raw.tipo ||
            raw.Tipo ||
            "OUTROS";

        const serviceType =
            raw["Intelidados"] ||
            raw["Cybersecurity"] ||
            raw["Auditoria TI"] ||
            raw["Consultoria de TI"] ||
            raw["Demanda Interna (PPeC)"] ||
            raw["Outros"] ||
            "—";

        const status =
            t.status ||
            raw["Status"] ||
            raw.status ||
            raw.STATUS ||
            "Backlog";

        const result = {
            id: taskId,
            client: client,
            title: title,
            owner: owner,
            assignments: assignments,
            type: type,
            status: status,
            hoursProject: hProject,
            hoursAdm: hAdm,
            hoursTraining: metrics.hoursTraining,
            hoursDisponivel: metrics.hoursDisponivel,
            hoursFerias: metrics.hoursFerias,
            get hours() { return (this.hoursProject || 0) + (this.hoursAdm || 0) + (this.hoursTraining || 0) + (this.hoursDisponivel || 0) + (this.hoursFerias || 0); },
            dateStart: parseDate(dateStartStr),
            dateEnd: parseDate(dateEndStr),
            get date() { return this.dateEnd || new Date(); },
            raw: raw,
            _apontamentos: apontamentos,
            prpId: raw["ID - PRP (RentSoft)"] || "",
            serviceType: serviceType
        };

        return result;
    });

    return processed;
}


function parseDate(dateStr) {
    if (!dateStr) return null;

    const parts = dateStr.split('/');
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        const d = new Date(year, month - 1, day);

        if (!isNaN(d.getTime())) {
            return d;
        }
    }

    // Fallback: tenta parse padrão para formatos ISO ou outros
    let d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;

    return null;
}

function formatDatePT(date, format = 'medium') {
    if (!date) return '';

    const dateObj = typeof date === 'string' ? parseDate(date) : date;
    if (!dateObj || isNaN(dateObj.getTime())) return '';

    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();

    const monthNames = [
        'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
        'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];

    const weekDays = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    const weekDay = weekDays[dateObj.getDay()];

    switch (format) {
        case 'short':
            return `${day}/${month}`;
        case 'medium':
            return `${day}/${month}/${year}`;
        case 'long':
            return `${day} de ${monthNames[dateObj.getMonth()]} de ${year}`;
        case 'full':
            return `${day}/${month}/${year} (${weekDay})`;
        case 'weekday':
            return `${day}/${month} ${weekDay}`;
        default:
            return `${day}/${month}/${year}`;
    }
}


function populateFilters() {
    const clientSet = new Set();
    const ownerSet = new Set();

    APP_DATA.forEach(item => {
        if (item.client) clientSet.add(item.client);
        if (item.assignments && Array.isArray(item.assignments)) {
            item.assignments.forEach(a => {
                if (a.person) ownerSet.add(a.person);
            });
        }
    });

    const clientSelect = document.getElementById('clientSelect');
    const sortedClients = [...clientSet].sort();
    sortedClients.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        clientSelect.appendChild(opt);
    });

    const respSelect = document.getElementById('respSelect');
    const sortedOwners = [...ownerSet].sort();
    sortedOwners.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o;
        opt.textContent = o;
        respSelect.appendChild(opt);
    });

}

// Filtros interativos (clique no gráfico)
let selectedStatus = null;
let selectedType = null;

function setupEventListeners() {
    const filterIds = [
        'periodSelect', 'clientSelect', 'respSelect',
        'respViewSelect', 'metricSelect', 'deadlineSelect',
        'startDate', 'endDate'
    ];
    filterIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => {
            if (id === 'periodSelect') {
                const val = document.getElementById('periodSelect').value;
                const container = document.getElementById('customDateContainer');
                if (container) {
                    container.style.display = (val === 'custom') ? 'flex' : 'none';
                }
            }
            applyFilters();
        });
    });

    document.getElementById('btnReset').addEventListener('click', resetFilters);
}

function renderFilterBanner() {
    const banner = document.getElementById('banner');
    if (!banner) return;

    const parts = [];
    if (selectedStatus) parts.push(`Status: <b>${selectedStatus}</b> <span class="clear-filter" onclick="clearStatusFilter()">✖</span>`);
    if (selectedType) parts.push(`Tipo: <b>${selectedType}</b> <span class="clear-filter" onclick="clearTypeFilter()">✖</span>`);

    if (parts.length > 0) {
        banner.innerHTML = `Filtros Ativos: ${parts.join(' &nbsp; | &nbsp; ')}`;
        banner.classList.remove('hidden');
        banner.style.display = 'block';
        banner.style.background = '#e0f2fe';
        banner.style.color = '#0c4a6e';
        banner.style.border = '1px solid #bae6fd';
    } else {
        banner.classList.add('hidden');
        banner.style.display = 'none';
    }
}

window.clearStatusFilter = function () {
    selectedStatus = null;
    applyFilters();
};

window.clearTypeFilter = function () {
    selectedType = null;
    applyFilters();
};

function resetFilters() {
    document.getElementById('periodSelect').value = "quarterly";
    const customDateContainer = document.getElementById('customDateContainer');
    if (customDateContainer) customDateContainer.style.display = 'none';

    document.getElementById('startDate').value = "";
    document.getElementById('endDate').value = "";
    document.getElementById('clientSelect').value = "";
    document.getElementById('respSelect').value = "";
    document.getElementById('metricSelect').value = "all";
    document.getElementById('deadlineSelect').value = "all";
    document.getElementById('respViewSelect').value = "individual_monthly";

    selectedStatus = null;
    selectedType = null;
    selectedHourType = null;

    const detailTable = document.getElementById('hourTypeDetailTable');
    const detailTitle = document.getElementById('hourTypeDetailTitle');
    if (detailTable) detailTable.style.display = 'none';
    if (detailTitle) {
        detailTitle.style.display = 'block';
        detailTitle.textContent = 'Selecione um tipo ao lado para ver detalhes';
    }

    applyFilters();
}

function applyFilters() {
    const period = document.getElementById('periodSelect').value;
    const client = document.getElementById('clientSelect').value;
    const owner = document.getElementById('respSelect').value;
    const metric = document.getElementById('metricSelect').value;
    const deadline = document.getElementById('deadlineSelect').value;
    const viewMode = document.getElementById('respViewSelect').value;

    const startStr = document.getElementById('startDate').value;
    const endStr = document.getElementById('endDate').value;

    renderFilterBanner();

    const { start: pStart, end: pEnd } = getPeriodDateRange(period, startStr, endStr);

    const recalculatedData = APP_DATA.map(originalTask => {
        const activeAppts = (originalTask._apontamentos || []).filter(a => {
            if (pStart || pEnd) {
                const dVal = a.Data || a.data || a["Data Apontamento"] || a["Data do Apontamento"] ||
                             a["data_apontamento"] || a["DataApontamento"] || a.date || a.Date || "";
                const d = parseDate(dVal);
                if (!d) return true;
                if (pStart && d < pStart) return false;
                if (pEnd && d > pEnd) return false;
            }

            if (owner) {
                const personName = safeStr(
                    a["Nome colaborador"] ||
                    a["Nome Colaborador"] ||
                    a.nome_colaborador ||
                    a.NomeColaborador ||
                    a.Colaborador ||
                    a.colaborador ||
                    a.nome ||
                    a.Nome ||
                    ""
                ).toLowerCase();
                const filterNormal = owner.toLowerCase();

                if (!personName) return false;

                const isMatch = personName.includes(filterNormal) || (personName.length >= 3 && filterNormal.includes(personName));
                if (!isMatch) return false;
            }

            return true;
        });

        const taskId = originalTask.id || originalTask.prpId || 'unknown';
        const metrics = calculateTaskMetrics(activeAppts, taskId, -1);

        const hTotalValue = (metrics.hoursProject || 0) + (metrics.hoursAdm || 0) + (metrics.hoursTraining || 0) + (metrics.hoursDisponivel || 0) + (metrics.hoursFerias || 0);

        const finalAssignments = metrics.assignments.length > 0
            ? metrics.assignments
            : (originalTask.assignments || []);

        return {
            ...originalTask,
            _apontamentos: activeAppts,
            hoursProject: metrics.hoursProject,
            hoursAdm: metrics.hoursAdm,
            hoursTraining: metrics.hoursTraining,
            hoursDisponivel: metrics.hoursDisponivel,
            hoursFerias: metrics.hoursFerias,
            assignments: finalAssignments,
            hours: hTotalValue,
            owner: finalAssignments.map(a => a.person).join(", ") || originalTask.owner || "Sem Responsável"
        };
    });

    let filtered = recalculatedData.filter(item => {
        if (selectedStatus && item.status !== selectedStatus) return false;
        if (selectedType && item.type !== selectedType) return false;
        if (client && item.client !== client) return false;

        if (owner) {
            const p = owner.toLowerCase();
            const match = item.assignments.some(a => {
                const name = a.person.toLowerCase();
                return name.includes(p) || (name.length >= 3 && p.includes(name));
            });
            if (!match) return false;
        }

        if (period !== 'total') {
            const hasHours = item.hours > 0.01;
            let hasDateInRange = false;

            if (pStart && pEnd) {
                const taskStart = item.dateStart;
                const taskEnd = item.dateEnd;

                if (taskEnd && taskEnd >= pStart && taskEnd <= pEnd) hasDateInRange = true;
                else if (taskStart && taskStart >= pStart && taskStart <= pEnd) hasDateInRange = true;
                else if (taskStart && taskEnd && taskStart < pStart && taskEnd > pEnd) hasDateInRange = true;
            }

            if (!hasHours && !hasDateInRange) return false;
        }

        if (deadline !== 'all') {
            const itemDate = item.date || new Date();
            const isDone = item.status === 'Concluída' || item.status === 'Cancelada';
            const isLate = !isDone && itemDate < TODAY;

            if (deadline === 'overdue') {
                if (!isLate) return false;
            } else if (deadline === 'ontime') {
                if (isLate) return false;
            }
        }

        return true;
    });


    updateCharts(filtered, metric, viewMode, owner);
    renderDeliveryDashboard(filtered);
}

function renderHourTypeTable(data) {
    const tbody = document.querySelector('#hourTypeSummaryTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    let totalProject = 0;
    let totalAdm = 0;
    let totalTraining = 0;
    let totalDisponivel = 0;
    let totalFerias = 0;

    data.forEach(d => {
        totalProject += (d.hoursProject || 0);
        totalAdm += (d.hoursAdm || 0);
        totalTraining += (d.hoursTraining || 0);
        totalDisponivel += (d.hoursDisponivel || 0);
        totalFerias += (d.hoursFerias || 0);
    });

    const grandTotal = totalProject + totalAdm + totalTraining + totalDisponivel + totalFerias;

    const createRow = (typeId, label, val, color) => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.style.borderBottom = '1px solid #eee';

        if (selectedHourType === typeId) {
            tr.style.backgroundColor = 'rgba(12, 157, 228, 0.1)';
            tr.style.fontWeight = 'bold';
        }

        const pct = grandTotal > 0 ? ((val / grandTotal) * 100).toFixed(1) + '%' : '0.0%';

        tr.innerHTML = `
            <td style="padding: 10px; display: flex; align-items: center; gap: 8px;">
                <div style="width: 12px; height: 12px; border-radius: 50%; background-color: ${color};"></div>
                ${label}
            </td>
            <td style="padding: 10px; text-align: right; font-family: monospace; font-size: 1.1em;">${val.toFixed(2)}h</td>
            <td style="padding: 10px; text-align: right; color: #666; font-size: 0.9em;">${pct}</td>
        `;

        tr.onclick = () => {
            if (selectedHourType === typeId) {
                selectedHourType = null;
                if (selectedStatus || selectedType) {
                    renderHourTypeDetails('all', data);
                } else {
                    document.getElementById('hourTypeDetailTable').style.display = 'none';
                    const title = document.getElementById('hourTypeDetailTitle');
                    if (title) {
                        title.style.display = 'block';
                        title.textContent = 'Selecione um tipo ao lado para ver detalhes';
                    }
                }
            } else {
                selectedHourType = typeId;
            }
            // Re-renderizar tabela resumo para atualizar highlight
            renderHourTypeTable(data);
        };

        return tr;
    };

    // Renderizar Linhas
    tbody.appendChild(createRow('project', 'Horas Projeto', totalProject, '#36A2EB'));
    tbody.appendChild(createRow('adm', 'Horas ADM', totalAdm, '#FF9F40'));
    tbody.appendChild(createRow('training', 'Horas Treinamento', totalTraining, '#9d4edd'));
    tbody.appendChild(createRow('disponivel', 'Horas Disponível', totalDisponivel, '#10b981'));
    tbody.appendChild(createRow('ferias', 'Hora Férias', totalFerias, '#FF6384'));

    const trTotal = document.createElement('tr');
    trTotal.style.fontWeight = 'bold';
    trTotal.style.backgroundColor = '#fafafa';
    trTotal.style.cursor = 'pointer';

    trTotal.onclick = () => {
        if (selectedHourType === 'all') {
            selectedHourType = null;
        } else {
            selectedHourType = 'all';
        }
        renderHourTypeTable(data);
    };

    if (selectedHourType === 'all') {
        trTotal.style.backgroundColor = 'rgba(12, 157, 228, 0.1)';
    }

    trTotal.innerHTML = `
        <td style="padding: 10px;">TOTAL</td>
        <td style="padding: 10px; text-align: right; font-family: monospace; font-size: 1.1em;">${grandTotal.toFixed(2)}h</td>
        <td style="padding: 10px; text-align: right;">100%</td>
    `;
    tbody.appendChild(trTotal);

    if (selectedHourType) {
        renderHourTypeDetails(selectedHourType, data);
    } else if (selectedStatus || selectedType) {
        renderHourTypeDetails('all', data);
    } else {
        const detailTable = document.getElementById('hourTypeDetailTable');
        const detailTitle = document.getElementById('hourTypeDetailTitle');
        if (detailTable) detailTable.style.display = 'none';
        if (detailTitle) {
            detailTitle.style.display = 'block';
            detailTitle.textContent = 'Selecione um tipo ou filtre os gráficos para ver detalhes';
        }
    }
}

function renderHourTypeDetails(type, data) {
    const detailTable = document.getElementById('hourTypeDetailTable');
    const detailTbody = detailTable.querySelector('tbody');
    const detailTitle = document.getElementById('hourTypeDetailTitle');

    if (!detailTable || !detailTbody) return;

    detailTbody.innerHTML = '';
    detailTable.style.display = 'table';

    let label = 'Todos os Tipos';
    if (type === 'project') label = 'Horas Projeto';
    else if (type === 'adm') label = 'Horas ADM';
    else if (type === 'training') label = 'Horas Treinamento';
    else if (type === 'disponivel') label = 'Horas Disponível';
    else if (type === 'ferias') label = 'Hora Férias';
    else if (type === 'all') label = 'Visão Detalhada por Tipo';

    if (selectedStatus) label += ` (Status: ${selectedStatus})`;
    if (selectedType) label += ` (Tipo: ${selectedType})`;

    detailTitle.textContent = `Detalhamento: ${label}`;
    detailTitle.style.display = 'block';

    // 1. Filtrar dados - AGORA DIVIDINDO PROJETO vs ADM
    const items = [];

    data.forEach(task => {
        // Extrair responsáveis APENAS dos apontamentos filtrados (já filtrados por applyFilters)
        const apontamentos = task._apontamentos || [];

        // Montar mapa de horas por responsável a partir dos apontamentos
        const personHoursMap = new Map();
        apontamentos.forEach(a => {
            const person = safeStr(
                a["Nome colaborador"] || a["Nome Colaborador"] || a.nome_colaborador ||
                a.NomeColaborador || a.Colaborador || a.colaborador || a.nome || a.Nome || ""
            );
            if (!person) return;
            const h = toNumber(a.Horas || a.horas || 0);
            const tipo = safeStr(a["Tipo da hora"] || a.tipo_hora || "").toLowerCase();

            if (!personHoursMap.has(person)) personHoursMap.set(person, { project: 0, adm: 0, training: 0, disponivel: 0, ferias: 0 });
            const ph = personHoursMap.get(person);
            if (tipo.includes("adm")) ph.adm += h;
            else if (tipo.includes("treinamento")) ph.training += h;
            else if (tipo.includes("disponível") || tipo.includes("disponivel") || tipo.includes("disp")) ph.disponivel += h;
            else if (tipo.includes("férias") || tipo.includes("ferias")) ph.ferias += h;
            else ph.project += h;
        });

        const ownerStr = [...personHoursMap.keys()].join(", ") || task.owner || "—";

        let prpId = '—';
        let observacao = '—';
        for (const a of apontamentos) {
            if (prpId === '—' && (a['PRP'] || '') !== '') prpId = String(a['PRP']);
            if (observacao === '—') {
                const val = a['Observação:'] || a['Observação'] || a['Observacao'] || '';
                if (val !== '') observacao = String(val);
            }
            if (prpId !== '—' && observacao !== '—') break;
        }

        if (type === 'all' || type === 'project') {
            const val = task.hoursProject || 0;
            if (val > 0.01) {
                items.push({
                    client: task.client,
                    title: task.type,
                    serviceType: task.serviceType || "—",
                    prpId: prpId,
                    observacao: observacao,
                    owner: ownerStr,
                    hours: val,
                    typeLabel: 'PROJETO',
                    typeColor: '#36A2EB',
                    bg: '#eef8ff'
                });
            }
        }

        if (type === 'all' || type === 'adm') {
            const val = task.hoursAdm || 0;
            if (val > 0.01) {
                items.push({
                    client: task.client,
                    title: task.type,
                    serviceType: task.serviceType || "—",
                    prpId: prpId,
                    observacao: observacao,
                    owner: ownerStr,
                    hours: val,
                    typeLabel: 'ADM',
                    typeColor: '#FF9F40',
                    bg: '#fff8f3'
                });
            }
        }

        if (type === 'all' || type === 'training') {
            const val = task.hoursTraining || 0;
            if (val > 0.01) {
                items.push({
                    client: task.client,
                    title: task.type,
                    serviceType: task.serviceType || "—",
                    prpId: prpId,
                    observacao: observacao,
                    owner: ownerStr,
                    hours: val,
                    typeLabel: 'TREINAMENTO',
                    typeColor: '#9d4edd',
                    bg: '#f3e5f5'
                });
            }
        }

        // Check Disponível Hours
        if (type === 'all' || type === 'disponivel') {
            const val = task.hoursDisponivel || 0;
            if (val > 0.01) {
                items.push({
                    client: task.client,
                    title: task.type,
                    serviceType: task.serviceType || "—",
                    prpId: prpId,
                    observacao: observacao,
                    owner: ownerStr,
                    hours: val,
                    typeLabel: 'DISPONÍVEL',
                    typeColor: '#10b981',
                    bg: '#ecfdf5'
                });
            }
        }

        if (type === 'all' || type === 'ferias') {
            const val = task.hoursFerias || 0;
            if (val > 0.01) {
                items.push({
                    client: task.client,
                    title: task.type,
                    serviceType: task.serviceType || "—",
                    prpId: prpId,
                    observacao: observacao,
                    owner: ownerStr,
                    hours: val,
                    typeLabel: 'FÉRIAS',
                    typeColor: '#FF6384',
                    bg: '#fff5f5'
                });
            }
        }
    });

    items.sort((a, b) => b.hours - a.hours);

    if (items.length === 0) {
        detailTbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px; color: #888;">Nenhum registro encontrado para esta seleção.</td></tr>';
        return;
    }

    items.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding: 8px; font-size: 0.9em;">
                <span class="client-badge" style="background: ${item.bg}; color: ${item.typeColor}; border: 1px solid ${item.typeColor}20;">
                    ${item.client}
                </span>
            </td>
            <td style="padding: 8px; font-weight: 600; color: #334155;">
                <span style="font-size: 0.75em; font-weight: 800; color: #fff; background-color: ${item.typeColor}; padding: 2px 6px; border-radius: 4px; margin-right: 6px;">
                    ${item.typeLabel}
                </span>
                ${item.title}
            </td>
            <td style="padding: 8px; font-size: 0.9em; color: #64748b;">${item.serviceType}</td>
            <td style="padding: 8px; font-size: 0.9em; color: #334155; font-family: monospace; font-weight: 600;">${item.prpId}</td>
            <td style="padding: 8px; font-size: 0.85em; color: #64748b; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.observacao}">${item.observacao}</td>
            <td style="padding: 8px; font-size: 0.9em; color: #64748b;">${item.owner}</td>
            <td style="padding: 8px; text-align: right; font-weight: bold; font-family: monospace; color: ${item.typeColor};">
                ${item.hours.toFixed(2)}h
            </td>
        `;
        detailTbody.appendChild(tr);
    });
}

function initCharts(data, metric) {
    const typeData = processTypeData(data, metric);
    const ctxType = document.getElementById('chartType').getContext('2d');
    chartTypeInstance = new Chart(ctxType, {
        type: 'doughnut',
        data: {
            labels: Object.keys(typeData),
            datasets: [{
                data: Object.values(typeData),
                backgroundColor: COLORS.charts,
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        font: { family: 'ui-sans-serif, system-ui', size: 12 },
                        usePointStyle: true,
                        padding: 20
                    }
                },
                datalabels: {
                    color: '#fff',
                    font: { weight: 'bold', size: 14 },
                    formatter: (value, ctx) => {
                        let sum = 0;
                        let dataArr = ctx.chart.data.datasets[0].data;
                        dataArr.map(data => { sum += data; });
                        if (sum === 0) return "";
                        let percentage = (value * 100 / sum);
                        // Relaxei regra: mostra se > 0.5%
                        if (percentage < 0.5) return "";
                        return percentage.toFixed(0) + "%";
                    },
                    display: true, // Forçar exibição (auto estava ocultando demais)
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    borderRadius: 4,
                    padding: 4
                }
            },
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const idx = elements[0].index;
                    const label = chartTypeInstance.data.labels[idx];
                    if (selectedType === label) selectedType = null; // Toggle off
                    else selectedType = label;
                    applyFilters();
                }
            },
            onHover: (event, chartElement) => {
                event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
            }
        },
        plugins: [ChartDataLabels]
    });

    // Padrões Comuns de DataLabels
    const commonDataLabels = {
        color: '#333',
        font: { weight: 'bold', size: 13, family: 'ui-sans-serif, system-ui' },
        formatter: (value) => {
            if (value === 0) return "";
            return Math.round(value);
        }
    };

    // 2. Status
    const statusData = processStatusData(data, metric);
    const ctxStatus = document.getElementById('chartStatus').getContext('2d');
    chartStatusInstance = new Chart(ctxStatus, {
        type: 'bar',
        data: {
            labels: Object.keys(statusData),
            datasets: [{
                label: getMetricLabel(metric),
                data: Object.values(statusData),
                backgroundColor: '#0b4f78',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                x: { grid: { display: false } }
            },
            plugins: {
                legend: { position: 'top', align: 'end' },
                datalabels: {
                    ...commonDataLabels,
                    anchor: 'end',
                    align: 'top',
                    offset: -4,
                    color: '#0b4f78',
                    font: { weight: 'bold', size: 12 },
                    backgroundColor: 'rgba(255, 255, 255, 0.85)',
                    borderRadius: 4,
                    padding: { top: 2, bottom: 2, left: 6, right: 6 }
                }
            },
            layout: { padding: { top: 25 } },
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const idx = elements[0].index;
                    const label = chartStatusInstance.data.labels[idx];
                    if (selectedStatus === label) selectedStatus = null;
                    else selectedStatus = label;
                    applyFilters();
                }
            },
            onHover: (event, chartElement) => {
                event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
            }
        },
        plugins: [ChartDataLabels]
    });

    renderDeliveryDashboard(data);
    updateCharts(data, metric, 'individual_monthly', null);
    updateDailyChart(data, metric, null);
}

function updateCharts(data, metric, viewMode = 'individual', filterOwner = null) {
    const typeMetric = (metric === 'all') ? 'hours' : metric;
    const typeData = processTypeData(data, typeMetric);
    chartTypeInstance.data.labels = Object.keys(typeData);
    chartTypeInstance.data.datasets[0].data = Object.values(typeData);
    chartTypeInstance.update();

    if (metric === 'all') {
        const dTotal = processStatusData(data, 'hours');
        const dProj = processStatusData(data, 'hoursProject');
        const dAdm = processStatusData(data, 'hoursAdm');
        const dTrain = processStatusData(data, 'hoursTraining');
        const dDisp = processStatusData(data, 'hoursDisponivel');
        const dFerias = processStatusData(data, 'hoursFerias');
        const labels = Object.keys(dTotal).sort();
        chartStatusInstance.data.labels = labels;
        chartStatusInstance.data.datasets = [
            { label: 'Horas Totais', data: labels.map(k => dTotal[k] || 0), backgroundColor: '#0b4f78', borderRadius: 6 },
            { label: 'Horas Projeto', data: labels.map(k => dProj[k] || 0), backgroundColor: '#36A2EB', borderRadius: 6 },
            { label: 'Horas ADM', data: labels.map(k => dAdm[k] || 0), backgroundColor: '#FF9F40', borderRadius: 6 },
            { label: 'Horas Treinamento', data: labels.map(k => dTrain[k] || 0), backgroundColor: '#9d4edd', borderRadius: 6 },
            { label: 'Horas Disponível', data: labels.map(k => dDisp[k] || 0), backgroundColor: '#10b981', borderRadius: 6 },
            { label: 'Hora Férias', data: labels.map(k => dFerias[k] || 0), backgroundColor: '#FF6384', borderRadius: 6 }
        ];
    } else {
        const statusData = processStatusData(data, metric);
        const labels = Object.keys(statusData).sort();
        chartStatusInstance.data.labels = labels;
        chartStatusInstance.data.datasets = [{
            label: getMetricLabel(metric),
            data: labels.map(k => statusData[k]),
            backgroundColor: '#0b4f78',
            borderRadius: 6
        }];
    }
    chartStatusInstance.update();

    renderDeliveryDashboard(data);

    const respMetric = (metric === 'all') ? 'hours' : metric;
    if (chartResponsibleInstance) chartResponsibleInstance.destroy();
    const ctxResp = document.getElementById('chartResponsible').getContext('2d');

    const CAPACITY = 176;
    let config;

    let labels = [];
    let datasets = [];
    let overrideConfig = false;

    let dataWorked = [];
    let dataRemaining = [];
    let dataOvertime = [];
    let dataCapacity = [];

    if (viewMode === 'individual') {
        const aggData = processResponsibleAggregatedData(data, respMetric, filterOwner);
        labels = aggData.labels;

        labels.forEach((p, i) => {
            const val = aggData.datasets[0].data[i] || 0;
            const worked = val;
            const remaining = Math.max(0, CAPACITY - val);

            dataWorked.push(worked);
            dataRemaining.push(remaining);
            dataCapacity.push(CAPACITY);
        });
    } else if (viewMode === 'individual_monthly') {
        const respData = processResponsibleData(data, respMetric, filterOwner);
        labels = respData.labels;

        const capacityOverlayPlugin = {
            id: 'capacityOverlay',
            afterDatasetsDraw(chart, args, options) {
                const { ctx, scales: { x, y } } = chart;
                const meta0 = chart.getDatasetMeta(0);
                if (!meta0 || !meta0.data) return;

                meta0.data.forEach((bar, index) => {
                    const monthKey = respData.monthKeys[index];
                    if (!monthKey) return;

                    let capacity = 176;
                    const parts = monthKey.split('-');
                    if (parts.length === 2) {
                        const year = parseInt(parts[0]);
                        const monthIndex = parseInt(parts[1]) - 1;
                        capacity = getMonthlyCapacity(year, monthIndex);
                    }

                    // Coordenadas X da categoria (Mês)
                    // Precisamos cobrir toda a área do mês, não só a barra específica
                    // O método getPixelForValue dá o centro da categoria
                    // Mas como temos várias barras (pessoas), precisamos esticar a linha

                    // Uma abordagem melhor: pegar o range da categoria
                    // Mas chart.js não expõe fácil o "width" da categoria com bar chart grouped.
                    // Vamos tentar desenhar uma linha tracejada vermelha "Global" para aquele mês?
                    // Ou desenhar POR CIMA das barras daquele mês?

                    // Vamos desenhar uma linha horizontal que cobre a largura da categoria.
                    // Aproximação: x.getPixelForValue(index) é o centro.

                    // Mas espere, se temos muitas pessoas, as barras ficam finas.
                    // A linha de capacidade é PER CAPITA (por pessoa) ou TOTAL?
                    // O gráfico é "Horas Totais por Responsável vs Capacidade".
                    // Se o eixo X é Mês, e as barras são Pessoas...
                    // Cada BARRA representa UMA pessoa naquele mês.
                    // Então a capacidade de 176h (ou ajustada) se aplica a CADA BARRA INDIVIDUALMENTE.

                    // Então devemos iterar sobre TODAS as barras de TODOS os datasets
                    chart.data.datasets.forEach((dataset, datasetIndex) => {
                        const meta = chart.getDatasetMeta(datasetIndex);
                        if (meta.hidden) return;

                        const bar = meta.data[index];
                        if (!bar) return;

                        const xLeft = bar.x - bar.width / 2;
                        const xRight = bar.x + bar.width / 2;
                        const yPos = y.getPixelForValue(capacity);

                        ctx.save();
                        ctx.beginPath();
                        ctx.strokeStyle = '#DC2626';
                        ctx.lineWidth = 2;
                        ctx.setLineDash([3, 2]);
                        ctx.moveTo(xLeft - 2, yPos);
                        ctx.lineTo(xRight + 2, yPos);
                        ctx.stroke();
                        ctx.restore();
                    });
                });
            }
        };

        const palette = [
            '#3b82f6',
            '#10b981',
            '#8b5cf6',
            '#f59e0b',
            '#ec4899',
            '#06b6d4',
            '#6366f1',
            '#84cc16',
            '#d946ef',
            '#f43f5e',
            '#0ea5e9',
            '#64748b'
        ];

        respData.persons.forEach((person, idx) => {
            const baseColor = palette[idx % palette.length];
            const stackId = `stack-${idx}`;

            const workedValues = [];
            const availableValues = [];

            respData.monthKeys.forEach(mKey => {
                const key = `${mKey}|${person}`;
                const val = respData.values[key] || 0;

                let capacity = 176;
                const parts = mKey.split('-');
                if (parts.length === 2) {
                    capacity = getMonthlyCapacity(parseInt(parts[0]), parseInt(parts[1]) - 1);
                }

                const avail = Math.max(0, capacity - val);

                workedValues.push(val);
                availableValues.push(avail);
            });

            datasets.push({
                label: person,
                data: workedValues,
                backgroundColor: baseColor,
                borderRadius: 4,
                stack: stackId,
                order: 1
            });

            datasets.push({
                label: `${person} (Disp.)`,
                data: availableValues,
                backgroundColor: '#f1f5f9',
                borderColor: '#cbd5e1',
                borderWidth: 1,
                borderRadius: { topLeft: 4, topRight: 4 },
                stack: stackId,
                order: 2,
                hidden: false
            });
        });

        config = {
            type: 'bar',
            data: { labels: labels, datasets: datasets },
            plugins: [capacityOverlayPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false,
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        stacked: true,
                        grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
                        ticks: {
                            font: { size: 11, family: 'Inter, system-ui' },
                            color: '#64748B',
                            callback: function (value) { return value + 'h'; }
                        },
                        border: { display: false }
                    },
                    x: {
                        stacked: true,
                        grid: { display: false },
                        ticks: {
                            font: { size: 12, weight: '600', family: 'Inter, system-ui' },
                            color: '#334155'
                        },
                        border: { display: false }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'center',
                        labels: {
                            usePointStyle: true,
                            font: { size: 11, weight: '500' },
                            padding: 15,
                            filter: function (item, chart) {
                                return !item.text.includes('(Disp.)');
                            }
                        },
                        onHover: (e) => { e.native.target.style.cursor = 'pointer'; },
                        onLeave: (e) => { e.native.target.style.cursor = 'default'; },
                        onClick: function (e, legendItem, legend) {
                            const ci = legend.chart;
                            const clickedLabel = legendItem.text;

                            ci.data.datasets.forEach((ds, i) => {
                                if (ds.label === clickedLabel || ds.label === `${clickedLabel} (Disp.)`) {
                                    const meta = ci.getDatasetMeta(i);
                                    meta.hidden = meta.hidden === null ? !ci.data.datasets[i].hidden : null;
                                }
                            });
                            ci.update();
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        padding: 12,
                        textTransform: 'capitalize',
                        callbacks: {
                            title: (items) => `${items[0].label} - ${items[0].dataset.label.replace(' (Disp.)', '')}`,
                            label: function (context) {
                                const val = context.parsed.y || 0;
                                const personName = context.dataset.label;
                                const dataIndex = context.dataIndex;
                                const monthKey = respData.monthKeys[dataIndex];

                                let capacity = 176;
                                if (monthKey) {
                                    const parts = monthKey.split('-');
                                    if (parts.length === 2) {
                                        capacity = getMonthlyCapacity(parseInt(parts[0]), parseInt(parts[1]) - 1);
                                    }
                                }

                                const percent = capacity > 0 ? Math.round((val / capacity) * 100) : 0;

                                let labelPrefix = 'Trabalhado';
                                let displayName = personName;

                                if (personName.includes('(Disp.)')) {
                                    labelPrefix = 'Disponível';
                                    displayName = personName.replace(' (Disp.)', '');
                                }

                                return [
                                    `Colaborador: ${displayName}`,
                                    `${labelPrefix}: ${Math.round(val)}h`,
                                    `Capacidade: ${capacity}h`,
                                    `Ocupação: ${percent}%`
                                ];
                            }
                        }
                    },
                    datalabels: {
                        display: (ctx) => {
                            const labelsCount = ctx.chart.data.labels.length;
                            if (labelsCount > 6) return false;
                            const v = ctx.dataset.data[ctx.dataIndex];
                            return v > 10;
                        },
                        rotation: -90,
                        color: (ctx) => {
                            if (ctx.dataset.label.includes('(Disp.)')) return '#334155';
                            return '#fff';
                        },
                        anchor: 'center',
                        align: 'center',
                        formatter: (val) => Math.round(val),
                        font: (context) => {
                            const labelsCount = context.chart.data.labels.length;
                            return {
                                weight: '800',
                                size: labelsCount > 6 ? 9 : 11,
                                family: 'Inter, sans-serif'
                            };
                        }
                    }
                },
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        const datasetIndex = elements[0].datasetIndex;
                        const personName = chartResponsibleInstance.data.datasets[datasetIndex].label.replace(' (Disp.)', '');

                        if (personName && !personName.includes("Capacidade")) {
                            const select = document.getElementById('respSelect');
                            if (select) {
                                if (select.value === personName) {
                                    select.value = "";
                                } else {
                                    select.value = personName;
                                }
                                applyFilters();
                            }
                        }
                    }
                },
                onHover: (event, chartElement) => {
                    event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
                }
            }
        };
        overrideConfig = true;

    } else {
        const respData = processResponsibleData(data, respMetric, filterOwner);
        labels = respData.labels;

        respData.monthKeys.forEach(m => {
            let monthTotal = 0;
            respData.persons.forEach(p => {
                monthTotal += (respData.values[`${m}|${p}`] || 0);
            });

            let singleCapacity = 176;
            const parts = m.split('-');
            if (parts.length === 2) {
                singleCapacity = getMonthlyCapacity(parseInt(parts[0]), parseInt(parts[1]) - 1);
            }

            const monthCapacity = singleCapacity * respData.persons.length;
            const worked = monthTotal;
            const remaining = Math.max(0, monthCapacity - monthTotal);

            dataWorked.push(worked);
            dataRemaining.push(remaining);
            dataCapacity.push(monthCapacity);
        });

        if (!overrideConfig) {
            config = {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Horas Trabalhadas',
                            data: dataWorked,
                            backgroundColor: '#4ECDC4', // Turquesa
                            borderRadius: 4,
                            stack: 'Stack 0',
                            order: 1 // Worked at BOTTOM
                        },
                        {
                            label: 'Horas Disponíveis',
                            data: dataRemaining,
                            backgroundColor: '#E2E8F0',
                            borderRadius: { topLeft: 4, topRight: 4 },
                            borderWidth: 1,
                            borderColor: '#CBD5E1',
                            borderSkipped: 'bottom',
                            stack: 'Stack 0',
                            order: 2
                        },

                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            stacked: true,
                            grid: { color: 'rgba(0,0,0,0.05)' },
                            ticks: { callback: (v) => v + 'h' }
                        },
                        x: {
                            stacked: true,
                            grid: { display: false }
                        }
                    },
                    plugins: {
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            callbacks: {
                                label: function (context) {
                                    const label = context.dataset.label;
                                    const val = context.parsed.y;
                                    if (val < 0.1) return null;
                                    return `${label}: ${Math.round(val)}h`;
                                },
                                afterBody: function (tooltipItems) {
                                    const idx = tooltipItems[0].dataIndex;
                                    const capacity = dataCapacity[idx];
                                    return `Capacidade Total: ${Math.round(capacity)}h`;
                                }
                            }
                        },
                        datalabels: {
                            display: (ctx) => ctx.dataset.data[ctx.dataIndex] > 10,
                            color: (ctx) => ctx.datasetIndex === 1 ? '#64748b' : '#fff',
                            font: { weight: 'bold', size: 11 },
                            formatter: (v) => Math.round(v)
                        }
                    }
                }
            };
            overrideConfig = true;
        }
    }



    if (!overrideConfig) {
        config = {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Horas Excedentes',
                        data: dataOvertime,
                        backgroundColor: '#FF6B6B',
                        borderRadius: 6,
                        stack: 'Stack 0',
                        order: 1,
                        barPercentage: 0.65,
                        categoryPercentage: 0.9
                    },
                    {
                        label: 'Horas Trabalhadas',
                        data: dataWorked,
                        backgroundColor: '#4ECDC4',
                        borderRadius: 6,
                        stack: 'Stack 0',
                        order: 2,
                        barPercentage: 0.65,
                        categoryPercentage: 0.9
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        stacked: true,
                        grid: {
                            color: 'rgba(0,0,0,0.08)',
                            drawBorder: false,
                            lineWidth: 1
                        },
                        border: {
                            display: false
                        },
                        ticks: {
                            font: { size: 12, weight: '500', family: 'ui-sans-serif, system-ui' },
                            color: '#64748b',
                            padding: 10,
                            callback: function (value) {
                                return value + 'h';
                            }
                        }
                    },
                    x: {
                        stacked: true,
                        grid: { display: false },
                        border: {
                            display: false
                        },
                        ticks: {
                            autoSkip: false,
                            maxRotation: 45,
                            minRotation: 0,
                            font: { size: 12, weight: '600', family: 'ui-sans-serif, system-ui' },
                            color: '#334155',
                            padding: 8
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: {
                            usePointStyle: true,
                            pointStyle: 'circle',
                            boxWidth: 8,
                            boxHeight: 8,
                            font: { size: 12, weight: '600', family: 'ui-sans-serif, system-ui' },
                            padding: 15,
                            color: '#1e293b'
                        }
                    },
                    tooltip: {
                        enabled: true,
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(15, 23, 42, 0.96)',
                        titleFont: { size: 13, weight: '600', family: 'ui-sans-serif, system-ui' },
                        bodyFont: { size: 12, family: 'ui-sans-serif, system-ui' },
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: true,
                        callbacks: {
                            title: function (tooltipItems) {
                                return tooltipItems[0].label;
                            },
                            label: function (context) {
                                const label = context.dataset.label;
                                const val = context.parsed.y;
                                if (val === 0) return null;
                                return `${label}: ${Math.round(val)}h`;
                            },
                            afterBody: function (tooltipItems) {
                                const idx = tooltipItems[0].dataIndex;
                                const worked = dataWorked[idx] || 0;
                                const overtime = dataOvertime[idx] || 0;
                                const remaining = dataRemaining[idx] || 0;
                                const capacity = dataCapacity[idx] || 176;
                                const total = worked + overtime;

                                let lines = [];
                                lines.push('─────────────');
                                lines.push(`Total: ${Math.round(total)}h`);
                                lines.push(`Capacidade: ${Math.round(capacity)}h`);
                                if (remaining > 0) {
                                    lines.push(`Disponível: ${Math.round(remaining)}h`);
                                }
                                return lines;
                            }
                        }
                    },
                    datalabels: {
                        display: function (context) {
                            return context.dataset.data[context.dataIndex] >= 5;
                        },
                        color: '#ffffff',
                        font: {
                            weight: 'bold',
                            size: 13,
                            family: 'ui-sans-serif, system-ui'
                        },
                        formatter: (value, ctx) => {
                            if (value < 5) return "";

                            // Para cada barra, mostrar o total acumulado no topo
                            const datasetIndex = ctx.datasetIndex;
                            const dataIndex = ctx.dataIndex;

                            if (datasetIndex === 0 && dataOvertime[dataIndex] >= 5) {
                                const total = (dataWorked[dataIndex] || 0) + (dataOvertime[dataIndex] || 0);
                                return Math.round(total) + 'h';
                            } else if (datasetIndex === 1 && (dataOvertime[dataIndex] < 5)) {
                                const total = dataWorked[dataIndex] || 0;
                                return Math.round(total) + 'h';
                            }

                            return '';
                        },
                        anchor: 'end',
                        align: 'top',
                        offset: 4,
                        backgroundColor: 'rgba(15, 23, 42, 0.85)',
                        borderRadius: 4,
                        padding: { top: 4, bottom: 4, left: 8, right: 8 }
                    }
                },
                layout: {
                    padding: {
                        top: 35,
                        bottom: 5,
                        left: 5,
                        right: 5
                    }
                }
            },
            plugins: [ChartDataLabels]
        };
    }

    chartResponsibleInstance = new Chart(ctxResp, config);

    updateDailyChart(data, metric, filterOwner);
    renderHourTypeTable(data);
}

function initials(name) {
    const s = String(name || "").trim();
    if (!s) return "?";
    const parts = s.split(/\s+/).filter(Boolean);
    const a = (parts[0]?.[0] || "").toUpperCase();
    const b = (parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1]) || "";
    return (a + String(b).toUpperCase()).slice(0, 2);
}

function getMetricValue(item, metric) {
    return parseFloat(item[metric] || 0);
}

function getMetricLabel(metric) {
    if (metric === 'hours') return 'Horas Totais';
    if (metric === 'hoursAdm') return 'Horas ADM';
    if (metric === 'hoursProject') return 'Horas Projeto';
    if (metric === 'hoursTraining') return 'Horas Treinamento';
    if (metric === 'hoursDisponivel') return 'Horas Disponível';
    if (metric === 'hoursFerias') return 'Hora Férias';
    if (metric === 'all') return 'Visão Geral (Todas)';
    return 'Horas';
}

function processTypeData(data, metric) {
    const res = {};
    data.forEach(d => {
        const val = getMetricValue(d, metric);
        res[d.type] = (res[d.type] || 0) + val;
    });
    return res;
}

function processStatusData(data, metric) {
    const res = {};
    data.forEach(d => {
        const val = getMetricValue(d, metric);
        res[d.status] = (res[d.status] || 0) + val;
    });
    return res;
}

function processResponsibleData(data, metric, filterOwner = null) {
    const monthMap = new Map();
    const personSet = new Set();
    const values = {};
    const monthlyTotals = {};
    const uniquePersonsPerMonth = {};

    data.forEach(d => {
        const apontamentos = d._apontamentos || [];
        if (apontamentos.length > 0) {
            apontamentos.forEach(a => {
                const person = safeStr(a["Nome colaborador"] || a["Nome Colaborador"] || a.nome_colaborador || a.NomeColaborador || a.Colaborador || a.colaborador);
                if (!person) return;

                let val = toNumber(a.Horas || a.horas || 0);
                const tipo = safeStr(a["Tipo da hora"] || a.tipo_hora).toLowerCase();

                if (metric === 'hoursAdm' && !tipo.includes('adm')) val = 0;
                else if (metric === 'hoursProject' && (tipo.includes('adm') || tipo.includes('treinamento') || tipo.includes('disponível') || tipo.includes('disponivel') || tipo.includes('disp') || tipo.includes('férias') || tipo.includes('ferias'))) val = 0;
                else if (metric === 'hoursTraining' && !tipo.includes('treinamento')) val = 0;
                else if (metric === 'hoursDisponivel' && !(tipo.includes('disponível') || tipo.includes('disponivel') || tipo.includes('disp'))) val = 0;
                else if (metric === 'hoursFerias' && !(tipo.includes('férias') || tipo.includes('ferias'))) val = 0;

                if (val <= 0) return;

                const dateStr = a.Data || a.data;
                const dateObj = parseDate(dateStr);
                if (!dateObj) return;

                const y = dateObj.getFullYear();
                const m = dateObj.getMonth() + 1;
                const monthKey = `${y}-${String(m).padStart(2, '0')}`;

                const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                let label = `${monthNames[m - 1]}/${String(y).slice(2)}`;

                monthMap.set(monthKey, label);
                personSet.add(person);

                const key = `${monthKey}|${person}`;
                values[key] = (values[key] || 0) + val;
                monthlyTotals[monthKey] = (monthlyTotals[monthKey] || 0) + val;

                if (!uniquePersonsPerMonth[monthKey]) uniquePersonsPerMonth[monthKey] = new Set();
                uniquePersonsPerMonth[monthKey].add(person);
            });
        }
    });

    const sortedMonthKeys = [...monthMap.keys()].sort();
    const sortedPersons = [...personSet].sort();

    const monthlyCapacity = {};
    sortedMonthKeys.forEach(k => {
        monthlyCapacity[k] = 176;
    });

    return {
        monthKeys: sortedMonthKeys,
        labels: sortedMonthKeys.map(k => monthMap.get(k)),
        persons: sortedPersons,
        values: values,
        monthlyTotals,
        monthlyCapacity
    };
}


function buildResponsibleDatasets(data) {
    const datasets = data.persons.map(p => {
        const color = stringToColor(p);
        return {
            label: p,
            data: data.monthKeys.map(m => data.values[`${m}|${p}`] || 0),
            backgroundColor: color
        };
    });

    // Linha de Capacidade
    datasets.push({
        label: 'Capacidade (176h/pessoa)',
        data: data.monthKeys.map(m => data.monthlyCapacity[m] || 0),
        type: 'line',
        borderColor: '#FF6384',
        borderWidth: 2,
        pointStyle: 'line',
        fill: false,
        datalabels: { display: false }
    });

    return datasets;
}

function processResponsibleAggregatedData(data, metric, filterOwner = null) {
    // NOTA: Os apontamentos já vêm pré-filtrados por responsável em applyFilters.
    // Agregação simples por pessoa a partir dos assignments já filtrados.
    const persons = {};
    data.forEach(d => {
        // Usar assignments (já recalculados com apontamentos filtrados)
        d.assignments.forEach(a => {
            let val = 0;
            if (metric === 'hours') val = a.hoursTotal;
            else if (metric === 'hoursAdm') val = a.hoursAdm;
            else if (metric === 'hoursProject') val = a.hoursProject;
            else val = a.hoursTotal;
            persons[a.person] = (persons[a.person] || 0) + val;
        });
        if (d.assignments.length === 0 && d.owner) {
            const val = getMetricValue(d, metric);
            persons[d.owner] = (persons[d.owner] || 0) + val;
        }
    });

    const sortedPersons = Object.keys(persons).sort((a, b) => persons[b] - persons[a]);

    return {
        labels: sortedPersons,
        datasets: [{
            label: 'Total Horas',
            data: sortedPersons.map(p => persons[p]),
            backgroundColor: '#0b4f78',
            borderRadius: 4
        }]
    };
}

function buildResponsibleAggregatedDatasets(aggData) {
    return aggData.datasets;
}

function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + "00000".substring(0, 6 - c.length) + c;
}

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}


let chartDailyInstance = null;

function updateDailyChart(data, metric, filterOwner) {
    const listContainer = document.getElementById('dailyScheduleContainer');
    if (listContainer) {
        renderDailyList(data, metric, filterOwner);
        return;
    }
    const dailyData = processDailyScheduleData(data, metric, filterOwner);
    const ctx = document.getElementById('chartDailySchedule') ? document.getElementById('chartDailySchedule').getContext('2d') : null;
    if (!ctx) return;

    if (dailyData.labels.length === 0) {
        if (chartDailyInstance) {
            chartDailyInstance.data.labels = [];
            chartDailyInstance.data.datasets = [];
            chartDailyInstance.update();
        }
        return;
    }

    const config = {
        type: 'bar',
        data: {
            labels: dailyData.labels,
            datasets: dailyData.datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    title: { display: true, text: 'Horas Diárias' }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'nearest',
                    intersect: false,
                    callbacks: {
                        title: (items) => items[0].label,
                        beforeBody: (items) => {
                            // Tenta mostrar o Responsável (se houver metadado)
                            const ds = items[0].dataset;
                            if (ds.personName) return `Resp: ${ds.personName}`;
                            return '';
                        },
                        label: (ctx) => {
                            const ds = ctx.dataset;
                            if (!ds.data[ctx.dataIndex]) return null;
                            // Mostra "ID - Projeto: Xh"
                            return `${ds.label}: ${Math.round(ds.data[ctx.dataIndex] * 100) / 100}h`;
                        }
                    }
                },
                datalabels: {
                    display: (ctx) => ctx.dataset.data[ctx.dataIndex] > 2,
                    color: '#fff',
                    font: { weight: 'bold', size: 10 },
                    formatter: (v, ctx) => ctx.dataset.label.split(' ')[0],
                    textStrokeColor: 'rgba(0,0,0,0.5)',
                    textStrokeWidth: 2
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    };

    if (chartDailyInstance) {
        chartDailyInstance.destroy();
    }
    chartDailyInstance = new Chart(ctx, config);
}

function processDailyScheduleData(data, metric, filterOwner) {
    const dailyMap = new Map();
    const taskInfo = new Map();
    const allTaskIds = new Set();

    data.forEach(item => {
        const apontamentos = item._apontamentos || [];

        if (apontamentos.length > 0) {
            apontamentos.forEach(a => {
                const person = safeStr(a["Nome colaborador"] || a["Nome Colaborador"] || a.nome_colaborador || a.NomeColaborador || a.Colaborador || a.colaborador);
                if (filterOwner && person !== filterOwner) return;

                let val = toNumber(a.Horas || a.horas || 0);
                const tipo = safeStr(a["Tipo da hora"] || a.tipo_hora).toLowerCase();

                if (metric === 'hoursAdm' && !tipo.includes('adm')) val = 0;
                else if (metric === 'hoursProject' && (tipo.includes('adm') || tipo.includes('treinamento') || tipo.includes('disponível') || tipo.includes('disponivel') || tipo.includes('disp') || tipo.includes('férias') || tipo.includes('ferias'))) val = 0;
                else if (metric === 'hoursTraining' && !tipo.includes('treinamento')) val = 0;
                else if (metric === 'hoursDisponivel' && !(tipo.includes('disponível') || tipo.includes('disponivel') || tipo.includes('disp'))) val = 0;
                else if (metric === 'hoursFerias' && !(tipo.includes('férias') || tipo.includes('ferias'))) val = 0;

                if (val <= 0) return;

                const dateObj = parseDate(a.Data || a.data);
                if (!dateObj) return;

                const yKey = dateObj.getFullYear();
                const mKey = String(dateObj.getMonth() + 1).padStart(2, '0');
                const dKey = String(dateObj.getDate()).padStart(2, '0');
                const dateKey = `${yKey}-${mKey}-${dKey}`;
                const taskId = item.id;
                const taskLabel = `${item.id || '?'} - ${item.client || item.title}`;

                if (!dailyMap.has(dateKey)) dailyMap.set(dateKey, {});
                const entry = dailyMap.get(dateKey);

                entry[taskId] = (entry[taskId] || 0) + val;

                if (!taskInfo.has(taskId)) {
                    taskInfo.set(taskId, {
                        label: taskLabel,
                        color: stringToColor(item.client || item.title)
                    });
                }
                allTaskIds.add(taskId);
            });
        } else {
            // Fallback: Distribuição por data prevista (apenas se houver datas)
            const start = item.dateStart;
            const end = item.dateEnd;
            if (!start || !end) return;

            // Calcular dias úteis
            let businessDays = 0;
            let d = new Date(start);
            while (d <= end) {
                const w = d.getDay();
                if (w !== 0 && w !== 6) businessDays++;
                d.setDate(d.getDate() + 1);
            }
            if (businessDays === 0) return;

            item.assignments.forEach(assign => {
                if (filterOwner && assign.person !== filterOwner) return;

                let h = 0;
                if (metric === 'hours' || metric === 'all') h = assign.hoursTotal || 0;
                else if (metric === 'hoursAdm') h = assign.hoursAdm || 0;
                else if (metric === 'hoursProject') h = assign.hoursProject || 0;

                if (h <= 0) return;

                const dailyHours = h / businessDays;
                let curr = new Date(start);
                while (curr <= end) {
                    const w = curr.getDay();
                    if (w !== 0 && w !== 6) {
                        const yKey = curr.getFullYear();
                        const mKey = String(curr.getMonth() + 1).padStart(2, '0');
                        const dKey = String(curr.getDate()).padStart(2, '0');
                        const dateKey = `${yKey}-${mKey}-${dKey}`;
                        const taskId = item.id;
                        const taskLabel = `${item.id || '?'} - ${item.client || item.title}`;

                        if (!dailyMap.has(dateKey)) dailyMap.set(dateKey, {});
                        const entry = dailyMap.get(dateKey);

                        entry[taskId] = (entry[taskId] || 0) + dailyHours;

                        if (!taskInfo.has(taskId)) {
                            taskInfo.set(taskId, {
                                label: taskLabel,
                                color: stringToColor(item.client || item.title)
                            });
                        }
                        allTaskIds.add(taskId);
                    }
                    curr.setDate(curr.getDate() + 1);
                }
            });
        }
    });

    const sortedDates = [...dailyMap.keys()].sort();

    const uniqueTaskIds = [...allTaskIds];
    const datasets = uniqueTaskIds.map(taskId => {
        const info = taskInfo.get(taskId);
        return {
            label: info.label,
            data: sortedDates.map(date => dailyMap.get(date)[taskId] || 0),
            backgroundColor: info.color,
            borderRadius: 2
        };
    });

    const formattedLabels = sortedDates.map(dateStr => {
        const parts = dateStr.split('-');
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return formatDatePT(d, 'weekday');
    });

    return {
        labels: formattedLabels,
        datasets: datasets
    };
}

function renderDailyList(data, metric, filterOwner) {
    const listContainer = document.getElementById('dailyScheduleContainer');
    if (!listContainer) return;

    const dailySchedule = processDailyListHelper(data, metric, filterOwner);
    listContainer.innerHTML = '';

    if (Object.keys(dailySchedule).length === 0) {
        listContainer.innerHTML = '<div style="text-align:center; padding: 40px; color: #888; font-style:italic;">Nenhuma atividade encontrada para o período selecionado.</div>';
        return;
    }

    const sortedDates = Object.keys(dailySchedule).sort();

    sortedDates.forEach(dateKey => {
        const dayTasks = dailySchedule[dateKey];
        if (!dayTasks || dayTasks.length === 0) return;

        const parts = dateKey.split('-');
        const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);

        const dateFormatted = formatDatePT(dateObj, 'short');
        const weekDay = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
        const weekDayPretty = weekDay.charAt(0).toUpperCase() + weekDay.slice(1);

        const dateHeader = document.createElement('div');
        dateHeader.style.cssText = 'background-color: #f3f6f9; border-left: 5px solid #0b4f78; padding: 10px 15px; margin-top: 20px; margin-bottom: 12px; font-family: Segoe UI, sans-serif; color: #2c3e50; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.03);';

        dateHeader.innerHTML = '<div style="display:flex; align-items:baseline;"><span style="font-size: 1.2rem; font-weight: bold; margin-right: 8px;">' + dateFormatted + '</span><span style="font-size: 1rem; color: #666;">' + weekDayPretty + '</span></div><span style="font-size:0.75rem; background:#dfe6ed; color:#444; padding:3px 8px; border-radius:12px; font-weight:600;">' + dayTasks.length + ' tarefas</span>';
        listContainer.appendChild(dateHeader);

        const grid = document.createElement('div');
        grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin-bottom: 10px;';

        dayTasks.forEach(task => {
            const card = document.createElement('div');
            const stripColor = stringToColor(task.client || task.title);

            card.style.cssText = 'background: white; border: 1px solid #e1e4e8; border-left: 4px solid ' + stripColor + '; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 2px 5px rgba(0,0,0,0.03);';

            const hoursVal = Math.round(task.hours * 100) / 100;
            let typeLabel = 'PROJ';
            if (task.type === 'adm') typeLabel = 'ADM';
            else if (task.type === 'training') typeLabel = 'TREINA';
            else if (task.type === 'disponivel') typeLabel = 'DISP';

            // Usar PRP ID se disponível, senão ID interno
            const displayIdLabel = task.prpId ? `PRP - ID ${task.prpId}` : `ID ${task.id}`;

            card.innerHTML = '<div style="margin-bottom: 8px;"><div style="display:flex; justify-content:space-between; align-items:flex-start;"><span style="font-size: 0.8rem; font-weight:800; color:#0b4f78; background:#eaf4fc; padding:2px 6px; border-radius:4px;">' + displayIdLabel + '</span><span style="font-size: 0.75rem; color: #999; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">' + typeLabel + '</span></div><div style="margin-top:6px; font-weight:600; font-size: 0.95rem; color:#333; line-height:1.3;">' + (task.client || task.title) + '</div></div><div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #f0f0f0; paddingTop:8px; margin-top:4px;"><div style="display:flex; align-items:center; color:#555; font-size:0.85rem;"><i class="fas fa-user" style="margin-right:6px; color:#aaa; font-size:0.8rem;"></i><span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px;" title="' + task.person + '">' + task.person + '</span></div><div style="font-weight:bold; color:#2c3e50; font-size:1rem;">' + hoursVal + 'h</div></div>';
            grid.appendChild(card);
        });

        listContainer.appendChild(grid);
    });
}

function processDailyListHelper(data, metric, filterOwner) {
    const dates = {};

    data.forEach(item => {
        const apontamentos = item._apontamentos || [];

        if (apontamentos.length > 0) {
            apontamentos.forEach(a => {
                const person = safeStr(a["Nome colaborador"] || a["Nome Colaborador"] || a.nome_colaborador || a.NomeColaborador || a.Colaborador || a.colaborador);
                if (filterOwner && person !== filterOwner) return;

                let h = toNumber(a.Horas || a.horas || 0);
                const tipo = safeStr(a["Tipo da hora"] || a.tipo_hora).toLowerCase();

                if (metric === 'hoursAdm' && !tipo.includes('adm')) h = 0;
                else if (metric === 'hoursProject' && (tipo.includes('adm') || tipo.includes('treinamento') || tipo.includes('disponível') || tipo.includes('disponivel') || tipo.includes('disp') || tipo.includes('férias') || tipo.includes('ferias'))) h = 0;
                else if (metric === 'hoursTraining' && !tipo.includes('treinamento')) h = 0;
                else if (metric === 'hoursDisponivel' && !(tipo.includes('disponível') || tipo.includes('disponivel') || tipo.includes('disp'))) h = 0;
                else if (metric === 'hoursFerias' && !(tipo.includes('férias') || tipo.includes('ferias'))) h = 0;

                if (h <= 0) return;

                const dateObj = parseDate(a.Data || a.data);
                if (!dateObj) return;

                const yKey = dateObj.getFullYear();
                const mKey = String(dateObj.getMonth() + 1).padStart(2, '0');
                const dKey = String(dateObj.getDate()).padStart(2, '0');
                const dateKey = `${yKey}-${mKey}-${dKey}`;

                if (!dates[dateKey]) dates[dateKey] = [];
                let typeLabel = 'project';
                if (tipo.includes('adm')) typeLabel = 'adm';
                else if (tipo.includes('treinamento')) typeLabel = 'training';
                else if (tipo.includes('disponível') || tipo.includes('disponivel') || tipo.includes('disp')) typeLabel = 'disponivel';
                else if (tipo.includes('férias') || tipo.includes('ferias')) typeLabel = 'ferias';

                const prpFromApontamento = a['PRP'] || a['prp'] || item.prpId;

                dates[dateKey].push({
                    id: item.id,
                    prpId: prpFromApontamento,
                    client: item.client || item.title,
                    person: person,
                    hours: h,
                    type: typeLabel
                });
            });
        }
    });

    return dates;
}

function calculateTaskMetrics(apontamentos, taskId, index) {
    let hTotal = 0;
    let hAdm = 0;
    let hTraining = 0;
    let hDisponivel = 0;
    let hFerias = 0;
    const participantsMap = new Map();

    apontamentos.forEach((a, aIndex) => {
        const h = toNumber(
            a.Horas ||
            a.horas ||
            a.HORAS ||
            a.Hora ||
            a.hora ||
            0
        );

        // Log detalhado apenas para o primeiro apontamento da primeira tarefa
        if (index === 0 && aIndex === 0) {
        }

        hTotal += h;

        const tipo = safeStr(
            a["Tipo da hora"] ||
            a.tipo_hora ||
            a.TipoDaHora ||
            a.TipoHora ||
            a.tipo ||
            ""
        ).toLowerCase();

        if (tipo.includes("adm")) hAdm += h;
        else if (tipo.includes("treinamento")) hTraining += h;
        else if (tipo.includes("disponível") || tipo.includes("disponivel") || tipo.includes("disp")) hDisponivel += h;
        else if (tipo.includes("férias") || tipo.includes("ferias")) hFerias += h;

        const name = safeStr(
            a["Nome colaborador"] ||
            a["Nome Colaborador"] ||
            a.nome_colaborador ||
            a.NomeColaborador ||
            a.Colaborador ||
            a.colaborador ||
            a.nome ||
            a.Nome ||
            ""
        );

        if (name) {
            if (!participantsMap.has(name)) {
                participantsMap.set(name, {
                    name,
                    hours: 0,
                    hoursProject: 0,
                    hoursAdm: 0,
                    hoursTraining: 0,
                    hoursDisponivel: 0,
                    hoursFerias: 0,
                    roles: new Set()
                });
            }
            const p = participantsMap.get(name);
            p.hours += h;
            if (tipo.includes("adm")) p.hoursAdm += h;
            else if (tipo.includes("treinamento")) p.hoursTraining += h;
            else if (tipo.includes("disponível") || tipo.includes("disponivel") || tipo.includes("disp")) p.hoursDisponivel += h;
            else if (tipo.includes("férias") || tipo.includes("ferias")) p.hoursFerias += h;
            else p.hoursProject += h;

            const role = safeStr(
                a.Responsabilidades ||
                a.responsabilidade ||
                a.responsabilidades ||
                a.Responsabilidade ||
                a.papel ||
                a.Papel ||
                ""
            );
            if (role) p.roles.add(role);
        }
    });

    const assignments = [...participantsMap.values()].map(p => ({
        person: p.name,
        role: [...p.roles].join("/") || "Colaborador",
        hoursTotal: p.hours,
        hoursProject: p.hoursProject,
        hoursAdm: p.hoursAdm,
        hoursTraining: p.hoursTraining,
        hoursDisponivel: p.hoursDisponivel,
        hoursFerias: p.hoursFerias
    }));

    const hProject = Math.max(0, hTotal - hAdm - hTraining - hDisponivel - hFerias);

    return {
        hoursProject: hProject,
        hoursAdm: hAdm,
        hoursTraining: hTraining,
        hoursDisponivel: hDisponivel,
        hoursFerias: hFerias,
        assignments: assignments
    };
}

function getPeriodDateRange(period, customStartStr, customEndStr) {
    let start = null;
    let end = null;

    // TODAY global já existe no arquivo
    const y = TODAY.getFullYear();
    const m = TODAY.getMonth(); // 0-indexed
    const d = TODAY.getDate();

    if (period === 'quarterly') {
        // Visão Trimestral: Mês Atual + 3 meses para frente (Total ~4 meses)
        start = new Date(y, m, 1, 0, 0, 0); // Inicio deste mês
        end = new Date(y, m + 4, 0, 23, 59, 59); // Fim do (mês + 3)
    }
    else if (period === 'total') {
        // Visão Total: Sem limites (ou limites extremos)
        start = null;
        end = null;
    }
    else if (period === 'month') {
        // Visão Mensal: Este Mês
        start = new Date(y, m, 1, 0, 0, 0);
        end = new Date(y, m + 1, 0, 23, 59, 59);
    }
    else if (period === 'custom') {
        if (customStartStr) start = new Date(customStartStr + 'T00:00:00');
        if (customEndStr) end = new Date(customEndStr + 'T23:59:59');
    }
    // 'future_6' e 'all' retornam null para indicar "sem filtro de apontamentos"
    // (future_6 filtra por data da tarefa, não dos apontamentos, pois são futuros)

    return { start, end };
}

// =========================================================
// DELIVERY DASHBOARD (Timeline de Entregas & Prazos)
// =========================================================

function renderDeliveryDashboard(data) {
    const container = document.getElementById('deliveryDashboard');
    if (!container) return;

    // Organizar tarefas por categoria de prazo
    const overdue = [];
    const today = [];
    const upcoming = [];

    const todayStart = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
    const todayEnd = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate(), 23, 59, 59);

    data.forEach(task => {
        const deadline = task.date || task.dateEnd;
        if (!deadline) return; // Pular tarefas sem prazo

        const isDone = task.status === 'Concluída' || task.status === 'Cancelada';
        if (isDone) return; // Não mostrar tarefas concluídas/canceladas

        const deadlineTime = deadline.getTime();
        const todayStartTime = todayStart.getTime();
        const todayEndTime = todayEnd.getTime();

        if (deadlineTime < todayStartTime) {
            overdue.push(task);
        } else if (deadlineTime >= todayStartTime && deadlineTime <= todayEndTime) {
            today.push(task);
        } else {
            upcoming.push(task);
        }
    });

    // Ordenar por data
    const sortByDate = (a, b) => {
        const dateA = a.date || a.dateEnd || new Date(0);
        const dateB = b.date || b.dateEnd || new Date(0);
        return dateA - dateB;
    };

    overdue.sort(sortByDate);
    today.sort(sortByDate);
    upcoming.sort(sortByDate);

    // Renderizar HTML
    let html = '';

    // Função helper para criar card de tarefa
    const createTaskCard = (task, category) => {
        const deadline = task.date || task.dateEnd;
        const startDate = task.dateStart;
        const deadlineStr = deadline ? formatDatePT(deadline, 'medium') : '—';
        const startDateStr = startDate ? formatDatePT(startDate, 'medium') : '—';

        // O título deve ser o nome do cliente (vem da API de apontamentos)
        const clientName = task.client || 'Cliente não informado';

        // A demanda/descrição fica como subtítulo
        const demandTitle = task.title || '';

        const owners = task.owner || 'Sem responsável';
        const prpId = task.prpId || task.id || '';

        return `
            <div class="delivery-item ${category}">
                <div class="status-line"></div>
                <div class="delivery-content">
                    <div class="delivery-title">${clientName}</div>
                    ${demandTitle ? `<div class="delivery-meta" style="font-size: 13px; color: #64748b; margin-top: 2px;">${demandTitle}</div>` : ''}
                    <div class="delivery-responsibles" style="font-size: 12px; color: #64748b; margin-top: 4px;">
                        Resp: ${owners}
                    </div>
                </div>
                <div class="delivery-info">
                    <div class="delivery-date-group">
                        <span class="date-label">INÍCIO</span>
                        <span class="date-value">${startDateStr}</span>
                    </div>
                    <div class="delivery-date-group">
                        <span class="date-label">PRAZO</span>
                        <span class="date-value ${category === 'overdue' ? 'alert' : ''}">${deadlineStr}</span>
                    </div>
                </div>
            </div>
        `;
    };

    // Seção: Vencidos
    if (overdue.length > 0) {
        html += `
            <div class="dashboard-section">
                <div class="section-header overdue">
                    <span>⚠️ Vencidos (${overdue.length})</span>
                </div>
                ${overdue.map(task => createTaskCard(task, 'overdue')).join('')}
            </div>
        `;
    }

    // Seção: Hoje
    if (today.length > 0) {
        html += `
            <div class="dashboard-section">
                <div class="section-header today">
                    <span>📅 Hoje (${today.length})</span>
                </div>
                ${today.map(task => createTaskCard(task, 'today')).join('')}
            </div>
        `;
    }

    // Seção: Próximos (limitar a 20 para não sobrecarregar)
    if (upcoming.length > 0) {
        const upcomingLimited = upcoming.slice(0, 20);
        html += `
            <div class="dashboard-section">
                <div class="section-header upcoming">
                    <span>📆 Próximos (${upcoming.length})</span>
                </div>
                ${upcomingLimited.map(task => createTaskCard(task, 'upcoming')).join('')}
                ${upcoming.length > 20 ? `<div style="text-align: center; padding: 10px; color: #94a3b8; font-size: 12px;">... e mais ${upcoming.length - 20} tarefas</div>` : ''}
            </div>
        `;
    }

    // Se não houver nenhuma tarefa
    if (overdue.length === 0 && today.length === 0 && upcoming.length === 0) {
        html = '<div class="empty-state">Nenhuma tarefa com prazo definido encontrada</div>';
    }

    container.innerHTML = html;
}
