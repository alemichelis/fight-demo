// Red del torneo. El anfitrión corre TODO el juego y lo transmite por WebRTC a los demás (video de la pestaña + audio);
// los peleadores remotos mandan sus teclas por un canal de datos y su micrófono por audio. El servidor (salas.mjs) sólo
// coordina el torneo y hace de señalizador; nada del juego pasa por él.
//
// Audio que recibe cada navegador: el del juego + la voz del anfitrión + la voz de los peleadores activos (menos la suya propia,
// para no oírse con eco). Los espectadores que no pelean no hablan.

const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };

export function abrirSenalizacion() {
  return new Promise((ok, mal) => {
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
    ws.onopen = () => ok(ws);
    ws.onerror = () => mal(new Error("No pude conectar con el servidor de salas."));
  });
}

export class SalaAnfitrion {
  constructor(app) {
    this.app = app; this.ws = null; this.codigo = null; this.yo = null;
    this.peers = new Map();                       // id → { pc, dc, nombre, dest, sendV, sendA, mic:{fuente, gain} }
    this.snap = null;                             // último estado que mandó el servidor
    this.on = {};                                 // callbacks: estado, pelea, fin, cancelar, cerrada, cambio
    this.transmitiendo = false; this.micOn = false; this.err = "";
    this.ctx = null; this.gJuego = null; this.gHost = null; this.videoTrack = null;
    this.controladores = { 1: null, 2: null };    // quién maneja cada lado en la pelea actual ("h" o id de invitado)
  }
  _avisar() { this.on.cambio?.(); }

  links() { const b = `${location.origin}/juegos/reino-caido/?t=${this.codigo}`; return { unirse: b }; }

  /** Primera vez que se abre la sala. Si el WebSocket se corta después (algunos hostings cierran conexiones inactivas), se
   * reconecta solo y retoma la MISMA sala en el servidor, sin perder invitados conectados ni la pelea en curso. */
  async crear(token, codigo, avatarId) {
    this._token = token; this._pedido = { codigo, avatarId };
    return this._abrir();
  }
  async _abrir() {
    this.ws = await abrirSenalizacion();
    this.ws.onmessage = e => this._msg(JSON.parse(e.data));
    this.ws.onclose = () => { this.ws = null; if (this._pedido) this._reconectar(); };
    this._creando = true;
    const p = new Promise((ok, mal) => { this._alCrear = { ok: r => { this._creando = false; ok(r); }, mal: e => { this._creando = false; mal(e); } }; });
    this.ws.send(JSON.stringify({ t: "crear", token: this._token, ...this._pedido }));
    return p;
  }
  async _reconectar(intento = 1) {
    this.err = "Se cortó la conexión con el servidor: reconectando…"; this._avisar();
    await new Promise(r => setTimeout(r, Math.min(1000 * intento, 8000)));
    if (!this._pedido) return;                          // se cerró la sala mientras esperaba (cerrar() ya limpió _pedido)
    try { await this._abrir(); this.err = ""; this._avisar(); }
    catch (e) { this._reconectar(intento + 1); }
  }
  enviar(o) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(o)); }
  cerrar() { this._pedido = null; for (const p of this.peers.values()) try { p.pc.close(); } catch (e) { /* */ } this.peers.clear(); this.codigo = null; this.ws?.close(); this.ws = null; }

  /* ------------------------------------------------------------ audio */
  _audio() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.gJuego = this.ctx.createGain(); this.gHost = this.ctx.createGain();
  }
  /** Reconecta quién oye a quién según los peleadores activos. Se llama al cambiar peleadores, entrar/salir invitados y micrófonos. */
  _recablear() {
    if (!this.ctx) return;
    const activos = new Set(Object.values(this.controladores).filter(x => x && x !== "h"));
    for (const n of [this.gJuego, this.gHost]) { try { n.disconnect(); } catch (e) { /* */ } }
    for (const [id, p] of this.peers) {
      if (p.mic) try { p.mic.gain.disconnect(); } catch (e) { /* */ }
      for (const g of [this.gJuego, this.gHost]) g.connect(p.dest);
      for (const [q, pq] of this.peers) if (q !== id && pq.mic && activos.has(q)) pq.mic.gain.connect(p.dest);
    }
    for (const [id, p] of this.peers) if (p.mic && activos.has(id)) p.mic.gain.connect(this.ctx.destination);     // el anfitrión oye a los peleadores
  }

  /** Transmite esta pestaña (con su audio) a todos. Hay que llamarlo desde un clic. */
  async transmitir() {
    this._audio(); await this.ctx.resume();
    let flujo = null;
    try { flujo = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true, preferCurrentTab: true, selfBrowserSurface: "include", systemAudio: "exclude" }); }
    catch (e) { this.err = "No diste permiso para compartir la pestaña: se transmite sólo la imagen del juego."; }
    if (flujo) {
      this.videoTrack = flujo.getVideoTracks()[0];
      if (flujo.getAudioTracks().length) this.ctx.createMediaStreamSource(new MediaStream([flujo.getAudioTracks()[0]])).connect(this.gJuego);
      this.videoTrack.onended = () => { this.transmitiendo = false; this._avisar(); };
    } else this.videoTrack = document.querySelector("#c").captureStream(30).getVideoTracks()[0];
    this.transmitiendo = true;
    for (const p of this.peers.values()) p.sendV?.replaceTrack(this.videoTrack);
    this._recablear(); this._avisar();
  }

  async activarMic(on) {
    this._audio(); await this.ctx.resume();
    if (on && !this._mic) {
      try { this._mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); this.ctx.createMediaStreamSource(this._mic).connect(this.gHost); }
      catch (e) { this.err = "No pude abrir el micrófono: " + e.message + " (el navegador lo exige en HTTPS)."; this._avisar(); return; }
    }
    this._mic?.getAudioTracks().forEach(t => { t.enabled = on; });
    this.micOn = on; this._recablear(); this._avisar();
  }

  /* ------------------------------------------------------------ mensajes del servidor */
  async _msg(m) {
    if (m.t === "sala") { this.codigo = m.sala; this.yo = m.yo; this._alCrear?.ok(m); }
    else if (m.t === "error") { if (this._creando) this._alCrear?.mal(new Error(m.msg)); else { this.err = m.msg; this._avisar(); } }
    else if (m.t === "estado") { this.snap = m; this.on.estado?.(m); this._avisar(); }
    else if (m.t === "fin") { this.snap = m; this.on.fin?.(m); this._avisar(); }
    else if (m.t === "pelea") this.on.pelea?.(m.campeon, m.retador);
    else if (m.t === "cancelar_pelea") this.on.cancelar?.();
    else if (m.t === "llego") await this._conectar(m.id, m.nombre);
    else if (m.t === "salio") { const p = this.peers.get(m.id); try { p?.pc.close(); } catch (e) { /* */ } this.peers.delete(m.id); for (const k of [1, 2]) if (this.controladores[k] === m.id) this.app.controles.remotoTeclas[k].clear(); this._recablear(); this._avisar(); }
    else if (m.t === "de") {
      const p = this.peers.get(m.de); if (!p) return;
      if (m.datos.sdp) await p.pc.setRemoteDescription(m.datos.sdp);
      else if (m.datos.ice) try { await p.pc.addIceCandidate(m.datos.ice); } catch (e) { /* candidato tardío */ }
    }
  }

  async _conectar(id, nombre) {
    this._audio();
    const pc = new RTCPeerConnection(ICE), p = { pc, dc: null, nombre, mic: null, dest: this.ctx.createMediaStreamDestination() };
    this.peers.set(id, p);
    const tv = pc.addTransceiver("video", { direction: "sendonly" }); p.sendV = tv.sender;
    const ta = pc.addTransceiver("audio", { direction: "sendrecv" }); p.sendA = ta.sender;
    ta.sender.replaceTrack(p.dest.stream.getAudioTracks()[0]);
    if (this.videoTrack) tv.sender.replaceTrack(this.videoTrack);
    try { const par = tv.sender.getParameters(); par.encodings = par.encodings?.length ? par.encodings : [{}]; par.encodings[0].maxBitrate = 3_000_000; tv.sender.setParameters(par); } catch (e) { /* opcional */ }
    const dc = p.dc = pc.createDataChannel("ctl");
    dc.onmessage = e => { try { this._deInvitado(id, JSON.parse(e.data)); } catch (er) { /* mensaje mal formado */ } };
    pc.ontrack = e => {
      if (e.track.kind !== "audio") return;
      const flujo = new MediaStream([e.track]);
      const a = document.createElement("audio"); a.srcObject = flujo; a.muted = true; a.autoplay = true;   // Chrome sólo entrega el audio remoto si hay un elemento que lo consuma
      p.mic = { gain: this.ctx.createGain(), el: a }; this.ctx.createMediaStreamSource(flujo).connect(p.mic.gain);
      this._recablear();
    };
    pc.onicecandidate = e => { if (e.candidate) this.enviar({ t: "para", a: id, datos: { ice: e.candidate } }); };
    pc.onconnectionstatechange = () => this._avisar();
    await pc.setLocalDescription(await pc.createOffer());
    this.enviar({ t: "para", a: id, datos: { sdp: pc.localDescription } });
    this._recablear(); this._avisar();
  }

  /** Teclas de un invitado: sólo cuentan si es quien maneja ese lado. */
  _deInvitado(id, m) {
    const ctl = this.app.controles;
    for (const lado of [1, 2]) {
      if (this.controladores[lado] !== id) continue;
      if (m.t === "k") { if (m.d) ctl.remotoTeclas[lado].add(m.c); else ctl.remotoTeclas[lado].delete(m.c); }
      else if (m.t === "reset") ctl.remotoTeclas[lado].clear();
    }
  }

  /** Quién maneja cada lado en la pelea que empieza. */
  asignar(campeon, retador) {
    this.controladores = { 1: campeon.ctrl, 2: retador.ctrl };
    for (const k of [1, 2]) this.app.controles.remotoTeclas[k].clear();
    this.app.controles.fuentes = { 1: campeon.ctrl === "h" ? "local" : "remoto", 2: retador.ctrl === "h" ? "local" : "remoto" };
    this._recablear();
  }
  soltar() { this.controladores = { 1: null, 2: null }; for (const k of [1, 2]) this.app.controles.remotoTeclas[k].clear(); this._recablear(); }
}
