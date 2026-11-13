# Protocolo Seguro (PWA10) — Caso 2: manuales de seguridad industrial

PWA que funciona **sin internet** (sótanos, zonas de concreto). Los manuales se descargan completos una vez, se verifican con SHA-256 y se consultan siempre desde el teléfono.

Para publicar una edición nueva de los manuales (una vez al año, tras la auditoría):
1. Edita `content/manual.json` y `version.json` (nueva versión, fecha, auditoría y cambios).
2. Ejecuta `node tools/build.js` (genera `release.json` con los hashes e inyecta la versión en `sw.js`).
3. Sube todo al repositorio. Los teléfonos descargan la edición nueva en segundo plano y avisan al usuario.

Contenido de ejemplo (planta ficticia): debe ser validado por el responsable de seguridad antes de un uso real.
