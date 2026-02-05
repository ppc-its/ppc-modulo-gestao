/* =========================
   PPC Task Board - checklist.js
   ========================= */

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
    `;

    const checkbox = itemEl.querySelector(".checklist-checkbox");
    checkbox.addEventListener("change", async () => {
      item.done = checkbox.checked;
      itemEl.querySelector(".checklist-text").classList.toggle("done", item.done);
      await atualizarStatusChecklist(item.id, item.done);
    });

    const textInput = itemEl.querySelector(".checklist-text");
    textInput.addEventListener("blur", async () => {
      const novoTexto = textInput.value.trim();
      if (novoTexto && novoTexto !== item.text) {
        item.text = novoTexto;
        await atualizarTituloChecklist(item.id, novoTexto);
      }
    });

    itemsContainer.appendChild(itemEl);
  });

  const addInput = container.querySelector(".checklist-add-input");
  addInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && addInput.value.trim()) {
      const texto = addInput.value.trim();

      await fetch("http://localhost:5000/checklist/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          demanda_id: Number(task.id),
          tarefas: [texto]
        })
      });

      // Recarrega do backend para pegar o ID real
      task.checklist = await loadChecklistFromAPI(task.id);
      renderChecklist(task, container);
    }
  });
}


async function loadChecklistFromAPI(demandaId) {
  try {
    const response = await fetch(`http://localhost:5000/checklist/${Number(demandaId)}`);
    if (!response.ok) throw new Error("Falha ao carregar checklist");

    const data = await response.json();

    return data.tarefas.map(item => ({
      id: item.id,
      text: item.titulo,
      done: item.concluido === true
    }));
  } catch (error) {
    console.error("Erro ao buscar checklist:", error);
    return [];
  }
}


async function saveChecklist(task) {
  if (typeof saveToLocalStorage === "function") {
    saveToLocalStorage(tasks); 
  }

  const payload = {
    demanda_id: Number(task.id), 
    tarefas: task.checklist.map(item => item.text)
  };

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
  }
}

async function atualizarTituloChecklist(itemId, titulo) {
  await fetch(`http://localhost:5000/checklist/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ titulo })
  });
}

