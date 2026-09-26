// Arena: salón de un templo en ruinas al atardecer. Dos hileras de columnas talladas (una cerca de cámara, desenfocada;
// otra al fondo, recortando el sol en haces), piso de lajas pulidas por siglos de pisadas, techo de vigas de piedra y,
// más allá del muro bajo, un valle de peñascos con crestas brumosas y un dragón de piedra en la distancia.
//
// Escala: metros. La pelea ocurre en el plano z=0, a lo largo de X. La cámara mira hacia -Z.

import * as THREE from "three";
import * as T from "./tex.js";
import { crearCielo, entornoDesdeCielo } from "./cielo.js";
import { crearRoca, crearParticulas, crearLlama, crearHaz, fbm3, tuboAfilado } from "./props.js";

export const ARENA = { medioAncho: 5.2, zFondo: -5.2, zCerca: 4.4, altoTecho: 5.02 };

/**
 * Escenarios: el mismo salón con otra luz, otro cielo y otra atmósfera. Cada tema fija cielo, sol, niebla, luces ambientales,
 * techo, colores de estandartes/terreno y el clima (polvo, brasas, lluvia, nieve).
 */
export const TEMAS = {
  ocaso: { nombre: "Templo del Ocaso", cielo: "atardecer", sol: [-0.30, 0.19, -0.935], solCol: "#ffb46a", solI: 9.5, niebla: ["#e2a374", 0.0072], hemi: ["#ffb98a", "#8a5232", 0.85],
    relleno: ["#9eb6ff", 0.8], rim: ["#7b7dff", 2.2], patada: ["#ffd0a0", 1.15], fuego: 26, techo: true, rayos: 0.9, rayoCol: "#ffab5c", exposicion: 1.05,
    estandartes: ["#5c0d10", "#0f2f4a", "#3d0d2e", "#5c0d10"], polvo: "#ffe0b0", env: 0.55, terreno: "#e8b890",
    grade: { sombra: "#12153a", luz: "#ffb070" } },
  luna: { nombre: "Templo Lunar", cielo: "noche", sol: [0.25, 0.3, -0.92], solCol: "#a8c4ff", solI: 3.4, niebla: ["#0c1430", 0.0085], hemi: ["#4a68b8", "#1a1830", 0.75],
    relleno: ["#6a86d8", 0.55], rim: ["#ff9a50", 1.6], patada: ["#b8ccff", 0.9], fuego: 60, techo: true, rayos: 0.55, rayoCol: "#9db8ff", exposicion: 1.25,
    estandartes: ["#0f2f4a", "#1c1a4a", "#0f2f4a", "#3d0d2e"], polvo: "#b8ccff", env: 0.5, terreno: "#7f8fc0", ascuas: "#ffb060",
    grade: { sombra: "#040a26", luz: "#9fb8ff", saturacion: 1.0 } },
  alba: { nombre: "Santuario del Alba", cielo: "alba", sol: [0.18, 0.09, -0.98], solCol: "#ffc890", solI: 8, niebla: ["#ecc8d0", 0.017], hemi: ["#ffd0d8", "#9a7a88", 1.05],
    relleno: ["#c8d0ff", 0.9], rim: ["#ffc890", 1.4], patada: ["#ffe0d0", 1.2], fuego: 14, techo: false, rayos: 1.15, rayoCol: "#ffcfa0", exposicion: 1.1,
    estandartes: ["#7a2a3a", "#2a4a6a", "#7a2a3a", "#2a4a6a"], polvo: "#fff0e0", env: 0.8, terreno: "#f0d0c0",
    grade: { sombra: "#2a2048", luz: "#ffd0b0", contraste: 1.0 } },
  volcan: { nombre: "Forja del Volcán", cielo: "volcan", sol: [-0.12, 0.25, -0.96], solCol: "#ff6a20", solI: 6.5, niebla: ["#3a0e08", 0.013], hemi: ["#ff6a30", "#3a0c06", 0.7],
    relleno: ["#ff8a50", 0.6], rim: ["#ff3a10", 2.6], patada: ["#ffb070", 1.0], fuego: 70, techo: true, rayos: 0.8, rayoCol: "#ff6a20", exposicion: 1.15,
    estandartes: ["#3a0806", "#1a0a0a", "#3a0806", "#1a0a0a"], polvo: "#ff9a50", env: 0.35, terreno: "#ff4a18", lava: true, ascuas: "#ff7a20", pisoTinte: "#8a6a60",
    grade: { sombra: "#200404", luz: "#ff8040", contraste: 1.15 } },
  tormenta: { nombre: "Cumbre de la Tormenta", cielo: "tormenta", sol: [-0.2, 0.3, -0.93], solCol: "#c8d8ff", solI: 2.6, niebla: ["#5a6674", 0.016], hemi: ["#8ea0b8", "#2a3038", 0.9],
    relleno: ["#a8c0ff", 0.7], rim: ["#8ab0ff", 2.0], patada: ["#dbe6ff", 0.9], fuego: 30, techo: true, rayos: 0.2, rayoCol: "#c8d8ff", exposicion: 1.0,
    estandartes: ["#1c2a3a", "#3a1c2a", "#1c2a3a", "#3a1c2a"], polvo: "#c8d8ff", env: 0.6, terreno: "#8a94a0", lluvia: true, relampagos: true,
    grade: { sombra: "#0a1226", luz: "#c8d8ff", saturacion: 0.85 } },
  nieve: { nombre: "Ventisca del Norte", cielo: "nieve", sol: [-0.22, 0.24, -0.94], solCol: "#eaf0ff", solI: 6, niebla: ["#dfe8f2", 0.02], hemi: ["#dfeaff", "#8a9ab0", 1.2],
    relleno: ["#cfe0ff", 0.9], rim: ["#a8c8ff", 1.6], patada: ["#f0f6ff", 1.1], fuego: 22, techo: false, rayos: 0.5, rayoCol: "#eaf0ff", exposicion: 1.05,
    estandartes: ["#1c3a5a", "#5a1c2a", "#1c3a5a", "#5a1c2a"], polvo: "#ffffff", env: 0.9, terreno: "#f4f8ff", nieve: true, pisoTinte: "#c8d4e4",
    grade: { sombra: "#2a3a66", luz: "#e8f0ff", contraste: 0.98 } }
};
export const ORDEN_TEMAS = Object.keys(TEMAS);

export class Arena {
  constructor(render, tema = "ocaso") {
    this.render = render; this.tema = TEMAS[tema] || TEMAS.ocaso; this.temaId = TEMAS[tema] ? tema : "ocaso";
    this.escena = new THREE.Scene();
    this.sol = new THREE.Vector3(...this.tema.sol).normalize();
    this.t = 0;
    this.animados = [];
    this.llamas = [];
    this.estandartes = [];
    this.luces = {};
    this._construir();
  }

  get opciones() {
    return {
      sol: this.sol, rayos: this.tema.rayos, colorRayos: this.tema.rayoCol, umbralRayos: 1.05,
      dof: { foco: 8, rango: 7, desenfoque: 0.6 },
      bloom: { fuerza: 0.28, radio: 0.6, umbral: 1.3 },
      exposicion: this.tema.exposicion,
      grade: { viñeta: 0.5, grano: 0.035, aberracion: 0.16, contraste: 1.1, saturacion: 1.1, split: 0.07, ...this.tema.grade }
    };
  }

  _construir() {
    const esc = this.escena, r = this.render.renderer;
    esc.fog = new THREE.FogExp2(this.tema.niebla[0], this.tema.niebla[1]);

    /* ---- cielo + entorno */
    this.cielo = crearCielo(this.sol, this.tema.cielo);
    esc.add(this.cielo);
    esc.environment = entornoDesdeCielo(r, this.cielo);
    esc.environmentIntensity = this.tema.env;

    /* ---- materiales */
    const piso = T.texturaPiso(), col = T.texturaColumna(), lisa = T.texturaPiedra(3), muro = T.texturaPiedra(8, [176, 140, 104], [64, 50, 42]);
    const rep = (tex, x, y) => { const c = tex.clone(); c.repeat.set(x, y); c.needsUpdate = true; return c; };
    const mPiso = new THREE.MeshStandardMaterial({ map: rep(piso.map, 10, 2.8), normalMap: rep(piso.normalMap, 10, 2.8), roughnessMap: rep(piso.roughnessMap, 10, 2.8), roughness: 1, color: this.tema.pisoTinte || "#ffffff", metalness: 0.02, normalScale: new THREE.Vector2(1.0, 1.0), envMapIntensity: 1.4 });
    const mLado = new THREE.MeshStandardMaterial({ map: lisa.map, normalMap: lisa.normalMap, roughness: 0.92 });
    const mTallada = new THREE.MeshStandardMaterial({ map: col.map, normalMap: col.normalMap, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.85 });
    const mPiedra = new THREE.MeshStandardMaterial({ map: lisa.map, normalMap: lisa.normalMap, roughness: 0.9 });
    const mMuro = new THREE.MeshStandardMaterial({ map: rep(muro.map, 6, 0.6), normalMap: rep(muro.normalMap, 6, 0.6), roughness: 0.92 });
    const mTecho = new THREE.MeshStandardMaterial({ map: rep(muro.map, 8, 2), normalMap: rep(muro.normalMap, 8, 2), roughness: 0.95, color: "#ffd9b8" });
    this.mats = { mPiso, mPiedra, mTallada };

    const caja = (w, h, d, mat, x, y, z, { sombra = true, recibe = true } = {}) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z);
      m.castShadow = sombra; m.receiveShadow = recibe; return m;
    };

    /* ---- piso del salón (plataforma elevada sobre el valle) */
    const zIni = -5.9, zFin = 9.2, ancho = 52, zc = (zIni + zFin) / 2, prof = zFin - zIni;
    const suelo = new THREE.Mesh(new THREE.BoxGeometry(ancho, 1.2, prof), [mLado, mLado, mPiso, mLado, mLado, mLado]);
    suelo.position.set(0, -0.6, zc); suelo.receiveShadow = true; esc.add(suelo);

    /* ---- muro bajo del fondo con remate */
    esc.add(caja(ancho, 0.55, 0.7, mMuro, 0, 0.275, ARENA.zFondo));
    esc.add(caja(ancho, 0.12, 0.9, mLado, 0, 0.61, ARENA.zFondo));

    /* ---- columnas */
    const xsFondo = [-19.2, -13.8, -8.4, -3.0, 3.0, 8.4, 13.8, 19.2];
    const xsCerca = [-15.2, -9.8, -4.4, 4.4, 9.8, 15.2];
    for (const x of xsFondo) esc.add(this._columna(x, ARENA.zFondo, mTallada, mPiedra));
    for (const x of xsCerca) esc.add(this._columna(x, ARENA.zCerca, mTallada, mPiedra));

    /* ---- techo: dinteles, vigas transversales y losas (las losas no proyectan sombra: el sol «entra» por arriba) */
    const yViga = 4.77, zT0 = -6.4, zT1 = 9.2, zTc = (zT0 + zT1) / 2;
    esc.add(caja(ancho, 0.5, 0.75, mPiedra, 0, yViga, ARENA.zFondo));
    esc.add(caja(ancho, 0.5, 0.75, mPiedra, 0, yViga, ARENA.zCerca));
    for (const x of [...xsFondo, ...xsCerca.filter(x => !xsFondo.includes(x))]) esc.add(caja(0.7, 0.5, zT1 - zT0, mPiedra, x, yViga, zTc, { sombra: false }));
    if (this.tema.techo) esc.add(caja(ancho, 0.34, zT1 - zT0, mTecho, 0, ARENA.altoTecho + 0.17, zTc, { sombra: false }));

    /* ---- exterior: valle */
    this._valle();

    /* ---- luces */
    this._luces();

    /* ---- braseros, estandartes, polvo, haces */
    this._braseros();
    this._estandartes();
    this._atmosfera(xsFondo);

    /* ---- hojas caídas y detalles en el piso */
    this._escombros(mLado);
  }

  /** Columna estilo vijayanagara: zócalo escalonado, fuste tallado, collarín, capitel y ménsulas cruzadas. */
  _columna(x, z, mTallada, mPiedra) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const pieza = (w, h, d, y, mat = mPiedra) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.y = y; m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    let y = 0;
    const paso = (w, h, d, mat) => { pieza(w, h, d ?? w, y + h / 2, mat); y += h; };
    paso(1.55, 0.28); paso(1.3, 0.3); paso(1.02, 0.5);
    // el fuste tallado: 4 caras con la misma textura; techo/base sin dibujo
    const fuste = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.6, 1.0), [mTallada, mTallada, mPiedra, mPiedra, mTallada, mTallada]);
    fuste.position.y = y + 1.3; fuste.castShadow = fuste.receiveShadow = true; g.add(fuste); y += 2.6;
    paso(1.12, 0.14); paso(1.34, 0.2); paso(1.72, 0.2);
    // ménsulas: dos vigas en cruz, la de X más larga (apoya el dintel)
    const m1 = pieza(2.9, 0.3, 0.55, y + 0.15); const m2 = pieza(0.55, 0.3, 2.3, y + 0.15);
    y += 0.3;
    return g;
  }

  _valle() {
    const esc = this.escena;
    const tierra = T.texturaTierra(); tierra.repeat.set(160, 120);
    // terreno: llano cerca del templo y con lomas hacia el fondo (la niebla se traga la geometría lejana)
    const W = 1400, D = 900, g = new THREE.PlaneGeometry(W, D, 170, 110); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), zl = p.getZ(i), z = zl - D / 2 - 6, dist = Math.max(0, -z - 10);
      const lomas = (fbm3(x * 0.006, z * 0.006, 3, 4) - 0.35) * Math.min(1, dist / 120) * 12;
      const rugoso = (fbm3(x * 0.08, z * 0.08, 9, 3) - 0.5) * 2.2 * Math.min(1, dist / 40);
      p.setXYZ(i, x, lomas + rugoso, z);
    }
    g.computeVertexNormals();
    const suelo = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tierra, roughness: 1, color: this.tema.terreno, ...(this.tema.lava ? { emissive: "#ff3a10", emissiveMap: tierra, emissiveIntensity: 0.9 } : {}) }));
    suelo.position.y = -1.25; suelo.receiveShadow = true; esc.add(suelo);

    // peñascos tipo Hampi: bloques redondeados apilados en grupos
    const tipos = [1, 2, 3, 4, 5, 6].map(s => crearRoca(s * 13, { detalle: 3, achatada: 0.55 + (s % 3) * 0.2 }));
    const rocaN = T.texturaPiedra(12); rocaN.normalMap.repeat.set(5, 3);
    const mRoca = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, color: "#ffe0c2", normalMap: rocaN.normalMap, normalScale: new THREE.Vector2(1.7, 1.7), flatShading: true });
    const R = T.rng(99);
    const poner = (x, y, z, s) => {
      const m = new THREE.Mesh(tipos[(R() * tipos.length) | 0], mRoca);
      m.position.set(x, y, z); m.scale.set(s * (0.8 + R() * 0.5), s * (0.75 + R() * 0.5), s * (0.8 + R() * 0.5)); m.rotation.y = R() * 6.28;
      m.castShadow = m.receiveShadow = true; esc.add(m); return m;
    };
    for (let i = 0; i < 46; i++) {
      const z = -14 - R() * 90, x = (R() * 2 - 1) * (30 + (-z) * 0.9);
      if (Math.abs(x) < 7 && z > -40) continue;                                       // el encuadre del fondo queda más despejado
      const s = 1.6 + R() * 5.5 * (1 + (-z - 14) / 120);
      const y = -1.25 + Math.max(0, (fbm3(x * 0.006, z * 0.006, 3, 4) - 0.35) * Math.min(1, (-z - 10) / 120) * 12) + s * 0.3;
      poner(x, y, z, s);
      if (R() < 0.5) poner(x + (R() - 0.5) * s, y + s * (0.7 + R() * 0.4), z + (R() - 0.5) * s, s * (0.45 + R() * 0.4));   // roca apoyada encima
    }
    // dos peñascos grandes enmarcando la distancia, como en las fotos de referencia
    poner(-30, -0.4, -40, 6.5); poner(-27, 4.2, -41, 3.6); poner(34, 0.2, -52, 8);

    // crestas lejanas: capas de siluetas con neblina creciente
    const capas = [
      { z: -330, y: 14, alto: 60, col: "#8c5a55", amp: 26, f: 0.012 },
      { z: -470, y: 18, alto: 80, col: "#b9786a", amp: 38, f: 0.008 },
      { z: -640, y: 22, alto: 100, col: "#d9a184", amp: 50, f: 0.006 }
    ];
    capas.forEach((c, k) => {
      const geo = new THREE.PlaneGeometry(1800, c.alto, 220, 1), pp = geo.attributes.position;
      for (let i = 0; i < pp.count; i++) if (pp.getY(i) > 0) pp.setY(i, c.alto / 2 + (fbm3(pp.getX(i) * c.f, k * 7, 2, 4) - 0.35) * c.amp);
      else pp.setY(i, -c.alto / 2);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uCol: { value: new THREE.Color(c.col) }, uHaze: { value: new THREE.Color("#f2b985") } },
        vertexShader: "varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: `uniform vec3 uCol, uHaze; varying float vY; void main(){ float k = smoothstep(${(c.alto * 0.5).toFixed(1)}, ${(-c.alto * 0.5).toFixed(1)}, vY); gl_FragColor = vec4(mix(uCol, uHaze, k * 0.85), 1.0); }`,
        fog: false
      });
      const m = new THREE.Mesh(geo, mat); m.position.set(0, c.y - 10, c.z); m.renderOrder = -5; esc.add(m);
    });

  }

  _luces() {
    const esc = this.escena;
    const sol = new THREE.DirectionalLight(this.tema.solCol, this.tema.solI);
    sol.position.copy(this.sol).multiplyScalar(60);
    sol.castShadow = true;
    sol.shadow.mapSize.set(4096, 4096);
    const c = sol.shadow.camera; c.left = -17; c.right = 17; c.top = 10; c.bottom = -10; c.near = 5; c.far = 130;
    sol.shadow.bias = -0.0003; sol.shadow.normalBias = 0.035; sol.shadow.radius = 4;
    esc.add(sol, sol.target);
    // luz ambiente: cielo cálido arriba, rebote anaranjado desde el piso (ilumina el techo de piedra por debajo)
    const hemi = new THREE.HemisphereLight(...this.tema.hemi);
    // relleno frío desde el lado de la cámara: da volumen a los luchadores sin plancharlos
    const relleno = new THREE.DirectionalLight(...this.tema.relleno); relleno.position.set(-5, 3.5, 9);
    // contraluz violáceo: recorta la silueta contra el fondo cálido
    const rim = new THREE.DirectionalLight(...this.tema.rim); rim.position.set(7, 4, -6);
    // patada de luz cálida rasante para que las caras y torsos lean bien
    const patada = new THREE.DirectionalLight(...this.tema.patada); patada.position.set(4, 2.4, 8);
    esc.add(hemi, relleno, rim, patada);
    // luz de brasero (se anima en update)
    for (const x of [-6, 6]) { const l = new THREE.PointLight("#ff8a30", this.tema.fuego, 11, 1.7); l.position.set(x, 1.9, -3.4); esc.add(l); this.llamas.push({ luz: l, base: this.tema.fuego, fase: Math.random() * 10 }); }
    // luces reservadas para los proyectiles (una por jugador): agregarlas en plena pelea recompilaría todos los materiales
    this.luzProj = [0, 1].map(() => { const l = new THREE.PointLight("#fff", 0, 8, 1.5); esc.add(l); return l; });
    this.luces = { sol, hemi, relleno, rim, patada };
  }

  _braseros() {
    const esc = this.escena;
    const bronce = new THREE.MeshStandardMaterial({ color: "#3b2a1c", roughness: 0.5, metalness: 0.75 });
    const pts = [[0.0, 0], [0.42, 0.02], [0.5, 0.16], [0.62, 0.42], [0.66, 0.5], [0.58, 0.5], [0.46, 0.3], [0.0, 0.2]].map(([x, y]) => new THREE.Vector2(x, y));
    for (const x of [-6, 6]) {
      const g = new THREE.Group(); g.position.set(x, 0, -3.4);
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 1.2, 10), this.mats.mPiedra); pedestal.position.y = 0.6; pedestal.castShadow = true;
      const cuenco = new THREE.Mesh(new THREE.LatheGeometry(pts, 22), bronce); cuenco.position.y = 1.2; cuenco.castShadow = true;
      const brasa = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.9, 0.2) })); brasa.rotation.x = -Math.PI / 2; brasa.position.y = 1.62;
      g.add(pedestal, cuenco, brasa);
      for (let k = 0; k < 2; k++) { const llama = crearLlama(0.95 + k * 0.25, 0.6 - k * 0.12); llama.position.set(0, 1.62, 0); g.add(llama); this.llamas.push({ llama }); }
      esc.add(g);
    }
  }

  _estandartes() {
    const esc = this.escena;
    const E = this.tema.estandartes;
    for (const [x, fondo] of [[-5.7, E[0]], [5.7, E[1]], [-11.1, E[2]], [11.1, E[3]]]) {
      const tex = T.texturaEstandarte(fondo);
      const g = new THREE.PlaneGeometry(1.35, 2.9, 10, 24); g.translate(0, -1.45, 0);
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85, emissive: "#ff5a20", emissiveMap: tex, emissiveIntensity: 0.18 }));
      m.position.set(x, 4.4, ARENA.zFondo + 0.1); m.castShadow = true;
      m.userData.base = Float32Array.from(g.attributes.position.array);
      esc.add(m); this.estandartes.push(m);
    }
  }

  _atmosfera(xsFondo) {
    const esc = this.escena, punto = T.texturaPunto();
    // polvo suspendido: se ve donde el sol lo toca
    this.polvo = crearParticulas({ n: 900, centro: [0, 0.1, 0], caja: [14, 4.4, 8], color: this.tema.polvo, intensidad: 2.0, tam: 0.055, subida: 0, deriva: 0.4, mapa: punto, semilla: 5 });
    this.polvo.position.z = 0.5; esc.add(this.polvo);
    // brasas que suben de los braseros
    for (const x of [-6, 6]) {
      const b = crearParticulas({ n: 70, centro: [0, 1.7, 0], caja: [0.35, 3.6, 0.35], color: "#ff8a30", intensidad: 5, tam: 0.07, subida: 0.55, deriva: 0.25, mapa: punto, semilla: x + 9 });
      b.position.set(x, 0, -3.4); esc.add(b); this.animados.push(b);
    }
    // pétalos/hojas que cruzan el salón
    const hojas = crearParticulas({ n: 40, centro: [0, 0.4, 0], caja: [13, 3.2, 4], color: "#ff9a5a", intensidad: 1.6, tam: 0.14, subida: 0.05, deriva: 1.6, mapa: T.texturaHoja(), semilla: 17, aditivo: false });
    hojas.position.z = 0; esc.add(hojas); this.animados.push(hojas);
    this.animados.push(this.polvo);

    // clima del tema: lluvia, nieve o ascuas grandes
    if (this.tema.lluvia) { const l = crearParticulas({ n: 1500, centro: [0, 0, 0], caja: [18, 9, 10], color: "#b8ccff", intensidad: 1.3, tam: 0.045, subida: -11, deriva: 0.15, mapa: punto, semilla: 31 }); l.position.z = 1; esc.add(l); this.animados.push(l); }
    if (this.tema.nieve) { const n = crearParticulas({ n: 900, centro: [0, 0, 0], caja: [18, 8, 10], color: "#ffffff", intensidad: 1.6, tam: 0.07, subida: -0.9, deriva: 1.3, mapa: punto, semilla: 33, aditivo: false }); n.position.z = 1; esc.add(n); this.animados.push(n); }
    if (this.tema.ascuas) { const a = crearParticulas({ n: 260, centro: [0, 0, 0], caja: [16, 7, 9], color: this.tema.ascuas, intensidad: 4, tam: 0.06, subida: 0.6, deriva: 0.7, mapa: punto, semilla: 35 }); esc.add(a); this.animados.push(a); }
    // haces de sol: uno por vano entre columnas del fondo
    const L = this.sol.clone().negate();                              // dirección en que viaja la luz
    const Z = new THREE.Vector3(0, 0, 1);
    const huecos = [-16.5, -11.1, -5.7, 0, 5.7, 11.1, 16.5];
    huecos.forEach((x, i) => {
      const haz = crearHaz({ ancho: 4.5, alto: 3.7, largo: 30, color: this.tema.rayoCol, intensidad: (0.42 + (i % 2) * 0.1) * (this.tema.solI > 5 ? 1 : 0.5), semilla: i * 3.7 });
      haz.quaternion.setFromUnitVectors(Z, L);
      haz.position.set(x, 2.6, ARENA.zFondo).addScaledVector(L, 15 - 1.0);
      esc.add(haz); this.animados.push(haz);
    });
  }

  _escombros(mat) {
    const esc = this.escena, R = T.rng(4);
    // lajas rotas y pedazos de columna caída, sueltos por el piso fuera de la zona de pelea
    const trozos = [[-9.5, 0.32, 2.2, 1.4], [8.8, 0.25, 3.4, 1.1], [-12, 0.3, -2.6, 1.7], [11.6, 0.4, -1.6, 1.5], [-3.6, 0.16, 6.6, 0.8], [5.4, 0.16, 6.9, 0.7]];
    for (const [x, y, z, s] of trozos) {
      const m = new THREE.Mesh(crearRoca((x * 7) | 0, { detalle: 2, achatada: 0.6, tonos: ["#6e5e52", "#9a7f66", "#b99772"] }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
      m.position.set(x, y, z); m.scale.setScalar(s * 0.5); m.rotation.y = R() * 6; m.castShadow = m.receiveShadow = true; esc.add(m);
    }
    // hojas secas: instanciadas y planas sobre las lajas
    const hoja = new THREE.PlaneGeometry(0.22, 0.22); hoja.rotateX(-Math.PI / 2);
    const inst = new THREE.InstancedMesh(hoja, new THREE.MeshStandardMaterial({ map: T.texturaHoja(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }), 260);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    const paleta = ["#8a2a1a", "#c4501f", "#a86a26", "#6e5a24", "#b93a22"];
    for (let i = 0; i < 260; i++) {
      const x = (R() * 2 - 1) * 16, z = -4.6 + R() * 12;
      q.setFromEuler(new THREE.Euler(0, R() * 6.28, 0)); m.compose(new THREE.Vector3(x, 0.012, z), q, new THREE.Vector3().setScalar(0.6 + R() * 1.1));
      inst.setMatrixAt(i, m); inst.setColorAt(i, c.set(paleta[(R() * paleta.length) | 0]));
    }
    inst.receiveShadow = true; esc.add(inst);
  }

  /** Cada cuadro: animaciones ambientales (llamas, estandartes, partículas, ciclo de nubes). */
  update(dt, cam) {
    this.t += dt;
    const t = this.t;
    this.cielo.userData.actualizar(t);
    if (this.tema.relampagos) {                                   // relámpago: sube un instante la luz ambiente y el flash de pantalla
      this._rel = (this._rel ?? 3 + Math.random() * 6) - dt;
      if (this._rel <= 0) { this._rel = 4 + Math.random() * 8; this._relT = 1; }
      if (this._relT > 0) {
        this._relT = Math.max(0, this._relT - dt * 3.2); const k = this._relT * this._relT * (0.6 + 0.4 * Math.sin(t * 80));
        this.luces.hemi.intensity = this.tema.hemi[2] + k * 3.5; this.render.flash.set(0.8, 0.85, 1, Math.max(this.render.flash.w, k * 0.22));
      }
    }
    const alto = this.render.h * this.render.renderer.getPixelRatio();
    for (const a of this.animados) a.userData.actualizar?.(t, alto);
    for (const f of this.llamas) {
      if (f.luz) f.luz.intensity = f.base * (0.85 + 0.15 * Math.sin(t * 13 + f.fase) * Math.sin(t * 7.3 + f.fase * 2) + 0.08 * Math.sin(t * 31 + f.fase));
      if (f.llama) f.llama.userData.actualizar(t, cam);
    }
    for (const e of this.estandartes) {
      const p = e.geometry.attributes.position, b = e.userData.base;
      for (let i = 0; i < p.count; i++) {
        const y = -b[i * 3 + 1] / 2.9;                                   // 0 arriba, 1 abajo: el paño se mueve más abajo
        p.setZ(i, Math.sin(t * 1.4 + b[i * 3 + 1] * 1.6 + b[i * 3] * 2) * 0.09 * y + Math.sin(t * 0.7 + b[i * 3 + 1]) * 0.04 * y);
      }
      p.needsUpdate = true; e.geometry.computeVertexNormals();
    }
  }
}
