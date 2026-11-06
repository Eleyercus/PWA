// Reglas de validación de la asistencia. Se ejecutan SOLO en el dispositivo del docente (la "autoridad").
// Funciones puras: no tocan el DOM, así se pueden probar aparte.
(function (root) {
  const ALPHA = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";   // sin 0/O, 1/I/L para poder teclear el código sin errores

  function randomCode(n) {
    const out = [];
    const buf = new Uint32Array(n);
    (root.crypto || require("crypto").webcrypto).getRandomValues(buf);
    for (let i = 0; i < n; i++) out.push(ALPHA[buf[i] % ALPHA.length]);
    return out.join("");
  }

  const toRad = (d) => (d * Math.PI) / 180;
  function haversine(a, b) {                           // distancia en metros entre dos coordenadas
    const R = 6371000;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  // Código manual = 8 caracteres de sala + 6 de token  →  "ABCD-EFGH-JKMNPQ"
  const formatCode = (peer, token) => peer.slice(0, 4) + "-" + peer.slice(4) + "-" + token;
  function parseCode(input) {
    let s = String(input || "").trim();
    const m = s.match(/[?&#]j=([A-Za-z0-9-]+)/);       // viene de un enlace/QR
    if (m) s = m[1];
    s = s.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (s.length !== 14 || [...s].some((c) => !ALPHA.includes(c))) return null;
    return { peer: s.slice(0, 8), token: s.slice(8) };
  }

  function validToken(tokens, tok, now, ttl) {
    return tokens.some((t) => t.t === tok && now - t.at <= ttl);
  }

  const okSelfie = (s) => typeof s === "string" && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(s) && s.length < 120000;
  const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);

  /**
   * Evalúa un intento de asistencia.
   * @param {object} x  { sesion:{loc,radio,selfieReq,roster}, tokens, now, marcas, p }
   * @returns {{estado:'ok'|'dudosa'|'rechazada', motivo:string, dist?:number, acc?:number, mat?:string, nombre?:string}}
   */
  function evaluar(x) {
    const { sesion, tokens, now, marcas, p, ttl } = x;
    const rej = (motivo, extra) => ({ estado: "rechazada", motivo, ...extra });
    const mat = clean(p && p.mat, 20).toUpperCase();
    let nombre = clean(p && p.nombre, 60);
    if (!mat || !nombre) return rej("Faltan nombre o matrícula");
    if (!validToken(tokens, p.t, now, ttl)) return rej("Código vencido o inválido: escanea el QR vigente", { mat, nombre });
    if (marcas.some((m) => m.mat === mat && (m.estado === "ok" || m.estado === "dudosa" || m.estado === "aprobada")))
      return rej("Esta matrícula ya registró asistencia", { mat, nombre });
    if (sesion.selfieReq && !okSelfie(p.selfie)) return rej("Falta la selfie en vivo", { mat, nombre });
    const lat = Number(p.lat), lng = Number(p.lng), acc = Number(p.acc);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
      return rej("No se recibió una ubicación válida", { mat, nombre });

    const dist = haversine(sesion.loc, { lat, lng });
    const motivos = [];
    let estado = "ok";
    if (dist > sesion.radio * 2) return rej(`Fuera del salón/plantel (${Math.round(dist)} m)`, { mat, nombre, dist, acc });
    if (dist > sesion.radio) { estado = "dudosa"; motivos.push(`Fuera del radio (${Math.round(dist)} m)`); }
    if (!Number.isFinite(acc) || acc > 150) { estado = "dudosa"; motivos.push("Precisión de ubicación baja"); }
    if (sesion.roster && sesion.roster.length) {
      const r = sesion.roster.find((e) => e.mat === mat);
      if (!r) { estado = "dudosa"; motivos.push("No aparece en la lista del grupo"); }
      else nombre = r.nombre;
    }
    const dev = clean(p.dev, 64);
    const otro = marcas.find((m) => m.dev && m.dev === dev && m.mat !== mat && m.estado !== "rechazada");
    if (otro) { estado = "dudosa"; motivos.push(`Mismo dispositivo que ${otro.mat}`); }
    return { estado, motivo: motivos.join(" · ") || "Dentro del salón", dist, acc, mat, nombre, dev };
  }

  const finalOk = (m) => m.estado === "ok" || m.estado === "aprobada";
  const csvCell = (v) => {
    let s = String(v == null ? "" : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;           // evita inyección de fórmulas en Excel
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  function toCSV(ses) {
    const head = ["Matrícula", "Nombre", "Estado", "Motivo", "Hora", "Distancia (m)", "Precisión (m)"];
    const est = { ok: "Presente", aprobada: "Presente (aprobada por docente)", dudosa: "Dudosa (sin aprobar)", rechazada: "Rechazada" };
    const rows = ses.marcas.map((m) => [m.mat, m.nombre, est[m.estado] || m.estado, m.motivo, new Date(m.hora).toLocaleTimeString("es-MX"), Math.round(m.dist ?? 0), Math.round(m.acc ?? 0)]);
    return "﻿" + [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  }

  const api = { ALPHA, randomCode, haversine, formatCode, parseCode, validToken, evaluar, finalOk, toCSV, okSelfie, clean };
  if (typeof module === "object" && module.exports) module.exports = api; else root.Core = api;
})(typeof window !== "undefined" ? window : globalThis);
