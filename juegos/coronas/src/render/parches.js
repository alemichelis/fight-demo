// Agregados a los materiales estándar de three.js sin reescribirlos: niebla de guerra, viento y mezcla de terreno.
// Cada material puede llevar varios parches; se encadenan en un solo onBeforeCompile.

import * as THREE from "three";

export const U = {
  uTiempo: { value: 0 },
  uNiebla: { value: null },
  uLado: { value: 1 },
  uViento: { value: new THREE.Vector2(0.8, 0.45) }
};

export function parchar(mat, clave, fn) {
  const lista = mat.userData.parches || (mat.userData.parches = []);
  lista.push({ clave, fn });
  mat.onBeforeCompile = sh => { for (const p of lista) p.fn(sh); };
  mat.customProgramCacheKey = () => lista.map(p => p.clave).join("|");
  mat.needsUpdate = true;
  return mat;
}

// posición de mundo en el vértice (respetando instancias), disponible como vMundo en el fragmento
function conMundo(sh) {
  if (sh.vertexShader.includes("vMundo")) return;
  sh.vertexShader = sh.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vMundo;")
    .replace("#include <project_vertex>", `#include <project_vertex>
      { vec4 wpM = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        wpM = instanceMatrix * wpM;
      #endif
        vMundo = (modelMatrix * wpM).xyz; }`);
  sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vMundo;");
}

// Niebla de guerra: sin explorar casi negro, explorado apagado y desaturado, visible normal.
export function conNiebla(mat) {
  return parchar(mat, "niebla", sh => {
    conMundo(sh);
    sh.uniforms.uNiebla = U.uNiebla; sh.uniforms.uLado = U.uLado;
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D uNiebla; uniform float uLado;")
      .replace("#include <opaque_fragment>", `#include <opaque_fragment>
        { float nv = texture2D(uNiebla, vMundo.xz / uLado).r;
          float luz = nv < 0.5 ? mix(0.035, 0.42, nv * 2.0) : mix(0.42, 1.0, (nv - 0.5) * 2.0);
          float gris = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
          gl_FragColor.rgb = mix(vec3(gris) * vec3(0.85, 0.9, 1.05), gl_FragColor.rgb, smoothstep(0.35, 0.95, nv)) * luz; }`);
  });
}

// Viento: dobla la geometría según la altura del vértice (árboles, pasto, banderas).
// eje: qué coordenada local manda la flexión ("y" para plantas, "x" para banderas que salen del mástil).
// colgante: la tela cuelga desde arriba, así que se mueve más abajo.
export function conViento(mat, fuerza = 0.12, alturaRef = 3, eje = "y", colgante = false) {
  return parchar(mat, `viento${fuerza}_${alturaRef}_${eje}_${colgante}`, sh => {
    sh.uniforms.uTiempo = U.uTiempo; sh.uniforms.uViento = U.uViento;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTiempo; uniform vec2 uViento;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        { vec3 baseW = modelMatrix[3].xyz;
        #ifdef USE_INSTANCING
          baseW += instanceMatrix[3].xyz;
        #endif
          float alt = clamp(${colgante ? "-" : ""}position.${eje} / ${alturaRef.toFixed(2)} + ${colgante ? "0.5" : "0.0"}, 0.0, 1.5);
          float fase = uTiempo * 1.7 + baseW.x * 0.37 + baseW.z * 0.23;
          float rafaga = sin(fase) * 0.6 + sin(fase * 2.3 + 1.7) * 0.3 + sin(uTiempo * 0.5 + baseW.x * 0.05) * 0.4;
          transformed.xz += uViento * rafaga * ${fuerza.toFixed(3)} * alt * alt; }`);
  });
}

/* ---------------------------------------------------------------- textura de niebla */

// Se actualiza desde la visión del jugador con transición suave (lo que se descubre «se abre», no salta).
export class Niebla {
  constructor(lado) {
    this.lado = lado;
    this.actual = new Float32Array(lado * lado);
    this.datos = new Uint8Array(lado * lado);
    this.tmp = new Float32Array(lado * lado);
    this.tex = new THREE.DataTexture(this.datos, lado, lado, THREE.RedFormat, THREE.UnsignedByteType);
    this.tex.magFilter = THREE.LinearFilter; this.tex.minFilter = THREE.LinearFilter;
    this.tex.needsUpdate = true;
    U.uNiebla.value = this.tex; U.uLado.value = lado;
  }
  actualizar(vis, dt, todoVisible = false) {
    const k = Math.min(1, dt * 4), N = this.lado, a = this.actual, t = this.tmp;
    for (let i = 0; i < vis.length; i++) {
      const obj = todoVisible ? 1 : vis[i] === 2 ? 1 : vis[i] === 1 ? 0.5 : 0;
      a[i] += (obj - a[i]) * k;
    }
    // desenfoque separable (horizontal y vertical) para que el borde no se vea en escalones de casillas
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x;
      t[i] = (a[i] * 2 + a[z * N + Math.max(0, x - 1)] + a[z * N + Math.min(N - 1, x + 1)]) * 0.25;
    }
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x;
      this.datos[i] = (t[i] * 2 + t[Math.max(0, z - 1) * N + x] + t[Math.min(N - 1, z + 1) * N + x]) * 0.25 * 255;
    }
    this.tex.needsUpdate = true;
  }
}
