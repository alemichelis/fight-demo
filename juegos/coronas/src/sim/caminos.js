// Búsqueda de caminos: A* en grilla de 8 direcciones (sin cortar esquinas), con montículo binario y arreglos
// tipados reutilizados para que pedir decenas de caminos por segundo no genere basura.
// El objetivo es un rectángulo de casillas: «llegar» a una casilla, o quedar al lado de un edificio/árbol/mina.
// Si el objetivo es inalcanzable devuelve el camino a la casilla más cercana que pudo explorar.

const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

export function crearBuscador(N, bloqueado) {
  const total = N * N;
  const g = new Float32Array(total), padre = new Int32Array(total), visto = new Uint32Array(total), cerrado = new Uint32Array(total);
  const heap = new Int32Array(total * 2), f = new Float32Array(total);
  let gen = 0, tam = 0;

  const subir = i => { const n = heap[i]; while (i > 0) { const p = (i - 1) >> 1; if (f[heap[p]] <= f[n]) break; heap[i] = heap[p]; i = p; } heap[i] = n; };
  const bajar = i => {
    const n = heap[i];
    for (;;) {
      let h = i * 2 + 1; if (h >= tam) break;
      if (h + 1 < tam && f[heap[h + 1]] < f[heap[h]]) h++;
      if (f[heap[h]] >= f[n]) break;
      heap[i] = heap[h]; i = h;
    }
    heap[i] = n;
  };

  // rect: { x0, z0, x1, z1 } inclusivo. adyacente=true: vale cualquier casilla libre a distancia 1 (Chebyshev) del rect.
  function buscar(sx, sz, rect, adyacente, maxNodos = 9000) {
    gen++; tam = 0;
    sx = Math.max(0, Math.min(N - 1, sx)); sz = Math.max(0, Math.min(N - 1, sz));
    const esMeta = (x, z) => {
      if (adyacente) {
        const dx = x < rect.x0 ? rect.x0 - x : x > rect.x1 ? x - rect.x1 : 0;
        const dz = z < rect.z0 ? rect.z0 - z : z > rect.z1 ? z - rect.z1 : 0;
        return Math.max(dx, dz) === 1 || (Math.max(dx, dz) === 0 && !bloqueado(x, z));
      }
      return x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1;
    };
    const heur = (x, z) => {
      const dx = x < rect.x0 ? rect.x0 - x : x > rect.x1 ? x - rect.x1 : 0;
      const dz = z < rect.z0 ? rect.z0 - z : z > rect.z1 ? z - rect.z1 : 0;
      return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
    };
    const ini = sz * N + sx;
    g[ini] = 0; f[ini] = heur(sx, sz); padre[ini] = -1; visto[ini] = gen;
    heap[tam++] = ini;
    let mejor = ini, mejorH = f[ini], nodos = 0, meta = -1;
    while (tam > 0) {
      const act = heap[0]; heap[0] = heap[--tam]; if (tam) bajar(0);
      if (cerrado[act] === gen) continue;
      cerrado[act] = gen;
      const x = act % N, z = (act / N) | 0;
      if (esMeta(x, z)) { meta = act; break; }
      const h = heur(x, z); if (h < mejorH) { mejorH = h; mejor = act; }
      if (++nodos > maxNodos) break;
      for (const [dx, dz, c] of DIRS) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        if (bloqueado(nx, nz)) continue;
        if (dx && dz && (bloqueado(x + dx, z) || bloqueado(x, z + dz))) continue;   // no cortar esquinas
        const n = nz * N + nx;
        if (cerrado[n] === gen) continue;
        const ng = g[act] + c;
        if (visto[n] === gen && ng >= g[n]) continue;
        visto[n] = gen; g[n] = ng; padre[n] = act; f[n] = ng + heur(nx, nz) * 1.001;
        heap[tam] = n; subir(tam++);
      }
    }
    let fin = meta >= 0 ? meta : mejor;
    const camino = [];
    for (let n = fin; n !== -1; n = padre[n]) camino.push(n);
    camino.reverse();
    return { celdas: camino, llego: meta >= 0 };
  }

  // ¿se puede ir en línea recta de a a b sin pisar casillas bloqueadas? (para suavizar caminos)
  function lineaLibre(ax, az, bx, bz, radio = 0.3) {
    const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz);
    if (d < 0.01) return true;
    const pasos = Math.ceil(d / 0.25), px = -dz / d * radio, pz = dx / d * radio;
    for (let i = 1; i <= pasos; i++) {
      const t = i / pasos, x = ax + dx * t, z = az + dz * t;
      if (bloqueado(Math.floor(x + px), Math.floor(z + pz)) || bloqueado(Math.floor(x - px), Math.floor(z - pz))) return false;
    }
    return true;
  }

  // Camino listo para seguir: puntos en el centro de las casillas, recortando los que se pueden saltar en línea recta.
  function camino(x, z, rect, adyacente) {
    const { celdas, llego } = buscar(Math.floor(x), Math.floor(z), rect, adyacente);
    const pts = celdas.map(c => ({ x: (c % N) + 0.5, z: ((c / N) | 0) + 0.5 }));
    const suave = [];
    let desde = { x, z }, i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !lineaLibre(desde.x, desde.z, pts[j].x, pts[j].z)) j--;
      suave.push(pts[j]); desde = pts[j]; i = j + 1;
    }
    return { puntos: suave, llego };
  }

  return { buscar, camino, lineaLibre };
}
