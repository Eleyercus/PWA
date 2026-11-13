// Genera release.json (versión + hash SHA-256 de cada archivo) e inyecta la versión en sw.js.
// Uso:  node tools/build.js          (lee version.json)
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const root = path.join(__dirname, "..");
const ver = JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8"));
const skip = new Set(["sw.js", "release.json", "version.json", "README.md"]);
const files = {};
(function walk(dir) {
  for (const f of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, f), rel = path.relative(root, full).split(path.sep).join("/");
    if (fs.statSync(full).isDirectory()) { if (f !== "tools" && f !== "node_modules" && !f.startsWith(".")) walk(full); continue; }
    if (skip.has(rel)) continue;
    files[rel] = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
  }
})(root);
fs.writeFileSync(path.join(root, "release.json"), JSON.stringify({ version: ver.version, fecha: ver.fecha, auditoria: ver.auditoria, cambios: ver.cambios, files }, null, 1));
let sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
sw = sw.replace(/\/\*BUILD:START\*\/[\s\S]*?\/\*BUILD:END\*\//, `/*BUILD:START*/\nconst VERSION = ${JSON.stringify(ver.version)}, FECHA = ${JSON.stringify(ver.fecha)}, AUDITORIA = ${JSON.stringify(ver.auditoria)};\n/*BUILD:END*/`);
fs.writeFileSync(path.join(root, "sw.js"), sw);
console.log(`v${ver.version}: ${Object.keys(files).length} archivos con hash`);
