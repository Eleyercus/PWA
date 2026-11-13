// Service worker: "la red es un extra". Todo se sirve del caché; la red solo se usa para descargar versiones nuevas.
importScripts("js/store.js");
/*BUILD:START*/
const VERSION = "2026.1.0", FECHA = "2026-11-13", AUDITORIA = "Auditoría interna anual 2026 (ejemplo)";
/*BUILD:END*/
const CACHE = "proto-" + VERSION;
const abs = (p) => new URL(p, self.registration.scope).href;
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha = async (buf) => hex(await crypto.subtle.digest("SHA-256", buf));
const say = async (m) => (await self.clients.matchAll({ includeUncontrolled: true })).forEach((c) => c.postMessage(m));

// INSTALAR: descarga TODO, verifica cada archivo contra su hash y solo entonces la versión queda disponible.
// Si algo falla (red cortada, archivos mezclados de dos versiones) la instalación se descarta y la versión anterior sigue intacta.
self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    try {
      const rr = await fetch(abs("release.json"), { cache: "reload" });
      if (!rr.ok) throw new Error("release.json " + rr.status);
      const raw = rr.clone(), rel = await rr.json();
      if (rel.version !== VERSION) throw new Error("versión inconsistente: " + rel.version + " ≠ " + VERSION);
      const cache = await caches.open(CACHE);
      await cache.put(abs("release.json"), raw);
      const paths = Object.keys(rel.files); let n = 0;
      const one = async (p) => {
        const r = await fetch(abs(p), { cache: "reload" });
        if (!r.ok) throw new Error(p + " " + r.status);
        if ((await sha(await r.clone().arrayBuffer())) !== rel.files[p]) throw new Error("hash distinto: " + p);
        await cache.put(abs(p), r); say({ type: "progreso", n: ++n, total: paths.length, version: VERSION });
      };
      for (let i = 0; i < paths.length; i += 4) await Promise.all(paths.slice(i, i + 4).map(one));
      say({ type: "descargado", version: VERSION });
    } catch (err) { await caches.delete(CACHE); say({ type: "fallo-instalacion", motivo: String(err.message || err) }); throw err; }
  })());
});

// ACTIVAR: borra versiones viejas solo cuando la nueva ya está completa y en uso.
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    (await caches.keys()).filter((k) => k.startsWith("proto-") && k !== CACHE).forEach((k) => caches.delete(k));
    await self.clients.claim(); say({ type: "activo", version: VERSION });
  })());
});

// CONSULTAR: siempre caché primero. Nunca "red primero": con una sola raya de señal esperar la red retrasaría una emergencia.
self.addEventListener("fetch", (e) => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== "GET" || u.origin !== location.origin) return;
  if (req.cache === "reload" && req.mode !== "navigate") return;      // la página lo usa para reparar archivos: debe ir a la red
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req.mode === "navigate" ? abs("index.html") : req, { ignoreSearch: true });
    if (hit) return hit;
    try { return await fetch(req); }
    catch (err) { return req.mode === "navigate" ? (await cache.match(abs("index.html"))) || Response.error() : Response.error(); }
  })());
});

self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type === "SKIP_WAITING") self.skipWaiting();
  if (d.type === "GET_INFO" && e.ports[0]) e.ports[0].postMessage({ version: VERSION, fecha: FECHA, auditoria: AUDITORIA });
});

// Sincronización de lecturas cuando vuelve la red (Chromium); en los demás navegadores lo hace la página al abrir.
self.addEventListener("sync", (e) => { if (e.tag === "sync-lecturas") e.waitUntil(Store.enviarPendientes()); });
