// Cliente de sala (jugador 2 o espectador): no carga el juego; muestra el video del anfitrión, reproduce su audio y, si es jugador,
// manda las teclas por un canal de datos, abre su micrófono y puede crear su personaje con Avaturn en SU PC.

import { abrirSenalizacion } from "./red.js";
import { abrirCreadorAvaturn, cargarPersonajesGuardados } from "./avaturn.js";
import { ROSTER } from "./personajes.js";
import { AYUDA } from "./controles.js";

const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };
const TECLAS_JUEGO = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "Tab"]);

export async function iniciarCliente(sala, soloVer) {
  document.querySelector("#carga")?.classList.add("off"); document.querySelector("#negro")?.classList.add("off");
  document.querySelector("#mundo").style.display = "none";
  const ui = document.querySelector("#ui");
  ui.innerHTML = `
    <div class="cli">
      <video class="cli-video" autoplay playsinline muted></video>
      <div class="cli-barra">
        <b class="cli-estado">Conectando a la sala ${sala}…</b>
        <button class="cli-mic" hidden>🎤 Activar micrófono</button>
        <button class="cli-av" hidden>✚ Crear mi personaje (Avaturn)</button>
        <button class="cli-full">⛶ Pantalla completa</button>
      </div>
      <div class="cli-entrar"><div><h2>Sala ${sala}</h2><p class="cli-rol"></p><button class="cli-ok">Entrar</button></div></div>
      <div class="cli-ayuda" hidden></div>
    </div>`;
  const $ = s => ui.querySelector(s), video = $(".cli-video"), estado = $(".cli-estado");
  ui.style.pointerEvents = "auto";
  const flujo = new MediaStream(); video.srcObject = flujo;
  let dc = null, rol = null, pc = null, transAudio = null, mic = null;

  $(".cli-ok").onclick = () => { video.muted = false; video.play().catch(() => {}); $(".cli-entrar").hidden = true; };
  $(".cli-full").onclick = () => document.documentElement.requestFullscreen?.();

  let ws;
  try { ws = await abrirSenalizacion(); } catch (e) { estado.textContent = e.message; return; }
  ws.onclose = () => { estado.textContent = "Se cortó la conexión con la sala."; };
  ws.onmessage = async ev => {
    const m = JSON.parse(ev.data);
    if (m.t === "error") { estado.textContent = m.msg; }
    else if (m.t === "cerrada") { estado.textContent = "El anfitrión cerró la sala."; pc?.close(); }
    else if (m.t === "unido") {
      rol = m.rol;
      $(".cli-rol").textContent = rol === "jugador" ? "Vas a jugar como JUGADOR 2. Tu micrófono y tus teclas viajan al anfitrión." : "Estás mirando la pelea como espectador.";
      estado.textContent = rol === "jugador" ? "Conectado como JUGADOR 2 — esperando video…" : "Conectado como espectador — esperando video…";
      if (rol === "jugador") {
        $(".cli-mic").hidden = false; $(".cli-av").hidden = false;
        const ay = $(".cli-ayuda"); ay.hidden = false;
        ay.innerHTML = "Controles: " + AYUDA.map(([a, , c]) => `${a}: <b>${c}</b>`).join(" · ") + " · (también A D W S F G H R)";
      }
    } else if (m.t === "de") {
      if (m.datos.sdp) {
        pc = new RTCPeerConnection(ICE);
        pc.onicecandidate = e => { if (e.candidate) ws.send(JSON.stringify({ t: "para", a: "h", datos: { ice: e.candidate } })); };
        pc.ontrack = e => { flujo.addTrack(e.track); if (e.track.kind === "audio") transAudio = e.transceiver; video.play().catch(() => {}); estado.textContent = rol === "jugador" ? "En vivo — sos el JUGADOR 2" : "En vivo"; };
        pc.ondatachannel = e => { dc = e.channel; dc.onopen = enviarPersonajes; };
        pc.onconnectionstatechange = () => { if (pc.connectionState === "failed") estado.textContent = "No se pudo establecer la conexión (¿firewall/red?)."; };
        await pc.setRemoteDescription(m.datos.sdp);
        if (rol === "jugador") pc.getTransceivers().forEach(t => { if (t.receiver.track.kind === "audio") t.direction = "sendrecv"; });
        await pc.setLocalDescription(await pc.createAnswer());
        ws.send(JSON.stringify({ t: "para", a: "h", datos: { sdp: pc.localDescription } }));
      } else if (m.datos.ice && pc) try { await pc.addIceCandidate(m.datos.ice); } catch (e) { /* tardío */ }
    }
  };
  ws.send(JSON.stringify({ t: "unir", sala, ver: soloVer }));

  const enviar = o => { if (dc?.readyState === "open") dc.send(JSON.stringify(o)); };
  function enviarPersonajes() {
    cargarPersonajesGuardados();
    const lista = ROSTER.filter(d => d.custom).map(d => ({ id: d.id, nombre: d.nombre, modelo: d.modelo }));
    if (lista.length) enviar({ t: "personajes", lista });
  }

  // teclas del jugador 2
  addEventListener("keydown", e => { if (rol !== "jugador" || document.querySelector(".modal-av") || e.repeat) return; if (TECLAS_JUEGO.has(e.code)) e.preventDefault(); enviar({ t: "k", c: e.code, d: 1 }); });
  addEventListener("keyup", e => { if (rol !== "jugador" || document.querySelector(".modal-av")) return; enviar({ t: "k", c: e.code, d: 0 }); });
  addEventListener("blur", () => enviar({ t: "reset" }));

  // micrófono
  $(".cli-mic").onclick = async () => {
    const b = $(".cli-mic");
    try {
      if (!mic) {
        mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        await transAudio?.sender.replaceTrack(mic.getAudioTracks()[0]);
      }
      const on = !mic.getAudioTracks()[0].enabled || b.dataset.on !== "1";
      mic.getAudioTracks()[0].enabled = on; b.dataset.on = on ? "1" : "0";
      b.textContent = on ? "🎤 Micrófono ENCENDIDO" : "🔇 Micrófono apagado";
    } catch (e) { estado.textContent = "No pude abrir el micrófono: " + e.message + " (necesita HTTPS o localhost)"; }
  };

  // crear personaje con Avaturn en esta PC y avisar al anfitrión
  $(".cli-av").onclick = async () => {
    const def = await abrirCreadorAvaturn(document.body);
    if (def) { enviar({ t: "personajes", lista: [{ id: def.id, nombre: def.nombre, modelo: def.modelo }] }); estado.textContent = `«${def.nombre}» enviado al anfitrión: elegilo en la selección.`; }
  };
}
