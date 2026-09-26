// Texturas procedurales para el modo pelea: sin archivos de imagen, todo sale de canvas + ruido.
// Cada material de piedra trae albedo + normal (derivada de un mapa de alturas) + rugosidad, así
// la luz rasante del atardecer marca relieve real en las tallas de las columnas y en las lajas.

import * as THREE from "three";

export const rng = seed => { let s = seed >>> 0 || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };

/** Ruido de valor fractal que tesela (n×n, valores 0..1). */
export function fbm(n, seed = 1, oct = 5, base = 4, gain = 0.5) {
  const r = rng(seed), out = new Float32Array(n * n);
  let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const f = base << o, g = new Float32Array(f * f);
    for (let i = 0; i < g.length; i++) g[i] = r();
    for (let y = 0; y < n; y++) {
      const v = y / n * f, y0 = Math.floor(v), fy = v - y0, sy = fy * fy * (3 - 2 * fy), ya = (y0 % f) * f, yb = ((y0 + 1) % f) * f;
      for (let x = 0; x < n; x++) {
        const u = x / n * f, x0 = Math.floor(u), fx = u - x0, sx = fx * fx * (3 - 2 * fx), xa = x0 % f, xb = (x0 + 1) % f;
        const a = g[ya + xa], b = g[ya + xb], c = g[yb + xa], d = g[yb + xb];
        out[y * n + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
    tot += amp; amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

export function lienzo(w, h = w) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  return [c, c.getContext("2d", { willReadFrequently: true })];
}

/** Mapa de alturas (canvas en grises) → mapa normal (canvas). Tesela por módulo. */
export function normalDesdeAltura(cvAltura, fuerza = 2) {
  const w = cvAltura.width, h = cvAltura.height;
  const src = cvAltura.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const [cv, ctx] = lienzo(w, h), img = ctx.createImageData(w, h), d = img.data;
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = -(H(x + 1, y) - H(x - 1, y)) * fuerza, ny = (H(x, y + 1) - H(x, y - 1)) * fuerza, nz = 1;
    const l = Math.hypot(nx, ny, nz), i = (y * w + x) * 4;
    d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (nz / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

function aTextura(cv, { color = false, repetir = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(cv);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  if (repetir) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

/** Colorea un mapa de alturas (0..1) entre dos tonos, con variación de tinte por ruido. */
function tenirDesdeAltura(cvAltura, oscuro, claro, ruidoSemilla, variacion = 0.18) {
  const w = cvAltura.width, h = cvAltura.height;
  const src = cvAltura.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const [cv, ctx] = lienzo(w, h), img = ctx.createImageData(w, h), d = img.data;
  const n = fbm(Math.min(w, h), ruidoSemilla, 5, 6), fino = rng(ruidoSemilla + 7);
  const N = Math.min(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, a = src[i] / 255, v = n[(y % N) * N + (x % N)];
    const k = 1 + (v - 0.5) * variacion * 2 + (fino() - 0.5) * 0.09;
    d[i] = (oscuro[0] + (claro[0] - oscuro[0]) * a) * k;
    d[i + 1] = (oscuro[1] + (claro[1] - oscuro[1]) * a) * k;
    d[i + 2] = (oscuro[2] + (claro[2] - oscuro[2]) * a) * k;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/* ------------------------------------------------------------------ laja de piso */

/** Lajas de piedra desgastadas: juntas, grietas, manchas. Cada textura cubre 2×2 lajas. */
export function texturaPiso() {
  const S = 1024, laja = S / 2;
  const [alt, a] = lienzo(S), R = rng(31);
  const ruido = fbm(S, 5, 6, 3);
  const [tmp, t] = lienzo(S);
  // altura: cada laja con leve abombado + ruido; juntas hundidas
  const img = t.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const lx = (x % laja) / laja, ly = (y % laja) / laja;
    const borde = Math.min(lx, 1 - lx, ly, 1 - ly);
    const junta = Math.min(1, borde / 0.012);
    const desgaste = 0.55 + 0.2 * (ruido[y * S + x] - 0.5) + 0.12 * Math.min(1, borde / 0.12);
    const v = Math.max(0, desgaste * junta) * 255;
    const i = (y * S + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  t.putImageData(img, 0, 0);
  a.drawImage(tmp, 0, 0);
  // grietas: quebradas oscuras que también se hunden
  a.lineCap = "round";
  for (let i = 0; i < 16; i++) {
    let x = R() * S, y = R() * S, ang = R() * 6.28;
    a.strokeStyle = `rgba(0,0,0,${0.55 + R() * 0.3})`; a.lineWidth = 1 + R() * 2.2;
    a.beginPath(); a.moveTo(x, y);
    for (let k = 0; k < 14; k++) { ang += (R() - 0.5) * 1.1; x += Math.cos(ang) * (10 + R() * 28); y += Math.sin(ang) * (10 + R() * 28); a.lineTo(x, y); }
    a.stroke();
  }
  const albedo = tenirDesdeAltura(alt, [58, 48, 42], [176, 150, 124], 11, 0.22);
  const c = albedo.getContext("2d");
  // tinte por laja + manchas de tierra/musgo
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    c.fillStyle = `rgba(${R() < 0.5 ? "120,70,40" : "60,70,55"},${0.06 + R() * 0.12})`;
    c.fillRect(i * laja, j * laja, laja, laja);
  }
  for (let i = 0; i < 26; i++) {
    const x = R() * S, y = R() * S, r = 30 + R() * 110, g = c.createRadialGradient(x, y, 0, x, y, r);
    const musgo = R() < 0.35;
    g.addColorStop(0, musgo ? "rgba(52,64,38,0.32)" : "rgba(30,20,14,0.22)"); g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // rugosidad: la piedra más pisada (centro de cada laja) brilla más
  const [rug, rc] = lienzo(S), ri = rc.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const lx = (x % laja) / laja, ly = (y % laja) / laja, cen = 1 - Math.min(1, Math.hypot(lx - 0.5, ly - 0.5) * 2);
    const v = (0.86 - 0.34 * cen * (0.4 + ruido[y * S + x])) * 255, i = (y * S + x) * 4;
    ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = v; ri.data[i + 3] = 255;
  }
  rc.putImageData(ri, 0, 0);
  return { map: aTextura(albedo, { color: true }), normalMap: aTextura(normalDesdeAltura(alt, 3.2)), roughnessMap: aTextura(rug) };
}

/* ------------------------------------------------------------------ columna tallada */

/** Fuste tallado: paneles con medallón de loto, guerrero estilizado y cenefas. UV vertical 0..1 = todo el fuste. */
export function texturaColumna() {
  const W = 512, H = 1024;
  const [alt, a] = lienzo(W, H);
  const R = rng(77);
  a.fillStyle = "#6a6a6a"; a.fillRect(0, 0, W, H);
  const relieve = (fn, tono = "#ffffff", sombra = "#000000") => {     // borde claro arriba-izq, oscuro abajo-der = relieve
    a.save(); a.translate(2, 2); a.fillStyle = sombra; a.strokeStyle = sombra; fn(); a.restore();
    a.fillStyle = tono; a.strokeStyle = tono; fn();
  };
  // marco general
  a.strokeStyle = "#202020"; a.lineWidth = 10; a.strokeRect(22, 22, W - 44, H - 44);
  a.strokeStyle = "#f0f0f0"; a.lineWidth = 4; a.strokeRect(34, 34, W - 68, H - 68);
  // cenefas de dientes arriba y abajo
  for (let y of [56, H - 84]) for (let x = 50; x < W - 60; x += 26) { a.fillStyle = "#fff"; a.fillRect(x, y, 16, 26); a.fillStyle = "#333"; a.fillRect(x + 16, y, 4, 26); }
  // medallón de loto (arriba)
  const lotus = (cx, cy, r) => {
    relieve(() => { a.beginPath(); a.arc(cx, cy, r, 0, 6.283); a.fill(); }, "#d8d8d8", "#111");
    a.fillStyle = "#444"; a.beginPath(); a.arc(cx, cy, r * 0.78, 0, 6.283); a.fill();
    for (let k = 0; k < 12; k++) {
      const an = k / 12 * 6.283; a.save(); a.translate(cx, cy); a.rotate(an);
      a.fillStyle = "#f4f4f4"; a.beginPath(); a.ellipse(0, -r * 0.5, r * 0.15, r * 0.3, 0, 0, 6.283); a.fill();
      a.fillStyle = "#222"; a.beginPath(); a.ellipse(1.5, -r * 0.5, r * 0.06, r * 0.2, 0, 0, 6.283); a.fill(); a.restore();
    }
    a.fillStyle = "#fff"; a.beginPath(); a.arc(cx, cy, r * 0.22, 0, 6.283); a.fill();
  };
  lotus(W / 2, 210, 120);
  // nichos con figura (guerrero/dama) — silueta simplificada pero legible con luz rasante
  const figura = (cx, y0, alto, ancho, seed) => {
    a.fillStyle = "#1c1c1c"; a.fillRect(cx - ancho / 2 - 6, y0 - 6, ancho + 12, alto + 12);
    a.fillStyle = "#585858"; a.fillRect(cx - ancho / 2, y0, ancho, alto);
    // arco superior
    a.strokeStyle = "#eee"; a.lineWidth = 5; a.beginPath(); a.arc(cx, y0 + 30, ancho / 2 - 8, Math.PI, 0); a.stroke();
    const k = alto / 300, base = y0 + alto - 14;
    relieve(() => {
      a.beginPath(); a.arc(cx, base - 232 * k, 24 * k, 0, 6.283); a.fill();                            // cabeza
      a.beginPath(); a.moveTo(cx - 20 * k, base - 250 * k); a.lineTo(cx, base - 292 * k); a.lineTo(cx + 20 * k, base - 250 * k); a.fill();  // corona
      a.beginPath(); a.moveTo(cx - 34 * k, base - 206 * k); a.lineTo(cx + 34 * k, base - 206 * k); a.lineTo(cx + 26 * k, base - 108 * k); a.lineTo(cx - 26 * k, base - 108 * k); a.fill(); // torso
      a.lineWidth = 12 * k; a.lineCap = "round";
      a.beginPath(); a.moveTo(cx - 32 * k, base - 196 * k); a.lineTo(cx - 62 * k, base - 150 * k + (seed ? -30 * k : 0)); a.lineTo(cx - 48 * k, base - 112 * k); a.stroke();  // brazos
      a.beginPath(); a.moveTo(cx + 32 * k, base - 196 * k); a.lineTo(cx + 64 * k, base - 160 * k); a.lineTo(cx + 54 * k, base - 210 * k - (seed ? 40 * k : 0)); a.stroke();
      a.beginPath(); a.moveTo(cx - 18 * k, base - 108 * k); a.lineTo(cx - 34 * k, base - 8 * k); a.lineTo(cx - 8 * k, base - 8 * k); a.lineTo(cx, base - 108 * k); a.fill();   // piernas
      a.beginPath(); a.moveTo(cx + 18 * k, base - 108 * k); a.lineTo(cx + 40 * k, base - 8 * k); a.lineTo(cx + 12 * k, base - 8 * k); a.lineTo(cx, base - 108 * k); a.fill();
    }, "#f2f2f2", "#000");
  };
  figura(W / 2, 372, 300, 300, 0);
  figura(W / 2, 700, 300, 300, 1);
  // banda de rombos + guirnalda entre paneles
  for (let x = 46; x < W - 46; x += 36) relieve(() => { a.beginPath(); a.moveTo(x, 672); a.lineTo(x + 14, 686); a.lineTo(x, 700); a.lineTo(x - 14, 686); a.fill(); }, "#ddd", "#111");
  // desgaste: manchas que borran relieve, y erosión
  const ruido = fbm(512, 9, 5, 4), im = a.getImageData(0, 0, W, H), d = im.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, n = ruido[(y % 512) * 512 + (x % 512)];
    const v = d[i] * (0.8 + n * 0.35) - Math.max(0, n - 0.7) * 160;
    d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, v));
  }
  a.putImageData(im, 0, 0);
  const albedo = tenirDesdeAltura(alt, [70, 52, 42], [200, 162, 122], 21, 0.2);
  // hollín/humedad en la base y el techo del fuste
  const c = albedo.getContext("2d"), g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(20,12,8,0.35)"); g.addColorStop(0.18, "rgba(0,0,0,0)"); g.addColorStop(0.85, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(25,20,12,0.5)");
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  return { map: aTextura(albedo, { color: true }), normalMap: aTextura(normalDesdeAltura(alt, 4.5)) };
}

/** Piedra lisa y áspera, sin dibujo: bases, capiteles, vigas, muro. */
export function texturaPiedra(semilla = 3, claro = [186, 150, 112], oscuro = [72, 56, 46]) {
  const S = 512, ruido = fbm(S, semilla, 6, 3), R = rng(semilla);
  const [alt, a] = lienzo(S), im = a.createImageData(S, S);
  for (let i = 0; i < S * S; i++) { const v = (0.35 + ruido[i] * 0.6) * 255; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
  a.putImageData(im, 0, 0);
  a.lineCap = "round";
  for (let i = 0; i < 7; i++) {
    let x = R() * S, y = R() * S, ang = R() * 6.28; a.strokeStyle = "rgba(0,0,0,.6)"; a.lineWidth = 1.3; a.beginPath(); a.moveTo(x, y);
    for (let k = 0; k < 10; k++) { ang += (R() - 0.5); x += Math.cos(ang) * 22; y += Math.sin(ang) * 22; a.lineTo(x, y); } a.stroke();
  }
  return { map: aTextura(tenirDesdeAltura(alt, oscuro, claro, semilla + 3, 0.25), { color: true }), normalMap: aTextura(normalDesdeAltura(alt, 2.4)) };
}

/** Arena/tierra pedregosa para el suelo exterior. */
export function texturaTierra() {
  const S = 512, r = fbm(S, 41, 6, 3), fino = fbm(S, 43, 4, 32, 0.6), R = rng(5);
  const [cv, c] = lienzo(S), im = c.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = r[i] * 0.7 + fino[i] * 0.3;
    im.data[i * 4] = 120 + v * 110; im.data[i * 4 + 1] = 86 + v * 78; im.data[i * 4 + 2] = 58 + v * 52; im.data[i * 4 + 3] = 255;
  }
  c.putImageData(im, 0, 0);
  for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(${40 + R() * 60},${30 + R() * 40},${24 + R() * 30},.5)`; c.beginPath(); c.ellipse(R() * S, R() * S, 1 + R() * 4, 1 + R() * 3, R() * 3, 0, 6.28); c.fill(); }
  return aTextura(cv, { color: true });
}

/* ------------------------------------------------------------------ sprites */

/** Punto suave (halo/chispa/polvo). */
export function texturaPunto(dureza = 0.0) {
  const [cv, c] = lienzo(64), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(Math.max(0.05, dureza), "rgba(255,255,255,0.8)");
  g.addColorStop(0.55, "rgba(255,255,255,0.18)"); g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  return aTextura(cv, { color: true, repetir: false });
}

/** Hoja ovada con nervadura (hojas secas del piso y hojas que vuelan). */
export function texturaHoja() {
  const [cv, c] = lienzo(128);
  c.translate(64, 64);
  c.fillStyle = "#fff"; c.beginPath(); c.moveTo(0, -58);
  c.bezierCurveTo(38, -34, 34, 30, 0, 56); c.bezierCurveTo(-34, 30, -38, -34, 0, -58); c.fill();
  c.strokeStyle = "rgba(0,0,0,.45)"; c.lineWidth = 2.5; c.beginPath(); c.moveTo(0, -50); c.lineTo(0, 62); c.stroke();
  c.lineWidth = 1.5; for (let i = -3; i < 4; i++) { c.beginPath(); c.moveTo(0, i * 14); c.lineTo(22, i * 14 - 12); c.moveTo(0, i * 14); c.lineTo(-22, i * 14 - 12); c.stroke(); }
  return aTextura(cv, { color: true, repetir: false });
}

/** Hoja de arce con alfa (follaje instanciado de los árboles rojos). */
export function texturaArce() {
  const [cv, c] = lienzo(128);
  c.translate(64, 68);
  c.fillStyle = "#fff"; c.lineJoin = "round"; c.beginPath();
  // 5 lóbulos anchos con puntas serradas: se lee como hoja de arce a distancia sin verse estrella
  const lobulos = [[0, 58], [1.25, 50], [-1.25, 50], [2.35, 34], [-2.35, 34]];
  for (const [a, r] of lobulos) { const x = Math.sin(a) * r, y = -Math.cos(a) * r; c.moveTo(0, 6); c.quadraticCurveTo(x * 0.55 + 10, y * 0.55, x, y); c.quadraticCurveTo(x * 0.55 - 10, y * 0.55, 0, 6); }
  c.fill(); c.beginPath(); c.arc(0, 0, 24, 0, 6.283); c.fill();
  c.fillRect(-3, 8, 6, 44);
  c.strokeStyle = "rgba(0,0,0,.4)"; c.lineWidth = 2;
  for (const [a, r] of lobulos) { c.beginPath(); c.moveTo(0, 6); c.lineTo(Math.sin(a) * r * 0.85, -Math.cos(a) * r * 0.85); c.stroke(); }
  return aTextura(cv, { color: true, repetir: false });
}

/** Suelo del jardín: pasto seco, hojas rojas y tierra. */
export function texturaJardin() {
  const S = 1024, r = fbm(S, 61, 6, 4), R = rng(8);
  const [cv, c] = lienzo(S), im = c.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = r[i];
    im.data[i * 4] = 70 + v * 90; im.data[i * 4 + 1] = 52 + v * 62; im.data[i * 4 + 2] = 30 + v * 28; im.data[i * 4 + 3] = 255;
  }
  c.putImageData(im, 0, 0);
  const colores = ["#a5261c", "#c8402a", "#d9622a", "#8a1c16", "#e08a3a", "#5c6b2a", "#7d7a35"];
  for (let i = 0; i < 5200; i++) {
    c.save(); c.translate(R() * S, R() * S); c.rotate(R() * 6.28);
    c.fillStyle = colores[(R() * colores.length) | 0]; c.globalAlpha = 0.55 + R() * 0.45;
    c.beginPath(); c.ellipse(0, 0, 3 + R() * 7, 2 + R() * 5, 0, 0, 6.28); c.fill(); c.restore();
  }
  for (let i = 0; i < 2600; i++) { c.strokeStyle = `rgba(${90 + R() * 60},${100 + R() * 40},${40},${0.3 + R() * 0.4})`; c.lineWidth = 1; const x = R() * S, y = R() * S; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (R() - 0.5) * 8, y - 6 - R() * 10); c.stroke(); }
  return aTextura(cv, { color: true });
}

/** Estandarte: paño oscuro con espiral dorada (dragón). */
export function texturaEstandarte(fondo = "#5c0d10") {
  const [cv, c] = lienzo(256, 768);
  const g = c.createLinearGradient(0, 0, 0, 768); g.addColorStop(0, fondo); g.addColorStop(1, "#1e0405");
  c.fillStyle = g; c.fillRect(0, 0, 256, 768);
  const r = fbm(256, 4, 5, 8); const im = c.getImageData(0, 0, 256, 768);
  for (let y = 0; y < 768; y++) for (let x = 0; x < 256; x++) { const k = 0.82 + r[(y % 256) * 256 + x] * 0.36 + Math.sin(x * 0.5) * 0.04, i = (y * 256 + x) * 4; im.data[i] *= k; im.data[i + 1] *= k; im.data[i + 2] *= k; }
  c.putImageData(im, 0, 0);
  c.strokeStyle = "#c9a04a"; c.lineWidth = 6; c.strokeRect(14, 14, 228, 740);
  c.lineWidth = 2; c.strokeRect(24, 24, 208, 720);
  c.lineWidth = 10; c.lineCap = "round"; c.beginPath();
  for (let t = 0; t < 7; t += 0.05) { const rad = 8 + t * 15, x = 128 + Math.cos(t * 1.3) * rad, y = 300 + Math.sin(t * 1.3) * rad * 1.2; t === 0 ? c.moveTo(x, y) : c.lineTo(x, y); }
  c.stroke();
  c.fillStyle = "#c9a04a"; c.beginPath(); c.moveTo(128, 470); c.lineTo(88, 600); c.lineTo(128, 570); c.lineTo(168, 600); c.closePath(); c.fill();
  return aTextura(cv, { color: true, repetir: false });
}
