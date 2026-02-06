/* =========================
   PPC Task Board - Serviço de API
   Centraliza todas as chamadas de fetch para o Backend Python/Flask
   ========================= */

const API_BASE_URL = "https://ppc-gestao.brazilsouth.cloudapp.azure.com";
const LISTS_BASE_URL = `${API_BASE_URL}/lists`;

const api = {
    /* =========================
       DEMANDAS
       ========================= */
    async getTasks() {
        const resp = await fetch(`${LISTS_BASE_URL}/demandas`);
        if (!resp.ok) throw new Error(`Erro na API: ${resp.status}`);
        const data = await resp.json();
        return Array.isArray(data) ? data : (data.tasks || []);
    },

    async updateTask(id, updates) {
        const payload = {};
        if (updates.status !== undefined) {
            payload["Status"] = updates.status;
        }

        const resp = await fetch(`${LISTS_BASE_URL}/demanda/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!resp.ok) throw new Error(`Erro na API: ${resp.status}`);
        return resp.json();
    },

    /* =========================
       APONTAMENTOS
       ========================= */
    async getApontamentos() {
        const resp = await fetch(`${LISTS_BASE_URL}/apontamentos`);
        if (!resp.ok) throw new Error(`Erro na API: ${resp.status}`);
        const data = await resp.json();
        return Array.isArray(data) ? data : (data.apontamentos || []);
    },

    /* =========================
       CHECKLIST
       ========================= */

/* =========================
   CHECKLIST (Versão Corrigida)
   ========================= */

    async getChecklist(demandaId) {
        const cleanId = String(demandaId).replace(/\D/g, ''); 
        
        if (!cleanId) throw new Error("ID da demanda inválido");

        const resp = await fetch(`${API_BASE_URL}/checklist/${cleanId}`);
        
        if (!resp.ok) {
            console.error(`Erro ao buscar checklist ${cleanId}: Status ${resp.status}`);
            throw new Error("Falha ao carregar checklist");
        }
        return resp.json();
    },

    async createChecklistItem(demandaId, texto) {
        const cleanId = String(demandaId).replace(/\D/g, '');
        
        const resp = await fetch(`${API_BASE_URL}/checklist/`, { // Verifique se precisa da / final
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                demanda_id: Number(cleanId),
                tarefas: [texto]
            })
        });

        if (!resp.ok) throw new Error("Erro ao criar item do checklist");
        return resp.json();
    },

    async updateChecklistTitle(itemId, titulo) {
        const resp = await fetch(`${API_BASE_URL}/checklist/${itemId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ titulo })
        });

        if (!resp.ok) throw new Error("Erro ao atualizar título do checklist");
        return resp.json();
    },

    async updateChecklistStatus(itemId, concluido) {
        const resp = await fetch(`${API_BASE_URL}/checklist/${itemId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ concluido })
        });

        if (!resp.ok) throw new Error("Erro ao atualizar status do checklist");
        return resp.json();
    }
};

// Expor globalmente
window.api = api;


/* =========================
   INICIALIZAÇÃO AUTOMÁTICA
   Aciona as APIs ao carregar a página
   ========================= */

async function initApp() {
    console.log("Iniciando carregamento de dados...");
    try {
        // Promise.all executa ambas as chamadas simultaneamente
        const [tarefas, apontamentos] = await Promise.all([
            api.getTasks(),
            api.getApontamentos()
        ]);

        console.log("✅ Tarefas carregadas:", tarefas);
        console.log("✅ Apontamentos carregados:", apontamentos);

    } catch (error) {
        console.error("❌ Erro na inicialização:", error);
        alert("Não foi possível conectar ao servidor Flask.");
    }
}

// Escuta o evento de carregamento do DOM para rodar a função
document.addEventListener("DOMContentLoaded", initApp);
