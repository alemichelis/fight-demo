// Efectos de combate: chispas, polvo, ondas de choque y un flash de luz. Todo en un solo pool de partículas (una draw call).

import * as THREE from "three";
import { texturaPunto } from "./tex.js";

const VERT = /* glsl */`
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
uniform float uPx; varying float vA; varying vec3 vC;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uPx / max(-mv.z, 0.2); vA = aAlpha; vC = aColor; }`;
const FRAG = /* glsl */`
uniform sampler2D uMapa; varying float vA; varying vec3 vC;
void main(){ float a = texture2D(uMapa, gl_PointCoord).a * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC, a); }`;

export class Efectos {
  constructor(escena) {
    this.escena = escena;
    const N = this.N = 700;
    this.pos = new Float32Array(N * 3); this.vel = new Float32Array(N * 3);
    this.vida = new Float32Array(N); this.vidaMax = new Float32Array(N).fill(1);
    this.tam = new Float32Array(N); this.alfa = new Float32Array(N); this.col = new Float32Array(N * 3);
    this.grav = new Float32Array(N); this.arrastre = new Float32Array(N);
    this.libre = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(this.tam, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(this.alfa, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uPx: { value: 800 }, uMapa: { value: texturaPunto() } };
    const aditivo = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.puntos = new THREE.Points(g, aditivo); this.puntos.frustumCulled = false; this.puntos.renderOrder = 8;
    escena.add(this.puntos);

    // ondas de choque: aro fino con bordes suaves que crece y se apaga
    this.ondas = [];
    const geo = new THREE.PlaneGeometry(2, 2);
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uCol: { value: new THREE.Color("#fff") }, uA: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: "varying vec2 vUv; uniform vec3 uCol; uniform float uA; void main(){ float r = length(vUv); float b = smoothstep(0.62, 0.9, r) * (1.0 - smoothstep(0.9, 1.0, r)); gl_FragColor = vec4(uCol * b * uA, b * uA); }"
      });
      const m = new THREE.Mesh(geo, mat); m.visible = false; m.renderOrder = 9; escena.add(m); this.ondas.push({ m, t: 1, dur: 0.3, tam: 1 });
    }
    // flash de luz puntual (se reutiliza)
    this.luz = new THREE.PointLight("#fff", 0, 9, 1.6); escena.add(this.luz); this.luzT = 0; this.luzI = 0;
  }

  _emitir(x, y, z, vx, vy, vz, vida, tam, color, grav = 0, arr = 0) {
    const i = this.libre; this.libre = (this.libre + 1) % this.N;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3);
    this.vida[i] = this.vidaMax[i] = vida; this.tam[i] = tam; this.alfa[i] = 1;
    this.col.set([color.r, color.g, color.b], i * 3); this.grav[i] = grav; this.arrastre[i] = arr;
  }

  /** Lluvia de chispas al impactar. `dir` = hacia dónde salen preferentemente (±1 en X). */
  chispas(p, color = "#ffb060", n = 26, dir = 1, fuerza = 1) {
    const c = new THREE.Color(color).multiplyScalar(2.6);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, v = (2 + Math.random() * 5) * fuerza;
      this._emitir(p.x, p.y, p.z, Math.cos(a) * v * 0.6 + dir * v * 0.9, Math.abs(Math.sin(a)) * v * 0.7 + 0.6, (Math.random() - 0.5) * v * 0.8,
        0.25 + Math.random() * 0.45, 0.05 + Math.random() * 0.09, c, -9, 1.4);
    }
    this._emitir(p.x, p.y, p.z, 0, 0, 0, 0.14, 0.9 * fuerza + 0.3, new THREE.Color("#fff").multiplyScalar(3), 0, 0);    // destello central
  }

  polvo(p, n = 14, ancho = 1) {
    const c = new THREE.Color("#a8875f").multiplyScalar(0.55);
    for (let i = 0; i < n; i++) this._emitir(p.x + (Math.random() - 0.5) * ancho, p.y + 0.05, p.z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 2.4, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * 1.2,
      0.6 + Math.random() * 0.6, 0.24 + Math.random() * 0.3, c, -0.3, 2.2);
  }

  /** Aura de energía alrededor de un punto (proyectil, especial). */
  brasas(p, color, n = 6) {
    const c = new THREE.Color(color).multiplyScalar(2.2);
    for (let i = 0; i < n; i++) this._emitir(p.x + (Math.random() - 0.5) * 0.2, p.y + (Math.random() - 0.5) * 0.2, p.z + (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.9, (Math.random() - 0.3) * 0.9, (Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.3, 0.06 + Math.random() * 0.06, c, 0, 1);
  }

  onda(p, color = "#ffd0a0", tam = 1.4, dur = 0.32) {
    const o = this.ondas.find(w => !w.m.visible) || this.ondas[0];
    o.m.visible = true; o.m.position.copy(p); o.m.material.uniforms.uCol.value.set(color).multiplyScalar(2.2); o.t = 0; o.dur = dur; o.tam = tam;
    o.m.quaternion.identity(); o.m.userData.cara = true;
  }

  suelo(p, tam = 1.6, color = "#ffd0a0") {                   // onda horizontal: aterrizajes y caídas
    const o = this.ondas.find(w => !w.m.visible) || this.ondas[0];
    o.m.visible = true; o.m.position.set(p.x, 0.03, p.z); o.m.material.uniforms.uCol.value.set(color).multiplyScalar(1.4); o.t = 0; o.dur = 0.45; o.tam = tam;
    o.m.rotation.set(-Math.PI / 2, 0, 0); o.m.userData.cara = false;
  }

  destello(p, color = "#ffb060", intensidad = 60) { this.luz.position.copy(p); this.luz.color.set(color); this.luzI = intensidad; this.luzT = 1; }

  update(dt, camara, altoPx) {
    this.uniforms.uPx.value = altoPx * 0.9;
    for (let i = 0; i < this.N; i++) {
      if (this.vida[i] <= 0) { this.alfa[i] = 0; continue; }
      this.vida[i] -= dt;
      const k = Math.max(0, 1 - this.arrastre[i] * dt), i3 = i * 3;
      this.vel[i3] *= k; this.vel[i3 + 1] = this.vel[i3 + 1] * k + this.grav[i] * dt; this.vel[i3 + 2] *= k;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] = Math.max(0.02, this.pos[i3 + 1] + this.vel[i3 + 1] * dt); this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const f = Math.max(0, this.vida[i] / this.vidaMax[i]);
      this.alfa[i] = f * f;
    }
    const g = this.puntos.geometry;
    g.attributes.position.needsUpdate = g.attributes.aSize.needsUpdate = g.attributes.aAlpha.needsUpdate = g.attributes.aColor.needsUpdate = true;
    for (const o of this.ondas) {
      if (!o.m.visible) continue;
      o.t += dt / o.dur;
      if (o.t >= 1) { o.m.visible = false; continue; }
      const e = 1 - Math.pow(1 - o.t, 3);
      o.m.scale.setScalar(0.1 + o.tam * e); o.m.material.uniforms.uA.value = (1 - o.t) * (1 - o.t) * 1.1;
      if (o.m.userData.cara) o.m.quaternion.copy(camara.quaternion);
    }
    if (this.luzT > 0) { this.luzT = Math.max(0, this.luzT - dt * 7); this.luz.intensity = this.luzI * this.luzT * this.luzT; }
  }
}
