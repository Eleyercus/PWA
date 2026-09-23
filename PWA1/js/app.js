// ------------------------------------------------------------------
// Gestor de Reportes de Incidencias (PWA 1)
// Datos en localStorage — sin backend. Notificaciones reales vía
// Notification API, disparadas por el evento `storage` entre pestañas.
// ------------------------------------------------------------------

const REPORTS_KEY = "incidencias_reports";
const SESSION_KEY = "incidencias_session";

const STATUS_ORDER = ["pendiente", "en_revision", "en_proceso", "resuelto"];
const STATUS_LABEL = {
  pendiente: "Pendiente",
  en_revision: "En revisión",
  en_proceso: "En proceso",
  resuelto: "Resuelto",
};

let AREAS = [];
let selectedRole = null;

const loginScreen = document.getElementById("login-screen");
const appRoot = document.getElementById("app");
const viewRoot = document.getElementById("view-root");
const detailOverlay = document.getElementById("detail-overlay");
const detailContent = document.getElementById("detail-content");
const toastEl = document.getElementById("toast");

init();

async function init() {
  AREAS = await fetch("data/areas.json").then((res) => res.json());

  document.querySelectorAll(".role-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".role-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedRole = btn.dataset.role;
      updateLoginButton();
    });
  });

  document.getElementById("login-name").addEventListener("input", updateLoginButton);
  document.getElementById("login-submit").addEventListener("click", handleLogin);
  document.getElementById("logout-btn").addEventListener("click", handleLogout);
  document.getElementById("notif-btn").addEventListener("click", requestNotifPermission);
  document.getElementById("detail-close").addEventListener("click", closeDetail);
  detailOverlay.addEventListener("click", (e) => {
    if (e.target === detailOverlay) closeDetail();
  });

  window.addEventListener("storage", handleStorageEvent);

  const session = getSession();
  if (session) {
    enterApp(session);
  }
}

function updateLoginButton() {
  const name = document.getElementById("login-name").value.trim();
  document.getElementById("login-submit").disabled = !(name && selectedRole);
}

function handleLogin() {
  const name = document.getElementById("login-name").value.trim();
  if (!name || !selectedRole) return;
  const session = { name, role: selectedRole };
  saveSession(session);
  enterApp(session);
}

function handleLogout() {
  sessionStorage.removeItem(SESSION_KEY);
  appRoot.hidden = true;
  loginScreen.hidden = false;
  document.getElementById("login-name").value = "";
  selectedRole = null;
  document.querySelectorAll(".role-btn").forEach((b) => b.classList.remove("selected"));
  updateLoginButton();
}

function enterApp(session) {
  loginScreen.hidden = true;
  appRoot.hidden = false;
  document.getElementById("user-name").textContent = session.name;
  document.getElementById("user-role").textContent = session.role;

  if (Notification && Notification.permission === "granted") {
    document.getElementById("notif-btn").textContent = "Notificaciones activas";
    document.getElementById("notif-btn").classList.add("active");
  }

  renderView(session);
}

// ---------------------------------------------------------------
// Notificaciones
// ---------------------------------------------------------------

function requestNotifPermission() {
  if (!("Notification" in window)) {
    showToast("Este navegador no soporta notificaciones.");
    return;
  }
  Notification.requestPermission().then((permission) => {
    const btn = document.getElementById("notif-btn");
    if (permission === "granted") {
      btn.textContent = "Notificaciones activas";
      btn.classList.add("active");
      showToast("Notificaciones activadas.");
    } else {
      showToast("Permiso de notificaciones denegado.");
    }
  });
}

function notify(title, body) {
  if ("Notification" in window && Notification.permission === "granted") {
    const n = new Notification(title, {
      body,
      icon: "icons/icon-192x192.png",
      badge: "icons/icon-192x192.png",
    });
    n.onclick = () => window.focus();
  }
}

// Se dispara en OTRAS pestañas cuando cambia localStorage — así llegan
// las actualizaciones sin necesidad de un servidor de push.
function handleStorageEvent(e) {
  if (e.key !== REPORTS_KEY) return;

  const session = getSession();
  if (!session) return;

  const oldReports = e.oldValue ? JSON.parse(e.oldValue) : [];
  const newReports = e.newValue ? JSON.parse(e.newValue) : [];
  const oldById = Object.fromEntries(oldReports.map((r) => [r.id, r]));

  newReports.forEach((report) => {
    const old = oldById[report.id];

    if (session.role === "usuario" && report.creadoPor === session.name) {
      if (old && old.estado !== report.estado) {
        notify(`Actualización: ${report.titulo}`, `Tu reporte ahora está "${STATUS_LABEL[report.estado]}".`);
      }
    }

    if ((session.role === "tecnico" || session.role === "admin") && !old) {
      notify("Nuevo reporte de incidencia", `${report.titulo} — ${report.area}`);
    }
  });

  // Si la vista actual muestra reportes, refréscala con los datos nuevos
  if (!detailOverlay.hidden) return; // no interrumpas si está viendo un detalle
  renderView(session);
}

// ---------------------------------------------------------------
// Almacenamiento
// ---------------------------------------------------------------

function getSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function getReports() {
  const raw = localStorage.getItem(REPORTS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveReports(reports) {
  localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
}

function nextReportId(reports) {
  const n = reports.length + 1;
  return `INC-${String(n).padStart(4, "0")}`;
}

// ---------------------------------------------------------------
// Render de vistas por rol
// ---------------------------------------------------------------

function renderView(session) {
  if (session.role === "usuario") {
    renderUsuarioView(session);
  } else {
    renderStaffView(session);
  }
}

function renderUsuarioView(session, activeTab = "nuevo") {
  const reports = getReports().filter((r) => r.creadoPor === session.name);

  viewRoot.innerHTML = `
    <div class="view-header">
      <div>
        <h1>Mis reportes</h1>
        <p>Registra una incidencia y da seguimiento a su estado.</p>
      </div>
    </div>

    <div class="tabs">
      <button class="tab-btn ${activeTab === "nuevo" ? "active" : ""}" data-tab="nuevo">Nuevo reporte</button>
      <button class="tab-btn ${activeTab === "mios" ? "active" : ""}" data-tab="mios">Mis reportes (${reports.length})</button>
    </div>

    <div id="tab-content"></div>
  `;

  viewRoot.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => renderUsuarioView(session, btn.dataset.tab));
  });

  const tabContent = document.getElementById("tab-content");

  if (activeTab === "nuevo") {
    tabContent.innerHTML = buildReportForm();
    bindReportForm(session);
  } else {
    tabContent.innerHTML = reports.length
      ? `<div class="reports-list">${reports.map(reportCardHtml).join("")}</div>`
      : `<p class="empty-state">Todavía no has reportado ninguna incidencia.</p>`;
    bindReportCards(reports, session);
  }
}

function renderStaffView(session, filters = { area: "todas", estado: "todos" }) {
  const allReports = getReports();
  const filtered = allReports.filter(
    (r) =>
      (filters.area === "todas" || r.area === filters.area) &&
      (filters.estado === "todos" || r.estado === filters.estado)
  );

  const statsHtml =
    session.role === "admin"
      ? `<div class="stats-row">${STATUS_ORDER.map(
          (s) =>
            `<div class="stat-card">
              <div class="stat-card__value">${allReports.filter((r) => r.estado === s).length}</div>
              <div class="stat-card__label">${STATUS_LABEL[s]}</div>
            </div>`
        ).join("")}</div>`
      : "";

  viewRoot.innerHTML = `
    <div class="view-header">
      <div>
        <h1>${session.role === "admin" ? "Panel de administración" : "Reportes asignados"}</h1>
        <p>${allReports.length} reporte(s) en el sistema.</p>
      </div>
    </div>

    ${statsHtml}

    <div class="filters">
      <select class="select-input" id="filter-area">
        <option value="todas">Todas las áreas</option>
        ${AREAS.map((a) => `<option value="${a}" ${filters.area === a ? "selected" : ""}>${a}</option>`).join("")}
      </select>
      <select class="select-input" id="filter-estado">
        <option value="todos">Todos los estados</option>
        ${STATUS_ORDER.map(
          (s) => `<option value="${s}" ${filters.estado === s ? "selected" : ""}>${STATUS_LABEL[s]}</option>`
        ).join("")}
      </select>
    </div>

    <div id="staff-list">
      ${
        filtered.length
          ? `<div class="reports-list">${filtered.map(reportCardHtml).join("")}</div>`
          : `<p class="empty-state">No hay reportes que coincidan con el filtro.</p>`
      }
    </div>
  `;

  document.getElementById("filter-area").addEventListener("change", (e) =>
    renderStaffView(session, { ...filters, area: e.target.value })
  );
  document.getElementById("filter-estado").addEventListener("change", (e) =>
    renderStaffView(session, { ...filters, estado: e.target.value })
  );

  bindReportCards(filtered, session);
}

// ---------------------------------------------------------------
// Tarjetas de reporte
// ---------------------------------------------------------------

function reportCardHtml(r) {
  const thumb = r.imagen
    ? `<img src="${r.imagen}" class="report-card__thumb" alt="" />`
    : `<div class="report-card__thumb report-card__thumb--empty">📋</div>`;

  return `
    <div class="report-card" data-id="${r.id}">
      ${thumb}
      <div class="report-card__main">
        <div class="report-card__title">${r.titulo}</div>
        <div class="report-card__meta mono">${r.id} · ${r.area}</div>
      </div>
      <span class="badge badge--${r.estado}">${STATUS_LABEL[r.estado]}</span>
    </div>
  `;
}

function bindReportCards(reports, session) {
  document.querySelectorAll(".report-card").forEach((card) => {
    card.addEventListener("click", () => {
      const report = reports.find((r) => r.id === card.dataset.id);
      openDetail(report, session);
    });
  });
}

// ---------------------------------------------------------------
// Formulario de nuevo reporte
// ---------------------------------------------------------------

function buildReportForm() {
  return `
    <form class="report-form" id="report-form">
      <div>
        <label for="f-titulo">Título</label>
        <input type="text" id="f-titulo" class="text-input" placeholder="Ej. Proyector no enciende" required />
      </div>
      <div>
        <label for="f-descripcion">Descripción</label>
        <textarea id="f-descripcion" class="textarea-input" placeholder="Describe la incidencia con el mayor detalle posible" required></textarea>
      </div>
      <div>
        <label for="f-area">Área / ubicación</label>
        <select id="f-area" class="select-input" style="width:100%" required>
          <option value="" disabled selected>Selecciona un área</option>
          ${AREAS.map((a) => `<option value="${a}">${a}</option>`).join("")}
        </select>
      </div>
      <div>
        <label>Imagen (opcional)</label>
        <div class="file-drop">
          Toca para subir una foto de la incidencia
          <input type="file" id="f-imagen" accept="image/*" />
        </div>
        <img id="f-preview" class="file-preview" alt="Vista previa" />
      </div>
      <button type="submit" class="btn-primary">Enviar reporte</button>
    </form>
  `;
}

function bindReportForm(session) {
  let imagenData = null;

  const fileInput = document.getElementById("f-imagen");
  const preview = document.getElementById("f-preview");

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    imagenData = await compressImage(file);
    preview.src = imagenData;
    preview.style.display = "block";
  });

  document.getElementById("report-form").addEventListener("submit", (e) => {
    e.preventDefault();

    const reports = getReports();
    const newReport = {
      id: nextReportId(reports),
      titulo: document.getElementById("f-titulo").value.trim(),
      descripcion: document.getElementById("f-descripcion").value.trim(),
      area: document.getElementById("f-area").value,
      imagen: imagenData,
      estado: "pendiente",
      creadoPor: session.name,
      fechaCreacion: new Date().toISOString(),
      historial: [
        {
          estado: "pendiente",
          fecha: new Date().toISOString(),
          nota: "Reporte creado.",
          actor: `${session.name} (usuario)`,
        },
      ],
    };

    reports.push(newReport);
    saveReports(reports);
    showToast("Reporte enviado correctamente.");
    renderUsuarioView(session, "mios");
  });
}

// Reduce la imagen antes de guardarla (localStorage tiene espacio limitado)
function compressImage(file, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------
// Panel de detalle + actualización de estado
// ---------------------------------------------------------------

function openDetail(report, session) {
  const canUpdate = session.role === "tecnico" || session.role === "admin";

  const updateRowHtml = canUpdate
    ? `
      <div class="update-row">
        <select class="select-input" id="update-estado">
          ${STATUS_ORDER.map(
            (s) => `<option value="${s}" ${s === report.estado ? "selected" : ""}>${STATUS_LABEL[s]}</option>`
          ).join("")}
        </select>
        <input type="text" class="text-input" id="update-nota" placeholder="Nota (opcional)" style="flex:1; min-width:160px;" />
        <button class="btn-primary" id="update-submit" style="width:auto; margin:0; padding:10px 18px;">Actualizar</button>
      </div>
    `
    : "";

  detailContent.innerHTML = `
    <div class="detail-id mono">${report.id}</div>
    <h2 class="detail-title">${report.titulo}</h2>

    ${report.imagen ? `<img src="${report.imagen}" class="detail-image" alt="" />` : ""}

    <dl class="detail-grid">
      <div><dt>Estado</dt><dd><span class="badge badge--${report.estado}">${STATUS_LABEL[report.estado]}</span></dd></div>
      <div><dt>Área</dt><dd>${report.area}</dd></div>
      <div><dt>Reportado por</dt><dd>${report.creadoPor}</dd></div>
      <div><dt>Fecha</dt><dd>${formatDate(report.fechaCreacion)}</dd></div>
    </dl>

    <p style="font-size:0.9rem; color:var(--muted); margin-bottom:20px;">${report.descripcion}</p>

    ${updateRowHtml}

    <div class="timeline">
      <h3>Historial</h3>
      ${report.historial
        .slice()
        .reverse()
        .map(
          (h) => `
        <div class="timeline-item">
          <div class="timeline-item__body">
            <strong>${STATUS_LABEL[h.estado]}</strong>${h.nota ? ` — ${h.nota}` : ""}
            <div class="timeline-item__meta mono">${h.actor} · ${formatDate(h.fecha)}</div>
          </div>
        </div>
      `
        )
        .join("")}
    </div>
  `;

  if (canUpdate) {
    document.getElementById("update-submit").addEventListener("click", () => {
      const nuevoEstado = document.getElementById("update-estado").value;
      const nota = document.getElementById("update-nota").value.trim();
      updateReportStatus(report.id, nuevoEstado, nota, session);
    });
  }

  detailOverlay.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeDetail() {
  detailOverlay.hidden = true;
  document.body.style.overflow = "";
}

function updateReportStatus(id, nuevoEstado, nota, session) {
  const reports = getReports();
  const report = reports.find((r) => r.id === id);
  if (!report) return;

  report.estado = nuevoEstado;
  report.historial.push({
    estado: nuevoEstado,
    fecha: new Date().toISOString(),
    nota: nota || "",
    actor: `${session.name} (${session.role})`,
  });

  saveReports(reports);
  showToast("Estado actualizado.");
  closeDetail();
  renderView(session);
}

// ---------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------

function formatDate(iso) {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 3000);
}
