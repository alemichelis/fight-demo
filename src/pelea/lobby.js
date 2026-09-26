// Lobby del anfitrión: el jardín de fondo (escena del título) con el panel del torneo encima —quién es campeón, la cuenta
// regresiva de 1 minuto para que entre un retador, la tabla de posiciones y los controles de transmisión / micrófono.

import { Titulo } from "./titulo.js";
import { TEMAS } from "./arena.js";
import { pedir } from "./sesion.js";
import { sfx } from "./sonido.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

export class Lobby extends Titulo {
  iniciar(ui) {
    this.ui = ui;
    const el = document.createElement("section"); el.className = "lb";
    el.innerHTML = `
      <div class="lb-top"><div class="lb-logo">Reino Caído</div><div class="lb-tor"><b class="lb-nombre"></b><span class="lb-prog"></span></div></div>
      <div class="lb-centro"><div class="lb-estado"></div></div>
      <aside class="lb-tabla"><h3>Posiciones</h3><div class="lb-filas"></div></aside>
      <footer class="lb-pie">
        <div class="lb-link"><span>Link para tus amigos</span><input readonly><button class="lb-copiar">Copiar</button><em class="lb-cod"></em></div>
        <div class="lb-btns">
          <button class="lb-tx">1 · Transmitir</button><button class="lb-mic">Micrófono</button>
          <label class="lb-esc">Escenario <select></select></label>
          <button class="lb-fin">Terminar torneo</button>
        </div>
        <p class="lb-err"></p>
      </footer>`;
    ui.append(el); this.el = el;
    const $ = s => el.querySelector(s), sala = this.app.sala;
    $(".lb-copiar").onclick = () => { navigator.clipboard?.writeText($(".lb-link input").value); $(".lb-copiar").textContent = "¡Copiado!"; setTimeout(() => { $(".lb-copiar").textContent = "Copiar"; }, 1500); };
    $(".lb-tx").onclick = () => { sfx.activar(); sala.transmitir(); };
    $(".lb-mic").onclick = () => { sfx.activar(); sala.activarMic(!sala.micOn); };
    $(".lb-fin").onclick = () => { if (confirm("¿Terminar el torneo ahora? Se anuncia campeón a quien tenga más victorias.")) sala.enviar({ t: "terminar" }); };
    const sel = $(".lb-esc select");
    sel.innerHTML = `<option value="azar">Aleatorio</option>` + Object.entries(TEMAS).map(([id, t]) => `<option value="${id}">${esc(t.nombre)}</option>`).join("");
    sel.value = this.app.escenarioElegido; sel.onchange = () => { this.app.escenarioElegido = sel.value; if (sel.value !== "azar") this.app.precargarEscenario(sel.value); };
    sala.on.cambio = () => this.pintar();
    this._mm = e => { this.mouse.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5); };
    window.addEventListener("mousemove", this._mm);
    this.render.mostrar(this.escena, this.camara, this.opciones);
    requestAnimationFrame(() => el.classList.add("on"));
    this.mostrado = true; this.pintar(); this.cargarTabla();
    this._tic = setInterval(() => this.pintarCuenta(), 250);
  }

  destruir() { clearInterval(this._tic); this.app.sala.on.cambio = null; super.destruir(); }

  async cargarTabla() {
    clearTimeout(this._tt);
    this._tt = setTimeout(async () => {
      try { const d = await pedir(`/api/torneos/${this.app.sala.codigo}`); this.tabla = d.tabla; this.pintarTabla(); } catch (e) { /* la tabla se refresca en el próximo cambio */ }
    }, 150);
  }
  pintarTabla() {
    const f = this.el?.querySelector(".lb-filas"); if (!f) return;
    f.innerHTML = (this.tabla || []).length
      ? `<div class="lb-f th"><span>#</span><span>Jugador</span><em>V</em><em>D</em></div>` + this.tabla.map((x, i) => `<div class="lb-f"><span>${i + 1}</span><span>${esc(x.nombre)}</span><em>${x.victorias}</em><em>${x.derrotas}</em></div>`).join("")
      : `<p class="lb-vacio">Todavía no hubo peleas.</p>`;
  }

  pintarCuenta() {
    const sala = this.app.sala, s = sala.snap, c = this.el?.querySelector(".lb-cuenta");
    if (!s || !c) return;
    const restante = Math.max(0, s.restanteMs - (performance.now() - this._recibido));
    c.textContent = mmss(restante);
    c.classList.toggle("urge", restante < 10000);
  }

  pintar() {
    if (!this.el) return;
    const sala = this.app.sala, s = sala.snap, $ = q => this.el.querySelector(q);
    if (!sala.codigo || !s) return;
    if (s !== this._ult) { this._ult = s; this._recibido = performance.now(); this.cargarTabla(); }
    $(".lb-nombre").textContent = s.nombre;
    $(".lb-prog").textContent = `Pelea ${Math.min(s.jugadas + (s.estado === "peleando" ? 1 : 0), s.total)} de ${s.total}`;
    $(".lb-link input").value = sala.links().unirse; $(".lb-cod").textContent = sala.codigo;
    $(".lb-tx").textContent = sala.transmitiendo ? "Transmisión activa ●" : "1 · Transmitir"; $(".lb-tx").classList.toggle("ok", sala.transmitiendo);
    $(".lb-mic").textContent = sala.micOn ? "Micrófono ENCENDIDO" : "Micrófono apagado"; $(".lb-mic").classList.toggle("ok", sala.micOn);
    $(".lb-err").textContent = sala.err || (!sala.transmitiendo && s.estado !== "fin" ? "Tocá «Transmitir» y compartí esta pestaña para que tus amigos vean las peleas." : "");
    $(".lb-fin").hidden = s.estado === "fin";
    const cam = s.campeon, yo = sala.yo, soyCampeon = cam && yo && cam.uid === yo.id, gente = sala.peers.size;
    const cont = $(".lb-estado"); let html = "";
    if (s.estado === "esperando") {
      html = `<div class="lb-titulo">Esperando al primer rival</div><p><b>${esc(cam.nombre)}</b> está listo en la arena.</p>
        <p class="lb-sub">Pasale el link a tus amigos: el primero que lo abra y toque «Desafiar» pelea.</p>
        <p class="lb-gente">${gente ? `${gente} amigo${gente > 1 ? "s" : ""} en la sala` : "Nadie conectado todavía"}</p>`;
    } else if (s.estado === "ventana") {
      html = `<div class="lb-titulo">🏆 ${esc(cam.nombre)} sigue en pie</div><p>Tiempo para que entre un nuevo rival</p><div class="lb-cuenta">${mmss(s.restanteMs)}</div>
        <p class="lb-gente">${gente} amigo${gente === 1 ? "" : "s"} en la sala</p>`;
    } else if (s.estado === "pausa") {
      html = `<div class="lb-titulo">Nadie entró a tiempo</div><p><b>${esc(cam.nombre)}</b> sigue siendo el campeón.</p>
        <div class="lb-acc"><button class="lb-mas">Esperar 1 minuto más</button></div>`;
    } else if (s.estado === "peleando") {
      html = `<div class="lb-titulo">Preparando la pelea…</div><p><b>${esc(cam.nombre)}</b> vs <b>${esc(s.retador?.nombre || "?")}</b></p>`;
    } else if (s.estado === "fin") {
      const f = s.campeonFinal;
      html = `<div class="lb-titulo lb-gana">🏆 ${f ? esc(f.nombre) : "Sin campeón"}</div><p>${f ? `Campeón del torneo con ${f.victorias} victoria${f.victorias === 1 ? "" : "s"}` : "El torneo terminó sin peleas."}</p>
        <div class="lb-acc"><button class="lb-menu">Volver al menú</button></div>`;
      if (s.tabla) { this.tabla = s.tabla; this.pintarTabla(); }
    }
    if (["esperando", "ventana", "pausa"].includes(s.estado) && !soyCampeon) html += `<div class="lb-acc"><button class="lb-yo">Entrar a pelear yo</button></div>`;
    if (cont.dataset.h !== html) {
      cont.innerHTML = html; cont.dataset.h = html;
      cont.querySelector(".lb-mas")?.addEventListener("click", () => sala.enviar({ t: "mas_tiempo" }));
      cont.querySelector(".lb-yo")?.addEventListener("click", () => sala.enviar({ t: "desafiar", avatarId: this.app.avatarId }));
      cont.querySelector(".lb-menu")?.addEventListener("click", () => { sala.cerrar(); location.href = "/"; });
    }
  }
}
