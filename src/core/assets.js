// Carga y caché de assets: modelos (GLB/GLTF/FBX), texturas y HDRI.
//
// Un modelo se descarga y parsea UNA vez; cada instancia en la escena es un clon.
// El clon tiene sus propios materiales: si no, cambiarle el color a una caja del
// nivel se lo cambiaría a todas las copias del mismo GLB.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as clonarConHuesos } from "three/addons/utils/SkeletonUtils.js";

const draco = new DRACOLoader().setDecoderPath("/node_modules/three/examples/jsm/libs/draco/gltf/");
const gltf = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
const fbx = new FBXLoader();
const hdr = new HDRLoader();
const texLoader = new THREE.TextureLoader();

const cacheModelos = new Map();   // url → Promise<{scene, animations}>
const cacheTexturas = new Map();
const cacheHDR = new Map();

const extension = url => (url.split("?")[0].split(".").pop() || "").toLowerCase();

async function cargarCrudo(url) {
  if (extension(url) === "fbx") {
    const obj = await fbx.loadAsync(url);
    // Los FBX de Mixamo/Blender salen en centímetros: un humano de 170 unidades.
    // Si es evidente que está en cm se lleva a metros; el nivel trabaja en metros.
    const caja = new THREE.Box3().setFromObject(obj);
    const tam = caja.getSize(new THREE.Vector3()).length();
    if (tam > 60) obj.scale.multiplyScalar(0.01);
    const raiz = new THREE.Group(); raiz.add(obj);
    return { scene: raiz, animations: obj.animations || [] };
  }
  const r = await gltf.loadAsync(url);
  return { scene: r.scene, animations: r.animations || [] };
}

/* Devuelve {scene, animations} con una copia lista para meter en la escena. */
export async function loadModel(url) {
  if (!cacheModelos.has(url)) {
    const p = cargarCrudo(url);
    cacheModelos.set(url, p);
    p.catch(() => cacheModelos.delete(url));   // un fallo no debe quedar cacheado para siempre
  }
  const base = await cacheModelos.get(url);
  const scene = clonarConHuesos(base.scene);
  scene.traverse(o => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
    o.userData.origMat = o.material;          // para volver al material original del GLB
    o.frustumCulled = !o.isSkinnedMesh;       // los skinned se salen de su bounding box al animarse
  });
  return { scene, animations: base.animations };
}

export function loadTexture(url) {
  if (!cacheTexturas.has(url)) {
    const p = texLoader.loadAsync(url).then(t => { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; });
    cacheTexturas.set(url, p);
    p.catch(() => cacheTexturas.delete(url));
  }
  return cacheTexturas.get(url);
}

export function loadHDR(url) {
  if (!cacheHDR.has(url)) {
    const p = hdr.loadAsync(url).then(t => { t.mapping = THREE.EquirectangularReflectionMapping; return t; });
    cacheHDR.set(url, p);
    p.catch(() => cacheHDR.delete(url));
  }
  return cacheHDR.get(url);
}

/* Fuerza a recargar un asset (por ejemplo tras reemplazar el archivo). */
export function forgetAsset(url) {
  cacheModelos.delete(url); cacheTexturas.delete(url); cacheHDR.delete(url);
}
