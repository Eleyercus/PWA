// ------------------------------------------------------------------
// TrackShop · Seguimiento de paquetes (PWA 2)
// ------------------------------------------------------------------

let ORDERS = [];
let DESTINO = null;
let map = null;
let routeLine = null;
let originMarker = null;
let destMarker = null;
let currentMarker = null;

const ordersListEl = document.getElementById("orders-list");
const searchInput = document.getElementById("search-input");
const noResultsEl = document.getElementById("no-results");

const overlayEl = document.getElementById("detail-overlay");
const closeBtn = document.getElementById("detail-close");

closeBtn.addEventListener("click", closeDetail);
overlayEl.addEventListener("click", (e) => {
  if (e.target === overlayEl) closeDetail();
});

init();

async function init() {
  searchInput.addEventListener("input", onSearch);

  try {
    const response = await fetch("data/orders.json");
    if (!response.ok) throw new Error(`No se pudo cargar orders.json (${response.status})`);

    const data = await response.json();
    ORDERS = data.pedidos;
    DESTINO = data.destino;
    renderOrders(ORDERS);
  } catch (error) {
    console.error("Error al cargar los pedidos:", error);
    noResultsEl.hidden = false;
    noResultsEl.textContent = "No se pudieron cargar los pedidos.";
  }
}

function renderOrders(list) {
  ordersListEl.innerHTML = "";

  if (list.length === 0) {
    noResultsEl.hidden = false;
    return;
  }
  noResultsEl.hidden = true;

  list.forEach((pedido) => {
    const card = document.createElement("div");
    card.className = "order-card";
    card.innerHTML = `
      <div class="order-card__main">
        <span class="order-card__producto">${pedido.producto}</span>
        <span class="order-card__meta">${pedido.entidad} · Pedido ${pedido.id} · Desde ${pedido.origen.ciudad}</span>
      </div>
      <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
        <span class="order-card__badge">${pedido.estado}</span>
        <div class="order-card__progress-mini">
          <div class="order-card__progress-mini-fill" style="width:${Math.round(pedido.progreso * 100)}%"></div>
        </div>
      </div>
    `;
    card.addEventListener("click", () => openDetail(pedido));
    ordersListEl.appendChild(card);
  });
}

function onSearch() {
  const q = searchInput.value.trim().toLowerCase();
  const filtered = ORDERS.filter((p) =>
    [p.producto, p.entidad, p.id, p.origen.ciudad]
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
  renderOrders(filtered);
}

function openDetail(pedido) {
  document.getElementById("detail-producto").textContent = pedido.producto;
  document.getElementById("detail-id").textContent = pedido.id;
  document.getElementById("detail-entidad").textContent = pedido.entidad;
  document.getElementById("detail-estado").textContent = pedido.estado;
  document.getElementById("detail-origen").textContent = pedido.origen.ciudad;
  document.getElementById("detail-destino").textContent = DESTINO.ciudad;
  document.getElementById("detail-fecha").textContent = pedido.fechaEstimada;

  const pct = Math.round(pedido.progreso * 100);
  document.getElementById("progress-fill").style.width = pct + "%";
  document.getElementById("progress-label").textContent = `${pct}% del trayecto`;

  overlayEl.hidden = false;
  document.body.style.overflow = "hidden";

  // El mapa necesita el contenedor visible antes de inicializarse
  requestAnimationFrame(() => renderMap(pedido));
}

function closeDetail() {
  overlayEl.hidden = true;
  document.body.style.overflow = "";
}

function renderMap(pedido) {
  const origenLatLng = [pedido.origen.lat, pedido.origen.lng];
  const destinoLatLng = [DESTINO.lat, DESTINO.lng];
  const actualLatLng = interpolate(origenLatLng, destinoLatLng, pedido.progreso);

  if (!map) {
    map = L.map("map");
  }

  // Limpia capas de un pedido anterior
  [routeLine, originMarker, destMarker, currentMarker].forEach((layer) => {
    if (layer) map.removeLayer(layer);
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  routeLine = L.polyline([origenLatLng, destinoLatLng], {
    color: "#1e3a8a",
    weight: 3,
    dashArray: "6 8",
  }).addTo(map);

  originMarker = L.circleMarker(origenLatLng, {
    radius: 7,
    color: "#6b7280",
    fillColor: "#6b7280",
    fillOpacity: 1,
  })
    .addTo(map)
    .bindTooltip(`Origen: ${pedido.origen.ciudad}`);

  destMarker = L.circleMarker(destinoLatLng, {
    radius: 7,
    color: "#16a34a",
    fillColor: "#16a34a",
    fillOpacity: 1,
  })
    .addTo(map)
    .bindTooltip(`Destino: ${DESTINO.ciudad}`);

  const truckIcon = L.divIcon({
    html: "🚚",
    className: "truck-icon",
    iconSize: [24, 24],
  });

  currentMarker = L.marker(actualLatLng, { icon: truckIcon })
    .addTo(map)
    .bindTooltip(`Paquete en camino (${Math.round(pedido.progreso * 100)}%)`)
    .openTooltip();

  map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });

  // Leaflet necesita recalcular el tamaño si el contenedor estaba oculto
  setTimeout(() => map.invalidateSize(), 150);
}

// Interpolación lineal simple entre dos coordenadas [lat, lng]
function interpolate(from, to, t) {
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
}
