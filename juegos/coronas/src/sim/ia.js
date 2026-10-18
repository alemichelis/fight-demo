// IA rival. Da órdenes con la misma API que la persona (mundo.ordenar), una vez por segundo.
// Plan: economía (peones a oro y madera) → granjas a tiempo → cuartel, torre y herrería → ejército → oleadas.
// La dificultad cambia el ritmo de juntar recursos, el tamaño de las oleadas y cuándo ataca por primera vez.

import { UNIDADES, EDIFICIOS, POB_MAX, DIFICULTADES, INVESTIGACIONES } from "../datos.js";

export class IA {
  constructor(mundo, jug, dificultad = "normal") {
    this.m = mundo; this.j = jug;
    this.d = DIFICULTADES[dificultad] || DIFICULTADES.normal;
    mundo.jugadores[jug].bonus = this.d.ritmo;
    this.umbral = this.d.ejercito;
    this.atacando = false;
    this.oleadas = 0;
  }

  pensar() {
    const m = this.m, J = m.jugadores[this.j];
    if (J.derrotado || m.ganador >= 0 || (m.tick + this.j * 7) % 20 !== 0) return;
    const unidades = m.unidadesDe(this.j), edificios = m.edificiosDe(this.j);
    const peones = unidades.filter(u => UNIDADES[u.tipo].recolecta);
    const ejercito = unidades.filter(u => !UNIDADES[u.tipo].recolecta);
    const castillo = edificios.find(e => e.tipo === "castillo" && e.completo);
    const cuenta = t => edificios.filter(e => e.tipo === t).length;
    const enObra = t => edificios.some(e => e.tipo === t && !e.completo);

    // ---- economía
    if (castillo) {
      const ocupadoOro = peones.filter(u => u.orden?.tipo === "recolectar" && u.orden.recurso === "oro").length;
      for (const u of peones) {
        if (u.orden) continue;
        const aOro = ocupadoOro < Math.ceil(peones.length * 0.6);
        const mina = m.minaCercana(castillo.x, castillo.z, 18);
        if (aOro && mina) { m.ordenar(this.j, { tipo: "recolectar", ids: [u.id], mina: mina.id }); continue; }
        const a = m.arbolCercano(castillo.x, castillo.z, 22);
        if (a) m.ordenar(this.j, { tipo: "recolectar", ids: [u.id], x: a.x, z: a.z });
        else if (mina) m.ordenar(this.j, { tipo: "recolectar", ids: [u.id], mina: mina.id });
      }
      if (peones.length < this.d.peones && castillo.cola.length < 2) m.ordenar(this.j, { tipo: "entrenar", id: castillo.id, unidad: "peon" });
    } else if (peones.length && !enObra("castillo")) {
      this.construir("castillo", peones, J);                 // perdió el castillo: intenta otro
    }

    // ---- comida
    const colchon = Math.max(3, Math.floor(J.pobMax * 0.15));
    if (J.pob >= J.pobMax - colchon && J.pobMax < POB_MAX && !enObra("granja")) this.construir("granja", peones, J);

    // ---- edificios militares
    const t = m.tiempo;
    if (cuenta("cuartel") === 0 && peones.length >= 7) this.construir("cuartel", peones, J);
    else if (cuenta("cuartel") === 1 && (t > 360 / this.d.ritmo || J.oro > 650) && !enObra("cuartel")) this.construir("cuartel", peones, J);
    const nivel = m.nivelDe(this.j);
    if (nivel >= 2 && cuenta("cuartel") && cuenta("torre") < 1 + (t > 600 ? 1 : 0) && !enObra("torre")) this.construir("torre", peones, J);
    if (nivel >= 2 && cuenta("cuartel") && !cuenta("herreria")) this.construir("herreria", peones, J);

    // ---- subir de nivel: Fortaleza con el primer cuartel en pie, Ciudadela con la herrería
    const herreriaLista = edificios.some(e => e.tipo === "herreria" && e.completo);
    if (castillo && !castillo.cola.includes("nivel")) {
      if (castillo.nivel === 1 && cuenta("cuartel") && t > 200 / this.d.ritmo) m.ordenar(this.j, { tipo: "mejorar", id: castillo.id });
      else if (castillo.nivel === 2 && herreriaLista && t > 420 / this.d.ritmo) m.ordenar(this.j, { tipo: "mejorar", id: castillo.id });
    }
    // ---- investigaciones: una por vez, primero armadura (es la que más rinde)
    for (const h of edificios.filter(e => e.tipo === "herreria" && e.completo && e.cola.length === 0)) {
      const k = ["armadura1", "armas1", "flechas1", "armadura2", "armas2", "flechas2"]
        .find(k => !J.investigado.has(k) && !J.enCurso.has(k) && !m.bloqueo(this.j, INVESTIGACIONES[k]));
      if (k) m.ordenar(this.j, { tipo: "investigar", id: h.id, inv: k });
    }

    // ---- ejército
    const herreria = edificios.some(e => e.tipo === "herreria" && e.completo);
    for (const c of edificios.filter(e => e.tipo === "cuartel" && e.completo && e.cola.length < 2)) {
      const r = m.azar.sig();
      const tipo = nivel >= 3 && r < 0.12 ? "catapulta" : herreria && nivel >= 2 && r < 0.3 ? "caballero" : r < 0.62 ? "soldado" : "arquero";
      m.ordenar(this.j, { tipo: "entrenar", id: c.id, unidad: tipo });
    }

    // ---- defensa: si hay enemigos cerca de la base, todo el ejército va
    const amenaza = this.amenaza(edificios);
    if (amenaza) {
      const libres = ejercito.filter(u => !u.orden || u.orden.tipo === "mover");
      if (libres.length) m.ordenar(this.j, { tipo: "mover", ids: libres.map(u => u.id), x: amenaza.x, z: amenaza.z, ataque: true });
      return;
    }

    // ---- ataque por oleadas
    if (!this.atacando && ejercito.length >= this.umbral && t >= this.d.primerAtaque) { this.atacando = true; this.oleadas++; }
    if (this.atacando) {
      if (ejercito.length <= Math.max(1, Math.floor(this.umbral * 0.25))) { this.atacando = false; this.umbral += 2; return; }
      const objetivo = this.objetivo(ejercito);
      if (!objetivo) return;
      const ociosos = ejercito.filter(u => !u.orden || (u.orden.tipo === "mover" && !u.orden.ataque));
      if (ociosos.length) m.ordenar(this.j, { tipo: "mover", ids: ociosos.map(u => u.id), x: objetivo.x, z: objetivo.z, ataque: true });
    } else if (castillo) {
      // esperando la oleada: el ejército se junta delante del castillo, mirando al enemigo
      const enemigo = m.jugadores.find(o => o.id !== this.j && !o.derrotado);
      const base = enemigo ? m.mapa.bases[enemigo.id] : null;
      const ociosos = ejercito.filter(u => !u.orden);
      if (ociosos.length && base) {
        const dx = base.x - castillo.x, dz = base.z - castillo.z, d = Math.hypot(dx, dz) || 1;
        const px = castillo.x + dx / d * 9, pz = castillo.z + dz / d * 9;
        if (ociosos.some(u => Math.hypot(u.x - px, u.z - pz) > 4)) m.ordenar(this.j, { tipo: "mover", ids: ociosos.map(u => u.id), x: px, z: pz });
      }
    }
  }

  amenaza(edificios) {
    for (const e of edificios) {
      for (const u of this.m.cercanas(e.x, e.z, 13)) if (this.m.enemigos(this.j, u.dueño) && !u.oculto) return u;
    }
    return null;
  }

  objetivo(ejercito) {
    const cx = ejercito.reduce((s, u) => s + u.x, 0) / ejercito.length, cz = ejercito.reduce((s, u) => s + u.z, 0) / ejercito.length;
    let mejor = null, md = Infinity;
    for (const e of this.m.ents.values()) {
      if (e.clase !== "edificio" || !this.m.enemigos(this.j, e.dueño) || EDIFICIOS[e.tipo].muro) continue;
      const d = Math.hypot(e.x - cx, e.z - cz) - (e.tipo === "torre" ? -6 : 0);   // las torres, al final
      if (d < md) { md = d; mejor = e; }
    }
    if (mejor) return mejor;
    for (const e of this.m.ents.values()) if (e.clase === "unidad" && this.m.enemigos(this.j, e.dueño)) return e;
    return null;
  }

  // Busca lugar alrededor del castillo (con un pasillo libre alrededor, lejos de la mina) y manda a un peón.
  construir(tipo, peones, J) {
    const m = this.m, d = EDIFICIOS[tipo];
    if (J.oro < d.costo.oro || J.madera < d.costo.madera || !peones.length) return false;
    const base = m.edificiosDe(this.j).find(e => e.tipo === "castillo") || peones[0];
    const lugar = tipo === "castillo" ? this.lugarCastillo(peones[0]) : this.lugarCerca(base.x, base.z, d.lado, tipo === "torre" ? 8 : 5);
    if (!lugar) return false;
    const peon = peones.find(u => u.orden?.recurso === "madera" && !u.carga) || peones.find(u => !u.oculto && u.orden?.tipo !== "construir") || peones[0];
    return m.ordenar(this.j, { tipo: "construir", ids: [peon.id], edificio: tipo, tx: lugar.x, tz: lugar.z }).ok;
  }

  lugarCerca(cx, cz, lado, rMin) {
    const m = this.m, ang0 = m.azar.sig() * Math.PI * 2;
    for (let r = rMin; r < rMin + 12; r++) {
      const pasos = Math.max(8, Math.floor(r * 4));
      for (let k = 0; k < pasos; k++) {
        const a = ang0 + k / pasos * Math.PI * 2;
        const tx = Math.round(cx + Math.cos(a) * r - lado / 2), tz = Math.round(cz + Math.sin(a) * r - lado / 2);
        if (this.libreConMargen(tx, tz, lado) && !this.cercaDeMina(tx, tz, lado, 3) && !this.enCorredor(cx, cz, tx, tz, lado)) return { x: tx, z: tz };
      }
    }
    return null;
  }

  lugarCastillo(peon) {
    const mina = this.m.minaCercana(peon.x, peon.z, 60);
    if (!mina) return this.lugarCerca(peon.x, peon.z, 4, 2);
    for (let r = 6; r < 12; r++) for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2, tx = Math.round(mina.x + Math.cos(a) * r - 2), tz = Math.round(mina.z + Math.sin(a) * r - 2);
      if (this.libreConMargen(tx, tz, 4) && !this.m.motivoNoConstruir(this.j, "castillo", tx, tz)) return { x: tx, z: tz };
    }
    return null;
  }

  libreConMargen(tx, tz, lado) {
    for (let z = tz - 1; z <= tz + lado; z++) for (let x = tx - 1; x <= tx + lado; x++) if (this.m.bloqueado(x, z)) return false;
    return true;
  }

  // ¿el edificio quedaría en el camino entre el castillo y una mina cercana? (los peones pasan por ahí todo el tiempo)
  enCorredor(cx, cz, tx, tz, lado) {
    const bx = tx + lado / 2, bz = tz + lado / 2;
    for (const e of this.m.ents.values()) {
      if (e.clase !== "mina" || Math.hypot(e.x - cx, e.z - cz) > 20) continue;
      const vx = e.x - cx, vz = e.z - cz, L2 = vx * vx + vz * vz;
      const t = Math.max(0, Math.min(1, ((bx - cx) * vx + (bz - cz) * vz) / L2));
      if (Math.hypot(cx + vx * t - bx, cz + vz * t - bz) < lado / 2 + 2.2) return true;
    }
    return false;
  }

  cercaDeMina(tx, tz, lado, margen) {
    for (const e of this.m.ents.values()) {
      if (e.clase !== "mina") continue;
      const dx = Math.max(e.tx - (tx + lado), tx - (e.tx + e.lado), 0), dz = Math.max(e.tz - (tz + lado), tz - (e.tz + e.lado), 0);
      if (Math.max(dx, dz) < margen) return true;
    }
    return false;
  }
}
