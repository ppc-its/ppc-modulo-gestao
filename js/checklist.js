/* =========================
   PPC Task Board - checklist.js
   ========================= */

function renderChecklist(task, container) {
  if (!task.checklist) task.checklist = [];

  container.innerHTML = `
    <div class="checklist-title">
      <span>✅</span> Checklist da Demanda
    </div>
    <div class="checklist-items" id="checklistItems"></div>
    <div class="checklist-input-row">
      <span style="font-size:16px;">➕</span>
      <input type="text" class="checklist-add-input" placeholder="Adicionar nova etapa (Enter)..." id="checklistInput">
    </div>
  `;

  const itemsContainer = container.querySelector("#checklistItems");

  task.checklist.forEach((item, index) => {
    const itemEl = document.createElement("div");
    itemEl.className = "checklist-item";
    itemEl.innerHTML = `
      <input type="checkbox" class="checklist-checkbox" ${item.done ? "checked" : ""}>
      <input type="text" class="checklist-text ${item.done ? "done" : ""}" value="${escapeHTML(item.text)}">
      <button class="checklist-delete" title="Remover item">✖</button>
    `;

    const checkbox = itemEl.querySelector(".checklist-checkbox");
    checkbox.addEventListener("change", () => {
      item.done = checkbox.checked;
      itemEl.querySelector(".checklist-text").classList.toggle("done", item.done);
      saveChecklist(task);
    });

    const textInput = itemEl.querySelector(".checklist-text");
    textInput.addEventListener("change", () => {
      item.text = textInput.value;
      saveChecklist(task);
    });

    const delBtn = itemEl.querySelector(".checklist-delete");
    delBtn.addEventListener("click", () => {
      task.checklist.splice(index, 1);
      saveChecklist(task);
      renderChecklist(task, container); 
    });

    itemsContainer.appendChild(itemEl);
  });

  const addInput = container.querySelector("#checklistInput");
  addInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && addInput.value.trim()) {
      task.checklist.push({ text: addInput.value.trim(), done: false });
      saveChecklist(task);
      renderChecklist(task, container);
      setTimeout(() => {
        const newInput = document.querySelector("#checklistInput");
        if (newInput) newInput.focus();
      }, 0);
    }
  });
}

async function loadChecklistFromAPI(demandaId) {
    try {
        const id = Number(demandaId);
        const response = await fetch(`http://localhost:5000/checklist/${id}`);
        
        if (!response.ok) throw new Error("Falha ao carregar checklist");
        
        const data = await response.json();
        
        return data.tarefas.map(item => ({
            id: item.id,
            text: item.titulo,
            done: false 
        }));
    } catch (error) {
        console.error("Erro ao buscar checklist:", error);
        return [];
    }
}

async function saveChecklist(task) {
  // 1. Persistência Local (mantém o que você já tinha)
  if (typeof saveToLocalStorage === "function") {
    saveToLocalStorage(tasks); 
  }

  // 2. Preparação dos dados para a API
  // Extraímos apenas o texto das tarefas conforme seu exemplo
  const payload = {
    demanda_id: Number(task.id), // Certifique-se que o id da task é numérico ou compatível
    tarefas: task.checklist.map(item => item.text)
  };

  // 3. Chamada da API
  try {
    const response = await fetch("http://localhost:5000/checklist/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Erro na API: ${response.statusText}`);
    }

    console.log(`Checklist da demanda ${task.id} sincronizado com sucesso.`);
  } catch (error) {
    console.error("Erro ao salvar checklist na API:", error);
    // Opcional: Mostrar um aviso visual para o usuário
  }
}