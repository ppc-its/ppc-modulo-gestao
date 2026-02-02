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
    document.getElementById('periodSelect').value = "90";
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
    let datasets = []; // Usado para Custom Config
    let overrideConfig = false;

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
    } else if (viewMode === 'individual_monthly') {
        // --- VISÃO INDIVIDUAL MENSAL (Quebra por Mês) ---
        // X-axis: Pessoas
        // Datasets: Um dataset POR MÊS (Grouped Bars)

        const respData = processResponsibleData(data, respMetric, filterOwner);
        labels = respData.persons; // X-axis são as pessoas

        // Cores dos meses (cíclicas)
        const monthColors = [
            '#4ECDC4', '#FF6B6B', '#FFD166', '#0C9DE4', '#9966FF', '#C9CBCF',
            '#118AB2', '#06D6A0', '#EF476F', '#FFD166', '#073B4C'
        ];

        // Criar um dataset para cada mês encontrado
        let colorIdx = 0;
        respData.monthKeys.forEach((mKey, idx) => {
            const mLabel = respData.labels[idx]; // Label legível (e.g. "Jan/24")

            // Dados para este mês, para cada pessoa
            const mData = [];
            respData.persons.forEach(p => {
                const key = `${mKey}| ${p} `;
                mData.push(respData.values[key] || 0);
            });

            // Dataset do Mês
            const ds = {
                label: mLabel,
                data: mData,
                backgroundColor: monthColors[colorIdx % monthColors.length],
                borderRadius: 4,
                stack: 'monthlyGroup', // Mesmo stack group allow side-by-side? No, undefined stack means side-by-side
                // Se definirmos stack diferente para cada mês, ficam side-by-side?
                // Chart.js grouped bars: datasets with different stack IDs or no stack ID are placed side-by-side.
                // Mas aqui queremos agrupados POR PESSOA. 
                // Default bar chart: datasets are side-by-side for each category (Person).
                barPercentage: 0.8,
                categoryPercentage: 0.8
            };

            // Remover propriedade 'stack' para garantir side-by-side
            delete ds.stack;

            datasets.push(ds);
            colorIdx++;
        });

        // Adicionar Linha de Capacidade (176h)
        // Como é grouped bar, a linha se aplica a cada barra individualmente (Mês). 
        // Capacidade MENSAL é 176h.
        // Precisamos de um dataset 'line' que cubra todas as pessoas.
        // O array deve ter o tamanho de 'labels' (pessoas).
        const capacityData = new Array(labels.length).fill(CAPACITY);

        datasets.push({
            label: 'Capacidade (176h)',
            data: capacityData,
            type: 'line',
            borderColor: '#FF0000', // Vermelho para destaque
            borderWidth: 2,
            pointStyle: false,
            fill: false,
            datalabels: { display: false },
            order: 0 // Draw on top
        });

        // Configuração sobrescreve a inicial
        config = {
            type: 'bar',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.08)' },
                        ticks: {
                            callback: function (value) { return value + 'h'; }
                        }
                    },
                    x: {
                        grid: { display: false }
                    }
                },
                plugins: {
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function (context) {
                                if (context.dataset.type === 'line') return null;
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) label += Math.round(context.parsed.y) + 'h';
                                return label;
                            }
                        }
                    },
                    datalabels: {
                        display: function (context) {
                            return context.dataset.type !== 'line' && context.dataset.data[context.dataIndex] > 5;
                        },
                        color: '#fff', // Branco dentro da barra? Ou fora?
                        anchor: 'end',
                        align: 'top',
                        offset: -4, // Dentro do topo
                        formatter: (val) => Math.round(val),
                        font: { weight: 'bold', size: 10 },
                        textStrokeColor: 'rgba(0,0,0,0.5)',
                        textStrokeWidth: 2

                    }
                }
            }
        };

        // Sobrepor config construída
        overrideConfig = true; // Flag to use this config directly

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
    }

    chartResponsibleInstance = new Chart(ctxResp, config);

    // 5. Atualizar Cronograma Diário
    updateDailyChart(data, metric, filterOwner);
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
    // 1. Identificar Intervalo e Tarefas
    const dailyMap = new Map(); // DataString -> { taskId: hours }
    const taskInfo = new Map(); // taskId -> { label, color }
    const allTaskIds = new Set();

    data.forEach(item => {
        // Datas CSV2
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

        // Definir loop de atribuições
        let assignments = item.assignments;

        // Se filtro de owner estiver ativo, filtrar assignments
        // Se não tiver assignments, fallback owner
        if (assignments.length === 0 && item.owner) {
            assignments = [{ person: item.owner, hoursTotal: getMetricValue(item, 'hours') }];
        }

        assignments.forEach(assign => {
            if (filterOwner && assign.person !== filterOwner) return;

            let h = 0;
            // Simplificacao de metrica
            if (metric === 'hours' || metric === 'all') h = assign.hoursTotal || assign.hours || 0;
            else if (metric === 'hoursAdm') h = assign.hoursAdm || 0;
            else if (metric === 'hoursProject') h = assign.hoursProject || 0;

            if (h <= 0) return;

            const dailyHours = h / businessDays;

            // Distribuir
            let curr = new Date(start);
            while (curr <= end) {
                const w = curr.getDay();
                if (w !== 0 && w !== 6) {
                    const dateKey = curr.toISOString().split('T')[0];
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

    // Formatar labels de data (ex: 05/02 Seg)
    const formattedLabels = sortedDates.map(dateStr => {
        const d = new Date(dateStr + 'T12:00:00'); // Safe timezone
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const week = d.toLocaleDateString('pt-BR', { weekday: 'short' });
        return `${day}/${month} ${week}`;
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

        // Header do Dia
        const parts = dateKey.split('-');
        const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
        const dayStr = String(dateObj.getDate()).padStart(2, '0');
        const monthStr = String(dateObj.getMonth() + 1).padStart(2, '0');

        const weekDay = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
        const weekDayPretty = weekDay.charAt(0).toUpperCase() + weekDay.slice(1);

        const dateHeader = document.createElement('div');
        dateHeader.style.cssText = 'background-color: #f3f6f9; border-left: 5px solid #0b4f78; padding: 10px 15px; margin-top: 20px; margin-bottom: 12px; font-family: Segoe UI, sans-serif; color: #2c3e50; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.03);';

        dateHeader.innerHTML = '<div style="display:flex; align-items:baseline;"><span style="font-size: 1.2rem; font-weight: bold; margin-right: 8px;">' + dayStr + '/' + monthStr + '</span><span style="font-size: 1rem; color: #666;">' + weekDayPretty + '</span></div><span style="font-size:0.75rem; background:#dfe6ed; color:#444; padding:3px 8px; border-radius:12px; font-weight:600;">' + dayTasks.length + ' tarefas</span>';
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

            card.innerHTML = '<div style="margin-bottom: 8px;"><div style="display:flex; justify-content:space-between; align-items:flex-start;"><span style="font-size: 0.8rem; font-weight:800; color:#0b4f78; background:#eaf4fc; padding:2px 6px; border-radius:4px;">ID ' + task.id + '</span><span style="font-size: 0.75rem; color: #999; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">' + typeLabel + '</span></div><div style="margin-top:6px; font-weight:600; font-size: 0.95rem; color:#333; line-height:1.3;">' + (task.client || task.title) + '</div></div><div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #f0f0f0; paddingTop:8px; margin-top:4px;"><div style="display:flex; align-items:center; color:#555; font-size:0.85rem;"><i class="fas fa-user" style="margin-right:6px; color:#aaa; font-size:0.8rem;"></i><span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px;" title="' + task.person + '">' + task.person + '</span></div><div style="font-weight:bold; color:#2c3e50; font-size:1rem;">' + hoursVal + 'h</div></div>';
            grid.appendChild(card);
        });

        listContainer.appendChild(grid);
    });
}

function processDailyListHelper(data, metric, filterOwner) {
    const dates = {};

    data.forEach(item => {
        const granularData = item.raw && item.raw['_csv2Details'] && item.raw['_csv2Details'].lancamentos;

        if (granularData && Array.isArray(granularData) && granularData.length > 0) {
            granularData.forEach(entry => {
                if (filterOwner && entry.person !== filterOwner) return;

                let h = entry.hours;
                if (metric === 'hoursAdm' && entry.type !== 'adm') h = 0;
                if (metric === 'hoursProject' && entry.type !== 'project') h = 0;
                if (h <= 0) return;

                const dateObj = parseDate(entry.date);
                if (!dateObj) return;

                const y = dateObj.getFullYear();
                const m = String(dateObj.getMonth() + 1).padStart(2, '0');
                const d = String(dateObj.getDate()).padStart(2, '0');
                const dateKey = y + '-' + m + '-' + d;

                if (!dates[dateKey]) dates[dateKey] = [];
                dates[dateKey].push({
                    id: item.id,
                    client: item.client || item.title,
                    person: entry.person,
                    hours: h,
                    type: entry.type
                });
            });
        }
        else {
            const start = item.dateStart;
            const end = item.dateEnd;
            if (!start || !end) return;

            let assignments = item.assignments;
            if (assignments.length === 0 && item.owner) {
                assignments = [{ person: item.owner, hoursTotal: getMetricValue(item, 'hours') }];
            }

            const daysInInterval = [];
            let d = new Date(start);
            d.setHours(0, 0, 0, 0);
            const endDate = new Date(end);
            endDate.setHours(0, 0, 0, 0);

            while (d <= endDate) {
                const w = d.getDay();
                if (w !== 0 && w !== 6) {
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    daysInInterval.push(y + '-' + m + '-' + day);
                }
                d.setDate(d.getDate() + 1);
            }
            const businessDays = daysInInterval.length;
            if (businessDays === 0) return;

            assignments.forEach(assign => {
                if (filterOwner && assign.person !== filterOwner) return;

                let h = 0;
                if (metric === 'hours' || metric === 'all') h = assign.hoursTotal || 0;
                else if (metric === 'hoursAdm') h = assign.hoursAdm || 0;
                else if (metric === 'hoursProject') h = assign.hoursProject || 0;
                if (h <= 0) return;

                const dailyHours = h / businessDays;

                daysInInterval.forEach(dateKey => {
                    if (!dates[dateKey]) dates[dateKey] = [];
                    dates[dateKey].push({
                        id: item.id,
                        client: item.client || item.title,
                        person: assign.person,
                        hours: dailyHours,
                        type: 'mixed'
                    });
                });
            });
        }
    });
    return dates;
}
