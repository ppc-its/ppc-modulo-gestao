/* =========================
   PPC Task Board - Serviço de API
   Centraliza todas as chamadas de fetch para o Backend Python/Flask
   ========================= */

const API_BASE_URL = "http://localhost:5000/lists"; // Ajuste a porta se necessário

const api = {
    /**
     * Busca todas as tarefas do backend
     * GET /api/tasks
     */
    async getTasks() {
        try {
            const resp = await fetch(`${API_BASE_URL}/demandas`);
            if (!resp.ok) throw new Error(`Erro na API: ${resp.status}`);
            const data = await resp.json();
            // Esperando { tasks: [...] } ou apenas [...]
            // Ajuste com base na resposta real. Assumindo lista ou objeto com chave tasks.
            return Array.isArray(data) ? data : (data.tasks || []);
        } catch (e) {
            console.error("Falha ao trazer tarefas:", e);
            throw e;
        }
    },

    async getApontamentos() {
        try {
            const resp = await fetch(`${API_BASE_URL}/apontamentos`);
            if (!resp.ok) throw new Error(`Erro na API: ${resp.status}`);
            const data = await resp.json();
            // Esperando { tasks: [...] } ou apenas [...]
            // Ajuste com base na resposta real. Assumindo lista ou objeto com chave tasks.
            return Array.isArray(data) ? data : (data.tasks || []);
        } catch (e) {
            console.error("Falha ao as Datas e horas trabalhadas:", e);
            throw e;
        }
    },


    /**
     * Atualiza uma tarefa específica (ex: mudança de status)
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

            if (!resp.ok) throw new Error(`Erro na API: ${resp.status}`);

            return await resp.json();
        } catch (e) {
            console.error(`Falha ao atualizar tarefa ${id}:`, e);
            throw e;
        }
    },

    /**
     * Envia arquivo CSV para o backend para processamento
     * POST /api/upload_csv
     * Retorna: Lista de tarefas atualizada (ou buscamos novamente)
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
