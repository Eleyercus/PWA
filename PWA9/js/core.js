// Construcción y reconocimiento de contenidos de QR. Funciones puras (se prueban en Node).
(function (root) {
  const IMG_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;      // SVG excluido a propósito (puede traer scripts)
  const escW = (s) => String(s || "").replace(/([\;,:"])/g, "\\$1");
  const unW = (s) => String(s || "").replace(/\\([\;,:"])/g, "$1");
  const vEsc = (s) => String(s || "").replace(/([\;,])/g, "\\$1").replace(/\r?\n/g, "\\n");

  function fixUrl(u) {
    u = String(u || "").trim();
    if (!u) return "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(u) && !/^[^\s/]+\.[a-z]{2,}(:\d+)?(\/|$)/i.test(u)) return u;
    return /^[^\s/]+\.[^\s/]+/.test(u) ? "https://" + u : u;
  }

  function build(type, f) {
    f = f || {};
    switch (type) {
      case "texto": return String(f.texto || "");
      case "url": return fixUrl(f.url);
      case "wifi": return f.ssid ? `WIFI:T:${f.seg || "WPA"};S:${escW(f.ssid)};P:${escW(f.pass)};H:${f.oculta ? "true" : ""};;` : "";
      case "contacto": {
        if (!f.nombre) return "";
        const L = ["BEGIN:VCARD", "VERSION:3.0", "FN:" + vEsc(f.nombre)];
        if (f.tel) L.push("TEL:" + vEsc(f.tel));
        if (f.email) L.push("EMAIL:" + vEsc(f.email));
        if (f.org) L.push("ORG:" + vEsc(f.org));
        L.push("END:VCARD"); return L.join("\n");
      }
      case "correo": return f.email ? "mailto:" + f.email.trim() + (f.asunto ? "?subject=" + encodeURIComponent(f.asunto) : "") : "";
      case "tel": return f.tel ? "tel:" + f.tel.replace(/[^\d+*#]/g, "") : "";
      case "geo": { const la = parseFloat(f.lat), lo = parseFloat(f.lng);
        return Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 ? `geo:${la},${lo}` : ""; }
      default: return "";
    }
  }

  function parseWifi(s) {
    const body = s.slice(5), out = {}; let key = "", val = "", inKey = true, esc = false;
    const push = () => { if (key) out[key] = unW(val); key = ""; val = ""; inKey = true; };
    for (const ch of body) {
      if (esc) { (inKey ? (key += "\\" + ch) : (val += "\\" + ch)); esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (inKey && ch === ":") { inKey = false; continue; }
      if (ch === ";") { push(); continue; }
      inKey ? (key += ch) : (val += ch);
    }
    push();
    return { ssid: out.S || "", pass: out.P || "", seg: out.T || "", oculta: out.H === "true" };
  }
  function parseVcard(s) {
    const g = (k) => { const m = s.match(new RegExp("^" + k + "[^:\\n]*:(.*)$", "mi")); return m ? m[1].trim().replace(/\\n/g, " ").replace(/\\([\;,])/g, "$1") : ""; };
    return { nombre: g("FN") || g("N").replace(/;/g, " ").trim(), tel: g("TEL"), email: g("EMAIL"), org: g("ORG") };
  }

  function parse(data) {
    const s = String(data == null ? "" : data);
    const t = s.trim();
    if (IMG_RE.test(t)) return { kind: "imagen", src: t, mime: t.slice(5, t.indexOf(";")) };
    if (/^data:image\//i.test(t)) return { kind: "texto", text: s, aviso: "Imagen no soportada (solo PNG, JPG, WebP o GIF)" };
    if (/^https?:\/\/\S+$/i.test(t)) return { kind: "url", url: t };
    if (/^WIFI:/i.test(t)) return Object.assign({ kind: "wifi" }, parseWifi(t));
    if (/^BEGIN:VCARD/i.test(t)) return Object.assign({ kind: "contacto", raw: t }, parseVcard(t));
    if (/^mailto:/i.test(t)) return { kind: "correo", email: decodeURIComponent(t.slice(7).split("?")[0]), asunto: (t.match(/[?&]subject=([^&]*)/i) || [])[1] ? decodeURIComponent(t.match(/[?&]subject=([^&]*)/i)[1]) : "" };
    if (/^tel:/i.test(t)) return { kind: "tel", tel: t.slice(4) };
    if (/^geo:/i.test(t)) { const m = t.match(/^geo:(-?\d+(\.\d+)?),(-?\d+(\.\d+)?)/i); if (m) return { kind: "geo", lat: +m[1], lng: +m[3] }; }
    return { kind: "texto", text: s };
  }

  const bytesOf = (s) => new TextEncoder().encode(s).length;
  const api = { IMG_RE, build, parse, fixUrl, bytesOf, escW };
  if (typeof module === "object" && module.exports) module.exports = api; else root.QRCore = api;
})(typeof window !== "undefined" ? window : globalThis);
