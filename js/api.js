/* =========================
   PPC Task Board - Serviço de API (Versão Direta Porta 5000)
   ========================= */

// Adicionamos a porta 5000 para pular o Apache e falar direto com o Flask
const API_BASE_URL = "https://ppc-gestao.brazilsouth.cloudapp.azure.com:5000";
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
       CHECKLIST (Removido o prefixo /api que não existe no Flask)
       ========================= */
    async getChecklist(demandaId) {
        const cleanId = String(demandaId).replace(/\D/g, ''); 
        if (!cleanId) throw new Error("ID da demanda inválido");

        // Chamada direta para o endpoint do Flask: /checklist/ID
        const resp = await fetch(`${API_BASE_URL}/checklist/${cleanId}`);
        
        if (!resp.ok) {
            console.error(`Erro ao buscar checklist ${cleanId}: Status ${resp.status}`);
            throw new Error("Falha ao carregar checklist");
        }
        return resp.json();
    },

    async createChecklistItem(demandaId, texto) {
        const cleanId = String(demandaId).replace(/\D/g, '');
        
        const resp = await fetch(`${API_BASE_URL}/checklist/`, { 
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

window.api = api;

/* =========================
   INICIALIZAÇÃO
   ========================= */
async function initApp() {
    console.log("Conectando ao Backend na porta 5000...");
    try {
        const [tarefas, apontamentos] = await Promise.all([
            api.getTasks(),
            api.getApontamentos()
        ]);
        console.log("✅ Dados sincronizados com sucesso!");
    } catch (error) {
        console.error("❌ Erro de conexão:", error);
    }
}

document.addEventListener("DOMContentLoaded", initApp);