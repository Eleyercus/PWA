(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  // ---------- Pestañas ----------
  function tab(name) {
    document.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === name));
    document.querySelectorAll("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== name));
    if (name !== "leer") stopCam();
    if (name === "hist") renderHist();
  }
  document.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => tab(b.dataset.tab)));

  // ---------- Historial ----------
  const hist = () => LS.get("qr_hist", []);
  function addHist(origen, kind, texto) {
    const h = hist(); h.unshift({ origen, kind, texto: kind === "imagen" ? "(imagen)" : String(texto).slice(0, 200), hora: Date.now() });
    LS.set("qr_hist", h.slice(0, 30));
  }
  function renderHist() {
    const ul = $("h-list"); ul.textContent = ""; const h = hist(); $("h-empty").hidden = h.length > 0; $("h-clear").hidden = !h.length;
    h.forEach((x) => {
      const li = el("li", x.origen === "leído" ? "leido" : ""); const t = el("div", "t");
      t.append(el("b", "", `${x.origen === "leído" ? "Leído" : "Generado"} · ${x.kind}`), el("small", "muted", x.texto), el("small", "muted", new Date(x.hora).toLocaleString("es-MX")));
      li.appendChild(t);
      if (x.kind !== "imagen") { const b = el("button", "ghost", "Regenerar"); b.onclick = () => { $("g-tipo").value = "texto"; showFields(); $("f-texto").value = x.texto; tab("gen"); generate(); }; li.appendChild(b); }
      ul.appendChild(li);
    });
  }
  $("h-clear").onclick = () => { LS.set("qr_hist", []); renderHist(); };

  // =====================================================================
  //                              GENERAR
  // =====================================================================
  const gmsg = (t, ok) => { const m = $("g-msg"); m.className = "msg" + (ok ? " ok" : ""); m.textContent = t || ""; };
  let imgData = "";                 // data URL ya comprimida lista para el QR
  let lastText = "";

  function showFields() {
    const t = $("g-tipo").value;
    document.querySelectorAll("[data-f]").forEach((d) => (d.hidden = d.dataset.f !== t));
    $("g-out").hidden = true; gmsg("");
  }
  $("g-tipo").onchange = showFields;

  function getContent() {
    const t = $("g-tipo").value, v = (id) => $(id).value;
    switch (t) {
      case "imagen": return imgData;
      case "texto": return QRCore.build("texto", { texto: v("f-texto") });
      case "url": return QRCore.build("url", { url: v("f-url") });
      case "wifi": return QRCore.build("wifi", { ssid: v("f-ssid"), pass: v("f-wpass"), seg: v("f-seg") });
      case "contacto": return QRCore.build("contacto", { nombre: v("f-cn"), tel: v("f-ct"), email: v("f-ce"), org: v("f-co") });
      case "correo": return QRCore.build("correo", { email: v("f-me"), asunto: v("f-ma") });
      case "tel": return QRCore.build("tel", { tel: v("f-tel") });
      case "geo": return QRCore.build("geo", { lat: v("f-lat"), lng: v("f-lng") });
    }
    return "";
  }

  function makeQR(text, ecc) {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
    const qr = qrcode(0, ecc); qr.addData(text, "Byte"); qr.make(); return qr;
  }
  function drawQR(canvas, qr, fg, bg) {
    const n = qr.getModuleCount(), q = 4, size = n + q * 2, px = Math.max(2, Math.floor(720 / size));
    canvas.width = canvas.height = size * px;
    const g = canvas.getContext("2d"); g.fillStyle = bg; g.fillRect(0, 0, canvas.width, canvas.height); g.fillStyle = fg;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect((c + q) * px, (r + q) * px, px, px);
  }
  function contrastOK(a, b) {
    const lum = (h) => { const [r, g, bl] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
    const L1 = lum(a), L2 = lum(b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05) >= 3 && L1 < L2;   // código oscuro sobre fondo claro
  }

  function generate() {
    const type = $("g-tipo").value;
    const text = getContent();
    if (!text) { $("g-out").hidden = true; return gmsg(type === "imagen" ? "Elige una imagen." : "Completa los datos para generar el QR."); }
    const fg = $("o-fg").value, bg = $("o-bg").value;
    if (!contrastOK(fg, bg)) return gmsg("Colores con poco contraste: usa un color oscuro sobre fondo claro para que el QR se pueda leer.");
    const ecc = type === "imagen" ? "L" : $("o-ecc").value;
    let qr;
    try { qr = makeQR(text, ecc); }
    catch (e) { $("g-out").hidden = true; return gmsg(`El contenido es demasiado largo para un QR (${QRCore.bytesOf(text)} bytes). Acórtalo${type === "imagen" ? " o baja la calidad" : ""}.`); }
    drawQR($("g-canvas"), qr, fg, bg);
    lastText = text; gmsg("");
    $("g-out").hidden = false;
    $("g-meta").textContent = `${QRCore.bytesOf(text)} bytes · versión ${(qr.getModuleCount() - 17) / 4} · corrección ${ecc}`;
    $("g-share").hidden = !(navigator.canShare && navigator.share);
    addHist("generado", type === "imagen" ? "imagen" : QRCore.parse(text).kind, text);
  }
  let timer = 0;
  const debounce = () => { clearTimeout(timer); if ($("g-tipo").value !== "imagen") timer = setTimeout(generate, 350); };
  document.querySelectorAll("[data-f] input, [data-f] textarea, [data-f] select, .opts input, .opts select").forEach((n) => {
    if (n.id === "f-img") return;
    n.addEventListener("input", debounce); n.addEventListener("change", () => { if ($("g-tipo").value === "imagen") { if (n.id === "f-imgq") fitImage(); else if (n.closest(".opts")) generate(); } else debounce(); });
  });

  // --- imágenes: se reducen hasta caber en un QR ---
  let srcBitmap = null;
  $("f-img").onchange = async (e) => {
    const f = e.target.files[0]; imgData = ""; $("img-info").textContent = ""; $("g-out").hidden = true;
    if (!f) return;
    if (!/^image\//.test(f.type)) return gmsg("Ese archivo no es una imagen.");
    try { srcBitmap = await loadBitmap(f); } catch (err) { return gmsg("No se pudo leer la imagen."); }
    fitImage();
  };
  async function loadBitmap(file) {
    if (window.createImageBitmap) { try { return await createImageBitmap(file); } catch (e) {} }
    return new Promise((res, rej) => { const u = URL.createObjectURL(file), i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = rej; i.src = u; });
  }
  function fitImage() {
    if (!srcBitmap) return;
    const budget = +$("f-imgq").value, W = srcBitmap.width, H = srcBitmap.height;
    for (const maxSide of [192, 160, 128, 112, 96, 80, 64, 56, 48, 40, 32, 24]) {
      const k = Math.min(1, maxSide / Math.max(W, H)), w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.imageSmoothingQuality = "high"; g.drawImage(srcBitmap, 0, 0, w, h);
      for (const q of [0.75, 0.55, 0.38, 0.22]) {
        let d = cv.toDataURL("image/webp", q); if (!d.startsWith("data:image/webp")) d = cv.toDataURL("image/jpeg", q);
        if (d.length <= budget) { imgData = d; $("img-info").textContent = `Imagen reducida a ${w}×${h} px (${d.length} bytes dentro del QR).`; gmsg(""); return generate(); }
      }
    }
    gmsg("No se pudo reducir lo suficiente. Prueba con una imagen más simple o elige \"Más detalle\".");
  }

  const canvasBlob = () => new Promise((r) => $("g-canvas").toBlob(r, "image/png"));
  $("g-dl").onclick = async () => {
    const b = await canvasBlob(); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "qr-" + Date.now() + ".png";
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
  $("g-share").onclick = async () => {
    try { const b = await canvasBlob(), f = new File([b], "qr.png", { type: "image/png" }); if (navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: "Código QR" }); } catch (e) {}
  };
  $("g-copy").onclick = () => copy(lastText, $("g-copy"));
  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); } catch (e) { const t = el("textarea"); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); } catch (e2) {} t.remove(); }
    if (btn) { const o = btn.textContent; btn.textContent = "¡Copiado!"; setTimeout(() => (btn.textContent = o), 1200); }
  }
  $("f-here").onclick = () => {
    if (!navigator.geolocation) return gmsg("Tu navegador no tiene geolocalización.");
    navigator.geolocation.getCurrentPosition((p) => { $("f-lat").value = p.coords.latitude.toFixed(6); $("f-lng").value = p.coords.longitude.toFixed(6); generate(); }, () => gmsg("No se pudo obtener tu ubicación."), { enableHighAccuracy: true, timeout: 10000 });
  };

  // =====================================================================
  //                               LEER
  // =====================================================================
  const rmsg = (t, ok) => { const m = $("r-msg"); m.className = "msg" + (ok ? " ok" : ""); m.textContent = t || ""; };
  let stream = null, raf = 0;

  function decodeData(img) {            // img: ImageData
    const r = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
    if (!r) return null;
    if (r.data) return r.data;
    try { return new TextDecoder("iso-8859-1").decode(Uint8Array.from(r.binaryData)); } catch (e) { return null; }
  }
  function decodeBitmap(bmp) {
    for (const maxSide of [1600, 1000, 700, 450]) {
      const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const g = cv.getContext("2d", { willReadFrequently: true }); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(bmp, 0, 0, w, h);
      const d = decodeData(g.getImageData(0, 0, w, h)); if (d != null) return d;
    }
    return null;
  }
  async function readFile(f) {
    rmsg("");
    if (!f || !/^image\//.test(f.type)) return rmsg("Elige un archivo de imagen.");
    try { const bmp = await loadBitmap(f); const d = decodeBitmap(bmp); if (d == null) return rmsg("No se encontró ningún QR en la imagen. Prueba con una foto más nítida y de frente."); showResult(d); }
    catch (e) { rmsg("No se pudo leer la imagen."); }
  }
  $("r-file").onchange = (e) => { readFile(e.target.files[0]); e.target.value = ""; };
  const drop = $("r-drop");
  ["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => readFile(e.dataTransfer.files[0]));
  addEventListener("paste", (e) => { const it = [...(e.clipboardData ? e.clipboardData.files : [])][0]; if (it && !document.querySelector("[data-panel=leer]").hidden) readFile(it); });

  $("r-cam").onclick = async () => {
    rmsg("");
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }); }
    catch (e) { return rmsg("No se pudo abrir la cámara. Permite el acceso o sube una imagen del QR."); }
    $("r-start").hidden = true; $("r-live").hidden = false; $("r-res").hidden = true;
    const v = $("r-video"); v.srcObject = stream; await v.play().catch(() => {});
    const cv = document.createElement("canvas"), g = cv.getContext("2d", { willReadFrequently: true });
    const loop = () => {
      if (!stream) return;
      if (v.videoWidth) {
        const w = 640, h = Math.round((v.videoHeight / v.videoWidth) * w); cv.width = w; cv.height = h; g.drawImage(v, 0, 0, w, h);
        const d = decodeData(g.getImageData(0, 0, w, h));
        if (d != null) { stopCam(); try { navigator.vibrate && navigator.vibrate(60); } catch (e) {} return showResult(d); }
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
  };
  function stopCam() { cancelAnimationFrame(raf); if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } $("r-live").hidden = true; $("r-start").hidden = false; }
  $("r-stop").onclick = stopCam;

  const KINDS = { imagen: "Imagen", url: "Enlace", wifi: "Red Wi-Fi", contacto: "Contacto", correo: "Correo", tel: "Teléfono", geo: "Ubicación", texto: "Texto" };
  function dl(name, blobOrUrl, isUrl) {
    const a = document.createElement("a"); a.href = isUrl ? blobOrUrl : URL.createObjectURL(blobOrUrl); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { if (!isUrl) URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function showResult(data) {
    const p = QRCore.parse(data), body = $("r-body"), acts = $("r-acts"); body.textContent = ""; acts.textContent = "";
    $("r-res").hidden = false; $("r-kind").textContent = KINDS[p.kind] || "Texto";
    const act = (label, fn, ghost = true) => { const b = el("button", ghost ? "ghost" : "", label); b.onclick = () => fn(b); acts.appendChild(b); return b; };
    const dlist = (pairs) => { const d = el("dl"); pairs.forEach(([k, v]) => { if (v) { d.append(el("dt", "", k), el("dd", "", v)); } }); body.appendChild(d); };
    let copyText = data;
    if (p.kind === "imagen") {
      const img = el("img"); img.alt = "Imagen leída del QR"; img.src = p.src; body.appendChild(img);
      copyText = null;
      act("Descargar imagen", () => dl("imagen-qr." + (p.mime.split("/")[1] === "jpeg" ? "jpg" : p.mime.split("/")[1]), p.src, true), false);
    } else if (p.kind === "url") {
      body.appendChild(el("div", "big-text", p.url));
      const a = el("a", "", "Abrir enlace"); a.href = p.url; a.target = "_blank"; a.rel = "noopener noreferrer";
      const b = el("button", "", ""); b.appendChild(a); a.style.cssText = "color:#fff;text-decoration:none"; acts.appendChild(b);
      body.appendChild(el("small", "muted", "Revisa la dirección antes de abrirla: un QR puede llevarte a un sitio falso."));
    } else if (p.kind === "wifi") {
      dlist([["Red", p.ssid], ["Contraseña", p.pass || "(sin contraseña)"], ["Seguridad", p.seg]]); copyText = p.pass || p.ssid;
    } else if (p.kind === "contacto") {
      dlist([["Nombre", p.nombre], ["Teléfono", p.tel], ["Correo", p.email], ["Empresa", p.org]]);
      act("Guardar contacto (.vcf)", () => dl("contacto.vcf", new Blob([p.raw], { type: "text/vcard" })), false);
    } else if (p.kind === "correo") {
      dlist([["Para", p.email], ["Asunto", p.asunto]]); copyText = p.email;
    } else if (p.kind === "tel") {
      dlist([["Teléfono", p.tel]]); copyText = p.tel;
    } else if (p.kind === "geo") {
      dlist([["Latitud", String(p.lat)], ["Longitud", String(p.lng)]]);
      const a = el("a", "", "Ver en el mapa"); a.href = `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`; a.target = "_blank"; a.rel = "noopener noreferrer";
      const b = el("button", "", ""); b.appendChild(a); a.style.cssText = "color:#fff;text-decoration:none"; acts.appendChild(b); copyText = `${p.lat}, ${p.lng}`;
    } else {
      body.appendChild(el("div", "big-text", p.text)); if (p.aviso) body.appendChild(el("small", "muted", p.aviso));
    }
    if (copyText != null) act("Copiar", (b) => copy(copyText, b));
    if (p.kind !== "imagen") act("Crear QR con esto", () => { $("g-tipo").value = "texto"; showFields(); $("f-texto").value = data; tab("gen"); generate(); });
    addHist("leído", p.kind, data);
    $("r-res").scrollIntoView({ block: "nearest" });
  }

  // ---------- Arranque ----------
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./sw.js").catch(() => {});
  showFields();
  window.__qr = { showResult };
})();
