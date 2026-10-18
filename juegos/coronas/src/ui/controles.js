// Mouse y teclado → acciones del juego. Nada de lógica de partida acá: sólo traduce gestos.
//   Clic izq.: seleccionar (arrastrar = recuadro, doble clic = todos los del mismo tipo en pantalla, Shift suma/quita)
//   Clic der.: orden según lo que haya bajo el puntero (mover, atacar, juntar, ayudar a construir, punto de reunión)
//   Cámara: bordes de la pantalla, flechas o botón del medio arrastrando para moverse; rueda para el zoom;
//   Shift + botón del medio para rotar e inclinar; Ctrl+← → para rotar; N para volver al norte
//   Ctrl+1..9 arma grupos; 1..9 los elige (dos veces seguidas centra la cámara). Espacio: ir a la última alerta.

import * as THREE from "three";
import { config } from "../config.js";

const norm = k => k.length === 1 ? k.toLowerCase() : k;

export class Controles {
  constructor(juego, lienzo, cuadro) {
    this.j = juego; this.c = lienzo; this.cuadro = cuadro;
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2, dentro: false };
    this.teclas = new Set();
    this.arrastre = null; this.medio = null;
    this.ultimoClic = { t: 0, id: -1 };
    this.ultimoGrupo = { n: -1, t: 0 };
    this.ray = new THREE.Raycaster();

    lienzo.addEventListener("contextmenu", e => e.preventDefault());
    lienzo.addEventListener("pointerdown", e => this.abajo(e));
    addEventListener("pointermove", e => this.mover(e));
    addEventListener("pointerup", e => this.arriba(e));
    lienzo.addEventListener("wheel", e => { e.preventDefault(); const c = this.j.ctx.cam; c.distanciaObj = THREE.MathUtils.clamp(c.distanciaObj * (e.deltaY > 0 ? 1.12 : 0.89), c.min, c.max); }, { passive: false });
    document.addEventListener("pointerleave", () => this.mouse.dentro = false);
    document.addEventListener("pointerenter", () => this.mouse.dentro = true);
    addEventListener("blur", () => { this.teclas.clear(); this.mouse.dentro = false; });
    addEventListener("keydown", e => this.tecla(e));
    addEventListener("keyup", e => this.teclas.delete(e.key));
  }

  /* ---------------------------------------------------------------- suelo bajo un punto de pantalla */

  suelo(sx, sy) {
    const cam = this.j.ctx.camara, r = this.c.getBoundingClientRect();
    const ndc = new THREE.Vector2((sx - r.left) / r.width * 2 - 1, -((sy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, cam);
    const o = this.ray.ray.origin, d = this.ray.ray.direction;
    if (d.y > -0.01) return null;
    // intersección con el terreno: plano a la altura estimada, refinado tres veces con la altura real
    let h = this.j.ctx.cam.objetivo.y, p = null;
    for (let i = 0; i < 4; i++) {
      const t = (h - o.y) / d.y; p = { x: o.x + d.x * t, z: o.z + d.z * t };
      h = this.j.alturaEn(p.x, p.z);
    }
    return p;
  }

  /* ---------------------------------------------------------------- mouse */

  abajo(e) {
    if (!this.j.jugando()) return;
    this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    if (e.button === 1) { e.preventDefault(); this.medio = { x: e.clientX, y: e.clientY, rotar: e.shiftKey }; return; }
    const p = this.suelo(e.clientX, e.clientY);
    if (e.button === 2) {
      if (this.j.modo()) { this.j.cancelarModo(); return; }
      if (p) this.j.ordenMapa(p.x, p.z, e.shiftKey);
      return;
    }
    if (e.button !== 0) return;
    if (this.j.modo()) { if (p) this.j.clicModo(p.x, p.z, e.shiftKey); return; }
    this.arrastre = { x0: e.clientX, y0: e.clientY, shift: e.shiftKey, ctrl: e.ctrlKey };
    this.c.setPointerCapture?.(e.pointerId);
  }

  mover(e) {
    this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.dentro = true;
    if (this.medio) {
      const dx = e.clientX - this.medio.x, dy = e.clientY - this.medio.y;
      this.medio.x = e.clientX; this.medio.y = e.clientY;
      const cam = this.j.ctx.cam;
      if (!this.medio.rotar) { const k = cam.distancia * 0.0022; this.j.desplazar(-dx * k, -dy * k * 1.3); }
      else { cam.giroObj -= dx * 0.006 * (config.valor.camara.invertirGiro ? -1 : 1); cam.inclinacion = THREE.MathUtils.clamp(cam.inclinacion + dy * 0.12, -16, 16); }
      return;
    }
    if (this.arrastre) {
      const a = this.arrastre, w = Math.abs(e.clientX - a.x0), h = Math.abs(e.clientY - a.y0);
      if (w + h > 6) {
        this.cuadro.hidden = false;
        Object.assign(this.cuadro.style, { left: Math.min(a.x0, e.clientX) + "px", top: Math.min(a.y0, e.clientY) + "px", width: w + "px", height: h + "px" });
      }
    }
  }

  arriba(e) {
    if (e.button === 1) { this.medio = null; return; }
    if (e.button === 0 && this.j.colocando) { const p = this.suelo(e.clientX, e.clientY); this.j.soltarEdificio(e.shiftKey); return; }
    if (e.button === 0 && this.j.lineaMuro) { const p = this.suelo(e.clientX, e.clientY); if (p) this.j.finLinea(p.x, p.z, e.shiftKey); else this.j.lineaMuro = null; return; }
    if (e.button !== 0 || !this.arrastre) return;
    const a = this.arrastre; this.arrastre = null; this.cuadro.hidden = true;
    const w = Math.abs(e.clientX - a.x0), h = Math.abs(e.clientY - a.y0);
    if (w + h > 6) { this.j.seleccionarCaja(Math.min(a.x0, e.clientX), Math.min(a.y0, e.clientY), Math.max(a.x0, e.clientX), Math.max(a.y0, e.clientY), a.shift); return; }
    const p = this.suelo(e.clientX, e.clientY); if (!p) return;
    const ent = this.j.mundo.entEn(p.x, p.z, 0);
    const ahora = performance.now();
    if (ent && ent.id === this.ultimoClic.id && ahora - this.ultimoClic.t < 350) { this.j.seleccionarTipoEnPantalla(ent); this.ultimoClic.t = 0; return; }
    this.ultimoClic = { t: ahora, id: ent?.id ?? -1 };
    if (!ent) { if (!a.shift) this.j.seleccionar([]); return; }
    if (a.ctrl) { this.j.seleccionarTipoEnPantalla(ent); return; }
    this.j.seleccionar([ent.id], a.shift ? "alternar" : "solo");
  }

  /* ---------------------------------------------------------------- teclado */

  tecla(e) {
    const k = e.key, T = config.valor.teclas, n = norm(k), sinMod = !e.ctrlKey && !e.metaKey && !e.altKey;
    if (n === T.menu || (k === "Escape" && !this.j.modo() && this.j.jugando())) { e.preventDefault(); this.j.menu(); return; }
    if (!this.j.jugando()) return;
    if (k === "Escape") { this.j.cancelarModo(); return; }
    if ((e.ctrlKey || e.metaKey) && (k === "ArrowLeft" || k === "ArrowRight")) { e.preventDefault(); this.j.rotar(k === "ArrowLeft" ? 1 : -1); return; }
    if (k.startsWith("Arrow")) { this.teclas.add(k); e.preventDefault(); return; }
    if (sinMod && n === T.girarIzq) { e.preventDefault(); this.j.rotar(1); return; }
    if (sinMod && n === T.girarDer) { e.preventDefault(); this.j.rotar(-1); return; }
    if (sinMod && n === T.norte) { e.preventDefault(); this.j.rotar(0); return; }
    if (sinMod && n === T.alerta) { e.preventDefault(); this.j.irAAlerta(); return; }
    if (sinMod && n === T.girarEdificio && this.j.girarEdificio(e.shiftKey ? -1 : 1)) { e.preventDefault(); return; }
    if (/^[1-9]$/.test(k)) {
      const n = +k;
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.j.guardarGrupo(n); return; }
      const ahora = performance.now();
      this.j.elegirGrupo(n, this.ultimoGrupo.n === n && ahora - this.ultimoGrupo.t < 400);
      this.ultimoGrupo = { n, t: ahora };
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.j.hud.tecla(n)) e.preventDefault();
  }

  /* ---------------------------------------------------------------- por cuadro: cámara y fantasma */

  actualizar(dt) {
    const cam = this.j.ctx.cam, C = config.valor.camara, vel = cam.distancia * 1.05 * dt * C.velocidad;
    let dx = 0, dz = 0;
    if (this.teclas.has("ArrowLeft")) dx -= 1; if (this.teclas.has("ArrowRight")) dx += 1;
    if (this.teclas.has("ArrowUp")) dz -= 1; if (this.teclas.has("ArrowDown")) dz += 1;
    const borde = 10, m = this.mouse;
    if (C.bordes && m.dentro && document.hasFocus() && !this.arrastre && !this.medio) {
      if (m.x <= borde) dx -= 1; if (m.x >= innerWidth - borde) dx += 1;
      if (m.y <= borde) dz -= 1; if (m.y >= innerHeight - borde) dz += 1;
    }
    if (dx || dz) this.j.desplazar(dx * vel, dz * vel);
    // fantasma del edificio y puntero sobre entidades
    const p = this.suelo(m.x, m.y);
    this.j.alPasar(p);
  }
}
