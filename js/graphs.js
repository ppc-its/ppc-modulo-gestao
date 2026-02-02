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

// ROLE_MAPPINGS REMOVIDO (Não utilizamos mais CSV1 para atribuições)


// Instâncias Globais de Gráficos
let chartTypeInstance = null;
let chartStatusInstance = null;
// chartTimelineInstance REMOVIDO
let chartResponsibleInstance = null;
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
    await loadData();
    populateFilters();
    // Inicializar com métrica padrão 'all' (Todas as Visões)
    document.getElementById('metricSelect').value = 'all';
    initCharts(APP_DATA, 'all');
    setupEventListeners();
}

async function loadData() {
    // 1. Tenta LocalStorage PRIMEIRO (Para garantir sincronia com o que o usuário vê no Board)
    try {
        const rawLocal = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (rawLocal) {
            const parsed = JSON.parse(rawLocal);
            const localTasks = parsed.tasks || [];
            if (Array.isArray(localTasks) && localTasks.length > 0) {
                console.log("Dados carregados do LocalStorage (Sincronizado com Board)");
                APP_DATA = processTasks(localTasks);

                // Log de uso do CSV2
                const csv2Count = APP_DATA.filter(t => t.hasCSV2Data).length;
                if (csv2Count > 0) {
                    console.log(`[Graphs] ${csv2Count}/${APP_DATA.length} tarefas usando dados do CSV2`);
                }

                return; // Usa dados locais e pula API
            }
        }
    } catch (err) {
        console.warn("Erro ao carregar do LocalStorage", err);
    }

    // 2. Fallback para API se LocalStorage estiver vazio/ausente
    console.log("LocalStorage vazio, tentando API...");
    try {
        const tasks = await api.getTasks();
        if (tasks && Array.isArray(tasks)) {
            APP_DATA = processTasks(tasks);
            return;
        }
    } catch (e) {
        console.error("Erro ao carregar dados da API", e);
    }

    // 3. Último recurso: vazio
    APP_DATA = [];
}

/**
 * Lógica de processamento compartilhada para dados da API e Local
 */
/**
 * Lógica de processamento compartilhada para dados da API e Local
 */
function processTasks(tasks) {
    const processed = tasks.map(t => {
        // Determinar objeto raw (API pode retornar raw diretamente ou envelopado)
        const raw = t.raw || t;

        // Verificar se temos dados do CSV2
        const csv2Details = raw["_csv2Details"];

        // Extrair atribuições
        const assignments = [];

        if (csv2Details && csv2Details.colaboradores && csv2Details.colaboradores.length > 0) {
            // USAR DADOS DO CSV2 (prioritário)
            csv2Details.colaboradores.forEach(colab => {
                assignments.push({
                    role: colab.responsabilidades,
                    person: colab.colaborador,
                    hoursProject: colab.horasProjeto || 0,
                    hoursAdm: colab.horasAdm || 0,
                    hoursTotal: colab.horasTotal || 0
                });
            });
        }
        // REMOVIDO: Fallback para CSV1 (legado)

        // Usar datas do CSV2 SOMENTE
        const csv2DateStart = csv2Details?.dataInicio ? parseDate(csv2Details.dataInicio) : null;
        const csv2DateEnd = csv2Details?.dataFim ? parseDate(csv2Details.dataFim) : null;

        // Usar horas do CSV2 SOMENTE
        let hoursProject = 0;
        let hoursAdm = 0;

        if (csv2Details) {
            hoursProject = csv2Details.horasProjetoTotal || 0;
            hoursAdm = csv2Details.horasAdmTotal || 0;
        }

        // Estrutura do mapa
        return {
            id: t.id || raw["ID"] || raw["id"],
            client: raw["Nome Cliente"] || t.title || "Sem Cliente",
            title: t.title || raw["Detalhe da demanda (Escopo)"] || "Demanda", // Garantir que título exista
            owner: t.responsible || raw["Responsável Demanda"] || "Sem Responsável", // Ainda mantendo owner genérico ou deve vir do CSV2? Mantendo por enquanto para compatibilidade de display simples, mas assignments dita o gráfico
            assignments: assignments,
            type: t.demandType || raw["Tipo de Demanda"] || "OUTROS",
            status: t.status || raw["Status"] || "Backlog",
            hoursProject: hoursProject,
            hoursAdm: hoursAdm,
            get hours() { return (this.hoursProject || 0) + (this.hoursAdm || 0); }, // Total calculado dinamicamente
            date: csv2DateEnd, // SOMENTE CSV2
            dateStart: csv2DateStart, // SOMENTE CSV2
            dateEnd: csv2DateEnd, // SOMENTE CSV2
            raw: raw,
            hasCSV2Data: !!csv2Details // Flag para debug
        };
    });

    // Logging de Verificação de Volumetria
    console.log(`[Graphs] Processamento concluído: ${processed.length} tarefas.`);
    if (processed.length > 0) {
        let totalH = 0, totalP = 0, totalA = 0;
        processed.forEach(p => {
            totalH += p.hours;
            totalP += p.hoursProject;
            totalA += p.hoursAdm;
        });
        console.log(`[Graphs] Volumetria Total (CSV2 Only): ${totalH.toFixed(1)}h (Projeto: ${totalP.toFixed(1)}h, ADM: ${totalA.toFixed(1)}h)`);
    }

    return processed;
}

function parseDate(dateStr) {
    if (!dateStr) return null; // Retorna null se vazio

    // Tenta parse padrão de Date (funciona para ISO e M/D/Y)
    let d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;

    // Tenta formato brasileiro DD/MM/YYYY
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        // Assume D/M/Y
        d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        if (!isNaN(d.getTime())) return d;
    }

    return null; // Retorna null se inválido
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

function resetFilters() {
    document.getElementById('periodSelect').value = "30";
    document.getElementById('customDateContainer').style.display = 'none'; // Hide on reset
    document.getElementById('startDate').value = "";
    document.getElementById('endDate').value = "";
    document.getElementById('clientSelect').value = "";
    document.getElementById('respSelect').value = "";
    document.getElementById('metricSelect').value = "all";
    document.getElementById('deadlineSelect').value = "all";
    document.getElementById('respViewSelect').value = "individual";
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

    // Parse custom dates (start of day / end of day)
    let customStart = startStr ? new Date(startStr + 'T00:00:00') : null;
    let customEnd = endStr ? new Date(endStr + 'T23:59:59') : null;

    let filtered = APP_DATA.filter(item => {
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
        } else if (period === 'month') {
            if (itemDate.getMonth() !== TODAY.getMonth() || itemDate.getFullYear() !== TODAY.getFullYear()) return false;
        } else if (period === 'year') {
            if (itemDate.getFullYear() !== TODAY.getFullYear()) return false;
        } else if (period === 'custom') {
            // Se as datas não estiverem preenchidas, mostra tudo ou nada?
            // Vamos mostrar tudo se vazio, ou filtrar se preenchido.
            if (customStart && itemDate < customStart) return false;
            if (customEnd && itemDate > customEnd) return false;
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
            layout: { padding: { top: 25 } }
        },
        plugins: [ChartDataLabels]
    });

    // 3. Renderização Inicial do Dashboard de Entregas
    renderDeliveryDashboard(data);

    // 4. Responsável vs Capacidade (Delegado para updateCharts para consistência)
    updateCharts(data, metric, 'individual', null);
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
        const labels = Object.keys(dTotal).sort();
        chartStatusInstance.data.labels = labels;
        chartStatusInstance.data.datasets = [
            { label: 'Horas Totais', data: labels.map(k => dTotal[k]), backgroundColor: '#0b4f78', borderRadius: 6 },
            { label: 'Horas Projeto', data: labels.map(k => dProj[k]), backgroundColor: '#36A2EB', borderRadius: 6 },
            { label: 'Horas ADM', data: labels.map(k => dAdm[k]), backgroundColor: '#FF9F40', borderRadius: 6 }
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
    let dataWorked = [];
    let dataRemaining = [];
    let dataOvertime = [];

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
        });
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
                const key = `${m}| ${p} `;
                monthTotal += (respData.values[key] || 0);
            });

            // Calcular capacidade total para este mês (176h × número de pessoas)
            const peopleCount = respData.persons.length;
            const monthCapacity = CAPACITY * peopleCount;

            const worked = Math.min(monthTotal, monthCapacity);
            const remaining = Math.max(0, monthCapacity - monthTotal);
            const overtime = Math.max(0, monthTotal - monthCapacity);

            dataWorked.push(worked);
            dataRemaining.push(remaining);
            dataOvertime.push(overtime);
        });
    }

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
                            const total = worked + overtime;

                            let lines = [];
                            lines.push('─────────────');
                            lines.push(`Total: ${Math.round(total)}h`);
                            lines.push(`Capacidade: 176h`);
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

    chartResponsibleInstance = new Chart(ctxResp, config);
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
        const dateRef = d.dateEnd || d.date || new Date();
        const y = dateRef.getFullYear();
        const m = dateRef.getMonth() + 1;
        const monthKey = `${y} -${String(m).padStart(2, '0')} `;
        const label = dateRef.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });

        monthMap.set(monthKey, label);

        d.assignments.forEach(assign => {
            if (!assign.person) return;
            if (filterOwner && assign.person !== filterOwner) return;

            const person = assign.person;
            personSet.add(person);

            let val = 0;
            if (metric === 'hours') val = assign.hoursTotal;
            else if (metric === 'hoursAdm') val = assign.hoursAdm;
            else if (metric === 'hoursProject') val = assign.hoursProject;
            else val = assign.hoursTotal;

            const key = `${monthKey}| ${person} `;
            values[key] = (values[key] || 0) + val;

            monthlyTotals[monthKey] = (monthlyTotals[monthKey] || 0) + val;

            if (!uniquePersonsPerMonth[monthKey]) {
                uniquePersonsPerMonth[monthKey] = new Set();
            }
            if (assign.role !== 'Sócio' && assign.role !== 'Gerente') {
                uniquePersonsPerMonth[monthKey].add(person);
            }
        });

        // Fallback
        if (d.assignments.length === 0 && d.owner) {
            if (filterOwner && d.owner !== filterOwner) return;
            const person = d.owner;
            personSet.add(person);
            const val = getMetricValue(d, metric);
            const key = `${monthKey}| ${person} `;
            values[key] = (values[key] || 0) + val;
            monthlyTotals[monthKey] = (monthlyTotals[monthKey] || 0) + val;
            if (!uniquePersonsPerMonth[monthKey]) uniquePersonsPerMonth[monthKey] = new Set();
            uniquePersonsPerMonth[monthKey].add(person);
        }
    });

    const sortedMonthKeys = [...monthMap.keys()].sort();
    const sortedPersons = [...personSet].sort();

    const monthlyCapacity = {};
    sortedMonthKeys.forEach(k => {
        const count = uniquePersonsPerMonth[k] ? uniquePersonsPerMonth[k].size : 0;
        monthlyCapacity[k] = count * 176;
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
            data: data.monthKeys.map(m => data.values[`${m}| ${p} `] || 0),
            backgroundColor: color,
            // stack: 'Stack 0', // Removido para permitir agrupamento lado a lado
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
