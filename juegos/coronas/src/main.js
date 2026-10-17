// Coronas de Hierro · arranque y bucle principal.
// La simulación (src/sim) avanza a paso fijo; el dibujo (src/render) interpola entre pasos; la interfaz (src/ui)
// traduce gestos en órdenes. Este archivo los conecta y maneja los menús.

import * as THREE from "three";
import { TICK, UNIDADES, EDIFICIOS, DIFICULTADES } from "./datos.js";
import { Mundo } from "./sim/mundo.js";
import { IA } from "./sim/ia.js";
import { crearEscena, CALIDADES } from "./render/escena.js";
import { crearTexturas } from "./render/texturas.js";
import { prepararMateriales } from "./render/modelos.js";
import { crearTerreno } from "./render/terreno.js";
import { Niebla, U } from "./render/parches.js";
import { Vista } from "./render/vista.js";
import { crearRetratos } from "./render/retratos.js";
import { HUD } from "./ui/hud.js";
import { Controles } from "./ui/controles.js";
import { sonar } from "./ui/sonido.js";

const JUGADOR = 0;
const $ = s => document.querySelector(s);
const guardado = (k, def) => { try { return localStorage.getItem("coronas-" + k) || def; } catch { return def; } };
const guardar = (k, v) => { try { localStorage.setItem("coronas-" + k, v); } catch {} };
const espera = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

// ¿qué placa dibuja? Si es por software (sin GPU real) no tiene sentido arrancar en alta.
function placaDeVideo() {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
  } catch { return ""; }
}
function calidadInicial() {
  const url = new URLSearchParams(location.search).get("calidad");
  if (CALIDADES[url]) return url;
  const q = guardado("calidad", "");
  if (CALIDADES[q]) return q;
  if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(placaDeVideo())) return "baja";
  const movil = /Mobi|Android/i.test(navigator.userAgent);
  return movil ? "baja" : (navigator.hardwareConcurrency || 4) >= 8 ? "alta" : "media";
}

class Juego {
  constructor() {
    this.calidad = calidadInicial();
    this.dificultad = guardado("dificultad", "normal");
    this.estado = "cargando";            // cargando → menu → jugando ⇄ pausa → fin
    this.sel = [];
    this.grupos = {};
    this.modoActual = null;              // { tipo: "mover"|"atacar"|"construir"|"reunion", edificio? }
    this.alertasMini = [];
    this.ultimaAlerta = null;
  }

  async cargar() {
    const paso = async (txt, f) => { $("#carga .paso").textContent = txt; $("#carga .barra i").style.width = f * 100 + "%"; await espera(); };
    await paso("Forjando texturas…", 0.1);
    const tx = crearTexturas(this.calidad);
    prepararMateriales(tx);
    await paso("Levantando el mundo…", 0.35);
    const semilla = Number(new URLSearchParams(location.search).get("semilla")) || (Date.now() % 100000);
    this.mundo = new Mundo({ semilla, jugadores: [{ nombre: "Tu reino" }, { nombre: "Reino rival", ia: true }] });
    this.alturaEn = (x, z) => this.mundo.mapa.alturaEn(x, z);
    this.ctx = crearEscena($("#lienzo"), this.calidad, this.mundo.N);
    this.niebla = new Niebla(this.mundo.N);
    await paso("Plantando bosques…", 0.55);
    this.terreno = crearTerreno(this.ctx.escena, this.mundo, tx, this.calidad);
    await paso("Pintando estandartes…", 0.75);
    this.retratos = crearRetratos([...Object.keys(UNIDADES), ...Object.keys(EDIFICIOS), "mina"], this.mundo.jugadores[JUGADOR].color, this.ctx.escena.environment);
    this.vista = new Vista(this.ctx, this.mundo, this.terreno);
    this.hud = new HUD($("#hud"), this.mundo, this.retratos, this);
    this.controles = new Controles(this, $("#lienzo"), $("#cuadro"));
    await paso("Preparando la batalla…", 0.92);
    this.ctx.redimensionar();
    addEventListener("resize", () => this.ctx.redimensionar());
    const castillo = this.mundo.edificiosDe(JUGADOR)[0];
    this.ctx.cam.objetivo.set(castillo.x + 6, 0, castillo.z - 9);
    this.ctx.cam.distancia = this.ctx.cam.distanciaObj = 42;
    // primer cuadro antes de sacar la pantalla de carga (compila todos los shaders de una vez)
    this.niebla.actualizar(this.mundo.jugadores[JUGADOR].vis, 1, true);
    this.vista.actualizar(0, 1);
    this.ctx.ubicarCamara(this.alturaEn);
    this.ctx.renderer.compile(this.ctx.escena, this.ctx.camara);
    this.ctx.dibujar();
    await paso("¡Listo!", 1);
    $("#carga").classList.add("fuera");
    setTimeout(() => $("#carga").remove(), 800);
    this.estado = "menu";
    this.menuInicio();
    this.medirRendimiento();
    this.ultimo = performance.now(); this.acum = 0;
    requestAnimationFrame(t => this.bucle(t));
  }

  // En el menú se miden los cuadros por segundo: si la calidad la eligió el juego (no la persona) y no alcanza
  // para jugar fluido, baja un escalón y recarga. Mejor perder sombras que jugar a los saltos.
  medirRendimiento() {
    if (guardado("calidad", "") && guardado("calidad-auto", "") !== "1") return;
    if (new URLSearchParams(location.search).get("calidad")) return;
    let cuadros = 0; const t0 = performance.now();
    const contar = () => {
      if (this.estado !== "menu") return;
      cuadros++;
      const s = (performance.now() - t0) / 1000;
      if (s < 4) { requestAnimationFrame(contar); return; }
      const fps = cuadros / s, menor = { alta: "media", media: "baja" }[this.calidad];
      if (fps < 26 && menor) { guardar("calidad", menor); guardar("calidad-auto", "1"); location.reload(); }
    };
    setTimeout(() => requestAnimationFrame(contar), 1500);     // los primeros cuadros siempre son lentos
  }

  // para pruebas: avanza la simulación de golpe sin dibujar
  adelantar(segundos) {
    for (let i = 0; i < segundos / TICK; i++) { this.ia?.pensar(); this.mundo.paso(); this.procesarEventos(this.mundo.eventos); this.mundo.eventos.length = 0; }
  }

  /* ================================================================ bucle */

  bucle(t) {
    requestAnimationFrame(tt => this.bucle(tt));
    const dt = Math.min(0.25, (t - this.ultimo) / 1000); this.ultimo = t;
    if (this.estado === "jugando") {
      this.acum += dt;
      let pasos = 0;
      while (this.acum >= TICK && pasos < 10) {
        this.ia.pensar();
        this.mundo.paso();
        this.procesarEventos(this.mundo.eventos);
        this.mundo.eventos.length = 0;
        this.acum -= TICK; pasos++;
      }
      if (pasos >= 10) this.acum = 0;             // la máquina no da abasto: mejor ir lento que acumular atraso
    } else if (this.estado === "menu") {
      // en el menú la cámara recorre el reino despacio
      this.ctx.cam.objetivo.x += Math.cos(t / 9000) * dt * 1.2; this.ctx.cam.objetivo.z += Math.sin(t / 9000) * dt * 0.8;
    }
    U.uTiempo.value += dt;
    this.sel = this.sel.filter(id => this.mundo.ents.has(id));
    this.vista.seleccion = new Set(this.sel);
    if (this.estado !== "cargando") this.controles.actualizar(dt);
    this.vista.actualizar(dt, this.estado === "jugando" ? this.acum / TICK : 1);
    this.terreno.actualizar(dt);
    this.niebla.actualizar(this.mundo.jugadores[JUGADOR].vis, dt, this.estado === "menu");
    this.ctx.ubicarCamara(this.alturaEn);
    if (this.estado === "jugando" || this.estado === "pausa") this.hud.actualizar(this.sel);
    this.ctx.dibujar();
  }

  procesarEventos(evs) {
    this.vista.eventos(evs);
    for (const ev of evs) {
      const mio = ev.dueño === JUGADOR;
      switch (ev.tipo) {
        case "alerta":
          if (mio) { this.hud.aviso("¡Nos están atacando!", "alerta"); sonar("alerta", 4); this.alertasMini.push({ x: ev.x, z: ev.z, t: performance.now() / 1000 }); this.ultimaAlerta = { x: ev.x, z: ev.z }; }
          break;
        case "construido": if (mio) { this.hud.aviso(`${EDIFICIOS[ev.entTipo].nombre} terminado.`); sonar("construido"); } break;
        case "entrenada": if (mio) sonar("entrenado", 0.3); break;
        case "minaAgotada": if (this.mundo.explorado(JUGADOR, ev.x, ev.z)) this.hud.aviso("Se agotó una mina de oro."); break;
        case "arbolCae": this.hud.mini.marcarSucio(); break;
        case "golpe": if (this.mundo.visible(JUGADOR, ev.x, ev.z)) sonar("espada", 0.09); break;
        case "muerte": if (ev.clase === "edificio" && this.mundo.explorado(JUGADOR, ev.x, ev.z)) { sonar("derrumbe", 0.5); if (mio) this.hud.aviso(`Perdimos: ${EDIFICIOS[ev.entTipo].nombre}.`, "alerta"); } break;
        case "fin": setTimeout(() => this.fin(ev.ganador === JUGADOR), 1800); break;
      }
    }
    const ahora = performance.now() / 1000;
    this.alertasMini = this.alertasMini.filter(a => ahora - a.t < 6);
  }

  /* ================================================================ acciones (las usan HUD y controles) */

  jugando() { return this.estado === "jugando"; }
  ordenar(o) {
    const r = this.mundo.ordenar(JUGADOR, o);
    if (!r.ok && r.msg) { this.hud.aviso(r.msg, "error"); sonar("error", 0.3); }
    return r;
  }
  modo() { return this.modoActual?.tipo || null; }
  cancelarModo() { this.modoActual = null; this.vista.mostrarFantasma(null); document.body.dataset.modo = ""; }

  propias() { return this.sel.map(id => this.mundo.ents.get(id)).filter(e => e && e.dueño === JUGADOR); }

  seleccionar(ids, modo = "solo") {
    if (modo === "solo") this.sel = ids.slice();
    else if (modo === "alternar") { const s = new Set(this.sel); ids.forEach(id => s.has(id) ? s.delete(id) : s.add(id)); this.sel = [...s]; }
    else if (modo === "quitar") this.sel = this.sel.filter(id => !ids.includes(id));
    else if (modo === "sumar") this.sel = [...new Set([...this.sel, ...ids])];
    // no mezclar: si hay algo propio, sólo lo propio
    const propias = this.sel.filter(id => this.mundo.ents.get(id)?.dueño === JUGADOR);
    if (propias.length && propias.length !== this.sel.length) this.sel = propias;
    this.hud.menu = "base";
    this.cancelarModo();
    if (this.sel.length) sonar("clic", 0.05);
  }

  enPantalla(e) {
    const v = new THREE.Vector3(e.x, this.alturaEn(e.x, e.z) + 0.5, e.z).project(this.ctx.camara);
    const r = this.ctx.renderer.domElement.getBoundingClientRect();
    return { x: (v.x + 1) / 2 * r.width + r.left, y: (1 - v.y) / 2 * r.height + r.top, z: v.z };
  }

  seleccionarCaja(x0, y0, x1, y1, sumar) {
    const ids = [];
    for (const e of this.mundo.ents.values()) {
      if (e.dueño !== JUGADOR || e.clase !== "unidad" || e.oculto) continue;
      const p = this.enPantalla(e);
      if (p.z < 1 && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) ids.push(e.id);
    }
    if (!ids.length) {           // sin unidades: el edificio propio que quede adentro
      for (const e of this.mundo.ents.values()) {
        if (e.dueño !== JUGADOR || e.clase !== "edificio") continue;
        const p = this.enPantalla(e); if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) { ids.push(e.id); break; }
      }
    }
    this.seleccionar(ids, sumar ? "sumar" : "solo");
  }

  seleccionarTipoEnPantalla(ent) {
    const ids = [];
    for (const e of this.mundo.ents.values()) {
      if (e.dueño !== ent.dueño || e.tipo !== ent.tipo || e.oculto) continue;
      const p = this.enPantalla(e);
      if (p.z < 1 && p.x >= 0 && p.x <= innerWidth && p.y >= 0 && p.y <= innerHeight) ids.push(e.id);
    }
    this.seleccionar(ids);
  }

  guardarGrupo(n) { const p = this.propias(); if (p.length) { this.grupos[n] = p.map(e => e.id); this.hud.aviso(`Grupo ${n}: ${p.length}`); } }
  elegirGrupo(n, centrar) {
    const ids = (this.grupos[n] || []).filter(id => this.mundo.ents.has(id)); if (!ids.length) return;
    this.seleccionar(ids);
    if (centrar) { const e = this.mundo.ents.get(ids[0]); this.centrar(e.x, e.z); }
  }

  desplazar(dx, dz) {
    const c = this.ctx.cam, g = c.giro, N = this.mundo.N;
    c.objetivo.x = THREE.MathUtils.clamp(c.objetivo.x + dx * Math.cos(g) + dz * Math.sin(g), 4, N - 4);
    c.objetivo.z = THREE.MathUtils.clamp(c.objetivo.z - dx * Math.sin(g) + dz * Math.cos(g), 6, N + 4);
  }
  centrar(x, z) { const c = this.ctx.cam; c.objetivo.x = x; c.objetivo.z = z + c.distancia * 0.12; }
  irAAlerta() { if (this.ultimaAlerta) this.centrar(this.ultimaAlerta.x, this.ultimaAlerta.z); else if (this.sel.length) { const e = this.mundo.ents.get(this.sel[0]); this.centrar(e.x, e.z); } }
  alertas() { return this.alertasMini; }

  vistaEnSuelo() {
    const r = this.ctx.renderer.domElement.getBoundingClientRect();
    const esquinas = [[r.left, r.top + r.height * 0.02], [r.right, r.top + r.height * 0.02], [r.right, r.bottom - 1], [r.left, r.bottom - 1]];
    const q = esquinas.map(([x, y]) => this.controles.suelo(x, y));
    return q.every(Boolean) ? q : null;
  }

  // botones de la grilla
  comando(c) {
    const propias = this.propias();
    switch (c.tipo) {
      case "mover": case "atacar": case "reunion": this.modoActual = { tipo: c.tipo }; document.body.dataset.modo = c.tipo; break;
      case "detener": case "mantener": this.ordenar({ tipo: c.tipo, ids: propias.map(e => e.id) }); sonar("orden"); break;
      case "construir": {
        const d = EDIFICIOS[c.edificio], J = this.mundo.jugadores[JUGADOR];
        const falta = this.mundo.faltaPara(J, d.costo);
        if (falta) { this.hud.aviso(falta, "error"); sonar("error"); return; }
        this.modoActual = { tipo: "construir", edificio: c.edificio }; document.body.dataset.modo = "construir";
        break;
      }
      case "entrenar": {
        // con varios edificios iguales seleccionados, al que tenga la cola más corta
        const eds = propias.filter(e => e.clase === "edificio").sort((a, b) => a.cola.length - b.cola.length);
        if (eds[0] && this.ordenar({ tipo: "entrenar", id: eds[0].id, unidad: c.unidad }).ok) sonar("clic");
        break;
      }
      case "cancelar": { const e = propias.find(e => e.clase === "edificio"); if (e) this.ordenar({ tipo: "cancelar", id: e.id }); break; }
    }
  }

  // clic izquierdo con un modo activo
  clicModo(x, z, shift) {
    const m = this.modoActual, propias = this.propias(), ids = propias.filter(e => e.clase === "unidad").map(e => e.id);
    if (m.tipo === "mover") { this.ordenar({ tipo: "mover", ids, x, z }); this.vista.marca(x, z, "mover"); sonar("orden"); }
    else if (m.tipo === "atacar") {
      const t = this.mundo.entEn(x, z, JUGADOR);
      if (t && this.mundo.enemigos(JUGADOR, t.dueño)) { this.ordenar({ tipo: "atacar", ids, objetivo: t.id }); }
      else this.ordenar({ tipo: "mover", ids, x, z, ataque: true });
      this.vista.marca(x, z, "ataque"); sonar("ataque");
    } else if (m.tipo === "reunion") { this.ponerReunion(x, z); }
    else if (m.tipo === "construir") {
      const lado = EDIFICIOS[m.edificio].lado, tx = Math.floor(x - lado / 2 + 0.5), tz = Math.floor(z - lado / 2 + 0.5);
      const peones = propias.filter(e => e.clase === "unidad" && UNIDADES[e.tipo].construye);
      // va el peón más cercano (con Shift, todos los seleccionados)
      peones.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
      const quien = shift ? peones : peones.slice(0, 1);
      const r = this.ordenar({ tipo: "construir", ids: quien.map(e => e.id), edificio: m.edificio, tx, tz });
      if (r.ok) { sonar("orden"); this.vista.marca(tx + lado / 2, tz + lado / 2, "mover"); if (shift && this.mundo.faltaPara(this.mundo.jugadores[JUGADOR], EDIFICIOS[m.edificio].costo) === null) return; }
      else return;
    }
    if (!(shift && m.tipo !== "construir")) this.cancelarModo();
  }

  ponerReunion(x, z) {
    const eds = this.propias().filter(e => e.clase === "edificio");
    const t = this.mundo.entEn(x, z, JUGADOR);
    const arbol = this.mundo.esArbol(Math.floor(x), Math.floor(z)) ? { x: Math.floor(x), z: Math.floor(z) } : null;
    this.ordenar({ tipo: "reunion", ids: eds.map(e => e.id), x, z, mina: t?.clase === "mina" ? t.id : null, arbol });
    this.vista.marca(x, z, t?.clase === "mina" || arbol ? "recurso" : "mover"); sonar("orden");
  }

  // clic derecho: la orden «obvia» según lo que hay bajo el puntero
  ordenMapa(x, z) {
    const propias = this.propias(); if (!propias.length) return;
    const unidades = propias.filter(e => e.clase === "unidad");
    if (!unidades.length) { if (propias.some(e => e.clase === "edificio" && EDIFICIOS[e.tipo].entrena)) this.ponerReunion(x, z); return; }
    const ids = unidades.map(e => e.id), peones = unidades.filter(u => UNIDADES[u.tipo].recolecta).map(u => u.id), otros = ids.filter(id => !peones.includes(id));
    const t = this.mundo.entEn(x, z, JUGADOR);
    const tx = Math.floor(x), tz = Math.floor(z);
    if (t && this.mundo.enemigos(JUGADOR, t.dueño)) { this.ordenar({ tipo: "atacar", ids, objetivo: t.id }); this.vista.marca(t.x, t.z, "ataque"); sonar("ataque"); return; }
    if (peones.length && t?.clase === "mina") {
      this.ordenar({ tipo: "recolectar", ids: peones, mina: t.id });
      if (otros.length) this.ordenar({ tipo: "mover", ids: otros, x, z });
      this.vista.marca(t.x, t.z, "recurso"); sonar("orden"); return;
    }
    // árbol: el de la casilla o uno pegado (los árboles son altos y el clic suele caer al pie)
    let arbol = null;
    for (const [dx, dz] of [[0, 0], [0, -1], [-1, 0], [1, 0], [0, 1]]) if (this.mundo.esArbol(tx + dx, tz + dz)) { arbol = { x: tx + dx, z: tz + dz }; break; }
    if (peones.length && arbol && !t) {
      this.ordenar({ tipo: "recolectar", ids: peones, x: arbol.x, z: arbol.z });
      if (otros.length) this.ordenar({ tipo: "mover", ids: otros, x, z });
      this.vista.marca(arbol.x + 0.5, arbol.z + 0.5, "recurso"); sonar("orden"); return;
    }
    if (peones.length && t?.clase === "edificio" && t.dueño === JUGADOR && !t.completo) { this.ordenar({ tipo: "ayudar", ids: peones, objetivo: t.id }); sonar("orden"); return; }
    if (peones.length && t?.clase === "edificio" && t.dueño === JUGADOR && EDIFICIOS[t.tipo].entrega) {
      // devolver la carga y seguir trabajando en lo mismo
      for (const id of peones) {
        const u = this.mundo.ents.get(id);
        if (u.carga) this.mundo.asignar(u, u.carga.tipo === "oro" ? { tipo: "recolectar", recurso: "oro", mina: this.mundo.minaCercana(u.x, u.z)?.id, fase: "volver" } : { tipo: "recolectar", recurso: "madera", arbol: this.mundo.arbolCercano(u.x, u.z), fase: "volver" });
      }
    }
    this.ordenar({ tipo: "mover", ids, x, z });
    this.vista.marca(x, z, "mover"); sonar("orden");
  }

  // puntero sobre el mapa: fantasma de construcción y resaltado
  alPasar(p) {
    if (!p) { this.vista.hover = null; return; }
    if (this.modoActual?.tipo === "construir") {
      const tipo = this.modoActual.edificio, lado = EDIFICIOS[tipo].lado;
      const tx = Math.floor(p.x - lado / 2 + 0.5), tz = Math.floor(p.z - lado / 2 + 0.5);
      this.vista.mostrarFantasma(tipo, tx, tz, !this.mundo.motivoNoConstruir(JUGADOR, tipo, tx, tz));
      this.vista.hover = null;
      return;
    }
    const e = this.jugando() ? this.mundo.entEn(p.x, p.z, JUGADOR) : null;
    this.vista.hover = e?.id ?? null;
    document.body.dataset.puntero = !e ? "" : this.mundo.enemigos(JUGADOR, e.dueño) ? "enemigo" : e.clase === "mina" ? "recurso" : "propio";
  }

  /* ================================================================ menús */

  menuInicio() {
    const m = $("#menu");
    m.hidden = false;
    m.innerHTML = `
      <div class="menu-caja">
        <div class="titulo"><span>Coronas</span><small>de Hierro</small></div>
        <p class="lema">Levantá tu reino, juntá oro y madera, y aplastá al rival antes de que él te aplaste a vos.</p>
        <div class="opcion"><span>Dificultad</span><div class="selector" id="dif">${Object.entries(DIFICULTADES).map(([k, d]) => `<button data-v="${k}" aria-pressed="${k === this.dificultad}">${d.nombre}</button>`).join("")}</div></div>
        <div class="opcion"><span>Gráficos</span><div class="selector" id="cal">${Object.keys(CALIDADES).map(k => `<button data-v="${k}" aria-pressed="${k === this.calidad}">${k[0].toUpperCase() + k.slice(1)}</button>`).join("")}</div></div>
        <button class="jugar" id="jugar">Comenzar la batalla</button>
        <details class="ayuda"><summary>Cómo se juega</summary>
          <ul>
            <li><b>Clic izquierdo</b> elige; <b>arrastrar</b> elige varios; <b>doble clic</b> elige todos los de ese tipo en pantalla.</li>
            <li><b>Clic derecho</b> da la orden: mover, atacar, minar oro, talar o ayudar a construir.</li>
            <li>Los <b>peones</b> construyen con <kbd>Z</kbd>. Las <b>granjas</b> dan comida para más tropas.</li>
            <li>Comandos con <kbd>Q</kbd> <kbd>W</kbd> <kbd>E</kbd> <kbd>R</kbd> / <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> <kbd>F</kbd> / <kbd>Z</kbd> <kbd>X</kbd> <kbd>C</kbd> <kbd>V</kbd>, según su lugar en la grilla.</li>
            <li><kbd>Ctrl</kbd>+<kbd>1</kbd>…<kbd>9</kbd> arma grupos. <kbd>Espacio</kbd> va a la última alerta. Cámara: bordes de pantalla, flechas, rueda y botón del medio.</li>
            <li>Ganás cuando el rival se queda sin edificios ni peones.</li>
          </ul>
        </details>
      </div>
      <a class="salir" href="/juegos">← Catálogo de juegos</a>`;
    m.querySelector("#dif").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; this.dificultad = b.dataset.v; guardar("dificultad", this.dificultad); m.querySelectorAll("#dif button").forEach(x => x.setAttribute("aria-pressed", x === b)); sonar("clic"); });
    m.querySelector("#cal").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b || b.dataset.v === this.calidad) return;
      guardar("calidad", b.dataset.v); guardar("calidad-auto", "0"); location.reload();      // cambia sombras y posprocesado: hay que rearmar el renderizador
    });
    m.querySelector("#jugar").addEventListener("click", () => this.empezar());
    if (sessionStorage.getItem("coronas-revancha")) { sessionStorage.removeItem("coronas-revancha"); this.empezar(); }
  }

  empezar() {
    $("#menu").hidden = true;
    this.ia = new IA(this.mundo, 1, this.dificultad);
    const castillo = this.mundo.edificiosDe(JUGADOR)[0];
    this.centrar(castillo.x + 3, castillo.z - 3);
    this.ctx.cam.distanciaObj = 26;
    this.seleccionar(this.mundo.unidadesDe(JUGADOR).map(u => u.id));
    this.estado = "jugando";
    document.body.classList.add("en-juego");
    this.hud.aviso("Mandá a los peones a la mina y al bosque con clic derecho.");
    sonar("construido");
  }

  menu() {
    if (this.estado === "pausa") { this.continuar(); return; }
    if (this.estado !== "jugando") return;
    this.estado = "pausa";
    const p = $("#pausa"); p.hidden = false;
    p.innerHTML = `<div class="menu-caja chica"><div class="titulo"><span>Pausa</span></div>
      <button class="jugar" data-a="seguir">Seguir jugando</button>
      <button class="sec" data-a="reiniciar">Empezar de nuevo</button>
      <a class="sec" href="/juegos/coronas">Volver al menú principal</a>
      <a class="sec" href="/juegos">Salir al catálogo</a></div>`;
    p.onclick = e => {
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (a === "seguir") this.continuar();
      if (a === "reiniciar") { sessionStorage.setItem("coronas-revancha", "1"); location.reload(); }
    };
  }
  continuar() { $("#pausa").hidden = true; this.estado = "jugando"; this.ultimo = performance.now(); }

  fin(gane) {
    if (this.estado === "fin") return;
    this.estado = "fin";
    sonar(gane ? "victoria" : "derrota");
    const s = this.mundo.jugadores.map(J => J.stats), t = Math.floor(this.mundo.tiempo);
    const fila = (n, k) => `<tr><td>${n}</td><td>${s[0][k]}</td><td>${s[1][k]}</td></tr>`;
    const f = $("#fin"); f.hidden = false;
    f.innerHTML = `<div class="menu-caja"><div class="titulo ${gane ? "gano" : "perdio"}"><span>${gane ? "Victoria" : "Derrota"}</span></div>
      <p class="sub-fin">${gane ? "El reino rival cayó" : "Tu reino cayó"} · ${Math.floor(t / 60)} min ${String(t % 60).padStart(2, "0")} s</p>
      <table class="tabla-fin"><thead><tr><th></th><th>Vos</th><th>Rival</th></tr></thead><tbody>
        ${fila("Unidades entrenadas", "entrenadas")}${fila("Enemigos abatidos", "bajas")}${fila("Unidades perdidas", "perdidas")}${fila("Edificios levantados", "edificios")}${fila("Oro juntado", "oro")}${fila("Madera juntada", "madera")}
      </tbody></table>
      <button class="jugar" id="revancha">Revancha</button>
      <a class="sec" href="/juegos">Volver al catálogo</a></div>`;
    f.querySelector("#revancha").onclick = () => { sessionStorage.setItem("coronas-revancha", "1"); location.reload(); };
  }
}

const juego = new Juego();
window.__coronas = juego;      // para depurar desde la consola
juego.cargar().catch(e => {
  console.error(e);
  $("#carga .paso").textContent = "No se pudo iniciar: " + e.message;
  $("#carga").classList.add("error");
});
