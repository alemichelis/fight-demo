// Servidor de Reino Caído: sirve el juego, guarda los personajes de Avaturn (POST /api/upload) y hace de
// señalizador de las salas online (WebSocket en /ws, ver salas.mjs). Sin base de datos.
//
//   node server.js                 → http://localhost:5173
//   PORT=8080 node server.js       (los hostings tipo Render/Railway/Fly/Heroku ya ponen PORT solos)

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adjuntarSalas } from "./salas.mjs";

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PUERTO = Number(process.env.PORT) || 5173;
const DIR_SUBIDAS = path.join(RAIZ, "assets", "uploads");
const LIMITE_SUBIDA = 40 * 1024 * 1024;           // un avatar de Avaturn pesa unos 5-15 MB
fs.mkdirSync(DIR_SUBIDAS, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".wasm": "application/wasm",
  ".glb": "model/gltf-binary", ".fbx": "application/octet-stream", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon"
};
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": MIME[".json"], "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };

function leerCuerpo(req, limite) {
  return new Promise((ok, mal) => {
    const trozos = []; let total = 0;
    req.on("data", c => { total += c.length; if (total > limite) { mal(new Error("Archivo demasiado grande")); req.destroy(); return; } trozos.push(c); });
    req.on("end", () => ok(Buffer.concat(trozos)));
    req.on("error", mal);
  });
}

async function api(req, res, url) {
  if (url.pathname === "/api/upload" && req.method === "POST") {
    const base = path.basename(String(url.searchParams.get("name") || "av.glb")).replace(/[^\w.\-]+/g, "_").replace(/^\.+/, "");
    if (path.extname(base).toLowerCase() !== ".glb") return json(res, 400, { ok: false, msg: "Sólo se aceptan archivos .glb" });
    const datos = await leerCuerpo(req, LIMITE_SUBIDA);
    if (datos.length < 12 || datos.toString("latin1", 0, 4) !== "glTF") return json(res, 400, { ok: false, msg: "No es un GLB válido" });
    const { name: raiz } = path.parse(base);
    let destino = path.join(DIR_SUBIDAS, base), n = 1;
    while (fs.existsSync(destino)) destino = path.join(DIR_SUBIDAS, `${raiz}-${++n}.glb`);
    fs.writeFileSync(destino, datos);
    return json(res, 200, { ok: true, path: "assets/uploads/" + path.basename(destino), name: path.basename(destino), size: datos.length });
  }
  json(res, 404, { ok: false, msg: "Ruta de API desconocida" });
}

function estatico(req, res, url) {
  let ruta = decodeURIComponent(url.pathname);
  if (ruta === "/") ruta = "/index.html";
  else if (ruta === "/pelea.html") ruta = "/index.html";          // compatibilidad con los links viejos
  const abs = path.normalize(path.join(RAIZ, ruta));
  const privado = ["server.js", "salas.mjs", "package.json", "package-lock.json"].map(f => path.join(RAIZ, f));
  if (!abs.startsWith(RAIZ + path.sep) || privado.includes(abs)) { res.writeHead(403); return res.end("Prohibido"); }
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end("No encontrado"); }
    const ext = path.extname(abs).toLowerCase();
    const cab = { "Content-Type": MIME[ext] || "application/octet-stream", "Accept-Ranges": "bytes",
      // los modelos no cambian: caché larga; el código y el HTML se revalidan
      "Cache-Control": [".glb", ".fbx", ".wasm"].includes(ext) ? "public, max-age=86400" : "no-cache", "Last-Modified": st.mtime.toUTCString() };
    if (req.headers["if-modified-since"] && new Date(req.headers["if-modified-since"]) >= new Date(Math.floor(st.mtimeMs / 1000) * 1000)) { res.writeHead(304, cab); return res.end(); }
    res.writeHead(200, { ...cab, "Content-Length": st.size });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(abs).pipe(res);
  });
}

const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (url.pathname === "/salud") { res.writeHead(200); return res.end("ok"); }
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
    estatico(req, res, url);
  } catch (e) {
    console.error("[server]", e.message);
    if (!res.headersSent) json(res, 500, { ok: false, msg: e.message }); else res.end();
  }
});
adjuntarSalas(servidor);
servidor.listen(PUERTO, () => console.log(`\n  REINO CAÍDO  →  http://localhost:${PUERTO}\n`));
