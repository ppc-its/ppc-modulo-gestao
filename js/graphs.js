/* =========================
   PPC Task Board - Graphs
   Dummy data for visualization
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

document.addEventListener("DOMContentLoaded", () => {
    initCharts();
});

function initCharts() {
    // 1. Demand Type Distribution (Doughnut)
    const ctxType = document.getElementById('chartType').getContext('2d');
    new Chart(ctxType, {
        type: 'doughnut',
        data: {
            labels: ['Intelidados', 'Cyber', 'Auditoria TI', 'Consul. TI', 'Demanda Int.'],
            datasets: [{
                data: [12, 19, 8, 15, 6],
                backgroundColor: [
                    '#0b5d8a',
                    '#123e5d',
                    '#0C9DE4',
                    '#4bc0c0',
                    '#9ca3af'
                ],
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

    // 2. Hours by Status (Bar)
    const ctxStatus = document.getElementById('chartStatus').getContext('2d');
    new Chart(ctxStatus, {
        type: 'bar',
        data: {
            labels: ['Backlog', 'Blocked', 'Doing', 'Testing', 'Done'],
            datasets: [{
                label: 'Horas Totais',
                data: [120, 45, 200, 80, 310],
                backgroundColor: '#0b4f78',
                borderRadius: 6
            }, {
                label: 'Horas ADM',
                data: [40, 10, 60, 30, 90],
                backgroundColor: '#0C9DE4',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                x: {
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { position: 'top', align: 'end' }
            }
        }
    });

    // 3. Timeline (Line)
    const ctxTimeline = document.getElementById('chartTimeline').getContext('2d');
    new Chart(ctxTimeline, {
        type: 'line',
        data: {
            labels: ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'],
            datasets: [{
                label: 'Demandas Entregues',
                data: [5, 12, 8, 15],
                borderColor: '#123e5d',
                backgroundColor: 'rgba(18, 62, 93, 0.1)',
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#123e5d',
                pointRadius: 6,
                borderWidth: 3
            }, {
                label: 'Novas Demandas',
                data: [8, 10, 14, 12],
                borderColor: '#0C9DE4',
                backgroundColor: 'transparent',
                tension: 0.4,
                borderDash: [5, 5],
                pointRadius: 0,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index',
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                x: {
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { display: true }
            }
        }
    });
}
