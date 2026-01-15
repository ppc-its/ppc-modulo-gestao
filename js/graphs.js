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

// Global Chart Instances
let chartTypeInstance = null;
let chartStatusInstance = null;
let chartTimelineInstance = null;
let chartResponsibleInstance = null;
let APP_DATA = []; // Will hold the loaded data
const LOCAL_STORAGE_KEY = "ppc_task_board_data_v1";

// Hardcoded "Today" for consistency (or use real today?)
// Using real today for functional usage, but for demo consistency with mock data we used a fixed date.
// Since we are now syncing with REAL data, we should probably use REAL today.
const TODAY = new Date();

document.addEventListener("DOMContentLoaded", () => {
    init();
});

function init() {
    loadData();
    populateFilters();
    // Initialize with default metric 'hours' (Total)
    initCharts(APP_DATA, 'hours');
    setupEventListeners();
}

function loadData() {
    try {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.tasks && Array.isArray(parsed.tasks)) {
                APP_DATA = parsed.tasks.map(t => {
                    // Map app.js structure to graphs.js structure
                    return {
                        client: t.raw?.["Nome Cliente"] || t.title || "Sem Cliente",
                        owner: t.responsible || "Sem Responsável",
                        type: t.demandType || "OUTROS",
                        status: t.status || "Backlog",
                        hours: parseFloat(t.hoursTotal || 0),
                        hoursAdm: parseFloat(t.hoursAdm || 0),
                        // Try to parse end date, fallback to start, fallback to today
                        date: parseDate(t.dates?.end || t.dates?.start),
                        raw: t.raw
                    };
                });
                return;
            }
        }
    } catch (e) {
        console.error("Error loading data from localStorage", e);
    }

    // Fallback if no data found (empty array to avoid crash)
    APP_DATA = [];
}

function parseDate(dateStr) {
    if (!dateStr) return new Date(); // Fallback to now

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

    return new Date();
}

/**
 * Populate 'Select' options based on APP_DATA
 */
function populateFilters() {
    const clientSet = new Set();
    const ownerSet = new Set();

    const fields = [
        "Responsável Demanda",
        "Trainee do Projeto",
        "Responsável Cyber",
        "Responsável Intelidados",
        "Responsável Desenvolvimento"
    ];

    APP_DATA.forEach(item => {
        if (item.client) clientSet.add(item.client);

        fields.forEach(f => {
            const val = item.raw?.[f]?.trim();
            if (val) ownerSet.add(val);
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
    applyFilters();
}

function applyFilters() {
    const period = document.getElementById('periodSelect').value;
    const client = document.getElementById('clientSelect').value;
    const owner = document.getElementById('respSelect').value;
    const metric = document.getElementById('metricSelect').value; // hours, hoursProject, hoursAdm
    const deadline = document.getElementById('deadlineSelect').value; // all, ontime, overdue

    let filtered = APP_DATA.filter(item => {
        // Client Filter
        if (client && item.client !== client) return false;
        // Owner Filter
        // Owner Filter
        if (owner) {
            const p = owner.toLowerCase();
            const fields = [
                "Responsável Demanda",
                "Trainee do Projeto",
                "Responsável Cyber",
                "Responsável Intelidados",
                "Responsável Desenvolvimento"
            ];
            const match = fields.some(key => {
                const val = (item.raw?.[key] || "").toLowerCase();
                return val.includes(p);
            });
            if (!match) return false;
        }

        // Date Logic for Period
        const itemDate = item.date;

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

    updateCharts(filtered, metric);
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
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        font: { family: 'ui-sans-serif, system-ui', size: 12 },
                        usePointStyle: true,
                        padding: 20
                    }
                }
            },
            cutout: '65%'
        }
    });

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
            plugins: { legend: { position: 'top', align: 'end' } }
        }
    });

    // 3. Timeline
    const timelineData = processTimelineData(data, metric);
    const ctxTimeline = document.getElementById('chartTimeline').getContext('2d');
    chartTimelineInstance = new Chart(ctxTimeline, {
        type: 'line',
        data: {
            labels: Object.keys(timelineData).sort(),
            datasets: [{
                label: getMetricLabel(metric),
                data: Object.keys(timelineData).sort().map(k => timelineData[k]),
                borderColor: '#123e5d',
                backgroundColor: 'rgba(18, 62, 93, 0.1)',
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#123e5d',
                pointRadius: 6,
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                x: { grid: { display: false } }
            },
            plugins: { legend: { display: true } }
        }
    });

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
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                x: { grid: { display: false } }
            },
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            }
        }
    });
}

function updateCharts(data, metric) {
    // 1. Type (If 'all', use 'hours' as default to avoid toggle confusion, or keeps simple)
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

        // Ensure consistent key order
        const labels = Object.keys(dTotal).sort();

        chartStatusInstance.data.labels = labels;
        chartStatusInstance.data.datasets = [
            {
                label: 'Horas Totais',
                data: labels.map(k => dTotal[k]),
                backgroundColor: '#0b4f78',
                borderRadius: 6
            },
            {
                label: 'Horas Projeto',
                data: labels.map(k => dProj[k]),
                backgroundColor: '#36A2EB',
                borderRadius: 6
            },
            {
                label: 'Horas ADM',
                data: labels.map(k => dAdm[k]),
                backgroundColor: '#FF9F40',
                borderRadius: 6
            }
        ];
    } else {
        const statusData = processStatusData(data, metric);
        const labels = Object.keys(statusData).sort(); // Sort for consistency

        chartStatusInstance.data.labels = labels;
        // Reset to single dataset if switching back from 'all'
        chartStatusInstance.data.datasets = [{
            label: getMetricLabel(metric),
            data: labels.map(k => statusData[k]),
            backgroundColor: '#0b4f78',
            borderRadius: 6
        }];
    }
    chartStatusInstance.update();

    // 3. Timeline
    if (metric === 'all') {
        const dTotal = processTimelineData(data, 'hours');
        const dProj = processTimelineData(data, 'hoursProject');
        const dAdm = processTimelineData(data, 'hoursAdm');

        // Union of all keys/dates would be safer, but data is same source
        const keys = Object.keys(dTotal).sort();

        chartTimelineInstance.data.labels = keys;
        chartTimelineInstance.data.datasets = [
            {
                label: 'Horas Totais',
                data: keys.map(k => dTotal[k]),
                borderColor: '#0b4f78',
                backgroundColor: 'rgba(11, 79, 120, 0.1)',
                tension: 0.4,
                fill: false,
                pointRadius: 4
            },
            {
                label: 'Horas Projeto',
                data: keys.map(k => dProj[k]),
                borderColor: '#36A2EB',
                backgroundColor: 'rgba(54, 162, 235, 0.1)',
                tension: 0.4,
                fill: false,
                pointRadius: 4
            },
            {
                label: 'Horas ADM',
                data: keys.map(k => dAdm[k]),
                borderColor: '#FF9F40',
                backgroundColor: 'rgba(255, 159, 64, 0.1)',
                tension: 0.4,
                fill: false,
                pointRadius: 4
            }
        ];
    } else {
        const timelineData = processTimelineData(data, metric);
        const sortedKeys = Object.keys(timelineData).sort();
        chartTimelineInstance.data.labels = sortedKeys;
        chartTimelineInstance.data.datasets = [{
            label: getMetricLabel(metric),
            data: sortedKeys.map(k => timelineData[k]),
            borderColor: '#123e5d',
            backgroundColor: 'rgba(18, 62, 93, 0.1)',
            tension: 0.4,
            fill: true,
            pointBackgroundColor: '#fff',
            pointBorderColor: '#123e5d',
            pointRadius: 6,
            borderWidth: 3
        }];
    }
    chartTimelineInstance.update();

    // 4. Responsible vs Capacity
    const respMetric = (metric === 'all') ? 'hours' : metric;
    const newRespData = processResponsibleData(data, respMetric);
    chartResponsibleInstance.data.labels = newRespData.labels;
    chartResponsibleInstance.data.datasets = buildResponsibleDatasets(newRespData);
    chartResponsibleInstance.update();
}

// Helpers
function getMetricValue(item, metric) {
    const val = parseFloat(item[metric] || 0); // covers 'hours' and 'hoursAdm'
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

function processTimelineData(data, metric) {
    const res = {};
    data.forEach(d => {
        const val = getMetricValue(d, metric);
        // Date formatting for key (YYYY-MM-DD or DD/MM)
        // Let's use simplified date string
        if (d.date) {
            const k = d.date.toLocaleDateString('pt-BR');
            res[k] = (res[k] || 0) + val;
        }
    });
    return res;
}

function processResponsibleData(data, metric) {
    const monthMap = new Map();
    const personSet = new Set();
    const values = {};

    data.forEach(d => {
        if (!d.date) return;
        const y = d.date.getFullYear();
        const m = d.date.getMonth() + 1;
        const monthKey = `${y}-${String(m).padStart(2, '0')}`;
        // E.g. "jan/24"
        const label = d.date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });

        monthMap.set(monthKey, label);

        const person = d.owner || "Sem Responsável";
        personSet.add(person);

        const key = `${monthKey}|${person}`;
        const val = getMetricValue(d, metric);
        values[key] = (values[key] || 0) + val;
    });

    const sortedMonthKeys = [...monthMap.keys()].sort();
    const sortedPersons = [...personSet].sort();

    return {
        monthKeys: sortedMonthKeys,
        labels: sortedMonthKeys.map(k => monthMap.get(k)),
        persons: sortedPersons,
        values: values
    };
}

function buildResponsibleDatasets(processed) {
    const datasets = [];

    // 1. One dataset per Person
    processed.persons.forEach((person, idx) => {
        const dataPoints = processed.monthKeys.map(mKey => {
            const key = `${mKey}|${person}`;
            return processed.values[key] || 0;
        });

        datasets.push({
            label: person,
            data: dataPoints,
            backgroundColor: COLORS.charts[idx % COLORS.charts.length],
            borderRadius: 4,
            barPercentage: 0.6,
            categoryPercentage: 0.8
        });
    });

    // 2. Capacity Dataset (176h)
    const capacityData = processed.monthKeys.map(() => 176);
    datasets.push({
        label: 'Capacidade (176h)',
        data: capacityData,
        backgroundColor: '#9ca3af', // Gray-400
        borderRadius: 4,
        barPercentage: 0.6,
        categoryPercentage: 0.8,
        // Make it grouping with others? Yes standard bar.
    });

    return datasets;
}
