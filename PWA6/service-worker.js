// VozCalc — todo el shell (incluida la librería annyang) se guarda en caché: la calculadora manual funciona sin conexión.
// El reconocimiento de voz del navegador (Chrome/Edge) sí necesita internet.
const CACHE = "vozcalc-v1";
const SHELL = ["./", "./index.html", "./manifest.json", "./css/styles.css", "./js/calc.js", "./js/app.js", "./js/register-sw.js", "./js/vendor/annyang.min.js", "./icons/icon-192x192.png", "./icons/icon-512x512.png"];
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
      try { const r = await fetch(request); if (r.ok) cache.put(request, r.clone()); return r; }
      catch (err) { const c = await cache.match(request); if (c) return c; throw err; }
    })
  );
});
