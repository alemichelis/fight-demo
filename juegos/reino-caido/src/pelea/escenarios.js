// Escenarios con geometría propia (no son el templo con otra luz): calle apocalíptica, azotea cyberpunk y mazmorra medieval.
// Cada constructor recibe la Arena, agrega su mundo a arena.escena, registra lo animado (llamas, actualizadores) y pide las luces.
//
// Reglas de encuadre (las mismas del templo): la pelea ocurre en el plano z=0 entre x=±4.9; la cámara mira hacia -Z desde z≈5..11
// con el centro en x=±3.4. Por eso lo cercano a cámara (z>-3) queda bajo o fuera de |x|<8, y lo grande vive detrás de z=-5.

import * as THREE from "three";
import * as T from "./tex.js";
import { crearRoca, crearParticulas, crearLlama, fbm3 } from "./props.js";

/* ------------------------------------------------------------------ utilidades */

const tex = (cv, { color = false, rep = [1, 1] } = {}) => {
  const t = new THREE.CanvasTexture(cv); if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 8; t.needsUpdate = true; return t;
};
const std = o => new THREE.MeshStandardMaterial(o);
const brillo = (hex, k = 3) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false });

function caja(esc, w, h, d, m, x, y, z, { sombra = true, recibe = true, rx = 0, ry = 0, rz = 0 } = {}) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz);
  o.castShadow = sombra; o.receiveShadow = recibe; esc.add(o); return o;
}

/** Un mapa de alturas en grises → albedo tintado entre dos colores + normal. */
function conRelieve(alt, oscuro, claro, semilla, fuerza = 3, variacion = 0.2) {
  const w = alt.width, h = alt.height, src = alt.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const [cv, c] = T.lienzo(w, h), im = c.createImageData(w, h), d = im.data, n = T.fbm(Math.min(w, h), semilla, 5, 6), N = Math.min(w, h), R = T.rng(semilla + 5);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, a = src[i] / 255, k = 1 + (n[(y % N) * N + (x % N)] - 0.5) * variacion * 2 + (R() - 0.5) * 0.08;
    d[i] = (oscuro[0] + (claro[0] - oscuro[0]) * a) * k; d[i + 1] = (oscuro[1] + (claro[1] - oscuro[1]) * a) * k; d[i + 2] = (oscuro[2] + (claro[2] - oscuro[2]) * a) * k; d[i + 3] = 255;
  }
  c.putImageData(im, 0, 0);
  return { albedo: cv, normal: T.normalDesdeAltura(alt, fuerza) };
}

function altRuido(S, semilla, base = 0.35, gan = 0.6, oct = 6, f = 3) {
  const r = T.fbm(S, semilla, oct, f), [alt, a] = T.lienzo(S), im = a.createImageData(S, S);
  for (let i = 0; i < S * S; i++) { const v = (base + r[i] * gan) * 255; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
  a.putImageData(im, 0, 0); return [alt, a];
}

function grietas(a, S, semilla, n, color = "rgba(0,0,0,.7)") {
  const R = T.rng(semilla); a.lineCap = "round";
  for (let i = 0; i < n; i++) {
    let x = R() * S, y = R() * S, ang = R() * 6.28; a.strokeStyle = color; a.lineWidth = 0.8 + R() * 1.8; a.beginPath(); a.moveTo(x, y);
    for (let k = 0; k < 9 + (R() * 8 | 0); k++) { ang += (R() - 0.5) * 1.1; x += Math.cos(ang) * (14 + R() * 18); y += Math.sin(ang) * (14 + R() * 18); a.lineTo(x, y); } a.stroke();
  }
}

/** Fachada de edificio: rejilla de ventanas apagadas/encendidas/rotas. Devuelve el albedo y (aparte) sólo lo encendido, para el brillo. */
function fachada({ semilla, colorMuro = "#2a2624", paleta = ["#ffb060"], encendidas = 0.05, rotas = 0.2, cols = 6, filas = 12, brilloFuerte = false, hollin = 0 }) {
  const W = 256, H = 512, R = T.rng(semilla), [cv, c] = T.lienzo(W, H), [emi, e] = T.lienzo(W, H);
  c.fillStyle = colorMuro; c.fillRect(0, 0, W, H); e.fillStyle = "#000"; e.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(${R() < 0.5 ? "0,0,0" : "255,255,255"},${R() * 0.05})`; c.fillRect(R() * W, R() * H, 1 + R() * 3, 1 + R() * 3); }
  const cw = W / cols, ch = H / filas;
  for (let f = 0; f < filas; f++) for (let k = 0; k < cols; k++) {
    const x = k * cw + cw * 0.18, y = f * ch + ch * 0.2, w = cw * 0.64, h = ch * 0.6, r = R();
    if (r < encendidas) { const col = paleta[(R() * paleta.length) | 0]; c.fillStyle = col; c.fillRect(x, y, w, h); e.fillStyle = col; e.fillRect(x, y, w, h); }
    else if (r < encendidas + rotas) { c.fillStyle = "#050506"; c.fillRect(x, y, w, h); c.strokeStyle = "rgba(160,160,170,.5)"; c.beginPath(); c.moveTo(x, y + h); c.lineTo(x + w * (0.3 + R() * 0.5), y); c.lineTo(x + w, y + h * R()); c.stroke(); }
    else { const g = c.createLinearGradient(x, y, x, y + h); g.addColorStop(0, brilloFuerte ? "#16182a" : "#1a1c22"); g.addColorStop(1, "#08080c"); c.fillStyle = g; c.fillRect(x, y, w, h); }
  }
  if (hollin) {                                                    // fachada quemada: hollín que sube desde abajo, manchas, huecos de derrumbe y grietas
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, `rgba(0,0,0,${hollin * 0.3})`); g.addColorStop(1, `rgba(0,0,0,${hollin * 0.85})`); c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 34; i++) { const x = R() * W, y = R() * H * 0.9, gg = c.createLinearGradient(x, y, x, y + 60 + R() * 90); gg.addColorStop(0, `rgba(0,0,0,${0.45 * hollin})`); gg.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = gg; c.fillRect(x - 8 - R() * 10, y, 16 + R() * 20, 60 + R() * 90); }
    for (let i = 0; i < 6; i++) {
      const x = R() * (W - 60), y = R() * (H - 90), w = 36 + R() * 60, h = 30 + R() * 70; c.fillStyle = "#050404"; c.beginPath(); c.moveTo(x, y + h * 0.3);
      for (let k = 0; k <= 6; k++) c.lineTo(x + w * k / 6 + (R() - 0.5) * 12, y + (k % 2 ? R() * 0.4 : 0) * h);
      for (let k = 6; k >= 0; k--) c.lineTo(x + w * k / 6 + (R() - 0.5) * 10, y + h * (0.75 + R() * 0.25)); c.closePath(); c.fill();
      c.strokeStyle = "rgba(120,80,50,.6)"; c.lineWidth = 1.4; for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(x + R() * w, y + 2); c.lineTo(x + R() * w + (R() - 0.5) * 8, y - 6 - R() * 10); c.stroke(); }
    }
    c.strokeStyle = "rgba(0,0,0,.55)"; c.lineWidth = 1.6; for (let i = 0; i < 12; i++) { let x = R() * W, y = R() * H; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (R() - 0.5) * 26; y += 10 + R() * 18; c.lineTo(x, y); } c.stroke(); }
    e.fillStyle = "#000"; for (let i = 0; i < 0; i++) e.fillRect(0, 0, 0, 0);
  }
  return { cv, emi };
}

/** Caja cuya UV se repite según su tamaño real: una celda de ventana mide `celda` metros. */
function geoFachada(w, h, d, celda = 2.6, cols = 6, filas = 12) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, cara = i => Math.floor(i / 4);
  for (let i = 0; i < uv.count; i++) {
    const f = cara(i), ancho = (f === 0 || f === 1) ? d : w, u = uv.getX(i), v = uv.getY(i);
    if (f === 2 || f === 3) uv.setXY(i, 0.02, 0.02);
    else uv.setXY(i, u * ancho / (cols * celda), v * h / (filas * celda));
  }
  return g;
}

function ponerLuces(A, lamparas) { A.tema.lamparas = lamparas; A._luces(); }

/* ================================================================== 1 · CALLE APOCALÍPTICA */

export function construirCalle(A) {
  const esc = A.escena, R = T.rng(11), t = A.tema;

  const [altA, aA] = altRuido(512, 7, 0.28, 0.5); grietas(aA, 512, 8, 16, "rgba(0,0,0,.85)");
  for (let i = 0; i < 20; i++) { aA.fillStyle = `rgba(0,0,0,${0.05 + R() * 0.12})`; aA.beginPath(); aA.ellipse(R() * 512, R() * 512, 10 + R() * 40, 6 + R() * 26, R() * 3, 0, 6.28); aA.fill(); }
  const asf = conRelieve(altA, [44, 42, 41], [122, 116, 108], 9, 3.4);
  const mAsfalto = std({ map: tex(asf.albedo, { color: true, rep: [8, 3] }), normalMap: tex(asf.normal, { rep: [8, 3] }), roughness: 0.92 });
  const [altC, aC] = altRuido(512, 12, 0.4, 0.5); grietas(aC, 512, 13, 9);
  const cem = conRelieve(altC, [78, 76, 72], [148, 144, 136], 14, 2.6);
  const mAcera = std({ map: tex(cem.albedo, { color: true, rep: [10, 1.4] }), normalMap: tex(cem.normal, { rep: [10, 1.4] }), roughness: 0.95 });
  const mHormigon = std({ map: tex(cem.albedo, { color: true, rep: [3, 3] }), normalMap: tex(cem.normal, { rep: [3, 3] }), roughness: 0.95, color: "#b8b2aa" });

  /* calzada + vereda + suelo lejano */
  const calzada = new THREE.Mesh(new THREE.BoxGeometry(60, 1.2, 20), [mHormigon, mHormigon, mAsfalto, mHormigon, mHormigon, mHormigon]);
  calzada.position.set(0, -0.6, 5.4); calzada.receiveShadow = true; esc.add(calzada);
  caja(esc, 60, 0.34, 3.6, mAcera, 0, -0.01, -6.4, { sombra: false });
  caja(esc, 60, 0.18, 0.22, mHormigon, 0, 0.09, -4.7, { sombra: false });                                  // cordón
  const lejano = new THREE.Mesh(new THREE.PlaneGeometry(1000, 800), std({ map: tex(asf.albedo, { color: true, rep: [90, 70] }), roughness: 1, color: "#6a5a52" }));
  lejano.rotation.x = -Math.PI / 2; lejano.position.set(0, -0.08, -380); lejano.receiveShadow = true; esc.add(lejano);
  // demarcación
  const pintura = std({ color: "#c9a92a", roughness: 0.85 }), blanca = std({ color: "#cfcac0", roughness: 0.9 });
  for (let x = -27; x < 28; x += 3) caja(esc, 1.6, 0.012, 0.16, pintura, x, 0.007, -1.7, { sombra: false });
  caja(esc, 60, 0.012, 0.12, blanca, 0, 0.007, -4.2, { sombra: false });

  /* edificios: 3 filas (la del fondo es sólo silueta) y un hueco central para que entre el resplandor del horizonte */
  const paleta = ["#ffb060", "#ff8a3a", "#ffd58a"];
  const fachadas = [0, 1, 2, 3].map(i => fachada({ semilla: 30 + i, colorMuro: ["#7a6252", "#665650", "#7e6650", "#5e4e46"][i], paleta, encendidas: 0.04, rotas: 0.22, brilloFuerte: false, hollin: 0.9 }));
  const mFach = fachadas.map(f => ({
    lado: std({ map: tex(f.cv, { color: true }), emissiveMap: tex(f.emi, { color: true }), emissive: "#ffffff", emissiveIntensity: 1.6, roughness: 0.95 }),
    techo: std({ color: "#1c1a19", roughness: 1 })
  }));
  const edificio = (x, z, w, h, d, k, { inclinado = 0, base = 0 } = {}) => {
    const m = new THREE.Mesh(geoFachada(w, h, d), [mFach[k].lado, mFach[k].lado, mFach[k].techo, mFach[k].techo, mFach[k].lado, mFach[k].lado]);
    m.position.set(x, base + h / 2, z); m.castShadow = true; m.receiveShadow = true; esc.add(m);
    // corona rota: losa caída y varillas
    const losa = caja(esc, w * (0.5 + R() * 0.4), 0.5, d * 0.9, mFach[k].techo, x + (R() - 0.5) * w * 0.4, base + h + 0.1, z, { rz: (R() < 0.5 ? -1 : 1) * (0.1 + R() * 0.2) * (1 + inclinado) });
    for (let i = 0; i < 4; i++) { const v = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4 + R() * 1.6, 5), std({ color: "#5a3a26", roughness: 0.8, metalness: 0.5 })); v.position.set(x + (R() - 0.5) * w * 0.8, base + h + 0.7, z + (R() - 0.5) * d * 0.7); v.rotation.set((R() - 0.5) * 0.5, 0, (R() - 0.5) * 0.5); esc.add(v); }
    return losa;
  };
  const filaA = [-44, -36, -28, -21, -15.5, 15.5, 21, 28, 36, 44];
  filaA.forEach((x, i) => edificio(x, -12.5, 6 + (i % 3) * 1.6, 9 + ((i * 7) % 11), 7, i % 4));
  [-9, -5, -1.5, 3, 7.5].forEach((x, i) => edificio(x, -14.5, 3.6 + (i % 2) * 1.4, 2.6 + ((i * 5) % 4), 4.5, (i + 1) % 4, { base: 0 }));   // muñones bajos al centro
  for (let i = 0; i < 12; i++) { const x = -66 + i * 12 + R() * 4; if (Math.abs(x) < 13) continue; edificio(x, -30, 8 + R() * 6, 20 + R() * 26, 9, i % 4); }
  const sil = std({ color: "#1c1512", roughness: 1 });
  for (let i = 0; i < 16; i++) { const h = 28 + R() * 60, m = caja(esc, 8 + R() * 9, h, 10, sil, -110 + i * 14 + R() * 6, h / 2 - 2, -62 - R() * 24, { sombra: false }); }

  const mConc = std({ color: "#5a5652", roughness: 1 });
  for (const x of filaA) {                                              // losas caídas apoyadas contra las fachadas y montones de escombro sobre la vereda
    caja(esc, 2.6 + R() * 1.6, 0.35, 1.5, mConc, x + (R() - 0.5) * 3, 1.0 + R() * 0.6, -8.6 - R() * 0.4, { rx: -0.9 - R() * 0.3, ry: (R() - 0.5) * 0.6 });
    for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(crearRoca((x * 3 + k) | 0, { detalle: 2, achatada: 0.6, tonos: ["#3a3735", "#5c5854", "#7a746d"] }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })); const s = 0.6 + R() * 1.1; m.position.set(x + (R() - 0.5) * 6, 0.12 + s * 0.14, -6.4 - R() * 1.6); m.scale.set(s * 1.3, s * 0.7, s); m.rotation.y = R() * 6; m.castShadow = m.receiveShadow = true; esc.add(m); }
  }
  for (const [x, z] of [[-30, -34], [-8, -50], [26, -40], [4, -70]]) {   // columnas de humo negro en la distancia
    const columna = crearParticulas({ n: 90, centro: [0, 0, 0], caja: [2.5, 70, 2.5], color: "#1c1512", intensidad: 0.75, tam: 9, subida: 1.6, deriva: 0.8, mapa: T.texturaPunto(), semilla: x + 40, aditivo: false });
    columna.position.set(x, 0, z); esc.add(columna); A.animados.push(columna);
  }

  /* autos destrozados */
  const mOxido = c => std({ color: c, roughness: 0.9, metalness: 0.35 }), mVidrio = std({ color: "#0a0a0c", roughness: 0.2, metalness: 0.6 });
  const coche = (x, z, ry, color, { volcado = false } = {}) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
    const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.75, 1.85), mOxido(color)); cuerpo.position.y = 0.62; cuerpo.castShadow = true;
    const cabina = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.7, 1.65), mOxido(color)); cabina.position.set(-0.2, 1.3, 0); cabina.castShadow = true;
    const cristal = new THREE.Mesh(new THREE.BoxGeometry(2.32, 0.5, 1.67), mVidrio); cristal.position.set(-0.2, 1.32, 0); cristal.scale.set(0.98, 0.9, 0.98);
    g.add(cuerpo, cristal, cabina); cabina.scale.set(1, 0.18, 1); cabina.position.y = 1.7;
    for (const [wx, wz] of [[1.4, 0.95], [1.4, -0.95], [-1.3, 0.95], [-1.3, -0.95]]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.28, 14), std({ color: "#0c0c0d", roughness: 1 })); r.rotation.x = Math.PI / 2; r.position.set(wx, 0.36, wz); r.castShadow = true; g.add(r); }
    if (volcado) { g.rotation.z = Math.PI; g.position.y = 1.5; }
    esc.add(g); return g;
  };
  coche(-11.2, -2.6, 0.22, "#5a2a1e"); coche(12.4, -2.9, -0.1, "#2c3238"); coche(-19, -3.2, 3.3, "#3a3a2a"); coche(21, -1.8, 0.4, "#4a2020", { volcado: true });

  /* barriles con fuego y humo (las dos luces de la arena viven acá) */
  const mBarril = std({ color: "#5a4030", roughness: 0.85, metalness: 0.5 });
  const brasero = (x, z, semilla) => {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.32, 0.95, 12, 1, true), mBarril); b.position.y = 0.48; b.castShadow = true;
    const fondo = new THREE.Mesh(new THREE.CircleGeometry(0.34, 14), brillo("#ff7a20", 2.2)); fondo.rotation.x = -Math.PI / 2; fondo.position.y = 0.72;
    g.add(b, fondo);
    for (let k = 0; k < 2; k++) { const l = crearLlama(1.25 + k * 0.3, 0.8 - k * 0.15); l.position.set(0, 0.85, 0); g.add(l); A.llamas.push({ llama: l }); }
    esc.add(g);
    const humo = crearParticulas({ n: 44, centro: [0, 1.1, 0], caja: [0.3, 6, 0.3], color: "#302a26", intensidad: 0.9, tam: 1.1, subida: 0.55, deriva: 0.55, mapa: T.texturaPunto(), semilla, aditivo: false });
    humo.position.set(x, 0, z); esc.add(humo); A.animados.push(humo);
    const asc = crearParticulas({ n: 60, centro: [0, 1.0, 0], caja: [0.35, 4, 0.35], color: "#ff8a30", intensidad: 5, tam: 0.06, subida: 0.6, deriva: 0.3, mapa: T.texturaPunto(), semilla: semilla + 1 });
    asc.position.set(x, 0, z); esc.add(asc); A.animados.push(asc);
  };
  brasero(-6.4, -3.5, 5); brasero(6.4, -3.5, 9);

  /* poste doblado, contenedor, escombros */
  const poste = new THREE.Group(); poste.position.set(-8.6, 0, -5.2); poste.rotation.z = 0.12;
  const mFierro = std({ color: "#2a2826", roughness: 0.6, metalness: 0.7 });
  const pm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 6.4, 8), mFierro); pm.position.y = 3.2; pm.castShadow = true;
  const brazo = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 6), mFierro); brazo.rotation.z = Math.PI / 2 - 0.5; brazo.position.set(0.85, 6.3, 0);
  const foco = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.32), std({ color: "#161616", roughness: 0.5 })); foco.position.set(1.75, 6.95, 0); foco.rotation.z = -0.5;
  poste.add(pm, brazo, foco); esc.add(poste);
  const cont = caja(esc, 3.4, 1.6, 1.5, std({ color: "#2f4a3a", roughness: 0.85, metalness: 0.4 }), 14.8, 0.8, -5.6, { ry: 0.12 });
  for (let i = 0; i < 22; i++) {
    const x = (R() * 2 - 1) * 24, z = -4.4 - R() * 3.6, s = 0.25 + R() * 0.7;
    if (Math.abs(x) < 6.5 && z > -5) continue;
    const m = new THREE.Mesh(crearRoca((i * 17) | 0, { detalle: 2, achatada: 0.6, tonos: ["#3e3b38", "#615d58", "#86807a"] }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    m.position.set(x, 0.05 + s * 0.15, z); m.scale.setScalar(s); m.rotation.y = R() * 6; m.castShadow = m.receiveShadow = true; esc.add(m);
  }
  for (let i = 0; i < 26; i++) {                                                                 // basura y trozos de concreto sobre la calzada, lejos de los luchadores
    const x = (R() * 2 - 1) * 26, z = -3.6 + R() * 11; if (Math.abs(x) < 9 && z > -3.2) continue;
    caja(esc, 0.2 + R() * 0.5, 0.08 + R() * 0.2, 0.2 + R() * 0.5, mHormigon, x, 0.06, z, { ry: R() * 3, rz: (R() - 0.5) * 0.5 });
  }

  /* clima: ceniza que cae y brasas al viento */
  const punto = T.texturaPunto();
  const ceniza = crearParticulas({ n: 750, centro: [0, 0, 0], caja: [18, 8, 10], color: "#d2c8bc", intensidad: 1.2, tam: 0.06, subida: -0.55, deriva: 1.0, mapa: punto, semilla: 41, aditivo: false });
  ceniza.position.z = 1; esc.add(ceniza); A.animados.push(ceniza);
  const polvo = crearParticulas({ n: 500, centro: [0, 0.1, 0], caja: [14, 4.4, 8], color: t.polvo, intensidad: 1.6, tam: 0.05, subida: 0, deriva: 0.5, mapa: punto, semilla: 5 });
  polvo.position.z = 0.5; esc.add(polvo); A.animados.push(polvo);

  ponerLuces(A, { color: "#ff8030", pos: [[-6.4, 1.5, -3.2], [6.4, 1.5, -3.2]] });
}

/* ================================================================== 2 · AZOTEA CYBERPUNK */

function letreroTex(texto, color, w = 512, h = 220) {
  const [cv, c] = T.lienzo(w, h); c.clearRect(0, 0, w, h);
  c.font = `900 ${Math.floor(h * 0.55)}px Oswald, Impact, sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
  c.shadowColor = color; c.shadowBlur = 26; c.fillStyle = color; c.fillText(texto, w / 2, h / 2); c.fillText(texto, w / 2, h / 2);
  c.shadowBlur = 0; c.fillStyle = "#ffffff"; c.globalAlpha = 0.85; c.fillText(texto, w / 2, h / 2);
  c.globalAlpha = 1; c.strokeStyle = color; c.lineWidth = 6; c.strokeRect(10, 10, w - 20, h - 20);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export function construirCyber(A) {
  const esc = A.escena, R = T.rng(21), t = A.tema;
  const NEON = ["#20e0ff", "#ff2a9a", "#a050ff", "#ffe040", "#40ff9a"];

  /* piso: paneles metálicos con juntas y remaches, húmedo (reflejos del entorno) */
  const [alt, a] = altRuido(512, 22, 0.42, 0.25, 4, 6);
  a.strokeStyle = "rgba(0,0,0,.95)"; a.lineWidth = 7;
  for (let i = 0; i <= 4; i++) { a.beginPath(); a.moveTo(i * 128, 0); a.lineTo(i * 128, 512); a.stroke(); a.beginPath(); a.moveTo(0, i * 128); a.lineTo(512, i * 128); a.stroke(); }
  a.fillStyle = "rgba(255,255,255,.55)"; for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) for (const [dx, dy] of [[14, 14], [114, 14], [14, 114], [114, 114]]) { a.beginPath(); a.arc(i * 128 + dx, k * 128 + dy, 3.5, 0, 6.28); a.fill(); }
  grietas(a, 512, 23, 4, "rgba(0,0,0,.5)");
  const pl = conRelieve(alt, [16, 18, 26], [52, 58, 76], 24, 3.6, 0.12);
  const mPiso = std({ map: tex(pl.albedo, { color: true, rep: [10, 4] }), normalMap: tex(pl.normal, { rep: [10, 4] }), roughness: 0.32, metalness: 0.7, envMapIntensity: 1.8 });
  const mLado = std({ color: "#101218", roughness: 0.7, metalness: 0.4 });
  const losa = new THREE.Mesh(new THREE.BoxGeometry(60, 1.2, 18), [mLado, mLado, mPiso, mLado, mLado, mLado]);
  losa.position.set(0, -0.6, 3.2); losa.receiveShadow = true; esc.add(losa);

  /* anillo de combate luminoso en el piso + líneas de neón */
  const anillo = (r, w, col, y, op = 0.9) => { const m = new THREE.Mesh(new THREE.RingGeometry(r, r + w, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2.4), transparent: true, opacity: op, toneMapped: false, side: THREE.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(0, y, -0.2); esc.add(m); return m; };
  anillo(5.9, 0.06, "#20e0ff", 0.012); anillo(6.15, 0.03, "#ff2a9a", 0.013, 0.7);
  for (const [z, col] of [[-3.9, "#ff2a9a"], [5.2, "#20e0ff"]]) caja(esc, 58, 0.012, 0.09, brillo(col, 2.4), 0, 0.012, z, { sombra: false });

  /* parapeto con remate luminoso y postes */
  caja(esc, 60, 0.9, 0.7, std({ color: "#14161e", roughness: 0.6, metalness: 0.5 }), 0, 0.45, -5.7);
  caja(esc, 60, 0.08, 0.72, brillo("#20e0ff", 2.6), 0, 0.94, -5.7, { sombra: false });
  for (let x = -27; x <= 27; x += 4.5) { caja(esc, 0.12, 1.5, 0.12, mLado, x, 1.6, -5.7); caja(esc, 0.16, 0.16, 0.16, brillo(NEON[(Math.abs(x) | 0) % 2 ? 1 : 0], 3), x, 2.4, -5.7, { sombra: false }); }
  const barandal = new THREE.Mesh(new THREE.BoxGeometry(60, 1.3, 0.03), new THREE.MeshStandardMaterial({ color: "#4ad8ff", transparent: true, opacity: 0.08, roughness: 0.1, metalness: 0.8 })); barandal.position.set(0, 1.65, -5.7); esc.add(barandal);

  /* la ciudad: torres con ventanas de neón (MeshBasic con multiplicador: lo claro supera el umbral del bloom) */
  const paletas = [["#20e0ff", "#a8f4ff", "#ffffff"], ["#ff2a9a", "#ff8ac8", "#ffe0f0"], ["#ffb030", "#ffe07a", "#ffffff", "#20e0ff"], ["#a050ff", "#20e0ff", "#ff2a9a", "#ffffff"]];
  const fTex = paletas.map((p, i) => { const f = fachada({ semilla: 60 + i, colorMuro: "#0b0c14", paleta: p, encendidas: 0.32, rotas: 0.0, cols: 6, filas: 12, brilloFuerte: true }); return tex(f.cv, { color: true }); });
  const mTorre = fTex.map(tx => new THREE.MeshBasicMaterial({ map: tx, color: new THREE.Color(1.7, 1.7, 1.7), toneMapped: false }));
  const mTecho = new THREE.MeshBasicMaterial({ color: "#07070c" });
  const torres = [];
  for (let i = 0; i < 130; i++) {
    const z = -22 - Math.pow(R(), 0.8) * 250, x = (R() * 2 - 1) * (55 + (-z) * 0.85);
    if (Math.abs(x) < 9 && z > -46) continue;
    const w = 7 + R() * 16, d = 7 + R() * 14, techo = -35 + R() * (60 + (-z) * 0.5), base = -160, h = techo - base;
    const m = new THREE.Mesh(geoFachada(w, h, d, 2.8), [mTorre[i % 4], mTorre[i % 4], mTecho, mTecho, mTorre[i % 4], mTorre[i % 4]]);
    m.position.set(x, base + h / 2, z); esc.add(m); torres.push({ x, z, w, d, techo });
    if (R() < 0.35) { const ant = caja(esc, 0.3, 6 + R() * 12, 0.3, mTecho, x, techo + 4, z, { sombra: false }); const luz = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), brillo("#ff2030", 4)); luz.position.set(x, techo + 8 + R() * 8, z); esc.add(luz); A.actualizadores.push(tt => { luz.visible = Math.sin(tt * 3 + x) > -0.2; }); }
  }

  /* letreros de neón sobre las torres cercanas */
  const palabras = ["NEON", "RAMEN", "ARCADE", "HOTEL", "BAR", "CLUB", "SYNTH", "TAXI"];
  const mons = torres.filter(o => o.z > -120 && Math.abs(o.x) > 9).slice(0, 14);
  mons.forEach((o, i) => {
    const col = NEON[i % NEON.length], w = 8 + R() * 8, h = w * 0.42, y = Math.max(8, Math.min(o.techo - 4, 6 + R() * 26));
    const tx = letreroTex(palabras[i % palabras.length], col);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tx, transparent: true, color: new THREE.Color(2.2, 2.2, 2.2), toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.set(o.x + (R() - 0.5) * o.w * 0.4, y, o.z + o.d / 2 + 0.4); esc.add(s);
    const marco = caja(esc, w + 0.5, h + 0.5, 0.25, mTecho, s.position.x, y, o.z + o.d / 2 + 0.2, { sombra: false });
    if (i % 3 === 0) A.actualizadores.push(tt => { s.material.opacity = 0.7 + 0.3 * Math.sin(tt * 7 + i) * Math.sin(tt * 2.3 + i * 3); });
  });

  /* holograma gigante (shader animado) */
  const holo = new THREE.Mesh(new THREE.PlaneGeometry(16, 26), new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `varying vec2 vUv; uniform float uT;
      void main(){ vec2 p = vUv - 0.5; float r = length(p * vec2(1.0, 0.62));
        float ring = smoothstep(0.04, 0.0, abs(r - 0.28 - 0.03 * sin(uT * 2.0))) + smoothstep(0.03, 0.0, abs(r - 0.4));
        float scan = 0.55 + 0.45 * sin(vUv.y * 160.0 - uT * 9.0);
        float glitch = step(0.985, fract(sin(floor(uT * 6.0) * 91.7 + floor(vUv.y * 40.0)) * 437.5));
        float core = smoothstep(0.22, 0.0, r) * (0.6 + 0.4 * sin(uT * 3.0));
        vec3 c = mix(vec3(0.1, 0.9, 1.0), vec3(1.0, 0.15, 0.6), vUv.y + 0.3 * sin(uT * 0.7));
        float a = (ring + core) * scan * (1.0 + glitch) * smoothstep(0.5, 0.3, abs(p.x)) * smoothstep(0.5, 0.35, abs(p.y));
        gl_FragColor = vec4(c * a * 2.2, a); }`
  }));
  holo.position.set(30, 24, -58); holo.rotation.y = -0.35; esc.add(holo); A.actualizadores.push(tt => { holo.material.uniforms.uT.value = tt; });
  const holo2 = holo.clone(); holo2.material = holo.material.clone(); holo2.position.set(-34, 30, -78); holo2.rotation.y = 0.4; holo2.scale.set(1.3, 1.3, 1); esc.add(holo2); A.actualizadores.push(tt => { holo2.material.uniforms.uT.value = tt + 3.7; });

  /* tráfico aéreo: lucecitas que cruzan a distintas alturas y distancias */
  const coches = [];
  for (let i = 0; i < 34; i++) {
    const g = new THREE.Group(), col = ["#ff2030", "#ffffff", "#20e0ff", "#ffb030"][i % 4], sz = 0.6 + R() * 0.7;
    const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(sz * 1.8, sz * 0.32, sz * 0.7), new THREE.MeshBasicMaterial({ color: "#0a0a10" }));
    const faro = new THREE.Mesh(new THREE.BoxGeometry(sz * 0.18, sz * 0.14, sz * 0.5), brillo(col, 4.5));
    faro.position.x = sz * 0.9; g.add(cuerpo, faro);
    const estela = new THREE.Mesh(new THREE.PlaneGeometry(sz * 9, sz * 0.12), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2.2), transparent: true, opacity: 0.35, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
    estela.position.x = -sz * 4.8; g.add(estela);
    const dir = R() < 0.5 ? 1 : -1; g.scale.x = dir; g.position.set((R() * 2 - 1) * 120, 6 + R() * 42, -16 - R() * 90); esc.add(g);
    coches.push({ g, v: (5 + R() * 11) * dir });
  }
  A.actualizadores.push((tt, dt) => { for (const c of coches) { c.g.position.x += c.v * dt; if (c.g.position.x > 130) c.g.position.x = -130; if (c.g.position.x < -130) c.g.position.x = 130; } });

  /* utilería de la azotea */
  const mGris = std({ color: "#20232c", roughness: 0.55, metalness: 0.6 });
  for (const [x, z, s] of [[-13.5, -3.6, 1], [-17.5, -3.9, 0.8], [15, -3.5, 1.1]]) {
    caja(esc, 2.8 * s, 1.5 * s, 1.7 * s, mGris, x, 0.75 * s, z);
    caja(esc, 2.2 * s, 0.06, 0.06, brillo("#20e0ff", 3), x, 1.3 * s, z + 0.87 * s, { sombra: false });
    const ven = new THREE.Mesh(new THREE.CylinderGeometry(0.55 * s, 0.55 * s, 0.1, 18), std({ color: "#0c0e14", roughness: 0.5, metalness: 0.8 })); ven.position.set(x - 0.6 * s, 1.55 * s, z); esc.add(ven);
  }
  const tanque = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.8, 20), std({ color: "#2a2f3c", roughness: 0.5, metalness: 0.6 })); tanque.position.set(20, 1.4, -3.4); tanque.castShadow = true; esc.add(tanque);
  caja(esc, 3.2, 0.1, 3.2, mGris, 20, 0.05, -3.4);
  const antena = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.5, 20, 1, true), std({ color: "#9aa4b8", roughness: 0.4, metalness: 0.9, side: THREE.DoubleSide })); antena.position.set(-24, 2.2, -3.6); antena.rotation.set(-0.5, 0.6, 0); esc.add(antena);
  caja(esc, 0.1, 2.2, 0.1, mGris, -24, 1.1, -3.6);
  for (const [x, col] of [[-7.2, "#20e0ff"], [7.2, "#ff2a9a"]]) {                          // tubos de neón verticales: las dos luces de la arena
    const tubo = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.6, 10), brillo(col, 3.4)); tubo.position.set(x, 2.5, -4.9); esc.add(tubo);
    caja(esc, 0.5, 0.3, 0.5, mGris, x, 0.55, -4.9); caja(esc, 0.5, 0.3, 0.5, mGris, x, 4.4, -4.9);
  }

  /* clima: llovizna con brillo de neón y bruma de vapor */
  const punto = T.texturaPunto();
  const lluvia = crearParticulas({ n: 1500, centro: [0, 0, 0], caja: [18, 9, 10], color: "#8ab8ff", intensidad: 1.4, tam: 0.045, subida: -12, deriva: 0.15, mapa: punto, semilla: 31 });
  lluvia.position.z = 1; esc.add(lluvia); A.animados.push(lluvia);
  const vapor = crearParticulas({ n: 60, centro: [0, 0.1, 0], caja: [14, 1.8, 4], color: "#6a4a9a", intensidad: 0.45, tam: 2.2, subida: 0.08, deriva: 0.6, mapa: punto, semilla: 6, aditivo: true });
  vapor.position.set(0, 0, -2); esc.add(vapor); A.animados.push(vapor);

  ponerLuces(A, { color: "#40d8ff", pos: [[-7.2, 2.4, -3.4], [7.2, 2.4, -3.4]], colores: ["#20e0ff", "#ff2a9a"] });
}

/* ================================================================== 3 · MAZMORRA MEDIEVAL */

function texLadrillo(semilla, oscuro, claro, rep) {
  const S = 512, R = T.rng(semilla), [alt, a] = T.lienzo(S);
  a.fillStyle = "rgb(30,30,30)"; a.fillRect(0, 0, S, S);
  const filas = 16, hf = S / filas, n = T.fbm(S, semilla, 5, 6);
  for (let f = 0; f < filas; f++) {
    let x = -(R() * 90);
    while (x < S) {
      const w = 60 + R() * 60, v = 150 + R() * 90 | 0;
      a.fillStyle = `rgb(${v},${v},${v})`; a.beginPath(); a.roundRect(x + 2.5, f * hf + 2.5, w - 5, hf - 5, 5); a.fill();
      if (R() < 0.3) { a.strokeStyle = "rgba(0,0,0,.6)"; a.lineWidth = 1.5; a.beginPath(); a.moveTo(x + 6 + R() * (w - 12), f * hf + 4); a.lineTo(x + 6 + R() * (w - 12), f * hf + hf - 4); a.stroke(); }
      x += w;
    }
  }
  for (let i = 0; i < 1400; i++) { const v = R() * 255; a.fillStyle = `rgba(${v},${v},${v},.08)`; a.fillRect(R() * S, R() * S, 2 + R() * 6, 2 + R() * 6); }
  const r = conRelieve(alt, oscuro, claro, semilla, 3.5, 0.28);
  return { map: tex(r.albedo, { color: true, rep }), normalMap: tex(r.normal, { rep }) };
}

function texMadera(semilla = 3) {
  const W = 256, H = 256, R = T.rng(semilla), [cv, c] = T.lienzo(W, H);
  for (let i = 0; i < 6; i++) {
    const v = 60 + R() * 28 | 0; c.fillStyle = `rgb(${v + 20},${v * 0.66 | 0},${v * 0.4 | 0})`; c.fillRect(i * W / 6, 0, W / 6 - 2, H);
    c.strokeStyle = "rgba(20,10,4,.45)"; for (let k = 0; k < 14; k++) { c.lineWidth = 0.8; c.beginPath(); const x = i * W / 6 + R() * (W / 6); c.moveTo(x, 0); c.bezierCurveTo(x + 6, H / 3, x - 6, H * 2 / 3, x + 2, H); c.stroke(); }
  }
  c.fillStyle = "rgba(0,0,0,.6)"; for (let i = 1; i < 6; i++) c.fillRect(i * W / 6 - 2, 0, 2, H);
  return tex(cv, { color: true });
}

export function construirMazmorra(A) {
  const esc = A.escena, R = T.rng(31), t = A.tema;
  const bl = (rep) => texLadrillo(33, [24, 24, 28], [122, 118, 112], rep);
  const ladrilloFondo = bl([9, 2.2]), ladrilloLado = bl([6, 2.2]), ladrilloPiso = texLadrillo(35, [18, 18, 22], [92, 90, 88], [7, 4]);
  const mMuro = std({ map: ladrilloFondo.map, normalMap: ladrilloFondo.normalMap, roughness: 0.95, normalScale: new THREE.Vector2(1.5, 1.5) });
  const mLado = std({ map: ladrilloLado.map, normalMap: ladrilloLado.normalMap, roughness: 0.95, normalScale: new THREE.Vector2(1.5, 1.5) });
  const mPiso = std({ map: ladrilloPiso.map, normalMap: ladrilloPiso.normalMap, roughness: 0.82, normalScale: new THREE.Vector2(1.3, 1.3) });
  const mPiedra = std({ color: "#5a5852", roughness: 0.95 });
  const mHierro = std({ color: "#1c1c20", roughness: 0.55, metalness: 0.85 }), mMadera = std({ map: texMadera(4), roughness: 0.9 });

  /* sala: piso, muro del fondo, muros laterales y bóveda */
  const piso = new THREE.Mesh(new THREE.BoxGeometry(30, 1.2, 19), [mPiedra, mPiedra, mPiso, mPiedra, mPiedra, mPiedra]); piso.position.set(0, -0.6, 3.4); piso.receiveShadow = true; esc.add(piso);
  const ALTO = 6.4;
  caja(esc, 30, ALTO, 0.8, mMuro, 0, ALTO / 2, -6.0, { sombra: false });
  for (const s of [-1, 1]) caja(esc, 0.8, ALTO, 19, mLado, s * 14.6, ALTO / 2, 3.4, { sombra: false });
  caja(esc, 30, 0.6, 19, std({ color: "#1c1a18", roughness: 1 }), 0, ALTO + 0.3, 3.4, { sombra: false });
  for (let z = -4.6; z < 12; z += 4.4) caja(esc, 30, 0.55, 0.55, mMadera, 0, ALTO - 0.28, z, { sombra: false });          // vigas de la bóveda
  for (const x of [-12, -6, 6, 12]) caja(esc, 0.7, ALTO, 0.7, mPiedra, x, ALTO / 2, -5.4);                                // pilastras del fondo
  for (const x of [-12, -6, 6, 12]) caja(esc, 1.1, 0.3, 1.1, mPiedra, x, 0.15, -5.4);

  /* celdas con barrotes (a los costados) y la gran puerta del centro */
  const barra = new THREE.CylinderGeometry(0.045, 0.045, 3.4, 8);
  const celda = x => {
    caja(esc, 5.2, 3.7, 0.1, std({ color: "#020202", roughness: 1 }), x, 2.0, -5.5, { sombra: false });                   // el fondo oscuro
    caja(esc, 5.6, 0.4, 0.9, mPiedra, x, 3.95, -5.35); caja(esc, 0.4, 3.8, 0.9, mPiedra, x - 2.7, 1.95, -5.35); caja(esc, 0.4, 3.8, 0.9, mPiedra, x + 2.7, 1.95, -5.35);
    const inst = new THREE.InstancedMesh(barra, mHierro, 17), m = new THREE.Matrix4();
    for (let i = 0; i < 17; i++) { m.makeTranslation(x - 2.45 + i * 0.306, 2.0, -5.0); inst.setMatrixAt(i, m); }
    inst.castShadow = true; esc.add(inst); caja(esc, 5.1, 0.09, 0.09, mHierro, x, 1.2, -5.0); caja(esc, 5.1, 0.09, 0.09, mHierro, x, 2.9, -5.0);
    for (let k = 0; k < 6; k++) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), std({ color: "#d8cfb8", roughness: 0.8 })); c.scale.set(1, 1.05, 1); c.position.set(x - 1.5 + R() * 3, 0.1, -5.15 + R() * 0.3); esc.add(c); }
  };
  celda(-9.0); celda(9.0);
  const puerta = new THREE.Group(); puerta.position.set(0, 0, -5.5);
  const hoja = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.9, 0.22), mMadera); hoja.position.y = 1.95; hoja.castShadow = true;
  const arco = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.22, 24, 1, false, 0, Math.PI), mMadera); arco.rotation.x = Math.PI / 2; arco.rotation.z = Math.PI / 2; arco.rotation.y = 0; arco.position.y = 3.9;
  puerta.add(hoja, arco);
  for (const y of [0.9, 2.1, 3.3]) { const b = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.14, 0.26), mHierro); b.position.y = y; puerta.add(b); }
  const aro = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 20), mHierro); aro.position.set(0.5, 1.6, 0.16); puerta.add(aro);
  esc.add(puerta);
  caja(esc, 4.2, 0.35, 0.9, mPiedra, 0, 4.2, -5.35); caja(esc, 0.45, 4.2, 0.9, mPiedra, -2.0, 2.1, -5.35); caja(esc, 0.45, 4.2, 0.9, mPiedra, 2.0, 2.1, -5.35);

  /* antorchas: las dos del centro llevan la luz de la arena; las de las esquinas son sólo llama */
  const antorcha = (x, y, z, conLuz) => {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.9, 8), mMadera); palo.rotation.z = x < 0 ? -0.35 : 0.35; palo.position.set(x < 0 ? 0.15 : -0.15, -0.1, 0.2); g.add(palo);
    const copa = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.09, 0.2, 10), mHierro); copa.position.set(x < 0 ? 0.3 : -0.3, 0.32, 0.2); g.add(copa);
    const brazo = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), mHierro); brazo.position.set(0, -0.35, 0.05); g.add(brazo);
    for (let k = 0; k < 2; k++) { const l = crearLlama(1.05 + k * 0.25, 0.7 - k * 0.14); l.position.set(x < 0 ? 0.3 : -0.3, 0.42, 0.2); g.add(l); A.llamas.push({ llama: l }); }
    esc.add(g);
  };
  for (const x of [-4.2, 4.2, -12.8, 12.8]) antorcha(x, 3.0, -5.4);
  antorcha(-14.2, 2.8, 0.5); antorcha(14.2, 2.8, 0.5);

  /* cadenas colgando del techo (se mecen apenas) y grilletes en el muro */
  const eslabon = new THREE.TorusGeometry(0.06, 0.016, 6, 12);
  const cadenas = [];
  for (const [x, z, n] of [[-3.0, -3.2, 22], [3.4, -3.6, 18], [-11.5, -1.0, 20], [11.2, -0.6, 24], [0.6, -4.4, 12]]) {
    const g = new THREE.Group(); g.position.set(x, ALTO - 0.05, z);
    for (let i = 0; i < n; i++) { const e = new THREE.Mesh(eslabon, mHierro); e.position.y = -i * 0.105; e.rotation.y = (i % 2) * Math.PI / 2; g.add(e); }
    const grillete = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 8, 16), mHierro); grillete.position.y = -n * 0.105 - 0.1; g.add(grillete);
    esc.add(g); cadenas.push({ g, f: R() * 6 });
  }
  A.actualizadores.push(tt => { for (const c of cadenas) c.g.rotation.z = Math.sin(tt * 0.7 + c.f) * 0.035; });
  for (const x of [-2.6, 2.6]) for (const y of [1.0, 2.2]) { const a = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.028, 8, 16), mHierro); a.position.set(x, y, -5.55); esc.add(a); }

  /* mobiliario: barriles, cajas, mesa, estante de armas, calaveras */
  const mBarril = std({ map: texMadera(9), roughness: 0.85 });
  const barril = (x, z, s = 1) => { const g = new THREE.Group(); g.position.set(x, 0, z);
    const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.42 * s, 0.42 * s, 1.0 * s, 14), mBarril); cuerpo.scale.set(1, 1, 1); cuerpo.position.y = 0.5 * s; cuerpo.castShadow = true; g.add(cuerpo);
    for (const y of [0.18, 0.82]) { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.435 * s, 0.435 * s, 0.07 * s, 14), mHierro); a.position.y = y * s; g.add(a); }
    esc.add(g); };
  barril(-10.4, -3.6); barril(-11.5, -2.8, 0.9); barril(-11.0, -4.4, 1.05); barril(12.2, -4.1);
  caja(esc, 1.0, 0.9, 1.0, mMadera, 10.6, 0.45, -4.4, { ry: 0.3 }); caja(esc, 0.8, 0.7, 0.8, mMadera, 11.0, 1.25, -4.3, { ry: -0.2 });
  const mesa = new THREE.Group(); mesa.position.set(-8, 0, 0.2);
  const tapa = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 1.1), mMadera); tapa.position.y = 0.95; tapa.castShadow = true; mesa.add(tapa);
  for (const [dx, dz] of [[-1, -0.4], [1, -0.4], [-1, 0.4], [1, 0.4]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.95, 0.12), mMadera); p.position.set(dx, 0.47, dz); mesa.add(p); }
  const vela = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 8), std({ color: "#e8dcc0", roughness: 0.9 })); vela.position.set(0.5, 1.12, 0); mesa.add(vela);
  const llamaVela = crearLlama(0.28, 0.16); llamaVela.position.set(0.5, 1.23, 0); mesa.add(llamaVela); A.llamas.push({ llama: llamaVela });
  esc.add(mesa);
  const estante = new THREE.Group(); estante.position.set(12.4, 0, -1.6); estante.rotation.y = -0.3;
  caja(estante, 0.12, 2.2, 0.3, mMadera, -1.4, 1.1, 0); caja(estante, 0.12, 2.2, 0.3, mMadera, 1.4, 1.1, 0); caja(estante, 3.0, 0.1, 0.3, mMadera, 0, 0.9, 0); caja(estante, 3.0, 0.1, 0.3, mMadera, 0, 1.7, 0);
  for (let i = 0; i < 5; i++) { const esp = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.35, 0.03), std({ color: "#aab2be", roughness: 0.25, metalness: 0.95 })); esp.position.set(-1.1 + i * 0.5, 1.6, 0.05); esp.rotation.z = (R() - 0.5) * 0.25; estante.add(esp); const emp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.05), mHierro); emp.position.set(esp.position.x, 0.95, 0.05); estante.add(emp); }
  esc.add(estante);
  const mHueso = std({ color: "#d8cfb8", roughness: 0.8 });
  const calavera = (x, y, z, ry) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
    const cr = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), mHueso); cr.scale.set(1, 1.08, 1.05); const mand = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.09), mHueso); mand.position.set(0, -0.11, 0.03);
    for (const dx of [-0.045, 0.045]) { const oj = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), new THREE.MeshBasicMaterial({ color: "#050403" })); oj.position.set(dx, 0.01, 0.09); g.add(oj); }
    g.add(cr, mand); esc.add(g); };
  for (let i = 0; i < 12; i++) calavera(12.6 + (R() - 0.5) * 1.6, 0.11 + (i > 6 ? 0.2 : 0), -4.8 + R() * 1.4, R() * 6);
  for (let i = 0; i < 5; i++) calavera(-13 + R() * 1.2, 0.11, -3.4 + R() * 2.2, R() * 6);
  for (let i = 0; i < 24; i++) { const x = (R() * 2 - 1) * 13, z = -4.8 + R() * 10; if (Math.abs(x) < 6.5 && z > -3) continue; const h = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.25 + R() * 0.3, 5), mHueso); h.position.set(x, 0.03, z); h.rotation.set(Math.PI / 2, 0, R() * 3); esc.add(h); }

  /* paja y charcos */
  const paja = std({ color: "#7a6438", roughness: 1 });
  for (let i = 0; i < 18; i++) { const x = (R() * 2 - 1) * 13, z = -4.5 + R() * 9; if (Math.abs(x) < 6 && z > -3.6) continue; const p = new THREE.Mesh(new THREE.BoxGeometry(0.5 + R() * 0.7, 0.03 + R() * 0.05, 0.35 + R() * 0.5), paja); p.position.set(x, 0.03, z); p.rotation.y = R() * 3; p.receiveShadow = true; esc.add(p); }
  const charcoMat = std({ color: "#3a3c40", roughness: 0.12, metalness: 0.25, envMapIntensity: 1.2, transparent: true, opacity: 0.55 });
  for (const [x, z, r] of [[-7.4, 1.6, 1.0], [8.2, 2.4, 0.9], [-1.8, 6.5, 0.7], [3.2, 5.6, 0.6]]) { const c = new THREE.Mesh(new THREE.CircleGeometry(r, 24), charcoMat); c.rotation.x = -Math.PI / 2; c.position.set(x, 0.008, z); c.scale.set(1.5, 1, 1); esc.add(c); }

  /* polvo en el aire y chispas de las antorchas */
  const punto = T.texturaPunto();
  const polvo = crearParticulas({ n: 600, centro: [0, 0.1, 0], caja: [14, 4.6, 8], color: "#d8c0a0", intensidad: 1.3, tam: 0.05, subida: 0, deriva: 0.35, mapa: punto, semilla: 5 });
  polvo.position.z = 0.5; esc.add(polvo); A.animados.push(polvo);
  for (const x of [-4.2, 4.2]) { const c = crearParticulas({ n: 40, centro: [0, 3.2, 0], caja: [0.3, 2.4, 0.3], color: "#ff8a30", intensidad: 5, tam: 0.06, subida: 0.5, deriva: 0.3, mapa: punto, semilla: x + 12 }); c.position.set(x, 0, -5.0); esc.add(c); A.animados.push(c); }

  ponerLuces(A, { color: "#ff8a30", pos: [[-4.2, 3.2, -4.6], [4.2, 3.2, -4.6]] });
}

export const CONSTRUCTORES = { calle: construirCalle, cyber: construirCyber, mazmorra: construirMazmorra };
