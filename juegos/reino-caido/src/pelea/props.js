// Piezas de escenografía procedural compartidas por las escenas: rocas, tubos afilados (dragón, troncos),
// polvo/brasas en partículas, llamas y haces de luz volumétricos falsos.

import * as THREE from "three";
import { rng } from "./tex.js";

/* ------------------------------------------------------------------ ruido 3D */

const hash3 = (x, y, z) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export function ruido3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), L(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
           L(L(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), L(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v), w);
}
export const fbm3 = (x, y, z, o = 4) => { let a = 0.5, s = 0, f = 1; for (let i = 0; i < o; i++) { s += a * ruido3(x * f, y * f, z * f); f *= 2.05; a *= 0.5; } return s; };

/* ------------------------------------------------------------------ rocas */

/** Roca tipo peñasco de granito: esfera deformada, base plana y bandas de color por altura. */
export function crearRoca(semilla = 1, { detalle = 4, tonos = ["#5d4f47", "#8f7360", "#b08a68"], achatada = 0.8 } = {}) {
  const g = new THREE.IcosahedronGeometry(1, detalle), p = g.attributes.position, col = new Float32Array(p.count * 3);
  const R = rng(semilla), o = R() * 100, c = tonos.map(t => new THREE.Color(t)), tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = fbm3(x * 1.2 + o, y * 1.2 + o, z * 1.2 + o, 4), f = fbm3(x * 5 + o, y * 5, z * 5, 2);
    // caras planas: se «cuantiza» un poco la deformación para que parezca fracturada
    const cresta = 1 - Math.abs(fbm3(x * 2.2 + o, y * 2.2, z * 2.2 + o, 3) * 2 - 1);     // fisuras: hunden la roca en líneas
    const r = 0.7 + n * 0.55 + Math.round(f * 3) / 3 * 0.07 - Math.pow(cresta, 6) * 0.1;
    x *= r; y *= r * achatada; z *= r;
    if (y < -0.35) y = -0.35 - (-0.35 - y) * 0.1;
    p.setXYZ(i, x, y, z);
    const k = THREE.MathUtils.clamp((y + 0.4) / 1.3 + (f - 0.5) * 0.4, 0, 1) * 2;
    tmp.copy(k < 1 ? c[0].clone().lerp(c[1], k) : c[1].clone().lerp(c[2], k - 1)).multiplyScalar(0.8 + n * 0.4);
    col.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ tubos afilados (dragón, troncos, serpentinas) */

export function tuboAfilado(curva, segs, radial, radioFn, tapa = true) {
  const fr = curva.computeFrenetFrames(segs, false), pos = [], nor = [], idx = [], uv = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, P = curva.getPointAt(t), N = fr.normals[i], B = fr.binormals[i], r = radioFn(t);
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const dx = N.x * c + B.x * s, dy = N.y * c + B.y * s, dz = N.z * c + B.z * s;
      pos.push(P.x + dx * r, P.y + dy * r, P.z + dz * r); nor.push(dx, dy, dz); uv.push(j / radial, t);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Dragón serpentino de piedra/bronce: cuerpo en S, cresta de espinas, cabeza con cuernos y mandíbula abierta. Mide ~16 de alto. */
export function crearDragon() {
  const grupo = new THREE.Group();
  const puntos = [[-7, 0.2, 1], [-4.5, 1.6, 2.4], [-1, 0.6, 1.2], [2.5, 1.8, -0.6], [3.6, 4.2, 0.4], [1.2, 6.4, 1.2], [-1.6, 8.2, 0.4], [-2, 10.8, -0.4], [0.6, 12.6, 0.2], [2.6, 14.2, 0]]
    .map(p => new THREE.Vector3(...p));
  const curva = new THREE.CatmullRomCurve3(puntos, false, "catmullrom", 0.5);
  const cuerpo = tuboAfilado(curva, 220, 14, t => 0.16 + Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5) * 0.85 * (1 - Math.pow(t, 6) * 0.35) * (t < 0.06 ? t / 0.06 : 1));
  const col = new Float32Array(cuerpo.attributes.position.count * 3), cA = new THREE.Color("#4a3a30"), cB = new THREE.Color("#8a6a4a"), tmp = new THREE.Color();
  for (let i = 0; i < cuerpo.attributes.position.count; i++) {
    const v = cuerpo.attributes.uv.getY(i), u = cuerpo.attributes.uv.getX(i), banda = 0.5 + 0.5 * Math.sin(v * 130);
    tmp.copy(cA).lerp(cB, (Math.abs(u - 0.5) * 2 * 0.6 + banda * 0.25 + fbm3(v * 30, u * 6, 0) * 0.4) * 0.7);
    col.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  cuerpo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.25 });
  grupo.add(new THREE.Mesh(cuerpo, mat));

  // espinas a lo largo del lomo
  const espina = new THREE.ConeGeometry(0.16, 0.9, 5); espina.translate(0, 0.45, 0);
  const inst = new THREE.InstancedMesh(espina, mat, 64), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 64; i++) {
    const t = 0.03 + i / 64 * 0.93, P = curva.getPointAt(t), T = curva.getTangentAt(t);
    const lado = new THREE.Vector3().crossVectors(T, up).normalize(), arriba = new THREE.Vector3().crossVectors(lado, T).normalize();
    q.setFromUnitVectors(up, arriba.clone().addScaledVector(T, -0.35).normalize());
    const r = 0.16 + Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5) * 0.85 * (1 - Math.pow(t, 6) * 0.35);
    s.setScalar(0.5 + r * 1.1);
    m.compose(P.clone().addScaledVector(arriba, r * 0.85), q, s); inst.setMatrixAt(i, m);
  }
  grupo.add(inst);

  // cabeza: cráneo alargado, mandíbula, cuernos y bigotes
  const fin = curva.getPointAt(1), dirFin = curva.getTangentAt(1);
  const cabeza = new THREE.Group(); cabeza.position.copy(fin);
  cabeza.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(dirFin.x, dirFin.y * 0.35, dirFin.z).normalize());
  const craneo = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.95, 1.0, 4, 2, 2), mat); craneo.position.set(1.2, 0.15, 0);
  const hocico = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 6), mat); hocico.rotation.z = -Math.PI / 2; hocico.position.set(3.0, 0.2, 0);
  const mand = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.35, 0.8), mat); mand.position.set(1.3, -0.72, 0); mand.rotation.z = -0.28;
  cabeza.add(craneo, hocico, mand);
  for (const lado of [-1, 1]) {
    const cuerno = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.9, 6), mat); cuerno.position.set(-0.1, 0.9, lado * 0.42); cuerno.rotation.z = 1.05; cuerno.rotation.x = lado * 0.25;
    const bigote = new THREE.Mesh(tuboAfilado(new THREE.CatmullRomCurve3([new THREE.Vector3(2.7, -0.05, lado * 0.35), new THREE.Vector3(3.6, -0.6, lado * 1.0), new THREE.Vector3(3.2, -1.7, lado * 1.5), new THREE.Vector3(2.0, -2.4, lado * 1.2)]), 20, 5, t => 0.06 * (1 - t) + 0.008), mat);
    cabeza.add(cuerno, bigote);
  }
  grupo.add(cabeza);
  grupo.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return grupo;
}

/* ------------------------------------------------------------------ partículas: polvo, brasas, chispas */

const PARTICULA_VERT = /* glsl */`
attribute float aSeed; attribute float aTam;
uniform float uTime, uPx, uSubida, uDeriva; uniform vec3 uCaja;
varying float vAlpha; varying float vSeed;
void main(){
  vec3 p = position;
  float t = uTime * (0.4 + aSeed * 0.6);
  p.x += sin(t * 0.7 + aSeed * 40.0) * uDeriva + t * uDeriva * 0.15;
  p.y += mod(t * uSubida * (0.5 + aSeed) + aSeed * uCaja.y, uCaja.y) - aSeed * uCaja.y * 0.0;
  p.z += cos(t * 0.55 + aSeed * 23.0) * uDeriva;
  p.x = mod(p.x + uCaja.x, uCaja.x * 2.0) - uCaja.x;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float ciclo = fract((t * uSubida * (0.5 + aSeed) + aSeed * uCaja.y) / uCaja.y);
  vAlpha = smoothstep(0.0, 0.12, ciclo) * (1.0 - smoothstep(0.7, 1.0, ciclo)) * (0.55 + 0.45 * sin(uTime * (1.5 + aSeed * 3.0) + aSeed * 90.0));
  if (abs(uSubida) < 0.001) vAlpha = 0.55 + 0.45 * sin(uTime * (0.8 + aSeed * 2.4) + aSeed * 90.0);
  vSeed = aSeed;
  gl_PointSize = aTam * uPx / max(-mv.z, 0.3);
}`;
const PARTICULA_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uIntensidad; uniform sampler2D uMapa;
varying float vAlpha; varying float vSeed;
void main(){ float a = texture2D(uMapa, gl_PointCoord).a * vAlpha; if (a < 0.01) discard; gl_FragColor = vec4(uColor * uIntensidad * (0.7 + vSeed * 0.6), a); }`;

/**
 * Nube de partículas animada en GPU. `caja`: mitad del ancho X y alto Y del volumen (Z: mitad de `caja.z`).
 * `subida` 0 = polvo flotando; > 0 = brasas que suben y se apagan.
 */
export function crearParticulas({ n = 500, centro = [0, 0, 0], caja = [10, 4, 5], color = "#ffd9a0", intensidad = 1.5, tam = 0.05, subida = 0.05, deriva = 0.35, mapa, semilla = 1, aditivo = true }) {
  const R = rng(semilla), pos = new Float32Array(n * 3), seed = new Float32Array(n), tamA = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos.set([centro[0] + (R() * 2 - 1) * caja[0], centro[1], centro[2] + (R() * 2 - 1) * caja[2]], i * 3);
    seed[i] = R(); tamA[i] = tam * (0.5 + R() * 1.2);
  }
  if (Math.abs(subida) < 0.001) for (let i = 0; i < n; i++) pos[i * 3 + 1] = centro[1] + R() * caja[1];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1)); g.setAttribute("aTam", new THREE.BufferAttribute(tamA, 1));
  const u = { uTime: { value: 0 }, uPx: { value: 800 }, uSubida: { value: subida }, uDeriva: { value: deriva }, uCaja: { value: new THREE.Vector3(caja[0], caja[1], caja[2]) },
    uColor: { value: new THREE.Color(color) }, uIntensidad: { value: intensidad }, uMapa: { value: mapa } };
  const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: PARTICULA_VERT, fragmentShader: PARTICULA_FRAG, transparent: true, depthWrite: false,
    blending: aditivo ? THREE.AdditiveBlending : THREE.NormalBlending });
  const p = new THREE.Points(g, m); p.frustumCulled = false;
  p.userData.actualizar = (t, altoPx) => { u.uTime.value = t; u.uPx.value = altoPx * 0.9; };
  return p;
}

/* ------------------------------------------------------------------ llama */

export function crearLlama(alto = 1.1, ancho = 0.7) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSeed: { value: Math.random() * 10 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */`
      varying vec2 vUv; uniform float uTime, uSeed;
      float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fb(vec2 p){ return 0.55 * vn(p) + 0.3 * vn(p * 2.1) + 0.15 * vn(p * 4.3); }
      void main(){
        vec2 uv = vUv; float y = uv.y;
        float n = fb(vec2(uv.x * 2.4 + uSeed, y * 2.6 - uTime * 2.2));
        float x = (uv.x - 0.5) * 2.0 + (n - 0.5) * 0.9 * y;
        float forma = 1.0 - smoothstep(0.0, 1.0, abs(x) / (0.95 - y * 0.85));
        float cola = smoothstep(1.0, 0.25, y + (n - 0.5) * 0.55);
        float f = clamp(forma * cola * (0.55 + n), 0.0, 1.0);
        vec3 c = mix(vec3(1.9, 0.35, 0.03), vec3(3.4, 1.9, 0.5), smoothstep(0.15, 0.7, f));
        c = mix(c, vec3(5.0, 4.2, 2.6), smoothstep(0.75, 1.0, f) * (1.0 - y));
        gl_FragColor = vec4(c, f * f * 1.6);
      }`
  });
  const g = new THREE.PlaneGeometry(ancho, alto); g.translate(0, alto / 2, 0);
  const m = new THREE.Mesh(g, mat); m.renderOrder = 5;
  m.userData.actualizar = (t, cam) => { mat.uniforms.uTime.value = t; m.rotation.y = Math.atan2(cam.position.x - m.parent.position.x - m.position.x, cam.position.z - m.parent.position.z - m.position.z); };
  return m;
}

/* ------------------------------------------------------------------ haz de luz volumétrico falso */

/** Prisma alargado con degradado aditivo: se ve como un rayo de sol entrando por un vano polvoriento. */
export function crearHaz({ ancho = 4, alto = 3.4, largo = 26, color = "#ffb468", intensidad = 0.5, semilla = 1 }) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uI: { value: intensidad }, uSeed: { value: semilla } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: "varying vec3 vP; varying vec2 vUv; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */`
      varying vec3 vP; varying vec2 vUv; uniform float uTime, uI, uSeed; uniform vec3 uColor;
      float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        // coordenadas locales: z a lo largo del rayo, x/y a lo ancho
        float lz = vP.z / ${largo.toFixed(1)} + 0.5;
        float bx = smoothstep(0.5, 0.36, abs(vP.x) / ${ancho.toFixed(1)}), by = smoothstep(0.5, 0.34, abs(vP.y) / ${alto.toFixed(1)});
        float largoF = smoothstep(0.0, 0.08, lz) * (1.0 - smoothstep(0.35, 1.0, lz));
        float n = 0.55 + 0.45 * vn(vec2(vP.x * 0.9 + uSeed, vP.z * 0.35 - uTime * 0.12)) * vn(vec2(vP.y * 1.3 - uTime * 0.05, vP.z * 0.2 + uSeed));
        float a = bx * by * largoF * n * uI;
        gl_FragColor = vec4(uColor * a, a);
      }`
  });
  const m = new THREE.Mesh(new THREE.BoxGeometry(ancho, alto, largo), mat);
  m.renderOrder = 4; m.frustumCulled = false;
  m.userData.actualizar = t => { mat.uniforms.uTime.value = t; };
  return m;
}
