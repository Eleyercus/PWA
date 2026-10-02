// ------------------------------------------------------------------
// TaskFlow — Gestor de tareas (PWA 3)
// Todo se guarda en localStorage. La lista se pinta como <li> hijos
// de un <ul>, generados con innerHTML.
// ------------------------------------------------------------------

const TASKS_KEY = "taskflow_tasks";

const CATEGORIA_LABEL = {
  escuela: "Escuela",
  trabajo: "Trabajo",
  personal: "Personal",
  otro: "Otro",
};

const PRIORIDAD_LABEL = {
  urgente: "Urgente",
  media: "Media",
  baja: "Baja",
};

const ESTADO_LABEL = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  completada: "Completada",
};

let selectedPriority = "media";
let filters = { search: "", categoria: "todas", estado: "todos" };

const list = document.getElementById("tasks-list");
const emptyState = document.getElementById("empty-state");

init();

function init() {
  document.querySelectorAll(".priority-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".priority-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedPriority = btn.dataset.priority;
    });
  });
  document.querySelector(`.priority-btn--${selectedPriority}`).classList.add("selected");

  document.getElementById("task-form").addEventListener("submit", handleAddTask);

  document.getElementById("search-input").addEventListener("input", (e) => {
    filters.search = e.target.value.trim().toLowerCase();
    render();
  });
  document.getElementById("filter-categoria").addEventListener("change", (e) => {
    filters.categoria = e.target.value;
    render();
  });
  document.getElementById("filter-estado").addEventListener("change", (e) => {
    filters.estado = e.target.value;
    render();
  });

  // Delegación de eventos: la lista se regenera en cada render,
  // así que escuchamos en el <ul> en vez de en cada <li>.
  list.addEventListener("change", (e) => {
    if (e.target.classList.contains("estado-select")) {
      updateEstado(e.target.closest(".task-item").dataset.id, e.target.value);
    }
  });
  list.addEventListener("click", (e) => {
    if (e.target.classList.contains("delete-btn")) {
      deleteTask(e.target.closest(".task-item").dataset.id);
    }
  });

  render();
}

// ---------------------------------------------------------------
// Almacenamiento
// ---------------------------------------------------------------

function getTasks() {
  const raw = localStorage.getItem(TASKS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveTasks(tasks) {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

function nextTaskId(tasks) {
  return `TASK-${String(tasks.length + 1).padStart(4, "0")}`;
}

// ---------------------------------------------------------------
// Crear / actualizar / eliminar
// ---------------------------------------------------------------

function handleAddTask(e) {
  e.preventDefault();

  const tasks = getTasks();
  const newTask = {
    id: nextTaskId(tasks),
    titulo: document.getElementById("f-titulo").value.trim(),
    descripcion: document.getElementById("f-descripcion").value.trim(),
    fechaLimite: document.getElementById("f-fecha").value,
    categoria: document.getElementById("f-categoria").value,
    prioridad: selectedPriority,
    estado: "pendiente",
    fechaCreacion: new Date().toISOString(),
  };

  tasks.push(newTask);
  saveTasks(tasks);

  e.target.reset();
  render();
}

function updateEstado(id, nuevoEstado) {
  const tasks = getTasks();
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.estado = nuevoEstado;
  saveTasks(tasks);
  render();
}

function deleteTask(id) {
  const tasks = getTasks().filter((t) => t.id !== id);
  saveTasks(tasks);
  render();
}

// ---------------------------------------------------------------
// Render
// ---------------------------------------------------------------

function render() {
  const allTasks = getTasks();
  const filtered = allTasks.filter((t) => {
    const matchesSearch =
      !filters.search ||
      t.titulo.toLowerCase().includes(filters.search) ||
      t.descripcion.toLowerCase().includes(filters.search);
    const matchesCategoria = filters.categoria === "todas" || t.categoria === filters.categoria;
    const matchesEstado = filters.estado === "todos" || t.estado === filters.estado;
    return matchesSearch && matchesCategoria && matchesEstado;
  });

  // La lista completa de <li> se genera como texto y se inserta de
  // una vez como hijos del <ul> vía innerHTML.
  list.innerHTML = filtered.map(taskItemHtml).join("");
  emptyState.hidden = filtered.length !== 0;

  updateStats(allTasks);
}

function taskItemHtml(t) {
  return `
    <li class="task-item priority-${t.prioridad}" data-id="${t.id}">
      <div class="task-item__main">
        <div class="task-item__top">
          <span class="task-item__title ${t.estado === "completada" ? "done" : ""}">${t.titulo}</span>
          <span class="pill pill--${t.prioridad}">${PRIORIDAD_LABEL[t.prioridad]}</span>
        </div>
        <div class="task-item__meta mono">${CATEGORIA_LABEL[t.categoria]} · vence ${formatDate(t.fechaLimite)}</div>
        ${t.descripcion ? `<p class="task-item__desc">${t.descripcion}</p>` : ""}
      </div>
      <div class="task-item__controls">
        <select class="estado-select estado-${t.estado}">
          ${Object.entries(ESTADO_LABEL)
            .map(([value, label]) => `<option value="${value}" ${value === t.estado ? "selected" : ""}>${label}</option>`)
            .join("")}
        </select>
        <button type="button" class="delete-btn">Eliminar</button>
      </div>
    </li>
  `;
}

function updateStats(tasks) {
  document.getElementById("stat-total").textContent = tasks.length;
  document.getElementById("stat-pendientes").textContent = tasks.filter((t) => t.estado === "pendiente").length;
  document.getElementById("stat-completadas").textContent = tasks.filter((t) => t.estado === "completada").length;
}

function formatDate(isoDate) {
  if (!isoDate) return "sin fecha";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}
