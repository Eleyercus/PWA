(function () {
  "use strict";
  const CFG = window.ASISTENCIA_CONFIG || {};
  const ROTATE = CFG.rotateMs || 15000, TTL = CFG.tokenTtlMs || 30000, PASS_TTL = 150000;
  const $ = (id) => document.getElementById(id);
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ICE = CFG.iceServers || [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:global.stun.twilio.com:3478" }];
  const peerOpts = () => Object.assign({ debug: 0, config: { iceServers: ICE } }, CFG.peer || {});

  // ---------- Navegación ----------
  let view = "home";
  function show(v) {
    view = v;
    document.querySelectorAll("[data-view]").forEach((s) => (s.hidden = s.dataset.view !== v));
    $("btn-home").hidden = v === "home";
    window.scrollTo(0, 0);
  }
  $("btn-home").onclick = () => {
    if (view === "doc-live" && !confirm("La clase sigue abierta. ¿Salir de esta pantalla? (podrás continuarla desde Inicio)")) return;
    if (view === "doc-live") teardownTeacher(false);
    stopScan(); stopSelfie(); closeStudent(); refreshHome(); show("home");
  };
  function setNet() { $("net").textContent = navigator.onLine ? "En línea" : "Sin internet"; }
  addEventListener("online", setNet); addEventListener("offline", setNet); setNet();

  // ---------- Datos locales ----------
  const getActive = () => LS.get("asist_active", null);
  const saveActive = () => { if (S) LS.set("asist_active", S); };
  const getHistory = () => LS.get("asist_hist", []);
  function refreshHome() {
    const a = getActive();
    $("resume").hidden = !a;
    if (a) $("resume-name").textContent = `${a.materia} · ${a.grupo}`;
  }
  $("go-doc").onclick = () => {
    const d = LS.get("asist_docente", {});
    $("f-materia").value = d.materia || "Programación de Aplicaciones Web Progresivas";
    $("f-grupo").value = d.grupo || "15IEVND4N";
    $("f-docente").value = d.docente || "Ing. Omar Alejandro Mata Garza";
    show("doc-setup");
  };
  $("go-alu").onclick = () => { initStudentView(); show("alu"); };
  $("go-hist").onclick = () => { renderHistory(); show("hist"); };
  $("f-radio").oninput = (e) => ($("radio-v").textContent = e.target.value);

  // ---------- Visor de selfies ----------
  function viewSelfie(src) { if (!src) return; $("viewer").querySelector("img").src = src; $("viewer").hidden = false; }
  $("viewer").onclick = () => ($("viewer").hidden = true);

  // =====================================================================
  //                              DOCENTE
  // =====================================================================
  let S = null;            // sesión activa
  let peer = null, conns = new Map(), tokens = [], rotTimer = null, tickTimer = null, wake = null, tokenAt = 0;

  function parseRoster(txt) {
    return String(txt || "").split(/\n/).map((l) => l.split(/[,;\t]/)).map((p) => ({
      mat: Core.clean(p[0], 20).toUpperCase(), nombre: Core.clean(p.slice(1).join(" "), 60),
    })).filter((r) => r.mat && r.nombre);
  }
  function getPosition(timeout) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("Tu navegador no tiene geolocalización"));
      let best = null, done = false;
      const fin = () => { if (done) return; done = true; navigator.geolocation.clearWatch(id); clearTimeout(tm); best ? resolve(best) : reject(new Error("No se pudo obtener la ubicación")); };
      const id = navigator.geolocation.watchPosition((p) => {
        if (!best || p.coords.accuracy < best.acc) best = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
        if (best.acc <= 25) fin();
      }, (err) => { if (done) return; if (best) return fin(); done = true; navigator.geolocation.clearWatch(id); clearTimeout(tm);
        reject(new Error(err.code === 1 ? "Permiso de ubicación denegado. Actívalo para continuar." : "No se pudo obtener la ubicación")); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeout });
      const tm = setTimeout(fin, timeout);
    });
  }

  $("start").onclick = async () => {
    const msg = $("start-msg"); msg.className = "msg"; msg.textContent = "";
    const materia = Core.clean($("f-materia").value, 60), grupo = Core.clean($("f-grupo").value, 20), docente = Core.clean($("f-docente").value, 60);
    if (!materia || !grupo) { msg.textContent = "Escribe materia y grupo."; return; }
    LS.set("asist_docente", { materia, grupo, docente });
    $("start").disabled = true; msg.className = "msg ok"; msg.textContent = "Obteniendo ubicación del salón…";
    try {
      const loc = await getPosition(12000);
      S = { id: Date.now().toString(36), peerId: Core.randomCode(8), materia, grupo, docente, radio: +$("f-radio").value,
        selfieReq: $("f-selfie").checked, roster: parseRoster($("f-roster").value), loc, inicio: Date.now(), marcas: [] };
      saveActive();
      msg.textContent = "Abriendo sala segura…";
      await openRoom();
      msg.textContent = "";
    } catch (e) { msg.className = "msg"; msg.textContent = e.message || String(e); }
    $("start").disabled = false;
  };
  $("resume-go").onclick = async () => {
    S = getActive(); if (!S) return;
    try { await openRoom(); } catch (e) { alert(e.message || e); show("home"); }
  };
  $("resume-drop").onclick = () => { if (confirm("¿Descartar la clase sin cerrar? Se perderán sus registros.")) { LS.del("asist_active"); refreshHome(); } };

  function openRoom() {
    return new Promise((resolve, reject) => {
      teardownTeacher(false);
      let opened = false, retriedNew = false;
      const make = (id) => {
        peer = new Peer(id, peerOpts());
        peer.on("open", () => { opened = true; startLive(); resolve(); });
        peer.on("connection", onStudentConn);
        peer.on("disconnected", () => { setNet(); $("net").textContent = "Reconectando…"; try { peer.reconnect(); } catch (e) {} });
        peer.on("error", (err) => {
          if (!opened && err.type === "unavailable-id" && !retriedNew) { retriedNew = true; S.peerId = Core.randomCode(8); saveActive(); peer.destroy(); return make(S.peerId); }
          if (!opened) { reject(new Error("No se pudo abrir la sala (" + err.type + "). Revisa tu internet o el servidor de señalización.")); return; }
          if (err.type === "network" || err.type === "server-error") $("net").textContent = "Servidor de salas inestable…";
        });
      };
      make(S.peerId);
    });
  }

  function newToken() {
    const t = Core.randomCode(6), at = Date.now();
    tokens.push({ t, at }); tokenAt = at;
    tokens = tokens.filter((x) => at - x.at <= TTL + ROTATE);
    drawQR();
  }
  function curToken() { return tokens[tokens.length - 1].t; }
  function drawQR() {
    const url = location.origin + location.pathname.replace(/[^/]*$/, "") + "index.html?j=" + Core.formatCode(S.peerId, curToken());
    const qr = qrcode(0, "M"); qr.addData(url); qr.make();
    const cv = $("qr"), n = qr.getModuleCount(), q = 4, size = (n + q * 2), px = Math.floor(520 / size);
    cv.width = cv.height = size * px;
    const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = "#000";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect((c + q) * px, (r + q) * px, px, px);
    $("code").textContent = Core.formatCode(S.peerId, curToken());
  }
  function startLive() {
    $("l-title").textContent = `${S.materia} · ${S.grupo}`;
    $("l-sub").textContent = `Radio ${S.radio} m · ${S.selfieReq ? "con selfie" : "sin selfie"}${S.roster.length ? " · lista de " + S.roster.length : ""}`;
    show("doc-live"); setNet();
    tokens = []; newToken();
    clearInterval(rotTimer); rotTimer = setInterval(newToken, ROTATE);
    clearInterval(tickTimer); tickTimer = setInterval(() => { $("bar").style.width = Math.max(0, 100 - ((Date.now() - tokenAt) / ROTATE) * 100) + "%"; }, 200);
    renderList(); lockScreen();
  }
  async function lockScreen() { try { wake = await navigator.wakeLock.request("screen"); } catch (e) {} }
  addEventListener("visibilitychange", () => { if (!document.hidden && view === "doc-live") lockScreen(); });

  function teardownTeacher(clearSession) {
    clearInterval(rotTimer); clearInterval(tickTimer);
    conns.forEach((c) => { try { c.close(); } catch (e) {} }); conns.clear();
    if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
    try { wake && wake.release(); } catch (e) {} wake = null;
    if (clearSession) { S = null; }
  }

  function onStudentConn(conn) {
    let st = { pass: null, done: false, dev: null };
    conns.set(conn.peer + Math.random(), conn);
    const send = (o) => { try { conn.send(o); } catch (e) {} };
    conn.on("data", (d) => {
      if (!S || !d || typeof d !== "object") return;
      if (d.type === "hola") {
        const now = Date.now();
        if (!Core.validToken(tokens, String(d.t), now, TTL)) return send({ type: "resultado", estado: "rechazada", motivo: "Código vencido o inválido: escanea el QR vigente" });
        st.pass = { t: String(d.t), at: now };
        return send({ type: "hola", materia: S.materia, grupo: S.grupo, docente: S.docente, selfieReq: S.selfieReq });
      }
      if (d.type === "marcar") {
        if (!st.pass || st.done || Date.now() - st.pass.at > PASS_TTL) return send({ type: "resultado", estado: "rechazada", motivo: "Sesión de registro vencida: vuelve a escanear" });
        const p = { mat: d.mat, nombre: d.nombre, t: st.pass.t, lat: d.lat, lng: d.lng, acc: d.acc, dev: d.dev, selfie: d.selfie };
        const r = Core.evaluar({ sesion: S, tokens: [st.pass], now: Date.now(), marcas: S.marcas, p, ttl: PASS_TTL });
        const m = { id: Math.random().toString(36).slice(2, 9), mat: r.mat || Core.clean(d.mat, 20), nombre: r.nombre || Core.clean(d.nombre, 60), estado: r.estado,
          motivo: r.motivo, hora: Date.now(), dist: r.dist, acc: r.acc, dev: r.dev || "", selfie: Core.okSelfie(d.selfie) ? d.selfie : "" };
        if (r.estado === "rechazada" && !r.mat) { return send({ type: "resultado", estado: "rechazada", motivo: r.motivo }); }
        S.marcas.push(m); saveActive(); renderList();
        st.done = r.estado !== "rechazada"; st.mid = m.id; conn._mid = m.id;
        send({ type: "resultado", estado: r.estado, motivo: r.motivo, id: m.id });
      }
    });
    conn.on("close", () => {});
    conn._reply = send;
  }
  function notifyStudent(m) {
    conns.forEach((c) => { if (c._mid === m.id && c.open) c._reply({ type: "actualizacion", estado: m.estado, motivo: m.motivo }); });
  }

  function renderList() {
    if (!S) return;
    const ul = $("list"); ul.textContent = "";
    let ok = 0, dud = 0, rej = 0;
    S.marcas.slice().reverse().forEach((m) => {
      if (m.estado === "ok" || m.estado === "aprobada") ok++; else if (m.estado === "dudosa") dud++; else rej++;
      const li = document.createElement("li"); li.className = m.estado === "aprobada" ? "" : m.estado;
      const img = document.createElement("img"); img.alt = "selfie"; if (m.selfie) { img.src = m.selfie; img.onclick = () => viewSelfie(m.selfie); } li.appendChild(img);
      const t = document.createElement("div"); t.className = "t";
      const b = document.createElement("b"); b.textContent = m.nombre; const s1 = document.createElement("small"); s1.textContent = `${m.mat} · ${new Date(m.hora).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`;
      const s2 = document.createElement("small"); s2.textContent = (m.estado === "aprobada" ? "Aprobada por el docente · " : "") + m.motivo;
      t.append(b, s1, s2); li.appendChild(t);
      if (m.estado === "dudosa" || m.estado === "rechazada") {
        const a = document.createElement("div"); a.className = "acts";
        const y = document.createElement("button"); y.textContent = "Aprobar"; y.onclick = () => setEstado(m.id, "aprobada");
        a.appendChild(y);
        if (m.estado === "dudosa") { const n = document.createElement("button"); n.className = "no"; n.textContent = "Rechazar"; n.onclick = () => setEstado(m.id, "rechazada"); a.appendChild(n); }
        li.appendChild(a);
      }
      ul.appendChild(li);
    });
    $("s-ok").textContent = ok; $("s-dud").textContent = dud; $("s-rej").textContent = rej;
  }
  function setEstado(id, estado) {
    const m = S.marcas.find((x) => x.id === id); if (!m) return;
    m.estado = estado; if (estado === "rechazada") m.motivo = "Rechazada por el docente"; saveActive(); renderList(); notifyStudent(m);
  }
  function download(name, text, type) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const fname = (s) => `asistencia_${s.grupo}_${new Date(s.inicio).toISOString().slice(0, 10)}`.replace(/[^\w.-]+/g, "_");
  $("finish").onclick = () => {
    const pend = S.marcas.filter((m) => m.estado === "dudosa").length;
    if (!confirm(pend ? `Hay ${pend} registro(s) dudoso(s) sin resolver; contarán como NO presentes. ¿Terminar la clase?` : "¿Terminar la clase y exportar la lista?")) return;
    S.fin = Date.now();
    conns.forEach((c) => { try { c.send({ type: "fin" }); } catch (e) {} });
    const h = getHistory(); const copy = JSON.parse(JSON.stringify(S)); copy.marcas.forEach((m) => delete m.selfie);
    h.unshift(copy); LS.set("asist_hist", h.slice(0, 30));
    download(fname(S) + ".csv", Core.toCSV(S), "text/csv;charset=utf-8");
    LS.del("asist_active"); teardownTeacher(true); refreshHome(); renderHistory(); show("hist");
  };
  function renderHistory() {
    const ul = $("h-list"); ul.textContent = ""; const h = getHistory(); $("h-empty").hidden = h.length > 0;
    h.forEach((s) => {
      const li = document.createElement("li"); const t = document.createElement("div"); t.className = "t";
      const b = document.createElement("b"); b.textContent = `${s.materia} · ${s.grupo}`;
      const sm = document.createElement("small"); sm.textContent = `${new Date(s.inicio).toLocaleString("es-MX")} · ${s.marcas.filter(Core.finalOk).length} presentes de ${s.marcas.length} registros`;
      t.append(b, sm); li.appendChild(t);
      const a = document.createElement("div"); a.className = "acts"; const bt = document.createElement("button"); bt.textContent = "CSV";
      bt.onclick = () => download(fname(s) + ".csv", Core.toCSV(s), "text/csv;charset=utf-8"); a.appendChild(bt); li.appendChild(a); ul.appendChild(li);
    });
  }

  // =====================================================================
  //                               ALUMNO
  // =====================================================================
  let sPeer = null, sConn = null, scanStream = null, scanRaf = 0, selfieStream = null, pending = null, curRec = null;
  const devId = () => { let d = LS.get("asist_dev", null); if (!d) { d = Core.randomCode(12) + Core.randomCode(12); LS.set("asist_dev", d); } return d; };
  const amsg = (t, ok) => { const m = $("a-msg"); m.className = "msg" + (ok ? " ok" : ""); m.textContent = t || ""; };

  function initStudentView() {
    const p = LS.get("asist_alumno", {}); $("a-nombre").value = p.nombre || ""; $("a-mat").value = p.mat || "";
    $("a-profile").hidden = false; $("a-cam").hidden = true; $("a-flow").hidden = true; $("a-result").hidden = true; amsg("");
    renderAHist();
  }
  function renderAHist() {
    const ul = $("a-hist"); ul.textContent = ""; const h = LS.get("asist_mis", []);
    if (!h.length) { const li = document.createElement("li"); li.textContent = "Aún no tienes registros."; ul.appendChild(li); return; }
    h.forEach((r) => { const li = document.createElement("li"); li.className = r.estado === "ok" || r.estado === "aprobada" ? "" : r.estado;
      const t = document.createElement("div"); t.className = "t"; const b = document.createElement("b"); b.textContent = r.materia; const s = document.createElement("small");
      s.textContent = `${new Date(r.hora).toLocaleString("es-MX")} · ${r.estado === "ok" || r.estado === "aprobada" ? "Presente" : r.estado === "dudosa" ? "En revisión" : "Rechazada"}`; t.append(b, s); li.appendChild(t); ul.appendChild(li); });
  }
  function profile() {
    const nombre = Core.clean($("a-nombre").value, 60), mat = Core.clean($("a-mat").value, 20).toUpperCase();
    if (!nombre || !mat) { amsg("Escribe tu nombre y matrícula."); return null; }
    LS.set("asist_alumno", { nombre, mat }); return { nombre, mat };
  }

  $("a-scan").onclick = async () => {
    if (!profile()) return; amsg("");
    if (window.__pendingJoin) { const c = window.__pendingJoin; window.__pendingJoin = null; return joinRoom(c); }
    try {
      scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    } catch (e) { return amsg("No se pudo abrir la cámara. Permite el acceso o escribe el código manualmente."); }
    $("a-profile").hidden = true; $("a-cam").hidden = false;
    const v = $("a-video"); v.srcObject = scanStream; await v.play().catch(() => {});
    const cv = document.createElement("canvas"), g = cv.getContext("2d", { willReadFrequently: true });
    const loop = () => {
      if (!scanStream) return;
      if (v.videoWidth) {
        const w = 480, h = Math.round((v.videoHeight / v.videoWidth) * w); cv.width = w; cv.height = h; g.drawImage(v, 0, 0, w, h);
        const res = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
        if (res && res.data) { const c = Core.parseCode(res.data); if (c) { stopScan(); return joinRoom(c); } }
      }
      scanRaf = requestAnimationFrame(loop);
    };
    loop();
  };
  function stopScan() { cancelAnimationFrame(scanRaf); if (scanStream) { scanStream.getTracks().forEach((t) => t.stop()); scanStream = null; } $("a-cam").hidden = true; }
  $("a-cancel-scan").onclick = () => { stopScan(); $("a-profile").hidden = false; };
  $("a-manual").onclick = () => {
    if (!profile()) return; const c = Core.parseCode($("a-code").value);
    if (!c) return amsg("Código no válido. Son 14 caracteres: XXXX-XXXX-XXXXXX."); joinRoom(c);
  };

  function step(s, st) {
    document.querySelectorAll("#a-steps li").forEach((li) => { if (li.dataset.s === s) li.className = st; });
  }
  function closeStudent() { try { sConn && sConn.close(); } catch (e) {} try { sPeer && sPeer.destroy(); } catch (e) {} sConn = sPeer = null; stopSelfie(); }
  function fail(text) { closeStudent(); showResult("rechazada", "No se registró", text); }
  function showResult(estado, title, text) {
    $("a-flow").hidden = true; $("a-profile").hidden = true; const r = $("a-result"); r.hidden = false; r.className = "result " + estado;
    $("r-title").textContent = title; $("r-text").textContent = text;
  }
  $("r-again").onclick = () => { closeStudent(); initStudentView(); };

  function joinRoom(c) {
    const me = profile(); if (!me) return;
    closeStudent(); amsg(""); $("a-profile").hidden = true; $("a-result").hidden = true; $("a-flow").hidden = false; $("a-selfie").hidden = true;
    document.querySelectorAll("#a-steps li").forEach((li) => (li.className = "")); step("conn", "on");
    pending = { me, info: null, rec: null };
    const to = setTimeout(() => fail("No se pudo conectar con el docente. ¿Estás en línea y el docente tiene la clase abierta?"), 20000);
    sPeer = new Peer(peerOpts());
    sPeer.on("error", (e) => { clearTimeout(to); fail(e.type === "peer-unavailable" ? "Sala no encontrada: el código no es válido o la clase ya cerró." : "Error de conexión (" + e.type + ")."); });
    sPeer.on("open", () => {
      sConn = sPeer.connect(c.peer, { reliable: true });
      sConn.on("open", () => sConn.send({ type: "hola", t: c.token }));
      sConn.on("data", (d) => onTeacherMsg(d, to));
      sConn.on("close", () => { if (!$("a-result").hidden || !pending) return; });
    });
  }
  async function onTeacherMsg(d, to) {
    if (!d || typeof d !== "object") return;
    if (d.type === "hola") {
      clearTimeout(to); pending.info = d; step("conn", "done"); step("gps", "on");
      let pos;
      try { pos = await getPosition(15000); } catch (e) { return fail(e.message); }
      pending.pos = pos; step("gps", "done");
      if (d.selfieReq) {
        step("selfie", "on");
        try { selfieStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 480, height: 640 }, audio: false }); }
        catch (e) { return fail("Se necesita la cámara para la selfie en vivo."); }
        const v = $("a-selfie-video"); v.srcObject = selfieStream; await v.play().catch(() => {}); $("a-selfie").hidden = false;
      } else sendMark("");
      return;
    }
    if (d.type === "resultado") { return finalizar(d); }
    if (d.type === "actualizacion") { return finalizar(d, true); }
    if (d.type === "fin" && !$("a-result").hidden === false) { /* clase cerrada */ }
  }
  $("a-snap").onclick = () => {
    const v = $("a-selfie-video"); if (!v.videoWidth) return;
    const cv = document.createElement("canvas"); const w = 240, h = Math.round((v.videoHeight / v.videoWidth) * w); cv.width = w; cv.height = h;
    const g = cv.getContext("2d"); g.translate(w, 0); g.scale(-1, 1); g.drawImage(v, 0, 0, w, h);
    stopSelfie(); $("a-selfie").hidden = true; sendMark(cv.toDataURL("image/jpeg", 0.6));
  };
  function stopSelfie() { if (selfieStream) { selfieStream.getTracks().forEach((t) => t.stop()); selfieStream = null; } }
  function sendMark(selfie) {
    step("selfie", "done"); step("send", "on");
    const { me, pos } = pending;
    sConn.send({ type: "marcar", nombre: me.nombre, mat: me.mat, lat: pos.lat, lng: pos.lng, acc: pos.acc, dev: devId(), selfie });
  }
  function finalizar(d, update) {
    const materia = (pending && pending.info && pending.info.materia) || "Clase";
    const est = d.estado;
    if (!update && !curRec) curRec = { materia, hora: Date.now(), estado: est };
    const title = est === "ok" || est === "aprobada" ? "¡Asistencia registrada!" : est === "dudosa" ? "En revisión del docente" : "No se registró";
    const text = est === "ok" || est === "aprobada" ? `${materia} · ${new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`
      : est === "dudosa" ? "Tu registro llegó, pero el docente debe aprobarlo. " + (d.motivo || "") + " Mantén esta pantalla abierta." : (d.motivo || "");
    showResult(est, title, text);
    if (curRec) { curRec.estado = est; const h = LS.get("asist_mis", []); const i = h.findIndex((x) => x.hora === curRec.hora); if (i >= 0) h[i] = curRec; else h.unshift(curRec); LS.set("asist_mis", h.slice(0, 40)); }
    if (est !== "dudosa") { curRec = null; setTimeout(() => { if (est !== "dudosa") { try { sConn && sConn.close(); } catch (e) {} } }, 1500); }
    renderAHist();
  }

  // ---------- Arranque ----------
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./sw.js").catch(() => {});
  refreshHome();
  const j = new URLSearchParams(location.search).get("j");
  if (j) { const c = Core.parseCode(j); history.replaceState(null, "", location.pathname); if (c) { initStudentView(); show("alu"); amsg("Escribe tus datos y se conectará con el salón.", true); window.__pendingJoin = c;
    const p = LS.get("asist_alumno", null); if (p && p.nombre && p.mat) joinRoom(c); } }
  window.__app = { get S() { return S; } };
})();
