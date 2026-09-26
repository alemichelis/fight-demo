// Selección de personajes: los dos luchadores en 3D sobre un escenario oscuro con contraluces de color, y una grilla de retratos
// abajo. Ambos jugadores eligen a la vez; en «un jugador» la CPU tantea al azar hasta fijar rival.

import * as THREE from "three";
import * as T from "./tex.js";
import { ROSTER, instanciar } from "./personajes.js";
import { crearParticulas } from "./props.js";
import { sfx, ambiental } from "./sonido.js";
import { TEMAS, ORDEN_TEMAS } from "./arena.js";
import { abrirCreadorAvaturn, MAX_CUSTOM } from "./avaturn.js";
import { cargar, retrato } from "./personajes.js";

const COLUMNAS = 7;
const ease = t => 1 - Math.pow(1 - t, 3);

function fondoEmblema() {
  const [cv, c] = T.lienzo(1024, 512);
  const g = c.createRadialGradient(512, 250, 20, 512, 250, 520);
  g.addColorStop(0, "#1c3350"); g.addColorStop(0.35, "#0d1626"); g.addColorStop(1, "#03040a");
  c.fillStyle = g; c.fillRect(0, 0, 1024, 512);
  c.strokeStyle = "rgba(160,200,255,.10)"; c.lineWidth = 3;
  for (const r of [120, 170, 260]) { c.beginPath(); c.arc(512, 250, r, 0, 6.283); c.stroke(); }
  c.lineWidth = 5; c.beginPath();
  for (let t = 0; t < 9; t += 0.03) { const rad = 12 + t * 15, x = 512 + Math.cos(t * 1.25) * rad, y = 250 + Math.sin(t * 1.25) * rad * 1.1; t === 0 ? c.moveTo(x, y) : c.lineTo(x, y); }
  c.stroke();
  for (let i = 0; i < 26; i++) { const x = 40 + i * 38; c.fillStyle = `rgba(150,190,255,${0.02 + (i % 3) * 0.015})`; c.fillRect(x, 0, 6 + (i % 4) * 5, 512); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Seleccion {
  constructor(app, { modo = "1p" } = {}) {
    this.app = app; this.render = app.render; this.modo = modo;
    this.escena = new THREE.Scene(); this.escena.background = new THREE.Color("#03040a");
    this.escena.fog = new THREE.FogExp2("#05070d", 0.035);
    this.camara = new THREE.PerspectiveCamera(32, 16 / 9, 0.2, 200);
    this.t = 0; this.animados = [];
    this.cursor = [0, ROSTER.length > 1 ? 1 : 0]; this.fijo = [false, false];
    this.actores = [null, null]; this.cacheActores = new Map();
    this.fase = "eligiendo"; this.faseT = 0; this._cpu = null;
    this.escenarios = [...ORDEN_TEMAS, "azar"]; this.esc = 0; this.modalAbierto = false;
    this._construir();
  }

  get opciones() {
    return {
      sol: null, rayos: 0,
      dof: { foco: 6.6, rango: 5, desenfoque: 0.5 },
      bloom: { fuerza: 0.4, radio: 0.7, umbral: 1.0 },
      exposicion: 1.05,
      grade: { viñeta: 0.62, grano: 0.045, aberracion: 0.22, contraste: 1.14, saturacion: 1.05, split: 0.08, sombra: "#0a1c40", luz: "#ffcf9a" }
    };
  }

  _construir() {
    const esc = this.escena;
    const fondo = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshBasicMaterial({ map: fondoEmblema(), fog: false, toneMapped: false }));
    fondo.position.set(0, 4.2, -9); esc.add(fondo);
    // piso: disco oscuro y pulido con un aro luminoso fino bajo cada luchador
    const piso = new THREE.Mesh(new THREE.CircleGeometry(24, 64), new THREE.MeshStandardMaterial({ color: "#0a0c13", roughness: 0.45, metalness: 0.35 }));
    piso.rotation.x = -Math.PI / 2; piso.receiveShadow = true; esc.add(piso);
    this.aros = [-1, 1].map(lado => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.02, 64), new THREE.MeshBasicMaterial({ color: "#fff", transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(lado * 2.55, 0.012, 0.15); esc.add(m);
      const disco = new THREE.Mesh(new THREE.CircleGeometry(1.5, 48), new THREE.MeshBasicMaterial({ map: T.texturaPunto(), color: "#fff", transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
      disco.rotation.x = -Math.PI / 2; disco.position.set(lado * 2.55, 0.008, 0.15); esc.add(disco); m.userData.disco = disco;
      return m;
    });
    // luces: llave desde arriba-adelante y contraluz de color por lado (el color sigue al personaje elegido)
    esc.add(new THREE.HemisphereLight("#7fa0d8", "#0a0806", 0.28));
    this.llaves = [-1, 1].map(lado => {
      const s = new THREE.SpotLight("#eaf0ff", 34, 22, 0.5, 0.85, 1.4);
      s.position.set(lado * 3.4, 6.5, 5.2); s.target.position.set(lado * 2.55, 1.0, 0); s.castShadow = true; s.shadow.mapSize.set(1024, 1024); s.shadow.bias = -0.0004;
      esc.add(s, s.target); return s;
    });
    this.contras = [-1, 1].map(lado => { const l = new THREE.PointLight("#3fb6ff", 13, 12, 1.6); l.position.set(lado * 4.6, 2.4, -2.6); esc.add(l); return l; });
    this.bordes = [-1, 1].map(lado => { const l = new THREE.PointLight("#ffffff", 4, 9, 1.6); l.position.set(lado * 0.4, 1.6, -3.2); esc.add(l); return l; });
    // partículas: brasas que suben + polvo azul
    const punto = T.texturaPunto();
    const brasas = crearParticulas({ n: 150, centro: [0, 0, 0], caja: [7, 6, 3.5], color: "#ff9a4a", intensidad: 4, tam: 0.06, subida: 0.4, deriva: 0.5, mapa: punto, semilla: 4 }); brasas.position.z = -0.5;
    const polvo = crearParticulas({ n: 220, centro: [0, 0, 0], caja: [8, 5.5, 5], color: "#8fb8ff", intensidad: 1.4, tam: 0.045, subida: 0, deriva: 0.35, mapa: punto, semilla: 8 }); polvo.position.z = -1;
    esc.add(brasas, polvo); this.animados.push(brasas, polvo);
    // humo bajo: dos planos con bruma oscura
    const bruma = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, fog: false, blending: THREE.NormalBlending,
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `varying vec2 vUv; uniform float uTime;
        float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main(){ vec2 p = vUv * vec2(6.0, 2.5) + vec2(uTime * 0.03, 0.0); float n = vn(p) * 0.6 + vn(p * 2.3 + 5.0) * 0.4;
          float a = smoothstep(0.35, 0.85, n) * smoothstep(0.0, 0.5, vUv.y) * smoothstep(1.0, 0.6, vUv.y) * 0.32; gl_FragColor = vec4(0.16, 0.22, 0.34, a); }`
    }));
    bruma.position.set(0, 0.8, -3.2); esc.add(bruma); this.animados.push({ userData: { actualizar: t => { bruma.material.uniforms.uTime.value = t; } } });
  }

  /* ---------------------------------------------------------------- interfaz */

  /** Base primero, luego «?» y «+ crear», luego los creados con Avaturn; relleno hasta 14 casilleros. */
  _armarTiles() {
    const base = ROSTER.filter(d => !d.custom), custom = ROSTER.filter(d => d.custom).slice(0, MAX_CUSTOM);
    const t = [...base.map(d => ({ tipo: "pj", def: d })), { tipo: "azar" }];
    while (t.length < COLUMNAS) t.push({ tipo: "bloq" });
    t.push({ tipo: "crear" }, ...custom.map(d => ({ tipo: "pj", def: d })));
    while (t.length < COLUMNAS * 2) t.push({ tipo: "bloq" });
    return t;
  }

  _htmlGrilla() {
    return this.tiles.map((t, k) => t.tipo === "pj" ? `<div class="tile" data-k="${k}"><img src="${this.app.retratos?.[t.def.id] || ""}" alt="${t.def.nombre}"><span class="marca"></span></div>`
      : t.tipo === "azar" ? `<div class="tile azar" data-k="${k}"><span class="marca"></span></div>`
      : t.tipo === "crear" ? `<div class="tile crear" data-k="${k}"><i>AVATURN</i><span class="marca"></span></div>` : `<div class="tile bloq"></div>`).join("");
  }

  _enlazarGrilla() {
    this.tilesEl = [...this.el.querySelectorAll(".tile")];
    this.tilesEl.forEach((t, k) => {
      if (!this.tiles[k] || this.tiles[k].tipo === "bloq") return;
      t.onmouseenter = () => { const q = this._activo(); if (q >= 0) this._mover(q, k); };
      t.onclick = () => { const q = this._activo(); if (q >= 0) { this._mover(q, k); this._confirmar(q); } };
    });
  }

  iniciar(ui) {
    const el = document.createElement("section"); el.className = "seleccion";
    this.tiles = this._armarTiles();
    el.innerHTML = `
      <div class="sel-cab">Elegí tu guerrero<small>${this.modo === "online" ? "Vos: A D · F   ·   El jugador 2 elige desde su PC   ·   W S: escenario" : this.modo === "2p" ? "Jugador 1: A D · F    Jugador 2: ← → · J    ·    W S: escenario" : "A D o ← → para moverte · F o Enter para elegir · W S: escenario · Esc para volver"}</small></div>
      <div class="sel-nombre izq"><div class="p">JUGADOR 1</div><div class="n"></div><div class="t"></div><div class="listo">LISTO</div></div>
      <div class="sel-nombre der"><div class="p">${this.modo === "2p" ? "JUGADOR 2" : this.modo === "online" ? "JUGADOR 2 · ONLINE" : "CPU"}</div><div class="n"></div><div class="t"></div><div class="listo">LISTO</div></div>
      <div class="sel-esc"><button class="e-prev">◀</button><span>Escenario</span><b></b><button class="e-next">▶</button></div>
      <div class="grilla">${this._htmlGrilla()}</div>
      <div class="sel-ayuda">Casilla «+»: crear tu propio personaje con Avaturn</div>
      <div class="vs"><div class="v">VS</div></div>`;
    ui.append(el); this.el = el;
    this.nombres = [el.querySelector(".sel-nombre.izq"), el.querySelector(".sel-nombre.der")];
    this._enlazarGrilla();
    el.querySelector(".e-prev").onclick = () => this._escenario(-1);
    el.querySelector(".e-next").onclick = () => this._escenario(1);
    this._escenario(0);
    this.app.controles.alPresionar = (cod, e, r) => this._tecla(cod, e, r);
    this.render.mostrar(this.escena, this.camara, this.opciones);
    this.camara.position.set(0, 1.5, 7.2); this.camara.lookAt(0, 1.05, 0);
    ambiental.poner(0.35, { viento: 0.5, dron: 1.4 });
    requestAnimationFrame(() => el.classList.add("on"));
    for (let q = 0; q < 2; q++) this._pintar(q, true);
  }

  _escenario(d) {
    this.esc = (this.esc + d + this.escenarios.length) % this.escenarios.length;
    const id = this.escenarios[this.esc];
    this.el.querySelector(".sel-esc b").textContent = id === "azar" ? "Aleatorio" : TEMAS[id].nombre;
    if (d) sfx.mover();
  }

  async _crearPersonaje() {
    if (this.modalAbierto) return;
    this.modalAbierto = true; sfx.ui();
    const def = await abrirCreadorAvaturn(this.app.ui);
    if (def) {
      try { await cargar(def); this.app.retratos[def.id] = await retrato(this.render.renderer, def); }
      catch (e) { console.error(e); }
      this.tiles = this._armarTiles();
      this.el.querySelector(".grilla").innerHTML = this._htmlGrilla(); this._enlazarGrilla();
      const k = this.tiles.findIndex(t => t.def === def);
      if (k >= 0) { this.cursor[0] = k; }
      for (let q = 0; q < 2; q++) this._pintar(q);
    }
    this.modalAbierto = false;
  }

  destruir() {
    this.destruido = true;
    this.el?.remove();
    this.app.controles.alPresionar = null;
    for (const a of this.cacheActores.values()) a.mixer?.stopAllAction();
  }

  /* ---------------------------------------------------------------- lógica */

  _activo() { if (this.fase !== "eligiendo") return -1; if (!this.fijo[0]) return 0; if (this.modo === "2p" && !this.fijo[1]) return 1; return -1; }

  _indiceTile(q) { return this.cursor[q]; }
  _mover(q, k) {
    if (this.fijo[q] || this.tiles[k].tipo === "bloq") return;
    if (this.cursor[q] !== k) { this.cursor[q] = k; sfx.mover(); this._pintar(q); }
  }
  _paso(q, d) {
    const validos = this.tiles.map((t, k) => k).filter(k => this.tiles[k].tipo !== "bloq");
    const pos = validos.indexOf(this.cursor[q]);
    this._mover(q, validos[(pos + d + validos.length) % validos.length]);
  }

  _tecla(cod, e, remoto) {
    sfx.activar();
    if (this.fase !== "eligiendo" || this.modalAbierto) return;
    const online = this.modo === "online", dos = this.modo === "2p" || online;
    if (remoto) {                                        // teclas del jugador 2 online: sólo mueven/confirman/cancelan SU cursor
      if (cod === "Escape" || cod === "Backspace") { if (this.fijo[1]) this._cancelar(1); return; }
      if (this.fijo[1]) return;
      if (cod === "ArrowLeft" || cod === "KeyA") this._paso(1, -1);
      else if (cod === "ArrowRight" || cod === "KeyD") this._paso(1, 1);
      else if (["KeyJ", "KeyF", "Enter", "Space"].includes(cod) && this.tiles[this.cursor[1]].tipo !== "crear") this._confirmar(1);
      return;
    }
    if (cod === "ArrowUp" || cod === "KeyW") { this._escenario(-1); return; }
    if (cod === "ArrowDown" || cod === "KeyS") { this._escenario(1); return; }
    if (cod === "Escape" || cod === "Backspace") {
      if (dos && this.fijo[1] && !online) this._cancelar(1); else if (this.fijo[0]) this._cancelar(0); else this.app.ir("titulo");
      return;
    }
    // jugador 1: A/D (y en 1P también las flechas); jugador 2 (2P local): flechas
    if (!this.fijo[0]) {
      if (cod === "KeyA" || (!dos && cod === "ArrowLeft")) this._paso(0, -1);
      else if (cod === "KeyD" || (!dos && cod === "ArrowRight")) this._paso(0, 1);
      else if (cod === "KeyF" || cod === "Space" || (!dos && (cod === "Enter" || cod === "KeyJ"))) this._confirmar(0);
    }
    if (dos && !online && !this.fijo[1]) {
      if (cod === "ArrowLeft") this._paso(1, -1); else if (cod === "ArrowRight") this._paso(1, 1);
      else if (cod === "KeyJ" || cod === "Enter") this._confirmar(1);
    }
  }

  /** Llegó (o se creó) un personaje: se rearma la grilla y, si es del invitado, se le apunta el cursor. */
  refrescarPersonajes(def) {
    if (this.destruido || !this.el) return;
    this.tiles = this._armarTiles();
    const grilla = this.el.querySelector(".grilla"); grilla.innerHTML = this._htmlGrilla(); this._enlazarGrilla();
    for (let q = 0; q < 2; q++) this.tilesEl.forEach((t, i) => { if (i === this.cursor[q]) t.classList.add(q ? "p2" : "p1"); });
    sfx.ui();
  }

  _confirmar(q) {
    if (this.fijo[q]) return;
    if (this.tiles[this.cursor[q]].tipo === "crear") { this._crearPersonaje(); return; }
    this.fijo[q] = true; sfx.confirmar();
    this._pintar(q, false, true);
    const a = this.actores[q]; if (a) { (a.jugar("win", { bucle: false, fade: 0.1 }) || a.jugar("intro", { bucle: false, fade: 0.1 })); a._despues = 2.2; }
    if (this.modo === "1p" && q === 0) this._cpuTantea();
    this._revisar();
  }
  _cancelar(q) { this.fijo[q] = false; this._cpu = null; if (this.modo === "1p") this.fijo[1] = false; this.fase = "eligiendo"; sfx.ui(); this._pintar(q); if (this.modo === "1p") this._pintar(1); this.nombres[q].classList.remove("fijo"); this.nombres[1].classList.remove("fijo"); this.tilesEl.forEach(t => t.classList.remove("fijo")); }

  _cpuTantea() {
    this._cpu = { t: 0, prox: 0, dur: 2.6 + Math.random() * 0.8 };
    this.fase = "cpu";
  }

  _revisar() {
    const lista = this.modo === "1p" ? [this.fijo[0]] : this.fijo;
    if (this.modo === "1p") return;
    if (lista.every(Boolean)) this._iniciarPelea();
  }

  _iniciarPelea() {
    if (this.fase === "vs") return;
    this.fase = "vs"; this.faseT = 0;
    this.el.querySelector(".vs").classList.add("on"); sfx.gong(0.9); this.render.flash.set(1, 0.85, 0.6, 0.4);
    setTimeout(() => {
      const defs = this.cursor.map(k => this._defDe(k));
      const id = this.escenarios[this.esc];
      this.app.ir("pelea", { defs, modo: this.modo, escenario: id === "azar" ? ORDEN_TEMAS[(Math.random() * ORDEN_TEMAS.length) | 0] : id });
    }, 2600);
  }

  _defDe(k) {
    const t = this.tiles[k];
    if (t.tipo === "pj") return t.def;
    return ROSTER[(Math.random() * Math.min(ROSTER.length, 6)) | 0];
  }

  /** Refresca cursores, nombres y el luchador 3D del lado q. */
  _pintar(q, inicial = false, fijar = false) {
    const k = this.cursor[q], t = this.tiles[k];
    const clase = q === 0 ? "p1" : "p2";
    this.tilesEl.forEach((el, i) => { el.classList.toggle(clase, i === this.cursor[q]); if (fijar && i === k) el.classList.add("fijo"); });
    const n = this.nombres[q], def = t.tipo === "pj" ? t.def : null;
    n.querySelector(".n").textContent = def ? def.nombre : t.tipo === "crear" ? "CREAR" : "ALEATORIO";
    n.querySelector(".t").textContent = def ? def.titulo : t.tipo === "crear" ? "Tu personaje con Avaturn" : "El destino decide";
    n.style.setProperty("--c", def ? def.color : "#e8dcae");
    n.classList.remove("cambia"); void n.offsetWidth; n.classList.add("cambia");
    if (fijar) n.classList.add("fijo");
    const color = def ? def.color : "#e8dcae";
    this.contras[q].color.set(color); this.aros[q].material.color.set(color); this.aros[q].userData.disco.material.color.set(color);
    this._mostrar3D(q, def);
  }

  async _mostrar3D(q, def) {
    const ficha = ((this._fichas ||= [0, 0])[q] += 1);            // si el jugador cambia rápido, sólo vale la última petición
    if (!def) { this._quitar3D(q); return; }
    const clave = `${q}:${def.id}`;
    let a = this.cacheActores.get(clave);
    if (!a) { a = await instanciar(def); this.cacheActores.set(clave, a); }
    if (this._fichas[q] !== ficha || this.destruido) return;
    this._quitar3D(q);
    const lado = q === 0 ? -1 : 1;
    a.raiz.position.set(lado * 2.55, 0, 0.15); a.raiz.rotation.y = -lado * 0.55;     // 3/4 hacia el centro
    a.raiz.scale.setScalar(1.12);
    this.escena.add(a.raiz); this.actores[q] = a;
    a.jugar("idle", { fade: 0 }); a._entra = 0; a._despues = 0;
    a.brillo("#ffffff", 1.6);
  }
  _quitar3D(q) { const p = this.actores[q]; if (p) { p.raiz.parent?.remove(p.raiz); this.actores[q] = null; } }

  /* ---------------------------------------------------------------- bucle */

  update(dt) {
    this.t += dt;
    const t = this.t, alto = this.render.h * this.render.renderer.getPixelRatio();
    for (const a of this.animados) a.userData.actualizar?.(t, alto);
    // cámara con respiración y un giro lento entre los dos
    this.camara.position.set(Math.sin(t * 0.22) * 0.5, 1.5 + Math.sin(t * 0.3) * 0.05, 7.2 - Math.min(1, t / 3) * 0.6);
    this.camara.lookAt(0, 1.05, 0);
    this.actores.forEach((a, q) => {
      if (!a) return;
      a.update(dt);
      a._entra = Math.min(1, (a._entra || 0) + dt * 3.5);
      const e = ease(a._entra), lado = q === 0 ? -1 : 1;
      a.raiz.position.x = lado * (2.55 + (1 - e) * 0.9); a.brillo("#ffffff", (1 - e) * 1.6);
      if (a._despues > 0) { a._despues -= dt; if (a._despues <= 0) a.jugar("idle", { fade: 0.3 }); }
      // los focos siguen al personaje
      this.llaves[q].target.position.set(a.raiz.position.x, 1.0, 0);
    });
    this.aros.forEach((m, q) => { const s = 1 + Math.sin(t * 2 + q) * 0.03; m.scale.setScalar(s * 1.1); m.material.opacity = 0.55 + Math.sin(t * 3 + q) * 0.15; });
    // la CPU tantea
    if (this._cpu) {
      const c = this._cpu; c.t += dt; c.prox -= dt;
      if (c.prox <= 0) {
        c.prox = 0.09 + c.t * 0.05;
        const cand = this.tiles.map((x, k) => k).filter(k => this.tiles[k].tipo === "pj");
        this.cursor[1] = cand[(Math.random() * cand.length) | 0]; this._pintar(1); sfx.mover();
      }
      if (c.t >= c.dur) {
        this._cpu = null; this.fijo[1] = true; this._pintar(1, false, true); sfx.confirmar();
        const a = this.actores[1]; if (a) { a.jugar("intro", { bucle: false, fade: 0.1 }) || a.jugar("win", { bucle: false }); a._despues = 2.2; }
        setTimeout(() => this._iniciarPelea(), 1200);
      }
    }
  }
}
