# PWA11 · Reporte Ciudadano (Cadereyta Jiménez, N.L.)

Prototipo académico — Programación de Aplicaciones Web Progresivas e Integradora, UT Cadereyta.

**No es un canal oficial.** Los reportes se guardan solo en el teléfono (localStorage) y no se envían a ninguna autoridad. En una emergencia: 911.

## Qué hace
- Título, descripción, hasta 4 fotos desde la cámara (o galería) y ubicación opcional.
- Barra superior que indica **En línea / Sin conexión**. No se fía solo de `navigator.onLine`: confirma con una petición mínima a `ping.txt` (4 s de límite, cada 15 s con la app visible).
- Todo funciona sin internet: service worker con caché primero y reportes en `localStorage`.
- Las fotos se reducen a 960 px / JPEG 65 % para que quepan en los ~5 MB de localStorage; si se llena, la app avisa y no pierde lo escrito.
- El borrador del formulario se conserva si cierras la app.
- Compartir un reporte (Web Share con fotos; si no existe, descarga un .txt).

## Logotipo de la Policía Municipal
La app **no incluye** el logotipo oficial. Para mostrarlo en el encabezado, guarda tu archivo como `PWA11/img/logo-policia.png` (PNG, fondo transparente, ~200 px de alto). Aparece solo, sin tocar el código. Usa el que te entregue la corporación o un archivo del que tengas autorización, y conserva el aviso de "Prototipo académico".

## Límites conocidos
- localStorage guarda unos 5 MB: son pocas decenas de fotos. Para volumen real habría que usar IndexedDB y un servidor.
- Aún no hay servidor: nada llega a la corporación.
- Probado en Chromium (27 pruebas automáticas). Falta probar en teléfonos reales, sobre todo la cámara en iPhone.
