// VozCalc — asistente virtual con Annyang (reconocimiento de voz) + SpeechSynthesis (respuestas habladas)
const $ = (id) => document.getElementById(id);
const HKEY = "vozcalc_history", MKEY = "vozcalc_muted";

let history = [];
try { history = JSON.parse(localStorage.getItem(HKEY)) || []; } catch {}
let muted = localStorage.getItem(MKEY) === "1";
let wantListening = false;
let lastResult = null;
let keyExpr = "";     // lo que se escribe con el teclado

// ---------- Utilidades de UI ----------
const say = (t) => { $("reply").textContent = t; speak(t); };
function notice(t) { $("notice").textContent = t; $("notice").hidden = !t; }

function speak(text) {
  if (muted || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "es-MX";
  const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.toLowerCase().startsWith("es"));
  if (v) u.voice = v;
  // Mientras habla, se pausa el micrófono para que no se escuche a sí mismo
  const resume = () => { if (wantListening && window.annyang) annyang.resume(); };
  u.onend = resume; u.onerror = resume;
  if (wantListening && window.annyang) annyang.pause();
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

function show(expr, result) {
  $("expr").textContent = expr || " ";
  $("result").textContent = result;
}
function renderHistory() {
  const ul = $("history");
  ul.innerHTML = "";
  history.forEach((h) => {
    const li = document.createElement("li");
    const a = document.createElement("span"); a.textContent = h.expr;
    const b = document.createElement("b"); b.textContent = "= " + h.result;
    li.append(a, b); ul.appendChild(li);
  });
  $("history-empty").hidden = history.length > 0;
  $("clear-history").hidden = history.length === 0;
}

// ---------- Núcleo: frase → resultado ----------
function runPhrase(phrase) {
  const r = Calc.solve(phrase);
  if (!r.ok) { say(r.error); return false; }
  const res = Calc.fmt(r.value);
  lastResult = res;
  show(r.expr, res);
  history.unshift({ expr: r.expr, result: res });
  history = history.slice(0, 10);
  localStorage.setItem(HKEY, JSON.stringify(history));
  renderHistory();
  say(`${r.expr.replace("−", "menos").replace("×", "por").replace("÷", "entre")} es igual a ${res}`);
  return true;
}
function clearAll() { keyExpr = ""; lastResult = null; show("", "0"); say("Pantalla limpia."); }

// ---------- Teclado ----------
$("keys").addEventListener("click", (e) => {
  const b = e.target.closest("[data-k]"); if (!b) return;
  const k = b.dataset.k;
  if (k === "C") { keyExpr = ""; lastResult = null; show("", "0"); return; }
  if (k === "⌫") { keyExpr = keyExpr.slice(0, -1); show("", keyExpr || "0"); return; }
  if (k === "=") {
    if (!keyExpr) return;
    runPhrase(keyExpr.replace(/−/g, "-"));
    keyExpr = ""; return;
  }
  keyExpr += k; show("", keyExpr);
});
$("text-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("text-input").value.trim(); if (!v) return;
  $("heard").textContent = v;
  if (runPhrase(v)) $("text-input").value = "";
});
$("clear-history").addEventListener("click", () => { history = []; localStorage.removeItem(HKEY); renderHistory(); });
$("mute-btn").addEventListener("click", () => setMuted(!muted));
function setMuted(m) {
  muted = m; localStorage.setItem(MKEY, m ? "1" : "0");
  $("mute-btn").textContent = m ? "🔇" : "🔊";
  $("mute-btn").setAttribute("aria-pressed", String(m));
  if (m && "speechSynthesis" in window) speechSynthesis.cancel();
}

// ---------- Annyang ----------
function setListening(on) {
  wantListening = on;
  $("mic-btn").setAttribute("aria-pressed", String(on));
  $("mic-status").textContent = on ? "Escuchando… di una operación" : "Toca el micrófono y di: “dos más tres”";
}

if (!window.annyang) {
  $("mic-btn").disabled = true;
  $("mic-status").textContent = "Voz no disponible en este navegador";
  notice("Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge, o escribe la operación abajo.");
} else {
  annyang.setLanguage("es-MX");

  annyang.addCommands({
    "hola": () => say("¡Hola! Soy VozCalc. Dime una operación, por ejemplo: dos más tres."),
    "ayuda": () => say("Puedes decir: dos más tres, siete por ocho, suma 4 y 6, resta 5 a 10, limpia o repite."),
    "limpia": clearAll,
    "limpiar": clearAll,
    "borra todo": clearAll,
    "repite (el resultado)": () => say(lastResult !== null ? `El resultado es ${lastResult}` : "Todavía no hay ningún resultado."),
    "silencio": () => { setMuted(true); $("reply").textContent = "Voz del asistente desactivada."; },
    "*frase": (frase) => runPhrase(frase),      // cualquier otra frase se interpreta como operación
  });

  annyang.addCallback("result", (phrases) => { $("heard").textContent = phrases[0] || "—"; });
  annyang.addCallback("errorNetwork", () => {
    setListening(false); annyang.abort();
    notice("No se pudo conectar al servicio de voz. Brave y algunos navegadores lo bloquean: prueba en Chrome o Edge, o escribe la operación.");
  });
  annyang.addCallback("errorPermissionBlocked", () => { setListening(false); notice("El navegador bloqueó el micrófono. Revisa los permisos del sitio."); });
  annyang.addCallback("errorPermissionDenied", () => { setListening(false); notice("Negaste el permiso del micrófono. Actívalo para usar la voz."); });

  $("mic-btn").addEventListener("click", () => {
    if (wantListening) { annyang.abort(); setListening(false); return; }
    notice("");
    annyang.start({ autoRestart: true, continuous: false });
    setListening(true);
  });
}

setMuted(muted);
renderHistory();
