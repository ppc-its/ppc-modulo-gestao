function renderChecklist(task, container) {
  if (!task.checklist) task.checklist = [];

  container.innerHTML = `
    <div class="checklist-title">
      <span>✅</span> Checklist da Demanda
    </div>
    <div class="checklist-items"></div>
    <div class="checklist-input-row">
      <span style="font-size:16px;">➕</span>
      <input type="text" class="checklist-add-input" placeholder="Adicionar nova etapa (Enter)...">
    </div>
  `;

  const itemsContainer = container.querySelector(".checklist-items");

  task.checklist.forEach(item => {
    const itemEl = document.createElement("div");
    itemEl.className = "checklist-item";

    itemEl.innerHTML = `
      <input type="checkbox" class="checklist-checkbox" ${item.done ? "checked" : ""}>
      <input type="text" class="checklist-text ${item.done ? "done" : ""}" value="${escapeHTML(item.text)}">
      <input type="date" class="checklist-date" value="${formatDateForInput(item.date)}" title="Definir data de conclusão" />
      <button class="checklist-delete" title="Excluir item">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
      </button>
    `;

    itemEl.querySelector(".checklist-delete").addEventListener("click", async () => {
      const confirmed = await showDeleteConfirm(item.text);
      if (!confirmed) return;

      try {
        itemEl.style.opacity = "0.5";
        itemEl.style.pointerEvents = "none";
        await api.deleteChecklistItem(item.id);
        task.checklist = task.checklist.filter(i => i.id !== item.id);
        renderChecklist(task, container);
      } catch (err) {
        itemEl.style.opacity = "1";
        itemEl.style.pointerEvents = "auto";
        alert("Não foi possível excluir o item do checklist.");
      }
    });

    const checkbox = itemEl.querySelector(".checklist-checkbox");
    checkbox.addEventListener("change", async () => {
      item.done = checkbox.checked;
      itemEl.querySelector(".checklist-text").classList.toggle("done", item.done);
      await api.updateChecklistStatus(item.id, item.done);
    });

    const textInput = itemEl.querySelector(".checklist-text");
    textInput.addEventListener("blur", async () => {
      const novoTexto = textInput.value.trim();
      if (novoTexto && novoTexto !== item.text) {
        item.text = novoTexto;
        await api.updateChecklistTitle(item.id, novoTexto);
      }
    });

    const dateInput = itemEl.querySelector(".checklist-date");
    dateInput.addEventListener("change", async () => {
      const novaData = dateInput.value;
      if (novaData !== item.date) {
        item.date = novaData;
        try {
          await api.updateChecklistDate(item.id, novaData);
        } catch (_) {}
      }
    });

    itemsContainer.appendChild(itemEl);
  });

  const addInput = container.querySelector(".checklist-add-input");
  addInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && addInput.value.trim()) {
      await api.createChecklistItem(task.id, addInput.value.trim());
      task.checklist = await loadChecklistFromAPI(task.id);
      renderChecklist(task, container);
    }
  });
}

async function loadChecklistFromAPI(demandaId) {
  try {
    const data = await api.getChecklist(demandaId);
    return data.tarefas.map(item => ({
      id: item.id,
      text: item.titulo,
      done: item.concluido === true,
      date: item.Data || item.data || ""
    }));
  } catch (_) {
    return [];
  }
}

function formatDateForInput(dateString) {
  if (!dateString) return "";
  const [datePart] = dateString.split(" ");
  const [dia, mes, ano] = datePart.split("/");
  return `${ano}-${mes}-${dia}`;
}

function showDeleteConfirm(itemText) {
  return new Promise((resolve) => {
    const existing = document.getElementById('checklist-confirm-modal');
    if (existing) existing.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'checklist-confirm-modal';
    backdrop.className = 'cl-confirm-backdrop';
    backdrop.innerHTML = `
      <div class="cl-confirm-box" role="dialog" aria-modal="true">
        <div class="cl-confirm-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </div>
        <h3 class="cl-confirm-title">Excluir etapa?</h3>
        <p class="cl-confirm-desc">"${escapeHTML(itemText)}"</p>
        <p class="cl-confirm-sub">Esta ação não pode ser desfeita.</p>
        <div class="cl-confirm-actions">
          <button class="cl-btn-cancel">Cancelar</button>
          <button class="cl-btn-delete">Excluir</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('cl-confirm-visible'));

    const close = (result) => {
      backdrop.classList.remove('cl-confirm-visible');
      setTimeout(() => backdrop.remove(), 250);
      resolve(result);
    };

    backdrop.querySelector('.cl-btn-delete').addEventListener('click', () => close(true));
    backdrop.querySelector('.cl-btn-cancel').addEventListener('click', () => close(false));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(false); });

    const onKey = (e) => {
      if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); close(false); }
    };
    document.addEventListener('keydown', onKey);
  });
}
