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

    // Upload CSV removido
};

// Expor globalmente
window.api = api;

/* =========================
   INICIALIZAÇÃO AUTOMÁTICA
   Aciona as APIs ao carregar a página
   ========================= */



async function initApp() {
    console.log("Iniciando carregamento de dados...");
    const loadingOverlay = document.getElementById("loadingOverlay");

    // Garantir que o overlay apareça
    if (loadingOverlay) loadingOverlay.classList.remove("hidden");

    try {
        // Delay artificial de 3 segundos (solicitado pelo usuário para resolver problema de carregamento)
        await new Promise(r => setTimeout(r, 3000));

        // Promise.all executa ambas as chamadas simultaneamente
        const [tarefas, apontamentos] = await Promise.all([
            api.getTasks(),
            api.getApontamentos()
        ]);

        console.log("✅ Tarefas carregadas:", tarefas);
        console.log("✅ Apontamentos carregados:", apontamentos);

        // Envia dados para o app.js processar e renderizar
        if (window.updateTasksFromApi) {
            window.updateTasksFromApi(tarefas, apontamentos);
        } else {
            console.error("❌ Função window.updateTasksFromApi não encontrada em app.js");
        }

    } catch (error) {
        console.error("❌ Erro na inicialização:", error);
        alert("Não foi possível conectar ao servidor Flask ou carregar os dados. Verifique a conexão.");
    } finally {
        // Esconder overlay independentemente do sucesso ou falha
        if (loadingOverlay) loadingOverlay.classList.add("hidden");
    }
}
