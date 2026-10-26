// GrinDog — service worker
// · App shell: red primero, caché de respaldo
// · Dog CEO API: stale-while-revalidate
// · Fotos de perros (images.dog.ceo): caché al vuelo → los "gustados" se ven sin conexión
const SHELL_CACHE = "dogmatch-shell-v2";
const RUNTIME_CACHE = "dogmatch-runtime-v2";
const SHELL_ASSETS = ["./", "./index.html", "./manifest.json", "./css/styles.css", "./js/app.js", "./js/register-sw.js", "./icons/icon-192x192.png", "./icons/icon-512x512.png", "./icons/logo.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

const ok = (r) => r && (r.ok || r.type === "opaque");

async function networkFirst(req, name) {
  const cache = await caches.open(name);
  try { const r = await fetch(req); if (ok(r)) cache.put(req, r.clone()); return r; }
  catch (err) { const c = await cache.match(req); if (c) return c; throw err; }
}
async function swr(req, name) {
  const cache = await caches.open(name);
  const cached = await cache.match(req);
  const net = fetch(req).then((r) => { if (ok(r)) cache.put(req, r.clone()); return r; }).catch(() => null);
  return cached || (await net) || Response.error();
}
async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const cached = await cache.match(req);
  if (cached) return cached;
  const r = await fetch(req);
  if (ok(r)) cache.put(req, r.clone());
  return r;
}

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) return e.respondWith(networkFirst(request, SHELL_CACHE));
  // La petición "aleatoria" nunca debe venir de caché: siempre red
  if (url.hostname === "dog.ceo") {
    if (url.pathname.includes("/images/random")) return;
    return e.respondWith(swr(request, RUNTIME_CACHE));
  }
  if (url.hostname === "images.dog.ceo" || url.hostname.startsWith("fonts.g")) e.respondWith(cacheFirst(request, RUNTIME_CACHE));
});
