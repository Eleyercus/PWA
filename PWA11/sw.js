const CACHE = "reporte-ciudadano-v1";
const ARCHIVOS = [
  "./", "./index.html", "./manifest.json",
  "./css/styles.css", "./js/app.js",
  "./icons/icon-192x192.png", "./icons/icon-512x512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // La prueba de conexión nunca debe salir de la caché
  if (url.pathname.endsWith("/ping.txt")) return;

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        // Guarda también el logotipo opcional si el usuario lo agrega
        if (res.ok && url.pathname.includes("/img/")) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return res;
      }).catch(() => (req.mode === "navigate" ? caches.match("./index.html") : Response.error()));
    })
  );
});
