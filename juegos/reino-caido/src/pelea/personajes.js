// Plantel de la pelea: qué modelos hay, cómo se cargan, cómo se les prestan animaciones y cómo se sacan los retratos.
//
// Todo lo que decide «qué clip usa cada acción» está en ACCIONES (por defecto) y en `def.acciones` (por personaje).
// Cuando lleguen los FBX de pelea: ponerlos en assets/pelea/ y declararlos en `def.fbx = { punch: "/juegos/reino-caido/assets/pelea/x.fbx", ... }`;
// cada uno se re-apunta al esqueleto del personaje por nombre de hueso (no importa el prefijo mixamorig) y reemplaza al préstamo.

import * as THREE from "three";
import { retargetClip } from "three/addons/utils/SkeletonUtils.js";
import { loadModel } from "/src/core/assets.js";

export const ZOMBIE_ANIMS = "/juegos/reino-caido/assets/zombies/zombie-anims.glb";

/** acción de juego → nombre de clip. `null` = sin clip: la pose la resuelve el código (inclinación, retroceso…). */
export const ACCIONES = {
  idle: "Idle", walk: "Walk", back: "Walk", run: "Run", jump: "Idle", crouch: "Idle", block: "Idle",
  punch: "Attack", kick: "AttackHeadbutt", uppercut: "AttackBite", special: "Scream", sweep: "AttackHeadbutt", airkick: "AttackHeadbutt",
  hit: null, knockdown: "DeathDying", getup: "StandUp", ko: "Death",
  intro: "Scream", win: "Scream"
};

/** Animaciones de pelea (Mixamo FBX en assets/fight-moves): acción de juego → archivo. Reemplazan al préstamo de zombis. */
const FM = "/juegos/reino-caido/assets/fight-moves/";
export const FIGHT = Object.fromEntries(Object.entries({
  idle: "Fighting Idle", intro: "Bouncing Fight Idle (2)", crouch: "Ducking", punch: "Cross Punch", kick: "Mma Kick (2)",
  uppercut: "Elbow Punching", sweep: "Mma Kick (4)", airkick: "Flying Bicycle Kick (1)", special: "Fireball (1)",
  knockdown: "Dying Backwards", ko: "Dying Backwards", getup: "Getting Up", win: "Cheering"
}).map(([k, v]) => [k, encodeURI(`${FM}${v}.fbx`)]));

/** Sin luchadores fijos: cada jugador trae los suyos (avatares de Avaturn guardados en su cuenta). */
export const ROSTER = [];

/* ------------------------------------------------------------------ carga y préstamo de animaciones */

const canon = n => String(n).replace(/^mixamorig:?/, "");
const cache = new Map();

function huesos(modelo) {
  const m = new Map();
  modelo.traverse(o => { if (o.isBone || o.name) m.set(canon(o.name), o.name); });
  return m;
}

const hipsDe = raiz => { let h = null; raiz.traverse(o => { if (!h && /Hips$/.test(o.name)) h = o; }); return h; };
const lineal = h => new THREE.Matrix3().setFromMatrix4(h.parent ? h.parent.matrixWorld : new THREE.Matrix4());

/**
 * Cómo pasar el movimiento de caderas de un rig a otro. Cada archivo trae su Armature con escala/rotación propias (cm vs m,
 * ejes girados), así que se lleva a MUNDO con el rig de origen, se reescala por la altura de caderas y se trae al espacio local
 * del modelo destino. Sin esto, un modelo con el Armature girado hunde las caderas en el piso.
 */
function conversorCaderas(origen, destino) {
  const hO = hipsDe(origen), hD = hipsDe(destino);
  if (!hO || !hD) return null;
  origen.updateMatrixWorld(true); destino.updateMatrixWorld(true);
  const mO = lineal(hO), mDinv = lineal(hD).invert();
  const altO = new THREE.Vector3().setFromMatrixPosition(hO.matrixWorld).y, altD = new THREE.Vector3().setFromMatrixPosition(hD.matrixWorld).y;
  const k = altO > 1e-6 ? altD / altO : 1;
  return { hO, hD, mO, mDinv, k };
}

/**
 * Deja un clip listo para `modelo`: apunta cada pista al nombre real del hueso, tira las pistas de huesos que no existen
 * (evita el aviso de three) y vuelve «en el lugar» el movimiento de caderas (sin desplazamiento horizontal).
 * `conv` = conversorCaderas(origen, destino) cuando el clip viene de otro archivo.
 */
function prepararClip(clip, modelo, mapa, conv = null, { sinEscala = true } = {}) {
  const tracks = [];
  for (const t of clip.tracks) {
    const punto = t.name.indexOf(".");
    const nodo = t.name.slice(0, punto), prop = t.name.slice(punto + 1);
    const real = mapa.get(canon(nodo));
    if (!real || (sinEscala && prop === "scale")) continue;
    // de otro archivo: las traslaciones de huesos que no son caderas están en las unidades de OTRO rig (cm vs m) y estirarían la malla
    if (conv && prop === "position" && !/Hips$/.test(real)) continue;
    const c = t.clone(); c.name = `${real}.${prop}`;
    if (prop === "position" && /Hips$/.test(real)) {
      const v = c.values, ref = conv ? conv.hO.position : (modelo.getObjectByName(real)?.position || new THREE.Vector3());
      const tmp = new THREE.Vector3(), tmp0 = new THREE.Vector3(), rest = (conv ? conv.hD : modelo.getObjectByName(real)).position;
      const aMundo = (x, y, z, out) => out.set(x - ref.x, y - ref.y, z - ref.z).applyMatrix3(conv ? conv.mO : new THREE.Matrix3());
      if (conv) {
        aMundo(v[0], v[1], v[2], tmp0);                                    // primer cuadro: sirve para quitar el avance horizontal
        for (let i = 0; i < v.length; i += 3) {
          aMundo(v[i], v[i + 1], v[i + 2], tmp);
          tmp.x -= tmp0.x; tmp.z -= tmp0.z; tmp.multiplyScalar(conv.k);   // en el lugar; y = subida/bajada respecto de la pose de reposo
          tmp.applyMatrix3(conv.mDinv).add(rest);
          v[i] = tmp.x; v[i + 1] = tmp.y; v[i + 2] = tmp.z;
        }
      } else {
        // clip propio del modelo: sólo se anula el avance horizontal (en ejes locales del padre, que ya son los del modelo)
        const x0 = v[0], z0 = v[2];
        for (let i = 0; i < v.length; i += 3) { v[i] -= x0 - rest.x; v[i + 2] -= z0 - rest.z; }
      }
    }
    tracks.push(c);
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/**
 * Re-apunta un clip a un rig con OTRA pose de reposo (p. ej. Avaturn vs Mixamo): las rotaciones absolutas de uno,
 * aplicadas al otro, doblan el cuerpo. SkeletonUtils.retargetClip trabaja en espacio de mundo y lo resuelve.
 */
function clipRetargeteado(clip, origen, destino, mapa, altD) {
  const huesosO = [], huesosD = [];
  origen.traverse(o => { if (o.isBone) huesosO.push(o); });
  destino.traverse(o => { if (o.isBone) huesosD.push(o); });          // traverse = padres antes que hijos (SkeletonUtils lo exige; el orden del skin puede no serlo)
  if (!huesosO.length || !huesosD.length) return null;
  origen.skeleton = new THREE.Skeleton(huesosO);                     // retargetClip espera un objeto con `skeleton`
  origen.updateMatrixWorld(true); destino.updateMatrixWorld(true);
  // foto de la pose de reposo ANTES de retargetear: skeleton.pose() no siempre la recupera y el modelo quedaba agachado (altura mal medida)
  const reposo = destino.userData.reposo ||= huesosD.map(h => [h.position.clone(), h.quaternion.clone(), h.scale.clone()]);
  const malla = new THREE.Object3D(); malla.skeleton = new THREE.Skeleton(huesosD);
  const names = {};
  for (const h of huesosD) { const o = huesosO.find(x => canon(x.name) === canon(h.name)); if (o) names[h.name] = o.name; }
  const hD = hipsDe(destino), hO = hipsDe(origen);
  const altO = new THREE.Vector3().setFromMatrixPosition(hO.matrixWorld).y;
  const r = retargetClip(malla, origen, clip, { names, hip: hO.name, scale: altO > 1e-6 ? altD / altO : 1 });
  huesosD.forEach((h, i) => { h.position.copy(reposo[i][0]); h.quaternion.copy(reposo[i][1]); h.scale.copy(reposo[i][2]); }); destino.updateMatrixWorld(true);              // retargetClip deja el rig destino en la última pose del clip
  const tracks = [];
  for (const t of r.tracks) {
    const m = /^\.bones\[(.+)\]\.(position|quaternion)$/.exec(t.name);
    if (!m) continue;
    const c = t.clone(); c.name = `${m[1]}.${m[2]}`;
    if (m[2] === "position") {                                      // en el lugar: se quita el avance horizontal (en MUNDO: el Armature puede estar girado)
      const v = c.values, pm = hD.parent ? hD.parent.matrixWorld : new THREE.Matrix4(), inv = pm.clone().invert();
      const w0 = new THREE.Vector3(v[0], v[1], v[2]).applyMatrix4(pm), rw = hD.position.clone().applyMatrix4(pm), t = new THREE.Vector3();
      for (let i = 0; i < v.length; i += 3) {
        t.set(v[i], v[i + 1], v[i + 2]).applyMatrix4(pm); t.x += rw.x - w0.x; t.z += rw.z - w0.z; t.applyMatrix4(inv);
        v[i] = t.x; v[i + 1] = t.y; v[i + 2] = t.z;
      }
    }
    tracks.push(c);
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/** Baja el modelo y sus animaciones una sola vez; devuelve todo lo necesario para instanciar. */
export function cargar(def) {
  if (!cache.has(def.id)) {
    const p = (async () => {
      const { scene: base, animations: propias } = await loadModel(def.modelo);
      base.updateMatrixWorld(true);
      const mapa = huesos(base);
      const altCaderas = new THREE.Vector3().setFromMatrixPosition(hipsDe(base).matrixWorld).y;     // medida ANTES de retargetear (retargetClip deja el rig posado)
      const clips = new Map();
      const nuevos = (lista, conv, nombre) => { for (const c of lista) { const p = prepararClip(c, base, mapa, conv); if (p.tracks.length && !clips.has(nombre || c.name)) clips.set(nombre || c.name, p); } };
      nuevos(propias, null);
      for (const a of def.anims || []) {
        const r = await loadModel(a.url);
        if (a.modo === "propio") nuevos(r.animations, null);                                    // mismo rig y unidades: tal cual
        else if (a.modo === "retarget") {
          for (const c of r.animations) { const p = clipRetargeteado(c, r.scene, base, mapa, altCaderas); if (p?.tracks.length && !clips.has(c.name)) clips.set(c.name, p); }
        } else nuevos(r.animations, conversorCaderas(r.scene, base));                          // rig Mixamo con la misma pose de reposo
      }
      // FBX de pelea (cuando existan): sobrescriben el clip de esa acción
      for (const [accion, url] of Object.entries(def.fbx || {})) {
        try { const r = await loadModel(url); if (r.animations[0]) {
            const p = def.retarget ? clipRetargeteado(r.animations[0], r.scene, base, mapa, altCaderas) : prepararClip(r.animations[0], base, mapa, conversorCaderas(r.scene, base));
            if (p) clips.set("fbx:" + accion, p);
          } }
        catch (e) { console.warn(`[pelea] no pude cargar ${url}: ${e.message}`); }
      }
      // altura y apoyo: se mide con el esqueleto ya en su pose de reposo
      const caja = new THREE.Box3().setFromObject(base), tam = caja.getSize(new THREE.Vector3()), cen = caja.getCenter(new THREE.Vector3());
      const escala = tam.y > 1e-4 ? def.altura / tam.y : 1;
      return { def, clips, escala, pies: new THREE.Vector3(-cen.x * escala, -caja.min.y * escala, -cen.z * escala), tam };
    })();
    cache.set(def.id, p);
    p.catch(() => cache.delete(def.id));
  }
  return cache.get(def.id);
}

/* ------------------------------------------------------------------ actor */

/** Una copia jugable: pivote en los pies, mezclador y helpers para reproducir acciones ajustadas a una duración. */
export class Actor {
  constructor(datos, modelo) {
    this.def = datos.def; this.datos = datos;
    this.raiz = new THREE.Group();                       // posición/orientación en el escenario
    this.pivote = new THREE.Group();                     // inclinaciones y retrocesos procedurales
    this.raiz.add(this.pivote);
    this.modelo = modelo;
    modelo.scale.setScalar(datos.escala);
    modelo.position.copy(datos.pies);
    this.pivote.add(modelo);
    this.mixer = new THREE.AnimationMixer(modelo);
    this.acciones = new Map();
    this.actual = null; this.nombreActual = null;
    modelo.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  /** Nombre de clip para una acción de juego, respetando FBX propios y remapeos del personaje. */
  clipDe(accion) {
    if (this.datos.clips.has("fbx:" + accion)) return "fbx:" + accion;
    const n = (this.def.acciones && accion in this.def.acciones) ? this.def.acciones[accion] : ACCIONES[accion];
    return n && this.datos.clips.has(n) ? n : null;
  }

  _accion(nombre) {
    let a = this.acciones.get(nombre);
    if (!a) { a = this.mixer.clipAction(this.datos.clips.get(nombre)); this.acciones.set(nombre, a); }
    return a;
  }

  /**
   * Reproduce una acción. `dur` estira/comprime el clip para que dure justo eso (los tiempos de juego mandan, no el clip).
   * Devuelve false si el personaje no tiene clip para esa acción (el llamador aplica una pose procedural).
   */
  jugar(accion, { fade = 0.15, bucle = true, dur = 0, velocidad = 1, desde = 0 } = {}) {
    const nombre = this.clipDe(accion);
    if (!nombre) return false;                       // sin clip: la pose la pone el código y el clip actual sigue
    const a = this._accion(nombre), clip = this.datos.clips.get(nombre);
    if (this.actual === a && bucle) { a.timeScale = velocidad; return true; }
    a.reset(); a.enabled = true;
    a.setLoop(bucle ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !bucle;
    a.timeScale = dur > 0 && clip.duration > 0 ? clip.duration / dur : velocidad;
    a.time = desde * clip.duration;
    a.setEffectiveWeight(1);
    if (this.actual && this.actual !== a) { a.crossFadeFrom(this.actual, fade, false); } else a.fadeIn(fade);
    a.play();
    this.actual = a; this.nombreActual = nombre;
    return true;
  }

  _soltar(fade) { if (this.actual) { this.actual.fadeOut(fade); this.actual = null; this.nombreActual = null; } }

  update(dt) { this.mixer.update(dt); }

  /** Tinte emisivo momentáneo (impacto, escudo). 0 lo apaga. */
  brillo(color, fuerza) {
    this.modelo.traverse(o => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) { if (m.emissive) { m.emissive.set(color); m.emissiveIntensity = fuerza; } }
    });
  }

  liberar() { this.mixer.stopAllAction(); this.raiz.parent?.remove(this.raiz); }
}

export async function instanciar(def) {
  const datos = await cargar(def);
  const { scene } = await loadModel(def.modelo);
  return new Actor({ ...datos, def }, scene);                  // el def de ESTA pelea manda (nombre y color cambian según el lado)
}

/* ------------------------------------------------------------------ retratos */

/** Foto de busto para la grilla de selección (se renderiza una vez y se guarda como dataURL). */
export async function retrato(renderer, def, ancho = 168, alto = 210) {
  const actor = await instanciar(def);
  actor.jugar("idle", { fade: 0 }); actor.update(0.4);
  const esc = new THREE.Scene(), cv = document.createElement("canvas");
  cv.width = 2; cv.height = 256;
  const c = cv.getContext("2d"), g = c.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#1a1c24"); g.addColorStop(1, "#050507"); c.fillStyle = g; c.fillRect(0, 0, 2, 256);
  esc.background = new THREE.CanvasTexture(cv); esc.background.colorSpace = THREE.SRGBColorSpace;
  esc.add(actor.raiz);
  esc.add(new THREE.HemisphereLight(0xbfd0ff, 0x231a14, 1.6));
  const key = new THREE.DirectionalLight(0xffe0bd, 3.2); key.position.set(-1.2, 1.6, 2.6); esc.add(key);
  const rim = new THREE.DirectionalLight(new THREE.Color(def.color), 4.5); rim.position.set(2.5, 1.4, -1.8); esc.add(rim);
  const cam = new THREE.PerspectiveCamera(22, ancho / alto, 0.1, 30);
  // se encuadra la CABEZA real (hueso), no una altura fija: los zombis van encorvados y el avatar erguido
  esc.updateMatrixWorld(true);
  let hueso = null; actor.modelo.traverse(o => { if (!hueso && /Head$/.test(o.name)) hueso = o; });
  const cab = hueso ? new THREE.Vector3().setFromMatrixPosition(hueso.matrixWorld) : new THREE.Vector3(0, def.altura * 0.9, 0);
  cam.position.set(cab.x + 0.25, cab.y + 0.02, cab.z + 2.1); cam.lookAt(cab.x, cab.y - 0.03, cab.z);
  const rt = new THREE.WebGLRenderTarget(ancho, alto, { colorSpace: THREE.SRGBColorSpace, samples: 4 });
  const prev = renderer.getRenderTarget(), tm = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setRenderTarget(rt); renderer.render(esc, cam);
  renderer.setRenderTarget(prev); renderer.toneMapping = tm;
  const px = new Uint8Array(ancho * alto * 4);
  await renderer.readRenderTargetPixelsAsync?.(rt, 0, 0, ancho, alto, px) ?? renderer.readRenderTargetPixels(rt, 0, 0, ancho, alto, px);
  rt.dispose();
  const out = document.createElement("canvas"); out.width = ancho; out.height = alto;
  const oc = out.getContext("2d"), img = oc.createImageData(ancho, alto);
  for (let y = 0; y < alto; y++) img.data.set(px.subarray((alto - 1 - y) * ancho * 4, (alto - y) * ancho * 4), y * ancho * 4);
  oc.putImageData(img, 0, 0);
  actor.liberar();
  return out.toDataURL("image/png");
}
