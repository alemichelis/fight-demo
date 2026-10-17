// Texturas procedurales que repiten sin costura (ruido periódico), cada una con su mapa de normales calculado del
// relieve. Se generan una vez al cargar; cuando lleguen texturas pintadas a mano se reemplazan acá.

import * as THREE from "three";

function ruidoPeriodico(semilla) {
  const T = 256, val = new Float32Array(T * T);
  let s = semilla >>> 0 || 1;
  const azar = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < T * T; i++) val[i] = azar();
  const suave = t => t * t * (3 - 2 * t);
  // u, v en [0,1); f entero = cantidad de celdas por lado (así el borde coincide con el borde opuesto)
  const capa = (u, v, f) => {
    const x = u * f, y = v * f, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const x0 = ((xi % f) + f) % f, y0 = ((yi % f) + f) % f, x1 = (x0 + 1) % f, y1 = (y0 + 1) % f;
    const a = val[(y0 & 255) * T + (x0 & 255)], b = val[(y0 & 255) * T + (x1 & 255)], c = val[(y1 & 255) * T + (x0 & 255)], d = val[(y1 & 255) * T + (x1 & 255)];
    const uu = suave(fx), vv = suave(fy);
    return a + (b - a) * uu + (c - a) * vv + (a - b - c + d) * uu * vv;
  };
  return (u, v, f = 4, oct = 4) => {
    let suma = 0, amp = 0.5, norma = 0;
    for (let o = 0; o < oct; o++) { suma += capa(u, v, f) * amp; norma += amp; amp *= 0.5; f *= 2; }
    return suma / norma;
  };
}

// pixel(u, v) → [r, g, b, altura] con colores 0..255 y altura 0..1
function generar(tam, pixel, fuerzaNormal = 2) {
  const col = new Uint8ClampedArray(tam * tam * 4), alt = new Float32Array(tam * tam);
  for (let y = 0; y < tam; y++) for (let x = 0; x < tam; x++) {
    const [r, g, b, h] = pixel(x / tam, y / tam), i = y * tam + x;
    col[i * 4] = r; col[i * 4 + 1] = g; col[i * 4 + 2] = b; col[i * 4 + 3] = 255; alt[i] = h;
  }
  const nor = new Uint8ClampedArray(tam * tam * 4);
  for (let y = 0; y < tam; y++) for (let x = 0; x < tam; x++) {
    const h = (xx, yy) => alt[((yy + tam) % tam) * tam + ((xx + tam) % tam)];
    const dx = (h(x + 1, y) - h(x - 1, y)) * fuerzaNormal, dy = (h(x, y + 1) - h(x, y - 1)) * fuerzaNormal;
    const l = Math.hypot(dx, dy, 1), i = (y * tam + x) * 4;
    nor[i] = (-dx / l * 0.5 + 0.5) * 255; nor[i + 1] = (dy / l * 0.5 + 0.5) * 255; nor[i + 2] = (1 / l * 0.5 + 0.5) * 255; nor[i + 3] = 255;
  }
  const tex = (datos, srgb) => {
    const t = new THREE.DataTexture(datos, tam, tam, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true; return t;
  };
  return { mapa: tex(col, true), normal: tex(nor, false) };
}

const mezclar = (a, b, t) => a + (b - a) * t;
const mix3 = (c1, c2, t) => [mezclar(c1[0], c2[0], t), mezclar(c1[1], c2[1], t), mezclar(c1[2], c2[2], t)];
const clamp01 = t => Math.max(0, Math.min(1, t));

export function crearTexturas(calidad = "alta") {
  const T = calidad === "baja" ? 256 : 512, t2 = calidad === "baja" ? 128 : 256;
  const n1 = ruidoPeriodico(11), n2 = ruidoPeriodico(23), n3 = ruidoPeriodico(37), n4 = ruidoPeriodico(51);
  const tx = {};

  // ---- terreno
  tx.pasto = generar(T, (u, v) => {
    const base = n1(u, v, 6, 5), fino = n2(u, v, 64, 2), hojas = n3(u * 1, v, 96, 2);
    const c = mix3([44, 66, 28], [88, 112, 46], clamp01(base * 1.4 - 0.25));
    const seco = clamp01((n4(u, v, 4, 3) - 0.55) * 4);
    const cc = mix3(c, [124, 116, 62], seco * 0.5);
    const k = 0.82 + fino * 0.3 + (hojas > 0.62 ? 0.12 : 0);
    return [cc[0] * k, cc[1] * k, cc[2] * k, fino * 0.6 + hojas * 0.4];
  }, 3.5);
  tx.tierra = generar(T, (u, v) => {
    const base = n2(u, v, 5, 5), grano = n3(u, v, 80, 2), piedra = n1(u, v, 24, 2);
    let c = mix3([92, 70, 48], [138, 108, 74], base);
    const p = piedra > 0.68 ? (piedra - 0.68) * 3 : 0;
    c = mix3(c, [150, 140, 128], clamp01(p * 2));
    const k = 0.85 + grano * 0.3;
    return [c[0] * k, c[1] * k, c[2] * k, grano * 0.5 + p];
  }, 4);
  tx.roca = generar(T, (u, v) => {
    const base = n3(u, v, 4, 6), grieta = 1 - Math.abs(n1(u, v, 8, 4) - 0.5) * 2, liquen = n4(u, v, 10, 3);
    let c = mix3([92, 92, 96], [150, 148, 144], base);
    if (grieta > 0.9) c = mix3(c, [50, 50, 54], (grieta - 0.9) * 8);
    c = mix3(c, [96, 110, 64], clamp01((liquen - 0.62) * 3) * 0.6);
    return [c[0], c[1], c[2], base * 0.8 - (grieta > 0.9 ? (grieta - 0.9) * 2 : 0)];
  }, 5);
  tx.arena = generar(T, (u, v) => {
    const base = n4(u, v, 6, 4), grano = n2(u, v, 128, 1);
    const c = mix3([176, 156, 118], [206, 188, 146], base), k = 0.9 + grano * 0.18;
    return [c[0] * k, c[1] * k, c[2] * k, grano * 0.4 + base * 0.3];
  }, 2.5);

  // ---- edificios (en escala de grises o tonos neutros: el color final lo pone el material)
  tx.muro = generar(t2, (u, v) => {
    const filas = 8, fila = Math.floor(v * filas), desf = (fila % 2) * 0.5;
    const cols = 4, cu = u * cols + desf, col = Math.floor(cu);
    const fu = cu - col, fv = v * filas - fila;
    const junta = Math.min(fu, 1 - fu) * 4 < 0.12 || Math.min(fv, 1 - fv) * 1 < 0.08;
    const tono = ((col * 73 + fila * 151) % 17) / 17, gr = n1(u, v, 32, 3);
    let c = mix3([128, 122, 112], [176, 168, 154], tono * 0.7 + gr * 0.3);
    if (junta) c = [78, 74, 68];
    const borde = Math.min(Math.min(fu, 1 - fu) * 4, Math.min(fv, 1 - fv));
    return [c[0], c[1], c[2], junta ? 0 : 0.5 + Math.min(0.5, borde * 2) * 0.6 + gr * 0.2];
  }, 6);
  tx.tejas = generar(t2, (u, v) => {
    const filas = 10, fila = Math.floor(v * filas), fv = v * filas - fila, desf = (fila % 2) * 0.5;
    const cu = u * 7 + desf, fu = cu - Math.floor(cu);
    const curva = Math.sin(fu * Math.PI);
    const g = 150 + curva * 60 - fv * 50 + n2(u, v, 32, 2) * 30;
    return [g, g, g, curva * 0.6 + (1 - fv) * 0.4];
  }, 4);
  tx.paja = generar(t2, (u, v) => {
    const vet = n1(u * 1, v, 64, 3), linea = n3(u, v, 8, 2);
    const c = mix3([150, 118, 60], [212, 178, 102], vet), k = 0.75 + linea * 0.4;
    return [c[0] * k, c[1] * k, c[2] * k, vet];
  }, 3);
  tx.madera = generar(t2, (u, v) => {
    const tabla = Math.floor(u * 5), fu = u * 5 - tabla, vet = n2(u * 0.3 + tabla * 0.17, v, 48, 3);
    const c = mix3([96, 64, 38], [146, 102, 62], vet * 0.8 + (tabla % 3) * 0.08);
    const ranura = Math.min(fu, 1 - fu) < 0.04;
    return ranura ? [52, 36, 24, 0] : [c[0], c[1], c[2], 0.6 + vet * 0.4];
  }, 3);
  tx.revoque = generar(t2, (u, v) => {
    const b = n4(u, v, 6, 5), g = 214 + b * 30 - (n1(u, v, 3, 2) > 0.7 ? 30 : 0);
    return [g, g * 0.97, g * 0.9, b];
  }, 1.5);

  // ---- agua: sólo normales (ondas), se desplazan con el tiempo
  tx.agua = generar(T, (u, v) => { const h = n1(u, v, 8, 4) * 0.6 + n2(u, v, 16, 3) * 0.4; return [0, 0, 0, h]; }, 6);
  return tx;
}

// textura con repetición propia (para no compartir offset/repeat entre materiales)
export function copia(t, rx, ry) { const c = t.clone(); c.repeat.set(rx, ry ?? rx); c.needsUpdate = true; return c; }
