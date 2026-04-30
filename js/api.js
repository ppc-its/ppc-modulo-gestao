const API_BASE_URL = "http://127.0.0.1:5000";
const LISTS_BASE_URL = `${API_BASE_URL}/lists`;

function _authHeaders() {
    const token = (typeof Auth !== 'undefined') ? Auth.getToken() : null;
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function _extractArray(data, ...keys) {
    if (Array.isArray(data)) return data;
    for (const k of keys) {
        if (Array.isArray(data[k])) return data[k];
    }
    return [];
}

const api = {
    async getTasks() {
        const resp = await fetch(`${LISTS_BASE_URL}/demandas`, { headers: _authHeaders() });
        if (!resp.ok) throw new Error(`Erro na API demandas: ${resp.status}`);
        const data = await resp.json();
        return _extractArray(data, "tasks", "demandas", "value", "items", "data", "results");
    },

    async updateTask(id, updates) {
        const payload = {};
        if (updates.status !== undefined) payload["Status"] = updates.status;

        const resp = await fetch(`${LISTS_BASE_URL}/demanda/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ..._authHeaders() },
            body: JSON.stringify(payload)
        });

        if (!resp.ok) throw new Error(`Erro na API: ${resp.status}`);
        return resp.json();
    },

    async getApontamentos() {
        const resp = await fetch(`${LISTS_BASE_URL}/apontamentos`, { headers: _authHeaders() });
        if (!resp.ok) throw new Error(`Erro na API apontamentos: ${resp.status}`);
        const data = await resp.json();
        return _extractArray(data, "apontamentos", "tasks", "value", "items", "data", "results");
    },

    async getChecklist(demandaId) {
        const cleanId = String(demandaId).replace(/\D/g, '');
        if (!cleanId) throw new Error("ID da demanda inválido");

        const resp = await fetch(`${LISTS_BASE_URL}/checklist/${cleanId}`, { headers: _authHeaders() });
        if (!resp.ok) throw new Error("Falha ao carregar checklist");
        return resp.json();
    },

    async createChecklistItem(demandaId, texto) {
        const cleanId = String(demandaId).replace(/\D/g, '');
        const resp = await fetch(`${LISTS_BASE_URL}/checklist/`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ..._authHeaders() },
            body: JSON.stringify({ demanda_id: Number(cleanId), tarefas: [texto] })
        });
        if (!resp.ok) throw new Error("Erro ao criar item do checklist");
        return resp.json();
    },

    async updateChecklistTitle(itemId, titulo) {
        const resp = await fetch(`${LISTS_BASE_URL}/checklist/${itemId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ..._authHeaders() },
            body: JSON.stringify({ titulo })
        });
        if (!resp.ok) throw new Error("Erro ao atualizar título do checklist");
        return resp.json();
    },

    async updateChecklistStatus(itemId, concluido) {
        const resp = await fetch(`${LISTS_BASE_URL}/checklist/${itemId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ..._authHeaders() },
            body: JSON.stringify({ concluido })
        });
        if (!resp.ok) throw new Error("Erro ao atualizar status do checklist");
        return resp.json();
    },

    async updateChecklistDate(itemId, Data) {
        const resp = await fetch(`${LISTS_BASE_URL}/checklist/${itemId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ..._authHeaders() },
            body: JSON.stringify({ Data })
        });
        if (!resp.ok) throw new Error("Erro ao atualizar data do checklist");
        return resp.json();
    },

    async deleteChecklistItem(itemId) {
        const resp = await fetch(`${LISTS_BASE_URL}/checklist/delet/${itemId}`, {
            method: "DELETE",
            headers: _authHeaders(),
        });
        if (!resp.ok) throw new Error("Erro ao excluir item do checklist");
        return resp.json();
    }
};

window.api = api;
