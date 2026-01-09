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
                        date: parseDate(t.dates?.end || t.dates?.start)
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

    APP_DATA.forEach(item => {
        if (item.client) clientSet.add(item.client);
        if (item.owner) ownerSet.add(item.owner);
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
        if (owner && item.owner !== owner) return false;

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
}

function updateCharts(data, metric) {
    // 1. Type
    const typeData = processTypeData(data, metric);
    chartTypeInstance.data.labels = Object.keys(typeData);
    chartTypeInstance.data.datasets[0].data = Object.values(typeData);
    chartTypeInstance.update();

    // 2. Status
    const statusData = processStatusData(data, metric);
    chartStatusInstance.data.labels = Object.keys(statusData);
    chartStatusInstance.data.datasets[0].label = getMetricLabel(metric);
    chartStatusInstance.data.datasets[0].data = Object.values(statusData);
    chartStatusInstance.update();

    // 3. Timeline
    const timelineData = processTimelineData(data, metric);
    const sortedKeys = Object.keys(timelineData).sort();
    chartTimelineInstance.data.labels = sortedKeys;
    chartTimelineInstance.data.datasets[0].label = getMetricLabel(metric);
    chartTimelineInstance.data.datasets[0].data = sortedKeys.map(k => timelineData[k]);
    chartTimelineInstance.update();
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
