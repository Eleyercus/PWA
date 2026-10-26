// GrinDog — El grinder para perros (Dog CEO API)
const API = "https://dog.ceo/api";
const KEY = "grindog_liked";
const SEEN_KEY = "grindog_seen";
const COUNT_KEY = "grindog_count";   // matches dados (cada 10 → match de vuelta)
const CHAT_KEY = "grindog_chats";
const MATCH_EVERY = 10;

const $ = (id) => document.getElementById(id);
const img = $("dog-img"), card = $("card");

// ---------- Estado ----------
let current = null, nextData = null, busy = false;

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
let liked = load(KEY, []);
let chats = load(CHAT_KEY, {});
let seen = Number(localStorage.getItem(SEEN_KEY)) || 0;
let count = Number(localStorage.getItem(COUNT_KEY)) || 0;
const save = () => {
  localStorage.setItem(KEY, JSON.stringify(liked));
  localStorage.setItem(SEEN_KEY, String(seen));
  localStorage.setItem(COUNT_KEY, String(count));
  localStorage.setItem(CHAT_KEY, JSON.stringify(chats));
};

// ---------- Perfil generado (determinista por URL) ----------
const NAMES = ["Max","Luna","Rocky","Mía","Toby","Nala","Zeus","Kira","Bruno","Lola","Thor","Coco","Simba","Maya","Rex","Bella","Fito","Canela","Duke","Pelusa"];
const TRAITS = [
  "Me gustan los paseos de noche y las miradas largas.",
  "Dicen que muerdo, pero solo si me lo pides bien.",
  "Busco a alguien que me rasque justo donde nadie llega.",
  "Mi mejor truco: derretirte con un solo parpadeo.",
  "Pelaje suave, instintos peligrosos.",
  "Si ves que muevo la cola, ya sabes lo que quiero.",
  "Tímido al principio... después no me despegas.",
  "Me sé todos los trucos. Algunos solo en privado.",
];
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function breedFromUrl(url) {
  const m = url.match(/\/breeds\/([^/]+)\//);
  return m ? m[1].split("-").reverse().join(" ") : "mestizo";
}
function makeDog(url) {
  const h = hash(url);
  return { url, breed: breedFromUrl(url), name: NAMES[h % NAMES.length], age: (h % 12) + 1, trait: TRAITS[(h >> 3) % TRAITS.length] };
}

// ---------- Mensajes del chat ----------
const FIRST = [
  "Hola, soy {name}. Te vi dándome match y no pude quedarme quieto... 😏",
  "Qué casualidad, {name} aquí. Yo también te di like. ¿Quién persigue a quién?",
  "Me llamo {name} y esta cola no se mueve sola. Tú tienes la culpa. 🐾",
  "Ey... {name}. Vi tu perfil y ahora me dan ganas de aullar. ¿Qué haces esta noche?",
];
const REPLIES = [
  "Mmm... sigue hablándome así y me hago el difícil. 😏",
  "Me estás poniendo la cola a mil.",
  "¿Y si nos vemos en el parque cuando oscurezca?",
  "Tengo un hueso guardado para ti... y no es literal. 🐾",
  "Ay, me derrites. Estoy a un paso de rodar panza arriba.",
  "Uf. Acabas de ganarte un lametón. Luego lo cobro.",
  "Me gusta tu energía. Acércate más, no muerdo... mucho.",
];

// ---------- API ----------
async function fetchDog() {
  const breed = $("breed-select").value;
  const path = breed ? `/breed/${breed}/images/random` : "/breeds/image/random";
  const res = await fetch(API + path, { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  if (data.status !== "success") throw new Error("API");
  return makeDog(data.message);
}
const preloadImage = (url) => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(url); i.onerror = fail; i.src = url; });
async function getDogReady() { const dog = await fetchDog(); await preloadImage(dog.url); return dog; }

// ---------- Tarjeta ----------
function show(dog) {
  current = dog;
  img.src = dog.url;
  img.alt = `Foto de ${dog.name}, un perro ${dog.breed}`;
  $("dog-name").textContent = `${dog.name}, ${dog.age} ${dog.age === 1 ? "año" : "años"}`;
  $("dog-meta").textContent = dog.breed;
  $("dog-trait").textContent = `“${dog.trait}”`;
  $("loader").hidden = true;
  $("error").hidden = true;
}
async function nextDog() {
  if (busy) return;
  busy = true; setBtns(true);
  $("loader").hidden = false; $("error").hidden = true;
  try {
    const dog = nextData || (await getDogReady());
    nextData = null;
    show(dog);
    seen++; save(); renderStats();
    getDogReady().then((d) => (nextData = d)).catch(() => (nextData = null));
  } catch {
    $("loader").hidden = true; $("error").hidden = false; current = null;
  } finally {
    busy = false; setBtns(false);
  }
}
const setBtns = (d) => { $("next-btn").disabled = d; $("like-btn").disabled = d; };
const animate = (cls, ms = 260) => new Promise((r) => { card.classList.add(cls); setTimeout(() => { card.classList.remove(cls); r(); }, ms); });

// ---------- Acciones ----------
async function skip() {
  if (busy) return;
  await animate("go-left");
  nextDog();
}
async function match() {
  if (busy || !current) return;
  let mutualDog = null;
  if (!liked.some((d) => d.url === current.url)) {
    liked.unshift({ ...current, at: Date.now() });
    count++;
    // Cada 10 matches, uno de tus últimos 10 te corresponde
    if (count % MATCH_EVERY === 0) {
      mutualDog = pick(liked.slice(0, MATCH_EVERY));
      mutualDog.mutual = true;
    }
    save(); renderLiked(); renderStats();
  }
  $("stamp").classList.add("show");
  await animate("go-right", 380);
  $("stamp").classList.remove("show");
  nextDog();
  if (mutualDog) setTimeout(() => startMutual(mutualDog), 900);
}
function removeLiked(url) {
  liked = liked.filter((d) => d.url !== url);
  delete chats[url];
  if (chatUrl === url) closeChat();
  save(); renderLiked(); renderStats();
}

// ---------- Chat ----------
let chatUrl = null;
const dogOf = (url) => liked.find((d) => d.url === url);

function toast(text) {
  const t = $("toast");
  t.textContent = text; t.hidden = false;
  clearTimeout(toast.id);
  toast.id = setTimeout(() => (t.hidden = true), 3500);
}
function addMsg(url, from, text) {
  (chats[url] ||= []).push({ f: from, t: text });
  save();
  if (chatUrl === url) renderChat();
}
function renderChat() {
  const body = $("chat-body");
  body.innerHTML = "";
  (chats[chatUrl] || []).forEach((m) => {
    const p = document.createElement("div");
    p.className = "msg " + (m.f === "me" ? "msg--me" : "msg--dog");
    p.textContent = m.t;               // textContent: nada de HTML inyectado
    body.appendChild(p);
  });
  body.scrollTop = body.scrollHeight;
}
function typingThen(url, text, ms = 1400) {
  if (chatUrl === url) {
    const p = document.createElement("div");
    p.className = "msg msg--dog msg--typing"; p.id = "typing"; p.textContent = "escribiendo…";
    $("chat-body").appendChild(p); $("chat-body").scrollTop = 1e6;
  }
  setTimeout(() => {
    $("typing")?.remove();
    if (dogOf(url)) addMsg(url, "dog", text);
  }, ms);
}
function openChat(url, minimized = false) {
  const d = dogOf(url); if (!d) return;
  chatUrl = url;
  $("chat-avatar").src = d.url;
  $("chat-name").textContent = d.name;
  $("chat").hidden = false;
  $("chat").classList.toggle("min", minimized);
  renderChat();
}
function closeChat() { chatUrl = null; $("chat").hidden = true; }

function startMutual(dog) {
  toast(`💛 ¡${dog.name} también te dio match!`);
  openChat(dog.url);
  typingThen(dog.url, pick(FIRST).replace("{name}", dog.name));
}

// ---------- Render ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function renderStats() {
  $("seen-count").textContent = seen;
  $("like-count").textContent = liked.length;
  $("liked-badge").textContent = liked.length;
  const into = count % MATCH_EVERY;
  $("progress-fill").style.width = (into / MATCH_EVERY) * 100 + "%";
  $("progress-text").textContent = count > 0 && into === 0
    ? "💛 ¡Match mutuo conseguido! Otros 10 y puede pasar de nuevo"
    : `Faltan ${MATCH_EVERY - into} matches para que alguien te devuelva el guiño`;
}
function renderLiked() {
  $("liked-list").innerHTML = liked.map((d) => `
    <li class="liked__item${d.mutual ? " mutual" : ""}">
      <img src="${esc(d.url)}" alt="${esc(d.name)}" loading="lazy" />
      ${d.mutual ? '<span class="mutual-tag">💛 Match mutuo</span>' : ""}
      <button class="liked__remove" data-url="${esc(d.url)}" aria-label="Quitar a ${esc(d.name)}" type="button">✕</button>
      <div><strong>${esc(d.name)}, ${d.age}</strong><small>${esc(d.breed)}</small></div>
      ${d.mutual ? `<button class="liked__chat" data-chat="${esc(d.url)}" type="button">Abrir chat</button>` : ""}
    </li>`).join("");
  $("liked-empty").hidden = liked.length > 0;
  $("clear-btn").hidden = liked.length === 0;
}

async function loadBreeds() {
  try {
    const data = await (await fetch(API + "/breeds/list/all")).json();
    Object.keys(data.message).forEach((b) => {
      const o = document.createElement("option");
      o.value = b; o.textContent = b;
      $("breed-select").appendChild(o);
    });
  } catch { /* sin conexión */ }
}

// ---------- Eventos ----------
$("next-btn").addEventListener("click", skip);
$("like-btn").addEventListener("click", match);
$("retry-btn").addEventListener("click", nextDog);
$("liked-list").addEventListener("click", (e) => {
  const rm = e.target.closest(".liked__remove");
  if (rm) return removeLiked(rm.dataset.url);
  const ch = e.target.closest(".liked__chat");
  if (ch) openChat(ch.dataset.chat);
});
$("clear-btn").addEventListener("click", () => { liked = []; chats = {}; closeChat(); save(); renderLiked(); renderStats(); });
$("breed-select").addEventListener("change", () => { nextData = null; nextDog(); });
$("chat-close").addEventListener("click", (e) => { e.stopPropagation(); closeChat(); });
$("chat-min").addEventListener("click", (e) => { e.stopPropagation(); $("chat").classList.toggle("min"); });
$("chat-head").addEventListener("click", () => $("chat").classList.remove("min"));
$("chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("chat-input").value.trim();
  if (!text || !chatUrl) return;
  $("chat-input").value = "";
  addMsg(chatUrl, "me", text);
  typingThen(chatUrl, pick(REPLIES), 1200);
});
document.addEventListener("keydown", (e) => {
  if (["SELECT", "INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
  if (e.key === "ArrowLeft") skip();
  if (e.key === "ArrowRight") match();
});

// ---------- Inicio ----------
renderLiked(); renderStats(); loadBreeds(); nextDog();
