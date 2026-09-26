// Pelea online: el anfitrión (jugador 1) corre TODO el juego y lo transmite por WebRTC; el jugador 2 y los espectadores ven ese
// video y oyen su audio. El jugador 2 además manda sus teclas por un canal de datos y su micrófono por audio.
// El servidor (salas.mjs) sólo hace de señalizador; nada del juego pasa por él.
//
//   audio hacia espectadores = juego + micrófono anfitrión + micrófono jugador 2
//   audio hacia el jugador 2 = juego + micrófono anfitrión            (sin su propia voz: evitaría el eco)

const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };

export function abrirSenalizacion() {
  return new Promise((ok, mal) => {
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
    ws.onopen = () => ok(ws);
    ws.onerror = () => mal(new Error("No pude conectar con el servidor de salas (¿está corriendo node server.js?)"));
  });
}

/* =================================================================== anfitrión */

export class SalaAnfitrion {
  constructor(app) {
    this.app = app; this.ws = null; this.codigo = null;
    this.clientes = new Map();                  // id → { pc, rol, dc, sendV, sendA }
    this.alCambiar = () => {};                  // la interfaz se entera de cambios (llegadas, cortes, transmisión, mic)
    this.transmitiendo = false; this.micOn = false; this.err = "";
    this.ctx = null; this.dViewers = null; this.dJugador = null;
    this.videoTrack = null;
  }

  get hayJugador() { return [...this.clientes.values()].some(c => c.rol === "jugador"); }
  get espectadores() { return [...this.clientes.values()].filter(c => c.rol === "espectador").length; }
  get activa() { return !!this.codigo; }
  links() {
    const base = `${location.origin}/pelea.html?sala=${this.codigo}`;
    return { jugador: base, espectador: base + "&ver=1" };
  }

  async crear() {
    if (this.ws) return this.codigo;
    this.ws = await abrirSenalizacion();
    this.ws.onmessage = e => this._msg(JSON.parse(e.data));
    this.ws.onclose = () => { this.codigo = null; this.ws = null; this.alCambiar(); };
    return new Promise(ok => { this._alCrear = ok; this.ws.send(JSON.stringify({ t: "crear" })); });
  }

  cerrar() {
    for (const c of this.clientes.values()) try { c.pc.close(); } catch (e) { /* */ }
    this.clientes.clear(); this.ws?.close(); this.ws = null; this.codigo = null; this.app.controles.online = false; this.alCambiar();
  }

  _audio() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.dViewers = this.ctx.createMediaStreamDestination(); this.dJugador = this.ctx.createMediaStreamDestination();
  }
  _aMezclas(nodo, { aJugador = true } = {}) { nodo.connect(this.dViewers); if (aJugador) nodo.connect(this.dJugador); }

  /** Transmite esta pestaña (con su audio) a todos. Hay que llamarlo desde un clic. */
  async transmitir() {
    this._audio(); await this.ctx.resume();
    let flujo = null;
    try { flujo = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true, preferCurrentTab: true, selfBrowserSurface: "include", systemAudio: "exclude" }); }
    catch (e) { this.err = "No se dio permiso para compartir la pestaña; se transmite sólo el canvas (sin HUD)."; }
    if (flujo) {
      this.videoTrack = flujo.getVideoTracks()[0];
      if (flujo.getAudioTracks().length) this._aMezclas(this.ctx.createMediaStreamSource(new MediaStream([flujo.getAudioTracks()[0]])));
      this.videoTrack.onended = () => { this.transmitiendo = false; this.alCambiar(); };
    } else this.videoTrack = document.querySelector("#c").captureStream(30).getVideoTracks()[0];
    this.transmitiendo = true;
    for (const c of this.clientes.values()) c.sendV?.replaceTrack(this.videoTrack);
    this.alCambiar();
  }

  async activarMic(on) {
    this._audio(); await this.ctx.resume();
    if (on && !this._mic) {
      try { this._mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); this._aMezclas(this.ctx.createMediaStreamSource(this._mic)); }
      catch (e) { this.err = "No pude abrir el micrófono: " + e.message + " (el navegador lo exige en HTTPS o localhost)"; this.alCambiar(); return; }
    }
    this._mic?.getAudioTracks().forEach(t => { t.enabled = on; });
    this.micOn = on; this.alCambiar();
  }

  async _msg(m) {
    if (m.t === "sala") { this.codigo = m.sala; this._alCrear?.(m.sala); this.alCambiar(); }
    else if (m.t === "llego") await this._conectar(m.id, m.rol);
    else if (m.t === "salio") { this.clientes.get(m.id)?.pc.close(); this.clientes.delete(m.id); if (m.rol === "jugador") { this.app.controles.remotoTeclas.clear(); } this.alCambiar(); }
    else if (m.t === "de") {
      const c = this.clientes.get(m.de); if (!c) return;
      if (m.datos.sdp) await c.pc.setRemoteDescription(m.datos.sdp);
      else if (m.datos.ice) try { await c.pc.addIceCandidate(m.datos.ice); } catch (e) { /* candidato tardío */ }
    }
  }

  async _conectar(id, rol) {
    this._audio();
    const pc = new RTCPeerConnection(ICE), c = { pc, rol, dc: null };
    this.clientes.set(id, c);
    const tv = pc.addTransceiver("video", { direction: "sendonly" }); c.sendV = tv.sender;
    const ta = pc.addTransceiver("audio", { direction: rol === "jugador" ? "sendrecv" : "sendonly" }); c.sendA = ta.sender;
    ta.sender.replaceTrack((rol === "jugador" ? this.dJugador : this.dViewers).stream.getAudioTracks()[0]);
    if (this.videoTrack) tv.sender.replaceTrack(this.videoTrack);
    if (rol === "jugador") {
      const dc = c.dc = pc.createDataChannel("ctl");
      dc.onmessage = e => this._deJugador(JSON.parse(e.data));
      this.app.controles.online = true;
      pc.ontrack = e => { if (e.track.kind === "audio") this._micInvitado(e.track); };
    }
    pc.onicecandidate = e => { if (e.candidate) this.ws?.send(JSON.stringify({ t: "para", a: id, datos: { ice: e.candidate } })); };
    pc.onconnectionstatechange = () => { if (["failed", "closed"].includes(pc.connectionState)) { this.clientes.delete(id); this.alCambiar(); } else this.alCambiar(); };
    await pc.setLocalDescription(await pc.createOffer());
    this.ws.send(JSON.stringify({ t: "para", a: id, datos: { sdp: pc.localDescription } }));
    this.alCambiar();
  }

  /** La voz del jugador 2: se oye en esta PC y se mezcla para los espectadores. */
  _micInvitado(track) {
    const flujo = new MediaStream([track]);
    const a = document.createElement("audio"); a.srcObject = flujo; a.autoplay = true; document.body.append(a);   // Chrome sólo entrega el audio remoto si está en un elemento
    this.ctx.createMediaStreamSource(flujo).connect(this.dViewers);
    this._audioInvitado = a;
  }

  _deJugador(m) {
    const ctl = this.app.controles;
    if (m.t === "k") {
      if (m.d) { if (!ctl.remotoTeclas.has(m.c)) { ctl.remotoTeclas.add(m.c); ctl.alPresionar?.(m.c, null, true); } }
      else ctl.remotoTeclas.delete(m.c);
    } else if (m.t === "reset") ctl.remotoTeclas.clear();
    else if (m.t === "personajes") for (const d of m.lista || []) this.app.agregarPersonajeRemoto(d);
  }

  /** Aviso al jugador 2 (por ejemplo, «tu personaje quedó elegido»). */
  avisarJugador(o) { for (const c of this.clientes.values()) if (c.rol === "jugador" && c.dc?.readyState === "open") c.dc.send(JSON.stringify(o)); }
}
