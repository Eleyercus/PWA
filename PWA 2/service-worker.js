const CACHE_NAME = "trackshop-cache-v2";

const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/app.js",
  "./js/register-sw.js",
  "./data/orders.json",
];

// Instalación: precachea los recursos base de la app
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// Activación: limpia versiones de caché anteriores
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: cache-first para recursos propios, red directa para el resto (ej. tiles de mapa)
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isOwnAsset = url.origin === self.location.origin;

  if (!isOwnAsset) return; // deja pasar tiles de OpenStreetMap y CDN de Leaflet

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
      );
    })
  );
});
