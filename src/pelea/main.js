// Arranque y navegación del modo pelea: título → selección → combate. Un solo Render compartido; cada pantalla trae su escena.
//
//   /pelea.html                          juego completo
//   /pelea.html?ir=seleccion&modo=2p     saltar a una pantalla (título | seleccion | pelea)
//   /pelea.html?ir=pelea&p1=avatar&p2=necro&modo=1p

import { Render } from "./render.js";
import { Arena } from "./arena.js";
import { Efectos } from "./efectos.js";
import { Controles } from "./controles.js";
import { Titulo } from "./titulo.js";
import { Seleccion } from "./seleccion.js";
import { Combate } from "./combate.js";
import { ROSTER, cargar, retrato } from "./personajes.js";
import { sfx, ambiental } from "./sonido.js";
import { cargarPersonajesGuardados, defAvaturn } from "./avaturn.js";
import { SalaAnfitrion } from "./red.js";

const P = new URLSearchParams(location.search);
const $ = s => document.querySelector(s);
const tick = () => new Promise(r => setTimeout(r, 16));

class App {
  constructor() {
    this.render = new Render($("#c"));
    this.controles = new Controles();
    this.ui = $("#ui");
    this.retratos = {};
    this.actual = null; this.arena = null; this.efectos = null; this.escenarios = new Map(); this.escenarioId = "ocaso";
    // pantalla negra: si el contexto WebGL se pierde queda anotado (y se ve en la consola)
    $("#c").addEventListener("webglcontextlost", e => { e.preventDefault(); console.error("[pelea] contexto WebGL perdido"); this.contextoPerdido = true; });
    $("#c").addEventListener("webglcontextrestored", () => location.reload());
    this.fadeObj = 1; this.fade = 0; this.ultimo = performance.now();
    this.modo = P.get("modo") || "1p"; this.ultimosDefs = null;
    this.sala = new SalaAnfitrion(this);
    window.__pelea = this;
    // pantalla completa al primer clic derecho? no: F11 del navegador. Aquí sólo se reactiva el audio con cualquier gesto.
    addEventListener("pointerdown", () => sfx.activar(), { passive: true });
  }

  /** Lanza el bucle de render; las pantallas se actualizan desde acá. */
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

  progreso(frac, texto) {
    $("#carga .c-barra i").style.width = `${Math.round(frac * 100)}%`;
    if (texto) $("#carga .c-paso").textContent = texto;
  }

  async arrancar() {
    const inicio = P.get("ir") || "titulo";
    // 1) escena de título visible cuanto antes, detrás de la carga
    this.progreso(0.05, "Levantando el jardín…"); await tick();
    this.titulo = new Titulo(this);
    if (inicio === "titulo") await this.mostrar(this.titulo);
    this.bucle();
    $("#negro").classList.add("off");

    // 2) arena (texturas procedurales y geometría: unos segundos)
    this.progreso(0.15, "Forjando la arena…"); await tick();
    cargarPersonajesGuardados();
    this.usarEscenario("ocaso");

    // 3) personajes
    const n = ROSTER.length;
    let hechos = 0;
    await Promise.all(ROSTER.map(async d => {
      try { await cargar(d); } catch (e) { console.error(`No se pudo cargar ${d.id}`, e); }
      this.progreso(0.3 + 0.4 * (++hechos / n), `Invocando guerreros… ${hechos}/${n}`);
    }));

    // 4) retratos para la grilla y el HUD
    for (let i = 0; i < n; i++) {
      this.progreso(0.7 + 0.28 * (i / n), "Tomando retratos…"); await tick();
      try { this.retratos[ROSTER[i].id] = await retrato(this.render.renderer, ROSTER[i]); } catch (e) { console.error(e); }
    }
    this.progreso(1, "Listo");
    $("#carga").classList.add("off");
    if (inicio !== "titulo") await this.ir(inicio, { modo: this.modo, defs: this._defsUrl() }, true);
    else this.titulo.cargado = true;
  }

  /** Cada escenario se construye una vez (unos segundos) y se reutiliza; los efectos viven en su escena. */
  usarEscenario(id) {
    let e = this.escenarios.get(id);
    if (!e) { const arena = new Arena(this.render, id); e = { arena, efectos: new Efectos(arena.escena) }; this.escenarios.set(id, e); }
    this.arena = e.arena; this.efectos = e.efectos; this.escenarioId = id;
  }

  /** Un personaje creado por el jugador 2 en su PC (el GLB ya está en el servidor): se suma al plantel y a la selección. */
  async agregarPersonajeRemoto(p) {
    if (!p?.id || !p.modelo || ROSTER.some(r => r.id === p.id)) return;
    const def = defAvaturn({ id: String(p.id).slice(0, 40), nombre: String(p.nombre || "INVITADO"), modelo: String(p.modelo) }, ROSTER.filter(r => r.custom).length);
    ROSTER.push(def);
    try { await cargar(def); this.retratos[def.id] = await retrato(this.render.renderer, def); } catch (e) { console.error(e); }
    this.actual?.refrescarPersonajes?.(def);
  }

  _defsUrl() {
    const d = id => ROSTER.find(r => r.id === id) || ROSTER[0];
    return [d(P.get("p1") || "avatar"), d(P.get("p2") || "necro")];
  }

  /** Cambia de pantalla con fundido. */
  async ir(nombre, datos = {}, rapido = false) {
    if (this.cambiando) return;
    this.cambiando = true;
    this.fadeObj = 0;
    if (!rapido) await new Promise(r => setTimeout(r, 450)); else this.fade = 0;
    this.actual?.destruir?.();
    let pantalla;
    if (nombre === "titulo") { this.titulo = new Titulo(this); pantalla = this.titulo; ambiental.poner(0.5); }
    else if (nombre === "seleccion") { this.modo = datos.modo || this.modo; pantalla = new Seleccion(this, { modo: this.modo }); }
    else if (nombre === "pelea") {
      this.ultimosDefs = datos.defs; this.modo = datos.modo || this.modo;
      this.usarEscenario(datos.escenario || P.get("escenario") || this.escenarioId);
      pantalla = new Combate(this, { defs: datos.defs, modo: this.modo, alSalir: dest => this._despuesDePelea(dest) });
    }
    this.actual = null;
    await this.mostrar(pantalla);
    this.fadeObj = 1;
    this.cambiando = false;
  }

  /** Título y selección arman su DOM al instante; el combate es asíncrono (baja los modelos). */
  async mostrar(pantalla) {
    await pantalla.iniciar(this.ui);
    this.actual = pantalla;
    return pantalla;
  }

  _despuesDePelea(dest) {
    if (dest === "revancha") this.ir("pelea", { defs: this.ultimosDefs, modo: this.modo, escenario: this.escenarioId });
    else if (dest === "seleccion") this.ir("seleccion", { modo: this.modo });
    else this.ir("titulo");
  }
}

// ?sala=XXXX → cliente liviano (jugador 2 / espectador): no carga el juego, sólo mira y controla la transmisión del anfitrión
if (P.get("sala")) {
  const { iniciarCliente } = await import("./cliente.js");
  iniciarCliente(P.get("sala").toUpperCase(), P.get("ver") === "1");
} else {
const app = new App();
app.arrancar().catch(e => { console.error(e); $("#carga .c-paso").textContent = "Error: " + e.message; });
}
