// API REST: cuentas (usuario/clave y Google), avatares (GLB guardado en la base) y torneos.
// Sesión = token aleatorio en localStorage del navegador; en la base sólo se guarda su hash SHA-256.

import crypto from "node:crypto";
import { q, tablaTorneo } from "./db.mjs";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const LIMITE_GLB = 40 * 1024 * 1024;
export const MAX_AVATARES = 5;
const DIAS_SESION = 30;

const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const fallo = (res, code, msg) => json(res, code, { ok: false, msg });

async function cuerpo(req, limite) {
  const trozos = []; let total = 0;
  for await (const c of req) { total += c.length; if (total > limite) { const e = new Error("Archivo demasiado grande"); e.status = 413; throw e; } trozos.push(c); }
  return Buffer.concat(trozos);
}
const cuerpoJSON = async req => { try { return JSON.parse((await cuerpo(req, 64 * 1024)).toString("utf8") || "{}"); } catch (e) { if (e.status) throw e; return {}; } };

/* freno simple contra fuerza bruta: 12 intentos por minuto y por IP en registro/login */
const intentos = new Map();
function frenar(req) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim(), ahora = Date.now();
  const l = (intentos.get(ip) || []).filter(t => ahora - t < 60000); l.push(ahora); intentos.set(ip, l);
  if (intentos.size > 5000) for (const [k, v] of intentos) if (!v.some(t => ahora - t < 60000)) intentos.delete(k);
  return l.length > 12;
}

function hashClave(clave) { const sal = crypto.randomBytes(16); return `s1$${sal.toString("hex")}$${crypto.scryptSync(clave, sal, 32).toString("hex")}`; }
function claveOk(clave, guardada) {
  const [v, sal, h] = String(guardada || "").split("$"); if (v !== "s1" || !h) return false;
  const a = crypto.scryptSync(clave, Buffer.from(sal, "hex"), 32), b = Buffer.from(h, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function abrirSesion(usuarioId) {
  const token = crypto.randomBytes(32).toString("hex");
  await q("INSERT INTO sesiones (token_hash, usuario_id, expira) VALUES (?, ?, NOW() + make_interval(days => ?::int))", [sha(token), usuarioId, DIAS_SESION]);
  return token;
}
export async function usuarioDeToken(token) {
  if (!token) return null;
  const f = await q("SELECT u.id, u.nombre, u.usuario, u.email, u.foto FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token_hash = ? AND s.expira > NOW()", [sha(String(token))]);
  return f[0] || null;
}
const tokenDe = req => (/^Bearer (\S+)$/.exec(req.headers.authorization || "") || [])[1];
const perfil = u => ({ id: u.id, nombre: u.nombre, usuario: u.usuario, email: u.email, foto: u.foto });

/** Verifica el ID token de Google con su propio endpoint (comprueba firma, vencimiento y que sea de NUESTRA app). */
async function verificarGoogle(credential) {
  const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential));
  if (!r.ok) throw new Error("Google rechazó la credencial");
  const d = await r.json();
  if (d.aud !== GOOGLE_CLIENT_ID) throw new Error("La credencial no es para esta aplicación");
  if (!["accounts.google.com", "https://accounts.google.com"].includes(d.iss)) throw new Error("Emisor inválido");
  if (d.email_verified !== "true" && d.email_verified !== true) throw new Error("El correo de Google no está verificado");
  return d;
}

const CODIGOS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const codigoNuevo = () => Array.from({ length: 5 }, () => CODIGOS[crypto.randomInt(CODIGOS.length)]).join("");

export async function api(req, res, url) {
  const p = url.pathname.split("/").filter(Boolean).slice(1);        // ["avatares", "12"]
  const m = req.method;
  try {
    if (p[0] === "config" && m === "GET") return json(res, 200, { ok: true, google: GOOGLE_CLIENT_ID || null, avaturn: process.env.AVATURN_SUBDOMAIN || "musicverse" });

    /* ---------------------------------------------------------------- cuentas */
    if (p[0] === "registro" && m === "POST") {
      if (frenar(req)) return fallo(res, 429, "Demasiados intentos, esperá un minuto");
      const b = await cuerpoJSON(req), usuario = String(b.usuario || "").trim(), clave = String(b.clave || "");
      if (!/^[A-Za-z0-9_]{3,20}$/.test(usuario)) return fallo(res, 400, "El usuario debe tener 3 a 20 letras, números o _");
      if (clave.length < 6) return fallo(res, 400, "La clave debe tener al menos 6 caracteres");
      if ((await q("SELECT id FROM usuarios WHERE usuario = ?", [usuario])).length) return fallo(res, 409, "Ese usuario ya existe");
      const [{ id }] = await q("INSERT INTO usuarios (usuario, nombre, clave_hash) VALUES (?, ?, ?) RETURNING id", [usuario, usuario, hashClave(clave)]);
      const token = await abrirSesion(id);
      return json(res, 200, { ok: true, token, usuario: perfil({ id, nombre: usuario, usuario, email: null, foto: null }) });
    }
    if (p[0] === "login" && m === "POST") {
      if (frenar(req)) return fallo(res, 429, "Demasiados intentos, esperá un minuto");
      const b = await cuerpoJSON(req);
      const f = (await q("SELECT * FROM usuarios WHERE usuario = ?", [String(b.usuario || "").trim()]))[0];
      if (!f || !claveOk(String(b.clave || ""), f.clave_hash)) return fallo(res, 401, "Usuario o clave incorrectos");
      return json(res, 200, { ok: true, token: await abrirSesion(f.id), usuario: perfil(f) });
    }
    if (p[0] === "google" && m === "POST") {
      if (!GOOGLE_CLIENT_ID) return fallo(res, 501, "El login con Google no está configurado en este servidor");
      if (frenar(req)) return fallo(res, 429, "Demasiados intentos, esperá un minuto");
      const g = await verificarGoogle(String((await cuerpoJSON(req)).credential || ""));
      let f = (await q("SELECT * FROM usuarios WHERE google_sub = ? OR email = ?", [g.sub, g.email]))[0];
      const nombre = String(g.given_name || g.name || g.email.split("@")[0]).slice(0, 40);
      if (!f) { const [{ id }] = await q("INSERT INTO usuarios (nombre, email, google_sub, foto) VALUES (?, ?, ?, ?) RETURNING id", [nombre, g.email, g.sub, g.picture || null]); f = { id, nombre, usuario: null, email: g.email, foto: g.picture || null }; }
      else if (!f.google_sub) await q("UPDATE usuarios SET google_sub = ?, foto = COALESCE(foto, ?) WHERE id = ?", [g.sub, g.picture || null, f.id]);
      return json(res, 200, { ok: true, token: await abrirSesion(f.id), usuario: perfil(f) });
    }
    if (p[0] === "logout" && m === "POST") { const t = tokenDe(req); if (t) await q("DELETE FROM sesiones WHERE token_hash = ?", [sha(t)]); return json(res, 200, { ok: true }); }

    /* públicos: el GLB de un avatar (lo piden todos los navegadores de la sala) y la tabla de un torneo */
    if (p[0] === "avatar" && m === "GET") {
      const id = parseInt(p[1], 10);
      const f = (await q("SELECT glb, tam FROM avatares WHERE id = ?", [id]))[0];
      if (!f) { res.writeHead(404); return res.end("No existe"); }
      res.writeHead(200, { "Content-Type": "model/gltf-binary", "Content-Length": f.tam, "Cache-Control": "public, max-age=31536000, immutable" });
      return res.end(f.glb);
    }
    if (p[0] === "torneos" && p[1] && m === "GET") {
      const t = (await q("SELECT t.*, u.nombre AS creador FROM torneos t JOIN usuarios u ON u.id = t.creador_id WHERE t.codigo = ?", [String(p[1]).toUpperCase()]))[0];
      if (!t) return fallo(res, 404, "No existe ese torneo");
      const peleas = await q(`SELECT p.id, p.creado, g.nombre AS ganador, l.nombre AS perdedor, p.rondas_ganador, p.rondas_perdedor
        FROM peleas p JOIN usuarios g ON g.id = p.ganador_id JOIN usuarios l ON l.id = p.perdedor_id WHERE p.torneo_id = ? ORDER BY p.id DESC LIMIT 15`, [t.id]);
      const jugadas = (await q("SELECT COUNT(*)::int n FROM peleas WHERE torneo_id = ?", [t.id]))[0].n;
      const tabla = await tablaTorneo(t.id);
      return json(res, 200, { ok: true, torneo: { codigo: t.codigo, nombre: t.nombre, creador: t.creador, total: t.total_peleas, jugadas, estado: t.estado, campeon: t.campeon_id ? tabla.find(x => x.id === t.campeon_id)?.nombre || null : null }, tabla, peleas });
    }
    if (p[0] === "ranking" && m === "GET") {
      return json(res, 200, { ok: true, ranking: await q(`
        SELECT u.id, u.nombre, u.foto, SUM((p.ganador_id = u.id)::int) AS victorias, SUM((p.perdedor_id = u.id)::int) AS derrotas,
               (SELECT COUNT(*)::int FROM torneos t WHERE t.campeon_id = u.id) AS titulos
        FROM usuarios u JOIN peleas p ON u.id IN (p.ganador_id, p.perdedor_id)
        GROUP BY u.id, u.nombre, u.foto ORDER BY victorias DESC, derrotas ASC LIMIT 50`) });
    }

    /* ---------------------------------------------------------------- lo que exige sesión */
    const yo = await usuarioDeToken(tokenDe(req));
    if (p[0] === "yo" && m === "GET") return yo ? json(res, 200, { ok: true, usuario: perfil(yo) }) : fallo(res, 401, "Sin sesión");
    if (!yo) return fallo(res, 401, "Iniciá sesión");

    if (p[0] === "avatares") {
      if (m === "GET") return json(res, 200, { ok: true, avatares: await q("SELECT id, nombre, tam FROM avatares WHERE usuario_id = ? ORDER BY id", [yo.id]), max: MAX_AVATARES });
      if (m === "POST") {
        const nombre = String(url.searchParams.get("nombre") || "HEROE").replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 12).toUpperCase() || "HEROE";
        if ((await q("SELECT COUNT(*)::int n FROM avatares WHERE usuario_id = ?", [yo.id]))[0].n >= MAX_AVATARES) return fallo(res, 400, `Ya tenés ${MAX_AVATARES} avatares: borrá alguno para crear otro`);
        const datos = await cuerpo(req, LIMITE_GLB);
        if (datos.length < 12 || datos.toString("latin1", 0, 4) !== "glTF") return fallo(res, 400, "No es un GLB válido");
        const [{ id }] = await q("INSERT INTO avatares (usuario_id, nombre, glb, tam) VALUES (?, ?, ?, ?) RETURNING id", [yo.id, nombre, datos, datos.length]);
        return json(res, 200, { ok: true, id, nombre });
      }
      if (m === "DELETE" && p[1]) { await q("DELETE FROM avatares WHERE id = ? AND usuario_id = ?", [parseInt(p[1], 10), yo.id]); return json(res, 200, { ok: true }); }
    }

    if (p[0] === "torneos" && m === "POST" && !p[1]) {
      const b = await cuerpoJSON(req);
      const nombre = String(b.nombre || "").trim().slice(0, 60) || `Torneo de ${yo.nombre}`, total = Math.max(1, Math.min(200, parseInt(b.peleas, 10) || 10));
      for (let i = 0; i < 8; i++) {
        const codigo = codigoNuevo();
        try { await q("INSERT INTO torneos (codigo, nombre, creador_id, total_peleas) VALUES (?, ?, ?, ?)", [codigo, nombre, yo.id, total]); return json(res, 200, { ok: true, codigo, nombre, total }); }
        catch (e) { if (e.code !== "23505") throw e; }                 // 23505 = unique_violation (Postgres): el código ya existía, se prueba con otro
      }
      return fallo(res, 500, "No pude generar un código de torneo");
    }
    if (p[0] === "mis-torneos" && m === "GET") {
      return json(res, 200, { ok: true, torneos: await q(`SELECT t.codigo, t.nombre, t.total_peleas AS total, t.estado, t.creador_id = ? AS soy_creador,
        (SELECT COUNT(*)::int FROM peleas WHERE torneo_id = t.id) AS jugadas
        FROM torneos t WHERE t.creador_id = ? OR t.id IN (SELECT torneo_id FROM peleas WHERE ganador_id = ? OR perdedor_id = ?)
        ORDER BY t.id DESC LIMIT 30`, [yo.id, yo.id, yo.id, yo.id]) });
    }
    fallo(res, 404, "Ruta de API desconocida");
  } catch (e) {
    console.error("[api]", e.message);
    fallo(res, e.status || 500, e.status ? e.message : "Error del servidor: " + e.message);
  }
}
