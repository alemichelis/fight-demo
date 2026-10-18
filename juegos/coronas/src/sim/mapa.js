// Generación del mapa: simétrico por rotación de 180°, así ninguna base tiene ventaja.
// Devuelve sólo datos (grillas y posiciones); el dibujo lo hace render/terreno.js.

import { crearAzar, crearRuido } from "./azar.js";
import { MADERA_POR_ARBOL } from "../datos.js";

export const LIBRE = 0, ARBOL = 1, EDIFICIO = 2, ROCA = 3, AGUA = 4;

export function generarMapa(lado, semilla) {
  const azar = crearAzar(semilla), ruido = crearRuido(semilla + 11), ruido2 = crearRuido(semilla + 29);
  const N = lado, idx = (x, z) => z * N + x;
  const tipo = new Uint8Array(N * N);          // LIBRE / ARBOL / ROCA / AGUA (los edificios se marcan en la simulación)
  const madera = new Uint16Array(N * N);
  const altura = new Float32Array((N + 1) * (N + 1));   // en los vértices, sólo estética

  // bases: esquinas opuestas; minas del lado de afuera y expansiones en el medio
  const bases = [{ x: 18, z: N - 22 }, { x: N - 22, z: 18 }];
  // la mina propia a ~9 casillas del castillo (cerca, como en los RTS clásicos) y una expansión hacia el centro
  const minas = [{ x: 10, z: N - 17 }, { x: 34, z: N - 40 }];
  const espejo = p => ({ x: N - p.x - (p.lado || 0), z: N - p.z - (p.lado || 0) });

  // ---- bosques por ruido (sólo en la mitad z >= x, la de la base 0; después se espeja)
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (z < x) continue;
    const borde = Math.min(x, z, N - 1 - x, N - 1 - z);
    let f = ruido(x * 0.075, z * 0.075) + (borde < 4 ? 0.35 : borde < 8 ? 0.12 : 0);
    if (f > 0.6) tipo[idx(x, z)] = ARBOL;
    else if (ruido2(x * 0.11 + 40, z * 0.11) > 0.78 && borde > 6) tipo[idx(x, z)] = ROCA;
  }
  // lago central por ruido suave, chico
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (z < x) continue;
    const dx = x - N * 0.5 + 9, dz = z - N * 0.5 - 9;
    const r = Math.hypot(dx, dz) + (ruido2(x * 0.2, z * 0.2) - 0.5) * 5;
    if (r < 5.5) tipo[idx(x, z)] = AGUA;
  }

  // ---- despejar: alrededor de cada base, de cada mina y unos caminos serpenteantes entre bases
  const despejar = (cx, cz, r) => {
    for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let x = Math.floor(cx - r); x <= cx + r; x++)
      if (x >= 0 && z >= 0 && x < N && z < N && (x - cx) ** 2 + (z - cz) ** 2 <= r * r) tipo[idx(x, z)] = LIBRE;
  };
  despejar(bases[0].x + 2, bases[0].z + 2, 13);
  for (const m of minas) despejar(m.x + 1.5, m.z + 1.5, 5.5);
  const camino = (a, b, ancho) => {
    const pasos = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z));
    for (let i = 0; i <= pasos; i++) {
      const t = i / pasos, ondula = Math.sin(t * Math.PI * 2 + semilla) * 6 * Math.sin(t * Math.PI);
      const nx = -(b.z - a.z) / pasos, nz = (b.x - a.x) / pasos;
      despejar(a.x + (b.x - a.x) * t + nx * ondula, a.z + (b.z - a.z) * t + nz * ondula, ancho);
    }
  };
  const centro = { x: N / 2, z: N / 2 };
  camino({ x: bases[0].x + 2, z: bases[0].z + 2 }, centro, 3.2);
  camino({ x: bases[0].x + 6, z: bases[0].z - 4 }, { x: minas[1].x + 1, z: minas[1].z + 1 }, 2.6);
  camino({ x: bases[0].x + 10, z: bases[0].z + 2 }, { x: N * 0.62, z: N * 0.62 }, 2.6);

  // ---- espejar la mitad generada sobre la otra (rotación de 180°)
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (z < x) continue;
    tipo[idx(N - 1 - x, N - 1 - z)] = tipo[idx(x, z)];
  }
  const todasBases = [bases[0], espejo({ ...bases[0], lado: 4 })];
  const todasMinas = [...minas, ...minas.map(m => espejo({ ...m, lado: 3 }))];
  for (let i = 0; i < N * N; i++) if (tipo[i] === ARBOL) madera[i] = MADERA_POR_ARBOL;

  // ---- alturas suaves (estética): colinas leves, planas bajo bases y minas, hundidas en el agua
  for (let z = 0; z <= N; z++) for (let x = 0; x <= N; x++) {
    let h = (ruido(x * 0.035 + 7, z * 0.035 + 3, 3) - 0.5) * 2.2;
    const xs = Math.min(x, N - x), zs = Math.min(z, N - z);
    h += Math.max(0, 6 - Math.min(xs, zs)) * 0.12;                         // el borde del mapa sube un poco
    altura[z * (N + 1) + x] = h;
  }
  const aplanar = (cx, cz, r, nivel) => {
    for (let z = 0; z <= N; z++) for (let x = 0; x <= N; x++) {
      const d = Math.hypot(x - cx, z - cz); if (d > r * 1.6) continue;
      const k = d < r ? 1 : 1 - (d - r) / (r * 0.6);
      const i = z * (N + 1) + x; altura[i] += (nivel - altura[i]) * k * k * (3 - 2 * k);
    }
  };
  for (const b of todasBases) aplanar(b.x + 2, b.z + 2, 12, 0.15);
  for (const m of todasMinas) aplanar(m.x + 1.5, m.z + 1.5, 4, altura[Math.round(m.z) * (N + 1) + Math.round(m.x)]);
  // simetría exacta de alturas
  for (let z = 0; z <= N; z++) for (let x = 0; x <= N; x++) if (z < x) altura[z * (N + 1) + x] = altura[(N - z) * (N + 1) + (N - x)];
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (tipo[idx(x, z)] === AGUA) {
    for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const i = (z + oz) * (N + 1) + x + ox; altura[i] = Math.min(altura[i], -0.9); }
  }

  // altura en cualquier punto (interpolación bilineal de los vértices)
  const alturaEn = (x, z) => {
    x = Math.max(0, Math.min(N - 0.001, x)); z = Math.max(0, Math.min(N - 0.001, z));
    const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, W = N + 1;
    const a = altura[zi * W + xi], b = altura[zi * W + xi + 1], c = altura[(zi + 1) * W + xi], d = altura[(zi + 1) * W + xi + 1];
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  };

  return { lado: N, tipo, madera, altura, alturaEn, bases: todasBases, minas: todasMinas, semilla, azar };
}
