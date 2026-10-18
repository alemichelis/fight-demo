// Terreno, agua, árboles, rocas y pasto. Todo instanciado: miles de objetos en pocas llamadas de dibujo.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ARBOL, ROCA, AGUA } from "../sim/mapa.js";
import { crearAzar, crearRuido } from "../sim/azar.js";
import { conNiebla, conViento, parchar, U } from "./parches.js";

export function crearTerreno(escena, mundo, tx, calidad) {
  const mapa = mundo.mapa, N = mapa.lado;
  const grupo = new THREE.Group(); escena.add(grupo);
  const azar = crearAzar(mapa.semilla + 5), ruido = crearRuido(mapa.semilla + 77);

  /* ---------------------------------------------------------------- suelo */
  const geo = new THREE.PlaneGeometry(N, N, N, N);
  geo.rotateX(-Math.PI / 2); geo.translate(N / 2, 0, N / 2);
  const pos = geo.attributes.position, cant = pos.count;
  const mezcla = new Float32Array(cant * 4);
  // ¿hay de cierto tipo de casilla alrededor del vértice? (para fundir los bordes)
  const cerca = (vx, vz, t, r) => {
    let n = 0, tot = 0;
    for (let z = vz - r; z < vz + r; z++) for (let x = vx - r; x < vx + r; x++) {
      tot++; if (x >= 0 && z >= 0 && x < N && z < N && mapa.tipo[z * N + x] === t) n++;
    }
    return n / tot;
  };
  for (let i = 0; i < cant; i++) {
    const x = pos.getX(i), z = pos.getZ(i), vx = Math.round(x), vz = Math.round(z);
    pos.setY(i, mapa.alturaEn(x, z));
    let tierra = 0;
    for (const b of mapa.bases) tierra = Math.max(tierra, 1 - Math.hypot(x - b.x - 2, z - b.z - 2) / 8);
    for (const m of mapa.minas) tierra = Math.max(tierra, 0.9 - Math.hypot(x - m.x - 1.5, z - m.z - 1.5) / 4.5);
    tierra = Math.max(0, tierra) + Math.max(0, ruido(x * 0.09, z * 0.09) - 0.62) * 2.2;
    const bosque = cerca(vx, vz, ARBOL, 2) * 1.3;
    const roca = Math.min(1, cerca(vx, vz, ROCA, 2) * 2.2);
    const arena = Math.min(1, cerca(vx, vz, AGUA, 2) * 3.5);
    mezcla.set([Math.min(1, tierra), Math.min(1, bosque), roca, arena], i * 4);
  }
  geo.setAttribute("aMezcla", new THREE.BufferAttribute(mezcla, 4));
  geo.computeVertexNormals();
  // las uv sirven de coordenada de mundo para las texturas (una repetición cada ~5,5 casillas)
  const rep = N / 5.5;
  const mapaPasto = tx.pasto.mapa.clone(); mapaPasto.repeat.set(rep, rep);
  const normalPasto = tx.pasto.normal.clone(); normalPasto.repeat.set(rep, rep);
  const matSuelo = new THREE.MeshStandardMaterial({ map: mapaPasto, normalMap: normalPasto, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.94, metalness: 0 });
  parchar(matSuelo, "suelo", sh => {
    Object.assign(sh.uniforms, {
      tTierra: { value: tx.tierra.mapa }, tRoca: { value: tx.roca.mapa }, tArena: { value: tx.arena.mapa },
      nTierra: { value: tx.tierra.normal }, nRoca: { value: tx.roca.normal }, nArena: { value: tx.arena.normal }
    });
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 aMezcla; varying vec4 vMezcla;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvMezcla = aMezcla;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec4 vMezcla;
        uniform sampler2D tTierra, tRoca, tArena, nTierra, nRoca, nArena;
        float ruidoBarato(vec2 p) { return sin(p.x * 1.7 + sin(p.y * 1.3)) * sin(p.y * 1.9 + sin(p.x * 0.7)); }
        vec4 pesos(vec4 m, vec4 alturas) {
          // mezcla por altura: en el borde gana la textura cuyo relieve sobresale (piedritas sobre el pasto, etc.)
          vec4 w = vec4(1.0 - clamp(m.x + m.y * 0.25 + m.z + m.w, 0.0, 1.0), m.x, m.z, m.w);
          w = max(w + alturas * 0.6 - 0.3, 0.0001);
          w = pow(w, vec4(3.0));
          return w / (w.x + w.y + w.z + w.w);
        }`)
      .replace("vec4 sampledDiffuseColor = texture2D( map, vMapUv );", `
        vec2 uvT = vMapUv;
        vec4 cP = mix(texture2D(map, uvT), texture2D(map, uvT * 0.31 + vec2(0.17, 0.41)), 0.45);
        vec4 cT = texture2D(tTierra, uvT * 0.9), cR = texture2D(tRoca, uvT * 0.6), cA = texture2D(tArena, uvT);
        vec4 W = pesos(vMezcla, vec4(cP.g * 0.4, cT.r * 0.6, cR.r * 0.8, cA.r * 0.3));
        vec4 sampledDiffuseColor = cP * W.x + cT * W.y + cR * W.z + cA * W.w;
        sampledDiffuseColor.rgb *= mix(vec3(1.0), vec3(0.62, 0.72, 0.55), clamp(vMezcla.y, 0.0, 1.0) * W.x);   // suelo de bosque
        sampledDiffuseColor.rgb *= 0.9 + 0.12 * ruidoBarato(vMapUv * 0.35);                                    // variación grande
      `)
      .replace("vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;", `
        vec3 mapN = (texture2D(normalMap, vNormalMapUv) * W.x + texture2D(nTierra, vNormalMapUv * 0.9) * W.y
                   + texture2D(nRoca, vNormalMapUv * 0.6) * W.z + texture2D(nArena, vNormalMapUv) * W.w).xyz * 2.0 - 1.0;`);
  });
  conNiebla(matSuelo);
  const suelo = new THREE.Mesh(geo, matSuelo);
  suelo.receiveShadow = true;
  grupo.add(suelo);

  // faldón alrededor del mapa para que el borde no se vea cortado
  const faldon = new THREE.Mesh(new THREE.PlaneGeometry(N * 4, N * 4).rotateX(-Math.PI / 2).translate(N / 2, -0.6, N / 2),
    conNiebla(new THREE.MeshStandardMaterial({ color: "#2e3b22", roughness: 1 })));
  faldon.receiveShadow = true; grupo.add(faldon);

  /* ---------------------------------------------------------------- agua */
  const nAgua = tx.agua.normal.clone(); nAgua.repeat.set(N / 9, N / 9);
  const nAgua2 = tx.agua.normal.clone(); nAgua2.repeat.set(N / 5, N / 5);
  const matAgua = new THREE.MeshPhysicalMaterial({ color: "#1d4b55", roughness: 0.06, metalness: 0, normalMap: nAgua, normalScale: new THREE.Vector2(0.35, 0.35),
    transparent: true, opacity: 0.86, envMapIntensity: 1.2, clearcoat: 0.6, clearcoatRoughness: 0.1, clearcoatNormalMap: nAgua2 });
  conNiebla(matAgua);
  const agua = new THREE.Mesh(new THREE.PlaneGeometry(N, N, 1, 1).rotateX(-Math.PI / 2).translate(N / 2, -0.32, N / 2), matAgua);
  agua.receiveShadow = true; grupo.add(agua);

  /* ---------------------------------------------------------------- árboles */
  // dos especies hechas de geometría simple con colores por vértice; la variedad sale de escala, giro y tono
  const pintar = (g, c) => { const col = new THREE.Color(c), arr = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < arr.length; i += 3) { arr[i] = col.r; arr[i + 1] = col.g; arr[i + 2] = col.b; } g.setAttribute("color", new THREE.BufferAttribute(arr, 3)); return g; };
  const sinIndice = g => g.index ? g.toNonIndexed() : g;
  const deformar = (g, k, sem) => { const p = g.attributes.position, r = crearAzar(sem); for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (1 + (r.sig() - 0.5) * k), p.getY(i) * (1 + (r.sig() - 0.5) * k * 0.6), p.getZ(i) * (1 + (r.sig() - 0.5) * k)); g.computeVertexNormals(); return g; };
  const pino = mergeGeometries([
    pintar(sinIndice(new THREE.CylinderGeometry(0.07, 0.12, 1.0, 6).translate(0, 0.5, 0)), "#4a3220"),
    pintar(sinIndice(deformar(new THREE.ConeGeometry(0.75, 1.3, 8).translate(0, 1.2, 0), 0.15, 1)), "#24452a"),
    pintar(sinIndice(deformar(new THREE.ConeGeometry(0.6, 1.1, 8).translate(0, 1.85, 0), 0.15, 2)), "#2b5231"),
    pintar(sinIndice(deformar(new THREE.ConeGeometry(0.42, 0.95, 7).translate(0, 2.45, 0), 0.15, 3)), "#335e37")
  ]);
  const frondoso = mergeGeometries([
    pintar(sinIndice(new THREE.CylinderGeometry(0.09, 0.15, 1.3, 6).translate(0, 0.65, 0)), "#4f3523"),
    pintar(sinIndice(deformar(new THREE.IcosahedronGeometry(0.72, 1).translate(0, 1.75, 0), 0.25, 4)), "#3f6a2c"),
    pintar(sinIndice(deformar(new THREE.IcosahedronGeometry(0.52, 1).translate(0.42, 1.45, 0.2), 0.25, 5)), "#4a7a33"),
    pintar(sinIndice(deformar(new THREE.IcosahedronGeometry(0.5, 1).translate(-0.38, 1.5, -0.25), 0.25, 6)), "#365f27")
  ]);
  const matArbol = conNiebla(conViento(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, flatShading: true }), 0.07, 2.6));
  const celdasArbol = [];
  for (let i = 0; i < N * N; i++) if (mapa.tipo[i] === ARBOL) celdasArbol.push(i);
  const especies = [pino, frondoso].map(g => { const m = new THREE.InstancedMesh(g, matArbol, celdasArbol.length); m.castShadow = true; m.receiveShadow = true; m.count = 0; grupo.add(m); return m; });
  const arbolDe = new Map();               // casilla → [malla, índice]
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), eje = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  for (const i of celdasArbol) {
    const x = i % N, z = (i / N) | 0;
    const e = ruido(x * 0.13 + 50, z * 0.13) > 0.5 ? 0 : 1, m = especies[e];
    const k = 0.85 + azar.sig() * 0.55, px = x + 0.5 + (azar.sig() - 0.5) * 0.45, pz = z + 0.5 + (azar.sig() - 0.5) * 0.45;
    p.set(px, mapa.alturaEn(px, pz) - 0.05, pz); q.setFromAxisAngle(eje, azar.sig() * Math.PI * 2); s.set(k, k * (0.9 + azar.sig() * 0.3), k);
    m.setMatrixAt(m.count, mtx.compose(p, q, s));
    m.setColorAt(m.count, col.setHSL(0.27 + (azar.sig() - 0.5) * 0.06, 0.35 + azar.sig() * 0.2, 0.42 + azar.sig() * 0.16));
    arbolDe.set(i, [m, m.count]); m.count++;
  }
  for (const m of especies) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); }

  /* ---------------------------------------------------------------- rocas */
  const celdasRoca = [];
  for (let i = 0; i < N * N; i++) if (mapa.tipo[i] === ROCA) celdasRoca.push(i);
  const rp = tx.roca.mapa.clone(); rp.repeat.set(1.5, 1.5);
  const matRoca = conNiebla(new THREE.MeshStandardMaterial({ map: rp, normalMap: tx.roca.normal, roughness: 0.85, flatShading: true }));
  const rocas = new THREE.InstancedMesh(deformar(new THREE.DodecahedronGeometry(0.62, 1), 0.35, 9), matRoca, celdasRoca.length * 2);
  rocas.castShadow = rocas.receiveShadow = true; rocas.count = 0;
  for (const i of celdasRoca) for (let k = 0; k < 2; k++) {
    const x = (i % N) + 0.5 + (azar.sig() - 0.5) * 0.6, z = ((i / N) | 0) + 0.5 + (azar.sig() - 0.5) * 0.6, e = 0.6 + azar.sig() * 0.7;
    p.set(x, mapa.alturaEn(x, z) + e * 0.12, z); q.setFromEuler(new THREE.Euler(azar.sig() * 3, azar.sig() * 6, azar.sig() * 3)); s.set(e, e * (0.55 + azar.sig() * 0.4), e);
    rocas.setMatrixAt(rocas.count++, mtx.compose(p, q, s));
  }
  rocas.instanceMatrix.needsUpdate = true; rocas.computeBoundingSphere(); grupo.add(rocas);

  /* ---------------------------------------------------------------- pasto */
  // matas de hojas finas (3 planos cruzados) en las casillas libres; se apagan donde se construye
  // se arma siempre con la densidad máxima; la configuración decide cuántas matas se dibujan (densidadPasto)
  const densidad = 5;
  let libresCant = 0;
  const pastoDe = new Map();
  let pasto = null;
  if (densidad > 0) {
    const hoja = new THREE.PlaneGeometry(0.06, 0.26, 1, 3).translate(0, 0.13, 0);
    const hp = hoja.attributes.position; for (let i = 0; i < hp.count; i++) { const y = hp.getY(i); hp.setX(i, hp.getX(i) * (1 - y / 0.3)); hp.setZ(i, y * y * 0.5); }
    const hojas = [];
    for (let k = 0; k < 7; k++) { const h = hoja.clone(); h.rotateY(k / 7 * Math.PI * 2 + k); h.translate(Math.cos(k * 2.1) * 0.08, 0, Math.sin(k * 2.1) * 0.08); h.scale(1, 0.7 + (k % 3) * 0.2, 1); hojas.push(h); }
    const mata = mergeGeometries(hojas);
    const colores = new Float32Array(mata.attributes.position.count * 3);
    for (let i = 0; i < mata.attributes.position.count; i++) { const t = Math.min(1, mata.attributes.position.getY(i) / 0.26); colores.set([0.035 + t * 0.09, 0.06 + t * 0.12, 0.015 + t * 0.03], i * 3); }
    mata.setAttribute("color", new THREE.BufferAttribute(colores, 3));
    // normales hacia arriba: las hojas se iluminan como el suelo y no brillan de costado
    const nor = mata.attributes.normal; for (let i = 0; i < nor.count; i++) nor.setXYZ(i, 0, 1, 0);
    const matPasto = conNiebla(conViento(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), 0.06, 0.26));
    const libres = [];
    for (let i = 0; i < N * N; i++) {
      if (mapa.tipo[i] !== 0) continue;
      const x = i % N, z = (i / N) | 0;
      const m = mezcla[(z * (N + 1) + x) * 4];         // nada de pasto sobre la tierra de las bases
      if (m > 0.35) continue;
      libres.push(i);
    }
    const total = Math.floor(libres.length * densidad); libresCant = libres.length;
    pasto = new THREE.InstancedMesh(mata, matPasto, total);
    pasto.receiveShadow = true; pasto.count = 0;
    for (let n = 0; n < total; n++) {
      const i = libres[n % libres.length], x = (i % N) + azar.sig(), z = ((i / N) | 0) + azar.sig(), e = 0.7 + azar.sig() * 0.7;
      p.set(x, mapa.alturaEn(x, z) - 0.02, z); q.setFromAxisAngle(eje, azar.sig() * 6.28); s.set(e, e * (0.7 + azar.sig() * 0.6), e);
      pasto.setMatrixAt(pasto.count, mtx.compose(p, q, s));
      let l = pastoDe.get(i); if (!l) pastoDe.set(i, l = []); l.push(pasto.count++);
    }
    pasto.instanceMatrix.needsUpdate = true; pasto.computeBoundingSphere(); grupo.add(pasto);
  }

  /* ---------------------------------------------------------------- cambios en vivo */
  const cayendo = [];
  const cero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    grupo, suelo,
    // matas por casilla libre (0 = sin pasto). Las primeras «libres» matas cubren una por casilla, y así sucesivamente,
    // así cualquier cantidad queda pareja en todo el mapa.
    densidadPasto(k) {
      if (!pasto) return;
      pasto.visible = k > 0;
      pasto.count = Math.min(pasto.instanceMatrix.count, Math.floor(libresCant * k));
    },
    // un árbol talado: se achica y se hunde en un instante, sin saltos
    talar(x, z) {
      const r = arbolDe.get(z * N + x); if (!r) return;
      arbolDe.delete(z * N + x);
      const m0 = new THREE.Matrix4(); r[0].getMatrixAt(r[1], m0);
      cayendo.push({ malla: r[0], i: r[1], m0, t: 0 });
    },
    // lo que queda bajo un edificio nuevo
    despejar(tx0, tz0, lado) {
      if (!pasto) return;
      for (let z = tz0; z < tz0 + lado; z++) for (let x = tx0; x < tx0 + lado; x++) {
        const l = pastoDe.get(z * N + x); if (!l) continue;
        for (const i of l) pasto.setMatrixAt(i, cero);
      }
      pasto.instanceMatrix.needsUpdate = true;
    },
    actualizar(dt) {
      for (let k = cayendo.length - 1; k >= 0; k--) {
        const c = cayendo[k]; c.t += dt;
        const f = Math.min(1, c.t / 0.9);
        c.m0.decompose(p, q, s);
        const caida = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0.3).normalize(), f * f * 1.4);
        s.multiplyScalar(1 - f * f);
        c.malla.setMatrixAt(c.i, mtx.compose(p, q.multiply(caida), s));
        c.malla.instanceMatrix.needsUpdate = true;
        if (f >= 1) cayendo.splice(k, 1);
      }
    }
  };
}
