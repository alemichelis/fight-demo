// Azar con semilla: la simulación nunca usa Math.random, así dos máquinas con la misma semilla y las mismas
// órdenes calculan exactamente la misma partida (base para el multijugador por lockstep).

export function crearAzar(semilla) {
  let s = semilla >>> 0 || 1;
  const sig = () => {                       // mulberry32
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    sig,
    rango: (a, b) => a + (b - a) * sig(),
    entero: (a, b) => a + Math.floor(sig() * (b - a + 1)),
    elegir: arr => arr[Math.floor(sig() * arr.length)]
  };
}

// Ruido de valor 2D suave (para bosques, alturas y colores del terreno)
export function crearRuido(semilla) {
  const azar = crearAzar(semilla);
  const T = 256, perm = new Uint8Array(T * 2), val = new Float32Array(T);
  for (let i = 0; i < T; i++) { perm[i] = i; val[i] = azar.sig(); }
  for (let i = T - 1; i > 0; i--) { const j = Math.floor(azar.sig() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < T; i++) perm[i + T] = perm[i];
  const v = (x, y) => val[perm[(perm[x & 255] + y) & 511] & 255];
  const suave = t => t * t * (3 - 2 * t);
  const ruido = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
    const u = suave(xf), w = suave(yf);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
  // fractal: varias octavas, resultado aprox. en [0, 1]
  return (x, y, oct = 4) => {
    let suma = 0, amp = 0.5, f = 1, norma = 0;
    for (let o = 0; o < oct; o++) { suma += ruido(x * f, y * f) * amp; norma += amp; amp *= 0.5; f *= 2.03; }
    return suma / norma;
  };
}
