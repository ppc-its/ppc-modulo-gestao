/* =========================
   PPC Task Board - Graphs
   Interactive Filters & Visualization
   ========================= */

// Theme colors from CSS
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

const ROLE_MAPPINGS = [
    { role: 'Demanda', nameKey: 'Responsável Demanda', hoursKey: 'Horas Projeto (Responsável Demanda)', admKey: 'Horas Adm (Responsável Demanda)' },
    { role: 'Trainee', nameKey: 'Trainee do Projeto', hoursKey: 'Horas Projeto (Trainee)', admKey: 'Horas Adm (Trainee)' },
    { role: 'Cyber', nameKey: 'Responsável Cyber', hoursKey: 'Horas Projeto (Cyber)', admKey: 'Horas Adm (Cyber)' },
    { role: 'Intelidados', nameKey: 'Responsável Intelidados', hoursKey: 'Horas Projeto (Intelidados)', admKey: 'Horas Adm (Intelidados)' },
    { role: 'Desenvolvimento', nameKey: 'Responsável Desenvolvimento', hoursKey: 'Horas Projeto (Desenvolvimento)', admKey: 'Horas Adm (Desenvolvimento)' },
    // Sócio/Gerente don't have hours, only filters
    { role: 'Sócio', nameKey: 'Sócio Responsável', hoursKey: null, admKey: null },
    { role: 'Gerente', nameKey: 'Gerente Responsável', hoursKey: null, admKey: null }
];


// Global Chart Instances
let chartTypeInstance = null;
let chartStatusInstance = null;
// chartTimelineInstance REMOVED
let chartResponsibleInstance = null;
let APP_DATA = []; // Will hold the loaded data
const LOCAL_STORAGE_KEY = "ppc_task_board_data_v1";

// Hardcoded "Today" for consistency (or use real today?)
const TODAY = new Date();

document.addEventListener("DOMContentLoaded", () => {
    init();
});

// Register plugin if available
if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
}

async function init() {
    await loadData();
    populateFilters();
    // Initialize with default metric 'hours' (Total)
    initCharts(APP_DATA, 'hours');
    setupEventListeners();
}

async function loadData() {
    try {
        const tasks = await api.getTasks();
        if (tasks && Array.isArray(tasks)) {
            APP_DATA = tasks.map(t => {
                // Determine raw object (API might return raw directly or wrapped)
                const raw = t.raw || t;

                // Extract assignments
                const assignments = [];
                ROLE_MAPPINGS.forEach(map => {
                    const name = (raw[map.nameKey] || "").trim();
                    if (name) {
                        let hProj = 0;
                        let hAdm = 0;
                        if (map.hoursKey) hProj = parseFloat(raw[map.hoursKey] || 0);
                        if (map.admKey) hAdm = parseFloat(raw[map.admKey] || 0);

                        // fallback safety
                        if (isNaN(hProj)) hProj = 0;
                        if (isNaN(hAdm)) hAdm = 0;

                        assignments.push({
                            role: map.role,
                            person: name,
                            hoursProject: hProj,
                            hoursAdm: hAdm,
                            hoursTotal: hProj + hAdm
                        });
                    }
                });

                // Helper to parse dates simply
                const dateStart = parseDate(raw["Data Início (Previsão)"]);
                const dateEnd = parseDate(raw["Data Conclusão (Previsão)"]);

                // Map structure
                return {
                    client: raw["Nome Cliente"] || t.title || "Sem Cliente",
                    title: t.title || raw["Detalhe da demanda (Escopo)"] || "Demanda", // Ensure title exists
                    owner: t.responsible || raw["Responsável Demanda"] || "Sem Responsável",
                    assignments: assignments,
                    type: t.demandType || raw["Tipo de Demanda"] || "OUTROS",
                    status: t.status || raw["Status"] || "Backlog",
                    hours: parseFloat(raw["Horas"] || t.hoursTotal || 0),
                    hoursAdm: parseFloat(raw["Horas ADM"] || t.hoursAdm || 0),
                    date: dateEnd, // Keep generic date as End Date for legacy logic
                    dateStart: dateStart,
                    dateEnd: dateEnd,
                    raw: raw
                };
            });
            return;
        }
    } catch (e) {
        console.error("Error loading data from API", e);
    }

    // Fallback if no data found
    APP_DATA = [];
}

function parseDate(dateStr) {
    if (!dateStr) return null; // Return null if empty

    // Try standard Date parse (works for ISO and M/D/Y)
    let d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;

    // Try Brazilian format DD/MM/YYYY
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        // Assume D/M/Y
        d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        if (!isNaN(d.getTime())) return d;
    }

    return null; // Return null if invalid
}

/**
 * Populate 'Select' options based on APP_DATA
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
    // sort alphabetically
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
    document.getElementById('btnApply').addEventListener('click', applyFilters);
    document.getElementById('btnReset').addEventListener('click', resetFilters);
}

function resetFilters() {
    document.getElementById('periodSelect').value = "30";
    document.getElementById('clientSelect').value = "";
    document.getElementById('respSelect').value = "";
    document.getElementById('metricSelect').value = "hours";
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

    let filtered = APP_DATA.filter(item => {
        // Client Filter
        if (client && item.client !== client) return false;
        // Owner Filter
        // Owner Filter (Multi-role)
        if (owner) {
            const p = owner.toLowerCase();
            // Check if ANY assignment matches
            const match = item.assignments.some(a => a.person.toLowerCase().includes(p));
            if (!match) return false;
        }

        // Date Logic for Period
        const itemDate = item.date || new Date(); // Fallback for sort

        if (period === '30') {
            const diffTime = Math.abs(TODAY - itemDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > 30) return false;
        } else if (period === 'month') {
            if (itemDate.getMonth() !== TODAY.getMonth() || itemDate.getFullYear() !== TODAY.getFullYear()) return false;
        } else if (period === 'year') {
            if (itemDate.getFullYear() !== TODAY.getFullYear()) return false;
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

    updateCharts(filtered, metric, viewMode);
}

function initCharts(data, metric) {
    // 1. Demand Type
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
                        let percentage = (value * 100 / sum).toFixed(1) + "%";
                        if ((value * 100 / sum) < 3) return "";
                        return percentage;
                    },
                    display: true
                }
            }
        },
        plugins: [ChartDataLabels]
    });

    // Common DataLabels Defaults
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
                    font: { weight: '900', size: 14 }
                }
            }
        },
        plugins: [ChartDataLabels]
    });

    // 3. Delivery Dashboard Initial Render
    renderDeliveryDashboard(data);

    // 4. Responsible vs Capacity
    const respData = processResponsibleData(data, metric);
    const ctxResp = document.getElementById('chartResponsible').getContext('2d');
    chartResponsibleInstance = new Chart(ctxResp, {
        type: 'bar',
        data: {
            labels: respData.labels,
            datasets: buildResponsibleDatasets(respData)
        },
        options: {
            indexAxis: 'x',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                x: { stacked: true, grid: { display: false } }
            },
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += Math.round(context.parsed.y) + 'h';
                            } else if (context.parsed.x !== null) {
                                label += Math.round(context.parsed.x) + 'h';
                            }

                            // Remaining Hours Logic
                            if (context.dataset.label !== 'Capacidade (176h/pessoa)') {
                                const val = context.parsed.y !== null ? context.parsed.y : context.parsed.x;
                                const capacity = 176;
                                const remaining = capacity - val;

                                if (remaining >= 0) {
                                    label += ` | Restantes: ${Math.round(remaining)}h`;
                                } else {
                                    label += ` | Excedentes: ${Math.round(Math.abs(remaining))}h`;
                                }
                            }
                            return label;
                        }
                    }
                },
                datalabels: {
                    color: '#fff',
                    font: { weight: "bold", size: 12 },
                    textStrokeColor: 'rgba(0,0,0,0.5)',
                    textStrokeWidth: 2,
                    formatter: (value, ctx) => {
                        if (Math.abs(value) < 1) return "";
                        return Math.round(value);
                    },
                    display: (ctx) => {
                        const v = ctx.dataset.data[ctx.dataIndex];
                        return Math.abs(v) > 2;
                    },
                    anchor: 'center',
                    align: 'center'
                }
            }
        },
        plugins: [ChartDataLabels]
    });
}

function updateCharts(data, metric, viewMode = 'individual') {
    // 1. Type
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

    // 3. Update Delivery Dashboard
    renderDeliveryDashboard(data);

    // 4. Responsible vs Capacity
    const respMetric = (metric === 'all') ? 'hours' : metric;
    if (chartResponsibleInstance) chartResponsibleInstance.destroy();
    const ctxResp = document.getElementById('chartResponsible').getContext('2d');

    const config = {
        type: 'bar',
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { stacked: true, grid: { display: false } }, // Swapped for indexAxis check below
                x: { stacked: true, grid: { display: false } }
            },
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += Math.round(context.parsed.y) + 'h';
                            } else if (context.parsed.x !== null) {
                                label += Math.round(context.parsed.x) + 'h';
                            }

                            // Add Remaining Hours Logic
                            // Only for actual data datasets, not the capacity line itself (though user might want to see context there too)
                            // Assuming capacity is fixed 176h for this calculation as requested.
                            if (context.dataset.label !== 'Capacidade (176h/pessoa)') {
                                const val = context.parsed.y !== null ? context.parsed.y : context.parsed.x;
                                const capacity = 176;
                                const remaining = capacity - val;

                                if (remaining >= 0) {
                                    label += ` | Restantes: ${Math.round(remaining)}h`;
                                } else {
                                    label += ` | Excedentes: ${Math.round(Math.abs(remaining))}h`;
                                }
                            }

                            return label;
                        }
                    }
                },
                datalabels: {
                    color: '#fff',
                    font: { weight: "bold", size: 10 },
                    formatter: (value) => Math.abs(value) < 1 ? "" : Math.round(value),
                    display: (ctx) => Math.abs(ctx.dataset.data[ctx.dataIndex]) > 2,
                    anchor: 'center', align: 'center'
                }
            }
        },
        plugins: [ChartDataLabels]
    };

    if (viewMode === 'aggregated') {
        const aggData = processResponsibleAggregatedData(data, respMetric);
        config.data = { labels: aggData.labels, datasets: buildResponsibleAggregatedDatasets(aggData) };
        config.options.indexAxis = 'y'; // Horizontal
        config.options.scales.x.beginAtZero = true; // x is value axis
        config.options.scales.x.grid.color = 'rgba(0,0,0,0.05)';
    } else {
        const newRespData = processResponsibleData(data, respMetric);
        config.data = { labels: newRespData.labels, datasets: buildResponsibleDatasets(newRespData) };
        config.options.indexAxis = 'x'; // Vertical
        config.options.scales.y.beginAtZero = true; // y is value axis
        config.options.scales.y.grid.color = 'rgba(0,0,0,0.05)';
    }

    chartResponsibleInstance = new Chart(ctxResp, config);
}

/* =========================================
   DELIVERY DASHBOARD LOGIC
   ========================================= */
function renderDeliveryDashboard(data) {
    const container = document.getElementById('deliveryDashboard');
    if (!container) return;
    container.innerHTML = "";

    // 1. Separate into Overdue, Today, Upcoming
    // Ignore Completed/Cancelled items? Usually Dashboard focuses on pending. 
    // The user said "prazos que temos proximos e vencidos" - implies pending.
    // However, the "Prazo" filter on the left (deadlineSelect) already controls this somewhat.
    // Let's Respect the passed 'data' array which is already filtered by sidebar.
    // BUT, commonly "Done" items shouldn't be in "Proximos" list even if they match filter.
    // Let's filter out 'Concluída'/'Cancelada' unless user explicitly wants history?
    // User asked: "Entregas... Prazos proximos e vencidos". Likely Pending.

    const activeData = data.filter(d => d.status !== 'Concluída' && d.status !== 'Cancelada');

    const overdue = [];
    const today = [];
    const upcoming = [];

    // Sort by Date End
    activeData.sort((a, b) => {
        const da = a.dateEnd || new Date(9999, 0, 1);
        const db = b.dateEnd || new Date(9999, 0, 1);
        return da - db;
    });

    const now = new Date();
    // Reset time for comparison
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    activeData.forEach(item => {
        if (!item.dateEnd) {
            upcoming.push(item); // No date = assumes future/backlog
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

    // Render Function
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

            // Format Dates
            const startStr = item.dateStart ? item.dateStart.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';
            const endStr = item.dateEnd ? item.dateEnd.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';

            // Avatar Initials
            const avatarsHtml = item.assignments.length > 0
                ? item.assignments.slice(0, 3).map(a => `<div class="mini-avatar" title="${a.person} (${a.role})">${initials(a.person)}</div>`).join('')
                : `<div class="mini-avatar" title="${item.owner}">${initials(item.owner)}</div>`;

            card.innerHTML = `
                <div class="status-line"></div>
                <div class="delivery-content">
                    <!-- Swapped: Title is now Client, Meta is now Detail/Scope -->
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

// Helpers
function getMetricValue(item, metric) {
    const val = parseFloat(item[metric] || 0);
    if (metric === 'hoursProject') {
        const total = parseFloat(item.hours || 0);
        const adm = parseFloat(item.hoursAdm || 0);
        return Math.max(0, total - adm);
    }
    return val;
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

function processResponsibleData(data, metric) {
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
            stack: 'Stack 0',
        };
    });

    // Capacity Line
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

function processResponsibleAggregatedData(data, metric) {
    // Similar to above but aggregation by Person (X) and Monthly (Stack)? OR Person (Y) and Month (Stack)...
    // The previous implementation (not fully shown in read) wasn't fully visible but I can infer.
    // Let's implement a simple Total by Responsible.
    const persons = {};
    data.forEach(d => {
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

// Simple hash for consistent colors
function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + "00000".substring(0, 6 - c.length) + c;
}
