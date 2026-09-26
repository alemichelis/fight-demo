// Salas de torneo en vivo. Una sala = un torneo (mismo código). Cada sala es independiente: cientos de grupos pueden jugar a la vez.
//
// El navegador del ANFITRIÓN corre el juego y lo transmite por WebRTC; el servidor sólo:
//   · hace de señalizador WebRTC (ofertas/candidatos),
//   · decide quién es campeón / retador y abre la ventana de 1 minuto entre peleas,
//   · guarda cada resultado y cierra el torneo en MySQL.
//
// Estados: esperando (aún no hubo peleas) → peleando → ventana (60 s para que entre un retador) → pausa (nadie entró)
//          → peleando … → fin (se llegó al número de peleas, o el anfitrión lo terminó).
//
// Mensajes (JSON por WebSocket):
//   anfitrión → crear {token, codigo, avatarId} · resultado {ganador:"campeon"|"retador", rondas:[g,p]} · mas_tiempo · terminar · desafiar {avatarId}
//   invitado  → unir {sala, token?} · desafiar {avatarId}
//   ambos     → para {a, datos}  (señalización WebRTC)
//   servidor  → sala · unido · estado · pelea · llego · salio · de · fin · cerrada · error

import { WebSocketServer } from "ws";
import { q, tablaTorneo } from "./db.mjs";
import { usuarioDeToken } from "./api.mjs";

const MAX_ESPECTADORES = 14;
const VENTANA_MS = 60_000;
const salas = new Map();

const enviar = (ws, o) => { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); } catch (e) { /* cliente cerrado */ } };
const idPeer = () => "c" + Math.random().toString(36).slice(2, 8);

const luchador = (uid, nombre, avatarId, ctrl) => ({ uid, nombre, avatarId, ctrl });
const pub = l => l && { uid: l.uid, nombre: l.nombre, avatarId: l.avatarId, ctrl: l.ctrl };

function difundir(s, o) { enviar(s.host, o); for (const c of s.peers.values()) enviar(c.ws, o); }
function estado(s) {
  return { t: "estado", estado: s.estado, campeon: pub(s.campeon), retador: pub(s.retador), restanteMs: s.estado === "ventana" ? Math.max(0, s.ventanaHasta - Date.now()) : 0,
    jugadas: s.jugadas, total: s.total, nombre: s.nombre, espectadores: s.peers.size, hostNombre: s.hostNombre };
}
const anunciar = s => difundir(s, estado(s));

function abrirVentana(s) {
  clearTimeout(s.timer);
  s.estado = "ventana"; s.ventanaHasta = Date.now() + VENTANA_MS;
  s.timer = setTimeout(() => { if (s.estado === "ventana") { s.estado = "pausa"; anunciar(s); } }, VENTANA_MS);
  anunciar(s);
}

async function cerrarTorneo(s) {
  clearTimeout(s.timer);
  const tabla = await tablaTorneo(s.torneoId);
  const campeon = tabla[0] || null;                                    // más victorias; luego menos derrotas; luego quien llegó antes
  await q("UPDATE torneos SET estado = 'terminado', campeon_id = ?, terminado_en = NOW() WHERE id = ?", [campeon ? campeon.id : null, s.torneoId]);
  s.estado = "fin"; s.retador = null;
  difundir(s, { ...estado(s), t: "fin", tabla, campeonFinal: campeon && { id: campeon.id, nombre: campeon.nombre, victorias: Number(campeon.victorias) } });
}

async function avatarDe(uid, avatarId) {
  const f = (await q("SELECT id FROM avatares WHERE id = ? AND usuario_id = ?", [parseInt(avatarId, 10) || 0, uid]))[0];
  return f ? f.id : null;
}

export function adjuntarSalas(servidor) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  servidor.on("upgrade", (req, socket, head) => {
    if (!req.url.startsWith("/ws")) return socket.destroy();
    wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws));
  });

  wss.on("connection", ws => {
    let sala = null, id = null, yo = null;                              // yo = usuario (o null si sólo mira)
    ws.isAlive = true; ws.on("pong", () => { ws.isAlive = true; });

    const soyHost = () => sala && id === "h";

    async function alMensaje(m) {
      /* ---------------------------------------------- el anfitrión abre la arena de SU torneo */
      if (m.t === "crear" && !sala) {
        const u = await usuarioDeToken(m.token); if (!u) return enviar(ws, { t: "error", msg: "Iniciá sesión para abrir la arena." });
        const codigo = String(m.codigo || "").toUpperCase();
        const t = (await q("SELECT * FROM torneos WHERE codigo = ?", [codigo]))[0];
        if (!t || t.creador_id !== u.id) return enviar(ws, { t: "error", msg: "Ese torneo no existe o no es tuyo." });
        if (t.estado === "terminado") return enviar(ws, { t: "error", msg: "Ese torneo ya terminó." });
        if (salas.has(codigo)) return enviar(ws, { t: "error", msg: "Este torneo ya tiene una arena abierta (¿otra pestaña?)." });
        const av = await avatarDe(u.id, m.avatarId); if (!av) return enviar(ws, { t: "error", msg: "Elegí uno de tus avatares para pelear." });
        const jugadas = (await q("SELECT COUNT(*) n FROM peleas WHERE torneo_id = ?", [t.id]))[0].n;
        yo = u; id = "h";
        sala = { codigo, torneoId: t.id, nombre: t.nombre, total: t.total_peleas, jugadas, host: ws, hostUid: u.id, hostNombre: u.nombre, peers: new Map(),
          estado: "esperando", campeon: luchador(u.id, u.nombre, av, "h"), retador: null, ventanaHasta: 0, timer: null };
        salas.set(codigo, sala);
        enviar(ws, { t: "sala", sala: codigo, id: "h", yo: { id: u.id, nombre: u.nombre } });
        return anunciar(sala);
      }

      /* ---------------------------------------------- un amigo entra a mirar (y luego a desafiar) */
      if (m.t === "unir" && !sala) {
        const s = salas.get(String(m.sala || "").toUpperCase());
        if (!s) return enviar(ws, { t: "error", msg: "La arena de ese torneo no está abierta ahora." });
        if (s.peers.size >= MAX_ESPECTADORES) return enviar(ws, { t: "error", msg: "La sala está llena." });
        yo = m.token ? await usuarioDeToken(m.token) : null;
        id = idPeer(); sala = s; s.peers.set(id, { ws, uid: yo ? yo.id : null, nombre: yo ? yo.nombre : "Invitado" });
        enviar(ws, { t: "unido", id, yo: yo ? { id: yo.id, nombre: yo.nombre } : null });
        enviar(s.host, { t: "llego", id, nombre: yo ? yo.nombre : "Invitado" });
        return enviar(ws, estado(s));
      }
      if (!sala) return;

      /* ---------------------------------------------- WebRTC */
      if (m.t === "para") {
        const destino = m.a === "h" ? sala.host : sala.peers.get(m.a)?.ws;
        return enviar(destino, { t: "de", de: id, datos: m.datos });
      }

      /* ---------------------------------------------- desafiar: el primero que llega en la ventana pelea */
      if (m.t === "desafiar") {
        if (!yo) return enviar(ws, { t: "error", msg: "Iniciá sesión para desafiar." });
        if (!["esperando", "ventana", "pausa"].includes(sala.estado) || sala.retador) return enviar(ws, { t: "error", msg: "Ahora no se puede entrar a pelear." });
        if (sala.campeon && sala.campeon.uid === yo.id) return enviar(ws, { t: "error", msg: "Ya sos el campeón: esperá a un rival." });
        const av = await avatarDe(yo.id, m.avatarId); if (!av) return enviar(ws, { t: "error", msg: "Elegí uno de tus avatares." });
        if (sala.retador || !["esperando", "ventana", "pausa"].includes(sala.estado)) return enviar(ws, { t: "error", msg: "Otro amigo entró primero." });   // carrera entre dos clics
        clearTimeout(sala.timer);
        sala.retador = luchador(yo.id, yo.nombre, av, id); sala.estado = "peleando";
        enviar(sala.host, { t: "pelea", campeon: pub(sala.campeon), retador: pub(sala.retador) });
        return anunciar(sala);
      }

      /* ---------------------------------------------- lo que sólo puede el anfitrión */
      if (!soyHost()) return;

      if (m.t === "resultado" && sala.estado === "peleando" && sala.retador) {
        const gana = m.ganador === "retador" ? sala.retador : sala.campeon, pierde = gana === sala.campeon ? sala.retador : sala.campeon;
        const rg = Math.max(0, Math.min(3, (m.rondas && m.rondas[0]) | 0)), rp = Math.max(0, Math.min(3, (m.rondas && m.rondas[1]) | 0));
        await q("INSERT INTO peleas (torneo_id, ganador_id, perdedor_id, ganador_avatar_id, perdedor_avatar_id, rondas_ganador, rondas_perdedor) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [sala.torneoId, gana.uid, pierde.uid, gana.avatarId, pierde.avatarId, rg, rp]);
        sala.jugadas++; sala.campeon = gana; sala.retador = null;
        if (sala.jugadas >= sala.total) return cerrarTorneo(sala);
        return abrirVentana(sala);
      }
      if (m.t === "cancelar_pelea" && sala.estado === "peleando") {          // se cayó un peleador: no cuenta, vuelve la ventana
        sala.retador = null; return abrirVentana(sala);
      }
      if (m.t === "mas_tiempo" && sala.estado === "pausa") return abrirVentana(sala);
      if (m.t === "terminar" && sala.estado !== "fin") return cerrarTorneo(sala);
    }

    ws.on("message", buf => {
      let m; try { m = JSON.parse(buf.toString()); } catch (e) { return; }
      alMensaje(m).catch(e => { console.error("[salas]", e.message); enviar(ws, { t: "error", msg: "Error del servidor: " + e.message }); });
    });

    ws.on("close", () => {
      if (!sala) return;
      if (id === "h") {
        clearTimeout(sala.timer);
        for (const c of sala.peers.values()) enviar(c.ws, { t: "cerrada" });
        salas.delete(sala.codigo); return;
      }
      sala.peers.delete(id); enviar(sala.host, { t: "salio", id });
      // si se fue el retador en plena pelea, el anfitrión aborta; si se fue el campeón (no anfitrión) vuelve a ser campeón el anfitrión
      if (sala.retador && sala.retador.ctrl === id) { enviar(sala.host, { t: "cancelar_pelea" }); if (sala.estado === "peleando") { sala.retador = null; abrirVentana(sala); } }
      else if (sala.campeon && sala.campeon.ctrl === id) {
        const s = sala;
        (async () => {
          const av = (await q("SELECT id FROM avatares WHERE usuario_id = ? ORDER BY id LIMIT 1", [s.hostUid]))[0];
          s.campeon = luchador(s.hostUid, s.hostNombre, av ? av.id : null, "h");
          if (s.estado === "peleando") { s.retador = null; enviar(s.host, { t: "cancelar_pelea" }); abrirVentana(s); } else anunciar(s);
        })().catch(() => {});
      } else anunciar(sala);
    });
  });

  setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch (e) { /* ya cerrado */ } } }, 20000).unref();
}
