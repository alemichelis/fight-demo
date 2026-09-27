// Partida: rondas, cronómetro, cámara de cine, proyectiles, IA rival y la coreografía de cada fase
// (intro → lucha → K.O. en cámara lenta → pose del ganador → siguiente ronda / fin de partida).
//
// El escenario (Arena), los efectos y los controles los aporta la app y se reutilizan entre partidas.

import * as THREE from "three";
import { Luchador, GOLPES, F } from "./luchador.js";
import { instanciar } from "./personajes.js";
import { HudPelea } from "./hud.js";
import { sfx, ambiental } from "./sonido.js";
import { texturaPunto } from "./tex.js";

const LIMITE = 4.9;
const RONDAS_PARA_GANAR = 2;
const TIEMPO_RONDA = 60;
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp = THREE.MathUtils.clamp;

/* ------------------------------------------------------------------ IA rival */

class IA {
  constructor(nivel = 1) { this.nivel = nivel; this.tick = 0; this.ritmo = 0.2; this.plan = { x: 0 }; this.pulso = null; this.bloqT = 0; }

  decidir(dt, yo, rival, proyectiles) {
    const dx = rival.x - yo.x, d = Math.abs(dx), hacia = Math.sign(dx) || 1;
    this.tick += dt; this.bloqT -= dt;
    if (this.tick >= this.ritmo) {
      this.tick = 0; this.ritmo = 0.14 + Math.random() * 0.2 / this.nivel;
      const p = this.plan = { x: 0 };
      const r = Math.random();
      const amenaza = proyectiles.find(q => q.due === rival && Math.abs(q.x - yo.x) < 3.2 && Math.sign(yo.x - q.x) === q.dir);
      if (amenaza) { if (r < 0.5) p.bloq = true; else if (r < 0.8) p.salto = true; }
      else if (rival.atacando && d < 1.9 && r < 0.42 * this.nivel + 0.1) { p.bloq = true; this.bloqT = 0.35; }
      else if (d > 3.2) { p.x = hacia; if (r < 0.14 && yo.enfriamiento <= 0) this.pulso = "s"; else if (r < 0.2) p.salto = true; }
      else if (d > 1.75) { p.x = hacia; if (r < 0.28) this.pulso = "k"; }
      else {
        if (r < 0.38) this.pulso = "p";
        else if (r < 0.6) this.pulso = "k";
        else if (r < 0.7) { p.abajo = true; this.pulso = "p"; }
        else if (r < 0.78) { p.abajo = true; this.pulso = "k"; }
        else if (r < 0.9) { p.x = -hacia; p.bloq = r < 0.85; }
        else p.salto = true;
      }
      if (!yo.puedeGolpear && !yo.atacando) this.pulso = null;
    }
    const p = this.plan, e = { x: p.x || 0, arriba: !!p.salto, abajo: !!p.abajo, bloq: !!p.bloq, p: false, k: false, s: false, pP: false, pK: false, pS: false };
    if (this.pulso) { e["p" + this.pulso.toUpperCase()] = true; e[this.pulso] = true; this.pulso = null; }
    if (p.salto) p.salto = false;
    return e;
  }
}

/* ------------------------------------------------------------------ partida */

export class Combate {
  /**
   * @param app { render, arena, efectos, controles, ui, retratos }
   * @param opts { defs:[def1, def2], modo:'1p'|'2p', alSalir(destino:'seleccion'|'titulo'|'revancha') }
   */
  constructor(app, opts) {
    this.app = app; this.opts = opts; this.arena = app.arena; this.efectos = app.efectos; this.render = app.render;
    this.escena = this.arena.escena;
    this.modo = opts.modo || "1p";
    this.l = []; this.proy = [];
    this.fase = "carga"; this.faseT = 0; this.ronda = 0; this.victorias = [0, 0];
    this.tiempo = TIEMPO_RONDA; this.escalaTiempo = 1; this.congelarT = 0; this.sacudida = 0; this.pausado = false; this.terminado = false;
    this.t = 0; this.cx = 0; this.camPos = new THREE.Vector3(0, 1.8, 7.4); this.camMira = new THREE.Vector3(0, 1.3, 0);
    this.camara = new THREE.PerspectiveCamera(30, 16 / 9, 0.2, 1500);
    this.ia = new IA(1);
    this.ctx = {
      efectos: this.efectos, limite: LIMITE, hud: null,
      congelar: s => { this.congelarT = Math.max(this.congelarT, s); },
      sacudir: m => { this.sacudida = Math.max(this.sacudida, m); },
      lanzarProyectil: l => this._proyectil(l),
      alMorir: l => this._alMorir(l)
    };
    // proyectil: sprite + núcleo (las luces se reservan en Arena para no recompilar materiales en plena pelea)
    this._punto = texturaPunto();
  }

  async iniciar() {
    const [d1, d2] = this.opts.defs;
    const [a1, a2] = await Promise.all([instanciar(d1), instanciar(d2)]);
    this.l = [new Luchador(a1, 1, -1.7), new Luchador(a2, 2, 1.7)];
    this.l[0].esCPU = false; this.l[1].esCPU = this.modo === "1p";
    for (const l of this.l) this.escena.add(l.actor.raiz);
    this.hud = this.ctx.hud = new HudPelea(this.app.ui, this.l.map(l => ({ def: l.def, retrato: this.app.retratos?.[l.def.id], esCPU: l.esCPU })));
    this.app.controles.alPresionar = (cod, e) => this._tecla(cod, e);
    this.render.mostrar(this.escena, this.camara, this.arena.opciones);
    this._empezarRonda();
    ambiental.poner(0.7);
  }

  destruir() {
    this.app.controles.alPresionar = null;
    for (const l of this.l) { this.escena.remove(l.actor.raiz); l.actor.mixer.stopAllAction(); }
    for (const p of this.proy) this.escena.remove(p.obj);
    this.proy = [];
    for (const luz of this.arena.luzProj) luz.intensity = 0;
    this.hud?.destruir();
  }

  /* ---------------------------------------------------------------- flujo de rondas */

  _empezarRonda() {
    this.ronda++;
    this.tiempo = TIEMPO_RONDA; this.escalaTiempo = 1; this.congelarT = 0;
    for (const p of this.proy) this.escena.remove(p.obj); this.proy = [];
    this.l.forEach((l, i) => {
      l.reiniciar(i === 0 ? -1.7 : 1.7);
      l.estado = "intro"; l.t = 0;
      l.actor.jugar("intro", { bucle: false, dur: 1.5, fade: 0.1 }) || l.actor.jugar("idle", { fade: 0.1 });
    });
    this.hud.reiniciarBarras(); this.hud.rondas(...this.victorias); this.hud.tiempo(this.tiempo);
    this.fase = "intro"; this.faseT = 0; this._introDur = this.ronda === 1 ? 3.1 : 2.1;
    this._anunciado = 0;
    this.render.flash.w = 0;
  }

  _alMorir(l) {
    if (this.fase !== "lucha") return;
    this.fase = "ko"; this.faseT = 0; this.perdedor = l;
    this.escalaTiempo = 0.28;
    this.hud.anunciar("K.O.", { dur: 2.4, clase: "ko" }); sfx.ko();
    this.render.flash.set(1, 0.92, 0.8, 0.85);
  }

  _finRonda(ganador) {                        // ganador: Luchador | null (empate)
    this.ganador = ganador;
    if (ganador) this.victorias[ganador.idx - 1]++; else { this.victorias[0]++; this.victorias[1]++; }
    this.hud.rondas(...this.victorias);
    const gana = this.victorias.findIndex(v => v >= RONDAS_PARA_GANAR);
    this.escalaTiempo = 1;
    for (const l of this.l) if (l.vivo && l.estado !== "ko" && (!ganador || l === ganador)) { l.estado = "win"; l.t = 0; l.vx = 0; l.actor.jugar("win", { fade: 0.25, bucle: true }) || l.actor.jugar("idle"); }
    if (gana >= 0 && this.victorias[0] !== this.victorias[1]) {
      this.fase = "ganador"; this.faseT = 0; this.finPartida = true; this.campeon = this.l[this.victorias[0] > this.victorias[1] ? 0 : 1];
      this.hud.anunciar(this.campeon.def.nombre, { sub: "VICTORIA", dur: 0, clase: "ganador" }); sfx.gong(1);
    } else {
      this.fase = "ganador"; this.faseT = 0; this.finPartida = false;
      this.hud.anunciar(ganador ? "RONDA GANADA" : "EMPATE", { sub: ganador ? ganador.def.nombre : "", dur: 2.2, clase: "ganador chico" });
    }
  }

  /* ---------------------------------------------------------------- entrada / pausa */

  _tecla(cod, e) {
    if (this.modo === "torneo") return;                     // en el torneo no se pausa: hay gente mirando y peleando desde otras PCs
    if (this.hud?.teclaMenu(cod)) return;
    if (cod === "Escape" || cod === "KeyP") this._pausar(!this.pausado);
  }

  _pausar(on) {
    if (this.modo === "torneo" || this.terminado || this.menuAbierto || this.fase === "carga") return;
    if (on === this.pausado) return;
    this.pausado = on;
    if (on) this.hud.abrirMenu("PAUSA", [
      { texto: "Continuar", fn: () => this._pausar(false) },
      { texto: "Reiniciar combate", fn: () => this._salir("revancha") },
      { texto: "Elegir personaje", fn: () => this._salir("seleccion") },
      { texto: "Menú principal", fn: () => this._salir("titulo") }
    ]);
    else this.hud.cerrarMenu();
  }

  _salir(destino) { if (this.terminado) return; this.terminado = true; this.opts.alSalir(destino); }

  _menuFin() {
    this.hud.abrirMenu(`${this.campeon.def.nombre} GANA`, [
      { texto: "Revancha", fn: () => this._salir("revancha") },
      { texto: "Elegir personaje", fn: () => this._salir("seleccion") },
      { texto: "Menú principal", fn: () => this._salir("titulo") }
    ], `${this.victorias[0]} — ${this.victorias[1]}`);
  }

  /* ---------------------------------------------------------------- proyectiles */

  _proyectil(l) {
    if (this.proy.some(p => p.due === l)) return;
    const g = new THREE.Group();
    const c = new THREE.Color(l.color);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._punto, color: c.clone().multiplyScalar(3.2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.setScalar(1.35);
    const nucleo = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5, 5) }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._punto, color: new THREE.Color(4, 3.2, 2.4), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    halo.scale.setScalar(0.5);
    g.add(glow, nucleo, halo);
    const p = { due: l, dir: l.cara, x: l.x + l.cara * 0.75, y: 1.35, v: 8.2, t: 0, obj: g, color: l.color };
    g.position.set(p.x, p.y, 0.1); this.escena.add(g); this.proy.push(p);
    sfx.proyectil();
    this.efectos.onda({ x: p.x, y: p.y, z: 0.1 }, l.color, 1.0, 0.25);
  }

  _explotar(p, color = p.color) {
    const pos = { x: p.x, y: p.y, z: 0.1 };
    this.efectos.chispas(pos, color, 34, 0, 1.1); this.efectos.onda(pos, color, 2.0, 0.35); this.efectos.destello(pos, color, 90);
    sfx.explosion(); this.sacudida = Math.max(this.sacudida, 0.14);
    this.escena.remove(p.obj);
  }

  _actualizarProyectiles(dt) {
    const luces = this.arena.luzProj;
    luces.forEach(l => { l.intensity = 0; });
    for (const p of [...this.proy]) {
      p.t += dt; p.x += p.dir * p.v * dt;
      p.obj.position.set(p.x, p.y + Math.sin(p.t * 20) * 0.03, 0.1);
      p.obj.children[0].scale.setScalar(1.25 + Math.sin(p.t * 34) * 0.14);
      this.efectos.brasas({ x: p.x - p.dir * 0.2, y: p.y, z: 0.1 }, p.color, 2);
      const luz = luces[p.due.idx - 1]; luz.position.set(p.x, p.y, 0.9); luz.color.set(p.color); luz.intensity = 22;
      const rival = this.l[p.due.idx === 1 ? 1 : 0];
      const quitar = () => { this.proy.splice(this.proy.indexOf(p), 1); };
      const choque = this.proy.find(q => q !== p && q.due !== p.due && Math.abs(q.x - p.x) < 0.55);
      if (choque) { this._explotar(p, "#ffffff"); this._explotar(choque, "#ffffff"); this.proy.splice(this.proy.indexOf(choque), 1); quitar(); continue; }
      if (Math.abs(p.x - rival.x) < 0.42 && rival.y < 0.6 && !rival.agachado && !["down", "getup", "ko"].includes(rival.estado)) {
        const r = rival.recibir(GOLPES.special, p.due, this.ctx, true);
        if (r !== "ignorado") { this._explotar(p); quitar(); continue; }
      }
      if (Math.abs(p.x) > LIMITE + 2.2 || p.t > 1.8) { this._explotar(p); quitar(); }
    }
  }

  /* ---------------------------------------------------------------- cámara */

  _actualizarCamara(dt) {
    const [a, b] = this.l, t = this.t;
    const sep = Math.abs(a.x - b.x), medio = (a.x + b.x) / 2;
    const FOV = 30, ancho = 2 * Math.tan(FOV * Math.PI / 360) * this.camara.aspect;
    // el encuadre se abre lo justo para que entren los dos luchadores con aire a los lados
    let objX = clamp(medio * 0.9, -3.4, 3.4), dist = clamp((sep + 2.5) / ancho, 5.2, 11.5), alto = 1.5 + dist * 0.028, mira = 1.18, fov = FOV, foco;
    const pos = this.camPos, look = this.camMira;

    if (this.fase === "intro") {
      const u = ease(clamp(this.faseT / this._introDur, 0, 1));
      const ini = new THREE.Vector3(-4.6 - u * 0, 0.95, 4.4), ini2 = new THREE.Vector3(objX - 1.2, 1.55, 0);
      const fin = new THREE.Vector3(objX, alto, dist), fin2 = new THREE.Vector3(objX, mira, 0);
      // barrido: desde bajo y de costado, pasando entre las columnas, hasta el plano de pelea
      const orb = ease(clamp(this.faseT / this._introDur, 0, 1));
      pos.lerpVectors(ini, fin, orb); pos.y += Math.sin(orb * Math.PI) * 0.35;
      look.lerpVectors(ini2, fin2, orb);
      this.cx = objX; fov = FOV - (1 - u) * 5;
    } else if (this.fase === "ko") {
      const u = ease(clamp(this.faseT / 1.6, 0, 1)), p = this.perdedor;
      const mx = (p.x * 0.6 + medio * 0.4);
      pos.set(this.cx + (mx - this.cx) * u, alto - 0.2 * u, Math.max(3.6, dist - 1.8 * u)); look.set(mx, mira + 0.05, 0); fov = FOV - 4 * u;
    } else if (this.fase === "ganador") {
      const w = this.finPartida ? this.campeon : (this.ganador || this.l[0]);
      const u = ease(clamp(this.faseT / 1.4, 0, 1)), orb = this.faseT * 0.16;
      const objP = new THREE.Vector3(w.x + Math.sin(orb) * 1.2 + w.cara * 0.35, 1.25 + u * 0.15, 3.7 - u * 0.4), objL = new THREE.Vector3(w.x, 1.42, 0);
      pos.lerp(objP, Math.min(1, dt * 2.6)); look.lerp(objL, Math.min(1, dt * 3));
      fov = 27;
    } else {
      this.cx += (objX - this.cx) * Math.min(1, dt * 4.5);
      pos.set(this.cx + Math.sin(t * 0.35) * 0.08, alto + Math.sin(t * 0.5) * 0.03, dist);
      look.set(this.cx, mira, 0);
    }
    // sacudida (decae rápido)
    this.sacudida = Math.max(0, this.sacudida - dt * 1.6);
    const s = this.sacudida * this.sacudida * 2.4;
    const c = this.camara;
    c.position.set(pos.x + (Math.random() - 0.5) * s, pos.y + (Math.random() - 0.5) * s, pos.z);
    c.lookAt(look.x + (Math.random() - 0.5) * s * 0.4, look.y + (Math.random() - 0.5) * s * 0.4, 0);
    if (Math.abs(c.fov - fov) > 0.01) { c.fov += (fov - c.fov) * Math.min(1, dt * 3); c.updateProjectionMatrix(); }
    foco = c.position.distanceTo(new THREE.Vector3(look.x, look.y, 0));
    this.render.mundo.uniforms.uFocus.value = foco;
    this.render.final.uniforms.uContrast.value = 1.1 + (this.fase === "ko" ? 0.1 : 0);
    // el flash decae
    this.render.flash.w = Math.max(0, this.render.flash.w - dt * 2.4);
  }

  /* ---------------------------------------------------------------- bucle */

  update(dtReal) {
    const dt = Math.min(dtReal, 1 / 20);
    this.t += dt;
    if (this.fase === "carga") return;
    if (this.pausado) { this.hud.update(dt); this._actualizarCamara(0); return; }
    if (this.congelarT > 0) { this.congelarT -= dt; }
    const dtJ = this.congelarT > 0 ? 0 : dt * this.escalaTiempo;
    this.faseT += dt * (this.fase === "ko" ? 1 : 1);
    const [a, b] = this.l;
    const controles = this.app.controles;

    /* fases */
    if (this.fase === "intro") {
      if (this.faseT > 0.35 && this._anunciado === 0) {
        this._anunciado = 1;
        this.hud.anunciar(`RONDA ${this.ronda}`, { sub: this.ronda === 1 ? `${a.def.nombre}  ·  ${b.def.nombre}` : "", dur: this._introDur - 1.1 }); sfx.ronda();
      }
      if (this.faseT > this._introDur - 0.75 && this._anunciado === 1) {
        this._anunciado = 2;
        this.hud.anunciar("¡PELEA!", { dur: 0.95, clase: "fight" }); sfx.fight();
        this.render.flash.set(1, 0.75, 0.4, 0.35);
      }
      if (this.faseT >= this._introDur) {
        this.fase = "lucha"; this.faseT = 0;
        for (const l of this.l) { l.estado = "idle"; l.t = 0; l.actor.jugar("idle", { fade: 0.2 }); }
      }
    } else if (this.fase === "lucha") {
      this.tiempo -= dt; this.hud.tiempo(this.tiempo);
      if (this.tiempo <= 0) {
        this.tiempo = 0; this.hud.tiempo(0); this.hud.anunciar("TIEMPO", { dur: 1.6, clase: "ko chico" });
        const ra = a.hp / a.hpMax, rb = b.hp / b.hpMax;
        this.fase = "tiempo"; this.faseT = 0; this._resTiempo = Math.abs(ra - rb) < 0.001 ? null : (ra > rb ? a : b);
      }
    } else if (this.fase === "tiempo") {
      if (this.faseT > 1.8) this._finRonda(this._resTiempo);
    } else if (this.fase === "ko") {
      if (this.faseT > 1.5) this.escalaTiempo = Math.min(1, this.escalaTiempo + dt * 1.2);
      if (this.faseT > 2.7) { const g = this.perdedor === a ? b : a; this._finRonda(g); }
    } else if (this.fase === "ganador") {
      if (this.finPartida) {
        if (this.faseT > 3.2 && !this.menuAbierto) {
          this.menuAbierto = true;
          if (this.modo === "torneo") { this.terminado = true; this.opts.alTerminar?.({ ganador: this.victorias[0] > this.victorias[1] ? 0 : 1, victorias: [...this.victorias] }); }
          else this._menuFin();
        }
      }
      else if (this.faseT > 3.0) this._empezarRonda();
    }

    /* entradas */
    const vacia = { x: 0, arriba: false, abajo: false, bloq: false, p: false, k: false, s: false, pP: false, pK: false, pS: false };
    const juega = this.fase === "lucha";
    let e1 = vacia, e2 = vacia;
    if (juega) {
      const torneo = this.modo === "torneo";
      e1 = controles.leer(1, { compartido: torneo ? controles.fuentes[1] === "local" : this.modo === "1p" });
      e2 = this.modo !== "1p" ? controles.leer(2, { compartido: torneo && controles.fuentes[2] === "local" }) : this.ia.decidir(dtJ, b, a, this.proy);
    } else { controles.leer(1); controles.leer(2); }
    controles.cerrarCuadro();

    if (this.fase === "intro" || this.fase === "ganador") {
      // en las poses el luchador se mantiene (estado intro/win) pero sigue con su física y su mixer
    }
    a.update(dtJ, e1, b, this.ctx); b.update(dtJ, e2, a, this.ctx);
    this._actualizarProyectiles(dtJ);

    const altoPx = this.render.h * this.render.renderer.getPixelRatio();
    this.efectos.update(dt * (this.escalaTiempo < 1 ? Math.max(this.escalaTiempo, 0.4) : 1), this.camara, altoPx);
    this.arena.update(dt, this.camara);
    this.hud.update(dt);
    this._actualizarCamara(dt);
  }
}
