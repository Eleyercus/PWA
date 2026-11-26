(() => {
  "use strict";

  const KEY = "reporteCiudadano.reportes";
  const KEY_BORRADOR = "reporteCiudadano.borrador";
  const MAX_FOTOS = 4;
  const LADO_MAX = 960;       // px, lado mayor de la foto guardada
  const CALIDAD = 0.65;       // JPEG
  const CUOTA_APROX = 5 * 1024 * 1024; // ~5 MB habituales en localStorage
  const $ = (id) => document.getElementById(id);

  /* ---------- Almacenamiento (localStorage) ---------- */
  const Store = {
    leer() {
      try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
    },
    guardar(lista) {
      localStorage.setItem(KEY, JSON.stringify(lista)); // puede lanzar QuotaExceededError
    },
    bytes() {
      try { return (localStorage.getItem(KEY) || "").length * 2; } catch { return 0; }
    }
  };

  /* ---------- Utilidades ---------- */
  function toast(msg, ms = 2800) {
    const t = $("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (t.hidden = true), ms);
  }
  const fecha = (iso) => new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
  const nuevoId = () => "R" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();

  function comprimir(file) {
    return new Promise((ok, mal) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.naturalWidth * k));
        c.height = Math.max(1, Math.round(img.naturalHeight * k));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        ok(c.toDataURL("image/jpeg", CALIDAD));
      };
      img.onerror = () => { URL.revokeObjectURL(url); mal(new Error("No se pudo leer la imagen")); };
      img.src = url;
    });
  }

  /* ---------- Indicador online / offline ---------- */
  const net = $("net"), netText = $("netText");
  let estadoRed = null; // "online" | "offline"

  function pintarRed(estado) {
    const n = Store.leer().length;
    net.className = "net " + estado;
    if (estado === "online") {
      netText.textContent = "En línea";
    } else {
      netText.textContent = n
        ? `Sin conexión · ${n} reporte${n === 1 ? "" : "s"} guardado${n === 1 ? "" : "s"} en tu teléfono`
        : "Sin conexión · puedes seguir creando reportes";
    }
    if (estadoRed && estadoRed !== estado) {
      toast(estado === "online" ? "Conexión recuperada" : "Sin conexión: todo se guarda en el teléfono");
    }
    estadoRed = estado;
  }

  // navigator.onLine solo dice si hay interfaz de red; se confirma con una petición mínima.
  async function comprobarRed() {
    if (!navigator.onLine) return pintarRed("offline");
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    try {
      const r = await fetch("ping.txt?t=" + Date.now(), { method: "HEAD", cache: "no-store", signal: ctl.signal });
      pintarRed(r.ok ? "online" : "offline");
    } catch {
      pintarRed("offline");
    } finally { clearTimeout(t); }
  }
  window.addEventListener("online", comprobarRed);
  window.addEventListener("offline", () => pintarRed("offline"));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) comprobarRed(); });
  setInterval(() => { if (!document.hidden) comprobarRed(); }, 15000);

  /* ---------- Pestañas ---------- */
  function mostrar(vista) {
    const nuevo = vista === "nuevo";
    $("viewNuevo").hidden = !nuevo;
    $("viewLista").hidden = nuevo;
    $("tabNuevo").setAttribute("aria-selected", String(nuevo));
    $("tabLista").setAttribute("aria-selected", String(!nuevo));
    if (!nuevo) pintarLista();
    window.scrollTo(0, 0);
  }
  $("tabNuevo").onclick = () => mostrar("nuevo");
  $("tabLista").onclick = () => mostrar("lista");
  $("irNuevo").onclick = () => mostrar("nuevo");

  /* ---------- Formulario ---------- */
  let fotos = [];       // dataURLs
  let ubicacion = null; // {lat,lng,prec}

  const f = { titulo: $("titulo"), desc: $("descripcion") };

  function guardarBorrador() {
    try {
      localStorage.setItem(KEY_BORRADOR, JSON.stringify({ t: f.titulo.value, d: f.desc.value }));
    } catch { /* sin espacio: el borrador es opcional */ }
  }
  function cargarBorrador() {
    try {
      const b = JSON.parse(localStorage.getItem(KEY_BORRADOR) || "null");
      if (b) { f.titulo.value = b.t || ""; f.desc.value = b.d || ""; }
    } catch { /* ignorar */ }
    $("chars").textContent = f.desc.value.length;
  }
  f.titulo.addEventListener("input", () => { $("errTitulo").hidden = true; guardarBorrador(); });
  f.desc.addEventListener("input", () => {
    $("chars").textContent = f.desc.value.length;
    $("errDesc").hidden = true; guardarBorrador();
  });

  function pintarFotos() {
    const cont = $("fotos");
    cont.replaceChildren();
    fotos.forEach((src, i) => {
      const d = document.createElement("div"); d.className = "foto";
      const im = document.createElement("img"); im.src = src; im.alt = "Foto " + (i + 1);
      im.onclick = () => abrirVisor(src);
      const b = document.createElement("button"); b.type = "button"; b.textContent = "×";
      b.setAttribute("aria-label", "Quitar foto " + (i + 1));
      b.onclick = () => { fotos.splice(i, 1); pintarFotos(); };
      d.append(im, b); cont.append(d);
    });
    const lleno = fotos.length >= MAX_FOTOS;
    $("btnCamara").disabled = lleno; $("btnGaleria").disabled = lleno;
  }

  async function agregarArchivos(files) {
    for (const file of files) {
      if (fotos.length >= MAX_FOTOS) { toast(`Máximo ${MAX_FOTOS} fotos`); break; }
      try { fotos.push(await comprimir(file)); }
      catch { toast("No se pudo procesar una imagen"); }
    }
    pintarFotos();
  }
  $("maxFotos").textContent = MAX_FOTOS;
  $("btnCamara").onclick = () => $("inCamara").click();
  $("btnGaleria").onclick = () => $("inGaleria").click();
  for (const id of ["inCamara", "inGaleria"]) {
    $(id).addEventListener("change", async (e) => {
      await agregarArchivos([...e.target.files]);
      e.target.value = "";
    });
  }

  $("btnUbi").onclick = () => {
    if (!navigator.geolocation) return toast("Tu navegador no permite ubicación");
    $("ubiTxt").textContent = "Buscando…";
    navigator.geolocation.getCurrentPosition(
      (p) => {
        ubicacion = { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), prec: Math.round(p.coords.accuracy) };
        $("ubiTxt").textContent = `${ubicacion.lat}, ${ubicacion.lng} (±${ubicacion.prec} m)`;
      },
      () => { ubicacion = null; $("ubiTxt").textContent = "No se pudo obtener la ubicación"; },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  };

  $("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const titulo = f.titulo.value.trim(), descripcion = f.desc.value.trim();
    $("errTitulo").hidden = !!titulo;
    $("errDesc").hidden = !!descripcion;
    $("errForm").hidden = true;
    if (!titulo || !descripcion) return;

    const reporte = { id: nuevoId(), titulo, descripcion, fotos: [...fotos], ubicacion, creado: new Date().toISOString() };
    const lista = Store.leer();
    lista.unshift(reporte);
    try {
      Store.guardar(lista);
    } catch {
      const err = $("errForm");
      err.textContent = "No hay espacio suficiente en el teléfono para este reporte. Quita alguna foto o elimina reportes antiguos.";
      err.hidden = false;
      return;
    }
    try { localStorage.removeItem(KEY_BORRADOR); } catch {}
    fotos = []; ubicacion = null;
    $("form").reset(); $("chars").textContent = "0"; $("ubiTxt").textContent = "";
    pintarFotos(); actualizarContador(); pintarRed(estadoRed || "offline");
    toast("Reporte guardado en tu teléfono");
    mostrar("lista");
  });

  /* ---------- Lista y detalle ---------- */
  function actualizarContador() { $("count").textContent = Store.leer().length; }

  function pintarLista() {
    const lista = Store.leer(), ul = $("lista");
    ul.replaceChildren();
    $("vacio").hidden = lista.length > 0;
    lista.forEach((r) => {
      const li = document.createElement("li");
      const b = document.createElement("button"); b.className = "item"; b.type = "button";
      let thumb;
      if (r.fotos && r.fotos[0]) { thumb = document.createElement("img"); thumb.src = r.fotos[0]; thumb.alt = ""; }
      else { thumb = document.createElement("div"); thumb.className = "ph"; thumb.textContent = "Sin foto"; }
      const txt = document.createElement("div");
      const h = document.createElement("h3"); h.textContent = r.titulo;
      const p = document.createElement("p"); p.textContent = fecha(r.creado) + (r.fotos.length ? ` · ${r.fotos.length} foto${r.fotos.length === 1 ? "" : "s"}` : "");
      const s = document.createElement("span"); s.className = "estado"; s.textContent = "Guardado en el teléfono";
      txt.append(h, p, s); b.append(thumb, txt);
      b.onclick = () => abrirDetalle(r.id);
      li.append(b); ul.append(li);
    });
    const usado = Store.bytes();
    $("espacio").hidden = lista.length === 0;
    const pct = Math.min(100, Math.round((usado / CUOTA_APROX) * 100));
    $("barFill").style.width = pct + "%";
    $("barFill").className = pct >= 80 ? "alto" : "";
    $("espacioTxt").textContent = `Espacio usado: ${(usado / 1048576).toFixed(1)} MB de unos 5 MB`;
  }

  let actual = null;
  function abrirDetalle(id) {
    const r = Store.leer().find((x) => x.id === id);
    if (!r) return;
    actual = r;
    $("dTitulo").textContent = r.titulo;
    $("dMeta").textContent = `${r.id} · ${fecha(r.creado)}`;
    $("dDesc").textContent = r.descripcion;
    $("dUbi").textContent = r.ubicacion ? `Ubicación: ${r.ubicacion.lat}, ${r.ubicacion.lng} (±${r.ubicacion.prec} m)` : "";
    const cont = $("dFotos"); cont.replaceChildren();
    r.fotos.forEach((src, i) => {
      const d = document.createElement("div"); d.className = "foto";
      const im = document.createElement("img"); im.src = src; im.alt = "Foto " + (i + 1);
      im.onclick = () => abrirVisor(src);
      d.append(im); cont.append(d);
    });
    $("detalle").showModal();
  }
  $("dCerrar").onclick = () => $("detalle").close();
  $("dBorrar").onclick = () => {
    if (!actual || !confirm("¿Eliminar este reporte del teléfono?")) return;
    Store.guardar(Store.leer().filter((x) => x.id !== actual.id));
    $("detalle").close(); actualizarContador(); pintarLista(); pintarRed(estadoRed || "offline");
    toast("Reporte eliminado");
  };

  function aArchivo(dataUrl, nombre) {
    const [cab, b64] = dataUrl.split(",");
    const bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new File([u8], nombre, { type: cab.match(/:(.*?);/)[1] });
  }
  function descargar(blob, nombre) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  $("dCompartir").onclick = async () => {
    if (!actual) return;
    const r = actual;
    const texto = `${r.titulo}\n\n${r.descripcion}\n\n${r.ubicacion ? `Ubicación: https://maps.google.com/?q=${r.ubicacion.lat},${r.ubicacion.lng}\n` : ""}Fecha: ${fecha(r.creado)}`;
    const archivos = r.fotos.map((s, i) => aArchivo(s, `${r.id}-${i + 1}.jpg`));
    try {
      if (navigator.canShare && navigator.canShare({ files: archivos })) {
        await navigator.share({ title: r.titulo, text: texto, files: archivos });
      } else if (navigator.share) {
        await navigator.share({ title: r.titulo, text: texto });
      } else {
        descargar(new Blob([texto], { type: "text/plain" }), `${r.id}.txt`);
        toast("Descargado como archivo de texto");
      }
    } catch (e) {
      if (e.name !== "AbortError") toast("No se pudo compartir");
    }
  };

  /* ---------- Visor ---------- */
  function abrirVisor(src) { $("visorImg").src = src; $("visor").showModal(); }
  $("visorCerrar").onclick = () => $("visor").close();

  /* ---------- Logotipo opcional (img/logo-policia.png) ---------- */
  const logo = $("logoOficial");
  logo.addEventListener("load", () => { if (logo.naturalWidth) logo.hidden = false; });

  /* ---------- Inicio ---------- */
  cargarBorrador(); pintarFotos(); actualizarContador();
  pintarRed(navigator.onLine ? "online" : "offline"); // primer pintado inmediato
  comprobarRed();                                     // y luego confirmación real

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  window.__rc = { Store, comprobarRed };
})();
