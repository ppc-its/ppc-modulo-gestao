/* =========================
   PPC Task Board - Serviço de API
   Centraliza todas as chamadas de fetch para o Backend Python/Flask
   ========================= */

const API_BASE_URL = "/lists"; // Proxy reverso do Apache2

const api = {
    /**
     * Busca todas as tarefas do backend
     * GET /lists/demandas
     */
    async getTasks() {
        try {
            const resp = await fetch(`${API_BASE_URL}/demandas`);
            if (!resp.ok) throw new Error(`Erro na API: ${resp.status}`);
            const data = await resp.json();
            return Array.isArray(data) ? data : (data.tasks || []);
        } catch (e) {
            console.error("Falha ao buscar tarefas:", e);
            throw e;
        }
    },

    /**
     * Atualiza uma tarefa específica (ex: mudança de status)
     * PATCH /lists/demanda/:id
     */
    async updateTask(id, updates) {
        try {
            const payload = {};

            if (updates.status !== undefined) {
                payload["Status"] = updates.status;
            }

            const resp = await fetch(`${API_BASE_URL}/demanda/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!resp.ok) throw new Error(`Erro na API: ${resp.status}`);

            return await resp.json();
        } catch (e) {
            console.error(`Falha ao atualizar tarefa ${id}:`, e);
            throw e;
        }
    },

    /**
     * Envia arquivo CSV para o backend para processamento
     * POST /lists/upload_csv
     */
    async uploadCSV(file) {
        const formData = new FormData();
        formData.append("file", file);

        try {
            const resp = await fetch(`${API_BASE_URL}/upload_csv`, {
                method: "POST",
                body: formData
            });
            if (!resp.ok) throw new Error(`Falha no Upload: ${resp.status}`);
            return await resp.json();
        } catch (e) {
            console.error("Upload de CSV falhou:", e);
            throw e;
        }
    }
};

// Expor globalmente
window.api = api;
