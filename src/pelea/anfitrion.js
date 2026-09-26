// Arena del anfitrión: la pestaña que corre el juego 3D de un torneo. Flujo:
//   lobby (jardín + panel) → el servidor avisa «pelea» → se cargan los dos avatares → combate → resultado al servidor → lobby …
// Nada de esto sabe de MySQL: el servidor guarda los resultados que le manda esta pestaña.

import { Render } from "./render.js";
import { Arena, ORDEN_TEMAS } from "./arena.js";
import { Efectos } from "./efectos.js";
import { Controles } from "./controles.js";
import { Lobby } from "./lobby.js";
import { Combate } from "./combate.js";
import { cargar, retrato } from "./personajes.js";
import { defAvatar } from "./avaturn.js";
import { ambiental } from "./sonido.js";
import { SalaAnfitrion } from "./red.js";
import { usuarioActual, token } from "./sesion.js";

const $ = s => document.querySelector(s);
const tick = () => new Promise(r => setTimeout(r, 16));

export class Anfitrion {
  constructor(codigo, avatarId) {
    this.codigo = codigo; this.avatarId = avatarId;
    this.render = new Render($("#c"));
    this.controles = new Controles();
    this.ui = $("#ui");
    this.retratos = {};
    this.actual = null; this.arena = null; this.efectos = null; this.escenarios = new Map(); this.escenarioId = "ocaso"; this.escenarioElegido = "azar";
    $("#c").addEventListener("webglcontextlost", e => { e.preventDefault(); console.error("[pelea] contexto WebGL perdido"); });
    $("#c").addEventListener("webglcontextrestored", () => location.reload());
    this.fadeObj = 1; this.fade = 0; this.ultimo = performance.now();
    this.sala = new SalaAnfitrion(this);
    this.sala.on.pelea = (c, r) => this.empezarPelea(c, r);
    this.sala.on.cancelar = () => this.cancelarPelea();
    window.__pelea = this;
    addEventListener("pointerdown", () => import("./sonido.js").then(m => m.sfx.activar()), { passive: true });
  }

  progreso(frac, texto) { $("#carga .c-barra i").style.width = `${Math.round(frac * 100)}%`; if (texto) $("#carga .c-paso").textContent = texto; }
  falla(msg, volver = true) {
    $("#carga").classList.remove("off");
    $("#carga .c-paso").innerHTML = `${msg}${volver ? `<br><a href="/" style="color:#ffd98a">Volver al menú</a>` : ""}`;
    $("#carga .c-barra").style.display = "none";
  }

  bucle() {
    const paso = ahora => {
      const dt = Math.min(0.1, (ahora - this.ultimo) / 1000); this.ultimo = ahora;
      this.fade += (this.fadeObj - this.fade) * Math.min(1, dt * 5);
      this.render.fade = this.fade;
      try { this.actual?.update(dt); } catch (e) { console.error(e); }
      this.render.render(dt);
      requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }

  async arrancar() {
    this.progreso(0.05, "Comprobando tu sesión…");
    const yo = await usuarioActual();
    if (!yo) return this.falla("Tu sesión venció. Entrá de nuevo desde el menú.");
    if (!this.avatarId) return this.falla("Elegí con qué avatar vas a pelear desde el menú.");
    this.yo = yo;

    this.progreso(0.12, "Levantando el jardín…"); await tick();
    this.lobby = new Lobby(this);
    await this.mostrar(this.lobby);
    this.bucle();
    $("#negro").classList.add("off");

    this.progreso(0.25, "Forjando la arena…"); await tick();
    this.usarEscenario("ocaso");

    this.progreso(0.5, "Abriendo la sala…");
    try { await this.sala.crear(token(), this.codigo, this.avatarId); }
    catch (e) { return this.falla(e.message); }

    // el avatar del anfitrión se prepara ya (lo necesita para su primera pelea)
    this.progreso(0.65, "Preparando tu avatar…");
    try { await this.prepararAvatar(this.sala.snap?.campeon || { avatarId: this.avatarId, nombre: yo.nombre, uid: yo.id }, 0); }
    catch (e) { console.error(e); return this.falla("No pude cargar tu avatar: " + e.message); }
    this.progreso(1, "Listo");
    $("#carga").classList.add("off");
    this.lobby.pintar();
  }

  usarEscenario(id) {
    let e = this.escenarios.get(id);
    if (!e) { const arena = new Arena(this.render, id); e = { arena, efectos: new Efectos(arena.escena) }; this.escenarios.set(id, e); }
    this.arena = e.arena; this.efectos = e.efectos; this.escenarioId = id;
  }
  precargarEscenario(id) { if (!this.escenarios.has(id)) setTimeout(() => { try { const a = new Arena(this.render, id); this.escenarios.set(id, { arena: a, efectos: new Efectos(a.escena) }); } catch (e) { console.error(e); } }, 50); }

  async prepararAvatar(p, slot) {
    const def = defAvatar({ avatarId: p.avatarId, jugador: p.nombre, avatar: "" }, slot);
    await cargar(def);
    if (!this.retratos[def.id]) { try { this.retratos[def.id] = await retrato(this.render.renderer, def); } catch (e) { console.error(e); } }
    return def;
  }

  async mostrar(pantalla) { await pantalla.iniciar(this.ui); this.actual = pantalla; return pantalla; }

  /** Cambia de pantalla con fundido a negro. */
  async ir(crear) {
    if (this.cambiando) return;
    this.cambiando = true; this.fadeObj = 0;
    await new Promise(r => setTimeout(r, 450));
    this.actual?.destruir?.(); this.actual = null;
    const pantalla = await crear();
    await this.mostrar(pantalla);
    this.fadeObj = 1; this.cambiando = false;
  }

  async empezarPelea(campeon, retador) {
    try {
      const [d1, d2] = await Promise.all([this.prepararAvatar(campeon, 0), this.prepararAvatar(retador, 1)]);
      d1.titulo = "Campeón"; d2.titulo = "Retador";
      this.sala.asignar(campeon, retador);
      const elegido = this.escenarioElegido === "azar" ? ORDEN_TEMAS[(Math.random() * ORDEN_TEMAS.length) | 0] : this.escenarioElegido;
      while (this.cambiando) await new Promise(r => setTimeout(r, 50));
      await this.ir(async () => {
        this.usarEscenario(elegido);
        return new Combate(this, { defs: [d1, d2], modo: "torneo", alTerminar: r => this.terminarPelea(r) });
      });
    } catch (e) {
      console.error(e);
      this.sala.err = "No pude cargar la pelea: " + e.message; this.sala.enviar({ t: "cancelar_pelea" }); this.volverAlLobby();
    }
  }

  terminarPelea(r) {
    this.sala.enviar({ t: "resultado", ganador: r.ganador === 0 ? "campeon" : "retador", rondas: r.ganador === 0 ? [r.victorias[0], r.victorias[1]] : [r.victorias[1], r.victorias[0]] });
    this.volverAlLobby();
  }
  cancelarPelea() { if (this.actual instanceof Combate) this.volverAlLobby(); }
  volverAlLobby() {
    this.sala.soltar(); ambiental.poner(0.5);
    this.ir(async () => this.lobby);          // el jardín se construyó una vez: se reutiliza (reconstruirlo cuesta segundos y memoria de GPU)
  }
}
