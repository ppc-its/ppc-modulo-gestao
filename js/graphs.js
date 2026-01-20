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

// Register plugin if available
if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
}

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
                    // Extract assignments
                    const assignments = [];
                    ROLE_MAPPINGS.forEach(map => {
                        const name = (t.raw?.[map.nameKey] || "").trim();
                        if (name) {
                            // Only add if name exists
                            // Parse specific hours if available, else 0?
                            // For visualization "Responsible vs Capacity", we want "Horas Projeto" + "Horas Adm" typically?
                            // Or just "Horas Totais" for that person?
                            // Logic: Total for Person = Proj + Adm specific to them.
                            let hProj = 0;
                            let hAdm = 0;
                            if (map.hoursKey) hProj = parseFloat(t.raw?.[map.hoursKey] || 0);
                            if (map.admKey) hAdm = parseFloat(t.raw?.[map.admKey] || 0);

                            // fallback safety: if keys exist but NaN, 0.
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

                    // Map app.js structure to graphs.js structure
                    return {
                        client: t.raw?.["Nome Cliente"] || t.title || "Sem Cliente",
                        owner: t.responsible || "Sem Responsável", // Primary owner still useful for some things?
                        assignments: assignments, // NEW: All involved people
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
                    font: {
                        weight: 'bold',
                        size: 14
                    },
                    formatter: (value, ctx) => {
                        let sum = 0;
                        let dataArr = ctx.chart.data.datasets[0].data;
                        dataArr.map(data => {
                            sum += data;
                        });
                        let percentage = (value * 100 / sum).toFixed(1) + "%";
                        // Only show if > 5% to avoid clutter, or if user really wants all... 
                        // User said "sempre na tela" but "visual e bonito". 
                        // Too many small slices = ugly. Let's threshold at 3%.
                        if ((value * 100 / sum) < 3) return "";
                        return percentage;
                    },
                    display: true
                }
            }
        },
        plugins: [ChartDataLabels] // Activate for this chart
    });

    // Common DataLabels Defaults for Bars/Lines
    const commonDataLabels = {
        color: '#333',
        font: {
            weight: 'bold',
            size: 13, // Increased from 11
            family: 'ui-sans-serif, system-ui'
        },
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
                    offset: -4, // Adjustment for larger font
                    color: '#0b4f78',
                    font: { weight: '900', size: 14 } // Extra bold for status
                }
            }
        },
        plugins: [ChartDataLabels]
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
            plugins: {
                legend: { display: true },
                datalabels: {
                    display: 'auto',
                    backgroundColor: '#fff',
                    borderRadius: 4,
                    color: '#123e5d',
                    font: { weight: 'bold', size: 10 },
                    padding: 4,
                    align: 'top',
                    offset: 4
                }
            }
        },
        plugins: [ChartDataLabels]
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
            indexAxis: 'x',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    stacked: true,
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                x: {
                    stacked: true,
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { position: 'top' },
                tooltip: { mode: 'index', intersect: false },
                datalabels: {
                    color: '#fff',
                    font: { weight: "bold", size: 12 }, // Increased from 10
                    textStrokeColor: 'rgba(0,0,0,0.5)', // Add contrast
                    textStrokeWidth: 2,
                    formatter: (value, ctx) => {
                        if (Math.abs(value) < 1) return "";
                        return Math.round(value);
                    },
                    display: (ctx) => {
                        const v = ctx.dataset.data[ctx.dataIndex];
                        return Math.abs(v) > 2; // Keep hiding tiny slivers
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

    if (chartResponsibleInstance) {
        chartResponsibleInstance.destroy();
    }

    const ctxResp = document.getElementById('chartResponsible').getContext('2d');

    if (viewMode === 'aggregated') {
        const aggData = processResponsibleAggregatedData(data, respMetric);

        chartResponsibleInstance = new Chart(ctxResp, {
            type: 'bar',
            data: {
                labels: aggData.labels,
                datasets: buildResponsibleAggregatedDatasets(aggData)
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        stacked: true,
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    y: {
                        stacked: true,
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { position: 'top' },
                    tooltip: { mode: 'index', intersect: false },
                    datalabels: {
                        color: '#fff',
                        font: { weight: "bold", size: 10 },
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
    } else {
        const newRespData = processResponsibleData(data, respMetric);

        chartResponsibleInstance = new Chart(ctxResp, {
            type: 'bar',
            data: {
                labels: newRespData.labels,
                datasets: buildResponsibleDatasets(newRespData)
            },
            options: {
                indexAxis: 'x',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    x: {
                        stacked: true,
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { position: 'top' },
                    tooltip: { mode: 'index', intersect: false },
                    datalabels: {
                        color: '#fff',
                        font: { weight: "bold", size: 10 },
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
    const monthlyTotals = {};
    const uniquePersonsPerMonth = {};

    data.forEach(d => {
        if (!d.date) return;
        const y = d.date.getFullYear();
        const m = d.date.getMonth() + 1;
        const monthKey = `${y}-${String(m).padStart(2, '0')}`;
        const label = d.date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });

        monthMap.set(monthKey, label);

        // Iterate assignments instead of just 'owner'
        // If no assignments (e.g. old data), fallback?
        // Assignments should be populated.
        d.assignments.forEach(assign => {
            if (!assign.person) return;

            // Filter out roles that don't track hours (Sócio/Gerente) from the VISUAL chart if they have 0 hours?
            // Users usually only want to see people who have load.
            // But if they have hours, show them.

            const person = assign.person;
            personSet.add(person);

            // Determine value for this person/role
            let val = 0;
            if (metric === 'hours') val = assign.hoursTotal;
            else if (metric === 'hoursAdm') val = assign.hoursAdm;
            else if (metric === 'hoursProject') val = assign.hoursProject;
            else val = assign.hoursTotal; // default

            const key = `${monthKey}|${person}`;
            values[key] = (values[key] || 0) + val;

            // Totais
            monthlyTotals[monthKey] = (monthlyTotals[monthKey] || 0) + val;

            // Capacity Unique Track
            if (!uniquePersonsPerMonth[monthKey]) {
                uniquePersonsPerMonth[monthKey] = new Set();
            }
            // Only add to capacity if it's a technical role (has hours)
            // Sócio/Gerente are usually oversight. 
            // We check if the role is NOT Sócio or Gerente
            if (assign.role !== 'Sócio' && assign.role !== 'Gerente') {
                uniquePersonsPerMonth[monthKey].add(person);
            }
        });

        // Fallback for legacy data without assignments structure?
        if (d.assignments.length === 0 && d.owner) {
            // Treat as generic 'owner' with total hours (legacy behavior)
            const person = d.owner;
            personSet.add(person);
            const val = getMetricValue(d, metric);
            const key = `${monthKey}|${person}`;
            values[key] = (values[key] || 0) + val;
            monthlyTotals[monthKey] = (monthlyTotals[monthKey] || 0) + val;
            if (!uniquePersonsPerMonth[monthKey]) uniquePersonsPerMonth[monthKey] = new Set();
            uniquePersonsPerMonth[monthKey].add(person);
        }
    });

    const sortedMonthKeys = [...monthMap.keys()].sort();
    const sortedPersons = [...personSet].sort();

    // Calculate Monthly Capacity
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

function processResponsibleAggregatedData(data, metric) {
    const monthMap = new Map();
    const values = {};
    const uniquePersonsPerMonth = {};

    data.forEach(d => {
        if (!d.date) return;
        const y = d.date.getFullYear();
        const m = d.date.getMonth() + 1;
        const monthKey = `${y}-${String(m).padStart(2, '0')}`;
        const label = d.date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });

        monthMap.set(monthKey, label);

        // Sum metric from assignments
        d.assignments.forEach(assign => {
            let val = 0;
            if (metric === 'hours') val = assign.hoursTotal;
            else if (metric === 'hoursAdm') val = assign.hoursAdm;
            else if (metric === 'hoursProject') val = assign.hoursProject;
            else val = assign.hoursTotal;

            values[monthKey] = (values[monthKey] || 0) + val;

            if (!uniquePersonsPerMonth[monthKey]) uniquePersonsPerMonth[monthKey] = new Set();

            // Only add capacity for technical roles
            if (assign.role !== 'Sócio' && assign.role !== 'Gerente' && assign.person) {
                uniquePersonsPerMonth[monthKey].add(assign.person);
            }
        });

        // Legacy fallback
        if (d.assignments.length === 0 && d.owner) {
            const val = getMetricValue(d, metric);
            values[monthKey] = (values[monthKey] || 0) + val;
            if (!uniquePersonsPerMonth[monthKey]) uniquePersonsPerMonth[monthKey] = new Set();
            uniquePersonsPerMonth[monthKey].add(d.owner);
        }
    });

    const sortedMonthKeys = [...monthMap.keys()].sort();

    // Calculate capacity per month
    // Capacity = UniquePersons * 176
    const capacity = {};
    sortedMonthKeys.forEach(key => {
        const count = uniquePersonsPerMonth[key] ? uniquePersonsPerMonth[key].size : 0;
        capacity[key] = count * 176;
    });

    return {
        monthKeys: sortedMonthKeys,
        labels: sortedMonthKeys.map(k => monthMap.get(k)),
        values: values,
        capacity: capacity
    };
}

function buildResponsibleAggregatedDatasets(processed) {
    const sortedKeys = processed.monthKeys;

    // 1. Total Hours
    const totalData = sortedKeys.map(k => processed.values[k] || 0);

    // 2. Total Capacity
    const capacityData = sortedKeys.map(k => processed.capacity[k] || 0);

    // 3. Balance (Horas Totais - Capacidade)
    const balanceData = sortedKeys.map(k => {
        const tot = processed.values[k] || 0;
        const cap = processed.capacity[k] || 0;
        return tot - cap;
    });

    return [
        {
            label: 'Horas Totais (Equipe)',
            data: totalData,
            backgroundColor: '#0b4f78',
            stack: 'actual',
            borderRadius: 4,
            barPercentage: 0.6,
            categoryPercentage: 0.8
        },
        {
            label: 'Capacidade Total (Soma)',
            data: capacityData,
            backgroundColor: '#9ca3af', // Gray-400
            stack: 'capacity',
            borderRadius: 4,
            barPercentage: 0.6,
            categoryPercentage: 0.8
        },
        {
            label: 'Horas Restantes (Saldo)',
            data: balanceData,
            backgroundColor: '#9966FF', // Purple
            stack: 'balance',
            borderRadius: 4,
            barPercentage: 0.6,
            categoryPercentage: 0.8
        }
    ];
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
            stack: 'actual',
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
        stack: 'capacity',
        borderRadius: 4,
        barPercentage: 0.6,
        categoryPercentage: 0.8,
        // Make it grouping with others? Yes standard bar.
    });

    // 3. Balance Dataset (Total - Capacity)
    // "pilar de horas restantes (Horas Totais - Capacidade)"
    const balanceData = processed.monthKeys.map(k => {
        const total = processed.monthlyTotals[k] || 0;
        const cap = processed.monthlyCapacity[k] || 0;
        return total - cap;
    });
    datasets.push({
        label: 'Horas Restantes (Saldo)',
        data: balanceData,
        backgroundColor: '#9966FF', // Purple
        stack: 'balance',
        borderRadius: 4,
        barPercentage: 0.6,
        categoryPercentage: 0.8
    });

    return datasets;
}
