// La simulación de la partida. No sabe nada de three.js ni del DOM: avanza en pasos fijos (TICK) y todo lo que
// cambia el estado entra por ordenar(jugador, orden), venga del mouse o de la IA. Eso la deja lista para correr en
// un servidor o en lockstep entre varias máquinas, y para probarla sola en Node (test/simular.mjs).
//
// Lo que el dibujo y la interfaz necesitan saber sale por this.eventos (se vacía cada cuadro) y leyendo el estado.

import { UNIDADES, EDIFICIOS, MINA, TICK, POB_MAX, LADO_MAPA, RECURSOS_INICIALES, COLORES_JUGADOR, NIVELES, INVESTIGACIONES } from "../datos.js";
import { generarMapa, LIBRE, ARBOL } from "./mapa.js";
import { crearBuscador } from "./caminos.js";
import { crearAzar } from "./azar.js";

const CELDA = 4;                 // tamaño de celda del índice espacial, en casillas
const CORREA = 11;               // hasta dónde persigue una unidad que atacó sola antes de volver a su lugar

export class Mundo {
  constructor({ semilla = 1, jugadores }) {
    this.mapa = generarMapa(LADO_MAPA, semilla);
    const N = this.N = this.mapa.lado;
    this.azar = crearAzar(semilla * 7 + 3);
    this.ocupa = new Int32Array(N * N).fill(-1);
    this.ents = new Map();
    this.sigId = 1;
    this.tick = 0;
    this.tiempo = 0;
    this.eventos = [];
    this.proyectiles = [];
    this.ganador = -1;
    this.buscador = crearBuscador(N, (x, z) => this.bloqueado(x, z));
    this.hash = new Map();
    this.jugadores = jugadores.map((j, i) => ({
      id: i, nombre: j.nombre, color: COLORES_JUGADOR[i], ia: !!j.ia,
      oro: RECURSOS_INICIALES.oro, madera: RECURSOS_INICIALES.madera, pob: 0, pobMax: 0,
      vis: new Uint8Array(N * N), derrotado: false, alertaT: -99,
      stats: { entrenadas: 0, perdidas: 0, bajas: 0, edificios: 0, oro: 0, madera: 0 },
      mejoras: { cuerpo: 0, distancia: 0, armadura: 0 }, investigado: new Set(), enCurso: new Set()
    }));

    for (const m of this.mapa.minas) this.crearMina(m.x, m.z);
    this.jugadores.forEach((j, i) => {
      const b = this.mapa.bases[i];
      this.crearEdificio("castillo", i, b.x, b.z, true);
      const lugares = this.casillasLibresCerca(b.x + 2, b.z + 6 * (i === 0 ? -1 : 1) + 2, 5);
      for (let k = 0; k < 5; k++) this.crearUnidad("peon", i, lugares[k].x + 0.5, lugares[k].z + 0.5);
    });
    this.actualizarPoblacion();
    // cada reino conoce su comarca: la zona alrededor del castillo arranca explorada (con su mina y su bosque)
    this.jugadores.forEach((J, i) => {
      const b = this.mapa.bases[i], cx = b.x + 2, cz = b.z + 2;
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if ((x - cx) ** 2 + (z - cz) ** 2 < 19 * 19) J.vis[z * N + x] = 1;
    });
    this.actualizarVision();
  }

  /* ================================================================ grilla */

  dentro(x, z) { return x >= 0 && z >= 0 && x < this.N && z < this.N; }
  bloqueado(x, z) {
    if (!this.dentro(x, z)) return true;
    const i = z * this.N + x;
    return this.mapa.tipo[i] !== LIBRE || this.ocupa[i] !== -1;
  }
  esArbol(x, z) { return this.dentro(x, z) && this.mapa.tipo[z * this.N + x] === ARBOL; }

  // casillas libres ordenadas por cercanía a (cx, cz): para formaciones y para dónde aparece una unidad
  casillasLibresCerca(cx, cz, cuantas, radioMax = 10) {
    const N = this.N, sx = Math.max(0, Math.min(N - 1, Math.floor(cx))), sz = Math.max(0, Math.min(N - 1, Math.floor(cz)));
    const visto = new Set([sz * N + sx]), cola = [[sx, sz]], res = [];
    for (let i = 0; i < cola.length && res.length < cuantas; i++) {
      const [x, z] = cola[i];
      if (!this.bloqueado(x, z)) res.push({ x, z });
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const nx = x + dx, nz = z + dz, k = nz * N + nx;
        if (!this.dentro(nx, nz) || visto.has(k) || Math.abs(nx - sx) > radioMax || Math.abs(nz - sz) > radioMax) continue;
        visto.add(k); cola.push([nx, nz]);
      }
    }
    return res;
  }

  /* ================================================================ entidades */

  crearUnidad(tipo, dueño, x, z) {
    const d = UNIDADES[tipo];
    const u = {
      id: this.sigId++, clase: "unidad", tipo, dueño, x, z, px: x, pz: z, ang: dueño === 0 ? Math.PI * 0.75 : -Math.PI * 0.25,
      vida: d.vida, vidaMax: d.vida, radio: d.radio, orden: null, camino: null, ci: 0, destClave: "", ultimoPath: -99,
      cd: 0, carga: null, anim: "quieto", golpeT: -9, oculto: false, ultimoDanio: -99, atascoT: 0, atascoRef: { x, z }, atascos: 0
    };
    this.ents.set(u.id, u);
    return u;
  }

  crearEdificio(tipo, dueño, tx, tz, completo) {
    const d = EDIFICIOS[tipo], lado = d.lado;
    const e = {
      id: this.sigId++, clase: "edificio", tipo, dueño, tx, tz, lado, x: tx + lado / 2, z: tz + lado / 2, px: tx + lado / 2, pz: tz + lado / 2,
      vida: completo ? d.vida : Math.max(1, d.vida * 0.1), vidaMax: d.vida, progreso: completo ? 1 : 0, completo,
      cola: [], colaT: 0, reunion: null, cd: 0, ultimoDanio: -99, ang: 0, nivel: tipo === "castillo" ? 1 : 0, rot: 0
    };
    this.marcar(e, e.id);
    this.ents.set(e.id, e);
    return e;
  }

  crearMina(tx, tz) {
    const m = { id: this.sigId++, clase: "mina", tipo: "mina", dueño: -1, tx, tz, lado: MINA.lado, x: tx + 1.5, z: tz + 1.5, px: tx + 1.5, pz: tz + 1.5, oro: MINA.oro, vida: 1, vidaMax: 1 };
    this.marcar(m, m.id);
    this.ents.set(m.id, m);
    return m;
  }

  marcar(e, valor) {
    for (let z = e.tz; z < e.tz + e.lado; z++) for (let x = e.tx; x < e.tx + e.lado; x++) this.ocupa[z * this.N + x] = valor;
  }

  rect(e) {
    if (e.clase === "unidad") { const x = Math.floor(e.x), z = Math.floor(e.z); return { x0: x, z0: z, x1: x, z1: z }; }
    return { x0: e.tx, z0: e.tz, x1: e.tx + e.lado - 1, z1: e.tz + e.lado - 1 };
  }

  // distancia de borde a borde entre una unidad y otra entidad
  distancia(u, e) {
    if (e.clase === "unidad") return Math.hypot(e.x - u.x, e.z - u.z) - u.radio - e.radio;
    const cx = Math.max(e.tx, Math.min(e.tx + e.lado, u.x)), cz = Math.max(e.tz, Math.min(e.tz + e.lado, u.z));
    return Math.hypot(cx - u.x, cz - u.z) - u.radio;
  }

  enemigos(a, b) { return a >= 0 && b >= 0 && a !== b; }

  unidadesDe(j) { const r = []; for (const e of this.ents.values()) if (e.clase === "unidad" && e.dueño === j) r.push(e); return r; }
  edificiosDe(j) { const r = []; for (const e of this.ents.values()) if (e.clase === "edificio" && e.dueño === j) r.push(e); return r; }

  /* ================================================================ órdenes */

  // Todas las acciones de un jugador pasan por acá. Devuelve { ok, msg } para que la interfaz explique por qué no.
  ordenar(jug, o) {
    const J = this.jugadores[jug];
    if (!J || J.derrotado || this.ganador >= 0) return { ok: false, msg: "" };
    const propias = (o.ids || []).map(id => this.ents.get(id)).filter(e => e && e.dueño === jug && e.clase === "unidad");

    switch (o.tipo) {
      case "mover": {
        if (!propias.length) return { ok: false };
        const lugares = this.casillasLibresCerca(o.x, o.z, propias.length, 12);
        propias.sort((a, b) => Math.hypot(a.x - o.x, a.z - o.z) - Math.hypot(b.x - o.x, b.z - o.z));
        propias.forEach((u, i) => {
          const l = lugares[i] || lugares[lugares.length - 1] || { x: Math.floor(o.x), z: Math.floor(o.z) };
          const exacto = propias.length === 1 && !this.bloqueado(Math.floor(o.x), Math.floor(o.z));
          this.asignar(u, { tipo: "mover", x: exacto ? o.x : l.x + 0.5, z: exacto ? o.z : l.z + 0.5, ataque: !!o.ataque });
        });
        return { ok: true };
      }
      case "atacar": {
        const t = this.ents.get(o.objetivo);
        if (!t || t.clase === "mina" || !this.enemigos(jug, t.dueño)) return { ok: false };
        for (const u of propias) this.asignar(u, { tipo: "atacar", objetivo: t.id });
        return { ok: true };
      }
      case "recolectar": {
        const peones = propias.filter(u => UNIDADES[u.tipo].recolecta);
        if (!peones.length) return { ok: false };
        for (const u of peones) {
          const orden = o.mina ? { tipo: "recolectar", recurso: "oro", mina: o.mina, fase: "ir" }
                               : { tipo: "recolectar", recurso: "madera", arbol: { x: o.x, z: o.z }, fase: "ir" };
          if (u.carga && (u.carga.tipo !== orden.recurso || u.carga.cant >= UNIDADES.peon.recolecta.carga)) orden.fase = "volver";
          this.asignar(u, orden);
        }
        return { ok: true };
      }
      case "construir": {
        const peones = propias.filter(u => UNIDADES[u.tipo].construye);
        const d = EDIFICIOS[o.edificio];
        if (!peones.length || !d) return { ok: false };
        const traba = this.bloqueo(jug, d); if (traba) return { ok: false, msg: traba };
        const motivo = this.motivoNoConstruir(jug, o.edificio, o.tx, o.tz);
        if (motivo) return { ok: false, msg: motivo };
        const falta = this.faltaPara(J, d.costo);
        if (falta) return { ok: false, msg: falta };
        J.oro -= d.costo.oro; J.madera -= d.costo.madera;
        const obra = this.crearEdificio(o.edificio, jug, o.tx, o.tz, false);
        obra.rot = ((o.rot | 0) % 4 + 4) % 4;
        this.eventos.push({ tipo: "obra", id: obra.id, dueño: jug });
        for (const u of peones) this.mandarAConstruir(u, obra.id, o.encolar);
        return { ok: true, id: obra.id };
      }
      case "ayudar": {                       // peones a terminar una obra propia
        const t = this.ents.get(o.objetivo);
        if (!t || t.dueño !== jug || t.clase !== "edificio" || t.completo) return { ok: false };
        for (const u of propias.filter(u => UNIDADES[u.tipo].construye)) this.mandarAConstruir(u, t.id, o.encolar);
        return { ok: true };
      }
      case "entrenar": {
        const e = this.ents.get(o.id), d = UNIDADES[o.unidad];
        if (!e || e.dueño !== jug || e.clase !== "edificio" || !d) return { ok: false };
        if (!e.completo) return { ok: false, msg: "El edificio todavía está en obra." };
        if (!EDIFICIOS[e.tipo].entrena?.includes(o.unidad)) return { ok: false };
        const traba = this.bloqueo(jug, d); if (traba) return { ok: false, msg: traba };
        if (e.cola.length >= 5) return { ok: false, msg: "La cola está llena (máximo 5)." };
        const falta = this.faltaPara(J, d.costo); if (falta) return { ok: false, msg: falta };
        if (J.pob + d.pob > J.pobMax) return { ok: false, msg: J.pobMax >= POB_MAX ? "Llegaste al límite de población." : "Falta comida: construí más granjas." };
        J.oro -= d.costo.oro; J.madera -= d.costo.madera;
        e.cola.push(o.unidad);
        this.actualizarPoblacion();
        return { ok: true };
      }
      case "investigar": {
        const e = this.ents.get(o.id), d = INVESTIGACIONES[o.inv];
        if (!e || e.dueño !== jug || e.clase !== "edificio" || !d || !EDIFICIOS[e.tipo].investiga) return { ok: false };
        if (!e.completo) return { ok: false, msg: "El edificio todavía está en obra." };
        if (J.investigado.has(o.inv) || J.enCurso.has(o.inv)) return { ok: false, msg: "Esa investigación ya está hecha o en curso." };
        const traba = this.bloqueo(jug, d); if (traba) return { ok: false, msg: traba };
        if (e.cola.length >= 5) return { ok: false, msg: "La cola está llena (máximo 5)." };
        const falta = this.faltaPara(J, d.costo); if (falta) return { ok: false, msg: falta };
        J.oro -= d.costo.oro; J.madera -= d.costo.madera;
        J.enCurso.add(o.inv); e.cola.push("inv:" + o.inv);
        return { ok: true };
      }
      case "mejorar": {                      // el castillo sube un nivel
        const e = this.ents.get(o.id);
        if (!e || e.dueño !== jug || e.tipo !== "castillo") return { ok: false };
        if (!e.completo) return { ok: false, msg: "El castillo todavía está en obra." };
        const sig = NIVELES[e.nivel + 1];
        if (!sig) return { ok: false, msg: "Tu reino ya está en el nivel más alto." };
        if (e.cola.includes("nivel")) return { ok: false, msg: "La mejora ya está en marcha." };
        if (sig.requiere && !this.edificiosDe(jug).some(b => b.tipo === sig.requiere && b.completo)) return { ok: false, msg: `Para ser ${sig.nombre} necesitás una ${EDIFICIOS[sig.requiere].nombre.toLowerCase()} terminada.` };
        if (e.cola.length >= 5) return { ok: false, msg: "La cola está llena (máximo 5)." };
        const falta = this.faltaPara(J, sig.costo); if (falta) return { ok: false, msg: falta };
        J.oro -= sig.costo.oro; J.madera -= sig.costo.madera;
        e.cola.push("nivel");
        return { ok: true };
      }
      case "cancelar": {                     // último de la cola, o la obra entera
        const e = this.ents.get(o.id);
        if (!e || e.dueño !== jug || e.clase !== "edificio") return { ok: false };
        if (!e.completo) {
          const d = EDIFICIOS[e.tipo];
          J.oro += Math.floor(d.costo.oro * 0.75); J.madera += Math.floor(d.costo.madera * 0.75);
          this.quitar(e, null, true);
          return { ok: true };
        }
        const i = o.indice ?? e.cola.length - 1;
        if (i < 0 || i >= e.cola.length) return { ok: false };
        const it = this.itemCola(e, e.cola[i]);
        J.oro += it.costo.oro; J.madera += it.costo.madera;
        if (it.inv) J.enCurso.delete(it.inv);
        e.cola.splice(i, 1); if (i === 0) e.colaT = 0;
        this.actualizarPoblacion();
        return { ok: true };
      }
      case "girar": {                        // girar un edificio propio un cuarto de vuelta (sólo cambia cómo se ve)
        for (const id of o.ids || []) { const e = this.ents.get(id); if (e && e.dueño === jug && e.clase === "edificio") e.rot = ((e.rot || 0) + (o.sentido || 1) + 4) % 4; }
        return { ok: true };
      }
      case "detener": for (const u of propias) this.asignar(u, null); return { ok: true };
      case "mantener": for (const u of propias) this.asignar(u, { tipo: "mantener" }); return { ok: true };
      case "reunion": {
        for (const id of o.ids || []) {
          const e = this.ents.get(id);
          if (e && e.dueño === jug && e.clase === "edificio") e.reunion = { x: o.x, z: o.z, mina: o.mina || null, arbol: o.arbol || null };
        }
        return { ok: true };
      }
    }
    return { ok: false };
  }

  // Con «encolar» (Shift) la obra se suma a las que ya tiene el peón; si no, va ya. En los dos casos se recuerda qué
  // hacía antes (juntar oro o madera) para volver a eso cuando no queden obras.
  mandarAConstruir(u, obraId, encolar) {
    const o = u.pendiente !== undefined ? u.pendiente : u.orden;
    if (encolar && o?.tipo === "construir") { (u.colaObras ||= []).push(obraId); return; }
    const luego = o?.tipo === "recolectar" ? { ...o, fase: u.carga ? "volver" : "ir" } : o?.tipo === "construir" ? o.luego : null;
    if (!encolar) u.colaObras = [];
    this.asignar(u, { tipo: "construir", objetivo: obraId, luego });
  }

  // cuántos peones están construyendo esta obra
  constructores(id) {
    let n = 0;
    for (const u of this.ents.values()) if (u.clase === "unidad" && u.orden?.tipo === "construir" && u.orden.objetivo === id) n++;
    return n;
  }

  // la obra propia sin terminar más cercana (opcionalmente sólo las que nadie está construyendo)
  obraCercana(u, radio, soloSinPeon) {
    let mejor = null, md = radio;
    for (const e of this.ents.values()) {
      if (e.clase !== "edificio" || e.dueño !== u.dueño || e.completo) continue;
      const d = this.distancia(u, e);
      if (d < md && (!soloSinPeon || this.constructores(e.id) === 0)) { md = d; mejor = e; }
    }
    return mejor;
  }

  asignar(u, orden) {
    if (u.oculto) { u.pendiente = orden; return; }   // adentro de la mina: obedece apenas sale
    u.orden = orden; u.camino = null; u.destClave = ""; u.atascos = 0; u.fallos = 0;
  }

  faltaPara(J, costo) {
    if (J.oro < costo.oro) return "No alcanza el oro.";
    if (J.madera < costo.madera) return "No alcanza la madera.";
    return null;
  }

  // nivel del reino: el del mejor castillo terminado (sin castillo, aldea)
  nivelDe(jug) {
    let n = 1;
    for (const e of this.ents.values()) if (e.dueño === jug && e.tipo === "castillo" && e.completo) n = Math.max(n, e.nivel);
    return n;
  }

  // ¿qué le falta al jugador para poder usar esto? (nivel del reino, edificio o investigación previa); null si nada
  bloqueo(jug, d) {
    if (d.nivel && this.nivelDe(jug) < d.nivel) return `Requiere ${NIVELES[d.nivel].nombre} (nivel ${d.nivel}): mejorá el castillo.`;
    if (d.requiere && EDIFICIOS[d.requiere] && !this.edificiosDe(jug).some(b => b.tipo === d.requiere && b.completo)) return `Requiere una ${EDIFICIOS[d.requiere].nombre.toLowerCase()} terminada.`;
    if (d.requiere && INVESTIGACIONES[d.requiere] && !this.jugadores[jug].investigado.has(d.requiere)) return `Antes investigá «${INVESTIGACIONES[d.requiere].nombre}».`;
    return null;
  }

  // lo que hay en una cola: tropa, investigación («inv:clave») o mejora de nivel («nivel»)
  itemCola(e, item) {
    if (item === "nivel") { const n = NIVELES[e.nivel + 1]; return { tiempo: n.tiempo, costo: n.costo, pob: 0, nivel: true }; }
    if (item.startsWith("inv:")) { const k = item.slice(4), d = INVESTIGACIONES[k]; return { tiempo: d.tiempo, costo: d.costo, pob: 0, inv: k }; }
    const d = UNIDADES[item]; return { tiempo: d.tiempo, costo: d.costo, pob: d.pob, unidad: item };
  }

  // daño de un golpe o proyectil, con las mejoras investigadas y el bono de asedio contra edificios
  danioDe(atacante, t, atk) {
    const J = this.jugadores[atacante.dueño];
    const bono = !J ? 0 : atk.proyectil === "flecha" ? J.mejoras.distancia : atk.proyectil ? 0 : J.mejoras.cuerpo;
    return (atk.danio + bono) * (t.clase === "edificio" && atk.vsEdificios ? atk.vsEdificios : 1);
  }

  motivoNoConstruir(jug, tipo, tx, tz) {
    const d = EDIFICIOS[tipo]; if (!d) return "?";
    const J = this.jugadores[jug];
    for (let z = tz; z < tz + d.lado; z++) for (let x = tx; x < tx + d.lado; x++) {
      if (!this.dentro(x, z) || this.bloqueado(x, z)) return "No se puede construir ahí.";
      if (!J.ia && J.vis[z * this.N + x] === 0) return "No podés construir en territorio sin explorar.";
    }
    for (const e of this.ents.values()) {
      if (e.clase === "unidad" && this.enemigos(jug, e.dueño) && e.x > tx - 0.5 && e.x < tx + d.lado + 0.5 && e.z > tz - 0.5 && e.z < tz + d.lado + 0.5) return "Hay enemigos en el lugar.";
      if (tipo === "castillo" && e.clase === "mina") {
        const dx = Math.max(e.tx - (tx + d.lado), tx - (e.tx + e.lado), 0), dz = Math.max(e.tz - (tz + d.lado), tz - (e.tz + e.lado), 0);
        if (Math.max(dx, dz) < 3) return "El castillo tiene que quedar a 3 casillas de la mina.";
      }
    }
    return null;
  }

  /* ================================================================ paso de simulación */

  paso() {
    this.tick++; this.tiempo += TICK;
    this.indexar();
    for (const e of this.ents.values()) {
      if (e.clase === "unidad") { e.px = e.x; e.pz = e.z; this.actualizarUnidad(e); }
      else if (e.clase === "edificio") this.actualizarEdificio(e);
    }
    this.separar();
    this.actualizarProyectiles();
    if (this.tick % 4 === 0) this.actualizarVision();
    if (this.tick % 10 === 0) { this.actualizarPoblacion(); this.revisarFin(); }
  }

  indexar() {
    this.hash.clear();
    for (const e of this.ents.values()) {
      if (e.clase !== "unidad" || e.oculto) continue;
      const k = Math.floor(e.x / CELDA) + Math.floor(e.z / CELDA) * 1000;
      let l = this.hash.get(k); if (!l) this.hash.set(k, l = []); l.push(e);
    }
  }

  cercanas(x, z, r) {
    const res = [], c0 = Math.floor((x - r) / CELDA), c1 = Math.floor((x + r) / CELDA), f0 = Math.floor((z - r) / CELDA), f1 = Math.floor((z + r) / CELDA);
    for (let f = f0; f <= f1; f++) for (let c = c0; c <= c1; c++) { const l = this.hash.get(c + f * 1000); if (l) for (const u of l) res.push(u); }
    return res;
  }

  // el enemigo más cercano dentro de «radio» (unidades primero, después edificios)
  buscarEnemigo(u, radio) {
    let mejor = null, md = radio;
    for (const o of this.cercanas(u.x, u.z, radio + 1)) {
      if (!this.enemigos(u.dueño, o.dueño) || o.vida <= 0) continue;
      const d = this.distancia(u, o); if (d < md) { md = d; mejor = o; }
    }
    if (mejor) return mejor;
    for (const e of this.ents.values()) {
      if (e.clase !== "edificio" || !this.enemigos(u.dueño, e.dueño)) continue;
      const d = this.distancia(u, e);
      if (EDIFICIOS[e.tipo].muro && d > 1.2) continue;   // los muros sólo se atacan si están pegados
      if (d < md) { md = d; mejor = e; }
    }
    return mejor;
  }

  /* ---------------------------------------------------------------- movimiento */

  // Pide (o reutiliza) un camino al rectángulo y avanza un paso. Devuelve "llego" o "moviendo".
  irA(u, r, adyacente) {
    const clave = `${r.x0},${r.z0},${r.x1},${r.z1},${adyacente ? 1 : 0}`;
    if (!u.camino || (u.destClave !== clave && this.tick - u.ultimoPath > 6)) {
      const res = this.buscador.camino(u.x, u.z, r, adyacente);
      u.camino = res.puntos; u.ci = 0; u.destClave = clave; u.ultimoPath = this.tick;
      u.atascoT = 0; u.atascoRef = { x: u.x, z: u.z };
      if (!adyacente && res.llego && r.x0 === r.x1 && r.z0 === r.z1 && u.orden?.x != null) u.camino.push({ x: u.orden.x, z: u.orden.z });
    }
    return this.avanzar(u);
  }

  avanzar(u) {
    if (!u.camino || u.ci >= u.camino.length) return "llego";
    const p = u.camino[u.ci], dx = p.x - u.x, dz = p.z - u.z, d = Math.hypot(dx, dz);
    const paso = UNIDADES[u.tipo].velocidad * TICK;
    if (d <= paso) { u.x = p.x; u.z = p.z; u.ci++; }
    else {
      let mx = dx / d, mz = dz / d;
      // esquive: si otra unidad está justo adelante, correrse a la derecha. Si vienen de frente, cada una se corre
      // a su derecha y se cruzan; sin esto dos unidades enfrentadas se empujan por igual y quedan trabadas.
      let ex = 0, ez = 0;
      for (const o of this.cercanas(u.x, u.z, 1.4)) {
        if (o === u || o.oculto) continue;
        const ox = o.x - u.x, oz = o.z - u.z, dist = Math.hypot(ox, oz);
        if (dist < 1e-4 || dist > u.radio + o.radio + 0.45) continue;
        const frente = (ox * mx + oz * mz) / dist;
        if (frente > 0.35) { const k = (frente - 0.35) * 1.6; ex += -mz * k; ez += mx * k; }
      }
      if (ex || ez) { mx += ex; mz += ez; const l = Math.hypot(mx, mz); mx /= l; mz /= l; }
      u.x += mx * paso; u.z += mz * paso;
    }
    if (d > 0.01) u.ang = Math.atan2(dx, dz);
    u.anim = "camina";
    // detector de atascos: si en 1,5 s casi no avanzó, recalcula; a la tercera, se rinde
    if (++u.atascoT >= 30) {
      if (Math.hypot(u.x - u.atascoRef.x, u.z - u.atascoRef.z) < 0.35) { u.camino = null; u.atascos++; }
      u.atascoT = 0; u.atascoRef = { x: u.x, z: u.z };
      if (u.atascos >= 3) { u.atascos = 0; return "llego"; }
    }
    return !u.camino || u.ci < u.camino.length ? "moviendo" : "llego";
  }

  mirarA(u, x, z) { u.ang = Math.atan2(x - u.x, z - u.z); }

  // Caminar hasta quedar a «umbral» del borde de e. Si el camino se termina y todavía está lejos (algo en el medio),
  // reintenta unas veces y después avisa "fallo" para que la orden desista en vez de trabarse.
  acercarse(u, e, umbral) {
    if (this.distancia(u, e) <= umbral) { u.fallos = 0; return "ya"; }
    if (this.irA(u, this.rect(e), true) === "llego") {
      if (this.distancia(u, e) <= umbral + 0.7) { u.fallos = 0; return "ya"; }
      u.camino = null; u.ultimoPath = -99; u.fallos = (u.fallos || 0) + 1;
      if (u.fallos > 4) { u.fallos = 0; return "fallo"; }
    }
    return "moviendo";
  }

  // empujes entre unidades y contra casillas bloqueadas: nadie se encima ni atraviesa árboles o edificios
  separar() {
    for (const u of this.ents.values()) {
      if (u.clase !== "unidad" || u.oculto) continue;
      for (const o of this.cercanas(u.x, u.z, 1.2)) {
        if (o.id <= u.id || o.oculto) continue;
        let dx = o.x - u.x, dz = o.z - u.z, d = Math.hypot(dx, dz);
        const min = u.radio + o.radio;
        if (d >= min) continue;
        if (d < 1e-4) { dx = Math.cos(u.id) * 0.01; dz = Math.sin(u.id) * 0.01; d = 0.01; }
        const solapa = (min - d) * 0.5, nx = dx / d, nz = dz / d;
        // la que está quieta cede más que la que camina
        const ku = u.anim === "camina" && o.anim !== "camina" ? 0.3 : o.anim === "camina" && u.anim !== "camina" ? 0.7 : 0.5;
        u.x -= nx * solapa * 2 * ku; u.z -= nz * solapa * 2 * ku;
        o.x += nx * solapa * 2 * (1 - ku); o.z += nz * solapa * 2 * (1 - ku);
      }
      this.salirDeBloqueos(u);
    }
  }

  salirDeBloqueos(u) {
    const cx = Math.floor(u.x), cz = Math.floor(u.z);
    if (this.bloqueado(cx, cz)) {          // quedó adentro (p. ej. le construyeron encima): a la casilla libre más cercana
      const l = this.casillasLibresCerca(u.x, u.z, 1, 6)[0];
      if (l) { u.x = l.x + 0.5; u.z = l.z + 0.5; u.camino = null; }
      return;
    }
    for (let z = cz - 1; z <= cz + 1; z++) for (let x = cx - 1; x <= cx + 1; x++) {
      if (!this.bloqueado(x, z)) continue;
      const qx = Math.max(x, Math.min(x + 1, u.x)), qz = Math.max(z, Math.min(z + 1, u.z));
      const dx = u.x - qx, dz = u.z - qz, d = Math.hypot(dx, dz);
      if (d < u.radio && d > 1e-5) { u.x = qx + dx / d * u.radio; u.z = qz + dz / d * u.radio; }
    }
    u.x = Math.max(0.3, Math.min(this.N - 0.3, u.x)); u.z = Math.max(0.3, Math.min(this.N - 0.3, u.z));
  }

  /* ---------------------------------------------------------------- unidades */

  actualizarUnidad(u) {
    const d = UNIDADES[u.tipo];
    u.cd -= TICK;
    if (u.anim !== "muere") u.anim = "quieto";
    const o = u.orden;
    const escanea = (this.tick + u.id) % 8 === 0;

    // peón sin nada que hacer: si hay una obra abandonada cerca, va a terminarla
    if (!o && d.construye && (this.tick + u.id) % 30 === 0) {
      const obra = this.obraCercana(u, 8, true);
      if (obra) { this.mandarAConstruir(u, obra.id, false); return; }
    }
    if (!o || o.tipo === "mantener") {
      if (escanea && !d.recolecta) {
        const t = this.buscarEnemigo(u, o ? d.ataque.rango + 0.3 : d.vision);
        if (t) u.orden = { tipo: "atacar", objetivo: t.id, auto: true, origen: { x: u.x, z: u.z }, mantener: !!o };
      }
      return;
    }

    switch (o.tipo) {
      case "mover": {
        if (o.ataque && escanea) {
          const t = this.buscarEnemigo(u, d.vision);
          if (t) { u.orden = { tipo: "atacar", objetivo: t.id, luego: o }; u.camino = null; return; }
        }
        const fx = Math.floor(o.x), fz = Math.floor(o.z);
        if (this.irA(u, { x0: fx, z0: fz, x1: fx, z1: fz }, false) === "llego") { u.orden = null; u.camino = null; }
        return;
      }
      case "atacar": return this.atacar(u, o);
      case "recolectar": return this.recolectar(u, o);
      case "construir": return this.construir(u, o);
    }
  }

  atacar(u, o) {
    const d = UNIDADES[u.tipo], t = this.ents.get(o.objetivo);
    if (!t || t.vida <= 0) { this.asignar(u, o.luego || null); return; }
    if (o.auto && o.origen && Math.hypot(u.x - o.origen.x, u.z - o.origen.z) > CORREA) {
      this.asignar(u, o.mantener ? { tipo: "mantener" } : { tipo: "mover", x: o.origen.x, z: o.origen.z });
      return;
    }
    const dist = this.distancia(u, t);
    if (dist <= d.ataque.rango + 0.08) {
      u.camino = null;
      this.mirarA(u, t.x, t.z);
      if (u.cd <= 0) {
        u.cd = d.ataque.cadencia; u.golpeT = this.tiempo; u.anim = "ataca";
        if (d.ataque.proyectil) this.disparar(u, t, d.ataque);
        else this.daniar(t, this.danioDe(u, t, d.ataque), u);
      }
      return;
    }
    if (o.mantener) { this.asignar(u, { tipo: "mantener" }); return; }
    // si una unidad se metió en el medio mientras persigue un edificio, pelea con ella primero
    if (t.clase === "edificio" && (this.tick + u.id) % 8 === 0 && !d.recolecta) {
      const cerca = this.buscarEnemigo(u, 2.5);
      if (cerca && cerca.clase === "unidad") { u.orden = { tipo: "atacar", objetivo: cerca.id, luego: o }; return; }
    }
    if (this.acercarse(u, t, d.ataque.rango + 0.08) === "fallo") this.asignar(u, o.luego || null);
  }

  disparar(u, t, atk) {
    const dist = Math.hypot(t.x - u.x, t.z - u.z);
    this.proyectiles.push({ id: this.sigId++, tipo: atk.proyectil, ox: u.x, oz: u.z, oy: u.clase === "edificio" ? 4.2 : 0.8,
      x: t.x, z: t.z, objetivo: t.id, danio: this.danioDe(u, t, atk), atacante: u.id, dueño: u.dueño, t: 0, dur: 0.18 + dist * 0.055 });
  }

  actualizarProyectiles() {
    for (let i = this.proyectiles.length - 1; i >= 0; i--) {
      const p = this.proyectiles[i], t = this.ents.get(p.objetivo);
      if (t) { p.x = t.x; p.z = t.z; }
      p.t += TICK;
      if (p.t >= p.dur) {
        if (t && t.vida > 0) this.daniar(t, p.danio, this.ents.get(p.atacante) || { dueño: p.dueño, id: -1 });
        this.proyectiles.splice(i, 1);
      }
    }
  }

  daniar(t, danio, atacante) {
    const def = t.clase === "unidad" ? UNIDADES[t.tipo] : EDIFICIOS[t.tipo];
    const armadura = (def?.armadura || 0) + (t.clase === "unidad" ? this.jugadores[t.dueño]?.mejoras.armadura || 0 : 0);
    const final = Math.max(1, (danio - armadura) * this.azar.rango(0.85, 1.15));
    t.vida -= final; t.ultimoDanio = this.tiempo;
    this.eventos.push({ tipo: "golpe", id: t.id, x: t.x, z: t.z, danio: final });
    const J = this.jugadores[t.dueño];
    if (J && this.tiempo - J.alertaT > 14) { J.alertaT = this.tiempo; this.eventos.push({ tipo: "alerta", dueño: t.dueño, x: t.x, z: t.z }); }
    if (t.vida <= 0) { this.quitar(t, atacante); return; }
    // responder: la unidad atacada (si no está ocupada) y las aliadas quietas de alrededor
    if (atacante && atacante.id > 0 && this.ents.has(atacante.id) && atacante.clase !== "mina") {
      const ayudan = t.clase === "unidad" ? [t, ...this.cercanas(t.x, t.z, 6)] : this.cercanas(t.x, t.z, 7);
      for (const a of ayudan) {
        if (a.dueño !== t.dueño || a.oculto || UNIDADES[a.tipo].recolecta) continue;
        if (!a.orden || a.orden.tipo === "mantener") a.orden = { tipo: "atacar", objetivo: atacante.id, auto: true, origen: { x: a.x, z: a.z }, mantener: !!a.orden };
      }
    }
  }

  quitar(e, asesino, silencioso = false) {
    if (!this.ents.has(e.id)) return;
    e.vida = 0;
    this.ents.delete(e.id);
    if (e.clase !== "unidad") this.marcar(e, -1);
    if (e.clase === "unidad" && this.jugadores[e.dueño]) this.jugadores[e.dueño].stats.perdidas++;
    if (asesino && this.jugadores[asesino.dueño] && e.dueño >= 0) this.jugadores[asesino.dueño].stats.bajas++;
    this.eventos.push({ tipo: silencioso ? "cancelada" : "muerte", id: e.id, clase: e.clase, entTipo: e.tipo, dueño: e.dueño, x: e.x, z: e.z, ang: e.ang });
    this.actualizarPoblacion();
  }

  /* ---------------------------------------------------------------- economía */

  depositoCercano(u) {
    let mejor = null, md = Infinity;
    for (const e of this.ents.values()) {
      if (e.clase !== "edificio" || e.dueño !== u.dueño || !e.completo || !EDIFICIOS[e.tipo].entrega) continue;
      const d = this.distancia(u, e); if (d < md) { md = d; mejor = e; }
    }
    return mejor;
  }

  arbolCercano(x, z, radio = 12, evitar = null) {
    let mejor = null, md = Infinity;
    const x0 = Math.floor(x), z0 = Math.floor(z);
    for (let dz = -radio; dz <= radio; dz++) for (let dx = -radio; dx <= radio; dx++) {
      const ax = x0 + dx, az = z0 + dz;
      if (!this.esArbol(ax, az) || evitar?.has(az * this.N + ax)) continue;
      // sólo árboles con al menos un costado libre (los del medio del bosque no se alcanzan)
      if (this.bloqueado(ax + 1, az) && this.bloqueado(ax - 1, az) && this.bloqueado(ax, az + 1) && this.bloqueado(ax, az - 1)) continue;
      const d = dx * dx + dz * dz; if (d < md) { md = d; mejor = { x: ax, z: az }; }
    }
    return mejor;
  }

  minaCercana(x, z, radio = 30) {
    let mejor = null, md = radio;
    for (const e of this.ents.values()) if (e.clase === "mina" && e.oro > 0) { const d = Math.hypot(e.x - x, e.z - z); if (d < md) { md = d; mejor = e; } }
    return mejor;
  }

  recolectar(u, o) {
    const R = UNIDADES[u.tipo].recolecta;
    if (o.fase === "ir") {
      if (o.recurso === "oro") {
        let m = this.ents.get(o.mina);
        if (!m || m.oro <= 0) { m = this.minaCercana(u.x, u.z); if (!m) { this.asignar(u, null); return; } o.mina = m.id; }
        const r = this.acercarse(u, m, 0.55);
        if (r === "fallo") { this.asignar(u, null); return; }
        if (r === "ya") {
          o.fase = "adentro"; o.t = R.tiempoOro; u.oculto = true; u.camino = null; u.x = m.x; u.z = m.z;
        }
      } else {
        let a = o.arbol;
        if (!a || !this.esArbol(a.x, a.z) || o.evitar?.has(a.z * this.N + a.x)) {
          a = o.arbol = this.arbolCercano(a ? a.x : u.x, a ? a.z : u.z, 12, o.evitar);
          if (!a) { this.asignar(u, null); return; }
          u.camino = null;
        }
        const r = this.acercarse(u, { clase: "arbol", tx: a.x, tz: a.z, lado: 1 }, 0.55);
        if (r === "fallo") { (o.evitar ||= new Set()).add(a.z * this.N + a.x); o.arbol = null; return; }
        if (r === "ya") { o.fase = "talar"; o.t = R.tiempoMadera; u.camino = null; }
      }
      return;
    }
    if (o.fase === "adentro") {
      o.t -= TICK;
      if (o.t > 0) return;
      const m = this.ents.get(o.mina);
      const cant = m ? Math.min(R.carga, m.oro) : 0;
      u.carga = { tipo: "oro", cant };
      u.oculto = false;
      if (u.pendiente !== undefined) {           // le dieron otra orden mientras estaba adentro
        const p = u.pendiente; u.pendiente = undefined;
        const sal = this.casillasLibresCerca(m ? m.x : u.x, m ? m.z + m.lado : u.z, 1, 6)[0];
        if (sal) { u.x = sal.x + 0.5; u.z = sal.z + 0.5; u.px = u.x; u.pz = u.z; }
        if (m) { m.oro -= cant; if (m.oro <= 0) { this.eventos.push({ tipo: "minaAgotada", x: m.x, z: m.z }); this.quitar(m, null); } }
        this.asignar(u, p);
        return;
      }
      if (m) {
        m.oro -= cant;
        const dep = this.depositoCercano(u);
        const sal = this.casillasLibresCerca(dep ? (m.x + dep.x) / 2 : m.x, dep ? (m.z + dep.z) / 2 : m.z, 1, 6)[0];
        if (sal) { u.x = sal.x + 0.5; u.z = sal.z + 0.5; }
        if (m.oro <= 0) { this.eventos.push({ tipo: "minaAgotada", x: m.x, z: m.z }); this.quitar(m, null); }
      }
      u.px = u.x; u.pz = u.z;
      o.fase = "volver";
      return;
    }
    if (o.fase === "talar") {
      const a = o.arbol;
      if (!a || !this.esArbol(a.x, a.z)) { o.fase = "ir"; return; }
      this.mirarA(u, a.x + 0.5, a.z + 0.5); u.anim = "trabaja";
      o.t -= TICK;
      if (o.t > 0) return;
      const i = a.z * this.N + a.x, cant = Math.min(R.carga, this.mapa.madera[i]);
      this.mapa.madera[i] -= cant;
      u.carga = { tipo: "madera", cant };
      if (this.mapa.madera[i] <= 0) { this.mapa.tipo[i] = LIBRE; this.eventos.push({ tipo: "arbolCae", x: a.x, z: a.z }); }
      o.fase = "volver";
      return;
    }
    if (o.fase === "volver") {
      if (!u.carga || !u.carga.cant) { o.fase = "ir"; return; }
      const dep = this.depositoCercano(u);
      if (!dep) { this.asignar(u, null); return; }
      const r = this.acercarse(u, dep, 0.5);
      if (r === "fallo") { this.asignar(u, null); return; }
      if (r === "ya") {
        const J = this.jugadores[u.dueño];
        const cant = Math.round(u.carga.cant * (J.bonus || 1));    // la dificultad de la IA ajusta el ritmo acá
        J[u.carga.tipo] += cant; J.stats[u.carga.tipo] += cant;
        this.eventos.push({ tipo: "entrega", dueño: u.dueño, recurso: u.carga.tipo, cant: u.carga.cant, x: u.x, z: u.z });
        u.carga = null; u.camino = null;
        o.fase = "ir";
      }
    }
  }

  construir(u, o) {
    const e = this.ents.get(o.objetivo);
    if (!e || e.completo) { this.siguienteTrabajo(u, null); return; }
    const r = this.acercarse(u, e, 0.6);
    if (r === "fallo") { this.asignar(u, null); return; }
    if (r !== "ya") return;
    u.camino = null; u.anim = "trabaja"; this.mirarA(u, e.x, e.z);
    const d = EDIFICIOS[e.tipo], k = TICK / d.tiempo;
    e.progreso = Math.min(1, e.progreso + k);
    e.vida = Math.min(e.vidaMax, e.vida + e.vidaMax * 0.9 * k);
    if (e.progreso >= 1) {
      e.completo = true;
      this.jugadores[e.dueño].stats.edificios++;
      this.eventos.push({ tipo: "construido", id: e.id, dueño: e.dueño, entTipo: e.tipo });
      this.actualizarPoblacion();
      // si terminó un castillo nuevo cerca de una mina, el peón se pone a minar solo
      this.siguienteTrabajo(u, e);
    }
  }

  // Qué hace un peón al terminar una obra: la próxima de su cola, si no otra obra cercana sin peón, si no lo que
  // hacía antes (juntar), y si la obra era un castillo nuevo junto a una mina, ponerse a minar ahí.
  siguienteTrabajo(u, terminada) {
    const o = u.orden, luego = o?.luego || null;
    while (u.colaObras?.length) {
      const id = u.colaObras.shift(), e = this.ents.get(id);
      if (e && !e.completo) { this.asignar(u, { tipo: "construir", objetivo: id, luego }); return; }
    }
    const otra = this.obraCercana(u, 10, true);
    if (otra) { this.asignar(u, { tipo: "construir", objetivo: otra.id, luego }); return; }
    const m = terminada?.tipo === "castillo" ? this.minaCercana(terminada.x, terminada.z, 12) : null;
    if (m) { this.asignar(u, { tipo: "recolectar", recurso: "oro", mina: m.id, fase: "ir" }); return; }
    this.asignar(u, luego);
  }

  /* ---------------------------------------------------------------- edificios */

  actualizarEdificio(e) {
    if (!e.completo) return;
    const d = EDIFICIOS[e.tipo];
    if (e.cola.length && (e.cola[0] === "nivel" || e.cola[0].startsWith("inv:"))) {
      e.colaT += TICK;
      const it = this.itemCola(e, e.cola[0]);
      if (e.colaT >= it.tiempo) {
        e.cola.shift(); e.colaT = 0;
        const J = this.jugadores[e.dueño];
        if (it.nivel) {
          const n = NIVELES[++e.nivel];
          e.vidaMax += n.vidaExtra; e.vida += n.vidaExtra;
          this.eventos.push({ tipo: "nivel", id: e.id, dueño: e.dueño, nivel: e.nivel });
          this.actualizarPoblacion();
        } else {
          const d = INVESTIGACIONES[it.inv];
          J.enCurso.delete(it.inv); J.investigado.add(it.inv);
          for (const k in d.efecto) J.mejoras[k] += d.efecto[k];
          this.eventos.push({ tipo: "investigado", dueño: e.dueño, inv: it.inv });
        }
      }
    } else if (e.cola.length) {
      e.colaT += TICK;
      if (e.colaT >= UNIDADES[e.cola[0]].tiempo) {
        const tipo = e.cola.shift(); e.colaT = 0;
        const hacia = e.reunion || { x: e.x, z: e.z + e.lado };
        const l = this.casillasLibresCerca(e.x + Math.sign(hacia.x - e.x) * (e.lado / 2 + 0.6), e.z + Math.sign(hacia.z - e.z || 1) * (e.lado / 2 + 0.6), 1, 8)[0];
        if (l) {
          const u = this.crearUnidad(tipo, e.dueño, l.x + 0.5, l.z + 0.5);
          this.jugadores[e.dueño].stats.entrenadas++;
          this.eventos.push({ tipo: "entrenada", id: u.id, dueño: e.dueño, entTipo: tipo });
          const r = e.reunion;
          if (r) {
            if (r.mina && UNIDADES[tipo].recolecta) u.orden = { tipo: "recolectar", recurso: "oro", mina: r.mina, fase: "ir" };
            else if (r.arbol && UNIDADES[tipo].recolecta) u.orden = { tipo: "recolectar", recurso: "madera", arbol: r.arbol, fase: "ir" };
            else u.orden = { tipo: "mover", x: r.x, z: r.z };
          }
        }
      }
    }
    if (d.ataque) {
      e.cd -= TICK;
      if (e.cd <= 0 && (this.tick + e.id) % 4 === 0) {
        const pseudo = { x: e.x, z: e.z, radio: e.lado / 2, dueño: e.dueño };
        const t = this.buscarEnemigo(pseudo, d.ataque.rango);
        if (t) { e.cd = d.ataque.cadencia; this.disparar({ ...pseudo, id: e.id, clase: "edificio" }, t, d.ataque); }
      }
    }
  }

  /* ---------------------------------------------------------------- población, visión y fin */

  actualizarPoblacion() {
    for (const J of this.jugadores) { J.pob = 0; J.pobMax = 0; }
    for (const e of this.ents.values()) {
      const J = this.jugadores[e.dueño]; if (!J) continue;
      if (e.clase === "unidad") J.pob += UNIDADES[e.tipo].pob;
      else if (e.clase === "edificio") {
        if (e.completo) J.pobMax += (EDIFICIOS[e.tipo].pobDa || 0) + (e.nivel > 1 ? NIVELES[e.nivel].pobExtra : 0);
        for (const t of e.cola) J.pob += UNIDADES[t]?.pob || 0;
      }
    }
    for (const J of this.jugadores) J.pobMax = Math.min(POB_MAX, J.pobMax);
  }

  actualizarVision() {
    const N = this.N;
    for (const J of this.jugadores) { const v = J.vis; for (let i = 0; i < v.length; i++) if (v[i] === 2) v[i] = 1; }
    for (const e of this.ents.values()) {
      const J = this.jugadores[e.dueño]; if (!J || e.oculto) continue;
      const r = e.clase === "unidad" ? UNIDADES[e.tipo].vision : EDIFICIOS[e.tipo].vision * (e.completo ? 1 : 0.5);
      const cx = e.x, cz = e.z, r2 = r * r;
      for (let z = Math.max(0, Math.floor(cz - r)); z <= Math.min(N - 1, Math.floor(cz + r)); z++)
        for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(N - 1, Math.floor(cx + r)); x++)
          if ((x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2 <= r2) J.vis[z * N + x] = 2;
    }
  }

  visible(jug, x, z) { const J = this.jugadores[jug]; return !J || J.vis[Math.floor(z) * this.N + Math.floor(x)] === 2; }
  explorado(jug, x, z) { const J = this.jugadores[jug]; return !J || J.vis[Math.floor(z) * this.N + Math.floor(x)] >= 1; }

  revisarFin() {
    if (this.ganador >= 0) return;
    const vivos = new Set();
    for (const e of this.ents.values()) if (e.dueño >= 0) vivos.add(e.dueño);
    for (const J of this.jugadores) {
      // derrota: sin edificios y sin peones (con soldados sueltos no alcanza para seguir)
      const tieneBase = [...this.ents.values()].some(e => e.dueño === J.id && (e.clase === "edificio" && !EDIFICIOS[e.tipo].muro || UNIDADES[e.tipo]?.recolecta));
      if (!J.derrotado && (!vivos.has(J.id) || !tieneBase)) { J.derrotado = true; this.eventos.push({ tipo: "derrota", dueño: J.id }); }
    }
    const quedan = this.jugadores.filter(J => !J.derrotado);
    if (quedan.length <= 1) { this.ganador = quedan[0]?.id ?? -2; this.eventos.push({ tipo: "fin", ganador: this.ganador }); }
  }

  /* ---------------------------------------------------------------- consultas para la interfaz */

  // lo que hay bajo el puntero, según lo que ve el jugador
  entEn(x, z, jug) {
    let mejor = null, md = 0.75;
    for (const u of this.cercanas(x, z, 2)) {
      if (u.dueño !== jug && !this.visible(jug, u.x, u.z)) continue;
      const d = Math.hypot(u.x - x, u.z - z) - u.radio;
      if (d < md) { md = d; mejor = u; }
    }
    if (mejor) return mejor;
    const tx = Math.floor(x), tz = Math.floor(z);
    if (!this.dentro(tx, tz)) return null;
    const id = this.ocupa[tz * this.N + tx];
    if (id >= 0) { const e = this.ents.get(id); if (e && (e.dueño === jug || this.explorado(jug, x, z))) return e; }
    return null;
  }
}
