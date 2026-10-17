// Lo que se ve de la simulación. Cada cuadro recorre las entidades del mundo, crea/actualiza/retira sus modelos
// y dibuja lo efímero (flechas, polvo, humo, marcas de clic). Nunca modifica la simulación.

import * as THREE from "three";
import { UNIDADES, EDIFICIOS, TICK } from "../datos.js";
import { crearModelo, andamio } from "./modelos.js";

const JUGADOR = 0;      // el que mira (la persona)
const ESCALA_UNIDAD = 1.32;   // como en los RTS clásicos, las tropas se exageran para que se lean al lado de los edificios

/* ================================================================ billboards instanciados */

// barras de vida y partículas: un solo dibujo para todas, siempre de frente a la cámara
function crearBillboards(max, frag, mezcla) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index; geo.attributes.position = base.attributes.position; geo.attributes.uv = base.attributes.uv;
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const aDatos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const aColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aPos", aPos); geo.setAttribute("aDatos", aDatos); geo.setAttribute("aColor", aColor);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    vertexShader: `attribute vec3 aPos; attribute vec4 aDatos; attribute vec4 aColor;
      varying vec2 vUv; varying vec4 vDatos; varying vec4 vColor;
      void main() { vUv = uv; vDatos = aDatos; vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
        float c = cos(aDatos.w), s = sin(aDatos.w);
        vec2 p = position.xy * aDatos.yz; p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
        mv.xy += p;
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: frag, transparent: true, depthWrite: false, blending: mezcla
  });
  const malla = new THREE.Mesh(geo, mat);
  malla.frustumCulled = false;
  let n = 0;
  return {
    malla,
    empezar() { n = 0; },
    poner(x, y, z, d0, ancho, alto, giro, r, g, b, a) {
      if (n >= max) return;
      aPos.setXYZ(n, x, y, z); aDatos.setXYZW(n, d0, ancho, alto, giro); aColor.setXYZW(n, r, g, b, a); n++;
    },
    terminar() { geo.instanceCount = n; aPos.needsUpdate = aDatos.needsUpdate = aColor.needsUpdate = true; }
  };
}

const FRAG_BARRA = `varying vec2 vUv; varying vec4 vDatos; varying vec4 vColor;
  void main() {
    vec2 b = min(vUv, 1.0 - vUv) * vec2(vDatos.y, vDatos.z) * 40.0;
    float borde = step(min(b.x, b.y), 0.9);
    vec3 fondo = vec3(0.05, 0.04, 0.04);
    vec3 relleno = vColor.rgb * (0.75 + 0.35 * vUv.y);
    vec3 c = vUv.x < vDatos.x ? relleno : fondo;
    c = mix(c, vec3(0.0), borde * 0.85);
    gl_FragColor = vec4(c, vColor.a);
  }`;
const FRAG_PARTICULA = `varying vec2 vUv; varying vec4 vDatos; varying vec4 vColor;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = 1.0 - smoothstep(0.0, 1.0, d); a *= a;              // bordes en orden: con los bordes invertidos GLSL no garantiza nada (en algunas placas da NaN)
    gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  }`;

/* ================================================================ vista */

export class Vista {
  constructor(ctx, mundo, terreno) {
    this.ctx = ctx; this.m = mundo; this.terreno = terreno;
    this.escena = ctx.escena;
    this.visuales = new Map();
    this.muriendo = [];
    this.seleccion = new Set();
    this.hover = null;
    this.tiempo = 0;
    this.alturaEn = (x, z) => mundo.mapa.alturaEn(x, z);

    this.barras = crearBillboards(600, FRAG_BARRA, THREE.NormalBlending);
    this.barras.malla.renderOrder = 10; this.barras.malla.material.depthTest = false;
    this.humo = crearBillboards(2500, FRAG_PARTICULA, THREE.NormalBlending);
    this.brillo = crearBillboards(1500, FRAG_PARTICULA, THREE.AdditiveBlending);
    this.humo.malla.renderOrder = 5; this.brillo.malla.renderOrder = 6;
    this.escena.add(this.barras.malla, this.humo.malla, this.brillo.malla);
    this.particulas = [];

    // anillos de selección
    this.anillosGeo = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
    this.anillos = [];
    this.matAnillo = {
      propio: new THREE.MeshBasicMaterial({ color: "#5dff9a", transparent: true, opacity: 0.85, depthWrite: false }),
      enemigo: new THREE.MeshBasicMaterial({ color: "#ff5a5a", transparent: true, opacity: 0.85, depthWrite: false }),
      neutral: new THREE.MeshBasicMaterial({ color: "#ffd25a", transparent: true, opacity: 0.85, depthWrite: false }),
      hover: new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.35, depthWrite: false })
    };
    // flechas
    const flecha = new THREE.CylinderGeometry(0.012, 0.012, 0.55, 4).rotateX(Math.PI / 2);
    this.flechas = new THREE.InstancedMesh(flecha, new THREE.MeshStandardMaterial({ color: "#3a2a1a", roughness: 0.6 }), 200);
    this.flechas.count = 0; this.flechas.frustumCulled = false;
    this.escena.add(this.flechas);
    // marcas de clic y bandera de reunión
    this.marcas = [];
    this.bandera = new THREE.Group();
    this.bandera.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 5).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: "#6b4a2e" })));
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.26).translate(0.2, 0.86, 0), new THREE.MeshStandardMaterial({ color: mundo.jugadores[JUGADOR].color, side: THREE.DoubleSide, emissive: mundo.jugadores[JUGADOR].color, emissiveIntensity: 0.4 }));
    this.bandera.add(tela); this.bandera.visible = false; this.escena.add(this.bandera);
    this.fantasma = null;
  }

  /* ---------------------------------------------------------------- por cuadro */

  actualizar(dt, alfa) {
    this.tiempo += dt;
    const m = this.m;
    this.barras.empezar(); this.humo.empezar(); this.brillo.empezar();
    let ia = 0;
    for (const e of m.ents.values()) {
      let v = this.visuales.get(e.id);
      if (!v) v = this.crear(e);
      const visible = this.esVisible(e);
      v.obj.visible = visible;
      if (!visible) continue;
      if (e.clase === "unidad") this.actualizarUnidad(e, v, dt, alfa);
      else if (e.clase === "edificio") this.actualizarEdificio(e, v, dt);
      // anillo de selección / puntero
      const sel = this.seleccion.has(e.id), hov = this.hover === e.id;
      if (sel || hov) {
        const a = this.anillos[ia] || this.nuevoAnillo(ia); ia++;
        const r = e.clase === "unidad" ? e.radio * 1.7 : e.lado * 0.74;
        a.visible = true; a.scale.setScalar(r);
        a.position.set(v.obj.position.x, v.obj.position.y + 0.05, v.obj.position.z);
        a.material = !sel ? this.matAnillo.hover : e.dueño === JUGADOR ? this.matAnillo.propio : e.dueño < 0 ? this.matAnillo.neutral : this.matAnillo.enemigo;
      }
      // barra de vida: seleccionados, bajo el puntero o lastimados
      if (e.clase !== "mina" && (sel || hov || e.vida < e.vidaMax - 0.5 || (e.clase === "edificio" && !e.completo))) {
        const alto = e.clase === "unidad" ? UNIDADES[e.tipo].altura * ESCALA_UNIDAD + 0.3 : this.alturaEdificio(e) + 0.4;
        const f = Math.max(0, e.vida / e.vidaMax);
        const c = e.dueño === JUGADOR ? (f > 0.5 ? [0.3, 0.95, 0.45] : f > 0.25 ? [1, 0.8, 0.2] : [1, 0.3, 0.25]) : [1, 0.28, 0.28];
        const ancho = e.clase === "unidad" ? 0.75 + e.radio : 1.2 + e.lado * 0.45;
        this.barras.poner(v.obj.position.x, v.obj.position.y + alto, v.obj.position.z, f, ancho, 0.1, 0, c[0], c[1], c[2], 0.95);
        if (e.clase === "edificio" && !e.completo) this.barras.poner(v.obj.position.x, v.obj.position.y + alto - 0.16, v.obj.position.z, e.progreso, ancho, 0.06, 0, 0.95, 0.8, 0.35, 0.95);
        else if (e.clase === "edificio" && e.cola?.length && e.dueño === JUGADOR) this.barras.poner(v.obj.position.x, v.obj.position.y + alto - 0.16, v.obj.position.z, e.colaT / UNIDADES[e.cola[0]].tiempo, ancho, 0.06, 0, 0.45, 0.75, 1, 0.95);
      }
    }
    for (let k = ia; k < this.anillos.length; k++) this.anillos[k].visible = false;

    // lo que ya no está en el mundo: animación de muerte o derrumbe
    for (const [id, v] of this.visuales) if (!m.ents.has(id)) { this.visuales.delete(id); this.morir(v); }
    this.actualizarMuertes(dt);
    this.actualizarFlechas(alfa);
    this.actualizarParticulas(dt);
    this.actualizarMarcas(dt);
    this.actualizarBandera();
    this.barras.terminar(); this.humo.terminar(); this.brillo.terminar();
  }

  esVisible(e) {
    if (e.oculto) return false;
    if (e.dueño === JUGADOR) return true;
    if (e.clase === "unidad") return this.m.visible(JUGADOR, e.x, e.z);
    return this.m.explorado(JUGADOR, e.x, e.z);          // edificios y minas: se recuerdan una vez vistos
  }

  crear(e) {
    const color = e.dueño >= 0 ? this.m.jugadores[e.dueño].color : null;
    const mod = crearModelo(e.tipo, color);
    const obj = new THREE.Group(); obj.add(mod.objeto);
    const v = { obj, mod, clase: e.clase, tipo: e.tipo, fase: Math.random() * 6, ang: e.ang, base: new Map(), completo: e.completo };
    // guardar las rotaciones de reposo para animar sumando encima
    for (const [k, p] of Object.entries(mod.partes)) if (p?.isObject3D) v.base.set(k, p.rotation.clone());
    obj.position.set(e.x, this.alturaEn(e.x, e.z), e.z);
    obj.rotation.y = e.ang;
    if (e.clase === "unidad") obj.scale.setScalar(ESCALA_UNIDAD);
    if (e.clase === "edificio" || e.clase === "mina") {
      obj.position.y = this.alturaBase(e);
      if (e.clase === "edificio") obj.rotation.y = e.dueño === 1 ? Math.PI : 0;     // la fachada mira hacia el centro del mapa
      this.terreno.despejar(e.tx, e.tz, e.lado);
      if (!e.completo) { v.andamio = andamio(e.lado); obj.add(v.andamio); }
    }
    this.escena.add(obj);
    this.visuales.set(e.id, v);
    return v;
  }

  alturaBase(e) {
    let h = Infinity;
    for (const [dx, dz] of [[0, 0], [e.lado, 0], [0, e.lado], [e.lado, e.lado], [e.lado / 2, e.lado / 2]]) h = Math.min(h, this.alturaEn(e.tx + dx, e.tz + dz));
    return h;
  }
  alturaEdificio(e) { return { castillo: 3.8, granja: 1.6, cuartel: 2.6, herreria: 2.5, torre: 4.9 }[e.tipo] || 2; }

  /* ---------------------------------------------------------------- unidades */

  actualizarUnidad(e, v, dt, alfa) {
    const x = e.px + (e.x - e.px) * alfa, z = e.pz + (e.z - e.pz) * alfa;
    v.obj.position.set(x, this.alturaEn(x, z), z);
    // giro suave hacia donde mira
    let d = e.ang - v.ang; d = Math.atan2(Math.sin(d), Math.cos(d));
    v.ang += d * Math.min(1, dt * 12);
    v.obj.rotation.y = v.ang;
    const P = v.mod.partes;
    if (P.cargaOro) { P.cargaOro.visible = e.carga?.tipo === "oro"; P.cargaMadera.visible = e.carga?.tipo === "madera"; }
    if (v.mod.mixer) { this.animarGLB(v, e, dt); return; }
    const b = (k, eje) => v.base.get(k)?.[eje] || 0;
    const vel = UNIDADES[e.tipo].velocidad;
    const tAtaque = this.m.tiempo - e.golpeT;
    if (e.anim === "camina") v.fase += dt * vel * 3.6;
    const s = Math.sin(v.fase), camina = e.anim === "camina" ? 1 : 0;
    v.paso = (v.paso || 0) + ((camina ? 1 : 0) - (v.paso || 0)) * Math.min(1, dt * 10);     // mezcla suave quieto ↔ caminar
    const k = v.paso;
    if (P.patas) {                                         // caballo: paso cruzado
      P.patas.forEach((p, i) => { p.rotation.x = Math.sin(v.fase * 1.3 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.55 * k; });
      P.caballo.position.y = Math.abs(Math.sin(v.fase * 1.3)) * 0.06 * k;
      P.caballo.rotation.x = Math.sin(v.fase * 2.6) * 0.03 * k;
    } else {
      P.piernaI.rotation.x = b("piernaI", "x") + s * 0.62 * k;
      P.piernaD.rotation.x = b("piernaD", "x") - s * 0.62 * k;
      P.torso.position.y = 0.5 + Math.abs(Math.cos(v.fase)) * 0.035 * k + Math.sin(this.tiempo * 2 + v.fase) * 0.004;
      P.torso.rotation.y = s * 0.08 * k;
    }
    // brazo del arma
    let brazoD = b("brazoD", "x") - s * 0.45 * k, brazoI = b("brazoI", "x") + (P.patas ? 0 : s * 0.3 * k * (v.base.get("brazoI")?.x ? 0.3 : 1));
    if (tAtaque < 0.5) {
      const t = tAtaque / 0.5;
      if (e.tipo === "arquero") { brazoD = -1.4 + Math.sin(Math.min(1, t * 1.6) * Math.PI) * 0.4; brazoI = -1.45; }
      else { const golpe = t < 0.35 ? -2.4 * (t / 0.35) : -2.4 + (t - 0.35) / 0.65 * 2.9; brazoD = golpe; if (P.torso) P.torso.rotation.y = (t < 0.35 ? -0.3 : 0.3) * (1 - t); }
    } else if (e.anim === "trabaja") {
      const c = (this.tiempo * 2.2 + v.fase) % 1;
      brazoD = c < 0.6 ? -2.5 * (c / 0.6) : -2.5 + (c - 0.6) / 0.4 * 3.0;
      if (c > 0.97 && !v.chispa) { v.chispa = true; this.polvo(x + Math.sin(v.ang) * 0.45, v.obj.position.y + 0.2, z + Math.cos(v.ang) * 0.45, 3, [0.55, 0.45, 0.33]); }
      if (c < 0.5) v.chispa = false;
    }
    if (P.brazoD) P.brazoD.rotation.x = brazoD;
    if (P.brazoI) P.brazoI.rotation.x = brazoI;
    if (P.capa) P.capa.rotation.x = 0.1 + k * 0.35 + Math.sin(this.tiempo * 3 + v.fase) * 0.05;
  }

  animarGLB(v, e, dt) {
    const est = this.m.tiempo - e.golpeT < 0.5 ? "ataca" : e.anim;
    const A = v.mod.acciones, sig = A[est] || A.quieto;
    if (sig && v.accion !== sig) { sig.reset().fadeIn(0.2).play(); v.accion?.fadeOut(0.2); v.accion = sig; }
    v.mod.mixer.update(dt);
  }

  /* ---------------------------------------------------------------- edificios */

  actualizarEdificio(e, v, dt) {
    if (!e.completo) {
      const p = Math.max(0.06, e.progreso);
      v.mod.objeto.scale.set(1, p, 1);
      if (Math.random() < dt * 3) this.polvo(e.x + (Math.random() - 0.5) * e.lado, v.obj.position.y + 0.3, e.z + (Math.random() - 0.5) * e.lado, 2, [0.6, 0.55, 0.48]);
    } else if (!v.completo) {
      v.completo = true;
      v.mod.objeto.scale.set(1, 1, 1);
      if (v.andamio) { v.obj.remove(v.andamio); v.andamio = null; }
      for (let i = 0; i < 26; i++) this.polvo(e.x + (Math.random() - 0.5) * e.lado * 1.2, v.obj.position.y + 0.2, e.z + (Math.random() - 0.5) * e.lado * 1.2, 1, [0.72, 0.67, 0.6]);
    }
    // daño: humo a partir de la mitad, fuego bajo un cuarto
    const f = e.vida / e.vidaMax, alto = this.alturaEdificio(e) * 0.7;
    if (e.completo && f < 0.55 && Math.random() < dt * (f < 0.25 ? 14 : 6)) {
      this.particulas.push({ x: e.x + (Math.random() - 0.5) * e.lado * 0.6, y: v.obj.position.y + alto, z: e.z + (Math.random() - 0.5) * e.lado * 0.6, vx: 0.25, vy: 1.1, vz: 0.1, vida: 3.2, t: 0, tam: 0.6, crece: 1.6, c: [0.16, 0.15, 0.15], a: 0.55, aditiva: false });
    }
    if (e.completo && f < 0.28 && Math.random() < dt * 20) {
      this.particulas.push({ x: e.x + (Math.random() - 0.5) * e.lado * 0.5, y: v.obj.position.y + alto * 0.8, z: e.z + (Math.random() - 0.5) * e.lado * 0.5, vx: 0, vy: 1.6, vz: 0, vida: 0.7, t: 0, tam: 0.45, crece: -0.4, c: [1.0, 0.45, 0.1], a: 0.9, aditiva: true });
    }
  }

  /* ---------------------------------------------------------------- muertes */

  morir(v) {
    v.t = 0;
    if (v.clase === "unidad") { v.lado = Math.random() < 0.5 ? -1 : 1; this.muriendo.push(v); }
    else if (v.clase === "edificio" && v.obj.visible) {
      const p = v.obj.position;
      for (let i = 0; i < 40; i++) this.polvo(p.x + (Math.random() - 0.5) * 3, p.y + Math.random() * 1.5, p.z + (Math.random() - 0.5) * 3, 1, [0.4, 0.37, 0.33], 2.2);
      for (let i = 0; i < 12; i++) this.particulas.push({ x: p.x + (Math.random() - 0.5) * 2, y: p.y + 0.5, z: p.z + (Math.random() - 0.5) * 2, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 2, vida: 0.8, t: 0, tam: 0.5, crece: -0.3, c: [1, 0.5, 0.15], a: 1, aditiva: true });
      this.ctx.cam.temblor = 0.25;
      this.muriendo.push(v);
    } else this.descartar(v);
  }
  actualizarMuertes(dt) {
    for (let i = this.muriendo.length - 1; i >= 0; i--) {
      const v = this.muriendo[i]; v.t += dt;
      if (v.clase === "unidad") {
        const f = Math.min(1, v.t / 0.45);
        v.mod.objeto.rotation.z = v.lado * f * f * Math.PI / 2;
        v.mod.objeto.position.y = f * 0.15;
        if (v.t > 2.2) v.obj.position.y -= dt * 0.4;
        if (v.t > 3.4) { this.descartar(v); this.muriendo.splice(i, 1); }
      } else {
        v.obj.position.y -= dt * 1.4; v.obj.rotation.z = Math.sin(v.t * 18) * 0.02;
        if (v.t > 2.4) { this.descartar(v); this.muriendo.splice(i, 1); }
      }
    }
  }
  descartar(v) {
    this.escena.remove(v.obj);
    v.obj.traverse(n => { if (n.isMesh && n.geometry && !n.geometry.userData.compartida) n.geometry.dispose(); });
  }

  /* ---------------------------------------------------------------- efectos */

  polvo(x, y, z, n, c, tam = 1) {
    for (let i = 0; i < n; i++) this.particulas.push({ x, y, z, vx: (Math.random() - 0.5) * 1.2, vy: 0.4 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 1.2, vida: 1.2 + Math.random(), t: 0, tam: 0.35 * tam, crece: 1.1 * tam, c, a: 0.5, aditiva: false });
  }
  destello(x, y, z, c = [1, 0.8, 0.4]) {
    for (let i = 0; i < 5; i++) this.particulas.push({ x, y, z, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 2.5, vz: (Math.random() - 0.5) * 3, vida: 0.3, t: 0, tam: 0.12, crece: -0.2, c, a: 1, aditiva: true });
  }
  actualizarParticulas(dt) {
    const P = this.particulas;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.t += dt;
      if (p.t >= p.vida) { P[i] = P[P.length - 1]; P.pop(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy *= 1 - dt * 0.6; p.vx *= 1 - dt; p.vz *= 1 - dt;
      const f = p.t / p.vida, tam = Math.max(0.02, p.tam + p.crece * f);
      const a = p.a * (f < 0.15 ? f / 0.15 : 1 - (f - 0.15) / 0.85);
      (p.aditiva ? this.brillo : this.humo).poner(p.x, p.y, p.z, 0, tam, tam, p.t * 0.6, p.c[0], p.c[1], p.c[2], a);
    }
    if (P.length > 3500) P.splice(0, P.length - 3500);
  }

  actualizarFlechas(alfa) {
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), adelante = new THREE.Vector3(0, 0, 1), dir = new THREE.Vector3();
    let n = 0;
    for (const f of this.m.proyectiles) {
      if (n >= 200) break;
      const t = Math.min(1, (f.t + TICK * alfa) / f.dur), t2 = Math.min(1, t + 0.05);
      const pos = (tt, out) => out.set(f.ox + (f.x - f.ox) * tt, f.oy + (this.alturaEn(f.x, f.z) + 0.6 - f.oy) * tt + Math.sin(tt * Math.PI) * (0.4 + f.dur * 1.6), f.oz + (f.z - f.oz) * tt);
      pos(t, p); const sig = pos(t2, new THREE.Vector3());
      if (!this.m.visible(JUGADOR, p.x, p.z)) continue;
      dir.subVectors(sig, p).normalize();
      if (dir.lengthSq() < 0.5) dir.set(0, 0, 1);
      q.setFromUnitVectors(adelante, dir);
      this.flechas.setMatrixAt(n++, mtx.compose(p, q, s));
    }
    this.flechas.count = n; this.flechas.instanceMatrix.needsUpdate = true;
  }

  nuevoAnillo(i) { const a = new THREE.Mesh(this.anillosGeo, this.matAnillo.propio); a.renderOrder = 2; this.escena.add(a); this.anillos[i] = a; return a; }

  marca(x, z, tipo) {
    const mesh = new THREE.Mesh(this.anillosGeo, new THREE.MeshBasicMaterial({ color: tipo === "ataque" ? "#ff4d4d" : tipo === "recurso" ? "#ffd25a" : "#6dff9e", transparent: true, depthWrite: false }));
    mesh.position.set(x, this.alturaEn(x, z) + 0.06, z); mesh.renderOrder = 3;
    this.escena.add(mesh); this.marcas.push({ mesh, t: 0 });
  }
  actualizarMarcas(dt) {
    for (let i = this.marcas.length - 1; i >= 0; i--) {
      const k = this.marcas[i]; k.t += dt;
      const f = k.t / 0.55;
      k.mesh.scale.setScalar(0.25 + (1 - f) * 0.55); k.mesh.material.opacity = 1 - f;
      if (f >= 1) { this.escena.remove(k.mesh); k.mesh.material.dispose(); this.marcas.splice(i, 1); }
    }
  }

  actualizarBandera() {
    let r = null;
    for (const id of this.seleccion) { const e = this.m.ents.get(id); if (e?.clase === "edificio" && e.dueño === JUGADOR && e.reunion) { r = e.reunion; break; } }
    this.bandera.visible = !!r;
    if (r) { this.bandera.position.set(r.x, this.alturaEn(r.x, r.z), r.z); this.bandera.rotation.y = Math.sin(this.tiempo * 2) * 0.15; }
  }

  // eventos de la simulación que tienen algo para mostrar
  eventos(lista) {
    for (const ev of lista) {
      if (ev.tipo === "arbolCae") { this.terreno.talar(ev.x, ev.z); this.polvo(ev.x + 0.5, this.alturaEn(ev.x, ev.z) + 0.4, ev.z + 0.5, 6, [0.45, 0.4, 0.3]); }
      else if (ev.tipo === "golpe" && this.m.visible(JUGADOR, ev.x, ev.z)) {
        const e = this.m.ents.get(ev.id);
        const y = this.alturaEn(ev.x, ev.z) + (e?.clase === "edificio" ? 1.2 : 0.6);
        this.destello(ev.x, y, ev.z, e?.clase === "edificio" ? [1, 0.75, 0.4] : [1, 0.3, 0.2]);
      }
      else if (ev.tipo === "muerte" && ev.clase === "unidad" && this.m.visible(JUGADOR, ev.x, ev.z)) this.polvo(ev.x, this.alturaEn(ev.x, ev.z) + 0.1, ev.z, 5, [0.5, 0.45, 0.38]);
    }
  }

  /* ---------------------------------------------------------------- fantasma para ubicar edificios */

  mostrarFantasma(tipo, tx, tz, valido) {
    if (!tipo) { if (this.fantasma) this.fantasma.obj.visible = false; return; }
    if (!this.fantasma || this.fantasma.tipo !== tipo) {
      if (this.fantasma) this.escena.remove(this.fantasma.obj);
      const mod = crearModelo(tipo, this.m.jugadores[JUGADOR].color);
      const ok = new THREE.MeshStandardMaterial({ color: "#7dffa8", transparent: true, opacity: 0.55, emissive: "#2a8f4f", emissiveIntensity: 0.6, depthWrite: false });
      const mal = new THREE.MeshStandardMaterial({ color: "#ff6b6b", transparent: true, opacity: 0.55, emissive: "#9f2a2a", emissiveIntensity: 0.6, depthWrite: false });
      const mallas = [];
      mod.objeto.traverse(n => { if (n.isMesh) { n.castShadow = false; mallas.push(n); } });
      const lado = EDIFICIOS[tipo].lado;
      const grilla = new THREE.Mesh(new THREE.PlaneGeometry(lado, lado, lado, lado).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ffffff", wireframe: true, transparent: true, opacity: 0.5 }));
      grilla.position.y = 0.08;
      const obj = new THREE.Group(); obj.add(mod.objeto, grilla); this.escena.add(obj);
      this.fantasma = { tipo, obj, mallas, ok, mal, grilla };
    }
    const f = this.fantasma, lado = EDIFICIOS[tipo].lado;
    f.obj.visible = true;
    for (const n of f.mallas) n.material = valido ? f.ok : f.mal;
    f.grilla.material.color.set(valido ? "#7dffa8" : "#ff6b6b");
    const x = tx + lado / 2, z = tz + lado / 2;
    f.obj.position.set(x, this.alturaEn(x, z) + 0.02, z);
  }
}
