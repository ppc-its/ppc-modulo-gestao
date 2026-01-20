/* =========================
   PPC Task Board - API Service
   Centralizes all fetch calls to the Python/Flask Backend
   ========================= */

const API_BASE_URL = "http://localhost:5000/lists"; // Adjust port if needed

const api = {
    /**
     * Fetch all tasks from the backend
     * GET /api/tasks
     */
    async getTasks() {
        try {
            const resp = await fetch(`${API_BASE_URL}/demandas`);
            if (!resp.ok) throw new Error(`API Error: ${resp.status}`);
            const data = await resp.json();
            // Expecting { tasks: [...] } or just [...]
            // Adjust based on actual response. Assuming list or object with tasks key.
            return Array.isArray(data) ? data : (data.tasks || []);
        } catch (e) {
            console.error("Failed to fetch tasks:", e);
            throw e;
        }
    },

    /**
     * Update a specific task (e.g. status change)
     * PUT /api/tasks/:id
     */
    async updateTask(id, updates) {
        try {
            // Mapear status → field_28
            const payload = {};

            if (updates.status !== undefined) {
                payload["field_28"] = updates.status; // obrigatório para o backend
            }

            const resp = await fetch(`${API_BASE_URL}/demanda/${id}`, {
                method: "PATCH", // PATCH mesmo, não PUT
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!resp.ok) throw new Error(`API Error: ${resp.status}`);

            return await resp.json();
        } catch (e) {
            console.error(`Failed to update task ${id}:`, e);
            throw e;
        }
    },

    /**
     * Upload CSV file to backend for processing
     * POST /api/upload_csv
     * Returns: Updated task list (or we re-fetch)
     */
    async uploadCSV(file) {
        const formData = new FormData();
        formData.append("file", file);

        try {
            const resp = await fetch(`${API_BASE_URL}/upload_csv`, {
                method: "POST",
                body: formData
            });
            if (!resp.ok) throw new Error(`Upload Failed: ${resp.status}`);
            return await resp.json();
        } catch (e) {
            console.error("CSV Upload failed:", e);
            throw e;
        }
    }
};

// Expose globally
window.api = api;
