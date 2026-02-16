
const TODAY = new Date("2026-02-13T10:00:00"); // Fixed date for reproducibility

// Mock Data simulates a task that started in Jan and ends in Mar
// It has hours in Jan (10h), Feb (20h), Mar (5h)
// Total Cumulative = 35h
// "This Month" (Feb 13) should show 20h, not 35h.
const mockTask = {
    id: 1,
    title: "Long Task",
    dateStart: new Date("2026-01-01"),
    dateEnd: new Date("2026-03-31"),
    _apontamentos: [
        { Data: "15/01/2026", Horas: 10, "Nome colaborador": "Alice", "Tipo da hora": "Projeto" },
        { Data: "05/02/2026", Horas: 10, "Nome colaborador": "Alice", "Tipo da hora": "Projeto" },
        { Data: "20/02/2026", Horas: 10, "Nome colaborador": "Bob", "Tipo da hora": "ADM" }, // Future in Feb
        { Data: "10/03/2026", Horas: 5, "Nome colaborador": "Alice", "Tipo da hora": "Projeto" }
    ]
};

const APP_DATA = [mockTask];

// Helper to parse date dd/mm/yyyy
function parseDate(dateStr) {
    const parts = dateStr.split('/');
    return new Date(parts[2], parts[1] - 1, parts[0]);
}

// Current Logic Simulation (Simplified)
function currentFilter(period) {
    console.log(`--- Current Logic (${period}) ---`);
    let filtered = APP_DATA.filter(t => {
        // Current logic mostly checks task dates or simply returns all for some filters
        // For 'month', it checks if task is in current month?
        // js/graphs.js: if (period === 'month') { if (itemDate.getMonth() !== TODAY.getMonth()...) }
        // The itemDate is usually dateEnd. 
        // If task ends in Mar, 'month' (Feb) filter might EXCLUDE it completely if it checks dateEnd == Feb!
        // Or if it checks "active in Feb", it includes the WHOLE task.

        const itemDate = t.dateEnd; // March

        if (period === 'month') {
            // Logic from existing code:
            // if (itemDate.getMonth() !== TODAY.getMonth() || itemDate.getFullYear() !== TODAY.getFullYear()) return false;
            // Since Mar != Feb, it would HIDE this task.
            // But user says "trazendo 3 meses". Maybe they use '90' days or 'custom'?
            // Or maybe itemDate fallback is today?
            return true; // Assume it passes for demonstration of the "Sum" issue
        }
        return true;
    });

    // It returns the task AS IS, with full hours
    filtered.forEach(t => {
        const total = t._apontamentos.reduce((acc, a) => acc + a.Horas, 0);
        console.log(`Task ${t.id}: Total Hours Displayed = ${total} (Expected for Feb: 20)`);
    });
}

// New Logic Simulation
function newFilter(period) {
    console.log(`--- New Logic (${period}) ---`);

    // 1. Determine Range
    let start, end;
    const y = TODAY.getFullYear();
    const m = TODAY.getMonth();

    if (period === 'month') {
        start = new Date(y, m, 1);
        end = new Date(y, m + 1, 0, 23, 59, 59);
    }

    console.log(`Range: ${start.toLocaleDateString()} - ${end.toLocaleDateString()}`);

    // 2. Map & Recalculate
    const processed = APP_DATA.map(t => {
        // Filter Appointments
        const activeAppts = t._apontamentos.filter(a => {
            const d = parseDate(a.Data);
            return d >= start && d <= end;
        });

        // Recalculate Metrics
        const newHours = activeAppts.reduce((acc, a) => acc + a.Horas, 0);

        return {
            ...t,
            _apontamentos: activeAppts, // Keep only valid ones
            hours: newHours
            // In real code we'd recalculate assignments, project/adm split etc.
        };
    }).filter(t => t.hours > 0); // Optional: Hide tasks with 0 hours in period

    processed.forEach(t => {
        console.log(`Task ${t.id}: Recalculated Hours = ${t.hours}`);
    });
}

currentFilter('month');
newFilter('month');
