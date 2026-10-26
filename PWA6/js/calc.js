// Lógica de la calculadora: convierte frases en español ("dos más tres por cuatro") a una operación y la resuelve.
// No usa eval(): se evalúa con un pequeño parser (precedencia: × ÷ antes que + −).
(function (root) {
  const UNITS = { cero:0, un:1, uno:1, una:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6, siete:7, ocho:8, nueve:9, diez:10, once:11, doce:12, trece:13, catorce:14, quince:15, dieciseis:16, diecisiete:17, dieciocho:18, diecinueve:19, veinte:20, veintiun:21, veintiuno:21, veintidos:22, veintitres:23, veinticuatro:24, veinticinco:25, veintiseis:26, veintisiete:27, veintiocho:28, veintinueve:29 };
  const TENS = { treinta:30, cuarenta:40, cincuenta:50, sesenta:60, setenta:70, ochenta:80, noventa:90 };
  const HUND = { cien:100, ciento:100, doscientos:200, trescientos:300, cuatrocientos:400, quinientos:500, seiscientos:600, setecientos:700, ochocientos:800, novecientos:900 };
  const FILLER = /^(cuanto es|cuanto son|cuanto seria|cual es el resultado de|el resultado de|calcula|calcular|calculame|dime|resuelve|resolver)\s+/;

  const isNumWord = (w) => w in UNITS || w in TENS || w in HUND || w === "mil" || w === "millon" || w === "millones";

  function normalize(text) {
    return String(text).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/(\d),(\d)/g, "$1.$2")
      .replace(/[+]/g, " mas ").replace(/[×*]/g, " por ").replace(/[÷\/]/g, " entre ")
      .replace(/(\d)\s*x\s*(\d)/g, "$1 por $2")
      .replace(/-/g, " menos ")
      .replace(/[?¿!¡.,;:]+(\s|$)/g, " ").replace(/\s+/g, " ").trim();
  }

  // Convierte la frase en tokens: números (Number) y operadores ("+","-","*","/")
  function tokenize(raw) {
    let t = normalize(raw).replace(FILLER, "");
    // Formas con verbo: "suma 2 y 3", "resta 5 a 10", "multiplica 4 por 3", "divide 8 entre 2"
    let m;
    if ((m = t.match(/^(suma|sumar|sumame)\s+(.+?)\s+(?:y|con|mas|a)\s+(.+)$/))) t = `${m[2]} mas ${m[3]}`;
    else if ((m = t.match(/^(resta|restar|restame)\s+(.+?)\s+(?:a|de)\s+(.+)$/))) t = `${m[3]} menos ${m[2]}`;
    else if ((m = t.match(/^(resta|restar|restame)\s+(.+?)\s+(?:y|menos)\s+(.+)$/))) t = `${m[2]} menos ${m[3]}`;
    else if ((m = t.match(/^(multiplica|multiplicar|multiplicame)\s+(.+?)\s+(?:por|y|con)\s+(.+)$/))) t = `${m[2]} por ${m[3]}`;
    else if ((m = t.match(/^(divide|dividir|dividme|dividime)\s+(.+?)\s+(?:entre|por|y|con)\s+(.+)$/))) t = `${m[2]} entre ${m[3]}`;

    const words = t.split(" ").filter(Boolean);
    const tokens = [];
    let i = 0;
    while (i < words.length) {
      const w = words[i];
      if (/^\d+(\.\d+)?$/.test(w)) { tokens.push(parseFloat(w)); i++; continue; }
      if (isNumWord(w)) {
        let total = 0, cur = 0;
        while (i < words.length) {
          const x = words[i];
          if (x in UNITS) cur += UNITS[x];
          else if (x in TENS) cur += TENS[x];
          else if (x in HUND) cur += HUND[x];
          else if (x === "mil") { total += (cur || 1) * 1000; cur = 0; }
          else if (x === "millon" || x === "millones") { total = ((total + cur) || 1) * 1e6; cur = 0; }
          else if (x === "y" && i + 1 < words.length && (words[i + 1] in UNITS) && cur % 10 === 0 && cur > 0 && cur < 100) { /* "treinta y uno" */ }
          else break;
          i++;
        }
        let value = total + cur;
        // decimales: "tres punto cinco" / "tres coma cinco"
        if ((words[i] === "punto" || words[i] === "coma") && i + 1 < words.length && (words[i + 1] in UNITS || /^\d+$/.test(words[i + 1]))) {
          i++;
          let frac = "";
          while (i < words.length && ((words[i] in UNITS && UNITS[words[i]] < 10) || /^\d+$/.test(words[i]))) { frac += /^\d+$/.test(words[i]) ? words[i] : UNITS[words[i]]; i++; }
          value = parseFloat(value + "." + frac);
        }
        tokens.push(value); continue;
      }
      if (w === "mas") { tokens.push("+"); i++; continue; }
      if (w === "menos") { tokens.push("-"); i++; continue; }
      if (w === "por" || w === "veces") { tokens.push("*"); i++; continue; }
      if (w === "multiplicado") { tokens.push("*"); i++; if (words[i] === "por") i++; continue; }
      if (w === "entre") { tokens.push("/"); i++; continue; }
      if (w === "dividido") { tokens.push("/"); i++; if (words[i] === "entre" || words[i] === "por") i++; continue; }
      if (w === "y" || w === "es" || w === "igual" || w === "a") { i++; continue; } // relleno
      return { ok: false, error: `No entendí “${w}”.` };
    }
    return { ok: true, tokens };
  }

  const SYM = { "+": "+", "-": "−", "*": "×", "/": "÷" };

  function evaluate(tokens) {
    // negativos unarios: "menos tres" al inicio o tras un operador
    const t = [];
    for (let i = 0; i < tokens.length; i++) {
      const x = tokens[i];
      if (x === "-" && (t.length === 0 || typeof t[t.length - 1] === "string") && typeof tokens[i + 1] === "number") { t.push(-tokens[i + 1]); i++; }
      else t.push(x);
    }
    if (!t.length) return { ok: false, error: "No escuché ninguna operación." };
    for (let i = 0; i < t.length; i++) {
      const wantNum = i % 2 === 0;
      if (wantNum !== (typeof t[i] === "number")) return { ok: false, error: "La operación está incompleta o mal dicha." };
    }
    if (typeof t[t.length - 1] !== "number") return { ok: false, error: "Falta un número al final." };
    // 1er paso: × ÷
    const stack = [t[0]];
    for (let i = 1; i < t.length; i += 2) {
      const op = t[i], n = t[i + 1];
      if (op === "*") stack[stack.length - 1] *= n;
      else if (op === "/") {
        if (n === 0) return { ok: false, error: "No se puede dividir entre cero." };
        stack[stack.length - 1] /= n;
      } else stack.push(op, n);
    }
    // 2º paso: + −
    let res = stack[0];
    for (let i = 1; i < stack.length; i += 2) res = stack[i] === "+" ? res + stack[i + 1] : res - stack[i + 1];
    res = Math.round(res * 1e10) / 1e10;
    const expr = t.map((x) => (typeof x === "number" ? fmt(x) : SYM[x])).join(" ");
    return { ok: true, value: res, expr };
  }

  function fmt(n) { return String(Math.round(n * 1e10) / 1e10).replace(".", ","); }

  function solve(phrase) {
    const tk = tokenize(phrase);
    if (!tk.ok) return tk;
    return evaluate(tk.tokens);
  }

  const api = { solve, tokenize, evaluate, normalize, fmt };
  if (typeof module === "object" && module.exports) module.exports = api; else root.Calc = api;
})(typeof window !== "undefined" ? window : globalThis);
