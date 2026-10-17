// Catálogo de modelos. Mientras no haya GLB definitivos, cada tipo se arma con geometría procedural y materiales
// PBR. Cuando en datos.js un tipo tenga «modelo.glb», crearModelo() devuelve el procedural al instante y lo
// reemplaza por el GLB apenas carga (con sus animaciones si las trae): el resto del juego no se entera.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { UNIDADES, EDIFICIOS, MINA } from "../datos.js";
import { conNiebla, conViento } from "./parches.js";
import { copia } from "./texturas.js";

/* ================================================================ materiales */

let MAT = null, TX = null;
const porEquipo = new Map();
const std = o => conNiebla(new THREE.MeshStandardMaterial(o));

export function prepararMateriales(tx) {
  TX = tx;
  MAT = {
    piedra: std({ map: copia(tx.muro.mapa, 1.5), normalMap: copia(tx.muro.normal, 1.5), normalScale: new THREE.Vector2(1.2, 1.2), color: "#e2dacd", roughness: 0.92 }),
    piedraBase: std({ map: copia(tx.muro.mapa, 3), normalMap: copia(tx.muro.normal, 3), color: "#a59d91", roughness: 0.95 }),
    madera: std({ map: copia(tx.madera.mapa, 1), normalMap: copia(tx.madera.normal, 1), color: "#d9c3a6", roughness: 0.82 }),
    maderaOscura: std({ map: copia(tx.madera.mapa, 1), normalMap: copia(tx.madera.normal, 1), color: "#7d6248", roughness: 0.85 }),
    paja: std({ map: copia(tx.paja.mapa, 2), normalMap: copia(tx.paja.normal, 2), normalScale: new THREE.Vector2(1.5, 1.5), roughness: 1 }),
    revoque: std({ map: copia(tx.revoque.mapa, 1), normalMap: copia(tx.revoque.normal, 1), roughness: 0.95 }),
    metal: std({ color: "#8e959e", metalness: 0.85, roughness: 0.42, envMapIntensity: 0.7 }),
    hierro: std({ color: "#5d636b", metalness: 0.85, roughness: 0.45 }),
    oro: std({ color: "#f0bf4c", metalness: 1, roughness: 0.22, emissive: "#6a4300", emissiveIntensity: 0.35 }),
    cuero: std({ color: "#6e4b2e", roughness: 0.72 }),
    cueroOscuro: std({ color: "#3f2b1c", roughness: 0.75 }),
    piel: std({ color: "#dcab86", roughness: 0.62 }),
    pelo: std({ color: "#3b2a1e", roughness: 0.9 }),
    lino: std({ color: "#d8ccb2", roughness: 0.92 }),
    caballo: std({ color: "#6a4630", roughness: 0.55 }),
    crin: std({ color: "#2a1d14", roughness: 0.9 }),
    oscuro: std({ color: "#120e0b", roughness: 0.8 }),
    roca: std({ map: copia(tx.roca.mapa, 1.2), normalMap: copia(tx.roca.normal, 1.2), roughness: 0.88, flatShading: true }),
    fuego: new THREE.MeshStandardMaterial({ color: "#ff8a2a", emissive: "#ff6a10", emissiveIntensity: 4, roughness: 1 }),
    vela: new THREE.MeshStandardMaterial({ color: "#ffd890", emissive: "#ffb347", emissiveIntensity: 2.2, roughness: 1 }),
    cultivo: std({ color: "#5f8a2e", roughness: 1 })
  };
  conNiebla(MAT.fuego); conNiebla(MAT.vela);
}

function equipo(color) {
  if (porEquipo.has(color)) return porEquipo.get(color);
  const c = new THREE.Color(color), oscuro = c.clone().multiplyScalar(0.55);
  const m = {
    tela: std({ color: c, roughness: 0.82 }),
    telaOscura: std({ color: oscuro, roughness: 0.85 }),
    tejado: std({ map: copia(TX.tejas.mapa, 3), normalMap: copia(TX.tejas.normal, 3), normalScale: new THREE.Vector2(1.4, 1.4), color: c.clone().lerp(new THREE.Color("#5a4a44"), 0.45), roughness: 0.7 }),
    estandarte: conViento(std({ color: c, roughness: 0.8, side: THREE.DoubleSide }), 0.1, 0.45, "x"),
    colgante: conViento(std({ color: c, roughness: 0.8, side: THREE.DoubleSide }), 0.05, 0.9, "y", true),
    esmalte: std({ color: c, metalness: 0.3, roughness: 0.35 })
  };
  porEquipo.set(color, m);
  return m;
}

/* ================================================================ ayudas de geometría */

const sombra = m => { m.castShadow = true; m.receiveShadow = true; return m; };
const malla = (g, mat, x = 0, y = 0, z = 0) => { const m = sombra(new THREE.Mesh(g, mat)); m.position.set(x, y, z); return m; };
const caja = (w, h, d, mat, x, y, z) => malla(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
const cil = (rt, rb, h, seg, mat, x, y, z) => malla(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z);
const cono = (r, h, seg, mat, x, y, z) => malla(new THREE.ConeGeometry(r, h, seg), mat, x, y, z);
const esfera = (r, mat, x, y, z, ws = 14, hs = 10) => malla(new THREE.SphereGeometry(r, ws, hs), mat, x, y, z);
const capsula = (r, l, mat, x, y, z) => malla(new THREE.CapsuleGeometry(r, l, 4, 10), mat, x, y, z);
const plana = g => { const n = g.toNonIndexed(); n.computeVertexNormals(); return n; };
// techo a dos aguas: prisma triangular a lo largo de X
const dosAguas = (largo, ancho, alto, mat, x, y, z) => {
  const g = plana(new THREE.CylinderGeometry(1, 1, largo, 3, 1).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2));
  g.scale(1, alto / 1.5, ancho / Math.sqrt(3)); g.translate(0, alto / 3, 0);
  return malla(g, mat, x, y, z);
};
// almenas alrededor de un rectángulo
function almenas(g, w, d, y, mat, paso = 0.32) {
  const geos = [];
  for (const [ax, az, largo, horiz] of [[0, -d / 2, w, true], [0, d / 2, w, true], [-w / 2, 0, d, false], [w / 2, 0, d, false]]) {
    const n = Math.floor(largo / paso);
    for (let i = 0; i < n; i += 2) {
      const t = -largo / 2 + (i + 0.5) * paso;
      geos.push(new THREE.BoxGeometry(0.16, 0.2, 0.16).translate(horiz ? t : ax, y, horiz ? az : t));
    }
  }
  g.add(malla(mergeGeometries(geos), mat));
}
function bandera(g, M, x, y, z, alto = 0.9) {
  g.add(cil(0.025, 0.025, alto, 6, MAT.maderaOscura, x, y + alto / 2, z));
  const tela = new THREE.PlaneGeometry(0.42, 0.28, 6, 2).translate(0.21, 0, 0);
  g.add(malla(tela, M.estandarte, x + 0.02, y + alto - 0.16, z));
}

/* ================================================================ unidades */

function humanoide(M, o) {
  const g = new THREE.Group(), P = {};
  const piel = MAT.piel, ropa = o.ropa || M.tela;
  // piernas (pivote en la cadera)
  for (const lado of [-1, 1]) {
    const pv = new THREE.Group(); pv.position.set(0.085 * lado, 0.47, 0);
    pv.add(capsula(0.055, 0.26, o.pantalon || MAT.cuero, 0, -0.2, 0));
    pv.add(caja(0.09, 0.07, 0.15, MAT.cueroOscuro, 0, -0.43, 0.025));
    g.add(pv); P[lado < 0 ? "piernaI" : "piernaD"] = pv;
  }
  const torso = new THREE.Group(); torso.position.y = 0.5; g.add(torso); P.torso = torso;
  const t = capsula(0.15, 0.2, ropa, 0, 0.24, 0); t.scale.set(1, 1, 0.78); torso.add(t);
  if (o.peto) { const pe = capsula(0.155, 0.16, MAT.metal, 0, 0.27, 0.005); pe.scale.set(1.02, 1, 0.82); torso.add(pe); }
  torso.add(malla(new THREE.TorusGeometry(0.135, 0.022, 6, 16).rotateX(Math.PI / 2), MAT.cueroOscuro, 0, 0.1, 0));
  if (o.faldon) { const f = cil(0.15, 0.2, 0.2, 10, ropa, 0, 0.0, 0); f.scale.z = 0.8; torso.add(f); }
  // cabeza
  const cab = new THREE.Group(); cab.position.y = 0.52; torso.add(cab); P.cabeza = cab;
  cab.add(esfera(0.105, piel, 0, 0, 0));
  cab.add(esfera(0.018, MAT.oscuro, -0.035, 0.015, 0.093, 6, 4)); cab.add(esfera(0.018, MAT.oscuro, 0.035, 0.015, 0.093, 6, 4));
  if (o.casco) {
    cab.add(malla(new THREE.SphereGeometry(0.118, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), MAT.metal, 0, 0.012, 0));
    cab.add(caja(0.02, 0.09, 0.02, MAT.metal, 0, -0.02, 0.112));
    if (o.penacho) cab.add(caja(0.03, 0.08, 0.2, M.tela, 0, 0.13, -0.02));
  } else if (o.capucha) {
    const c = malla(new THREE.SphereGeometry(0.118, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.5), o.capucha, 0, 0.012, -0.018); c.rotation.x = -0.35; cab.add(c);
    cab.add(malla(new THREE.ConeGeometry(0.05, 0.12, 8).rotateX(-2.2), o.capucha, 0, 0.06, -0.12));
  } else {
    cab.add(malla(new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), MAT.pelo, 0, 0.012, -0.01));
  }
  if (o.barba) cab.add(malla(new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), MAT.pelo, 0, -0.03, 0.05));
  // brazos (pivote en el hombro)
  for (const lado of [-1, 1]) {
    const pv = new THREE.Group(); pv.position.set(0.2 * lado, 0.38, 0); torso.add(pv);
    pv.add(capsula(0.045, 0.22, o.mangas || ropa, 0, -0.14, 0));
    if (o.hombreras) pv.add(esfera(0.07, MAT.metal, 0, 0, 0, 10, 6));
    const mano = new THREE.Group(); mano.position.set(0, -0.31, 0); pv.add(mano);
    mano.add(esfera(0.04, o.guantes || piel, 0, 0, 0, 8, 6));
    P[lado < 0 ? "brazoI" : "brazoD"] = pv; P[lado < 0 ? "manoI" : "manoD"] = mano;
  }
  if (o.capa) {
    const geo = new THREE.PlaneGeometry(0.36, 0.62, 4, 6);
    const pp = geo.attributes.position; for (let i = 0; i < pp.count; i++) pp.setZ(i, -Math.pow(Math.max(0, (0.31 - pp.getY(i)) / 0.62), 1.6) * 0.12);   // max(0): por redondeo el borde da apenas negativo y pow(negativo, 1,6) es NaN
    geo.computeVertexNormals(); geo.translate(0, -0.31, 0);
    const capa = malla(geo, o.capa, 0, 0.42, -0.13); capa.material = o.capa; torso.add(capa); P.capa = capa;
  }
  g.userData.partes = P;
  return g;
}

function espada() {
  const g = new THREE.Group();
  g.add(caja(0.035, 0.46, 0.01, MAT.metal, 0, 0.3, 0));
  g.add(caja(0.14, 0.022, 0.03, MAT.hierro, 0, 0.07, 0));
  g.add(cil(0.014, 0.014, 0.1, 6, MAT.cueroOscuro, 0, 0.02, 0));
  g.add(esfera(0.022, MAT.oro, 0, -0.035, 0, 8, 6));
  return g;
}
function escudo(M) {
  const g = new THREE.Group();
  const cara = cil(0.19, 0.19, 0.035, 18, M.tela, 0, 0, 0); cara.rotation.x = Math.PI / 2; g.add(cara);
  const aro = malla(new THREE.TorusGeometry(0.19, 0.016, 6, 24), MAT.hierro); g.add(aro);
  g.add(esfera(0.045, MAT.metal, 0, 0, 0.02, 10, 6));
  g.add(caja(0.03, 0.3, 0.012, M.telaOscura, 0, 0, 0.02));
  return g;
}

function peon(M) {
  const g = humanoide(M, { ropa: MAT.lino, mangas: MAT.lino, pantalon: MAT.cuero, barba: true });
  const P = g.userData.partes;
  const chaleco = capsula(0.153, 0.12, M.tela, 0, 0.22, 0); chaleco.scale.set(1, 1, 0.8); P.torso.add(chaleco);
  // herramienta: pico (sirve para minar y talar)
  const pico = new THREE.Group();
  pico.add(cil(0.016, 0.016, 0.5, 6, MAT.madera, 0, 0.18, 0));
  const cabeza = malla(new THREE.TorusGeometry(0.13, 0.018, 5, 10, Math.PI * 0.8), MAT.hierro, 0, 0.38, 0); cabeza.rotation.z = Math.PI * 0.6; pico.add(cabeza);
  pico.rotation.x = Math.PI / 2; P.manoD.add(pico); P.arma = pico;
  // carga visible: bolsa de oro o atado de troncos
  const oro = new THREE.Group(); oro.add(esfera(0.11, MAT.cuero, 0, 0, 0, 10, 8)); oro.add(esfera(0.05, MAT.oro, 0.02, 0.09, 0.03, 8, 6));
  oro.position.set(0, 0.28, -0.2); oro.visible = false; P.torso.add(oro); P.cargaOro = oro;
  const lena = new THREE.Group();
  for (let i = 0; i < 3; i++) { const t = cil(0.045, 0.045, 0.42, 7, MAT.maderaOscura, (i - 1) * 0.08, 0, i === 1 ? 0.05 : 0); t.rotation.z = Math.PI / 2; lena.add(t); }
  lena.position.set(0, 0.32, -0.19); lena.visible = false; P.torso.add(lena); P.cargaMadera = lena;
  return g;
}

function soldado(M) {
  const g = humanoide(M, { ropa: M.tela, mangas: MAT.hierro, pantalon: MAT.hierro, casco: true, penacho: true, peto: true, hombreras: true, faldon: true, guantes: MAT.cueroOscuro, capa: M.telaOscura });
  const P = g.userData.partes;
  const e = espada(); e.rotation.x = Math.PI / 2; P.manoD.add(e); P.arma = e;
  const s = escudo(M); s.position.set(-0.02, 0.02, 0.07); s.rotation.y = -0.15; P.manoI.add(s);
  P.brazoI.rotation.set(-0.9, 0, 0.25);
  return g;
}

function arquero(M) {
  const g = humanoide(M, { ropa: std({ color: "#4b5a34", roughness: 0.9 }), mangas: MAT.cuero, pantalon: MAT.cueroOscuro, capucha: M.telaOscura, capa: M.tela, guantes: MAT.cuero });
  const P = g.userData.partes;
  const arco = new THREE.Group();
  arco.add(malla(new THREE.TorusGeometry(0.34, 0.014, 6, 20, Math.PI * 0.95), MAT.madera)); arco.children[0].rotation.z = Math.PI / 2 + 0.08;
  arco.add(cil(0.003, 0.003, 0.68, 3, MAT.lino, -0.02, 0, 0));
  arco.rotation.set(0, Math.PI / 2, 0); P.manoI.add(arco); P.arma = arco;
  const carcaj = cil(0.05, 0.045, 0.36, 8, MAT.cuero, 0.08, 0.3, -0.16); carcaj.rotation.z = 0.35; P.torso.add(carcaj);
  for (let i = 0; i < 3; i++) P.torso.add(cil(0.006, 0.006, 0.12, 3, MAT.lino, 0.12 + i * 0.02, 0.5, -0.17));
  P.brazoI.rotation.set(-1.2, 0, 0.1);
  return g;
}

function caballero(M) {
  const g = new THREE.Group(), P = {};
  // caballo
  const cab = new THREE.Group(); g.add(cab); P.caballo = cab;
  const cuerpo = capsula(0.23, 0.62, MAT.caballo, 0, 0.88, 0); cuerpo.rotation.x = Math.PI / 2; cab.add(cuerpo);
  const cuello = capsula(0.12, 0.34, MAT.caballo, 0, 1.12, 0.42); cuello.rotation.x = 0.7; cab.add(cuello);
  const cabeza = capsula(0.085, 0.28, MAT.caballo, 0, 1.28, 0.62); cabeza.rotation.x = 1.6; cab.add(cabeza);
  cab.add(caja(0.04, 0.3, 0.1, MAT.crin, 0, 1.24, 0.36));
  const cola = capsula(0.04, 0.3, MAT.crin, 0, 0.88, -0.6); cola.rotation.x = -0.5; cab.add(cola);
  const gualdrapa = cil(0.27, 0.3, 0.42, 14, M.tela, 0, 0.8, -0.02); gualdrapa.rotation.x = Math.PI / 2; gualdrapa.scale.set(1, 1.6, 0.85); cab.add(gualdrapa);
  const testera = malla(new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), MAT.metal, 0, 1.31, 0.6); testera.rotation.x = 1.4; cab.add(testera);
  P.patas = [];
  for (const [x, z] of [[-0.13, 0.38], [0.13, 0.38], [-0.13, -0.38], [0.13, -0.38]]) {
    const pv = new THREE.Group(); pv.position.set(x, 0.78, z);
    pv.add(capsula(0.05, 0.56, MAT.caballo, 0, -0.38, 0)); pv.add(cil(0.055, 0.06, 0.07, 8, MAT.oscuro, 0, -0.74, 0));
    cab.add(pv); P.patas.push(pv);
  }
  // jinete
  const jin = humanoide(M, { ropa: M.tela, mangas: MAT.metal, pantalon: MAT.hierro, casco: true, penacho: true, peto: true, hombreras: true, guantes: MAT.hierro, capa: M.telaOscura });
  jin.position.set(0, 0.62, -0.05); cab.add(jin);
  const J = jin.userData.partes;
  J.piernaI.rotation.set(-1.2, 0, -0.5); J.piernaD.rotation.set(-1.2, 0, 0.5);
  const lanza = new THREE.Group();
  lanza.add(cil(0.022, 0.03, 1.6, 6, MAT.madera, 0, 0.5, 0)); lanza.add(cono(0.045, 0.2, 6, MAT.metal, 0, 1.38, 0));
  lanza.add(malla(new THREE.PlaneGeometry(0.2, 0.12), M.estandarte, 0.1, 1.1, 0));
  lanza.rotation.x = Math.PI / 2 - 0.25; J.manoD.add(lanza);
  const s = escudo(M); s.position.set(0, 0, 0.06); J.manoI.add(s); J.brazoI.rotation.set(-0.8, 0, 0.2);
  Object.assign(P, { torso: J.torso, brazoD: J.brazoD, brazoI: J.brazoI, cabeza: J.cabeza, arma: lanza, capa: J.capa });
  g.userData.partes = P;
  return g;
}

/* ================================================================ edificios */

function castillo(M) {
  const g = new THREE.Group();
  g.add(caja(3.9, 0.3, 3.9, MAT.piedraBase, 0, 0.12, 0));
  // muralla y torres de esquina
  g.add(caja(3.3, 1.3, 3.3, MAT.piedra, 0, 0.9, 0));
  almenas(g, 3.3, 3.3, 1.65, MAT.piedra);
  for (const [x, z] of [[-1.62, -1.62], [1.62, -1.62], [-1.62, 1.62], [1.62, 1.62]]) {
    g.add(cil(0.48, 0.55, 2.2, 14, MAT.piedra, x, 1.25, z));
    g.add(cil(0.56, 0.5, 0.18, 14, MAT.piedra, x, 2.4, z));
    g.add(cono(0.66, 1.25, 14, M.tejado, x, 3.1, z));
    g.add(esfera(0.06, MAT.oro, x, 3.76, z, 8, 6));
  }
  // torre del homenaje
  g.add(caja(1.7, 2.1, 1.7, MAT.piedra, 0, 2.2, 0.1));
  almenas(g, 1.7, 1.7, 3.35, MAT.piedra, 0.28);
  g.add(dosAguas(1.9, 1.85, 1.2, M.tejado, 0, 3.3, 0.1));
  for (const x of [-0.45, 0.45]) g.add(caja(0.18, 0.34, 0.04, MAT.vela, x, 2.5, 0.97));
  // portón con arco
  g.add(caja(0.9, 1.0, 0.1, MAT.oscuro, 0, 0.75, 1.66));
  g.add(malla(new THREE.CylinderGeometry(0.45, 0.45, 0.1, 16, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2), MAT.oscuro, 0, 1.25, 1.66));
  g.add(caja(0.98, 0.08, 0.14, MAT.maderaOscura, 0, 0.27, 1.7));
  for (const x of [-1, 1]) { g.add(malla(new THREE.PlaneGeometry(0.42, 0.9, 3, 6), M.colgante, x * 0.82, 1.15, 1.67)); }
  bandera(g, M, 0, 4.0, 0.1, 1.0);
  return g;
}

function granja(M) {
  const g = new THREE.Group();
  g.add(caja(1.9, 0.12, 1.9, MAT.piedraBase, 0, 0.05, 0));
  g.add(caja(1.25, 0.85, 0.95, MAT.revoque, -0.15, 0.53, -0.3));
  // entramado de madera
  for (const x of [-0.75, -0.15, 0.45]) g.add(caja(0.07, 0.86, 0.06, MAT.maderaOscura, x, 0.53, 0.18));
  g.add(caja(1.27, 0.07, 0.06, MAT.maderaOscura, -0.15, 0.95, 0.18));
  g.add(caja(1.27, 0.07, 0.06, MAT.maderaOscura, -0.15, 0.55, 0.18));
  g.add(dosAguas(1.5, 1.3, 0.75, MAT.paja, -0.15, 0.95, -0.3));
  g.add(caja(0.22, 0.6, 0.22, MAT.piedra, 0.35, 1.45, -0.55));
  g.add(caja(0.28, 0.42, 0.04, MAT.maderaOscura, -0.15, 0.32, 0.19));
  g.add(caja(0.18, 0.16, 0.03, MAT.vela, -0.6, 0.62, 0.19));
  // huerta y cerco
  for (let i = 0; i < 4; i++) g.add(caja(0.12, 0.16, 0.62, MAT.cultivo, -0.62 + i * 0.26, 0.17, 0.55));
  for (const x of [-0.85, 0.25]) g.add(caja(0.04, 0.22, 0.75, MAT.madera, x, 0.2, 0.55));
  g.add(cil(0.22, 0.25, 0.4, 10, MAT.madera, 0.62, 0.3, 0.55));
  g.add(cono(0.27, 0.22, 10, MAT.paja, 0.62, 0.6, 0.55));
  bandera(g, M, 0.75, 0.1, -0.75, 0.7);
  return g;
}

function cuartel(M) {
  const g = new THREE.Group();
  g.add(caja(2.9, 0.22, 2.9, MAT.piedraBase, 0, 0.1, 0));
  g.add(caja(2.5, 1.1, 1.6, MAT.piedra, 0, 0.75, -0.45));
  g.add(dosAguas(2.75, 1.95, 1.0, M.tejado, 0, 1.3, -0.45));
  for (const x of [-1.25, 1.25]) g.add(cil(0.3, 0.33, 1.9, 10, MAT.piedra, x, 1.05, 0.38));
  for (const x of [-1.25, 1.25]) g.add(cono(0.4, 0.8, 10, M.tejado, x, 2.4, 0.38));
  g.add(caja(0.7, 0.85, 0.08, MAT.oscuro, 0, 0.62, 0.36));
  g.add(caja(0.8, 0.1, 0.12, MAT.maderaOscura, 0, 1.08, 0.38));
  for (const x of [-0.6, 0.6]) g.add(malla(new THREE.PlaneGeometry(0.34, 0.75, 3, 6), M.colgante, x, 0.9, 0.37));
  // muñeco de práctica y armero
  g.add(cil(0.04, 0.04, 0.7, 6, MAT.madera, 0.75, 0.45, 1.05));
  g.add(caja(0.4, 0.05, 0.05, MAT.madera, 0.75, 0.65, 1.05));
  g.add(esfera(0.13, MAT.paja, 0.75, 0.9, 1.05, 10, 8));
  const armero = new THREE.Group(); armero.position.set(-0.8, 0.12, 1.0);
  armero.add(caja(0.6, 0.05, 0.12, MAT.madera, 0, 0.45, 0));
  for (let i = 0; i < 4; i++) { const l = cil(0.012, 0.012, 0.7, 4, MAT.madera, -0.22 + i * 0.15, 0.4, 0); l.rotation.x = 0.15; armero.add(l); armero.add(cono(0.025, 0.08, 4, MAT.metal, -0.22 + i * 0.15, 0.78, 0.05)); }
  g.add(armero);
  bandera(g, M, 0, 2.2, -0.45, 0.9);
  return g;
}

function herreria(M) {
  const g = new THREE.Group();
  g.add(caja(2.9, 0.2, 2.9, MAT.piedraBase, 0, 0.1, 0));
  g.add(caja(2.3, 1.0, 1.5, MAT.piedra, -0.15, 0.7, -0.5));
  g.add(dosAguas(2.5, 1.8, 0.85, M.tejado, -0.15, 1.2, -0.5));
  // fragua con chimenea y fuego (brilla con el bloom)
  g.add(caja(0.5, 2.3, 0.5, MAT.piedra, 0.85, 1.25, -0.75));
  g.add(caja(0.6, 0.12, 0.6, MAT.piedra, 0.85, 2.42, -0.75));
  g.add(caja(0.8, 0.5, 0.6, MAT.piedra, 0.75, 0.45, 0.45));
  g.add(caja(0.5, 0.12, 0.4, MAT.fuego, 0.75, 0.72, 0.45));
  // techo abierto sobre el yunque
  for (const [x, z] of [[-1.1, 1.1], [0.2, 1.1]]) g.add(cil(0.05, 0.05, 1.1, 6, MAT.maderaOscura, x, 0.65, z));
  const alero = caja(1.6, 0.06, 1.0, MAT.madera, -0.45, 1.22, 0.75); alero.rotation.x = 0.18; g.add(alero);
  g.add(caja(0.34, 0.16, 0.14, MAT.hierro, -0.45, 0.5, 0.65));
  g.add(cil(0.08, 0.12, 0.3, 8, MAT.maderaOscura, -0.45, 0.3, 0.65));
  for (let i = 0; i < 3; i++) g.add(caja(0.25, 0.04, 0.04, MAT.metal, -1.05 + i * 0.1, 0.4 + i * 0.05, 0.3));
  return g;
}

function torre(M) {
  const g = new THREE.Group();
  g.add(caja(1.9, 0.18, 1.9, MAT.piedraBase, 0, 0.08, 0));
  g.add(cil(0.62, 0.8, 3.0, 16, MAT.piedra, 0, 1.6, 0));
  g.add(cil(0.85, 0.66, 0.3, 16, MAT.madera, 0, 3.2, 0));
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.add(caja(0.06, 0.32, 0.06, MAT.maderaOscura, Math.cos(a) * 0.8, 3.5, Math.sin(a) * 0.8)); }
  g.add(cono(0.98, 1.2, 16, M.tejado, 0, 4.25, 0));
  for (const a of [0, 2.1, 4.2]) { const t = caja(0.07, 0.36, 0.05, MAT.oscuro, Math.sin(a) * 0.72, 2.1, Math.cos(a) * 0.72); t.rotation.y = a; g.add(t); }
  g.add(caja(0.42, 0.7, 0.05, MAT.maderaOscura, 0, 0.5, 0.78));
  bandera(g, M, 0, 4.7, 0, 0.7);
  return g;
}

function mina() {
  const g = new THREE.Group();
  const rocas = [[0, 0.55, -0.3, 1.25], [-0.85, 0.35, 0.1, 0.8], [0.9, 0.4, 0.05, 0.85], [0.4, 0.25, 0.75, 0.55], [-0.6, 0.2, -0.95, 0.6]];
  rocas.forEach(([x, y, z, r], i) => {
    const geo = new THREE.DodecahedronGeometry(r, 1), p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (1 + Math.sin(k * 3.1 + i) * 0.12), p.getY(k) * (0.75 + Math.cos(k * 1.7) * 0.1), p.getZ(k) * (1 + Math.sin(k * 2.3) * 0.12));
    geo.computeVertexNormals(); g.add(malla(geo, MAT.roca, x, y, z));
  });
  // vetas de oro
  for (let i = 0; i < 9; i++) {
    const c = malla(new THREE.OctahedronGeometry(0.1 + (i % 3) * 0.04), MAT.oro, Math.sin(i * 2.4) * 0.9, 0.3 + (i % 4) * 0.22, Math.cos(i * 2.4) * 0.6 - 0.1);
    c.rotation.set(i, i * 2, 0); g.add(c);
  }
  // entrada apuntalada
  g.add(caja(0.7, 0.7, 0.12, MAT.oscuro, 0, 0.38, 0.95));
  for (const x of [-0.4, 0.4]) g.add(cil(0.06, 0.07, 0.85, 7, MAT.maderaOscura, x, 0.43, 1.02));
  g.add(caja(0.98, 0.1, 0.14, MAT.maderaOscura, 0, 0.88, 1.02));
  g.add(caja(0.14, 0.12, 0.08, MAT.vela, 0.48, 0.7, 1.07));
  // vagoneta
  const v = new THREE.Group(); v.position.set(0.85, 0, 1.15); v.rotation.y = -0.4;
  v.add(caja(0.42, 0.22, 0.3, MAT.madera, 0, 0.24, 0));
  for (const [x, z] of [[-0.14, -0.16], [0.14, -0.16], [-0.14, 0.16], [0.14, 0.16]]) { const r = cil(0.07, 0.07, 0.03, 10, MAT.hierro, x, 0.08, z); r.rotation.x = Math.PI / 2; v.add(r); }
  for (let i = 0; i < 5; i++) v.add(malla(new THREE.OctahedronGeometry(0.07), MAT.oro, -0.12 + (i % 3) * 0.12, 0.38, -0.06 + (i > 2 ? 0.12 : 0)));
  g.add(v);
  return g;
}

/* ================================================================ obra en construcción */

export function andamio(lado) {
  const g = new THREE.Group(), h = 1.6, r = lado / 2 - 0.1;
  g.add(caja(lado - 0.05, 0.12, lado - 0.05, MAT.piedraBase, 0, 0.05, 0));
  for (const [x, z] of [[-r, -r], [r, -r], [-r, r], [r, r]]) g.add(cil(0.04, 0.04, h, 5, MAT.madera, x, h / 2, z));
  for (const y of [0.55, 1.1]) for (const [x, z, rot] of [[0, -r, 0], [0, r, 0], [-r, 0, Math.PI / 2], [r, 0, Math.PI / 2]]) {
    const b = caja(lado - 0.2, 0.05, 0.06, MAT.madera, x, y, z); b.rotation.y = rot; g.add(b);
  }
  for (let i = 0; i < 3; i++) g.add(caja(0.5, 0.18, 0.3, MAT.piedra, -r * 0.6 + i * 0.35, 0.18, r * 0.75));
  return g;
}

/* ================================================================ catálogo y GLB */

const FABRICAS = { peon, soldado, arquero, caballero, castillo, granja, cuartel, herreria, torre, mina };
const cargador = new GLTFLoader();
const glbs = new Map();

function cargarGLB(ruta) {
  if (!glbs.has(ruta)) glbs.set(ruta, new Promise((ok, mal) => cargador.load(ruta, ok, undefined, mal)));
  return glbs.get(ruta);
}

// Devuelve { objeto, partes, mixer?, acciones? }. «objeto» es un Group cuyo origen es el centro de la base.
export function crearModelo(tipo, color) {
  const def = UNIDADES[tipo] || EDIFICIOS[tipo] || (tipo === "mina" ? MINA : null);
  const M = equipo(color || "#999999");
  const raiz = new THREE.Group();
  const proc = FABRICAS[tipo](M);
  raiz.add(proc);
  const res = { objeto: raiz, partes: proc.userData.partes || {}, procedural: true };
  const glb = def?.modelo?.glb;
  if (glb) {
    cargarGLB(glb).then(gltf => {
      const o = SkeletonUtils.clone(gltf.scene);
      o.traverse(n => { if (n.isMesh) { n.castShadow = n.receiveShadow = true; if (n.material) conNiebla(n.material); } });
      const caja = new THREE.Box3().setFromObject(o), tam = caja.getSize(new THREE.Vector3());
      // escala automática a la huella o la altura de la unidad, salvo que datos.js indique otra
      const objetivo = def.lado ? def.lado * 0.95 / Math.max(tam.x, tam.z) : (def.altura || 1) / tam.y;
      o.scale.setScalar(objetivo * (def.modelo.escala || 1));
      const c2 = new THREE.Box3().setFromObject(o), centro = c2.getCenter(new THREE.Vector3());
      o.position.set(-centro.x, -c2.min.y, -centro.z);
      raiz.remove(proc); raiz.add(o);
      res.procedural = false; res.partes = {};
      if (gltf.animations?.length) {
        res.mixer = new THREE.AnimationMixer(o);
        const buscar = (...claves) => gltf.animations.find(a => claves.some(k => a.name.toLowerCase().includes(k)));
        res.acciones = {};
        for (const [estado, claves] of Object.entries({ quieto: ["idle", "quieto"], camina: ["walk", "run", "camina"], ataca: ["attack", "ataca", "slash"], trabaja: ["work", "chop", "mine", "trabaja"], muere: ["death", "die", "muere"] })) {
          const clip = buscar(...claves); if (clip) res.acciones[estado] = res.mixer.clipAction(clip);
        }
        res.acciones.quieto?.play();
      }
    }).catch(e => console.warn("No pude cargar", glb, e.message));
  }
  return res;
}

export { equipo as materialesDeEquipo };
