// Render de la pelea: un solo renderer y un composer compartido entre las tres pantallas.
//
//   RenderPass (MSAA + profundidad) → Mundo (profundidad de campo + rayos de luz) → Bloom → Output (ACES) → Final
//
// «Mundo» y «Final» son pases propios. Los rayos salen del CIELO (sólo los píxeles de profundidad 1 aportan luz),
// así que las columnas y el techo los recortan solos en haces, sin volumétricos reales.
// Cada pantalla llama a `mostrar(escena, camara, opciones)` y le pasa dónde está el sol y cuánto desenfocar.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const MundoShader = {
  name: "MundoShader",
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null },
    uNear: { value: 0.1 }, uFar: { value: 1000 }, uRes: { value: new THREE.Vector2(1, 1) },
    uFocus: { value: 8 }, uRange: { value: 5 }, uBlur: { value: 0 },
    uSunUV: { value: new THREE.Vector2(0.5, 0.5) }, uSunVis: { value: 0 }, uRays: { value: 0 },
    uRayCol: { value: new THREE.Color("#ffb060") }, uRayThr: { value: 1.0 }
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */`
    #include <packing>
    uniform sampler2D tDiffuse, tDepth;
    uniform float uNear, uFar, uFocus, uRange, uBlur, uSunVis, uRays, uRayThr;
    uniform vec2 uRes, uSunUV; uniform vec3 uRayCol;
    varying vec2 vUv;
    float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    float viewZ(vec2 uv){ float d = texture2D(tDepth, uv).x; return -perspectiveDepthToViewZ(d, uNear, uFar); }
    float coc(float z){ return clamp((abs(z - uFocus) - uRange * 0.35) / uRange, 0.0, 1.0); }
    void main(){
      float d0 = texture2D(tDepth, vUv).x;
      float z = d0 >= 0.99999 ? uFar : viewZ(vUv);
      vec3 col = texture2D(tDiffuse, vUv).rgb;

      // ---- profundidad de campo: disco de 24 muestras en espiral (ángulo áureo), radio según la distancia al foco
      float c = coc(z) * uBlur;
      if (c > 0.02) {
        vec3 acc = col; float peso = 1.0;
        float radio = c * 0.012;                                   // fracción del alto de pantalla
        for (int i = 0; i < 24; i++) {
          float f = (float(i) + 0.5) / 24.0, a = float(i) * 2.39996;
          vec2 o = vec2(cos(a) * uRes.y / uRes.x, sin(a)) * sqrt(f) * radio;
          vec2 uv = vUv + o;
          float ds = texture2D(tDepth, uv).x;
          float zs = ds >= 0.99999 ? uFar : viewZ(uv);
          // un fondo nítido no debe sangrar sobre un primer plano desenfocado ni al revés: se pesa por el CoC de la muestra
          float ws = max(coc(zs) * uBlur, 0.0);
          float w = (zs < z) ? smoothstep(0.0, 0.5, ws / max(c, 0.001)) : 1.0;
          vec3 s = texture2D(tDiffuse, uv).rgb;
          float brillo = 1.0 + max(lum(s) - 1.0, 0.0) * 0.6;       // los brillos hacen «bokeh»
          acc += s * w * brillo; peso += w * brillo;
        }
        col = acc / peso;
      }

      // ---- rayos: desenfoque radial hacia el sol de lo que es CIELO brillante (lo demás lo tapa)
      if (uRays > 0.001 && uSunVis > 0.001) {
        vec2 dir = (uSunUV - vUv) / 56.0 * 0.95;
        vec2 uv = vUv + dir * fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);   // jitter: sin bandas
        vec3 acc = vec3(0.0); float peso = 1.0;
        for (int i = 0; i < 56; i++) {
          uv += dir;
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
          float ds = texture2D(tDepth, uv).x;
          if (ds >= 0.99999) {
            vec3 s = texture2D(tDiffuse, uv).rgb;
            acc += max(s - uRayThr, 0.0) * peso;
          }
          peso *= 0.965;
        }
        float cerca = 0.35 + 0.65 * smoothstep(1.3, 0.0, length((uSunUV - vUv) * vec2(uRes.x / uRes.y, 1.0)));
        col += acc / 56.0 * uRays * uSunVis * uRayCol * cerca * 3.0;
      }
      // un NaN/infinito en cualquier punto se esparciría con el bloom y dejaría la pantalla negra: se corta acá
      if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
      gl_FragColor = vec4(min(col, vec3(64.0)), 1.0);
    }`
};

const FinalShader = {
  name: "FinalShader",
  uniforms: {
    tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
    uVig: { value: 0.4 }, uGrain: { value: 0.04 }, uAber: { value: 0.3 }, uContrast: { value: 1.08 }, uSat: { value: 1.08 },
    uSombra: { value: new THREE.Color("#0a1030") }, uLuz: { value: new THREE.Color("#ffb070") }, uSplit: { value: 0.06 },
    uFade: { value: 1 }, uFlash: { value: new THREE.Vector4(1, 1, 1, 0) }
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime, uVig, uGrain, uAber, uContrast, uSat, uSplit, uFade;
    uniform vec3 uSombra, uLuz; uniform vec4 uFlash;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    void main(){
      vec2 c = vUv - 0.5;
      vec2 off = c * dot(c, c) * uAber * 0.06;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      // etalonaje: split-toning (sombras frías, luces cálidas), contraste y saturación
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, col * (1.0 + (uLuz - 0.5) * 0.6), smoothstep(0.35, 0.9, l) * uSplit * 5.0);
      col = mix(col, col + (uSombra - 0.05) * 0.5, (1.0 - smoothstep(0.0, 0.35, l)) * uSplit * 5.0);
      col = (col - 0.5) * uContrast + 0.5;
      col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, uSat);
      // viñeta + grano
      col *= 1.0 - uVig * smoothstep(0.25, 0.85, length(c * vec2(1.0, 0.9)) * 1.25);
      col += (hash(vUv * uRes + uTime) - 0.5) * uGrain;
      col = mix(col, uFlash.rgb, uFlash.a);
      gl_FragColor = vec4(max(col, 0.0) * uFade, 1.0);
    }`
};

export class Render {
  constructor(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1;

    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(4, 4) });
    this.composer = new EffectComposer(r, rt);
    this.escena = new THREE.Scene(); this.camara = new THREE.PerspectiveCamera();
    this.renderPass = new RenderPass(this.escena, this.camara);
    this.mundo = new ShaderPass(MundoShader);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.55, 0.7, 1.0);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.mundo);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.final);

    // Se guarda la profundidad del buffer donde RenderPass acaba de dibujar (el composer los alterna).
    this._depth = null;
    const rp = this.renderPass, orig = rp.render.bind(rp);
    rp.render = (rr, w, rd, ...resto) => { orig(rr, w, rd, ...resto); this._depth = rd.depthTexture; };
    const mp = this.mundo, om = mp.render.bind(mp);
    mp.render = (rr, w, rd, ...resto) => { mp.uniforms.tDepth.value = this._depth; this._actualizarSol(); om(rr, w, rd, ...resto); };

    this.opciones = {};
    this.tiempo = 0;
    this._v = new THREE.Vector3();
    this.flash = new THREE.Vector4(1, 1, 1, 0);
    this.fade = 1;
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(canvas.parentElement || document.body);
    this.canvas = canvas;
    this.resize();
  }

  resize() {
    const p = this.canvas.parentElement || document.body;
    const w = Math.max(2, p.clientWidth), h = Math.max(2, p.clientHeight);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = "100%"; this.canvas.style.height = "100%";
    this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.mundo.uniforms.uRes.value.set(w * pr, h * pr);
    this.final.uniforms.uRes.value.set(w * pr, h * pr);
    this.w = w; this.h = h;
    if (this.camara) { this.camara.aspect = w / h; this.camara.updateProjectionMatrix(); }
  }

  /**
   * opciones: { sol: Vector3 (dirección hacia el sol), rayos, colorRayos, umbralRayos, dof:{foco,rango,desenfoque},
   *             bloom:{fuerza,radio,umbral}, grade:{viñeta,grano,aberracion,contraste,saturacion,sombra,luz,split}, exposicion }
   */
  mostrar(escena, camara, o = {}) {
    this.escena = escena; this.camara = camara; this.opciones = o;
    this.renderPass.scene = escena; this.renderPass.camera = camara;
    camara.aspect = this.w / this.h; camara.updateProjectionMatrix();
    const m = this.mundo.uniforms, dof = o.dof || {};
    m.uFocus.value = dof.foco ?? 8; m.uRange.value = dof.rango ?? 5; m.uBlur.value = dof.desenfoque ?? 0;
    m.uRays.value = o.rayos ?? 0; m.uRayCol.value.set(o.colorRayos || "#ffb060"); m.uRayThr.value = o.umbralRayos ?? 1.0;
    const b = o.bloom || {};
    this.bloom.strength = b.fuerza ?? 0.5; this.bloom.radius = b.radio ?? 0.6; this.bloom.threshold = b.umbral ?? 1.0;
    this.renderer.toneMappingExposure = o.exposicion ?? 1;
    const g = o.grade || {}, f = this.final.uniforms;
    f.uVig.value = g.viñeta ?? 0.4; f.uGrain.value = g.grano ?? 0.035; f.uAber.value = g.aberracion ?? 0.3;
    f.uContrast.value = g.contraste ?? 1.08; f.uSat.value = g.saturacion ?? 1.08; f.uSplit.value = g.split ?? 0.06;
    f.uSombra.value.set(g.sombra || "#0a1030"); f.uLuz.value.set(g.luz || "#ffb070");
  }

  _actualizarSol() {
    const o = this.opciones, m = this.mundo.uniforms, cam = this.camara;
    m.uNear.value = cam.near; m.uFar.value = cam.far;
    if (!o.sol) { m.uSunVis.value = 0; return; }
    cam.updateMatrixWorld();
    const p = this._v.setFromMatrixPosition(cam.matrixWorld).addScaledVector(o.sol, 1000).project(cam);
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    m.uSunUV.value.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    m.uSunVis.value = THREE.MathUtils.smoothstep(dir.dot(o.sol), -0.15, 0.3);
  }

  render(dt) {
    this.tiempo += dt;
    this.final.uniforms.uTime.value = this.tiempo % 100;
    this.final.uniforms.uFade.value = this.fade;
    this.final.uniforms.uFlash.value.copy(this.flash);
    this.composer.render(dt);
  }
}
