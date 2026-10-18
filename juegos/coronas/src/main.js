// Coronas de Hierro · arranque y bucle principal.
// La simulación (src/sim) avanza a paso fijo; el dibujo (src/render) interpola entre pasos; la interfaz (src/ui)
// traduce gestos en órdenes. Este archivo los conecta y maneja los menús.

import * as THREE from "three";
import { TICK, UNIDADES, EDIFICIOS, DIFICULTADES, NIVELES, INVESTIGACIONES, ARBOLES_GLB } from "./datos.js";
import { Mundo } from "./sim/mundo.js";
import { IA } from "./sim/ia.js";
import { crearEscena } from "./render/escena.js";
import { config, PRESETS, nombreTecla } from "./config.js";
import { Configuracion } from "./ui/configuracion.js";
import { crearTexturas } from "./render/texturas.js";
import { prepararMateriales, precargar, precargarGLB, glbCargado } from "./render/modelos.js";
import { crearTerreno } from "./render/terreno.js";
import { Niebla, U } from "./render/parches.js";
import { Vista } from "./render/vista.js";
import { crearRetratos } from "./render/retratos.js";
import { HUD, destrabesDe } from "./ui/hud.js";
import { Controles } from "./ui/controles.js";
import { sonar, fijarVolumen } from "./ui/sonido.js";

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
// calidad con la que arranca alguien que nunca abrió la configuración
function calidadInicial() {
  const q = guardado("calidad", "");                 // de versiones anteriores
  if (PRESETS[q]) return q;
  if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(placaDeVideo())) return "baja";
  const movil = /Mobi|Android/i.test(navigator.userAgent);
  return movil ? "baja" : (navigator.hardwareConcurrency || 4) >= 8 ? "alta" : "media";
}

class Juego {
  constructor() {
    config.cargar(calidadInicial());
    // ?calidad=alta|media|baja fuerza un preset para esta visita (útil para probar)
    const url = new URLSearchParams(location.search).get("calidad");
    if (PRESETS[url]) { config.usarPreset(url); config.valor.elegidaPorPersona = true; }
    this.calidad = config.valor.graficos.calidad;
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
    const tx = crearTexturas(config.valor.graficos.calidad === "baja" ? "baja" : "alta");
    prepararMateriales(tx);
    await paso("Levantando el mundo…", 0.35);
    const semilla = Number(new URLSearchParams(location.search).get("semilla")) || (Date.now() % 100000);
    this.mundo = new Mundo({ semilla, jugadores: [{ nombre: "Tu reino" }, { nombre: "Reino rival", ia: true }] });
    this.alturaEn = (x, z) => this.mundo.mapa.alturaEn(x, z);
    this.ctx = crearEscena($("#lienzo"), config.valor.graficos, this.mundo.N);
    this.niebla = new Niebla(this.mundo.N);
    await paso("Plantando bosques…", 0.55);
    this.terreno = crearTerreno(this.ctx.escena, this.mundo, tx, this.calidad);
    await paso("Trayendo modelos…", 0.62);
    await precargarGLB(f => { $("#carga .barra i").style.width = (62 + f * 12) + "%"; });
    // olmos de verdad entre los árboles procedurales (menos con gráficos bajos: son más pesados)
    const g = config.valor.graficos;
    this.terreno.arbolesGLB(glbCargado(ARBOLES_GLB[0]), g.calidad === "baja" ? 0 : g.calidad === "media" ? 0.05 : 0.1);
    await paso("Pintando estandartes…", 0.75);
    this.retratos = crearRetratos([...Object.keys(UNIDADES), ...Object.keys(EDIFICIOS), "mina"], this.mundo.jugadores[JUGADOR].color, this.ctx.escena.environment);
    precargar([...Object.keys(EDIFICIOS), "mina"], this.mundo.jugadores.map(J => J.color));
    this.vista = new Vista(this.ctx, this.mundo, this.terreno);
    this.lentos = [];
    this.hud = new HUD($("#hud"), this.mundo, this.retratos, this);
    this.controles = new Controles(this, $("#lienzo"), $("#cuadro"));
    this.configuracion = new Configuracion($("#config"));
    // cada cambio de configuración se aplica en vivo
    config.alCambiar(v => {
      this.ctx.aplicarGraficos(v.graficos);
      this.terreno.densidadPasto(v.graficos.pasto);
      fijarVolumen(v.audio.volumen);
      this.calidad = v.graficos.calidad;
    });
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
    if (config.valor.elegidaPorPersona) return;
    let cuadros = 0, t0 = performance.now();
    const contar = () => {
      if (this.estado !== "menu" || config.valor.elegidaPorPersona) return;
      cuadros++;
      const s = (performance.now() - t0) / 1000;
      if (s < 3) { requestAnimationFrame(contar); return; }
      const fps = cuadros / s, menor = { alta: "media", media: "baja", personalizada: "media" }[this.calidad];
      if (fps < 26 && menor) {
        config.usarPreset(menor); config.aplicar();               // se baja en vivo y se vuelve a medir
        cuadros = 0; t0 = performance.now();
        setTimeout(() => requestAnimationFrame(contar), 1000);
      }
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
    const inicio = performance.now(), crudo = t - this.ultimo;
    // registro de cuadros lentos (más de un cuarto de segundo): __coronas.lentos en la consola dice qué pasó
    if (crudo > 250 && this.estado === "jugando" && this.lentos.length < 30) {
      this.lentos.push({ ms: Math.round(crudo), seg: Math.round(this.mundo.tiempo), ultimo: this.ultimoCuadro });
      console.warn("Cuadro lento", this.lentos[this.lentos.length - 1]);
    }
    const dt = Math.min(0.25, crudo / 1000); this.ultimo = t;
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
    const etapa = (nombre, f) => { try { f(); } catch (e) { this.fallo(nombre, e); } };
    if (this.estado !== "cargando") etapa("controles", () => this.controles.actualizar(dt));
    etapa("vista", () => this.vista.actualizar(dt, this.estado === "jugando" ? this.acum / TICK : 1));
    etapa("terreno", () => this.terreno.actualizar(dt));
    etapa("niebla", () => this.niebla.actualizar(this.mundo.jugadores[JUGADOR].vis, dt, this.estado === "menu"));
    etapa("camara", () => this.ctx.ubicarCamara(this.alturaEn));
    if (this.estado === "jugando" || this.estado === "pausa") etapa("hud", () => this.hud.actualizar(this.sel));
    const antesDibujo = performance.now();
    etapa("dibujo", () => this.ctx.dibujar());
    this.ultimoCuadro = { logica: Math.round(antesDibujo - inicio), dibujo: Math.round(performance.now() - antesDibujo) };
  }

  // un error en una etapa del cuadro no puede congelar el juego: se avisa una vez por etapa en la consola
  fallo(etapa, e) {
    this.fallas ||= new Set();
    if (this.fallas.has(etapa)) return;
    this.fallas.add(etapa);
    console.error(`[Coronas] falló «${etapa}» (el juego sigue):`, e);
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
        case "nivel":
          if (mio) { this.hud.aviso(`¡Tu reino ahora es ${NIVELES[ev.nivel].nombre}! Se destrabó: ${destrabesDe(ev.nivel).join(", ")}.`, "logro"); sonar("victoria"); }
          else this.hud.aviso(`El reino rival llegó a ${NIVELES[ev.nivel].nombre}.`);
          break;
        case "investigado": if (mio) { this.hud.aviso(`Investigación terminada: ${INVESTIGACIONES[ev.inv].nombre}.`, "logro"); sonar("construido"); } break;
        case "entrenada": if (mio) sonar("entrenado", 0.3); break;
        case "minaAgotada": if (this.mundo.explorado(JUGADOR, ev.x, ev.z)) this.hud.aviso("Se agotó una mina de oro."); break;
        case "arbolCae": this.hud.mini.marcarSucio(); break;
        case "golpe": if (this.mundo.visible(JUGADOR, ev.x, ev.z)) sonar("espada", 0.09); break;
        case "muerte": if (ev.clase === "edificio" && this.mundo.explorado(JUGADOR, ev.x, ev.z)) { sonar("derrumbe", 0.5); if (mio) this.hud.aviso(`Perdimos: ${EDIFICIOS[ev.entTipo].nombre}.`, "alerta"); } break;
        case "fin": setTimeout(() => this.fin(ev.ganador === JUGADOR), 1800); break;
      }
    }
    const ahora = performance.now() / 1000;
    this.alertasMini = this.alertasMini.filter(a => ahora - a.t < (a.oro ? 14 : 6));
  }

  /* ================================================================ acciones (las usan HUD y controles) */

  jugando() { return this.estado === "jugando"; }
  ordenar(o) {
    const r = this.mundo.ordenar(JUGADOR, o);
    if (!r.ok && r.msg) { this.hud.aviso(r.msg, "error"); sonar("error", 0.3); }
    return r;
  }
  modo() { return this.modoActual?.tipo || null; }
  soltarEdificio(shift) {
    const m = this.modoActual; if (!m || !this.colocando) return;
    m.soltando = true;
    try { this.clicModo(this.colocando.x, this.colocando.z, shift); } finally { if (this.modoActual) this.modoActual.soltando = false; this.colocando = null; }
  }
  cancelarModo() { this.colocando = null; this.modoActual = null; this.lineaMuro = null; this.vista.mostrarFantasma(null); this.vista.mostrarLinea([]); document.body.dataset.modo = ""; }

  /* ---------------------------------------------------------------- muros en línea (barricadas y murallas) */

  // casillas de la línea entre dos puntos (recta en el eje dominante o en diagonal), con su validez
  casillasLinea(x0, z0, x1, z1, tipo) {
    const a = { x: Math.floor(x0), z: Math.floor(z0) }, b = { x: Math.floor(x1), z: Math.floor(z1) };
    const dx = b.x - a.x, dz = b.z - a.z, pasos = Math.min(40, Math.max(Math.abs(dx), Math.abs(dz)));
    const res = [], vistas = new Set();
    for (let i = 0; i <= pasos; i++) {
      const x = a.x + Math.round(pasos ? dx * i / pasos : 0), z = a.z + Math.round(pasos ? dz * i / pasos : 0), k = z * 1000 + x;
      if (vistas.has(k)) continue; vistas.add(k);
      res.push({ x, z, ok: !this.mundo.motivoNoConstruir(JUGADOR, tipo, x, z) });
    }
    return res;
  }
  esMuro() { return this.modoActual?.tipo === "construir" && EDIFICIOS[this.modoActual.edificio].muro; }
  finLinea(x, z, shift) {
    const tipo = this.modoActual.edificio, ini = this.lineaMuro; this.lineaMuro = null;
    const casillas = this.casillasLinea(ini.x, ini.z, x, z, tipo).filter(c => c.ok);
    this.vista.mostrarLinea([]);
    const peones = this.propias().filter(e => e.clase === "unidad" && UNIDADES[e.tipo].construye);
    if (!peones.length || !casillas.length) return;
    // un solo peón levanta la línea en orden, empezando por la punta más cercana; los peones libres de cerca ayudan solos
    peones.sort((a, b) => Math.hypot(a.x - ini.x, a.z - ini.z) - Math.hypot(b.x - ini.x, b.z - ini.z));
    const peon = peones[0];
    let hechas = 0;
    for (const c of casillas) {
      const r = this.ordenar({ tipo: "construir", ids: [peon.id], edificio: tipo, tx: c.x, tz: c.z, encolar: hechas > 0 || shift });
      if (!r.ok) break;
      hechas++;
    }
    if (hechas) { sonar("orden"); if (hechas < casillas.length) this.hud.aviso(`Alcanzó para ${hechas} de ${casillas.length} tramos.`, "error"); }
    if (!shift) this.cancelarModo();
  }

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
  // pone (x, z) en el centro útil de la pantalla (un poco arriba del medio, por el panel de abajo), con la cámara girada o no
  // (0,2 de la distancia: el panel de abajo tapa casi un tercio de la pantalla)
  centrar(x, z) { const c = this.ctx.cam, d = c.distancia * 0.2; c.objetivo.x = x + Math.sin(c.giro) * d; c.objetivo.z = z + Math.cos(c.giro) * d; }
  // girar: el edificio que se está ubicando o los edificios propios seleccionados
  girarEdificio(sentido = 1) {
    if (this.modoActual?.tipo === "construir") { this.modoActual.rot = ((this.modoActual.rot || 0) + sentido + 4) % 4; sonar("clic"); return true; }
    const eds = this.propias().filter(e => e.clase === "edificio");
    if (eds.length) { this.ordenar({ tipo: "girar", ids: eds.map(e => e.id), sentido }); sonar("clic"); return true; }
    return false;
  }
  // dir: 1 izquierda, -1 derecha (de a 45°), 0 = volver al norte por el camino más corto
  rotar(dir) {
    const c = this.ctx.cam;
    if (dir === 0) c.giroObj = Math.round(c.giroObj / (Math.PI * 2)) * Math.PI * 2;
    else c.giroObj += dir * Math.PI / 4;
  }
  irAAlerta() { if (this.ultimaAlerta) this.centrar(this.ultimaAlerta.x, this.ultimaAlerta.z); else if (this.sel.length) { const e = this.mundo.ents.get(this.sel[0]); this.centrar(e.x, e.z); } }
  alertas() { return this.alertasMini; }
  // punto cardinal de un vector del mapa (el norte es -z, como se ve con la cámara sin girar)
  direccion(dx, dz) {
    const a = Math.atan2(dx, -dz), i = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
    return ["norte", "noreste", "este", "sudeste", "sur", "sudoeste", "oeste", "noroeste"][i];
  }

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
      case "girar": this.girarEdificio(1); break;
      case "mejorar": { const e = propias.find(e => e.tipo === "castillo"); if (e && this.ordenar({ tipo: "mejorar", id: e.id }).ok) sonar("orden"); break; }
      case "investigar": { const e = propias.find(e => e.clase === "edificio" && EDIFICIOS[e.tipo].investiga); if (e && this.ordenar({ tipo: "investigar", id: e.id, inv: c.inv }).ok) sonar("orden"); break; }
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
    else if (m.tipo === "construir" && EDIFICIOS[m.edificio].muro) { this.lineaMuro = { x, z }; return; }
    else if (m.tipo === "construir" && !m.soltando) {
      // se fija el lugar; mientras se arrastra, el edificio gira hacia el mouse; al soltar se ordena
      const lado = EDIFICIOS[m.edificio].lado;
      this.colocando = { x, z, tx: Math.floor(x - lado / 2 + 0.5), tz: Math.floor(z - lado / 2 + 0.5) };
      return;
    }
    else if (m.tipo === "construir") {
      const lado = EDIFICIOS[m.edificio].lado, tx = this.colocando.tx, tz = this.colocando.tz;
      const peones = propias.filter(e => e.clase === "unidad" && UNIDADES[e.tipo].construye);
      // va el peón más cercano; con Shift la obra se encola para el mismo peón y se sigue ubicando
      peones.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
      const quien = shift ? [peones.find(p => p.orden?.tipo === "construir") || peones[0]] : peones.slice(0, 1);
      const r = this.ordenar({ tipo: "construir", ids: quien.map(e => e.id), edificio: m.edificio, tx, tz, encolar: shift, rot: m.rot || 0 });
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
    if (this.lineaMuro && this.esMuro()) {
      this.vista.mostrarFantasma(null);
      this.vista.mostrarLinea(this.casillasLinea(this.lineaMuro.x, this.lineaMuro.z, p.x, p.z, this.modoActual.edificio));
      return;
    }
    if (this.modoActual?.tipo === "construir" && this.colocando) {
      // arrastrando: la fachada mira hacia el puntero (de a cuartos de vuelta)
      const c = this.colocando, lado = EDIFICIOS[this.modoActual.edificio].lado;
      const cx = c.tx + lado / 2, cz = c.tz + lado / 2, dx = p.x - cx, dz = p.z - cz;
      if (Math.hypot(dx, dz) > 0.8) this.modoActual.rot = ((Math.round(Math.atan2(dx, dz) / (Math.PI / 2)) % 4) + 4) % 4;
      this.vista.mostrarFantasma(this.modoActual.edificio, c.tx, c.tz, !this.mundo.motivoNoConstruir(JUGADOR, this.modoActual.edificio, c.tx, c.tz), this.modoActual.rot || 0);
      this.vista.hover = null;
      return;
    }
    if (this.modoActual?.tipo === "construir") {
      const tipo = this.modoActual.edificio, lado = EDIFICIOS[tipo].lado;
      const tx = Math.floor(p.x - lado / 2 + 0.5), tz = Math.floor(p.z - lado / 2 + 0.5);
      this.vista.mostrarFantasma(tipo, tx, tz, !this.mundo.motivoNoConstruir(JUGADOR, tipo, tx, tz), this.modoActual.rot || 0);
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
        <button class="jugar" id="jugar">Comenzar la batalla</button>
        <button class="sec" id="abrir-config">Configuración · gráficos, controles y sonido</button>
        <details class="ayuda"><summary>Cómo se juega</summary>
          <ul>
            <li><b>Clic izquierdo</b> elige; <b>arrastrar</b> elige varios; <b>doble clic</b> elige todos los de ese tipo en pantalla.</li>
            <li><b>Clic derecho</b> da la orden: mover, atacar, minar oro, talar o ayudar a construir.</li>
            <li>Los <b>peones</b> construyen con <kbd>Z</kbd>. Las <b>granjas</b> dan comida para más tropas.</li>
            <li>Comandos con <kbd>Q</kbd> <kbd>W</kbd> <kbd>E</kbd> <kbd>R</kbd> / <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> <kbd>F</kbd> / <kbd>Z</kbd> <kbd>X</kbd> <kbd>C</kbd> <kbd>V</kbd>, según su lugar en la grilla.</li>
            <li><kbd>Ctrl</kbd>+<kbd>1</kbd>…<kbd>9</kbd> arma grupos. <kbd>${nombreTecla(config.valor.teclas.alerta)}</kbd> va a la última alerta.</li>
            <li>Cámara: bordes de pantalla, flechas o arrastrar con el botón del medio para moverte; rueda para el zoom. Para <b>rotar</b>: <kbd>Shift</kbd> + arrastrar con el botón del medio, <kbd>Ctrl</kbd>+<kbd>←</kbd> <kbd>→</kbd>, <kbd>${nombreTecla(config.valor.teclas.girarIzq)}</kbd> <kbd>${nombreTecla(config.valor.teclas.girarDer)}</kbd> o los botones del minimapa; <kbd>${nombreTecla(config.valor.teclas.norte)}</kbd> vuelve al norte.</li>
            <li>Todas las teclas se pueden cambiar en <b>Configuración</b>.</li>
            <li>Ganás cuando el rival se queda sin edificios ni peones.</li>
          </ul>
        </details>
      </div>
      <a class="salir" href="/juegos">← Catálogo de juegos</a>`;
    m.querySelector("#dif").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; this.dificultad = b.dataset.v; guardar("dificultad", this.dificultad); m.querySelectorAll("#dif button").forEach(x => x.setAttribute("aria-pressed", x === b)); sonar("clic"); });
    m.querySelector("#abrir-config").addEventListener("click", () => { sonar("clic"); m.hidden = true; this.configuracion.abrir(() => { m.hidden = false; }); });
    m.querySelector("#jugar").addEventListener("click", () => this.empezar());
    if (sessionStorage.getItem("coronas-revancha")) { sessionStorage.removeItem("coronas-revancha"); this.empezar(); }
  }

  empezar() {
    $("#menu").hidden = true;
    this.ia = new IA(this.mundo, 1, this.dificultad);
    const castillo = this.mundo.edificiosDe(JUGADOR)[0], mina = this.mundo.minaCercana(castillo.x, castillo.z, 20);
    // los peones arrancan trabajando, como en los RTS modernos: tres a la mina y dos al bosque
    const peones = this.mundo.unidadesDe(JUGADOR);
    if (mina) this.mundo.ordenar(JUGADOR, { tipo: "recolectar", ids: peones.slice(0, 3).map(u => u.id), mina: mina.id });
    const arbol = this.mundo.arbolCercano(castillo.x, castillo.z, 20);
    if (arbol) this.mundo.ordenar(JUGADOR, { tipo: "recolectar", ids: peones.slice(3).map(u => u.id), x: arbol.x, z: arbol.z });
    // encuadre: el castillo y la mina juntos en pantalla
    this.ctx.cam.distanciaObj = 30;
    if (mina) this.centrar(mina.x + (castillo.x - mina.x) * 0.45, mina.z + (castillo.z - mina.z) * 0.45); else this.centrar(castillo.x, castillo.z);
    this.estado = "jugando";
    document.body.classList.add("en-juego");
    if (mina) {
      this.alertasMini.push({ x: mina.x, z: mina.z, t: performance.now() / 1000, oro: true });
      const lado = this.direccion(mina.x - castillo.x, mina.z - castillo.z);
      this.hud.aviso(`Tu mina de oro está al ${lado} del castillo (titila en el minimapa).`);
    }
    sonar("construido");
  }

  menu() {
    if (this.estado === "pausa") { this.continuar(); return; }
    if (this.estado !== "jugando") return;
    this.estado = "pausa";
    const p = $("#pausa"); p.hidden = false;
    p.innerHTML = `<div class="menu-caja chica"><div class="titulo"><span>Pausa</span></div>
      <button class="jugar" data-a="seguir">Seguir jugando</button>
      <button class="sec" data-a="config">Configuración</button>
      <button class="sec" data-a="reiniciar">Empezar de nuevo</button>
      <a class="sec" href="/juegos/coronas">Volver al menú principal</a>
      <a class="sec" href="/juegos">Salir al catálogo</a></div>`;
    p.onclick = e => {
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (a === "seguir") this.continuar();
      if (a === "config") { p.hidden = true; this.configuracion.abrir(() => { p.hidden = false; }); }
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
