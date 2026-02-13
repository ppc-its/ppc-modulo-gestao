/* =========================
   PPC Task Board - Gráficos
   Filtros Interativos & Visualização
   ========================= */

// Cores do tema do CSS
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

// Feriados Nacionais (Brasil) - Formato YYYY-MM-DD
// Inclui Carnaval, Corpus Christi e Fixos
const HOLIDAYS = [
    // 2024
    '2024-01-01', // Confraternização
    '2024-02-12', // Carnaval
    '2024-02-13', // Carnaval
    '2024-03-29', // Paixão de Cristo
    '2024-04-21', // Tiradentes
    '2024-05-01', // Trabalho
    '2024-05-30', // Corpus Christi
    '2024-09-07', // Independência
    '2024-10-12', // Padroeira
    '2024-11-02', // Finados
    '2024-11-15', // Proclamação
    '2024-11-20', // Consciência Negra
    '2024-12-25', // Natal

    // 2025
    '2025-01-01',
    '2025-03-03', // Carnaval
    '2025-03-04', // Carnaval
    '2025-04-18', // Paixão
    '2025-04-21',
    '2025-05-01',
    '2025-06-19', // Corpus
    '2025-09-07',
    '2025-10-12',
    '2025-11-02',
    '2025-11-15',
    '2025-11-20',
    '2025-12-25'
];

function getMonthlyCapacity(year, month) {
    // month é 0-indexed (0=Jan)
    let d = new Date(year, month, 1);
    let businessDays = 0;

    while (d.getMonth() === month) {
        const day = d.getDay();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dayStr = String(d.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${dayStr}`;

        // Segunda(1) a Sexta(5)
        if (day !== 0 && day !== 6) {
            // Verifica se é feriado
            if (!HOLIDAYS.includes(dateStr)) {
                businessDays++;
            }
        }
        d.setDate(d.getDate() + 1);
    }
    return businessDays * 8;
}

// ROLE_MAPPINGS REMOVIDO (Não utilizamos mais CSV1 para atribuições)


// Instâncias Globais de Gráficos
let chartTypeInstance = null;
let chartStatusInstance = null;
// chartTimelineInstance REMOVIDO
let chartResponsibleInstance = null;
let selectedHourType = null; // Nova variável de estado para a tabela de tipos de horas
let APP_DATA = []; // Manterá os dados carregados
const LOCAL_STORAGE_KEY = "ppc_task_board_data_v1";

// "Hoje" fixo para consistência (ou usar data real?)
const TODAY = new Date();

document.addEventListener("DOMContentLoaded", () => {
    init();
});

// Registrar plugin se disponível
if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
}

async function init() {
    try {
        await loadData();
        populateFilters();
        // Inicializar com métrica padrão 'all' (Todas as Visões)
        document.getElementById('metricSelect').value = 'all';
        initCharts(APP_DATA, 'all');
        setupEventListeners();
    } catch (e) {
        console.error("Erro na inicialização dos gráficos:", e);
    } finally {
        // Esconder o loader
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
    console.log("🔄 [Graphs] Iniciando carregamento de dados via API...");
    try {
        // 1. Busca os dados da API (Tarefas e Apontamentos)
        const [tasksData, apontamentosData] = await Promise.all([
            api.getTasks(),
            api.getApontamentos()
        ]);

        console.log(`📊 [Graphs] API retornou ${tasksData?.length || 0} tarefas e ${apontamentosData?.length || 0} apontamentos`);
        console.log("📋 [Graphs] Amostra de tarefa:", tasksData?.[0]);
        console.log("📋 [Graphs] Amostra de apontamento:", apontamentosData?.[0]);

        // 2. Mescla os dados
        const merged = mergeData(tasksData, apontamentosData);
        console.log(`🔗 [Graphs] Merge concluído. ${merged.length} tarefas com apontamentos anexados`);
        console.log("📋 [Graphs] Amostra de tarefa mesclada:", merged?.[0]);
        console.log("📋 [Graphs] Apontamentos na primeira tarefa:", merged?.[0]?._apontamentos?.length || 0);

        // 3. Processa para o formato dos gráficos
        APP_DATA = processTasks(merged);

        console.log(`✅ [Graphs] ${APP_DATA.length} tarefas processadas com sucesso`);
        console.log("📋 [Graphs] Amostra de tarefa processada:", APP_DATA?.[0]);

        // Validação de dados
        const tasksWithHours = APP_DATA.filter(t => t.hours > 0);
        const tasksWithAssignments = APP_DATA.filter(t => t.assignments && t.assignments.length > 0);
        console.log(`📈 [Graphs] Estatísticas: ${tasksWithHours.length} tarefas com horas, ${tasksWithAssignments.length} tarefas com atribuições`);

    } catch (e) {
        console.error("❌ [Graphs] Erro ao carregar dados da API:", e);
        console.error("Stack trace:", e.stack);
        APP_DATA = [];
    }
}

function mergeData(tasksList, apontamentosList) {
    if (!Array.isArray(tasksList)) {
        console.warn("⚠️ [Graphs] tasksList não é um array:", tasksList);
        return [];
    }
    if (!Array.isArray(apontamentosList)) {
        console.warn("⚠️ [Graphs] apontamentosList não é um array, retornando tarefas sem apontamentos");
        return tasksList.map(t => ({ ...t, _apontamentos: [] }));
    }

    console.log(`🔗 [Graphs] Iniciando merge de ${tasksList.length} tarefas com ${apontamentosList.length} apontamentos`);

    // Debug: Verificar se há campos com espaços
    if (apontamentosList.length > 0) {
        const firstApontamento = apontamentosList[0];
        const fieldsWithSpaces = Object.keys(firstApontamento).filter(k => k !== k.trim());
        if (fieldsWithSpaces.length > 0) {
            console.warn(`⚠️ [Graphs] ATENÇÃO: API retorna campos com espaços extras:`, fieldsWithSpaces);
            console.warn(`⚠️ [Graphs] Exemplo: "${fieldsWithSpaces[0]}" vs "${fieldsWithSpaces[0].trim()}"`);
        }
    }

    // Criar mapa de apontamentos agrupados por ID da demanda
    const map = new Map();
    let apontamentosComId = 0;
    let apontamentosSemId = 0;

    apontamentosList.forEach(a => {
        // Tentar múltiplas variações de campo de ID
        // CRÍTICO: A API retorna "DemandaId " COM ESPAÇO NO FINAL!
        const key = String(
            a["DemandaId "] ||  // ← COM ESPAÇO (bug da API)
            a.DemandaId ||
            a.demanda_id ||
            a.demandaId ||
            a.demanda_Id ||
            a.id ||
            a.ID ||
            ""
        ).trim();

        if (key) {
            apontamentosComId++;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(a);
        } else {
            apontamentosSemId++;
            console.warn('⚠️ [Graphs] Apontamento sem ID válido:', a);
        }
    });

    console.log(`📊 [Graphs] Apontamentos: ${apontamentosComId} com ID, ${apontamentosSemId} sem ID`);
    console.log(`📊 [Graphs] IDs únicos de demandas nos apontamentos:`, [...map.keys()]);

    // Anexar apontamentos às tarefas
    let tasksComApontamentos = 0;
    let tasksSemApontamentos = 0;

    const result = tasksList.map(task => {
        // Tentar múltiplas variações de campo de ID da tarefa
        const taskId = String(
            task.id ||
            task.ID ||
            task["ID"] ||
            task.Id ||
            ""
        ).trim();

        const apontamentos = map.has(taskId) ? map.get(taskId) : [];

        if (apontamentos.length > 0) {
            tasksComApontamentos++;
        } else {
            tasksSemApontamentos++;
        }

        return {
            ...task,
            _apontamentos: apontamentos
        };
    });

    console.log(`✅ [Graphs] Merge concluído: ${tasksComApontamentos} tarefas COM apontamentos, ${tasksSemApontamentos} tarefas SEM apontamentos`);

    return result;
}

/**
 * Lógica de processamento atualizada para usar Apontamentos Reais
 * GARANTIA: Todos os dados são processados 100% a partir dos apontamentos da API
 */
function processTasks(tasks) {
    console.log(`🔄 [Graphs] Processando ${tasks.length} tarefas...`);

    let tasksWithApontamentos = 0;
    let tasksWithoutApontamentos = 0;
    let totalApontamentos = 0;

    const processed = tasks.map((t, index) => {
        const raw = t.raw || t;
        const apontamentos = t._apontamentos || [];

        if (apontamentos.length > 0) {
            tasksWithApontamentos++;
            totalApontamentos += apontamentos.length;
        } else {
            tasksWithoutApontamentos++;
        }

        // Calcular somas de horas dos apontamentos
        let hTotal = 0;
        let hAdm = 0;
        const participantsMap = new Map();

        apontamentos.forEach((a, aIndex) => {
            // Tentar múltiplas variações do campo de horas
            const h = toNumber(
                a.Horas ||
                a.horas ||
                a.HORAS ||
                a.Hora ||
                a.hora ||
                0
            );

            // Log detalhado de cada apontamento
            if (index === 0 && aIndex === 0) {
                console.log(`📋 [Graphs] Exemplo de apontamento completo:`, a);
                console.log(`📋 [Graphs] Campos disponíveis:`, Object.keys(a));
            }

            if (h === 0) {
                console.warn(`⚠️ [Graphs] Apontamento sem horas na tarefa ${t.id}:`, a);
            }

            hTotal += h;

            // Tentar múltiplas variações do campo tipo
            const tipo = safeStr(
                a["Tipo da hora"] ||
                a.tipo_hora ||
                a.TipoDaHora ||
                a.TipoHora ||
                a.tipo ||
                ""
            ).toLowerCase();

            if (tipo.includes("adm")) hAdm += h;

            // Tentar múltiplas variações do campo nome do colaborador
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
                        roles: new Set()
                    });
                }
                const p = participantsMap.get(name);
                p.hours += h;
                if (tipo.includes("adm")) p.hoursAdm += h;
                else p.hoursProject += h;

                // Tentar múltiplas variações do campo responsabilidades
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
            } else {
                console.warn(`⚠️ [Graphs] Apontamento sem nome de colaborador na tarefa ${t.id}:`, a);
            }
        });

        // Formatar assinaturas para o padrão do gráfico
        const assignments = [...participantsMap.values()].map(p => ({
            person: p.name,
            role: [...p.roles].join("/") || "Colaborador",
            hoursTotal: p.hours,
            hoursProject: p.hoursProject,
            hoursAdm: p.hoursAdm
        }));

        const hProject = Math.max(0, hTotal - hAdm);

        // Datas - tentar múltiplas variações
        const dateStartStr =
            raw["Data Início (Previsão)"] ||
            raw["data_inicio"] ||
            raw.data_inicio ||
            raw.DataInicio ||
            "";

        const dateEndStr =
            raw["Data Conclusão (Previsão)"] ||
            raw["data_conclusao"] ||
            raw.data_conclusao ||
            raw.DataConclusao ||
            "";

        // ID da tarefa - tentar múltiplas variações
        const taskId =
            t.id ||
            raw["ID"] ||
            raw["id"] ||
            raw.Id ||
            raw.ID ||
            "";

        // Cliente - tentar múltiplas variações
        const client =
            raw["Nome Cliente"] ||
            raw.nome_cliente ||
            raw.NomeCliente ||
            raw.cliente ||
            raw.Cliente ||
            t.title ||
            "Sem Cliente";

        // Título/Escopo - tentar múltiplas variações
        const title =
            t.title ||
            raw["Detalhe da demanda (Escopo)"] ||
            raw.detalhe ||
            raw.Detalhe ||
            raw.escopo ||
            raw.Escopo ||
            "Demanda";

        // Responsável - tentar múltiplas variações
        // Responsável - Somente via Apontamentos (assignments)
        const owner = assignments.map(a => a.person).join(", ") || "Sem Responsável";

        // Tipo - tentar múltiplas variações
        const type =
            t.demandType ||
            raw["Tipo de Demanda"] ||
            raw.tipo ||
            raw.Tipo ||
            "OUTROS";

        // Status - tentar múltiplas variações
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
            get hours() { return (this.hoursProject || 0) + (this.hoursAdm || 0); },
            dateStart: parseDate(dateStartStr),
            dateEnd: parseDate(dateEndStr),
            get date() { return this.dateEnd || new Date(); },
            raw: raw,
            _apontamentos: apontamentos, // Preservar para uso posterior
            prpId: raw["ID - PRP (RentSoft)"] || "" // Extrair PRP ID
        };

        return result;
    });

    console.log(`✅ [Graphs] Processamento concluído:`);
    console.log(`   - ${tasksWithApontamentos} tarefas COM apontamentos`);
    console.log(`   - ${tasksWithoutApontamentos} tarefas SEM apontamentos`);
    console.log(`   - ${totalApontamentos} apontamentos processados no total`);

    // Estatísticas adicionais
    const totalHours = processed.reduce((sum, t) => sum + t.hours, 0);
    const totalAdmHours = processed.reduce((sum, t) => sum + t.hoursAdm, 0);
    const totalProjectHours = processed.reduce((sum, t) => sum + t.hoursProject, 0);
    const totalAssignments = processed.reduce((sum, t) => sum + (t.assignments?.length || 0), 0);
    const uniquePeople = new Set();
    processed.forEach(t => t.assignments.forEach(a => uniquePeople.add(a.person)));

    console.log(`📊 [Graphs] Horas totais: ${totalHours.toFixed(2)}h (${totalProjectHours.toFixed(2)}h projeto + ${totalAdmHours.toFixed(2)}h ADM)`);
    console.log(`📊 [Graphs] Atribuições: ${totalAssignments} atribuições para ${uniquePeople.size} pessoas únicas`);
    console.log(`📊 [Graphs] Pessoas encontradas:`, [...uniquePeople].sort());

    return processed;
}


function parseDate(dateStr) {
    if (!dateStr) return null;

    // A API retorna datas no formato DD/MM/YYYY
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);

        // Criar data usando o construtor local para evitar deslocamentos de fuso horário (UTC)
        // Mês é 0-indexado em JS
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

/**
 * Formata data para exibição em português
 * @param {Date|string} date - Data para formatar
 * @param {string} format - 'short' (02/03), 'medium' (02/03/2026), 'long' (02 de março de 2026), 'full' (02/03/2026 seg)
 * @returns {string} Data formatada
 */
function formatDatePT(date, format = 'medium') {
    if (!date) return '';

    // Se for string, fazer parse primeiro
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


/**
 * Preenche opções do 'Select' baseado em APP_DATA
 */
function populateFilters() {
    const clientSet = new Set();
    const ownerSet = new Set();

    APP_DATA.forEach(item => {
        if (item.client) clientSet.add(item.client);

        // Collect names from assignments
        item.assignments.forEach(a => {
            if (a.person) ownerSet.add(a.person);
        });
    });

    const clientSelect = document.getElementById('clientSelect');
    // ordenar alfabeticamente
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
    // Filtros automáticos (change)
    const filterIds = [
        'periodSelect', 'clientSelect', 'respSelect',
        'respViewSelect', 'metricSelect', 'deadlineSelect',
        'startDate', 'endDate' // Added date inputs
    ];
    filterIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => {
            // Logic to show/hide custom date container
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

    // Check dropdowns too
    const client = document.getElementById('clientSelect').value;
    const owner = document.getElementById('respSelect').value;

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

// Global functions for banner onclick
window.clearStatusFilter = function () {
    selectedStatus = null;
    applyFilters();
};

window.clearTypeFilter = function () {
    selectedType = null;
    applyFilters();
};

function resetFilters() {
    document.getElementById('periodSelect').value = "90";
    document.getElementById('customDateContainer').style.display = 'none'; // Hide on reset
    document.getElementById('startDate').value = "";
    document.getElementById('endDate').value = "";
    document.getElementById('clientSelect').value = "";
    document.getElementById('respSelect').value = "";
    document.getElementById('metricSelect').value = "all";
    document.getElementById('deadlineSelect').value = "all";
    document.getElementById('respViewSelect').value = "individual_monthly";

    selectedStatus = null;
    selectedType = null;

    applyFilters();
}

function applyFilters() {
    const period = document.getElementById('periodSelect').value;
    const client = document.getElementById('clientSelect').value;
    const owner = document.getElementById('respSelect').value;
    const metric = document.getElementById('metricSelect').value; // hours, hoursProject, hoursAdm
    const deadline = document.getElementById('deadlineSelect').value; // all, ontime, overdue
    const viewMode = document.getElementById('respViewSelect').value; // individual, aggregated

    // Custom Dates
    const startStr = document.getElementById('startDate').value;
    const endStr = document.getElementById('endDate').value;

    // Render Banner
    renderFilterBanner();

    // Parse custom dates (start of day / end of day)
    let customStart = startStr ? new Date(startStr + 'T00:00:00') : null;
    let customEnd = endStr ? new Date(endStr + 'T23:59:59') : null;

    let filtered = APP_DATA.filter(item => {
        // Filtro Interativo (Status)
        if (selectedStatus && item.status !== selectedStatus) return false;
        // Filtro Interativo (Tipo)
        if (selectedType && item.type !== selectedType) return false;

        // Filtro de Cliente
        if (client && item.client !== client) return false;
        // Filtro de Responsável
        // Filtro de Responsável (Multi-função)
        if (owner) {
            const p = owner.toLowerCase();
            // Verifica se QUALQUER atribuição corresponde
            const match = item.assignments.some(a => a.person.toLowerCase().includes(p));
            if (!match) return false;
        }

        // Lógica de Data para Período
        const itemDate = item.date || new Date(); // Fallback para ordenação

        if (period === '30') {
            const diffTime = Math.abs(TODAY - itemDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > 30) return false;
        } else if (period === '90') {
            const diffTime = Math.abs(TODAY - itemDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > 90) return false;
        } else if (period === 'future_6') {
            // Futuro: Data >= Hoje (Inicio do Dia) E Data <= Hoje + 6 Meses
            const futureDate = new Date(TODAY);
            futureDate.setMonth(futureDate.getMonth() + 6);

            // Aceitar se data do item for maior ou igual a hoje (ignora horas)
            const itemTime = itemDate.getTime();
            const todayTime = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate()).getTime();

            if (itemTime < todayTime) return false;
            if (itemDate > futureDate) return false;
        } else if (period === 'month') {
            if (itemDate.getMonth() !== TODAY.getMonth() || itemDate.getFullYear() !== TODAY.getFullYear()) return false;
        } else if (period === 'year') {
            if (itemDate.getFullYear() !== TODAY.getFullYear()) return false;
        } else if (period === 'custom') {
            // IMPORTANTE: Filtrar por datas dos APONTAMENTOS, não pela data da tarefa
            if (customStart || customEnd) {
                // Verificar se a tarefa tem pelo menos um apontamento dentro do período
                const hasAppointmentInRange = (item._apontamentos || []).some(a => {
                    const appointmentDateStr = a.Data || a.data;
                    if (!appointmentDateStr) return false;

                    const appointmentDate = parseDate(appointmentDateStr);
                    if (!appointmentDate) return false;

                    // Verificar se a data do apontamento está dentro do range
                    if (customStart && appointmentDate < customStart) return false;
                    if (customEnd && appointmentDate > customEnd) return false;

                    return true; // Apontamento está dentro do período
                });

                // Se não houver apontamentos no período, filtrar a tarefa
                if (!hasAppointmentInRange) return false;
            }
        }

        // Deadline Logic
        if (deadline !== 'all') {
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
}

function renderHourTypeTable(data) {
    const tbody = document.querySelector('#hourTypeSummaryTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // 1. Calcular Totais
    let totalProject = 0;
    let totalAdm = 0;

    data.forEach(d => {
        totalProject += (d.hoursProject || 0);
        totalAdm += (d.hoursAdm || 0);
    });

    const grandTotal = totalProject + totalAdm;

    // Helper para criar linha
    const createRow = (typeId, label, val, color) => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.style.borderBottom = '1px solid #eee';

        // Highlight se selecionado
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
            // Toggle logic
            if (selectedHourType === typeId) {
                selectedHourType = null;
                // Se toggle off, e tiver filtro global, voltar para 'all' automático? 
                // Melhor: se toggle off, voltar para o estado automático
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

    // Adicionar Total Geral
    const trTotal = document.createElement('tr');
    trTotal.style.fontWeight = 'bold';
    trTotal.style.backgroundColor = '#fafafa';
    trTotal.style.cursor = 'pointer';

    // Total também clícavel para "Ver Tudo" explicitamente
    trTotal.onclick = () => {
        // Toggle logic for Total
        if (selectedHourType === 'all') {
            selectedHourType = null; // Reset
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

    // LÓGICA DE EXIBIÇÃO AUTOMÁTICA
    // Se o usuário selecionou uma linha na tabela (project, adm, all), mostramos isso (tem prioridade).
    if (selectedHourType) {
        renderHourTypeDetails(selectedHourType, data);
    }
    // Se NÃO selecionou nada na tabela, mas tem filtros globais (Gráfico clicado), mostramos 'all' automaticamente
    else if (selectedStatus || selectedType) {
        renderHourTypeDetails('all', data);
    }
    else {
        // Estado inicial "Limpo" - Ocultar detalhes para evitar poluição visual
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

    // Atualizar Título
    let label = 'Todos os Tipos';
    if (type === 'project') label = 'Horas Projeto';
    else if (type === 'adm') label = 'Horas ADM';
    else if (type === 'all') label = 'Visão Detalhada por Tipo';

    // Se houver filtros globais, adiciona ao título
    if (selectedStatus) label += ` (Status: ${selectedStatus})`;
    if (selectedType) label += ` (Tipo: ${selectedType})`;

    detailTitle.textContent = `Detalhamento: ${label}`;
    detailTitle.style.display = 'block';

    // 1. Filtrar dados - AGORA DIVIDINDO PROJETO vs ADM
    const items = [];

    data.forEach(task => {
        // Se type for 'all', verificamos AMBOS
        // Se type for 'project', só verificamos project
        // Se type for 'adm', só verificamos adm

        // Check Project Hours
        if (type === 'all' || type === 'project') {
            const val = task.hoursProject || 0;
            if (val > 0.01) {
                items.push({
                    client: task.client,
                    title: task.type,
                    owner: task.owner,
                    hours: val,
                    typeLabel: 'PROJETO',
                    typeColor: '#36A2EB',
                    bg: '#eef8ff'
                });
            }
        }

        // Check ADM Hours
        if (type === 'all' || type === 'adm') {
            const val = task.hoursAdm || 0;
            if (val > 0.01) {
                items.push({
                    client: task.client,
                    title: task.type,
                    owner: task.owner,
                    hours: val,
                    typeLabel: 'ADM',
                    typeColor: '#FF9F40',
                    bg: '#fff8f3'
                });
            }
        }
    });

    // 2. Ordenar por horas descrescente
    items.sort((a, b) => b.hours - a.hours);

    // 3. Renderizar
    if (items.length === 0) {
        detailTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px; color: #888;">Nenhum registro encontrado para esta seleção.</td></tr>';
        return;
    }

    items.forEach(item => {
        const tr = document.createElement('tr');
        // tr.style.backgroundColor = item.bg; // Opcional: cor de fundo sutil

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
            <td style="padding: 8px; font-size: 0.9em; color: #64748b;">${item.owner}</td>
            <td style="padding: 8px; text-align: right; font-weight: bold; font-family: monospace; color: ${item.typeColor};">
                ${item.hours.toFixed(2)}h
            </td>
        `;
        detailTbody.appendChild(tr);
    });
}

function initCharts(data, metric) {
    // 1. Tipo de Demanda
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
                    if (selectedStatus === label) selectedStatus = null; // Toggle
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

    // 3. Renderização Inicial do Dashboard de Entregas
    renderDeliveryDashboard(data);

    // 4. Responsável vs Capacidade (Delegado para updateCharts para consistência)
    updateCharts(data, metric, 'individual_monthly', null);

    // 5. Cronograma Diário (Inicialização)
    updateDailyChart(data, metric, null);
}

function updateCharts(data, metric, viewMode = 'individual', filterOwner = null) {
    // 1. Tipo
    const typeMetric = (metric === 'all') ? 'hours' : metric;
    const typeData = processTypeData(data, typeMetric);
    chartTypeInstance.data.labels = Object.keys(typeData);
    chartTypeInstance.data.datasets[0].data = Object.values(typeData);
    chartTypeInstance.update();

    // 2. Status
    if (metric === 'all') {
        const dTotal = processStatusData(data, 'hours');
        const dProj = processStatusData(data, 'hoursProject');
        const dAdm = processStatusData(data, 'hoursAdm');
        const dTrain = processStatusData(data, 'hoursTraining');
        const labels = Object.keys(dTotal).sort();
        chartStatusInstance.data.labels = labels;
        chartStatusInstance.data.datasets = [
            { label: 'Horas Totais', data: labels.map(k => dTotal[k]), backgroundColor: '#0b4f78', borderRadius: 6 },
            { label: 'Horas Projeto', data: labels.map(k => dProj[k]), backgroundColor: '#36A2EB', borderRadius: 6 },
            { label: 'Horas ADM', data: labels.map(k => dAdm[k]), backgroundColor: '#FF9F40', borderRadius: 6 },
            { label: 'Horas Treinamento', data: labels.map(k => dTrain[k]), backgroundColor: '#9d4edd', borderRadius: 6 }
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

    // 3. Atualizar Dashboard de Entregas
    renderDeliveryDashboard(data);

    // 4. Responsável vs Capacidade
    const respMetric = (metric === 'all') ? 'hours' : metric;
    if (chartResponsibleInstance) chartResponsibleInstance.destroy();
    const ctxResp = document.getElementById('chartResponsible').getContext('2d');

    // === Lógica de Exibição Baseada em ViewMode ===
    // viewMode controla a agregação:
    // - 'individual': Mostra cada pessoa como uma barra separada (X = Pessoas)
    // - 'aggregated': Mostra consolidação temporal de todas as pessoas (X = Tempo)

    const CAPACITY = 176;
    let config;

    let labels = [];
    let datasets = []; // Usado para Custom Config
    let overrideConfig = false;

    let dataWorked = [];
    let dataRemaining = [];
    let dataOvertime = [];
    let dataCapacity = [];

    if (viewMode === 'individual') {
        // --- VISÃO INDIVIDUAL (Cada Pessoa = Uma Barra) ---
        // X-axis: Pessoas, Y-axis: Horas (stacked: Worked/Remaining/Overtime)
        const aggData = processResponsibleAggregatedData(data, respMetric, filterOwner);
        labels = aggData.labels;

        labels.forEach((p, i) => {
            const val = aggData.datasets[0].data[i] || 0;
            const worked = Math.min(val, CAPACITY);
            const remaining = Math.max(0, CAPACITY - val);
            const overtime = Math.max(0, val - CAPACITY);

            dataWorked.push(worked);
            dataRemaining.push(remaining);
            dataOvertime.push(overtime);
            dataCapacity.push(CAPACITY);
        });
    } else if (viewMode === 'individual_monthly') {
        // --- VISÃO INDIVIDUAL MENSAL (X = Meses, Barras = Pessoas) ---
        const respData = processResponsibleData(data, respMetric, filterOwner);
        labels = respData.labels; // Meses no Eixo X

        // Plugin para desenhar linhas de capacidade dinâmica (baseado no Mês do Eixo X)
        const capacityOverlayPlugin = {
            id: 'capacityOverlay',
            afterDatasetsDraw(chart, args, options) {
                const { ctx, scales: { x, y } } = chart;

                // Desenhar capacidade para cada "Mês" (Eixo X)
                // A linha deve cobrir a largura da categoria (mês)

                const meta0 = chart.getDatasetMeta(0);
                if (!meta0 || !meta0.data) return;

                meta0.data.forEach((bar, index) => {
                    // Identificar o mês pelo índice da barra (que corresponde ao label X)
                    const monthKey = respData.monthKeys[index];
                    if (!monthKey) return;

                    let capacity = 176;
                    // Calcular capacidade do mês
                    const parts = monthKey.split('-');
                    if (parts.length === 2) {
                        const year = parseInt(parts[0]);
                        const monthIndex = parseInt(parts[1]) - 1; // 0-indexed
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

                        // Desenhar linha APENAS sobre a barra desta pessoa
                        const xLeft = bar.x - bar.width / 2;
                        const xRight = bar.x + bar.width / 2;
                        const yPos = y.getPixelForValue(capacity);

                        ctx.save();
                        ctx.beginPath();
                        ctx.strokeStyle = '#DC2626'; // Vermelho
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

        // Gerar Datasets (Pessoas)
        // Cores vibrantes e profissionais
        const palette = [
            '#0b4f78', '#36A2EB', '#FF6384', '#4BC0C0', '#FF9F40', '#9966FF',
            '#FFCD56', '#C9CBCF', '#2a9d8f', '#e76f51', '#264653', '#e9c46a'
        ];

        respData.persons.forEach((person, idx) => {
            const dataValues = respData.monthKeys.map(mKey => {
                const key = `${mKey}|${person}`;
                return respData.values[key] || 0;
            });

            datasets.push({
                label: person,
                data: dataValues,
                backgroundColor: palette[idx % palette.length],
                borderRadius: 4,
                borderWidth: 0,
                barPercentage: 0.7,
                categoryPercentage: 0.8
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
                        grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
                        ticks: {
                            font: { size: 11, family: 'Inter, system-ui' },
                            color: '#64748B',
                            callback: function (value) { return value + 'h'; }
                        },
                        border: { display: false }
                    },
                    x: {
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
                            padding: 15
                        },
                        onHover: (e) => { e.native.target.style.cursor = 'pointer'; },
                        onLeave: (e) => { e.native.target.style.cursor = 'default'; }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        padding: 12,
                        callbacks: {
                            title: (items) => `${items[0].label} - ${items[0].dataset.label}`,
                            label: function (context) {
                                const val = context.parsed.y || 0;
                                const personName = context.dataset.label;
                                const dataIndex = context.dataIndex;
                                const monthKey = respData.monthKeys[dataIndex];

                                // Capacidade dinâmica
                                let capacity = 176;
                                if (monthKey) {
                                    const parts = monthKey.split('-');
                                    if (parts.length === 2) {
                                        capacity = getMonthlyCapacity(parseInt(parts[0]), parseInt(parts[1]) - 1);
                                    }
                                }

                                const percent = capacity > 0 ? Math.round((val / capacity) * 100) : 0;
                                const diff = Math.round(capacity - val);

                                return [
                                    `Colaborador: ${personName}`,
                                    `Trabalhado: ${Math.round(val)}h`,
                                    `Capacidade: ${capacity}h`,
                                    `Ocupação: ${percent}%`
                                ];
                            }
                        }
                    },
                    datalabels: {
                        display: (ctx) => ctx.dataset.data[ctx.dataIndex] > 10,
                        color: '#fff',
                        anchor: 'center',
                        align: 'center',
                        formatter: (val) => Math.round(val),
                        font: { weight: '600', size: 10 }
                    }
                },
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        const datasetIndex = elements[0].datasetIndex;
                        const personName = chartResponsibleInstance.data.datasets[datasetIndex].label;

                        // Validar se é um nome válido de pessoa (não capacidade)
                        if (personName && !personName.includes("Capacidade")) {
                            // Atualizar DOM
                            const select = document.getElementById('respSelect');
                            if (select) {
                                if (select.value === personName) {
                                    select.value = ""; // Toggle Off
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
        // --- VISÃO CONSOLIDADA (Temporal - Soma de Todas as Pessoas) ---
        // X-axis: Meses, Y-axis: Soma de todas as pessoas (stacked)
        const respData = processResponsibleData(data, respMetric, filterOwner);
        labels = respData.labels;

        // Agregar todas as pessoas por mês
        respData.monthKeys.forEach(m => {
            let monthTotal = 0;
            // Somar todas as pessoas neste mês
            respData.persons.forEach(p => {
                const key = `${m}|${p}`; // CORRIGIDO: Removido espaços extras na chave
                monthTotal += (respData.values[key] || 0);
            });

            // Calcular capacidade total dinâmica para este mês
            let singleCapacity = 176;
            const parts = m.split('-');
            if (parts.length === 2) {
                const year = parseInt(parts[0]);
                const monthIndex = parseInt(parts[1]) - 1; // 0-indexed
                singleCapacity = getMonthlyCapacity(year, monthIndex);
            }

            const peopleCount = respData.persons.length;
            const monthCapacity = singleCapacity * peopleCount;

            const worked = Math.min(monthTotal, monthCapacity);
            const remaining = Math.max(0, monthCapacity - monthTotal);
            const overtime = Math.max(0, monthTotal - monthCapacity);

            dataWorked.push(worked);
            dataRemaining.push(remaining);
            dataOvertime.push(overtime);
            dataCapacity.push(monthCapacity);
        });
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
                        backgroundColor: '#FF6B6B', // Coral vibrante
                        borderRadius: 6,
                        stack: 'Stack 0',
                        order: 1,
                        barPercentage: 0.65,
                        categoryPercentage: 0.9
                    },
                    {
                        label: 'Horas Trabalhadas',
                        data: dataWorked,
                        backgroundColor: '#4ECDC4', // Turquesa vibrante
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
                            const value = context.dataset.data[context.dataIndex];
                            // Só mostra se o valor for significativo
                            return value >= 5;
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

                            // Se for o último dataset visível (topo da pilha), mostrar total
                            if (datasetIndex === 0 && dataOvertime[dataIndex] >= 5) {
                                // Topo da pilha - mostrar total
                                const total = (dataWorked[dataIndex] || 0) + (dataOvertime[dataIndex] || 0);
                                return Math.round(total) + 'h';
                            } else if (datasetIndex === 1 && (dataOvertime[dataIndex] < 5)) {
                                // Se não há overtime, mostrar total no worked
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

    // 5. Atualizar Cronograma Diário
    // 5. Atualizar Cronograma Diário
    updateDailyChart(data, metric, filterOwner);

    // 6. Atualizar Tabela de Tipos de Horas
    renderHourTypeTable(data);
}

// Helper auxiliar para manter o código limpo (funções antigas mantidas mas não usadas no novo fluxo)
function unused_processResponsibleData_legacy() {
    // Essa função foi substituída pela lógica inline ou processResponsibleData aprimorado
}

/* =========================================
   LÓGICA DO DASHBOARD DE ENTREGAS
   ========================================= */
function renderDeliveryDashboard(data) {
    const container = document.getElementById('deliveryDashboard');
    if (!container) return;
    container.innerHTML = "";

    // 1. Separar em Vencidos, Hoje, Próximos
    // Ignorar itens Concluídos/Cancelados? Geralmente Dashboard foca em pendentes.
    // O usuário disse "prazos que temos proximos e vencidos" - implica pendentes.
    // No entanto, o filtro "Prazo" à esquerda (deadlineSelect) já controla isso de certa forma.
    // Vamos respeitar o array 'data' passado, que já está filtrado pela barra lateral.
    // MAS, comumente itens "Done" não devem estar na lista "Próximos" mesmo se coincidirem com filtro.
    // Vamos filtrar 'Concluída'/'Cancelada' a menos que usuário explicitamente queira histórico?
    // Usuário pediu: "Entregas... Prazos proximos e vencidos". Provavelmente Pendentes.

    const activeData = data.filter(d => d.status !== 'Concluída' && d.status !== 'Cancelada');

    const overdue = [];
    const today = [];
    const upcoming = [];

    // Ordenar por Data Fim
    activeData.sort((a, b) => {
        const da = a.dateEnd || new Date(9999, 0, 1);
        const db = b.dateEnd || new Date(9999, 0, 1);
        return da - db;
    });

    const now = new Date();
    // Resetar tempo para comparação
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    activeData.forEach(item => {
        if (!item.dateEnd) {
            upcoming.push(item); // Sem data = assume futuro/backlog
            return;
        }

        const d = item.dateEnd;
        // Check if strictly before today
        if (d < todayStart) {
            overdue.push(item);
        } else if (d >= todayStart && d <= todayEnd) {
            today.push(item);
        } else {
            upcoming.push(item);
        }
    });

    // Função de Renderização
    const createSection = (title, items, type) => {
        if (items.length === 0) return;

        const section = document.createElement('div');
        section.className = 'dashboard-section';

        const header = document.createElement('div');
        header.className = `section-header ${type}`;
        header.innerHTML = `<span>${title}</span> <span style="font-weight:400; color:#94a3b8; font-size:12px; margin-left:auto">${items.length}</span>`;
        section.appendChild(header);

        items.forEach(item => {
            const card = document.createElement('div');
            card.className = `delivery-item ${type}`;

            // Formatar Datas
            const startStr = item.dateStart ? item.dateStart.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';
            const endStr = item.dateEnd ? item.dateEnd.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';

            // Iniciais do Avatar
            const avatarsHtml = item.assignments.length > 0
                ? item.assignments.slice(0, 3).map(a => `<div class="mini-avatar" title="${a.person} (${a.role})">${initials(a.person)}</div>`).join('')
                : `<div class="mini-avatar" title="${item.owner}">${initials(item.owner)}</div>`;

            card.innerHTML = `
                <div class="status-line"></div>
                <div class="delivery-content">
                    <!-- Trocado: Título agora é Cliente, Meta agora é Detalhe/Escopo -->
                    <div class="delivery-title" title="${item.client || 'Sem Cliente'}">
                        ${item.client || 'Cliente não identificado'}
                    </div>
                    
                    <div class="delivery-meta" style="margin-top:4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; white-space: normal;" title="${item.title}">
                        ${item.title || 'Sem detalhes de escopo'}
                    </div>

                    <div class="delivery-responsibles">
                        <span style="font-size:11px; color:#64748b">Resp:</span>
                        <div class="avatar-group">${avatarsHtml}</div>
                    </div>
                </div>
                <div class="delivery-info">
                   <div class="delivery-date-group">
                       <span class="date-label">Prazo</span>
                       <span class="date-value ${type === 'overdue' ? 'alert' : ''}">${endStr}</span>
                   </div>
                   <div class="delivery-date-group" style="opacity:0.6">
                       <span class="date-label">Início</span>
                       <span class="date-value" style="font-weight:400">${startStr}</span>
                   </div>
                </div>
            `;
            section.appendChild(card);
        });

        container.appendChild(section);
    };

    if (overdue.length === 0 && today.length === 0 && upcoming.length === 0) {
        container.innerHTML = '<div class="empty-state">Nenhuma entrega pendente para os filtros selecionados.</div>';
    } else {
        createSection('Vencidos / Atrasados', overdue, 'overdue');
        createSection('Entregas Hoje', today, 'today');
        createSection('Próximas Entregas', upcoming, 'upcoming');
    }
}

function initials(name) {
    const s = String(name || "").trim();
    if (!s) return "?";
    const parts = s.split(/\s+/).filter(Boolean);
    const a = (parts[0]?.[0] || "").toUpperCase();
    const b = (parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1]) || "";
    return (a + String(b).toUpperCase()).slice(0, 2);
}

// Ajudantes
function getMetricValue(item, metric) {
    return parseFloat(item[metric] || 0);
}

function getMetricLabel(metric) {
    if (metric === 'hours') return 'Horas Totais';
    if (metric === 'hoursAdm') return 'Horas ADM';
    if (metric === 'hoursProject') return 'Horas Projeto';
    if (metric === 'hoursTraining') return 'Horas Treinamento';
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

                // Filtro de Responsável
                if (filterOwner && person !== filterOwner) return;

                // Filtro de Métrica
                let val = toNumber(a.Horas || a.horas || 0);
                const tipo = safeStr(a["Tipo da hora"] || a.tipo_hora).toLowerCase();

                if (metric === 'hoursAdm' && !tipo.includes('adm')) val = 0;
                else if (metric === 'hoursProject' && (tipo.includes('adm') || tipo.includes('treinamento'))) val = 0;
                else if (metric === 'hoursTraining' && !tipo.includes('treinamento')) val = 0;

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
    // Similar ao acima, mas agregação por Pessoa (X) e Mensal (Pilha)? OU Pessoa (Y) e Mês (Pilha)...
    // A implementação anterior não estava totalmente visível, mas posso inferir.
    // Vamos implementar um Total simples por Responsável.
    const persons = {};
    data.forEach(d => {
        d.assignments.forEach(a => {
            if (filterOwner && a.person !== filterOwner) return;
            let val = 0;
            if (metric === 'hours') val = a.hoursTotal;
            else if (metric === 'hoursAdm') val = a.hoursAdm;
            else if (metric === 'hoursProject') val = a.hoursProject;
            else val = a.hoursTotal;
            persons[a.person] = (persons[a.person] || 0) + val;
        });
        if (d.assignments.length === 0 && d.owner) {
            if (filterOwner && d.owner !== filterOwner) return;
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

// Hash simples para cores consistentes
function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + "00000".substring(0, 6 - c.length) + c;
}


// ============================================
// CRONOGRAMA DIÁRIO (NOVO GRÁFICO)
// ============================================

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

    // Se não houver dados
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
                    display: (ctx) => {
                        const v = ctx.dataset.data[ctx.dataIndex];
                        return v > 2; // Só mostra se valor relevante
                    },
                    color: '#fff',
                    font: { weight: 'bold', size: 10 },
                    formatter: (v, ctx) => {
                        // Mostra ID
                        return ctx.dataset.label.split(' ')[0];
                    },
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
                else if (metric === 'hoursProject' && (tipo.includes('adm') || tipo.includes('treinamento'))) val = 0;
                else if (metric === 'hoursTraining' && !tipo.includes('treinamento')) val = 0;

                if (val <= 0) return;

                const dateObj = parseDate(a.Data || a.data);
                if (!dateObj) return;

                // Gerar uma chave de data estável (YYYY-MM-DD) sem depender de toISOString (que usa UTC)
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

    // 2. Ordenar Datas
    const sortedDates = [...dailyMap.keys()].sort();

    // 3. Criar Datasets (Um por Task ID)
    // Isso garante o stack correto
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

    // Formatar labels de data usando formatDatePT
    const formattedLabels = sortedDates.map(dateStr => {
        const parts = dateStr.split('-');
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return formatDatePT(d, 'weekday'); // Formato: 05/02 seg
    });

    return {
        labels: formattedLabels,
        datasets: datasets
    };
}

// ============================================
// NOVA LOGICA DE LISTA (AGENDA) - ADICIONADA
// ============================================

function renderDailyList(data, metric, filterOwner) {
    const listContainer = document.getElementById('dailyScheduleContainer');
    if (!listContainer) return;

    // 1. Processar dados
    const dailySchedule = processDailyListHelper(data, metric, filterOwner);

    // 2. Limpar view
    listContainer.innerHTML = '';

    if (Object.keys(dailySchedule).length === 0) {
        listContainer.innerHTML = '<div style="text-align:center; padding: 40px; color: #888; font-style:italic;">Nenhuma atividade encontrada para o período selecionado.</div>';
        return;
    }

    // 3. Gerar HTML
    const sortedDates = Object.keys(dailySchedule).sort();

    sortedDates.forEach(dateKey => {
        const dayTasks = dailySchedule[dateKey];
        if (!dayTasks || dayTasks.length === 0) return;

        // Header do Dia - usando formatDatePT
        const parts = dateKey.split('-');
        const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);

        const dateFormatted = formatDatePT(dateObj, 'short'); // 02/03
        const weekDay = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
        const weekDayPretty = weekDay.charAt(0).toUpperCase() + weekDay.slice(1);

        const dateHeader = document.createElement('div');
        dateHeader.style.cssText = 'background-color: #f3f6f9; border-left: 5px solid #0b4f78; padding: 10px 15px; margin-top: 20px; margin-bottom: 12px; font-family: Segoe UI, sans-serif; color: #2c3e50; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.03);';

        dateHeader.innerHTML = '<div style="display:flex; align-items:baseline;"><span style="font-size: 1.2rem; font-weight: bold; margin-right: 8px;">' + dateFormatted + '</span><span style="font-size: 1rem; color: #666;">' + weekDayPretty + '</span></div><span style="font-size:0.75rem; background:#dfe6ed; color:#444; padding:3px 8px; border-radius:12px; font-weight:600;">' + dayTasks.length + ' tarefas</span>';
        listContainer.appendChild(dateHeader);

        // Grid de Cards
        const grid = document.createElement('div');
        grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin-bottom: 10px;';

        dayTasks.forEach(task => {
            const card = document.createElement('div');
            const stripColor = stringToColor(task.client || task.title);

            card.style.cssText = 'background: white; border: 1px solid #e1e4e8; border-left: 4px solid ' + stripColor + '; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 2px 5px rgba(0,0,0,0.03);';

            const hoursVal = Math.round(task.hours * 100) / 100;
            const typeLabel = task.type === 'adm' ? 'ADM' : 'PROJ';

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
                else if (metric === 'hoursProject' && (tipo.includes('adm') || tipo.includes('treinamento'))) h = 0;
                else if (metric === 'hoursTraining' && !tipo.includes('treinamento')) h = 0;

                if (h <= 0) return;

                const dateObj = parseDate(a.Data || a.data);
                if (!dateObj) return;

                const yKey = dateObj.getFullYear();
                const mKey = String(dateObj.getMonth() + 1).padStart(2, '0');
                const dKey = String(dateObj.getDate()).padStart(2, '0');
                const dateKey = `${yKey}-${mKey}-${dKey}`;

                if (!dates[dateKey]) dates[dateKey] = [];
                dates[dateKey].push({
                    id: item.id,
                    prpId: item.prpId, // Passar PRP ID
                    client: item.client || item.title,
                    person: person,
                    hours: h,
                    type: tipo.includes('adm') ? 'adm' : 'project'
                });
            });
        }
    });

    return dates;
}
