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

init();

async function init() {
  const data = await fetch("data/orders.json").then((res) => res.json());
  ORDERS = data.pedidos;
  DESTINO = data.destino;

  renderOrders(ORDERS);

  searchInput.addEventListener("input", onSearch);
  closeBtn.addEventListener("click", closeDetail);
  overlayEl.addEventListener("click", (e) => {
    if (e.target === overlayEl) closeDetail();
  });
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

const routeCache = {}; // evita volver a pedir la misma ruta si reabres el pedido

async function renderMap(pedido) {
  const origenLatLng = [pedido.origen.lat, pedido.origen.lng];
  const destinoLatLng = [DESTINO.lat, DESTINO.lng];

  if (!map) {
    map = L.map("map");
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
  }

  // Limpia capas del pedido anterior
  [routeLine, originMarker, destMarker, currentMarker].forEach((layer) => {
    if (layer) map.removeLayer(layer);
  });

  // Mientras llega la ruta real, muestra algo de inmediato
  routeLine = L.polyline([origenLatLng, destinoLatLng], {
    color: "#94a3b8",
    weight: 2,
    dashArray: "4 8",
  }).addTo(map);
  map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
  setTimeout(() => map.invalidateSize(), 150);

  addOriginDestMarkers(pedido, origenLatLng, destinoLatLng);

  // Obtiene la ruta real por carretera (o cae a línea recta si falla)
  let routeCoords;
  try {
    routeCoords = await getRoadRoute(pedido.id, origenLatLng, destinoLatLng);
  } catch (err) {
    console.warn("No se pudo obtener la ruta real; se muestra una línea provisional:", err);
    routeCoords = [origenLatLng, destinoLatLng];
  }

  map.removeLayer(routeLine);
  routeLine = L.polyline(routeCoords, {
    color: "#1e3a8a",
    weight: 4,
  }).addTo(map);

  const actualLatLng = pointAlongRoute(routeCoords, pedido.progreso);

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
}

function addOriginDestMarkers(pedido, origenLatLng, destinoLatLng) {
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
}

// Pide la geometría real de la ruta por carretera al servicio público de OSRM
async function getRoadRoute(pedidoId, origenLatLng, destinoLatLng) {
  if (routeCache[pedidoId]) return routeCache[pedidoId];

  const [oLat, oLng] = origenLatLng;
  const [dLat, dLng] = destinoLatLng;
  const url = `https://router.project-osrm.org/route/v1/driving/${oLng},${oLat};${dLng},${dLat}?overview=full&geometries=geojson`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM respondió ${res.status}`);

  const data = await res.json();
  if (data.code !== "Ok" || !data.routes?.length) {
    throw new Error("OSRM no devolvió una ruta válida");
  }

  // GeoJSON viene como [lng, lat]; Leaflet necesita [lat, lng]
  const coords = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  routeCache[pedidoId] = coords;
  return coords;
}

// Ubica el punto sobre la ruta real que corresponde a una fracción del trayecto (0–1),
// avanzando por la distancia acumulada de cada segmento en vez de solo por índice.
function pointAlongRoute(routeCoords, fraction) {
  const segmentLengths = [];
  let totalLength = 0;

  for (let i = 0; i < routeCoords.length - 1; i++) {
    const d = haversineDistance(routeCoords[i], routeCoords[i + 1]);
    segmentLengths.push(d);
    totalLength += d;
  }

  const targetDistance = totalLength * fraction;
  let accumulated = 0;

  for (let i = 0; i < segmentLengths.length; i++) {
    if (accumulated + segmentLengths[i] >= targetDistance) {
      const remaining = targetDistance - accumulated;
      const t = segmentLengths[i] === 0 ? 0 : remaining / segmentLengths[i];
      return interpolate(routeCoords[i], routeCoords[i + 1], t);
    }
    accumulated += segmentLengths[i];
  }

  return routeCoords[routeCoords.length - 1];
}

// Distancia aproximada en metros entre dos coordenadas [lat, lng] (fórmula haversine)
function haversineDistance([lat1, lng1], [lat2, lng2]) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Interpolación lineal simple entre dos coordenadas [lat, lng]
function interpolate(from, to, t) {
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
}