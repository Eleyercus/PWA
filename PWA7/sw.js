// GafeteYa (sw.js) — todo funciona sin conexión: shell en caché (red primero para ver cambios) y fuentes al vuelo.
const CACHE = "gafeteya-v2";
const SHELL = ["./", "./index.html", "./manifest.json", "./css/styles.css", "./js/app.js", "./icons/icon-192x192.png", "./icons/icon-512x512.png", "./icons/logo-ut.png", "./icons/escudo-nl.png", "./icons/sep.png", "./icons/educacion-nl.png", "./icons/gobierno-nl.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin && !url.hostname.startsWith("fonts.g")) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try { const r = await fetch(request); if (r.ok || r.type === "opaque") cache.put(request, r.clone()); return r; }
      catch (err) { const c = await cache.match(request); if (c) return c; throw err; }
    })
  );
});
