// Retratos para la interfaz: cada tipo se renderiza en 3D con su modelo real y se guarda como imagen.
// Usa un renderizador aparte y chico para tener tono y color finales (como en pantalla) sin tocar la escena.

import * as THREE from "three";
import { crearModelo } from "./modelos.js";
import { U } from "./parches.js";

export function crearRetratos(tipos, color, entorno) {
  const tam = 160;
  const lienzo = document.createElement("canvas"); lienzo.width = lienzo.height = tam;
  const r = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1); r.setSize(tam, tam, false);
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05; r.outputColorSpace = THREE.SRGBColorSpace;
  const escena = new THREE.Scene();
  escena.environment = entorno; escena.environmentIntensity = 0.8;
  const luz = new THREE.DirectionalLight("#fff3e0", 3.2); luz.position.set(3, 5, 4); escena.add(luz);
  const contra = new THREE.DirectionalLight("#9ec4ff", 1.6); contra.position.set(-4, 2, -3); escena.add(contra);
  const camara = new THREE.PerspectiveCamera(26, 1, 0.05, 100);
  // sin niebla de guerra en los retratos
  const nieblaReal = U.uNiebla.value, ladoReal = U.uLado.value;
  const blanco = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat); blanco.needsUpdate = true;
  U.uNiebla.value = blanco;
  const nubesReal = U.uNubes.value; U.uNubes.value = 0;
  const res = {};
  for (const tipo of tipos) {
    const { objeto, partes } = crearModelo(tipo, color);
    if (partes.brazoD && tipo !== "arquero") partes.brazoD.rotation.x = -0.9;
    escena.add(objeto);
    const caja = new THREE.Box3().setFromObject(objeto), tamC = caja.getSize(new THREE.Vector3()), centro = caja.getCenter(new THREE.Vector3());
    const unidad = tamC.y < 2.2 && tamC.x < 2;
    // unidades: plano de busto; edificios: tres cuartos
    const mira = unidad ? new THREE.Vector3(centro.x, caja.max.y - tamC.y * 0.32, centro.z) : centro;
    const dist = unidad ? tamC.y * 2.1 : Math.max(tamC.x, tamC.y, tamC.z) * 2.25;
    camara.position.set(mira.x + dist * 0.45, mira.y + dist * (unidad ? 0.12 : 0.42), mira.z + dist * 0.85);
    camara.lookAt(mira);
    r.render(escena, camara);
    res[tipo] = lienzo.toDataURL("image/png");
    escena.remove(objeto);
    objeto.traverse(n => { if (n.geometry && !n.geometry.userData.compartida) n.geometry.dispose(); });
  }
  U.uNiebla.value = nieblaReal; U.uLado.value = ladoReal; U.uNubes.value = nubesReal;
  r.dispose();
  return res;
}
