// Salas de pelea online: sólo SEÑALIZACIÓN (WebSocket en /ws). El video, el audio y los controles viajan directo entre
// navegadores por WebRTC; acá únicamente se intercambian ofertas/respuestas/candidatos ICE.
//
//   anfitrión → {t:"crear"}                       ← {t:"sala", sala:"K7QF"}
//   invitado  → {t:"unir", sala, ver:bool}        ← {t:"unido", id, rol:"jugador"|"espectador"}   (y el anfitrión recibe {t:"llego", id, rol})
//   cualquiera → {t:"para", a:id, datos}          → el destino recibe {t:"de", de:id, datos}       (los invitados sólo le escriben al anfitrión: a:"h")
//
// Una sala tiene 1 anfitrión (jugador 1), hasta 1 jugador invitado (jugador 2) y espectadores (límite para no saturar el upstream).

import { WebSocketServer } from "ws";

const MAX_ESPECTADORES = 12;
const salas = new Map();

const codigo = () => { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let c; do { c = Array.from({ length: 4 }, () => A[(Math.random() * A.length) | 0]).join(""); } while (salas.has(c)); return c; };
const enviar = (ws, o) => { try { if (ws.readyState === 1) ws.send(JSON.stringify(o)); } catch (e) { /* cliente cerrado */ } };

export function adjuntarSalas(servidor) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  servidor.on("upgrade", (req, socket, head) => {
    if (!req.url.startsWith("/ws")) return socket.destroy();
    wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws));
  });

  wss.on("connection", ws => {
    let sala = null, id = null, rol = null;
    ws.isAlive = true; ws.on("pong", () => { ws.isAlive = true; });

    ws.on("message", buf => {
      let m; try { m = JSON.parse(buf.toString()); } catch (e) { return; }
      if (m.t === "crear" && !sala) {
        const c = codigo(); sala = { c, host: ws, clientes: new Map(), jugador: null }; salas.set(c, sala); id = "h"; rol = "anfitrion";
        return enviar(ws, { t: "sala", sala: c, id });
      }
      if (m.t === "unir" && !sala) {
        const s = salas.get(String(m.sala || "").toUpperCase());
        if (!s) return enviar(ws, { t: "error", msg: "La sala no existe o ya se cerró." });
        const espectadores = [...s.clientes.values()].filter(c => c.rol === "espectador").length;
        rol = !m.ver && !s.jugador ? "jugador" : "espectador";
        if (rol === "espectador" && espectadores >= MAX_ESPECTADORES) return enviar(ws, { t: "error", msg: "La sala está llena de espectadores." });
        id = "c" + Math.random().toString(36).slice(2, 8); sala = s; s.clientes.set(id, { ws, rol }); if (rol === "jugador") s.jugador = id;
        enviar(ws, { t: "unido", id, rol });
        return enviar(s.host, { t: "llego", id, rol });
      }
      if (m.t === "para" && sala) {
        const destino = m.a === "h" ? sala.host : sala.clientes.get(m.a)?.ws;
        if (destino) enviar(destino, { t: "de", de: id, datos: m.datos });
      }
    });

    ws.on("close", () => {
      if (!sala) return;
      if (rol === "anfitrion") { for (const c of sala.clientes.values()) enviar(c.ws, { t: "cerrada" }); salas.delete(sala.c); }
      else { sala.clientes.delete(id); if (sala.jugador === id) sala.jugador = null; enviar(sala.host, { t: "salio", id, rol }); }
    });
  });

  // latido: se cierran las conexiones muertas
  setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch (e) { /* ya cerrado */ } } }, 20000).unref();
}
