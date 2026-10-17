// Escena, luz, cámara de estrategia y posprocesado.
// Calidades: alta (GTAO + bloom + SMAA + sombras 4096), media (bloom + SMAA + sombras 2048), baja (sin posproceso).

import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

export const CALIDADES = {
  alta:  { ratio: 2,   sombras: 4096, gtao: true,  bloom: true,  smaa: true },
  media: { ratio: 1.5, sombras: 2048, gtao: false, bloom: true,  smaa: true },
  baja:  { ratio: 1,   sombras: 1024, gtao: false, bloom: false, smaa: false }
};

// toque final: viñeta suave, un poco más de contraste y tono cálido en las luces
const Gradacion = {
  uniforms: { tDiffuse: { value: null }, uVineta: { value: 0.32 } },
  vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVineta; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 1.08);                                    // saturación
      col = (col - 0.5) * 1.05 + 0.5;                                  // contraste
      col *= mix(vec3(0.97, 0.99, 1.04), vec3(1.04, 1.0, 0.94), smoothstep(0.2, 0.9, l));   // sombras frías, luces cálidas
      vec2 d = vUv - 0.5; col *= 1.0 - dot(d, d) * uVineta * 2.2;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`
};

// red de seguridad: un píxel NaN/infinito (geometría rota, un GLB mal exportado) haría que el bloom lo esparza por
// toda la pantalla; acá se lo reemplaza por negro antes de que pase nada
const Saneador = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() { vec4 c = texture2D(tDiffuse, vUv);
      if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = vec4(min(c.rgb, vec3(64.0)), c.a); }`
};

export function crearEscena(lienzo, calidad, lado) {
  const Q = CALIDADES[calidad] || CALIDADES.media;
  const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: !Q.smaa, powerPreference: "high-performance", stencil: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.ratio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.88;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(34, 1, 0.5, 600);

  /* ---------------------------------------------------------------- cielo físico + luz de entorno */
  const sol = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 38), THREE.MathUtils.degToRad(215));
  const cielo = new Sky();
  cielo.scale.setScalar(4000);
  const u = cielo.material.uniforms;
  u.turbidity.value = 4.5; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.82;
  u.sunPosition.value.copy(sol);
  escena.add(cielo);
  // iluminación de entorno sacada del mismo cielo: los metales y el agua reflejan lo que se ve
  const pmrem = new THREE.PMREMGenerator(renderer);
  const escenaCielo = new THREE.Scene(); const cielo2 = new Sky(); cielo2.scale.setScalar(4000);
  Object.entries(u).forEach(([k, v]) => { if (cielo2.material.uniforms[k]) cielo2.material.uniforms[k].value = v.value?.clone ? v.value.clone() : v.value; });
  escenaCielo.add(cielo2);
  escena.environment = pmrem.fromScene(escenaCielo, 0.04).texture;
  escena.environmentIntensity = 0.55;
  pmrem.dispose();
  escena.fog = new THREE.Fog("#b9c6cf", 90, 230);

  const luzSol = new THREE.DirectionalLight("#ffe9cf", 2.9);
  luzSol.castShadow = true;
  luzSol.shadow.mapSize.set(Q.sombras, Q.sombras);
  luzSol.shadow.bias = -0.0004; luzSol.shadow.normalBias = 0.035;
  luzSol.shadow.radius = 3;
  const sc = luzSol.shadow.camera; sc.near = 1; sc.far = 160;
  escena.add(luzSol, luzSol.target);
  const hemi = new THREE.HemisphereLight("#cfe0f0", "#4a4030", 0.45);
  escena.add(hemi);

  /* ---------------------------------------------------------------- posprocesado */
  let composer = null, gtao = null, bloom = null, smaa = null;
  if (Q.bloom || Q.gtao || Q.smaa) {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Q.smaa ? 0 : 4 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(escena, camara));
    if (Q.gtao) {
      gtao = new GTAOPass(escena, camara, 1, 1);
      gtao.blendIntensity = 0.85;
      gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12 });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      composer.addPass(gtao);
    }
    composer.addPass(new ShaderPass(Saneador));
    // umbral alto: brillan el fuego y las luces, no el metal
    if (Q.bloom) { bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.55, 1.05); composer.addPass(bloom); }
    composer.addPass(new OutputPass());
    composer.addPass(new ShaderPass(Gradacion));
    if (Q.smaa) { smaa = new SMAAPass(); composer.addPass(smaa); }
  }

  /* ---------------------------------------------------------------- cámara de estrategia */
  const cam = {
    objetivo: new THREE.Vector3(lado / 2, 0, lado / 2),
    distancia: 30, distanciaObj: 30, min: 13, max: 58,
    giro: 0,                 // ángulo alrededor del eje Y
    temblor: 0
  };
  function ubicarCamara(alturaEn) {
    cam.distancia += (cam.distanciaObj - cam.distancia) * 0.18;
    const t = (cam.distancia - cam.min) / (cam.max - cam.min);
    const incl = THREE.MathUtils.degToRad(46 + t * 18);           // de cerca, más cinematográfica; de lejos, más cenital
    cam.objetivo.y = alturaEn(cam.objetivo.x, cam.objetivo.z);
    const off = new THREE.Vector3(Math.sin(cam.giro) * Math.cos(incl), Math.sin(incl), Math.cos(cam.giro) * Math.cos(incl)).multiplyScalar(cam.distancia);
    camara.position.copy(cam.objetivo).add(off);
    if (cam.temblor > 0.001) { camara.position.x += (Math.random() - 0.5) * cam.temblor; camara.position.y += (Math.random() - 0.5) * cam.temblor; cam.temblor *= 0.86; }
    camara.lookAt(cam.objetivo);
    // la sombra sigue a lo que se mira, con el cuadro alineado a la grilla de texels para que no «hierva» al mover
    const alcance = 16 + cam.distancia * 0.75;
    sc.left = -alcance; sc.right = alcance; sc.top = alcance; sc.bottom = -alcance; sc.updateProjectionMatrix();
    const texel = alcance * 2 / Q.sombras;
    const centro = cam.objetivo.clone();
    const dirSol = sol.clone().normalize();
    // alineado en el espacio de la luz
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), dirSol.clone().negate(), new THREE.Vector3(0, 1, 0));
    const inv = m.clone().invert();
    centro.applyMatrix4(inv); centro.x = Math.round(centro.x / texel) * texel; centro.y = Math.round(centro.y / texel) * texel; centro.applyMatrix4(m);
    luzSol.target.position.copy(centro);
    luzSol.position.copy(centro).addScaledVector(dirSol, 80);
  }

  function redimensionar() {
    const w = lienzo.clientWidth || window.innerWidth, h = lienzo.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camara.aspect = w / h; camara.updateProjectionMatrix();
    if (composer) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
    }
  }

  function dibujar() { if (composer) composer.render(); else renderer.render(escena, camara); }

  return { renderer, escena, camara, cam, luzSol, sol, ubicarCamara, redimensionar, dibujar, calidad: Q };
}
