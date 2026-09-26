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
import { iniciarDB } from "./db.mjs";
import { api } from "./api.mjs";

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PUERTO = Number(process.env.PORT) || 5173;
let dbLista = false, dbError = "";

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".wasm": "application/wasm",
  ".glb": "model/gltf-binary", ".fbx": "application/octet-stream", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon"
};
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": MIME[".json"], "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };

function estatico(req, res, url) {
  let ruta = decodeURIComponent(url.pathname);
  if (ruta === "/") ruta = "/index.html";
  else if (ruta === "/pelea.html") ruta = "/index.html";          // compatibilidad con los links viejos
  const abs = path.normalize(path.join(RAIZ, ruta));
  const privado = ["server.js", "salas.mjs", "api.mjs", "db.mjs", "package.json", "package-lock.json"].map(f => path.join(RAIZ, f));
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
    if (url.pathname.startsWith("/api/")) {
      if (!dbLista && url.pathname !== "/api/config") return json(res, 503, { ok: false, msg: "La base de datos no está disponible: " + dbError });
      return await api(req, res, url);
    }
    if (url.pathname === "/salud") { res.writeHead(dbLista ? 200 : 503); return res.end(dbLista ? "ok" : "sin base de datos: " + dbError); }
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
    estatico(req, res, url);
  } catch (e) {
    console.error("[server]", e.message);
    if (!res.headersSent) json(res, 500, { ok: false, msg: e.message }); else res.end();
  }
});
adjuntarSalas(servidor);
servidor.listen(PUERTO, () => console.log(`\n  REINO CAÍDO  →  http://localhost:${PUERTO}\n`));
iniciarDB().then(() => { dbLista = true; console.log("  Base de datos lista."); })
  .catch(e => { dbError = e.message; console.error("  ✗ No pude conectar con MySQL:", e.message, "\n    Revisá DB_HOST / DB_USER / DB_PASSWORD / DB_NAME."); });
