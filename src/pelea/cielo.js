// Cielo procedural: gradiente de atardecer, sol HDR (alimenta el bloom y los rayos de luz) y nubes con
// borde iluminado. Se usa tanto como fondo visible como fuente del mapa de entorno (reflejos en el piso).

import * as THREE from "three";

const VERT = /* glsl */`
varying vec3 vDir;
void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }`;

const FRAG = /* glsl */`
varying vec3 vDir;
uniform vec3 uSun, uSunCol, uZenith, uMid, uHorizon, uGround, uCloudLit, uCloudShade;
uniform float uTime, uClouds, uSunPower, uStars;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++){ s += a * vn(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.30, h));
  col = mix(col, uZenith, smoothstep(0.22, 0.85, h));
  col = mix(col, uGround, smoothstep(0.0, -0.12, h));
  float sd = max(dot(d, normalize(uSun)), 0.0);
  // resplandor amplio + núcleo + disco: valores HDR a propósito
  col += uSunCol * (pow(sd, 6.0) * 0.55 + pow(sd, 40.0) * 1.2) * uSunPower;
  col += uSunCol * pow(sd, 2400.0) * 40.0 * uSunPower;
  if (uClouds > 0.0 && h > -0.02) {
    vec2 p = d.xz / (h + 0.22) * 1.35 + vec2(uTime * 0.006, uTime * 0.0025);
    float n = fbm(p * 1.1), dens = smoothstep(0.42, 0.78, n) * uClouds;
    // el lado hacia el sol se ilumina (borde plateado/dorado)
    float lado = fbm(p * 1.1 + normalize(uSun).xz * 0.09);
    float luz = clamp((n - lado) * 5.0 + 0.5, 0.0, 1.0) * (0.35 + 0.65 * pow(sd, 0.6));
    vec3 c = mix(uCloudShade, uCloudLit, luz);
    c += uSunCol * pow(sd, 10.0) * 0.6 * (1.0 - dens * 0.5) * uSunPower;
    col = mix(col, c, dens * smoothstep(-0.02, 0.16, h));
  }
  if (uStars > 0.0 && h > 0.0) {
    vec2 g = floor(d.xz / (h + 0.3) * 90.0); float e = h21(g); float est = step(0.985, e) * (0.5 + 0.5 * sin(uTime * 2.0 + e * 60.0));
    col += vec3(0.8, 0.9, 1.0) * est * uStars * smoothstep(0.05, 0.4, h);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export const CIELOS = {
  atardecer: {
    zenith: "#25337a", mid: "#b06a6c", horizon: "#ffb765", ground: "#7a4a3a",
    sunCol: "#ffb060", cloudLit: "#ffd9a0", cloudShade: "#5a3a5e", clouds: 0.85, sunPower: 1.0
  },
  noche: {
    zenith: "#050a1c", mid: "#0e1a3c", horizon: "#27407a", ground: "#05070f",
    sunCol: "#a8c4ff", cloudLit: "#7d95cc", cloudShade: "#0b1226", clouds: 0.55, sunPower: 0.8, estrellas: 2.2
  },
  alba: {
    zenith: "#7c7fb8", mid: "#e5a9b4", horizon: "#ffd9b0", ground: "#8a7c88",
    sunCol: "#ffc890", cloudLit: "#ffe0d0", cloudShade: "#8a7096", clouds: 0.9, sunPower: 1.0
  },
  volcan: {
    zenith: "#12040a", mid: "#5a1408", horizon: "#ff5a18", ground: "#2a0a06",
    sunCol: "#ff6a20", cloudLit: "#ff7a30", cloudShade: "#1c0806", clouds: 1.0, sunPower: 0.7
  },
  tormenta: {
    zenith: "#1c232c", mid: "#3e4a56", horizon: "#7d8a94", ground: "#2a3038",
    sunCol: "#c8d8ff", cloudLit: "#8592a0", cloudShade: "#171d24", clouds: 1.0, sunPower: 0.15
  },
  nieve: {
    zenith: "#a8bad4", mid: "#d4dfee", horizon: "#f4f7fc", ground: "#dde4ee",
    sunCol: "#ffffff", cloudLit: "#ffffff", cloudShade: "#b8c6da", clouds: 1.0, sunPower: 0.4
  },
  apocalipsis: {
    zenith: "#160e0c", mid: "#54372a", horizon: "#d07a3a", ground: "#2a1a14",
    sunCol: "#ff8a3a", cloudLit: "#e8804a", cloudShade: "#1c1210", clouds: 1.0, sunPower: 0.9
  },
  cyber: {
    zenith: "#05020f", mid: "#1b0b36", horizon: "#6a1e78", ground: "#0a0614",
    sunCol: "#ff5ac8", cloudLit: "#c04aa0", cloudShade: "#0a0418", clouds: 0.75, sunPower: 0.4, estrellas: 0.6
  },
  dia: {
    zenith: "#3f6fbe", mid: "#8fb1de", horizon: "#e6dccd", ground: "#7d8794",
    sunCol: "#fff0d0", cloudLit: "#ffffff", cloudShade: "#7a8cab", clouds: 1.0, sunPower: 0.5
  }
};

export function crearCielo(sunDir, tipo = "atardecer") {
  const c = CIELOS[tipo] || CIELOS.atardecer;
  const u = {
    uSun: { value: sunDir.clone().normalize() }, uSunCol: { value: new THREE.Color(c.sunCol) },
    uZenith: { value: new THREE.Color(c.zenith) }, uMid: { value: new THREE.Color(c.mid) },
    uHorizon: { value: new THREE.Color(c.horizon) }, uGround: { value: new THREE.Color(c.ground) },
    uCloudLit: { value: new THREE.Color(c.cloudLit) }, uCloudShade: { value: new THREE.Color(c.cloudShade) },
    uTime: { value: 0 }, uClouds: { value: c.clouds }, uSunPower: { value: c.sunPower }, uStars: { value: c.estrellas || 0 }
  };
  const m = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), new THREE.ShaderMaterial({
    uniforms: u, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, fog: false
  }));
  m.frustumCulled = false; m.renderOrder = -10;
  m.userData.actualizar = t => { u.uTime.value = t; };
  return m;
}

/** Mapa de entorno (PMREM) a partir de un cielo: reflejos y luz ambiente coherentes con lo que se ve. */
export function entornoDesdeCielo(renderer, cielo) {
  const pm = new THREE.PMREMGenerator(renderer), s = new THREE.Scene();
  const copia = cielo.clone(); s.add(copia);
  const rt = pm.fromScene(s, 0, 1, 2000);
  pm.dispose();
  return rt.texture;
}
