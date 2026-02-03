/* =========================
   PPC Task Board - Serviço de API
   Centraliza todas as chamadas de fetch para o Backend Python/Flask
   ========================= */

const API_BASE_URL = "http://localhost:5000/lists";

const api = {
    async getTasks() {
        try {
            const resp = await fetch(`${API_BASE_URL}/demandas`);
            if (!resp.ok) throw new Error(`Erro na API: ${resp.status}`);
            const data = await resp.json();
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
            const apontamentos = await resp.json();
            return Array.isArray(apontamentos) ? apontamentos : (apontamentos.apontamentos || []);
        } catch (e) {
            console.error("Falha ao buscar apontamentos:", e);
            throw e;
        }
    },

    async updateTask(id, updates) {
        try {
            const payload = {};
            if (updates.status !== undefined) {
                payload["field_28"] = updates.status;
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

// Inicialização automática removida. O controle agora é feito pelo app.js via init().