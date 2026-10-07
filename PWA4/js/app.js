// ------------------------------------------------------------------
// ShopLab — Tienda de prueba (PWA 4)
// APIs públicas sin llave:
//   · DummyJSON  → productos, categorías, reseñas, carrito (POST) y frases
//   · Frankfurter → tipo de cambio USD → MXN
// Favoritos, carrito y tus propias reseñas se guardan en localStorage.
// ------------------------------------------------------------------

const API = "https://dummyjson.com";
const RATE_URL = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=MXN";
const PAGE_SIZE = 24;

const LS = {
  favs: "shoplab_favs",
  cart: "shoplab_cart",
  reviews: "shoplab_reviews",
  name: "shoplab_name",
  rate: "shoplab_rate",
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

const state = {
  view: "tienda",
  query: "",
  categoria: "",
  orden: "",
  skip: 0,
  total: 0,
  products: [],
  loading: false,
  error: null,
};

const cache = new Map(); // id -> snapshot ligero del producto
let rate = null; // { value, date }
let reqToken = 0;
let detailToken = 0;
let detailState = null; // { product, qty, formRating }
let toastTimer = null;

// ---------------- Referencias al DOM ----------------

const $ = (id) => document.getElementById(id);

const grid = $("products-grid");
const favsGrid = $("favs-grid");
const statusBox = $("status-box");
const loadMoreBtn = $("load-more");
const resultInfo = $("result-info");
const searchInput = $("search-input");
const catSelect = $("filter-categoria");
const sortSelect = $("filter-orden");
const overlay = $("detail-overlay");
const detailContent = $("detail-content");

// ---------------- Utilidades ----------------

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn("No se pudo guardar en localStorage:", err);
  }
}

function showToast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function snapshot(p) {
  return {
    id: p.id,
    title: p.title,
    price: p.price,
    discountPercentage: p.discountPercentage || 0,
    thumbnail: p.thumbnail,
    category: p.category,
    rating: p.rating,
    stock: p.stock,
  };
}

function finalPrice(s) {
  return Math.round(s.price * (1 - (s.discountPercentage || 0) / 100) * 100) / 100;
}

function priceHtml(s) {
  const f = finalPrice(s);
  const hasDiscount = (s.discountPercentage || 0) >= 1;
  return `
    <span class="price">${usd.format(f)}${
      hasDiscount ? ` <s class="mono" style="font-size:.72rem;color:var(--muted);font-weight:400">${usd.format(s.price)}</s>` : ""
    }</span>
    ${rate ? `<span class="price-mxn mono">≈ ${mxn.format(f * rate.value)}</span>` : ""}
  `;
}

function starsHtml(value) {
  const full = Math.round(Math.max(0, Math.min(5, value || 0)));
  return `<span class="stars" aria-label="${full} de 5 estrellas">${"★".repeat(full)}<span class="stars-muted">${"★".repeat(5 - full)}</span></span>`;
}

function titleCase(slug) {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------- Almacenamiento ----------------

const getFavs = () => readJSON(LS.favs, {});
const getCart = () => readJSON(LS.cart, []);
const getAllReviews = () => readJSON(LS.reviews, {});

function updateCounts() {
  const favN = Object.keys(getFavs()).length;
  const cartN = getCart().reduce((sum, i) => sum + i.qty, 0);
  const favEl = $("fav-count");
  const cartEl = $("cart-count");
  favEl.textContent = favN;
  favEl.dataset.zero = favN === 0;
  cartEl.textContent = cartN;
  cartEl.dataset.zero = cartN === 0;
}

// ---------------- Init ----------------

init();

function init() {
  // Eventos primero, para que nada dependa de que la API responda
  $("nav").addEventListener("click", (e) => {
    const btn = e.target.closest(".nav__btn");
    if (btn) setView(btn.dataset.view);
  });
  $("brand-link").addEventListener("click", (e) => {
    e.preventDefault();
    setView("tienda");
  });

  searchInput.addEventListener(
    "input",
    debounce(() => {
      state.query = searchInput.value.trim();
      if (state.query) {
        state.categoria = "";
        catSelect.value = "";
      }
      setView("tienda");
      loadProducts();
    }, 350)
  );

  catSelect.addEventListener("change", () => {
    state.categoria = catSelect.value;
    state.query = "";
    searchInput.value = "";
    loadProducts();
  });

  sortSelect.addEventListener("change", () => {
    state.orden = sortSelect.value;
    loadProducts();
  });

  loadMoreBtn.addEventListener("click", () => loadProducts(true));

  grid.addEventListener("click", handleCardClick);
  favsGrid.addEventListener("click", handleCardClick);

  $("cart-content").addEventListener("click", handleCartClick);

  $("detail-close").addEventListener("click", closeDetail);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeDetail();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) closeDetail();
  });
  detailContent.addEventListener("click", handleDetailClick);
  detailContent.addEventListener("submit", handleReviewSubmit);

  updateCounts();
  loadRate();
  loadCategories();
  loadQuote();
  loadProducts();
}

function setView(view) {
  state.view = view;
  ["tienda", "favoritos", "carrito"].forEach((v) => {
    $(`view-${v}`).hidden = v !== view;
  });
  document.querySelectorAll(".nav__btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  if (view === "favoritos") renderFavs();
  if (view === "carrito") renderCart();
  window.scrollTo({ top: 0 });
}

// ---------------- APIs auxiliares ----------------

async function loadRate() {
  const stored = readJSON(LS.rate, null);
  if (stored) {
    rate = stored;
    renderRateInfo();
  }
  try {
    const res = await fetch(RATE_URL);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    rate = { value: data.rates.MXN, date: data.date };
    writeJSON(LS.rate, rate);
  } catch (err) {
    console.warn("No se pudo actualizar el tipo de cambio:", err);
    if (!rate) $("rate-info").textContent = "tipo de cambio no disponible";
    return;
  }
  renderRateInfo();
  rerenderPrices();
}

function renderRateInfo() {
  if (!rate) return;
  $("rate-info").textContent = `1 USD = ${rate.value.toFixed(2)} MXN (${rate.date})`;
  rerenderPrices();
}

function rerenderPrices() {
  renderTienda();
  if (state.view === "favoritos") renderFavs();
  if (state.view === "carrito") renderCart();
}

async function loadCategories() {
  try {
    const res = await fetch(`${API}/products/categories`);
    if (!res.ok) throw new Error(res.status);
    const cats = await res.json();
    cats.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.slug;
      opt.textContent = c.name || titleCase(c.slug);
      catSelect.appendChild(opt);
    });
  } catch (err) {
    console.warn("No se pudieron cargar las categorías:", err);
  }
}

async function loadQuote() {
  try {
    const res = await fetch(`${API}/quotes/random`);
    if (!res.ok) throw new Error(res.status);
    const q = await res.json();
    if (!q.quote) return;
    $("banner-text").textContent = `“${q.quote}” — ${q.author || "Anónimo"}`;
    $("banner").hidden = false;
  } catch {
    // El banner es opcional: si falla, simplemente no se muestra.
  }
}

// ---------------- Catálogo ----------------

function buildListUrl(skip) {
  const params = new URLSearchParams({
    limit: PAGE_SIZE,
    skip,
    select: "title,price,discountPercentage,thumbnail,category,rating,stock",
  });
  if (state.orden) {
    const [by, order] = state.orden.split("-");
    params.set("sortBy", by);
    params.set("order", order);
  }
  let path = "/products";
  if (state.query) {
    path = "/products/search";
    params.set("q", state.query);
  } else if (state.categoria) {
    path = `/products/category/${encodeURIComponent(state.categoria)}`;
  }
  return `${API}${path}?${params}`;
}

async function loadProducts(append = false) {
  if (append && state.loading) return;

  const token = ++reqToken;
  state.loading = true;
  state.error = null;

  if (!append) {
    state.skip = 0;
    state.products = [];
    state.total = 0;
  }
  renderTienda();

  try {
    const res = await fetch(buildListUrl(state.skip));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (token !== reqToken) return; // llegó una respuesta vieja

    data.products.forEach((p) => cache.set(p.id, snapshot(p)));
    state.products = state.products.concat(data.products);
    state.total = data.total;
    state.skip += data.products.length;
  } catch (err) {
    if (token !== reqToken) return;
    console.error("Error al cargar productos:", err);
    state.error = err.message;
    if (append) showToast("No se pudieron cargar más productos.");
  }

  state.loading = false;
  renderTienda();
}

function productCardHtml(s) {
  const favs = getFavs();
  const isFav = Boolean(favs[s.id]);
  return `
    <article class="product-card" data-id="${s.id}">
      <button class="fav-btn ${isFav ? "active" : ""}" aria-label="${isFav ? "Quitar de favoritos" : "Agregar a favoritos"}" data-action="fav">${isFav ? "♥" : "♡"}</button>
      <div class="product-card__img-wrap" data-action="open">
        <img class="product-card__img" src="${escapeHtml(s.thumbnail)}" alt="${escapeHtml(s.title)}" loading="lazy" />
      </div>
      <div class="product-card__body">
        <span class="product-card__cat mono">${escapeHtml(titleCase(s.category || ""))}</span>
        <h3 class="product-card__title" data-action="open">${escapeHtml(s.title)}</h3>
        <div class="rating-row">${starsHtml(s.rating)} <span class="mono">${(s.rating ?? 0).toFixed(1)}</span></div>
        <div class="price-row">${priceHtml(s)}</div>
        <button class="btn-primary add-btn" data-action="add">Agregar al carrito</button>
      </div>
    </article>
  `;
}

function renderTienda() {
  if (state.loading && state.products.length === 0) {
    grid.innerHTML = Array.from({ length: 8 }, () => `<div class="skeleton"></div>`).join("");
    statusBox.hidden = true;
    loadMoreBtn.hidden = true;
    resultInfo.textContent = "Cargando…";
    return;
  }

  grid.innerHTML = state.products.map((p) => productCardHtml(cache.get(p.id) || snapshot(p))).join("");

  if (state.error && state.products.length === 0) {
    statusBox.hidden = false;
    statusBox.innerHTML = `
      <p>No se pudieron cargar los productos. Revisa tu conexión e inténtalo de nuevo.</p>
      <button class="btn-secondary" id="retry-btn">Reintentar</button>
    `;
    $("retry-btn").addEventListener("click", () => loadProducts());
    loadMoreBtn.hidden = true;
    resultInfo.textContent = "";
    return;
  }

  if (!state.loading && state.products.length === 0) {
    statusBox.hidden = false;
    statusBox.textContent = "No se encontraron productos con ese criterio.";
    loadMoreBtn.hidden = true;
    resultInfo.textContent = "0 resultados";
    return;
  }

  statusBox.hidden = true;
  resultInfo.textContent = `${state.products.length} de ${state.total} productos`;
  const hasMore = state.products.length < state.total;
  loadMoreBtn.hidden = !hasMore;
  loadMoreBtn.disabled = state.loading;
  loadMoreBtn.textContent = state.loading ? "Cargando…" : "Cargar más productos";
}

// ---------------- Tarjetas (tienda y favoritos) ----------------

function handleCardClick(e) {
  const actionEl = e.target.closest("[data-action]");
  const card = e.target.closest(".product-card");
  if (!actionEl || !card) return;

  const id = Number(card.dataset.id);
  const snap = cache.get(id) || getFavs()[id];
  const action = actionEl.dataset.action;

  if (action === "open") openDetail(id);
  if (action === "add" && snap) addToCart(snap, 1);
  if (action === "fav" && snap) toggleFav(snap);
}

function toggleFav(snap) {
  const favs = getFavs();
  if (favs[snap.id]) {
    delete favs[snap.id];
    showToast("Quitado de favoritos.");
  } else {
    favs[snap.id] = snap;
    showToast("Agregado a favoritos.");
  }
  writeJSON(LS.favs, favs);
  updateCounts();
  renderTienda();
  if (state.view === "favoritos") renderFavs();
  refreshDetailFavButton();
}

function renderFavs() {
  const items = Object.values(getFavs());
  favsGrid.innerHTML = items.map(productCardHtml).join("");
  $("favs-empty").hidden = items.length !== 0;
}

// ---------------- Carrito ----------------

function addToCart(snap, qty = 1) {
  const cart = getCart();
  const max = snap.stock > 0 ? snap.stock : 99;
  const existing = cart.find((i) => i.id === snap.id);

  if (existing) {
    existing.qty = Math.min(existing.qty + qty, max);
  } else {
    cart.push({
      id: snap.id,
      title: snap.title,
      thumbnail: snap.thumbnail,
      price: snap.price,
      discountPercentage: snap.discountPercentage,
      stock: snap.stock,
      qty: Math.min(qty, max),
    });
  }
  writeJSON(LS.cart, cart);
  updateCounts();
  showToast("Agregado al carrito.");
  if (state.view === "carrito") renderCart();
}

function renderCart(order = null) {
  const root = $("cart-content");

  if (order) {
    root.innerHTML = `
      <div class="order-ok">
        <h2>¡Pedido enviado a la API!</h2>
        <p>DummyJSON recibió tu carrito mediante <span class="mono">POST /carts/add</span> y respondió con estos datos.
        Es una API de prueba, así que el pedido se simula y no se almacena.</p>
        <p class="mono">Carrito #${escapeHtml(order.id)} · ${escapeHtml(order.totalProducts)} producto(s) · ${escapeHtml(order.totalQuantity)} pieza(s)<br />
        Total confirmado: ${usd.format(order.discountedTotal ?? order.total)}${
          rate ? ` (≈ ${mxn.format((order.discountedTotal ?? order.total) * rate.value)})` : ""
        }</p>
        <button class="btn-primary" data-action="back-to-shop">Seguir comprando</button>
      </div>
    `;
    return;
  }

  const cart = getCart();
  if (cart.length === 0) {
    root.innerHTML = `<p class="empty-state">Tu carrito está vacío.</p>`;
    return;
  }

  const total = cart.reduce((sum, i) => sum + finalPrice(i) * i.qty, 0);
  const pieces = cart.reduce((sum, i) => sum + i.qty, 0);

  root.innerHTML = `
    <div class="cart-layout">
      <div class="cart-list">
        ${cart
          .map(
            (i) => `
          <div class="cart-item" data-id="${i.id}">
            <img class="cart-item__img" src="${escapeHtml(i.thumbnail)}" alt="" loading="lazy" />
            <div class="cart-item__main">
              <div class="cart-item__title">${escapeHtml(i.title)}</div>
              <div class="cart-item__price mono">${usd.format(finalPrice(i))} c/u</div>
              <button class="remove-btn" data-action="remove">Quitar</button>
            </div>
            <div class="qty-control">
              <button data-action="dec" aria-label="Menos">−</button>
              <span>${i.qty}</span>
              <button data-action="inc" aria-label="Más">+</button>
            </div>
          </div>`
          )
          .join("")}
      </div>

      <aside class="summary">
        <h3>Resumen</h3>
        <div class="summary-row"><span>Piezas</span><span>${pieces}</span></div>
        <div class="summary-row summary-row--total"><span>Total</span><span>${usd.format(total)}</span></div>
        ${rate ? `<div class="summary-row mono" style="color:var(--muted);font-size:.78rem"><span>En pesos</span><span>≈ ${mxn.format(total * rate.value)}</span></div>` : ""}
        <button class="btn-primary" data-action="checkout">Finalizar compra</button>
      </aside>
    </div>
  `;
}

function handleCartClick(e) {
  const actionEl = e.target.closest("[data-action]");
  if (!actionEl) return;
  const action = actionEl.dataset.action;

  if (action === "back-to-shop") return setView("tienda");
  if (action === "checkout") return checkout(actionEl);

  const row = e.target.closest(".cart-item");
  if (!row) return;
  const id = Number(row.dataset.id);
  let cart = getCart();
  const item = cart.find((i) => i.id === id);
  if (!item) return;

  if (action === "inc") item.qty = Math.min(item.qty + 1, item.stock > 0 ? item.stock : 99);
  if (action === "dec") item.qty = Math.max(item.qty - 1, 1);
  if (action === "remove") cart = cart.filter((i) => i.id !== id);

  writeJSON(LS.cart, cart);
  updateCounts();
  renderCart();
}

async function checkout(btn) {
  const cart = getCart();
  if (cart.length === 0) return;

  btn.disabled = true;
  btn.textContent = "Enviando…";

  try {
    const res = await fetch(`${API}/carts/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: 1,
        products: cart.map((i) => ({ id: i.id, quantity: i.qty })),
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const order = await res.json();

    writeJSON(LS.cart, []);
    updateCounts();
    renderCart(order);
  } catch (err) {
    console.error("Error en checkout:", err);
    showToast("No se pudo enviar el pedido. Revisa tu conexión.");
    btn.disabled = false;
    btn.textContent = "Finalizar compra";
  }
}

// ---------------- Detalle de producto ----------------

async function openDetail(id) {
  const token = ++detailToken;
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  detailContent.innerHTML = `<p class="status-box">Cargando producto…</p>`;

  try {
    const res = await fetch(`${API}/products/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const product = await res.json();
    if (token !== detailToken) return;

    cache.set(product.id, snapshot(product));
    detailState = { product, qty: 1, formRating: 0 };
    detailContent.innerHTML = detailHtml(product);
  } catch (err) {
    if (token !== detailToken) return;
    console.error("Error al cargar el detalle:", err);
    detailContent.innerHTML = `<p class="status-box">No se pudo cargar el producto. Revisa tu conexión.</p>`;
  }
}

function closeDetail() {
  detailToken++;
  overlay.hidden = true;
  document.body.style.overflow = "";
  detailState = null;
}

function detailHtml(p) {
  const snap = snapshot(p);
  const imgs = p.images && p.images.length ? p.images : [p.thumbnail];
  const stock = p.stock ?? 0;
  const stockHtml =
    stock === 0
      ? `<span class="out-stock">Agotado</span>`
      : stock <= 10
      ? `<span class="low-stock">Quedan ${stock} piezas</span>`
      : `<span class="in-stock">En stock</span>`;
  const isFav = Boolean(getFavs()[p.id]);

  const meta = [
    ["Marca", p.brand],
    ["SKU", p.sku],
    ["Envío", p.shippingInformation],
    ["Garantía", p.warrantyInformation],
    ["Devoluciones", p.returnPolicy],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<li><strong>${k}:</strong> ${escapeHtml(v)}</li>`)
    .join("");

  return `
    <div class="detail-top">
      <div class="gallery">
        <div class="gallery__main"><img id="gallery-main" src="${escapeHtml(imgs[0])}" alt="${escapeHtml(p.title)}" /></div>
        ${
          imgs.length > 1
            ? `<div class="gallery__thumbs">${imgs
                .map(
                  (src, i) =>
                    `<button type="button" class="gallery__thumb ${i === 0 ? "active" : ""}" data-action="thumb" data-src="${escapeHtml(src)}"><img src="${escapeHtml(src)}" alt="" loading="lazy" /></button>`
                )
                .join("")}</div>`
            : ""
        }
      </div>

      <div class="detail-info">
        <span class="product-card__cat mono">${escapeHtml(titleCase(p.category || ""))}</span>
        <h2 id="detail-title">${escapeHtml(p.title)}</h2>
        <div class="rating-row">${starsHtml(p.rating)} <span class="mono">${(p.rating ?? 0).toFixed(1)}</span></div>

        <div style="margin-top:12px">
          <span class="detail-price">${usd.format(finalPrice(snap))}</span>
          ${(p.discountPercentage || 0) >= 1 ? `<span class="discount-tag mono">−${Math.round(p.discountPercentage)}%</span>` : ""}
          ${rate ? `<div class="price-mxn mono">≈ ${mxn.format(finalPrice(snap) * rate.value)}</div>` : ""}
        </div>

        <p class="desc">${escapeHtml(p.description)}</p>
        <ul class="meta-list">
          <li>${stockHtml}</li>
          ${meta}
        </ul>

        <div class="qty-row">
          <div class="qty-control">
            <button type="button" data-action="qty-dec" aria-label="Menos">−</button>
            <span id="detail-qty">1</span>
            <button type="button" data-action="qty-inc" aria-label="Más">+</button>
          </div>
          <button type="button" class="btn-primary" data-action="detail-add" ${stock === 0 ? "disabled" : ""}>Agregar al carrito</button>
          <button type="button" class="btn-secondary" id="detail-fav" data-action="detail-fav">${isFav ? "♥ En favoritos" : "♡ Favorito"}</button>
        </div>
      </div>
    </div>

    <div class="reviews" id="reviews-wrap">${reviewsHtml(p)}</div>
  `;
}

function allReviewsFor(p) {
  const mine = (getAllReviews()[p.id] || []).map((r) => ({ ...r, mine: true }));
  const api = (p.reviews || []).map((r) => ({
    name: r.reviewerName,
    rating: r.rating,
    comment: r.comment,
    date: r.date,
    mine: false,
  }));
  return [...mine.sort((a, b) => new Date(b.date) - new Date(a.date)), ...api];
}

function reviewsHtml(p) {
  const reviews = allReviewsFor(p);
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const savedName = localStorage.getItem(LS.name) || "";

  const list = reviews.length
    ? reviews
        .map(
          (r) => `
      <div class="review ${r.mine ? "review--mine" : ""}">
        <div class="review__top">
          <span class="review__name">${escapeHtml(r.name)}${r.mine ? `<span class="tag-mine">Tu reseña</span>` : ""} ${starsHtml(r.rating)}</span>
          <span class="review__date mono">${formatDate(r.date)}${
            r.mine ? ` · <button type="button" class="remove-btn" data-action="delete-review" data-rid="${r.id}">Eliminar</button>` : ""
          }</span>
        </div>
        <p class="review__text">${escapeHtml(r.comment)}</p>
      </div>`
        )
        .join("")
    : `<p class="empty-state" style="padding:20px">Todavía no hay reseñas. ¡Sé la primera persona en comentar!</p>`;

  return `
    <div class="reviews__head">
      <h3>Comentarios y reseñas (${reviews.length})</h3>
      ${reviews.length ? `<span class="mono" style="font-size:.8rem;color:var(--muted)">Promedio ${avg.toFixed(1)} / 5</span>` : ""}
    </div>

    <div class="review-list">${list}</div>

    <form class="review-form" id="review-form" novalidate>
      <h4>Escribe tu reseña</h4>
      <div>
        <label for="rv-name">Nombre</label>
        <input type="text" id="rv-name" class="text-input" value="${escapeHtml(savedName)}" placeholder="Tu nombre" maxlength="40" required />
      </div>
      <div>
        <label>Calificación</label>
        <div class="rating-picker" id="rating-picker">
          ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-action="rate" data-r="${n}" aria-label="${n} estrellas">★</button>`).join("")}
        </div>
      </div>
      <div>
        <label for="rv-comment">Comentario</label>
        <textarea id="rv-comment" class="textarea-input" placeholder="¿Qué te pareció el producto?" maxlength="500" required></textarea>
      </div>
      <button type="submit" class="btn-primary" style="justify-self:start">Publicar reseña</button>
    </form>
  `;
}

function handleDetailClick(e) {
  const el = e.target.closest("[data-action]");
  if (!el || !detailState) return;
  const { product } = detailState;
  const action = el.dataset.action;

  if (action === "thumb") {
    $("gallery-main").src = el.dataset.src;
    detailContent.querySelectorAll(".gallery__thumb").forEach((t) => t.classList.toggle("active", t === el));
  }

  if (action === "qty-inc" || action === "qty-dec") {
    const max = product.stock > 0 ? product.stock : 1;
    detailState.qty = Math.max(1, Math.min(max, detailState.qty + (action === "qty-inc" ? 1 : -1)));
    $("detail-qty").textContent = detailState.qty;
  }

  if (action === "detail-add") addToCart(snapshot(product), detailState.qty);
  if (action === "detail-fav") toggleFav(snapshot(product));

  if (action === "rate") {
    detailState.formRating = Number(el.dataset.r);
    $("rating-picker")
      .querySelectorAll("button")
      .forEach((b) => b.classList.toggle("on", Number(b.dataset.r) <= detailState.formRating));
  }

  if (action === "delete-review") {
    const all = getAllReviews();
    all[product.id] = (all[product.id] || []).filter((r) => String(r.id) !== el.dataset.rid);
    writeJSON(LS.reviews, all);
    $("reviews-wrap").innerHTML = reviewsHtml(product);
    showToast("Reseña eliminada.");
  }
}

function handleReviewSubmit(e) {
  if (e.target.id !== "review-form" || !detailState) return;
  e.preventDefault();

  const name = $("rv-name").value.trim();
  const comment = $("rv-comment").value.trim();
  const rating = detailState.formRating;

  if (!name) return showToast("Escribe tu nombre.");
  if (!rating) return showToast("Elige una calificación de 1 a 5 estrellas.");
  if (!comment) return showToast("Escribe un comentario.");

  const { product } = detailState;
  const all = getAllReviews();
  all[product.id] = all[product.id] || [];
  all[product.id].push({ id: Date.now(), name, rating, comment, date: new Date().toISOString() });
  writeJSON(LS.reviews, all);
  localStorage.setItem(LS.name, name);

  detailState.formRating = 0;
  $("reviews-wrap").innerHTML = reviewsHtml(product);
  showToast("¡Gracias por tu reseña!");
}

function refreshDetailFavButton() {
  if (!detailState) return;
  const btn = $("detail-fav");
  if (!btn) return;
  btn.textContent = getFavs()[detailState.product.id] ? "♥ En favoritos" : "♡ Favorito";
}
