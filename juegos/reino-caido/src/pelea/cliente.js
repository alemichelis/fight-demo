// Cliente de sala (cualquier amigo): no carga el motor 3D. Ve el video del anfitrión, oye el audio y, cuando abre la ventana entre
// peleas, elige un avatar suyo y desafía. Si le toca pelear, sus teclas viajan al anfitrión y puede abrir su micrófono para hablar.

import { abrirSenalizacion } from "./red.js";
import { abrirCreadorAvaturn } from "./avaturn.js";
import { AYUDA } from "./controles.js";
import { usuarioActual, formularioAcceso, token, pedir } from "./sesion.js";

const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };
const TECLAS_JUEGO = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "Tab"]);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

export async function iniciarCliente(codigo) {
  document.querySelector("#carga")?.classList.add("off"); document.querySelector("#negro")?.classList.add("off");
  document.querySelector("#mundo").style.display = "none";
  const ui = document.querySelector("#ui"); ui.style.pointerEvents = "auto"; document.body.classList.add("modo-menu");

  let yo = await usuarioActual();
  if (!yo) {
    ui.innerHTML = `<div class="mn"><header class="mn-cab"><div><div class="kicker">Sala ${esc(codigo)}</div><h1>Reino Caído</h1></div></header>
      <main class="mn-centro"><div class="mn-caja"><div class="mn-form"></div><button class="mn-mirar">Sólo mirar, sin cuenta</button></div></main></div>`;
    yo = await Promise.race([
      formularioAcceso(ui.querySelector(".mn-form"), { titulo: "Entrá para desafiar" }),
      new Promise(r => { ui.querySelector(".mn-mirar").onclick = () => r(null); })
    ]);
  }

  ui.innerHTML = `
    <div class="cli">
      <video class="cli-video" autoplay playsinline muted></video>
      <div class="cli-barra">
        <div class="cli-est"><b class="cli-estado">Conectando a la sala ${esc(codigo)}…</b></div>
        <button class="cli-mic" hidden>🎤 Micrófono</button>
        <button class="cli-tabla">🏆 Posiciones</button>
        <button class="cli-full">⛶</button>
      </div>
      <div class="cli-cta" hidden></div>
      <div class="cli-entrar"><div><h2>Sala ${esc(codigo)}</h2><p class="cli-rol"></p><button class="cli-ok">Entrar</button></div></div>
      <div class="cli-panel" hidden></div>
      <div class="cli-ayuda" hidden></div>
    </div>`;
  const $ = s => ui.querySelector(s), video = $(".cli-video"), estado = $(".cli-estado");
  const flujo = new MediaStream(); video.srcObject = flujo;
  let dc = null, id = null, pc = null, transAudio = null, mic = null, snap = null, recibido = 0, avatares = [], avatarSel = null, peleando = false;
  window.__cli = { cerrarWS: () => ws?.close() };            // ayuda para depurar cortes de conexión desde la consola

  $(".cli-rol").textContent = yo ? `Entrás como ${yo.nombre}. Cuando termine una pelea vas a poder desafiar al campeón.` : "Estás mirando como invitado.";
  $(".cli-ok").onclick = () => { video.muted = false; video.play().catch(() => {}); $(".cli-entrar").hidden = true; };
  $(".cli-full").onclick = () => document.documentElement.requestFullscreen?.();

  if (yo) { try { avatares = (await pedir("/api/avatares")).avatares; avatarSel = avatares[0]?.id ?? null; } catch (e) { /* sigue como invitado */ } }

  /* ---------------------------------------------------------------- posiciones */
  async function panel() {
    const p = $(".cli-panel"); p.hidden = !p.hidden; if (p.hidden) return;
    p.innerHTML = "Cargando…";
    try {
      const d = await pedir(`/api/torneos/${codigo}`);
      p.innerHTML = `<h3>${esc(d.torneo.nombre)} · ${d.torneo.jugadas}/${d.torneo.total}</h3><div class="mn-tabla">` +
        d.tabla.map((f, i) => `<div class="mn-fila"><span>${i + 1}. ${esc(f.nombre)}</span><em>${f.victorias}V</em><em>${f.derrotas}D</em></div>`).join("") + `</div>`
        + (d.tabla.length ? "" : "<p class='mn-nota'>Todavía no hubo peleas.</p>");
    } catch (e) { p.textContent = e.message; }
  }
  $(".cli-tabla").onclick = panel;

  /* ---------------------------------------------------------------- estado del torneo */
  function pintar() {
    if (!snap) return;
    const cta = $(".cli-cta"), s = snap, cam = s.campeon, yoLuch = !!id && ((cam && cam.ctrl === id) || (s.retador && s.retador.ctrl === id));
    peleando = s.estado === "peleando" && yoLuch;
    const txt = {
      esperando: `Esperando al primer rival · ${esc(cam?.nombre)} en la arena`,
      ventana: `🏆 ${esc(cam?.nombre)} sigue en pie`,
      pausa: `Nadie entró a tiempo · campeón: ${esc(cam?.nombre)}`,
      peleando: `${esc(cam?.nombre)} vs ${esc(s.retador?.nombre)}${yoLuch ? " — ¡PELEÁS VOS!" : ""}`,
      fin: "El torneo terminó"
    }[s.estado] || "";
    estado.innerHTML = `${txt} <small>(${s.jugadas}/${s.total})</small>`;
    const abierta = ["esperando", "ventana", "pausa"].includes(s.estado);
    // el botón grande y centrado: lo que realmente importa se ve de entrada, no escondido en la barra de arriba
    let h = "";
    if (abierta && yo && cam && cam.uid !== yo.id) {
      h = avatares.length
        ? `<b class="cli-cta-cuenta"></b><p class="cli-cta-txt">¿Te animás contra <b>${esc(cam.nombre)}</b>?</p>
           <select class="cli-av">${avatares.map(a => `<option value="${a.id}" ${a.id === avatarSel ? "selected" : ""}>${esc(a.nombre)}</option>`).join("")}</select>
           <button class="cli-des">⚔ DESAFIAR</button>`
        : `<p class="cli-cta-txt">Para pelear necesitás tu propio avatar.</p><button class="cli-crear">✚ Crear mi avatar</button>`;
    } else if (abierta && !yo) h = `<p class="cli-cta-txt">Iniciá sesión para desafiar a <b>${esc(cam?.nombre)}</b></p><a class="cli-login" href="/juegos/reino-caido/?t=${esc(codigo)}">Iniciar sesión</a>`;
    else if (abierta && cam && yo && cam.uid === yo.id) h = `<p class="cli-cta-txt cli-tu">🏆 Sos el campeón — esperá a que alguien te desafíe</p>`;
    cta.hidden = !h;
    if (cta.dataset.h !== h) {
      cta.innerHTML = h; cta.dataset.h = h;
      cta.querySelector(".cli-av")?.addEventListener("change", e => { avatarSel = parseInt(e.target.value, 10); });
      cta.querySelector(".cli-des")?.addEventListener("click", () => enviar({ t: "desafiar", avatarId: avatarSel }, true));
      cta.querySelector(".cli-crear")?.addEventListener("click", async () => {
        const r = await abrirCreadorAvaturn(document.body, { sugerido: yo.nombre.toUpperCase().slice(0, 12) });
        if (r) { avatares = (await pedir("/api/avatares")).avatares; avatarSel = r.id; cta.dataset.h = ""; pintar(); }
      });
    }
    const ay = $(".cli-ayuda"); ay.hidden = !peleando;
    if (peleando) ay.innerHTML = "Controles: " + AYUDA.map(([a, b, c]) => `${a}: <b>${b}</b> o <b>${c}</b>`).join(" · ");
    $(".cli-mic").hidden = !yo;
    $(".cli-mic").classList.toggle("urge", peleando && !mic);
    if (s.estado === "fin") mostrarFin(s);
  }
  function mostrarFin(s) {
    const p = $(".cli-panel"); p.hidden = false; const f = s.campeonFinal;
    p.innerHTML = `<h3>🏆 ${f ? esc(f.nombre) : "Sin campeón"}</h3><p>${f ? `Campeón del torneo con ${f.victorias} victoria${f.victorias === 1 ? "" : "s"}` : "El torneo terminó."}</p><div class="mn-tabla">` +
      (s.tabla || []).map((x, i) => `<div class="mn-fila"><span>${i + 1}. ${esc(x.nombre)}</span><em>${x.victorias}V</em><em>${x.derrotas}D</em></div>`).join("") + `</div><p><a href="/">Volver al menú</a></p>`;
  }
  setInterval(() => { const c = $(".cli-cta-cuenta"); if (c) c.textContent = snap?.estado === "ventana" ? mmss(snap.restanteMs - (performance.now() - recibido)) : ""; }, 250);

  /* ---------------------------------------------------------------- conexión (con reconexión automática: algunos hostings
     cortan solos una conexión inactiva; sin esto, un botón podía quedar «muerto» hasta recargar la página) */
  let ws, cerradaDefinitiva = false;
  const enviar = (o, viaWS) => {
    try { if (viaWS) ws?.send(JSON.stringify(o)); else if (dc?.readyState === "open") dc.send(JSON.stringify(o)); }
    catch (e) { /* la conexión se cortó justo ahora: la reconexión de abajo la retoma sola */ }
  };
  async function conectar(intento = 1) {
    try { ws = await abrirSenalizacion(); } catch (e) { estado.textContent = e.message; return; }
    ws.onclose = () => { if (!cerradaDefinitiva) { estado.textContent = "Se cortó la conexión: reconectando…"; setTimeout(() => conectar(intento + 1), Math.min(1000 * intento, 8000)); } };
    ws.onmessage = async ev => {
      const m = JSON.parse(ev.data);
      if (m.t === "error") estado.textContent = m.msg;
      else if (m.t === "cerrada") { cerradaDefinitiva = true; estado.textContent = "El anfitrión cerró la arena."; pc?.close(); }
      else if (m.t === "unido") { id = m.id; if (!snap) estado.textContent = "Conectado — esperando video…"; }
      else if (m.t === "estado" || m.t === "fin") { snap = m; recibido = performance.now(); pintar(); }
      else if (m.t === "de") {
        if (m.datos.sdp) {
          pc = new RTCPeerConnection(ICE);
          pc.onicecandidate = e => { if (e.candidate) enviar({ t: "para", a: "h", datos: { ice: e.candidate } }, true); };
          pc.ontrack = e => { flujo.addTrack(e.track); if (e.track.kind === "audio") transAudio = e.transceiver; video.play().catch(() => {}); };
          pc.ondatachannel = e => { dc = e.channel; };
          pc.onconnectionstatechange = () => { if (pc.connectionState === "failed") estado.textContent = "No se pudo establecer el video (¿firewall o red restringida?)."; };
          await pc.setRemoteDescription(m.datos.sdp);
          await pc.setLocalDescription(await pc.createAnswer());
          enviar({ t: "para", a: "h", datos: { sdp: pc.localDescription } }, true);
        } else if (m.datos.ice && pc) try { await pc.addIceCandidate(m.datos.ice); } catch (e) { /* tardío */ }
      }
    };
    enviar({ t: "unir", sala: codigo, token: token() }, true);
  }
  await conectar();

  /* ---------------------------------------------------------------- teclas y micrófono (sólo si peleo) */
  const modal = () => document.querySelector(".modal-av");
  addEventListener("keydown", e => { if (!peleando || modal() || e.repeat) return; if (TECLAS_JUEGO.has(e.code)) e.preventDefault(); enviar({ t: "k", c: e.code, d: 1 }); });
  addEventListener("keyup", e => { if (!peleando || modal()) return; enviar({ t: "k", c: e.code, d: 0 }); });
  addEventListener("blur", () => enviar({ t: "reset" }));

  $(".cli-mic").onclick = async () => {
    const b = $(".cli-mic");
    try {
      if (!mic) {
        mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        await transAudio?.sender.replaceTrack(mic.getAudioTracks()[0]);
        mic.getAudioTracks()[0].enabled = true; b.dataset.on = "1";
      } else { const on = b.dataset.on !== "1"; mic.getAudioTracks()[0].enabled = on; b.dataset.on = on ? "1" : "0"; }
      b.textContent = b.dataset.on === "1" ? "🎤 Micrófono ENCENDIDO" : "🔇 Micrófono apagado"; b.classList.remove("urge");
    } catch (e) { estado.textContent = "No pude abrir el micrófono: " + e.message + " (hace falta HTTPS)"; }
  };
}
