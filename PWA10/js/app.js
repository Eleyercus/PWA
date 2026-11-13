(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const h = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k === "class") n.className = v; else if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? "" : v); }
    kids.flat(3).forEach((c) => { if (c == null || c === false) return; n.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return n;
  };
  const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const fmt = (t) => new Date(t).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  // ---------- Iconos (constantes propias, no vienen de la red) ----------
  const PATHS = {
    fuego: "M12 2c1 4-3 5-3 9a4 4 0 0 0 8 0c0-2-1-3-1-5 3 2 5 5 5 8a9 9 0 0 1-18 0c0-5 4-7 5-12z",
    gota: "M12 2s6 7 6 12a6 6 0 0 1-12 0c0-5 6-12 6-12z",
    rayo: "M13 2 4 14h6l-1 8 9-12h-6z",
    cruz: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6z",
    salida: "M4 3h9v18H4zM15 8l5 4-5 4v-3h-4v-2h4z",
    nube: "M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1A4.5 4.5 0 0 1 17 18z",
    maquina: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 5v-2l-2.1-.6a7 7 0 0 0-.7-1.6l1-1.9-1.4-1.4-1.9 1a7 7 0 0 0-1.6-.7L13 3h-2l-.6 2.1a7 7 0 0 0-1.6.7l-1.9-1L5.5 6.2l1 1.9a7 7 0 0 0-.7 1.6L3.7 10.3v2l2.1.6c.15.57.4 1.1.7 1.6l-1 1.9 1.4 1.4 1.9-1c.5.3 1.03.55 1.6.7L11 21h2l.6-2.1c.57-.15 1.1-.4 1.6-.7l1.9 1 1.4-1.4-1-1.9c.3-.5.55-1.03.7-1.6z",
  };
  const icon = (name) => { const t = document.createElement("template"); t.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="${PATHS[name] || PATHS.maquina}"/></svg>`; return t.content.firstChild; };

  // ---------- Preferencias ----------
  const prefs = Object.assign({ gloves: false, hc: false, escala: 1, rate: 1, emp: "", syncUrl: "" }, LS.get("ps_prefs", {}));
  function applyPrefs() {
    document.documentElement.classList.toggle("gloves", !!prefs.gloves);
    document.documentElement.classList.toggle("hc", !!prefs.hc);
    document.documentElement.style.setProperty("--fs", String(prefs.escala * (prefs.gloves ? 1.18 : 1)));
  }
  const savePrefs = () => { LS.set("ps_prefs", prefs); applyPrefs(); };
  applyPrefs();

  // ---------- Estado global ----------
  let manual = null;
  const S = { reg: null, prog: null, fallo: null, health: null, waiting: null, waitingInfo: null, reloading: false, persist: null, lastCheck: null, deferredInstall: null, sw: "ninguno" };
  const view = $("view");
  const put = (...kids) => view.append(...kids.flat(3).filter((k) => k != null && k !== false));
  const protoById = (id) => manual.protocolos.find((p) => p.id === id);

  // ---------- SHA-256 y verificación de integridad ----------
  const sha = async (buf) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map((b) => b.toString(16).padStart(2, "0")).join("");
  async function verificar() {
    const rel = await (await fetch("release.json")).json();
    const cache = await caches.open("proto-" + rel.version);
    const miss = [], bad = [], paths = Object.keys(rel.files);
    for (const p of paths) {
      const r = await cache.match(new URL(p, document.baseURI).href);
      if (!r) { miss.push(p); continue; }
      if ((await sha(await r.arrayBuffer())) !== rel.files[p]) bad.push(p);
    }
    S.health = { version: rel.version, release: rel, total: paths.length, miss, bad, ok: !miss.length && !bad.length, ts: Date.now() };
    setChip(); renderBanners(); if (/^#\/estado/.test(location.hash)) route(); return S.health;
  }
  async function reparar() {
    const hl = S.health || (await verificar());
    if (!navigator.onLine) return { reparados: 0, motivo: "sin-red" };
    const cache = await caches.open("proto-" + hl.version); let n = 0;
    for (const p of [...hl.miss, ...hl.bad]) {
      try {
        const r = await fetch(p, { cache: "reload" });
        if (r.ok && (await sha(await r.clone().arrayBuffer())) === hl.release.files[p]) { await cache.put(new URL(p, document.baseURI).href, r); n++; }
      } catch (e) {}
    }
    await verificar(); return { reparados: n, motivo: S.health.ok ? null : "fallo" };
  }
  async function pedirPersistencia() {
    try { if (!navigator.storage || !navigator.storage.persist) { S.persist = "no-soportado"; return; } S.persist = (await navigator.storage.persisted()) || (await navigator.storage.persist()) ? "si" : "no"; }
    catch (e) { S.persist = "no"; }
  }

  // ---------- Service worker ----------
  function setChip() {
    const c = $("chip"); let s = "sin-sw", t = "Solo en línea";
    if (S.sw === "ninguno" && "serviceWorker" in navigator) { s = "descargando"; t = "Preparando…"; }
    if (S.prog && S.prog.n < S.prog.total && !(S.health && S.health.ok)) { s = "descargando"; t = `Descargando ${S.prog.n}/${S.prog.total}`; }
    if (S.fallo && !(S.health && S.health.ok)) { s = "incompleto"; t = "Descarga incompleta"; }
    if (S.health && S.health.ok) { s = "ok"; t = `✓ Sin internet · v${S.health.version}`; }
    if (S.health && !S.health.ok) { s = "incompleto"; t = "Contenido incompleto"; }
    if (S.waiting) { s = "update"; t = "Actualización disponible"; }
    c.dataset.s = s; c.textContent = t;
  }
  function askInfo(worker) {
    const ch = new MessageChannel(); ch.port1.onmessage = (e) => { S.waitingInfo = e.data; renderBanners(); }; worker.postMessage({ type: "GET_INFO" }, [ch.port2]);
  }
  async function initSW() {
    if (!("serviceWorker" in navigator)) { setChip(); return; }
    navigator.serviceWorker.addEventListener("message", (e) => {
      const d = e.data || {};
      if (d.type === "progreso") { S.prog = d; setChip(); const b = document.getElementById("prog-i"); if (b) b.style.width = (d.n / d.total) * 100 + "%"; }
      else if (d.type === "fallo-instalacion") { S.fallo = d.motivo; setChip(); renderBanners(); }
      else if (d.type === "activo") { S.sw = "activo"; verificar().catch(() => {}); pedirPersistencia(); }
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (S.reloading) location.reload(); });
    try {
      const reg = await navigator.serviceWorker.register("sw.js"); S.reg = reg;
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing; if (!nw) return;
        nw.addEventListener("statechange", () => { if (nw.state === "installed" && navigator.serviceWorker.controller) { S.waiting = nw; askInfo(nw); setChip(); renderBanners(); } });
      });
      if (reg.waiting && navigator.serviceWorker.controller) { S.waiting = reg.waiting; askInfo(reg.waiting); }
      if (navigator.serviceWorker.controller) { S.sw = "activo"; verificar().catch(() => {}); pedirPersistencia(); }
      setChip(); buscarActualizacion();
    } catch (e) { S.fallo = "No se pudo registrar el service worker"; setChip(); }
  }
  function buscarActualizacion() { if (S.reg && navigator.onLine) { S.reg.update().catch(() => {}); S.lastCheck = Date.now(); } }
  function aplicarActualizacion() { if (!S.waiting) return; S.reloading = true; S.waiting.postMessage({ type: "SKIP_WAITING" }); }
  addEventListener("online", () => { buscarActualizacion(); intentarSync(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { buscarActualizacion(); intentarSync(); } });
  setInterval(buscarActualizacion, 30 * 60 * 1000);
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); S.deferredInstall = e; renderBanners(); });

  // ---------- Banners ----------
  const enProtocolo = () => /^#\/(p|m)\//.test(location.hash);
  function renderBanners() {
    const box = $("banners"); box.textContent = "";
    if (S.health && !S.health.ok) box.append(h("div", { class: "banner bad", role: "alert" }, h("b", {}, "Contenido incompleto en este teléfono. "), navigator.onLine ? "Repárala ahora para poder usar los manuales sin internet." : "Conéctate al Wi‑Fi de la entrada para repararlo. Mientras tanto algunos protocolos podrían no abrir.", h("div", { class: "row" }, navigator.onLine ? h("button", { class: "btn sm pri", onclick: async (e) => { e.target.disabled = true; e.target.textContent = "Reparando…"; const r = await reparar(); if (r.motivo === "fallo") { e.target.disabled = false; e.target.textContent = "No se pudo: revisa tu conexión y reintenta"; } } }, "Reparar ahora") : null)));
    if (S.fallo && !S.health) box.append(h("div", { class: "banner bad" }, "No se pudo terminar la descarga para uso sin internet (" + S.fallo + "). Conéctate a una red estable y vuelve a abrir la app."));
    if (S.waiting && !enProtocolo()) {
      const i = S.waitingInfo;
      box.append(h("div", { class: "banner warn" }, h("b", {}, "Hay una versión nueva de los manuales" + (i ? ` (v${i.version}, ${i.fecha})` : "") + ". "), "Ya está descargada completa. Se aplicará sola la próxima vez que abras la app, o puedes aplicarla ahora.", h("div", { class: "row" }, h("button", { class: "btn sm pri", onclick: aplicarActualizacion }, "Actualizar ahora"), h("button", { class: "btn sm", onclick: (e) => e.target.closest(".banner").remove() }, "Después"))));
    }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;
    if (ios && !LS.get("ps_ios_tip", false) && !enProtocolo()) box.append(h("div", { class: "banner" }, h("b", {}, "iPhone: "), "para que los manuales no se borren y abran sin internet, toca Compartir y luego «Agregar a pantalla de inicio».", h("div", { class: "row" }, h("button", { class: "btn sm", onclick: (e) => { LS.set("ps_ios_tip", true); e.target.closest(".banner").remove(); } }, "Entendido"))));
    if (S.deferredInstall && !enProtocolo()) box.append(h("div", { class: "banner" }, h("b", {}, "Instala la app "), "para tenerla siempre lista, aun sin internet.", h("div", { class: "row" }, h("button", { class: "btn sm pri", onclick: async () => { S.deferredInstall.prompt(); await S.deferredInstall.userChoice; S.deferredInstall = null; pedirPersistencia(); renderBanners(); } }, "Instalar"))));
  }

  // ---------- Registro de lecturas ----------
  async function log(tipo, proto, extra) {
    try {
      await Store.addLectura(Object.assign({ tipo, proto: proto.id, titulo: proto.titulo, v: proto.version, emp: prefs.emp || "", ts: Date.now() }, extra || {}));
      if (S.reg && S.reg.sync) S.reg.sync.register("sync-lecturas").catch(() => {});
      intentarSync();
    } catch (e) {}
  }
  async function intentarSync() { try { if (navigator.onLine) await Store.enviarPendientes(); } catch (e) {} }

  // ---------- Voz ----------
  const hayVoz = () => "speechSynthesis" in window && speechSynthesis.getVoices().some((v) => /^es/i.test(v.lang));
  function leer(textos, onEnd) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const v = speechSynthesis.getVoices().find((x) => /^es[-_]MX/i.test(x.lang)) || speechSynthesis.getVoices().find((x) => /^es/i.test(x.lang));
    textos.forEach((t, i) => { const u = new SpeechSynthesisUtterance(t); u.lang = v ? v.lang : "es-MX"; if (v) u.voice = v; u.rate = prefs.rate; if (i === textos.length - 1) u.onend = onEnd; speechSynthesis.speak(u); });
  }
  const pararVoz = () => { try { "speechSynthesis" in window && speechSynthesis.cancel(); } catch (e) {} };

  // ---------- Pantalla encendida ----------
  let wake = null;
  async function wakeOn() { try { if (navigator.wakeLock) wake = await navigator.wakeLock.request("screen"); } catch (e) {} }
  function wakeOff() { try { wake && wake.release(); } catch (e) {} wake = null; }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && enProtocolo()) wakeOn(); });

  // ---------- Vistas ----------
  const bigBtn = (p) => h("a", { class: "big c-" + p.color, href: "#/p/" + p.id }, icon(p.icono), h("span", {}, p.titulo, h("br"), h("small", {}, p.resumen)));
  const phones = () => h("div", { class: "box" }, h("h2", { style: "margin-top:0" }, "Teléfonos internos"), manual.contactos.map((c) => h("div", { class: "tel" }, h("span", {}, c.n), h("span", {}, "ext. " + c.ext))), h("p", { class: "small muted" }, manual.contactosNota));

  function vHome() {
    put(h("h1", {}, "¿Qué está pasando?"), h("div", { class: "grid" }, manual.protocolos.map(bigBtn)),
      h("h2", {}, "Estás frente a una máquina"), h("a", { class: "btn full", href: "#/maquinas" }, "Ver máquinas y áreas"),
      h("div", { class: "box" }, h("b", {}, "Punto de reunión"), h("p", { style: "margin:.3em 0 0" }, manual.puntoReunion)), phones());
  }

  function vProtocolo(id, maqId) {
    const p = protoById(id); if (!p) return vNoEncontrado();
    const maq = maqId ? manual.maquinas.find((m) => m.id === maqId) : null;
    log("consulta", p, maq ? { maq: maq.id } : null); wakeOn();
    const pasos = [p.urgente].concat(p.pasos.map((s, i) => `Paso ${i + 1}. ${s.t}. ${s.d || ""}`)).concat(p.noHacer && p.noHacer.length ? ["No hagas esto: " + p.noHacer.join(" ")] : []);
    const bVoz = h("button", { class: "btn full", onclick: () => { if (bVoz.dataset.on) { pararVoz(); bVoz.dataset.on = ""; bVoz.textContent = "Escuchar en voz alta"; } else { bVoz.dataset.on = "1"; bVoz.textContent = "Detener voz"; leer(pasos, () => { bVoz.dataset.on = ""; bVoz.textContent = "Escuchar en voz alta"; }); } } }, "Escuchar en voz alta");
    put(
      maq ? h("a", { href: "#/m/" + maq.id, class: "muted small" }, "← " + maq.nombre) : h("a", { href: "#/", class: "muted small" }, "← Inicio"),
      h("div", { class: "phead c-" + p.color }, icon(p.icono), h("div", {}, h("h1", {}, p.titulo), h("small", {}, `Versión ${p.version} · revisado ${p.revision}`))),
      h("div", { class: "urgent", role: "note" }, p.urgente),
      h("ol", { class: "steps" }, p.pasos.map((s) => h("li", { class: s.alerta ? "alerta" : "" }, h("div", {}, h("b", {}, s.t), s.d ? h("p", {}, s.d) : null)))),
      p.noHacer && p.noHacer.length ? h("div", { class: "nohacer", style: "margin-top:12px" }, h("h2", {}, "NO HACER"), h("ul", {}, p.noHacer.map((x) => h("li", {}, x)))) : null,
      p.epp && p.epp.length ? h("div", { class: "box" }, h("h2", { style: "margin-top:0" }, "Equipo de protección"), h("ul", {}, p.epp.map((x) => h("li", {}, x)))) : null,
      p.primerosAuxilios ? h("div", { class: "box" }, h("h2", { style: "margin-top:0" }, "Si hay contacto con la sustancia"), h("p", {}, p.primerosAuxilios)) : null,
      p.hds ? h("div", { class: "box" }, h("h2", { style: "margin-top:0" }, "Hojas de datos de seguridad (HDS)"), p.hds.map((x) => h("a", { class: "btn full", style: "margin:6px 0", href: x.archivo, target: "_blank", rel: "noopener" }, x.nombre))) : null,
      p.mapa ? h("div", { class: "box" }, h("h2", { style: "margin-top:0" }, "Plano de evacuación"), h("img", { class: "mapa", src: p.mapa, alt: "Plano de evacuación de ejemplo con rutas verdes hacia el punto de reunión A" })) : null,
      bVoz, !hayVoz() && "speechSynthesis" in window ? h("p", { class: "small muted" }, "Si no escuchas nada, puede que este teléfono no tenga una voz en español instalada sin internet.") : null,
      h("h2", {}, "Relacionados"), h("ul", { class: "list" }, p.relacionados.map((r) => { const q = protoById(r); return h("li", {}, h("a", { class: "item " + q.color, href: "#/p/" + q.id + (maq ? "?m=" + maq.id : "") }, icon(q.icono), h("span", {}, h("b", {}, q.titulo), h("small", {}, q.resumen)))); })),
      phones(),
      h("button", { class: "btn full pri", id: "leido", onclick: async (e) => { await log("leido", p); e.target.textContent = "✓ Lectura registrada"; e.target.disabled = true; } }, "Confirmar que leí este protocolo"),
      h("p", { class: "small muted" }, manual.aviso));
  }

  function vMaquinas() {
    put(h("h1", {}, "Máquinas y áreas"), h("ul", { class: "list" }, manual.maquinas.map((m) => h("li", {}, h("a", { class: "item", href: "#/m/" + m.id }, icon("maquina"), h("span", {}, h("b", {}, m.nombre, m.sinSenal ? h("span", { class: "sin" }, "SIN SEÑAL") : null), h("small", {}, m.zona)))))));
  }
  function vMaquina(id) {
    const m = manual.maquinas.find((x) => x.id === id); if (!m) return vNoEncontrado();
    put(h("a", { href: "#/maquinas", class: "muted small" }, "← Máquinas"), h("h1", {}, m.nombre), h("p", { class: "muted" }, m.zona),
      m.sinSenal ? h("div", { class: "banner warn", style: "margin:0 0 10px" }, h("b", {}, "Zona sin señal de celular. "), "Esta pantalla funciona igual sin internet. Usa el teléfono de pared rojo.") : null,
      h("h2", {}, "En una emergencia aquí"), h("div", { class: "grid" }, m.protocolos.map((id2) => { const p = protoById(id2); return h("a", { class: "big c-" + p.color, href: "#/p/" + p.id + "?m=" + m.id }, icon(p.icono), h("span", {}, p.titulo)); })),
      h("div", { class: "box" }, h("h2", { style: "margin-top:0" }, "Datos de esta máquina"), h("dl", { class: "kv" }, m.datos.map((d) => [h("dt", {}, d.k), h("dd", {}, d.v)]))),
      h("div", { class: "box" }, h("h2", { style: "margin-top:0" }, "Riesgos"), h("ul", {}, m.riesgos.map((r) => h("li", {}, r)))), phones());
  }

  function indexText(p) { return norm([p.titulo, p.resumen, p.urgente, (p.palabras || []).join(" "), p.pasos.map((s) => s.t + " " + (s.d || "")).join(" ")].join(" ")); }
  function vBuscar(q0) {
    const out = h("ul", { class: "list" });
    const run = (q) => {
      out.textContent = ""; const t = norm(q).split(/\s+/).filter(Boolean);
      const res = t.length ? manual.protocolos.filter((p) => { const x = indexText(p); return t.every((w) => x.includes(w)); }) : [];
      const mq = t.length ? manual.maquinas.filter((m) => t.every((w) => norm(m.nombre + " " + m.zona + " " + m.riesgos.join(" ")).includes(w))) : [];
      if (!t.length) out.append(h("li", { class: "muted" }, "Escribe una palabra: fuego, ácido, gas, sótano, quemadura…"));
      else if (!res.length && !mq.length) out.append(h("li", { class: "muted" }, "Sin resultados. Prueba con otra palabra."));
      res.forEach((p) => out.append(h("li", {}, h("a", { class: "item " + p.color, href: "#/p/" + p.id }, icon(p.icono), h("span", {}, h("b", {}, p.titulo), h("small", {}, p.resumen))))));
      mq.forEach((m) => out.append(h("li", {}, h("a", { class: "item", href: "#/m/" + m.id }, icon("maquina"), h("span", {}, h("b", {}, m.nombre), h("small", {}, m.zona))))));
    };
    const inp = h("input", { type: "search", placeholder: "Buscar protocolo o máquina…", "aria-label": "Buscar", value: q0 || "", oninput: (e) => run(e.target.value) });
    put(h("h1", {}, "Buscar"), inp, h("div", { style: "height:10px" }), out); run(q0 || ""); inp.focus();
  }

  function vMas() {
    const it = (href, t, s) => h("li", {}, h("a", { class: "item", href }, h("span", {}, h("b", {}, t), h("small", {}, s))));
    put(h("h1", {}, "Más"), h("ul", { class: "list" }, it("#/estado", "Estado sin internet", "¿Están completos los manuales en este teléfono?"), it("#/lecturas", "Mis lecturas", "Registro de capacitación y sincronización"), it("#/qr", "QR para cada máquina", "Imprime los códigos para pegarlos en planta"), it("#/ajustes", "Ajustes", "Modo guantes, contraste, texto y voz")),
      h("p", { class: "small muted" }, manual.aviso));
  }

  function vAjustes() {
    const sw = (label, key) => h("label", { class: "sw" }, label, h("input", { type: "checkbox", checked: prefs[key], onchange: (e) => { prefs[key] = e.target.checked; savePrefs(); } }));
    const urlI = h("input", { type: "url", placeholder: "https://… (solo si tu empresa la indica)", value: prefs.syncUrl || "" });
    put(h("h1", {}, "Ajustes"), sw("Modo guantes (botones enormes)", "gloves"), sw("Alto contraste", "hc"),
      h("h2", {}, "Tamaño del texto"), h("div", { class: "grid", style: "grid-template-columns:repeat(3,1fr)" }, [["A−", 0.9], ["A", 1], ["A+", 1.25]].map(([t, v]) => h("button", { class: "btn" + (prefs.escala === v ? " pri" : ""), onclick: () => { prefs.escala = v; savePrefs(); route(); } }, t))),
      h("h2", {}, "Velocidad de la voz"), h("div", { class: "grid", style: "grid-template-columns:repeat(3,1fr)" }, [["Lenta", 0.8], ["Normal", 1], ["Rápida", 1.2]].map(([t, v]) => h("button", { class: "btn" + (prefs.rate === v ? " pri" : ""), onclick: () => { prefs.rate = v; savePrefs(); route(); } }, t))),
      h("h2", {}, "Número de empleado"), h("input", { type: "text", inputmode: "numeric", placeholder: "Opcional, para tu registro de lectura", value: prefs.emp || "", onchange: (e) => { prefs.emp = e.target.value.trim().slice(0, 20); savePrefs(); } }),
      h("h2", {}, "Servidor de sincronización"), urlI, h("button", { class: "btn full", style: "margin-top:8px", onclick: async () => { const v = urlI.value.trim(); if (v && !/^https:\/\//.test(v)) { alert("La dirección debe empezar con https://"); return; } prefs.syncUrl = v; savePrefs(); await Store.set("syncUrl", v); alert(v ? "Guardado." : "Sincronización desactivada."); } }, "Guardar"));
  }

  async function vLecturas() {
    const all = (await Store.lecturas()).sort((a, b) => b.ts - a.ts), pend = all.filter((x) => !x.enviada).length;
    const url = (await Store.get("syncUrl")) || "";
    const msg = h("p", { class: "muted small", role: "status" });
    put(h("h1", {}, "Mis lecturas"),
      h("div", { class: "box" }, h("b", {}, `${all.length} registros · ${pend} pendientes de enviar`), h("p", { class: "small muted" }, url ? "Se envían solos cuando hay internet." : "Aún no hay servidor de sincronización configurado: los registros se guardan en este teléfono. Puedes exportarlos."),
        h("div", { class: "grid", style: "grid-template-columns:1fr 1fr" }, h("button", { class: "btn sm", onclick: async () => { const r = await Store.enviarPendientes(); msg.textContent = r.enviadas ? `Enviados ${r.enviadas}.` : { "sin-url": "Sin servidor configurado.", nada: "Nada pendiente.", "sin-red": "Sin conexión; se enviarán después." }[r.motivo] || "No se pudo enviar (" + r.motivo + ")."; if (r.enviadas) route(); } }, "Sincronizar ahora"),
          h("button", { class: "btn sm", onclick: () => { const rows = [["fecha", "tipo", "protocolo", "version", "empleado", "enviada"]].concat(all.map((x) => [new Date(x.ts).toISOString(), x.tipo, x.proto, x.v, x.emp, x.enviada ? "si" : "no"])); const csv = "﻿" + rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\n"); const a = h("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: "lecturas.csv" }); document.body.append(a); a.click(); a.remove(); } }, "Exportar CSV")), msg),
      h("ul", { class: "list" }, all.slice(0, 60).map((x) => h("li", { class: "item" }, h("span", {}, h("b", {}, x.titulo), h("small", {}, `${fmt(x.ts)} · ${x.tipo === "leido" ? "Lectura confirmada" : "Consulta"} · v${x.v} · ${x.enviada ? "enviada" : "pendiente"}`))))));
  }

  async function vEstado() {
    const hl = S.health, est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate().catch(() => null) : null;
    const row = (k, v) => [h("dt", {}, k), h("dd", {}, v)];
    const mb = (x) => (x / 1048576).toFixed(1) + " MB";
    const out = h("p", { class: "small muted", role: "status" });
    put(h("h1", {}, "Estado sin internet"),
      h("div", { class: "box" }, h("dl", { class: "kv" },
        row("Manuales instalados", hl ? `Versión ${hl.version} · ${hl.release.fecha}` : "Aún no verificado"),
        row("Auditoría", hl ? hl.release.auditoria : "—"),
        row("Archivos completos", hl ? h("span", { class: hl.ok ? "ok" : "ko" }, hl.ok ? `✓ ${hl.total - hl.miss.length - hl.bad.length} de ${hl.total} verificados` : `✗ faltan ${hl.miss.length} · dañados ${hl.bad.length}`) : "—"),
        row("Última verificación", hl ? fmt(hl.ts) : "—"),
        row("Funciona sin conexión", S.sw === "activo" ? h("span", { class: "ok" }, "Sí") : h("span", { class: "ko" }, "Todavía no (abre la app con internet una vez)")),
        row("Almacenamiento protegido", S.persist === "si" ? h("span", { class: "ok" }, "Sí") : S.persist === "no-soportado" ? "Este navegador no lo ofrece" : h("span", { class: "ko" }, "No (el sistema podría borrar datos si falta espacio)")),
        row("Espacio usado", est ? `${mb(est.usage)} de ${mb(est.quota)}` : "—"),
        row("Búsqueda de actualización", S.lastCheck ? fmt(S.lastCheck) : navigator.onLine ? "Pendiente" : "Sin internet"),
        row("Actualización pendiente", S.waiting ? h("span", { class: "ko" }, S.waitingInfo ? `Sí: v${S.waitingInfo.version}` : "Sí") : "No"))),
      h("div", { class: "grid", style: "grid-template-columns:1fr" },
        h("button", { class: "btn", onclick: async () => { out.textContent = "Verificando…"; try { await verificar(); } catch (e) {} route(); } }, "Verificar ahora"),
        h("button", { class: "btn", onclick: async () => { out.textContent = "Reparando…"; const r = await reparar(); out.textContent = r.motivo === "sin-red" ? "Sin internet: no se puede reparar ahora." : r.motivo === "fallo" ? "No se pudo descargar todo. Revisa tu conexión e inténtalo de nuevo." : `Archivos reparados: ${r.reparados}.`; if (!r.motivo) route(); } }, "Reparar archivos faltantes"),
        h("button", { class: "btn", onclick: async () => { await pedirPersistencia(); route(); } }, "Proteger almacenamiento"),
        h("button", { class: "btn", onclick: () => { buscarActualizacion(); out.textContent = navigator.onLine ? "Buscando… si hay una versión nueva aparecerá un aviso." : "Sin internet."; } }, "Buscar actualización")), out,
      hl ? h("div", { class: "box" }, h("b", {}, "Cambios de esta versión"), h("ul", {}, hl.release.cambios.map((c) => h("li", {}, c)))) : null,
      h("p", { class: "small muted" }, "Los manuales se descargan completos una vez, se verifican con huella digital (SHA‑256) y se consultan siempre desde el teléfono. Solo se usa internet para bajar la edición nueva, que ocurre aproximadamente una vez al año."));
  }

  function vQR() {
    const base = location.origin + location.pathname.replace(/index\.html$/, "");
    const card = (titulo, sub, url) => { const qr = qrcode(0, "M"); qr.addData(url); qr.make(); const cv = h("canvas"), n = qr.getModuleCount(), q = 4, px = Math.floor(420 / (n + q * 2)); cv.width = cv.height = (n + q * 2) * px; const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = "#000"; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect((c + q) * px, (r + q) * px, px, px); return h("div", { class: "qrcard" }, cv, h("div", {}, h("b", {}, titulo), h("div", {}, sub), h("small", { class: "muted" }, "Escanea para abrir los protocolos. Funciona sin señal si la app ya está instalada."))); };
    put(h("h1", {}, "QR para cada máquina"), h("p", { class: "muted noprint" }, "Imprime estas hojas y pégalas en cada máquina o área. Al escanearlas se abre directo el menú de emergencia de esa máquina."),
      h("button", { class: "btn full pri noprint", onclick: () => window.print() }, "Imprimir"),
      card("Instalar la app", "Primera vez: hacerlo con internet", base), manual.maquinas.map((m) => card(m.nombre, m.zona + (m.sinSenal ? " · sin señal" : ""), base + "#/m/" + m.id)));
  }

  function vNoEncontrado() { put(h("h1", {}, "No encontrado"), h("a", { class: "btn full", href: "#/" }, "Ir al inicio")); }

  // ---------- Router ----------
  function route() {
    pararVoz(); if (!enProtocolo()) wakeOff();
    const raw = location.hash.replace(/^#/, "") || "/"; const [path, qs] = raw.split("?"); const parts = path.split("/").filter(Boolean); const q = new URLSearchParams(qs || "");
    view.textContent = ""; renderBanners();
    document.querySelectorAll("[data-nav]").forEach((a) => a.removeAttribute("aria-current"));
    const nav = { "": "home", p: "home", m: "maquinas", maquinas: "maquinas", buscar: "buscar" }[parts[0] || ""] || "mas";
    const el = document.querySelector(`[data-nav=${nav}]`); if (el) el.setAttribute("aria-current", "page");
    if (!manual) { put(h("p", {}, "Cargando manuales…")); return; }
    switch (parts[0]) {
      case undefined: vHome(); break;
      case "p": vProtocolo(parts[1], q.get("m")); break;
      case "maquinas": vMaquinas(); break;
      case "m": vMaquina(parts[1]); break;
      case "buscar": vBuscar(q.get("q")); break;
      case "mas": vMas(); break;
      case "ajustes": vAjustes(); break;
      case "lecturas": vLecturas(); break;
      case "estado": vEstado(); break;
      case "qr": vQR(); break;
      default: vNoEncontrado();
    }
    window.scrollTo(0, 0);
  }
  addEventListener("hashchange", route);

  // ---------- Arranque ----------
  (async function main() {
    route(); initSW();
    try { manual = await (await fetch("content/manual.json")).json(); $("planta").textContent = manual.planta.replace(/ \(.*\)/, ""); }
    catch (e) { view.textContent = ""; put(h("div", { class: "banner bad" }, "No se pudieron cargar los manuales. Conéctate a internet una vez para descargarlos.")); return; }
    if (prefs.syncUrl) Store.set("syncUrl", prefs.syncUrl).catch(() => {});
    route(); intentarSync();
  })();
  window.__ps = { verificar, reparar, S };
})();
