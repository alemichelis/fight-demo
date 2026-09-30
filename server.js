// Servidor del portal Daxenworld: sirve el sitio en «/» y, bajo /juegos/<nombre>, cada juego (por ahora sólo Reino Caído).
// La API de cuentas/avatares/torneos (/api) y las salas en vivo (WebSocket en /ws, ver salas.mjs) son compartidas por
// todos los juegos: una sola cuenta sirve para jugar a cualquiera del catálogo.
//
//   node server.js                 → http://localhost:5173
//   PORT=8080 node server.js       (Hostinger y demás hostings ya ponen PORT solos)
//
// Para sumar un juego nuevo: una carpeta en juegos/<id>/ con su propio index.html, y listo — este servidor la
// encuentra sola. Si el juego usa three.js u otra librería ya presente en /node_modules, no hace falta reinstalarla:
// ese import map absoluto («/node_modules/…») se resuelve siempre desde la raíz, sea cual sea la página que lo pide.

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
  ".glb": "model/gltf-binary", ".fbx": "application/octet-stream", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".ico": "image/x-icon"
};
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": MIME[".json"], "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };

// El sitio vive en /sitio pero se sirve en la raíz; cada juego vive en /juegos/<id> y se sirve tal cual (misma ruta).
const DIR_SITIO = path.join(RAIZ, "sitio");
const PRIVADO = new Set(["server.js", "salas.mjs", "api.mjs", "db.mjs", "package.json", "package-lock.json", ".env", ".env.local"]);

function estatico(req, res, url) {
  let ruta = decodeURIComponent(url.pathname);
  const esJuegos = ruta === "/juegos" || ruta.startsWith("/juegos/");
  const enSitio = ruta === "/" || (!esJuegos && !ruta.startsWith("/src/") && !ruta.startsWith("/node_modules/"));
  let abs;
  if (enSitio) {
    // secciones del sitio como carpetas (/menues): sin barra final se redirige, así los links relativos de adentro resuelven bien
    if (ruta !== "/" && !path.extname(ruta) && !ruta.endsWith("/")) { res.writeHead(301, { Location: ruta + "/" + url.search }); return res.end(); }
    abs = path.normalize(path.join(DIR_SITIO, ruta.endsWith("/") ? ruta + "index.html" : ruta));
    if (!abs.startsWith(DIR_SITIO + path.sep) && abs !== DIR_SITIO) { res.writeHead(403); return res.end("Prohibido"); }
  }
  else {
    if (ruta === "/juegos" || ruta === "/juegos/") ruta = "/juegos/index.html";                               // portada del catálogo
    else if (ruta.startsWith("/juegos/") && ruta.split("/").filter(Boolean).length === 2) ruta += "/index.html";   // /juegos/reino-caido → su index.html
    abs = path.normalize(path.join(RAIZ, ruta));
    if (!abs.startsWith(RAIZ + path.sep) || PRIVADO.has(path.basename(abs))) { res.writeHead(403); return res.end("Prohibido"); }
  }
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end("No encontrado"); }
    const ext = path.extname(abs).toLowerCase();
    const cab = { "Content-Type": MIME[ext] || "application/octet-stream", "Accept-Ranges": "bytes",
      // los modelos no cambian: caché larga; el código y el HTML se revalidan
      "Cache-Control": [".glb", ".fbx", ".wasm", ".webp"].includes(ext) ? "public, max-age=86400" : "no-cache", "Last-Modified": st.mtime.toUTCString() };
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
servidor.listen(PUERTO, () => console.log(`\n  DAXENWORLD  →  http://localhost:${PUERTO}   (juego: /juegos/reino-caido)\n`));
iniciarDB().then(() => { dbLista = true; console.log("  Base de datos lista."); })
  .catch(e => { dbError = e.message; console.error("  ✗ No pude conectar con la base de datos:", e.message, "\n    Revisá DB_HOST / DB_USER / DB_PASSWORD / DB_NAME."); });
