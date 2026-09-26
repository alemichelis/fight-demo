// Pantalla de título: un jardín de arces rojos al amanecer con un dragón de piedra sobre un peñasco, al otro lado del lago.
// Cámara baja con leve deriva y parallax con el mouse; hojas que caen, humo de incienso, bruma a ras de suelo y rayos de sol.

import * as THREE from "three";
import * as T from "./tex.js";
import { crearCielo, entornoDesdeCielo } from "./cielo.js";
import { crearRoca, crearDragon, crearParticulas, tuboAfilado, fbm3 } from "./props.js";
import { sfx, ambiental } from "./sonido.js";
import { AYUDA } from "./controles.js";

const SOL = new THREE.Vector3(0.3, 0.33, -0.89).normalize();
const PALETA_HOJAS = ["#c1241b", "#e0421f", "#a01712", "#e8672a", "#7a1010", "#f08a30", "#d13a20"];
const ease = t => 1 - Math.pow(1 - t, 3);

/** Arce: tronco curvo, ramas y una copa de hojas instanciadas (la luz de atrás las hace brillar). */
function crearArbol(semilla, { alto = 7, incl = 0.3, copa = 3.6, hojas = 1500, mat }) {
  const R = T.rng(semilla), g = new THREE.Group();
  const corteza = new THREE.MeshStandardMaterial({ color: "#3b2b23", roughness: 1 });
  const P = (x, y, z) => new THREE.Vector3(x, y, z);
  const tronco = new THREE.CatmullRomCurve3([P(0, 0, 0), P(incl * alto * 0.25, alto * 0.35, 0.1), P(incl * alto * 0.7, alto * 0.7, -0.1), P(incl * alto, alto, 0)]);
  const m = new THREE.Mesh(tuboAfilado(tronco, 26, 9, t => 0.3 * (1 - t * 0.85) + (t < 0.12 ? (0.12 - t) * 1.8 : 0)), corteza);
  m.castShadow = true; g.add(m);
  const puntas = [tronco.getPoint(1)];
  for (let i = 0; i < 6; i++) {
    const t = 0.5 + R() * 0.45, base = tronco.getPoint(t), ang = R() * 6.283, largo = copa * (0.6 + R() * 0.5);
    const fin = P(base.x + Math.cos(ang) * largo, base.y + 0.6 + R() * 1.6, base.z + Math.sin(ang) * largo * 0.8);
    const rama = new THREE.CatmullRomCurve3([base, P((base.x + fin.x) / 2, base.y + 0.8, (base.z + fin.z) / 2), fin]);
    const rm = new THREE.Mesh(tuboAfilado(rama, 10, 6, s => 0.1 * (1 - s * 0.8) + 0.015), corteza); rm.castShadow = true; g.add(rm);
    puntas.push(fin);
  }
  const plano = new THREE.PlaneGeometry(0.36, 0.36), inst = new THREE.InstancedMesh(plano, mat, hojas);
  const mt = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  const gauss = () => (R() + R() + R() - 1.5) * 1.3;
  for (let i = 0; i < hojas; i++) {
    const p = puntas[(R() * puntas.length) | 0];
    e.set(R() * 6.28, R() * 6.28, R() * 6.28); q.setFromEuler(e);
    mt.compose(P(p.x + gauss() * copa * 0.55, p.y + gauss() * copa * 0.32, p.z + gauss() * copa * 0.5), q, new THREE.Vector3().setScalar(0.65 + R() * 0.9));
    inst.setMatrixAt(i, mt); inst.setColorAt(i, c.set(PALETA_HOJAS[(R() * PALETA_HOJAS.length) | 0]).multiplyScalar(0.8 + R() * 0.5));
  }
  inst.frustumCulled = false; g.add(inst);
  return g;
}

function linternaPiedra(mat) {
  const g = new THREE.Group();
  const add = (geo, y, m = mat) => { const o = new THREE.Mesh(geo, m); o.position.y = y; o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  add(new THREE.BoxGeometry(0.95, 0.22, 0.95), 0.11); add(new THREE.CylinderGeometry(0.17, 0.2, 1.1, 8), 0.77);
  add(new THREE.CylinderGeometry(0.45, 0.28, 0.16, 8), 1.4);
  const luz = new THREE.MeshStandardMaterial({ color: "#221a12", emissive: "#ff9a40", emissiveIntensity: 1.5, roughness: 1 });
  add(new THREE.BoxGeometry(0.5, 0.42, 0.5), 1.68, luz);
  add(new THREE.ConeGeometry(0.62, 0.42, 4), 2.1).rotation.y = Math.PI / 4;
  add(new THREE.SphereGeometry(0.1, 8, 6), 2.38);
  return g;
}

function crearBruma() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCol: { value: new THREE.Color("#e8eef6") } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `varying vec2 vUv; uniform float uTime; uniform vec3 uCol;
      float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 p = vUv * vec2(9.0, 5.0) + vec2(uTime * 0.02, uTime * 0.008);
        float n = vn(p) * 0.55 + vn(p * 2.1 + 3.0) * 0.3 + vn(p * 4.3) * 0.15;
        float borde = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x) * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
        float a = smoothstep(0.35, 0.8, n) * 0.28 * borde;
        gl_FragColor = vec4(uCol, a);
      }`
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(260, 150), mat); m.rotation.x = -Math.PI / 2; m.renderOrder = 3;
  m.userData.actualizar = t => { mat.uniforms.uTime.value = t; };
  return m;
}

export class Titulo {
  constructor(app) {
    this.app = app; this.render = app.render;
    this.escena = new THREE.Scene(); this.t = 0; this.animados = [];
    this.camara = new THREE.PerspectiveCamera(40, 16 / 9, 0.3, 1500);
    this.mouse = new THREE.Vector2(); this.estado = "esperando"; this.sel = 0; this.panel = false;
    this._construir();
  }

  get opciones() {
    return {
      sol: SOL, rayos: 0.24, colorRayos: "#ffe2b0", umbralRayos: 1.1,
      dof: { foco: 45, rango: 60, desenfoque: 0.8 },
      bloom: { fuerza: 0.22, radio: 0.6, umbral: 1.1 },
      exposicion: 1.0,
      grade: { viñeta: 0.42, grano: 0.03, aberracion: 0.14, contraste: 1.08, saturacion: 1.12, split: 0.05, sombra: "#101a3a", luz: "#ffd9a8" }
    };
  }

  _construir() {
    const esc = this.escena, r = this.render.renderer, R = T.rng(2);
    esc.fog = new THREE.FogExp2("#bccbe0", 0.0026);
    this.cielo = crearCielo(SOL, "dia"); esc.add(this.cielo);
    esc.environment = entornoDesdeCielo(r, this.cielo); esc.environmentIntensity = 0.7;

    /* ---- terreno: jardín llano, cuenca con lago y lomas lejanas */
    const jardin = T.texturaJardin(); jardin.repeat.set(70, 70);
    const alturaTerreno = (x, z) => {
      const cuenca = THREE.MathUtils.smoothstep(-z, 22, 36);                      // 0 = jardín, 1 = fondo del lago
      const suave = (fbm3(x * 0.05, z * 0.05, 4, 3) - 0.5) * 1.2 * (1 - cuenca);
      const orilla = Math.max(0, (Math.abs(x) - 60) * 0.05) * cuenca;
      return suave - cuenca * 1.5 + orilla;
    };
    const g = new THREE.PlaneGeometry(700, 500, 150, 110); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i) - 200; p.setXYZ(i, x, alturaTerreno(x, z), z); }
    g.computeVertexNormals();
    const suelo = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: jardin, roughness: 1, color: "#f0d8c0" }));
    suelo.receiveShadow = true; esc.add(suelo);
    // lago
    const agua = new THREE.Mesh(new THREE.PlaneGeometry(900, 420), new THREE.MeshStandardMaterial({ color: "#7d9bb4", roughness: 0.06, metalness: 0.7, envMapIntensity: 1.6 }));
    agua.rotation.x = -Math.PI / 2; agua.position.set(0, -0.62, -250); esc.add(agua);

    /* ---- montañas nevadas y peñasco del dragón */
    const mMont = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    [[-190, -330, 120, 130], [-70, -380, 90, 150], [90, -360, 110, 140], [220, -320, 130, 120], [10, -440, 160, 170]].forEach(([x, z, w, h], i) => {
      const m = new THREE.Mesh(crearRoca(50 + i, { detalle: 5, achatada: 2.2, tonos: ["#3a4352", "#7c8898", "#f4f8fc"] }), mMont);
      m.scale.set(w, h * 0.5, w * 0.8); m.position.set(x, -18, z); esc.add(m);
    });
    const peñasco = new THREE.Mesh(crearRoca(21, { detalle: 4, achatada: 0.7, tonos: ["#3f3b35", "#655d51", "#8d8272"] }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    peñasco.scale.set(26, 15, 22); peñasco.position.set(0, -3, -100); peñasco.castShadow = peñasco.receiveShadow = true; esc.add(peñasco);
    const dragon = crearDragon(); dragon.scale.setScalar(1.6); dragon.position.set(-1, 6.5, -100); dragon.rotation.y = -0.25; esc.add(dragon);
    dragon.traverse(o => { if (o.isMesh) { o.castShadow = false; o.material = o.material.clone(); o.material.envMapIntensity = 0.45; o.material.color.multiplyScalar(0.62); } });
    this.dragon = dragon;

    /* ---- follaje y árboles */
    const hoja = T.texturaArce();
    const matHoja = new THREE.MeshStandardMaterial({ map: hoja, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.75, emissive: "#6a1408", emissiveMap: hoja, emissiveIntensity: 0.65 });
    const arboles = [
      [-7.5, 0, 1.5, 1.35, 0.42, 7.5], [8.4, 0, -2.2, 1.5, -0.4, 8.2], [-15, 0, -13, 1.2, 0.22, 7], [14, 0, -17, 1.2, -0.2, 7.5],
      [-6, 0, -30, 1.1, 0.1, 7], [7, 0, -36, 1.0, -0.1, 7], [-24, 0, -8, 1.1, 0.2, 7.5], [24, 0, -10, 1.1, -0.3, 7.5]
    ];
    arboles.forEach(([x, , z, s, incl, alto], i) => {
      const a = crearArbol(10 + i * 7, { alto, incl, copa: 3.6 * s, hojas: i < 2 ? 3400 : 1500, mat: matHoja });
      a.position.set(x, alturaTerreno(x, z), z); a.scale.setScalar(s); a.rotation.y = R() * 6; esc.add(a);
      if (i >= 2) a.traverse(o => { if (o.isInstancedMesh) o.castShadow = false; });
    });

    /* ---- utilería: linterna, cuenco con incienso, banco, rocas */
    const piedra = T.texturaPiedra(6, [170, 168, 160], [70, 68, 66]);
    const mPiedra = new THREE.MeshStandardMaterial({ map: piedra.map, normalMap: piedra.normalMap, roughness: 0.95 });
    const lin = linternaPiedra(mPiedra); lin.position.set(-4.4, 0, -6.5); lin.scale.setScalar(1.35); esc.add(lin);
    const bronce = new THREE.MeshStandardMaterial({ color: "#5a4128", roughness: 0.45, metalness: 0.8 });
    const cuenco = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.5, 0], [0.62, 0.15], [0.78, 0.5], [0.72, 0.55], [0.6, 0.35], [0, 0.3]].map(([x, y]) => new THREE.Vector2(x, y)), 26), bronce);
    cuenco.position.set(3.6, 0.35, -7.5); cuenco.castShadow = true; esc.add(cuenco);
    const pie = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 0.35, 10), mPiedra); pie.position.set(3.6, 0.17, -7.5); pie.castShadow = true; esc.add(pie);
    const ceniza = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), new THREE.MeshStandardMaterial({ color: "#6a625a", roughness: 1 })); ceniza.rotation.x = -Math.PI / 2; ceniza.position.set(3.6, 0.82, -7.5); esc.add(ceniza);
    for (let i = 0; i < 9; i++) { const v = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.9, 4), new THREE.MeshStandardMaterial({ color: "#8a4a2a" })); v.position.set(3.6 + (R() - 0.5) * 0.7, 1.25, -7.5 + (R() - 0.5) * 0.7); v.rotation.set((R() - 0.5) * 0.3, 0, (R() - 0.5) * 0.3); esc.add(v); }
    const madera = new THREE.MeshStandardMaterial({ color: "#6a4a2e", roughness: 0.9 });
    const banco = new THREE.Group();
    for (const [w, h, d, x, y] of [[2.2, 0.12, 0.7, 0, 0.62], [0.12, 0.6, 0.6, -0.95, 0.3], [0.12, 0.6, 0.6, 0.95, 0.3]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), madera); b.position.set(x, y, 0); b.castShadow = true; banco.add(b); }
    banco.position.set(-6.2, 0, 5.2); banco.rotation.y = 0.5; esc.add(banco);
    const mRoca = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
    for (let i = 0; i < 14; i++) {
      const x = (R() - 0.5) * 40, z = -4 - R() * 22, s = 0.35 + R() * 1.1;
      const ro = new THREE.Mesh(crearRoca(70 + i, { detalle: 2, achatada: 0.6, tonos: ["#4c4740", "#6d6558", "#8b8272"] }), mRoca);
      ro.position.set(x, alturaTerreno(x, z) + s * 0.2, z); ro.scale.setScalar(s); ro.castShadow = ro.receiveShadow = true; esc.add(ro);
    }
    // pasto: matas de hojas finas instanciadas
    const brizna = new THREE.PlaneGeometry(0.04, 0.22, 1, 3); brizna.translate(0, 0.11, 0);
    const bp = brizna.attributes.position; for (let i = 0; i < bp.count; i++) bp.setX(i, bp.getX(i) * (1 - bp.getY(i) * 1.4));
    const pasto = new THREE.InstancedMesh(brizna, new THREE.MeshStandardMaterial({ color: "#b9b25a", side: THREE.DoubleSide, roughness: 1 }), 9000);
    const mt = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    for (let i = 0; i < 9000; i++) {
      const x = (R() - 0.5) * 46, z = 8 - Math.pow(R(), 0.7) * 40;
      q.setFromEuler(new THREE.Euler((R() - 0.5) * 0.4, R() * 6.28, (R() - 0.5) * 0.4));
      mt.compose(new THREE.Vector3(x, alturaTerreno(x, z), z), q, new THREE.Vector3().setScalar(0.6 + R() * 1.1));
      pasto.setMatrixAt(i, mt); pasto.setColorAt(i, c.set(["#a3a049", "#8a8f3c", "#c2a44a", "#7d8a3a"][(R() * 4) | 0]));
    }
    pasto.receiveShadow = true; esc.add(pasto);

    /* ---- luces */
    const sol = new THREE.DirectionalLight("#fff0d6", 3.6);
    sol.position.copy(SOL).multiplyScalar(60); sol.castShadow = true; sol.shadow.mapSize.set(4096, 4096);
    const sc = sol.shadow.camera; sc.left = -28; sc.right = 28; sc.top = 24; sc.bottom = -24; sc.near = 5; sc.far = 160;
    sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.04; sol.shadow.radius = 3;
    esc.add(sol, sol.target);
    esc.add(new THREE.HemisphereLight("#c9dcff", "#6a4a34", 1.3));
    const relleno = new THREE.DirectionalLight("#ffe2c4", 0.7); relleno.position.set(-3, 5, 14); esc.add(relleno);
    const brasa = new THREE.PointLight("#ff9a40", 9, 9, 1.6); brasa.position.set(-4.4, 2.3, -6.5); esc.add(brasa); this.brasa = brasa;

    /* ---- atmósfera */
    const punto = T.texturaPunto();
    const hojasCaen = crearParticulas({ n: 110, centro: [0, 0.4, 0], caja: [17, 11, 11], color: "#e2521f", intensidad: 1.15, tam: 0.24, subida: -0.55, deriva: 1.1, mapa: T.texturaHoja(), semilla: 3, aditivo: false });
    hojasCaen.position.z = -2; esc.add(hojasCaen); this.animados.push(hojasCaen);
    const motas = crearParticulas({ n: 260, centro: [0, 0.2, 0], caja: [18, 8, 14], color: "#fff0c8", intensidad: 1.6, tam: 0.05, subida: 0, deriva: 0.5, mapa: punto, semilla: 9 });
    motas.position.z = -6; esc.add(motas); this.animados.push(motas);
    const humo = crearParticulas({ n: 26, centro: [0, 1.0, 0], caja: [0.18, 3.4, 0.18], color: "#cfd3da", intensidad: 0.5, tam: 0.7, subida: 0.32, deriva: 0.28, mapa: punto, semilla: 5, aditivo: false });
    humo.position.set(3.6, 0, -7.5); esc.add(humo); this.animados.push(humo);
    this.bruma = crearBruma(); this.bruma.position.set(0, 0.7, -40); esc.add(this.bruma);
    const bruma2 = crearBruma(); bruma2.position.set(0, 1.6, -70); esc.add(bruma2); this.animados.push(bruma2, this.bruma);
  }

  /* ---------------------------------------------------------------- interfaz */

  iniciar(ui) {
    this.ui = ui;
    const el = document.createElement("section"); el.className = "titulo";
    el.innerHTML = `
      <div class="logo">
        <div class="kicker">Torneo de las Sombras</div>
        <h1>Reino Caído</h1>
        <div class="filete"></div>
      </div>
      <div class="pulsar">Presioná <b>ENTER</b> para comenzar</div>
      <ul class="menu-titulo" hidden></ul>
      <div class="pie-titulo">three.js · demo de combate 3D</div>
      <div class="panel sala"><div class="caja"><h2>Sala online</h2><div class="sala-cuerpo"></div>
        <div class="sala-btns"></div><div class="cierra">Esc para volver</div></div></div>
      <div class="panel ctl"><div class="caja"><h2>Controles</h2>
        <table><tr><th></th><th>Jugador 1</th><th>Jugador 2</th></tr>${AYUDA.map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><td>${c}</td></tr>`).join("")}</table>
        <div class="cierra">Esc para volver · En «Un jugador» podés usar ambos juegos de teclas</div></div></div>`;
    ui.append(el); this.el = el;
    this.menuEl = el.querySelector(".menu-titulo"); this.pulsarEl = el.querySelector(".pulsar"); this.panelEl = el.querySelector(".panel.ctl"); this.salaEl = el.querySelector(".panel.sala");
    this.opcionesMenu = [
      { texto: "Un jugador", fn: () => this._empezar("1p") },
      { texto: "Dos jugadores", fn: () => this._empezar("2p") },
      { texto: "Sala online", fn: () => this._salaPanel(true) },
      { texto: "Controles", fn: () => this._panel(true) }
    ];
    this.menuEl.innerHTML = this.opcionesMenu.map(o => `<li>${o.texto}</li>`).join("");
    [...this.menuEl.children].forEach((li, i) => { li.onmouseenter = () => this._sel(i); li.onclick = () => { this._abrir(); this._sel(i); this.opcionesMenu[i].fn(); }; });
    el.addEventListener("click", e => { if (this.estado === "esperando") this._abrir(); });
    this._mm = e => { this.mouse.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5); };
    window.addEventListener("mousemove", this._mm);
    this.app.controles.alPresionar = (cod, e, r) => this._tecla(cod, e, r);
    this.render.mostrar(this.escena, this.camara, this.opciones);
    requestAnimationFrame(() => el.classList.add("on"));
    this.mostrado = true;
  }

  _abrir() {
    if (this.estado !== "esperando") return;
    this.estado = "menu"; sfx.activar(); sfx.confirmar(); ambiental.poner(0.55);
    this.pulsarEl.hidden = true; this.menuEl.hidden = false; this._sel(0);
  }
  _sel(i) { this.sel = (i + this.opcionesMenu.length) % this.opcionesMenu.length; [...this.menuEl.children].forEach((li, k) => li.classList.toggle("sel", k === this.sel)); }
  /* ---- sala online ---- */
  async _salaPanel(on) {
    this.salaAbierta = on; this.salaEl.classList.toggle("on", on); if (!on) return;
    const sala = this.app.sala;
    sala.alCambiar = () => this._pintarSala();
    if (!sala.activa) { try { await sala.crear(); } catch (e) { sala.err = e.message; } }
    this._pintarSala();
  }
  _pintarSala() {
    const sala = this.app.sala, cuerpo = this.salaEl.querySelector(".sala-cuerpo"), btns = this.salaEl.querySelector(".sala-btns");
    if (!sala.activa) { cuerpo.innerHTML = `<p class="err">${sala.err || "Creando la sala…"}</p>`; btns.innerHTML = ""; return; }
    const L = sala.links();
    cuerpo.innerHTML = `
      <p>Código de sala: <b class="cod">${sala.codigo}</b></p>
      <p class="lk"><span>Link para el JUGADOR 2</span><input readonly value="${L.jugador}"><button data-c="${L.jugador}">Copiar</button></p>
      <p class="lk"><span>Link para ESPECTADORES</span><input readonly value="${L.espectador}"><button data-c="${L.espectador}">Copiar</button></p>
      <ul class="est">
        <li class="${sala.hayJugador ? "ok" : ""}">Jugador 2: ${sala.hayJugador ? "conectado" : "esperando…"}</li>
        <li>Espectadores: ${sala.espectadores}</li>
        <li class="${sala.transmitiendo ? "ok" : ""}">Transmisión: ${sala.transmitiendo ? "en vivo" : "sin iniciar (los invitados no ven nada hasta que la inicies)"}</li>
        <li class="${sala.micOn ? "ok" : ""}">Tu micrófono: ${sala.micOn ? "encendido" : "apagado"}</li>
      </ul>
      ${sala.err ? `<p class="err">${sala.err}</p>` : ""}
      <p class="nota">Para que te vean desde otra red hay que exponer este servidor con un túnel HTTPS (cloudflared, ngrok…) y abrir el juego desde esa URL: así los links salen con la dirección pública y los micrófonos funcionan.</p>`;
    btns.innerHTML = `<button class="b-tx">${sala.transmitiendo ? "Transmisión activa" : "1 · Iniciar transmisión"}</button><button class="b-mic">${sala.micOn ? "Silenciar mi micrófono" : "Activar mi micrófono"}</button><button class="b-go">2 · Elegir personajes ▶</button>`;
    cuerpo.querySelectorAll("button[data-c]").forEach(b => { b.onclick = () => { navigator.clipboard?.writeText(b.dataset.c); b.textContent = "¡Copiado!"; }; });
    btns.querySelector(".b-tx").onclick = () => sala.transmitir();
    btns.querySelector(".b-mic").onclick = () => sala.activarMic(!sala.micOn);
    btns.querySelector(".b-go").onclick = () => { if (this.saliendo) return; this.saliendo = true; sfx.confirmar(); this.app.ir("seleccion", { modo: "online" }); };
  }

  _panel(on) { this.panel = on; this.panelEl.classList.toggle("on", on); sfx.ui(); }

  _tecla(cod, e, remoto) {
    if (remoto) return;
    sfx.activar();
    if (this.salaAbierta) { if (cod === "Escape") this._salaPanel(false); return; }
    if (this.panel) { if (["Escape", "Enter", "Backspace", "Space"].includes(cod)) this._panel(false); return; }
    if (this.estado === "esperando") { if (["Enter", "Space", "KeyF", "KeyJ"].includes(cod)) this._abrir(); return; }
    if (["ArrowUp", "KeyW"].includes(cod)) { this._sel(this.sel - 1); sfx.mover(); }
    else if (["ArrowDown", "KeyS"].includes(cod)) { this._sel(this.sel + 1); sfx.mover(); }
    else if (["Enter", "Space", "KeyF", "KeyJ"].includes(cod)) this.opcionesMenu[this.sel].fn();
    else if (cod === "Escape") { this.estado = "esperando"; this.menuEl.hidden = true; this.pulsarEl.hidden = false; }
  }

  _empezar(modo) { if (this.saliendo) return; this.saliendo = true; sfx.confirmar(); this.app.ir("seleccion", { modo }); }

  destruir() {
    window.removeEventListener("mousemove", this._mm);
    this.el?.remove();
    this.app.controles.alPresionar = null;
  }

  /* ---------------------------------------------------------------- bucle */

  update(dt) {
    this.t += dt;
    const t = this.t;
    this.cielo.userData.actualizar(t);
    const alto = this.render.h * this.render.renderer.getPixelRatio();
    for (const a of this.animados) a.userData.actualizar?.(t, alto);
    this.brasa.intensity = 9 * (0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 5.3));
    // cámara: dolly de entrada + deriva lenta + parallax
    const u = ease(Math.min(1, t / 7));
    const cam = this.camara, mx = this.mouse.x, my = this.mouse.y;
    cam.position.set(0.6 + Math.sin(t * 0.09) * 0.7 + mx * 0.9, 1.35 + Math.sin(t * 0.13) * 0.08 - my * 0.25, 15.5 - u * 3.6);
    cam.lookAt(mx * 2.4 - 0.4, 6.4 + my * -1.2 + Math.sin(t * 0.11) * 0.25, -60);
    cam.fov = 44 - u * 4;
    cam.updateProjectionMatrix();
    this.dragon.rotation.y = -0.25 + Math.sin(t * 0.07) * 0.03;
  }
}
