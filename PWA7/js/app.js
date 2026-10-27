// GafeteYa — genera un gafete estudiantil en <canvas> a partir de nombre, grupo, carrera y foto.
const $ = (id) => document.getElementById(id);
const KEY = "gafeteya_data";
const W = 640, H = 1016;
const NAVY = "#0b2a4a", GOLD = "#d4a62a", GRAY = "#5d6b80";
const canvas = $("badge");
const ctx = canvas.getContext("2d");

let photoImg = null;          // <img> ya cargada
let photoData = "";           // dataURL reducida (para guardar)
let fontsReady = false;

// ---------- Utilidades de dibujo ----------
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
// Parte un texto en líneas que quepan en maxW
function wrapLines(c, text, maxW) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (c.measureText(test).width <= maxW || !cur) cur = test;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}
// Reduce el tamaño de fuente hasta que el texto quepa en maxLines
function fitText(c, text, maxW, maxLines, sizes, weight) {
  for (const s of sizes) {
    c.font = `${weight} ${s}px "Space Grotesk", Arial, sans-serif`;
    const lines = wrapLines(c, text, maxW);
    if (lines.length <= maxLines) return { lines, size: s };
  }
  const s = sizes[sizes.length - 1];
  c.font = `${weight} ${s}px "Space Grotesk", Arial, sans-serif`;
  return { lines: wrapLines(c, text, maxW).slice(0, maxLines), size: s };
}

// ---------- Dibujo del gafete ----------
function drawBadge() {
  const d = readForm();
  const c = ctx;
  c.clearRect(0, 0, W, H);
  c.save();
  roundRect(c, 0, 0, W, H, 40); c.clip();
  c.fillStyle = "#ffffff"; c.fillRect(0, 0, W, H);

  // Banda superior
  c.fillStyle = NAVY; c.fillRect(0, 0, W, 200);
  c.fillStyle = GOLD; c.fillRect(0, 200, W, 10);
  c.textAlign = "center"; c.textBaseline = "middle";
  c.fillStyle = "#ffffff";
  c.font = '700 34px "Space Grotesk", Arial, sans-serif';
  c.fillText("UNIVERSIDAD TECNOLÓGICA", W / 2, 70);
  c.fillText("DE CADEREYTA", W / 2, 114);
  c.fillStyle = GOLD;
  c.font = '500 22px "IBM Plex Mono", monospace';
  c.fillText("GAFETE ESTUDIANTIL", W / 2, 164);

  // Foto
  const px = 190, py = 232, pw = 260, ph = 340;
  c.save();
  roundRect(c, px, py, pw, ph, 22); c.clip();
  c.fillStyle = "#e6ebf3"; c.fillRect(px, py, pw, ph);
  if (photoImg) {
    const iw = photoImg.naturalWidth || photoImg.width, ih = photoImg.naturalHeight || photoImg.height;
    const zoom = parseFloat($("a-zoom").value) || 1;
    const cover = Math.max(pw / iw, ph / ih) * zoom;
    const dw = iw * cover, dh = ih * cover;
    const ox = (dw - pw) / 2 * (parseFloat($("a-x").value) || 0);
    const oy = (dh - ph) / 2 * (parseFloat($("a-y").value) || 0);
    c.drawImage(photoImg, px - (dw - pw) / 2 - ox, py - (dh - ph) / 2 - oy, dw, dh);
  } else {
    c.fillStyle = "#b7c2d4";
    c.beginPath(); c.arc(px + pw / 2, py + 130, 52, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(px + pw / 2, py + 330, 100, Math.PI, 0); c.fill();
    c.fillStyle = GRAY; c.font = '500 20px "IBM Plex Mono", monospace';
    c.fillText("FOTO", px + pw / 2, py + 40);
  }
  c.restore();
  c.lineWidth = 8; c.strokeStyle = GOLD;
  roundRect(c, px, py, pw, ph, 22); c.stroke();

  // Nombre
  const maxW = 560;
  c.textAlign = "center"; c.textBaseline = "alphabetic";
  const name = (d.name || "NOMBRE Y APELLIDOS").toUpperCase();
  const nm = fitText(c, name, maxW, 2, [44, 38, 32, 28], "700");
  c.fillStyle = d.name ? NAVY : "#9aa6b8";
  nm.lines.forEach((l, i) => c.fillText(l, W / 2, 628 + i * (nm.size + 8)));
  const afterName = 628 + (nm.lines.length - 1) * (nm.size + 8);

  c.fillStyle = GOLD; c.fillRect(W / 2 - 50, afterName + 22, 100, 6);

  // Grupo
  const gy = afterName + 62;
  c.fillStyle = GRAY; c.font = '500 20px "IBM Plex Mono", monospace';
  c.fillText("GRUPO", W / 2, gy);
  c.fillStyle = d.group ? NAVY : "#9aa6b8";
  c.font = '700 40px "Space Grotesk", Arial, sans-serif';
  c.fillText((d.group || "GRUPO").toUpperCase(), W / 2, gy + 42);

  // Carrera
  const cy = gy + 84;
  c.fillStyle = GRAY; c.font = '500 20px "IBM Plex Mono", monospace';
  c.fillText("CARRERA", W / 2, cy);
  const cr = fitText(c, d.career || "Nombre de la carrera", maxW, 3, [28, 25, 22, 20], "500");
  c.fillStyle = d.career ? NAVY : "#9aa6b8";
  cr.lines.forEach((l, i) => c.fillText(l, W / 2, cy + 36 + i * (cr.size + 6)));

  // Banda inferior
  c.fillStyle = NAVY; c.fillRect(0, H - 56, W, 56);
  c.fillStyle = "#ffffff"; c.textBaseline = "middle";
  c.font = '700 22px "Space Grotesk", Arial, sans-serif';
  c.fillText("ESTUDIANTE  ·  PRÁCTICA ESCOLAR", W / 2, H - 28);
  c.restore();
}

// ---------- Formulario ----------
function readForm() {
  return { name: $("f-name").value.trim(), group: $("f-group").value.trim(), career: $("f-career").value.trim() };
}
function saveState() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readForm(), photo: photoData, zoom: $("a-zoom").value, x: $("a-x").value, y: $("a-y").value }));
  } catch { /* si el almacenamiento está lleno o bloqueado, se ignora */ }
}
function refresh() { drawBadge(); saveState(); }
["f-name", "f-group", "f-career"].forEach((id) => $(id).addEventListener("input", () => { $(id).classList.remove("bad"); refresh(); }));
["a-zoom", "a-x", "a-y"].forEach((id) => $(id).addEventListener("input", refresh));

// ---------- Foto: código base del maestro (camara → FileReader → galeria → localStorage "misFotos") ----------
let camara = document.getElementById('camara');
let galeria = document.getElementById('galeria');

galeria.innerHTML = localStorage.getItem('misFotos') || "";

function setMsg(t, ok) { $("msg").textContent = t; $("msg").classList.toggle("ok", !!ok); }
function guardarGaleria() {
  // Se guarda la galería sin la marca visual de "seleccionada"
  const copia = galeria.cloneNode(true);
  copia.querySelectorAll('img').forEach((im) => im.classList.remove('sel'));
  try { localStorage.setItem('misFotos', copia.innerHTML); }
  catch { setMsg("La galería está llena: usa “Vaciar” para liberar espacio."); }
  $("gal-clear").hidden = galeria.querySelectorAll('img').length === 0;
}
function marcarSeleccion() {
  galeria.querySelectorAll('img').forEach((im) => im.classList.toggle('sel', !!photoData && im.getAttribute('src') === photoData));
}
// Reduce la foto (las del celular pesan varios MB y localStorage tiene ~5 MB en total)
function reducir(src, max, cb) {
  const img = new Image();
  img.onload = () => {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const k = Math.min(1, max / Math.max(iw, ih));
    const t = document.createElement("canvas");
    t.width = Math.round(iw * k); t.height = Math.round(ih * k);
    t.getContext("2d").drawImage(img, 0, 0, t.width, t.height);
    cb(t.toDataURL("image/jpeg", 0.8));
  };
  img.onerror = () => setMsg("No se pudo leer esa imagen.");
  img.src = src;
}
function usarFoto(src) {
  const im = new Image();
  im.onload = () => { photoImg = im; photoData = src; showAdjust(true); marcarSeleccion(); refresh(); setMsg(""); };
  im.src = src;
}

function procesarArchivo(event) {
  let archivo = event.target.files[0];

  if (archivo) {
    let lector = new FileReader();

    lector.onload = function (e) {
      let fotoBase64 = e.target.result;
      reducir(fotoBase64, 600, function (chica) {
        galeria.innerHTML += '<img src="' + chica + '">';
        guardarGaleria();
        usarFoto(chica);          // la foto recién tomada se usa en el gafete
      });
    };

    lector.readAsDataURL(archivo);
  }
  event.target.value = "";
}
camara.addEventListener('change', procesarArchivo);
$("subir").addEventListener('change', procesarArchivo);

// Tocar una foto de la galería = usarla en el gafete
galeria.addEventListener('click', (e) => {
  const im = e.target.closest('img'); if (im) usarFoto(im.getAttribute('src'));
});
$("gal-clear").addEventListener('click', () => {
  galeria.innerHTML = ""; localStorage.removeItem('misFotos'); $("gal-clear").hidden = true;
  photoImg = null; photoData = ""; showAdjust(false); refresh();
});

function showAdjust(on) { $("adjust").hidden = !on; }
$("photo-remove").addEventListener("click", () => {
  photoImg = null; photoData = "";
  $("a-zoom").value = 1; $("a-x").value = 0; $("a-y").value = 0;
  showAdjust(false); marcarSeleccion(); refresh();
});

// ---------- Salidas ----------
function validate() {
  const d = readForm();
  let ok = true;
  [["name", "f-name"], ["group", "f-group"], ["career", "f-career"]].forEach(([k, id]) => {
    const bad = !d[k]; $(id).classList.toggle("bad", bad); if (bad) ok = false;
  });
  if (!ok) setMsg("Completa nombre, grupo y carrera.");
  else if (!photoImg) { setMsg("Aún no has elegido una foto (el gafete saldrá con espacio vacío).", true); }
  else setMsg("");
  return ok;
}
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "estudiante";
const toBlob = () => new Promise((res) => canvas.toBlob(res, "image/png"));

$("download-btn").addEventListener("click", async () => {
  if (!validate()) return;
  drawBadge();
  const blob = await toBlob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `gafete-${slug(readForm().name)}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  setMsg("Gafete descargado.", true);
});
$("print-btn").addEventListener("click", () => {
  if (!validate()) return;
  drawBadge();
  $("print-img").src = canvas.toDataURL("image/png");
  window.print();
});
if (navigator.canShare && navigator.share) {
  $("share-btn").hidden = false;
  $("share-btn").addEventListener("click", async () => {
    if (!validate()) return;
    drawBadge();
    const file = new File([await toBlob()], `gafete-${slug(readForm().name)}.png`, { type: "image/png" });
    if (!navigator.canShare({ files: [file] })) return setMsg("Tu dispositivo no permite compartir imágenes desde aquí. Usa Descargar.");
    try { await navigator.share({ files: [file], title: "Mi gafete estudiantil" }); } catch { /* cancelado */ }
  });
}
$("form").addEventListener("reset", () => {
  setTimeout(() => {
    photoImg = null; photoData = ""; showAdjust(false);
    ["f-name", "f-group", "f-career"].forEach((id) => $(id).classList.remove("bad"));
    setMsg(""); localStorage.removeItem(KEY); marcarSeleccion(); drawBadge();
  });
});

// ---------- Instalar (Android / escritorio) ----------
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; $("install-btn").hidden = false; });
$("install-btn").addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt(); await deferredPrompt.userChoice;
  deferredPrompt = null; $("install-btn").hidden = true;
});
window.addEventListener("appinstalled", () => ($("install-btn").hidden = true));

// ---------- Inicio ----------
(function init() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch {}
  if (s) {
    $("f-name").value = s.name || ""; $("f-group").value = s.group || ""; $("f-career").value = s.career || "";
    $("a-zoom").value = s.zoom || 1; $("a-x").value = s.x || 0; $("a-y").value = s.y || 0;
    if (s.photo) {
      photoData = s.photo;
      const im = new Image();
      im.onload = () => { photoImg = im; showAdjust(true); marcarSeleccion(); drawBadge(); };
      im.src = s.photo;
    }
  }
  $("gal-clear").hidden = galeria.querySelectorAll('img').length === 0;
  drawBadge();
  // Redibuja cuando las fuentes ya cargaron (el canvas no se actualiza solo)
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fontsReady = true; drawBadge(); });
})();

// Service worker (registro del maestro)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
}
