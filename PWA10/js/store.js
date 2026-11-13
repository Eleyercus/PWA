// Almacén local (IndexedDB) compartido por la página y el service worker:
// registro de lecturas pendientes de sincronizar + ajustes.
(function (root) {
  const DB = "protoseguro", V = 1;
  function open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, V);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("lecturas", { keyPath: "id", autoIncrement: true }); d.createObjectStore("kv"); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  const tx = (db, store, mode, fn) => new Promise((res, rej) => { const t = db.transaction(store, mode); const out = fn(t.objectStore(store)); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  const Store = {
    async addLectura(rec) { const db = await open(); return tx(db, "lecturas", "readwrite", (s) => s.add(Object.assign({ enviada: false }, rec))); },
    async lecturas() { const db = await open(); return tx(db, "lecturas", "readonly", (s) => s.getAll()); },
    async pendientes() { return (await this.lecturas()).filter((x) => !x.enviada); },
    async marcarEnviadas(ids) { const db = await open(); return tx(db, "lecturas", "readwrite", (s) => { ids.forEach((id) => { const g = s.get(id); g.onsuccess = () => { if (g.result) { g.result.enviada = true; s.put(g.result); } }; }); }); },
    async get(k) { const db = await open(); return tx(db, "kv", "readonly", (s) => s.get(k)); },
    async set(k, v) { const db = await open(); return tx(db, "kv", "readwrite", (s) => s.put(v, k)); },
    // Envía las lecturas pendientes al servidor configurado. Sin URL o sin red, no hace nada y las conserva.
    async enviarPendientes() {
      const url = await this.get("syncUrl");
      if (!url || !/^https:\/\//.test(url)) return { enviadas: 0, motivo: "sin-url" };
      const pend = await this.pendientes();
      if (!pend.length) return { enviadas: 0, motivo: "nada" };
      const ac = new AbortController(), t = setTimeout(() => ac.abort(), 15000);
      try {
        const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lecturas: pend }), signal: ac.signal });
        if (!r.ok) return { enviadas: 0, motivo: "http-" + r.status };
        await this.marcarEnviadas(pend.map((p) => p.id)); return { enviadas: pend.length };
      } catch (e) { return { enviadas: 0, motivo: "sin-red" }; } finally { clearTimeout(t); }
    },
  };
  if (typeof module === "object" && module.exports) module.exports = Store; else root.Store = Store;
})(typeof self !== "undefined" ? self : window);
