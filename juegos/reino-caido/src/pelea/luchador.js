// Un luchador: estado, física 2.5D (todo ocurre en el plano z=0, a lo largo de X), golpes con ventanas de impacto,
// bloqueo, proyectil especial, reacciones y su capa visual (clip por acción + poses procedurales cuando falta clip).
//
// Los TIEMPOS de cada golpe viven en GOLPES y mandan sobre el clip: `Actor.jugar(accion, { dur })` estira la animación
// para que dure justo lo que dura el golpe. Cuando lleguen los FBX de pelea sólo hay que declararlos (ver personajes.js).

import * as THREE from "three";
import { sfx } from "./sonido.js";

export const F = { vel: 2.5, velAtras: 1.9, salto: 7.4, grav: 21, alto: 1.8, altoAgachado: 1.0, ancho: 0.34, minSeparacion: 0.85 };

/**
 * act: ventana [desde, hasta] (s) donde el golpe puede conectar · alcance: m desde el cuerpo · altura: 'alto'|'medio'|'bajo'
 * empuje: m/s al rival · lanza: 'aire' (uppercut) | 'suelo' (barrida) · avance: m que da el luchador durante el golpe
 */
export const GOLPES = {
  punch:    { accion: "punch",    dur: 0.44, act: [0.11, 0.2],  alcance: 1.05, dmg: 6,  stun: 0.34, empuje: 1.7, altura: "alto",  avance: 0.25, fuerza: 0.35, whoosh: 0.12 },
  kick:     { accion: "kick",     dur: 0.66, act: [0.22, 0.34], alcance: 1.5,  dmg: 9,  stun: 0.46, empuje: 3.2, altura: "medio", avance: 0.5,  fuerza: 0.6,  whoosh: 0.2 },
  uppercut: { accion: "uppercut", dur: 0.66, act: [0.16, 0.28], alcance: 1.0,  dmg: 12, stun: 0.6,  empuje: 1.4, altura: "alto",  lanza: "aire", avance: 0.2, fuerza: 0.9, whoosh: 0.16 },
  sweep:    { accion: "sweep",     dur: 0.7,  act: [0.2, 0.32],  alcance: 1.4,  dmg: 8,  stun: 0.5,  empuje: 2.4, altura: "bajo",  lanza: "suelo", avance: 0.4, fuerza: 0.7, whoosh: 0.18 },
  air:      { accion: "airkick",     dur: 0.5,  act: [0.05, 0.42], alcance: 1.05, dmg: 7,  stun: 0.4,  empuje: 2.4, altura: "aire",  fuerza: 0.5, whoosh: 0.05 },
  special:  { accion: "special",  dur: 0.82, disparo: 0.34, dmg: 8, stun: 0.5, empuje: 3.6, fuerza: 0.7, enfriamiento: 1.7 }
};

export const ESTADOS_LIBRES = new Set(["idle", "walk", "crouch", "block"]);
const norm = a => Math.atan2(Math.sin(a), Math.cos(a));

export class Luchador {
  /** @param actor Actor (personajes.js) · @param idx 1|2 · @param x posición inicial */
  constructor(actor, idx, x, color) {
    this.actor = actor; this.idx = idx; this.color = color || actor.def.color;
    this.def = actor.def;
    this.x = x; this.y = 0; this.vx = 0; this.vy = 0;
    this.cara = x < 0 ? 1 : -1;
    this.hp = 100; this.hpMax = 100;
    this.estado = "idle"; this.t = 0;
    this.golpe = null; this.golpeConecto = false; this.disparado = false;
    this.enfriamiento = 0; this.combo = 0; this.comboT = 0;
    this.avanceHecho = 0; this.aereoUsado = false; this.aereoX = 0;
    this.escudo = 0; this.pausa = 0;
    this.giro = this.cara > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.entrada = {};
    this.gritoT = 0; this.buf = { p: 0, k: 0, s: 0 };
    this._acc = null;
    this._crearEscudo();
    this.actor.raiz.rotation.y = this.giro;
    this.actor.raiz.position.set(x, 0, 0);
  }

  _crearEscudo() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color(this.color) }, uI: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
      fragmentShader: "uniform vec3 uCol; uniform float uI; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2); gl_FragColor = vec4(uCol * (0.35 + f * 2.6) * uI, (0.12 + f) * uI); }"
    });
    this.escudoMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), mat);
    this.escudoMesh.scale.set(0.45, 1.05, 0.9); this.escudoMesh.position.set(0, 0.95, 0.42); this.escudoMesh.visible = false; this.escudoMesh.renderOrder = 7;
    this.actor.raiz.add(this.escudoMesh);
  }

  /** Vuelve a la posición de salida con la vida llena (entre rondas). */
  reiniciar(x) {
    this.hp = this.hpMax; this.x = x; this.y = 0; this.vx = this.vy = 0;
    this.cara = x < 0 ? 1 : -1; this.giro = this.cara > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.estado = "idle"; this.t = 0; this.golpe = null; this.ko = false; this.combo = 0; this.comboT = 0; this.enfriamiento = 0;
    this.buf = { p: 0, k: 0, s: 0 }; this.escudo = 0; this.lado = null;
    this.actor.pivote.rotation.set(0, 0, 0); this.actor.pivote.scale.set(1, 1, 1);
    this.actor.raiz.position.set(x, 0, 0); this.actor.raiz.rotation.y = this.giro;
  }

  get vivo() { return this.hp > 0; }
  get agachado() { return this.estado === "crouch" || this.golpe === GOLPES.sweep; }
  get enAire() { return this.y > 0.02; }
  get atacando() { return this.estado === "atk"; }
  get puedeGolpear() { return ESTADOS_LIBRES.has(this.estado); }

  _cambiar(estado, opts = {}) {
    this.estado = estado; this.t = 0;
    return this;
  }

  /* ---------------------------------------------------------------- acciones */

  _iniciarGolpe(g) {
    this.buf.p = this.buf.k = this.buf.s = 0;
    this.golpe = g; this.golpeConecto = false; this.disparado = false; this.avanceHecho = 0;
    this._cambiar("atk");
    this.actor.jugar(g.accion, { dur: g.dur, bucle: false, fade: 0.06 });
    if (g.whoosh !== undefined) setTimeout(() => sfx.whoosh(g === GOLPES.kick ? 1 : 0), g.act ? g.act[0] * 900 : 200);
    if (g === GOLPES.special) this.enfriamiento = g.enfriamiento;
  }

  saltar(vx) { this.vy = F.salto; this.vx = vx; this.aereoUsado = false; this._cambiar("jump"); sfx.salto(); this.actor.jugar("jump", { fade: 0.1 }); }

  /* ---------------------------------------------------------------- daño */

  /**
   * Devuelve 'golpe' | 'bloqueo' | 'ignorado'. `ctx` aporta efectos, sonido y cámara.
   */
  recibir(g, atacante, ctx, esProyectil = false) {
    if (!this.vivo && this.estado !== "launched") return "ignorado";
    if (["down", "getup", "ko"].includes(this.estado)) return "ignorado";
    const dir = atacante.cara;                                    // hacia dónde lo empujan
    const centro = { x: this.x, y: this.y + 1.15, z: 0 };
    const de_frente = atacante.x < this.x ? this.cara < 0 : this.cara > 0;
    const puedeBloquear = this.estado === "block" && !this.enAire && de_frente && !(g.altura === "bajo" && !this.agachado && false);
    if (puedeBloquear) {
      const dmg = g.dmg * 0.12;
      this.hp = Math.max(1, this.hp - dmg);
      this.vx = dir * g.empuje * 0.55; this.escudo = 1; this.pausa = 0.03;
      ctx.efectos.chispas(centro, "#8fd0ff", 12, dir, 0.7); ctx.efectos.onda(centro, "#9ad4ff", 1.0, 0.22);
      sfx.bloqueo(); ctx.sacudir(0.05);
      atacante.vx -= dir * 1.2;
      return "bloqueo";
    }
    // impacto real
    atacante.combo = atacante.comboT > 0 ? atacante.combo + 1 : 1; atacante.comboT = 1.1;
    const escala = Math.max(0.35, 1 - (atacante.combo - 1) * 0.12);
    const dmg = Math.round(g.dmg * escala * 10) / 10;
    this.hp = Math.max(0, this.hp - dmg);
    ctx.hud.dano(this.idx, this.hp / this.hpMax, atacante.idx, atacante.combo);
    const fuerte = g.fuerza ?? 0.5;
    ctx.efectos.chispas(centro, g.lanza ? "#ffe0a0" : "#ffb45a", 18 + fuerte * 26, dir, 0.8 + fuerte * 0.7);
    ctx.efectos.onda(centro, "#ffd9a0", 0.55 + fuerte * 0.6, 0.26);
    ctx.efectos.destello({ x: centro.x, y: centro.y, z: 0.8 }, "#ffb060", 30 + fuerte * 60);
    sfx.golpe(fuerte);
    ctx.congelar(0.045 + fuerte * 0.07); ctx.sacudir(0.09 + fuerte * 0.18);
    this.pausa = 0;
    this.golpe = null; this.disparado = false;
    this.tiempoHit = g.stun;
    if (!this.vivo) { this._lanzar(dir, 4.6, 6.4); this.ko = true; ctx.alMorir(this); return "golpe"; }
    if (g.lanza === "aire") this._lanzar(dir, g.empuje + 1.2, 6.2);
    else if (g.lanza === "suelo") this._lanzar(dir, 2.2, 3.4);
    else { this.vx = dir * g.empuje; this._cambiar("hit"); this.actor.jugar("hit", { fade: 0.03 }) || this.actor.jugar("idle", { fade: 0.03 }); this.golpeoRecibido = 0; }
    return "golpe";
  }

  _lanzar(dir, vx, vy) {
    this.vx = dir * vx; this.vy = vy; this.y = Math.max(this.y, 0.03);
    this._cambiar("launched");
    this.actor.jugar("knockdown", { bucle: false, fade: 0.05, dur: 1.15 }) || this.actor.jugar("idle");
  }

  /* ---------------------------------------------------------------- bucle */

  update(dt, e, rival, ctx) {
    // buffer: un botón apretado un instante antes de quedar libre no se pierde
    const B = this.buf;
    for (const k of ["p", "k", "s"]) B[k] = Math.max(0, B[k] - dt);
    if (e.pP) B.p = 0.17; if (e.pK) B.k = 0.17; if (e.pS) B.s = 0.17;
    e = { ...e, pP: B.p > 0, pK: B.k > 0, pS: B.s > 0 };
    this.entrada = e;
    this.t += dt;
    this.enfriamiento = Math.max(0, this.enfriamiento - dt);
    this.comboT = Math.max(0, this.comboT - dt); if (this.comboT === 0) this.combo = 0;
    this.escudo = Math.max(0, this.escudo - dt * 5);
    if (this.estado === "block") this.escudo = Math.max(this.escudo, 0.16);
    const cara = Math.sign(rival.x - this.x) || this.cara;

    switch (this.estado) {
      case "idle": case "walk": case "crouch": case "block": this._libre(dt, e, cara, rival, ctx); break;
      case "jump": this._salto(dt, e, cara, rival, ctx); break;
      case "atk": this._golpear(dt, cara, rival, ctx); break;
      case "hit":
        this.vx *= Math.pow(0.02, dt);
        if (this.t >= (this.tiempoHit || 0.3)) { this._cambiar("idle"); this.actor.jugar("idle", { fade: 0.1 }); }
        break;
      case "launched": this._volando(dt, ctx); break;
      case "down":
        this.vx *= Math.pow(0.0005, dt);
        if (this.t > (this.ko ? 99 : 0.55)) { this._cambiar("getup"); this.actor.jugar("getup", { bucle: false, dur: 0.85 }) || this.actor.jugar("idle"); }
        break;
      case "getup": if (this.t > 0.85) { this._cambiar("idle"); this.actor.jugar("idle", { fade: 0.15 }); } break;
      case "ko": case "win": case "intro": this.vx *= Math.pow(0.001, dt); break;
    }

    // orientación: siempre mira al rival, salvo en el aire o bajo golpe
    if (ESTADOS_LIBRES.has(this.estado)) this.cara = cara;
    if (this.estado === "hit" || this.estado === "atk") this.cara = this.cara;

    // integración horizontal con límites de arena y separación mínima
    if (this.estado !== "ko" || Math.abs(this.vx) > 0.01) this.x += this.vx * dt;
    const L = ctx.limite;
    if (this.x < -L) { this.x = -L; if (this.vx < 0) this.vx = 0; } else if (this.x > L) { this.x = L; if (this.vx > 0) this.vx = 0; }
    this._separar(rival, dt, ctx);

    if (!Number.isFinite(this.x + this.y + this.vx + this.vy)) { this.x = rival.x + (this.cara > 0 ? -1.5 : 1.5); this.y = this.vx = this.vy = 0; }   // salvaguarda: un NaN dejaría la escena negra
    this._visual(dt, ctx);
  }

  _libre(dt, e, cara, rival, ctx) {
    const atras = e.x !== 0 && Math.sign(e.x) !== cara;
    if (e.bloq && !e.abajo) { if (this.estado !== "block") { this._cambiar("block"); this.actor.jugar("block", { fade: 0.1 }) || this.actor.jugar("idle", { fade: 0.1 }); } this.vx = 0; return; }
    if (e.abajo) {
      if (this.estado !== "crouch") { this._cambiar("crouch"); this.actor.jugar("crouch", { fade: 0.1 }); }
      this.vx = 0;
      if (e.bloq) { this.estado = "block"; }
      if (e.pP) this._iniciarGolpe(GOLPES.uppercut);
      else if (e.pK) this._iniciarGolpe(GOLPES.sweep);
      else if (e.pS && this.enfriamiento <= 0) this._iniciarGolpe(GOLPES.special);
      return;
    }
    if (e.arriba) { this.saltar(e.x * F.vel * 1.15); return; }
    if (e.pP) return this._iniciarGolpe(GOLPES.punch);
    if (e.pK) return this._iniciarGolpe(GOLPES.kick);
    if (e.pS && this.enfriamiento <= 0) return this._iniciarGolpe(GOLPES.special);
    if (e.x !== 0) {
      const v = atras ? F.velAtras : F.vel;
      this.vx = e.x * v;
      if (this.estado !== "walk" || this._atras !== atras) { this._cambiar("walk"); this._atras = atras; this.actor.jugar(atras ? "back" : "walk", { velocidad: atras ? -0.9 : 1.15, fade: 0.12 }); }
      else this.actor.actual && (this.actor.actual.timeScale = atras ? -0.9 : 1.15);
    } else {
      this.vx = 0;
      if (this.estado !== "idle") { this._cambiar("idle"); this.actor.jugar("idle", { fade: 0.15 }); }
    }
  }

  _salto(dt, e, cara, rival, ctx) {
    this.vy -= F.grav * dt; this.y += this.vy * dt;
    if (!this.aereoUsado && (e.pP || e.pK) && this.y > 0.35) { this.aereoUsado = true; this._iniciarGolpe(GOLPES.air); this.vy = Math.max(this.vy, 0); return; }
    if (this.y <= 0) { this.y = 0; this.vy = 0; this.vx = 0; this._aterrizar(ctx); }
  }

  _aterrizar(ctx) {
    sfx.aterrizar(); ctx.efectos.polvo({ x: this.x, y: 0, z: 0 }, 10, 0.8); ctx.efectos.suelo({ x: this.x, z: 0 }, 1.1, "#c9a27a");
    this._cambiar("idle"); this.actor.jugar("idle", { fade: 0.1 });
  }

  _golpear(dt, cara, rival, ctx) {
    const g = this.golpe, t = this.t;
    if (this.y > 0 || g === GOLPES.air) {                      // golpe aéreo: sigue la física del salto
      this.vy -= F.grav * dt; this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.vx = 0; this.golpe = null; this._aterrizar(ctx); return; }
    } else {
      // avance: el cuerpo acompaña el golpe durante la ventana de impacto
      if (g.avance) { const k = Math.min(1, t / (g.act ? g.act[1] : g.dur)) * g.avance; this.x += this.cara * (k - this.avanceHecho); this.avanceHecho = k; }
      this.vx *= Math.pow(0.001, dt);
    }
    if (g === GOLPES.special) {
      if (!this.disparado && t >= g.disparo) { this.disparado = true; ctx.lanzarProyectil(this); }
    } else if (!this.golpeConecto && t >= g.act[0] && t <= g.act[1]) {
      const dx = (rival.x - this.x) * this.cara;
      const enRango = dx > -0.15 && dx < g.alcance + F.ancho;
      let altoOk = true;
      if (g.altura === "alto") altoOk = !rival.agachado && rival.y < 0.7;
      else if (g.altura === "medio") altoOk = rival.y < 0.9;
      else if (g.altura === "bajo") altoOk = rival.y < 0.15;
      else if (g.altura === "aire") altoOk = Math.abs(rival.y - this.y) < 1.4;
      if (enRango && altoOk) {
        const r = rival.recibir(g, this, ctx);
        if (r !== "ignorado") this.golpeConecto = true;
      }
    }
    if (t >= g.dur) {
      this.golpe = null;
      if (this.y > 0.02) { this._cambiar("jump"); } else { this._cambiar("idle"); this.actor.jugar("idle", { fade: 0.15 }); }
    }
  }

  _volando(dt, ctx) {
    this.vy -= F.grav * dt; this.y += this.vy * dt;
    this.vx *= Math.pow(0.35, dt);
    if (this.y <= 0) {
      this.y = 0; this.vy = 0;
      sfx.caida(); ctx.efectos.polvo({ x: this.x, y: 0, z: 0 }, 22, 1.4); ctx.efectos.suelo({ x: this.x, z: 0 }, 2.2, "#c9a27a"); ctx.sacudir(0.16);
      if (this.ko) { this._cambiar("ko"); this.actor.jugar("ko", { bucle: false, fade: 0.05, dur: 1.6 }) || this.actor.jugar("idle"); }
      else this._cambiar("down");
    }
  }

  /** Los luchadores no se atraviesan en el suelo (sí se puede saltar por encima): se recuerda de qué lado está el rival. */
  _separar(rival, dt, ctx) {
    const suelo = this.y < 0.9 && rival.y < 0.9, caidos = ["ko", "down", "launched"];
    const d = rival.x - this.x, m = F.minSeparacion;
    if (!suelo) { this.lado = null; return; }
    if (!this.lado) this.lado = Math.sign(d) || this.cara;
    if (caidos.includes(this.estado) || caidos.includes(rival.estado)) { this.lado = Math.sign(d) || this.lado; return; }
    if (Math.sign(d) !== this.lado || Math.abs(d) < m) {
      const L = ctx.limite;
      const falta = m - Math.abs(Math.sign(d) === this.lado ? d : -Math.abs(d));       // cuánto se pisan (si cruzó, más)
      this.x -= this.lado * falta * 0.5; rival.x += this.lado * falta * 0.5;
      this.x = Math.max(-L, Math.min(L, this.x)); rival.x = Math.max(-L, Math.min(L, rival.x));
      // contra la pared el otro cede todo
      if (Math.abs(this.x) >= L) rival.x = this.x + this.lado * m; else if (Math.abs(rival.x) >= L) this.x = rival.x - this.lado * m;
    }
  }

  /* ---------------------------------------------------------------- visual */

  _visual(dt, ctx) {
    const a = this.actor, piv = a.pivote, r = a.raiz;
    const objetivo = this.cara > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.giro += norm(objetivo - this.giro) * Math.min(1, dt * 14);
    r.rotation.y = this.giro;
    r.position.set(this.x, this.y, 0);
    if (this.pausa > 0) { this.pausa -= dt; }

    // poses procedurales: sólo aportan lo que el clip no hace (inclinaciones y agachado)
    let lean = 0, esc = 1, bajar = 0;
    const t = this.t;
    switch (this.estado) {
      case "walk": lean = this._atras ? -0.06 : 0.08; break;
      case "crouch": esc = a.clipDe("crouch") !== a.clipDe("idle") ? 1 : 0.7; lean = 0.2; break;
      case "block": lean = 0.1; esc = 0.93; break;
      case "jump": lean = 0.1 + Math.max(0, this.vy) * 0.01; esc = 0.97; break;
      case "atk": {
        const g = this.golpe, k = g && g.act ? Math.max(0, Math.min(1, (t - g.act[0] + 0.05) / (g.act[1] - g.act[0] + 0.1))) : 0;
        lean = (g === GOLPES.kick ? -0.2 : g === GOLPES.uppercut ? -0.25 : 0.32) * Math.sin(k * Math.PI);
        if (g === GOLPES.sweep) { esc = 0.66; lean = 0.3; }
        break;
      }
      case "hit": lean = -0.4 * Math.max(0, 1 - t / 0.28); bajar = 0.02; break;
      case "launched": lean = -0.9; break;
      case "down": case "ko": break;
    }
    piv.rotation.x += (lean - piv.rotation.x) * Math.min(1, dt * 16);
    piv.scale.y += (esc - piv.scale.y) * Math.min(1, dt * 16);

    const sh = this.escudoMesh; sh.visible = this.escudo > 0.01;
    if (sh.visible) sh.material.uniforms.uI.value = this.escudo;

    a.update(dt);
  }
}
