// Interfaz en pantalla: recursos, minimapa, panel de selección y grilla de comandos.
// La grilla se arma según lo seleccionado; cada botón tiene tecla fija por posición (Q W E R / A S D F / Z X C V).

import { UNIDADES, EDIFICIOS, MINA, POB_MAX, NIVELES, INVESTIGACIONES } from "../datos.js";
import { config, nombreTecla } from "../config.js";
// la tecla de cada posición de la grilla sale de la configuración (se puede reasignar)
const teclaGrilla = i => config.valor.teclas.grilla[i];
import { ARBOL, ROCA, AGUA } from "../sim/mapa.js";

const JUGADOR = 0;
const ICONOS = {
  mover: '<svg viewBox="0 0 24 24"><path d="M4 12h13M12 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  detener: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/></svg>',
  mantener: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>',
  atacar: '<svg viewBox="0 0 24 24"><path d="M5 19L17 7M14 4h6v6M7 15l2 2M4 20l3-1-2-2z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  construir: '<svg viewBox="0 0 24 24"><path d="M14 6l4 4M3 21l9-9M12.5 4.5l7 7-2.5 2.5-7-7z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  volver: '<svg viewBox="0 0 24 24"><path d="M10 6l-6 6 6 6M4 12h16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cancelar: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
  reunion: '<svg viewBox="0 0 24 24"><path d="M6 21V4M6 4h11l-2.5 4L17 12H6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>',
  girar: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};
const DIBUJO = {
  espada: '<path d="M44 12l8 0 0 8-24 24-8-8z M18 34l12 12-4 4-5-2-8 8-4-4 8-8-2-5z" fill="#e8e2d4"/>',
  flecha: '<path d="M12 52L46 18M40 14h10v10M16 44l-6 2 2-6M20 50l-6 2 2-6" stroke="#e8e2d4" stroke-width="4.5" fill="none" stroke-linecap="round"/>',
  escudo: '<path d="M32 10l18 6v14c0 12-8 20-18 24-10-4-18-12-18-24V16z" fill="#e8e2d4"/><path d="M32 16v32c-7-3-12-9-12-18V20z" fill="#9aa3ad"/>',
  corona: '<path d="M12 44l4-24 10 12 6-16 6 16 10-12 4 24z" fill="#f2c14e"/><rect x="12" y="44" width="40" height="6" fill="#f2c14e"/>'
};
// ícono cuadrado con fondo de pergamino oscuro y un grado (I, II, 2, 3) en la esquina
function iconoSVG(dibujo, grado) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="f" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="#3b3326"/><stop offset="1" stop-color="#14110c"/></radialGradient></defs><rect width="64" height="64" fill="url(#f)"/>${DIBUJO[dibujo]}${grado ? `<text x="58" y="58" text-anchor="end" font-family="Georgia,serif" font-weight="700" font-size="17" fill="#f5d68f" stroke="#000" stroke-width="3" paint-order="stroke">${grado}</text>` : ""}</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
// qué destraba cada nivel (para el botón de mejora y el aviso)
export function destrabesDe(nivel) {
  const n = [];
  for (const d of [...Object.values(EDIFICIOS), ...Object.values(UNIDADES)]) if (d.nivel === nivel) n.push(d.nombre);
  const inv = Object.values(INVESTIGACIONES).filter(d => d.nivel === nivel).length;
  if (inv) n.push(`${inv} investigaciones`);
  return n;
}

const RECURSO_SVG = {
  oro: '<svg viewBox="0 0 24 24"><path d="M4 15l3-6h10l3 6-8 4z" fill="#f2c14e"/><path d="M7 9l5 3 5-3M12 12v7" fill="none" stroke="#9a6b12" stroke-width="1.2"/></svg>',
  madera: '<svg viewBox="0 0 24 24"><rect x="3" y="9" width="18" height="6" rx="3" fill="#a5713f"/><circle cx="20" cy="12" r="3" fill="#e2b77a"/><circle cx="20" cy="12" r="1.3" fill="#a5713f"/></svg>',
  pob: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" fill="#cfd8e3"/><path d="M4 21c0-5 3.5-7 8-7s8 2 8 7z" fill="#cfd8e3"/></svg>'
};

export class HUD {
  constructor(raiz, mundo, retratos, acciones) {
    this.m = mundo; this.retratos = retratos; this.acc = acciones;
    this.menu = "base";          // "base" o "construir" (submenú de peones)
    raiz.innerHTML = `
      <div class="sup">
        <div class="recursos">
          <div class="rec" id="r-oro" title="Oro">${RECURSO_SVG.oro}<b>0</b></div>
          <div class="rec" id="r-madera" title="Madera">${RECURSO_SVG.madera}<b>0</b></div>
          <div class="rec" id="r-pob" title="Población (comida)">${RECURSO_SVG.pob}<b>0/0</b></div>
          <div class="nivel-reino" id="r-nivel" title="Nivel del reino: se sube desde el castillo">Aldea</div>
        </div>
        <div class="reloj" id="reloj">00:00</div>
        <button class="btn-menu" id="btn-menu" title="Menú (F10)">Menú</button>
      </div>
      <div class="avisos" id="avisos" aria-live="polite"></div>
      <div class="inf">
        <div class="minimapa marco"><canvas id="minimapa"></canvas>
          <div class="giro"><button data-giro="1" title="Girar a la izquierda (Ctrl+←)">⟲</button><button data-giro="0" title="Volver al norte (N)" id="brujula">N</button><button data-giro="-1" title="Girar a la derecha (Ctrl+→)">⟳</button></div></div>
        <div class="info marco" id="info"></div>
        <div class="comandos marco" id="comandos"></div>
      </div>
      <div class="tip" id="tip" hidden></div>`;
    this.$ = s => raiz.querySelector(s);
    this.tip = this.$("#tip");
    this.mini = new Minimapa(this.$("#minimapa"), mundo, acciones);
    this.$("#btn-menu").addEventListener("click", () => acciones.menu());
    this.$(".giro").addEventListener("click", e => { const b = e.target.closest("[data-giro]"); if (b) acciones.rotar(+b.dataset.giro); });
    this.$("#comandos").addEventListener("click", e => { const b = e.target.closest("button[data-i]"); if (b && !b.disabled) this.ejecutar(+b.dataset.i); });
    this.$("#comandos").addEventListener("pointerover", e => { const b = e.target.closest("button[data-i]"); if (b) this.mostrarTip(b); });
    this.$("#comandos").addEventListener("pointerleave", () => this.tip.hidden = true);
    this.$("#info").addEventListener("click", e => {
      const c = e.target.closest("[data-sel]"); if (c) acciones.seleccionar([+c.dataset.sel], e.shiftKey ? "quitar" : "solo");
      const q = e.target.closest("[data-cola]"); if (q) acciones.ordenar({ tipo: "cancelar", id: +q.dataset.ed, indice: +q.dataset.cola });
    });
    this.firma = ""; this.botones = [];
  }

  /* ---------------------------------------------------------------- por cuadro */

  actualizar(seleccion) {
    const J = this.m.jugadores[JUGADOR];
    this.$("#r-oro b").textContent = Math.floor(J.oro);
    this.$("#r-madera b").textContent = Math.floor(J.madera);
    const pob = this.$("#r-pob b"); pob.textContent = `${J.pob}/${J.pobMax}`;
    const nv = this.m.nivelDe(JUGADOR); this.$("#r-nivel").textContent = `${NIVELES[nv].nombre} · ${nv}`;
    pob.classList.toggle("lleno", J.pob >= J.pobMax);
    const t = Math.floor(this.m.tiempo); this.$("#reloj").textContent = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
    this.pintarInfo(seleccion);
    this.pintarComandos(seleccion);
    this.mini.dibujar();
    // la «N» de la brújula gira con la cámara: siempre apunta al norte del mapa
    this.$("#brujula").style.transform = `rotate(${this.acc.ctx.cam.giro}rad)`;
  }

  aviso(texto, tipo = "") {
    const d = document.createElement("div"); d.className = "aviso " + tipo; d.textContent = texto;
    const c = this.$("#avisos"); c.prepend(d);
    while (c.children.length > 3) c.lastChild.remove();
    setTimeout(() => { d.classList.add("sale"); setTimeout(() => d.remove(), 400); }, 2600);
  }

  /* ---------------------------------------------------------------- panel de selección */

  pintarInfo(sel) {
    const info = this.$("#info");
    const ents = sel.map(id => this.m.ents.get(id)).filter(Boolean);
    // sólo se reconstruye si cambió la composición; los números se actualizan in situ
    const firma = ents.map(e => e.id + (e.completo === false ? "o" : "") + (e.cola ? e.cola.join() : "") + (e.nivel || "")).join(",");
    if (firma !== this.firmaInfo) {
      this.firmaInfo = firma;
      if (!ents.length) info.innerHTML = `<div class="vacio">Seleccioná unidades o edificios.<br><small>Clic izquierdo para elegir, clic derecho para dar órdenes.</small></div>`;
      else if (ents.length === 1) info.innerHTML = this.fichaUna(ents[0]);
      else info.innerHTML = `<div class="grupo">${ents.slice(0, 24).map(e => `<button class="mini-ret" data-sel="${e.id}" title="${this.nombre(e)}"><img src="${this.retratos[e.tipo]}" alt=""><i><b></b></i></button>`).join("")}</div>${ents.length > 24 ? `<div class="mas">+${ents.length - 24}</div>` : ""}`;
    }
    // vida y progreso en vivo
    if (ents.length === 1) {
      const e = ents[0], f = Math.max(0, e.vida / e.vidaMax);
      const b = info.querySelector(".vida i"); if (b) { b.style.width = f * 100 + "%"; b.className = f > 0.5 ? "" : f > 0.25 ? "medio" : "bajo"; }
      const tv = info.querySelector(".vida-n"); if (tv) tv.textContent = e.clase === "mina" ? `${Math.floor(e.oro)} de oro` : `${Math.ceil(Math.max(0, e.vida))} / ${e.vidaMax}`;
      const pr = info.querySelector(".prog i");
      if (pr) pr.style.width = (e.completo === false ? e.progreso : e.cola?.length ? e.colaT / this.m.itemCola(e, e.cola[0]).tiempo : 0) * 100 + "%";
      const est = info.querySelector(".estado"); if (est) est.textContent = this.estado(e);
    } else {
      info.querySelectorAll(".mini-ret").forEach(b => { const e = this.m.ents.get(+b.dataset.sel); if (e) b.querySelector("b").style.width = Math.max(0, e.vida / e.vidaMax) * 100 + "%"; });
    }
  }

  // nombre e imagen de lo que hay en una cola (tropa, investigación o mejora de nivel)
  textoCola(e, item) {
    if (item === "nivel") return `Mejorando a ${NIVELES[e.nivel + 1].nombre}`;
    if (item.startsWith("inv:")) return `Investigando: ${INVESTIGACIONES[item.slice(4)].nombre}`;
    return `Entrenando: ${UNIDADES[item].nombre}`;
  }
  imagen(e, item) {
    if (item === "nivel") return iconoSVG("corona", String(e.nivel + 1));
    if (item.startsWith("inv:")) { const d = INVESTIGACIONES[item.slice(4)]; return iconoSVG(d.icono, d.grado); }
    return this.retratos[item];
  }

  nombre(e) { return e.clase === "mina" ? MINA.nombre : (UNIDADES[e.tipo] || EDIFICIOS[e.tipo]).nombre; }

  estado(e) {
    if (e.clase === "mina") return "Recurso neutral";
    if (e.dueño !== JUGADOR) return e.dueño >= 0 ? this.m.jugadores[e.dueño].nombre : "";
    if (e.clase === "edificio") return !e.completo ? (this.m.constructores(e.id) ? `En obra · ${Math.floor(e.progreso * 100)}%` : `Obra parada · ${Math.floor(e.progreso * 100)}% — mandá un peón con clic derecho`) : e.cola.length ? this.textoCola(e, e.cola[0]) : "Listo";
    const o = e.orden;
    if (e.oculto) return "Adentro de la mina";
    if (!o) return "Esperando órdenes";
    return { mover: o.ataque ? "Avanzando al ataque" : "Moviéndose", atacar: "Atacando", mantener: "Manteniendo posición", construir: "Construyendo",
      recolectar: o.recurso === "oro" ? (o.fase === "volver" ? "Llevando oro" : "Juntando oro") : (o.fase === "volver" ? "Llevando madera" : "Talando") }[o.tipo] || "";
  }

  fichaUna(e) {
    const d = UNIDADES[e.tipo] || EDIFICIOS[e.tipo] || MINA;
    const atk = d.ataque, st = [];
    if (atk) st.push(["Daño", atk.danio], ["Alcance", atk.rango < 1 ? "Cuerpo a cuerpo" : atk.rango]);
    if (d.armadura != null) st.push(["Armadura", d.armadura]);
    if (d.velocidad) st.push(["Velocidad", d.velocidad]);
    if (d.pobDa && e.completo) st.push(["Comida", "+" + (d.pobDa + (e.nivel > 1 ? NIVELES[e.nivel].pobExtra : 0))]);
    if (e.tipo === "castillo") st.unshift(["Nivel", NIVELES[e.nivel].nombre]);
    const cola = e.clase === "edificio" && e.dueño === JUGADOR && e.cola.length ? `<div class="cola">${e.cola.map((t, i) => `<button data-cola="${i}" data-ed="${e.id}" title="Cancelar: ${this.textoCola(e, t)}"><img src="${this.imagen(e, t)}" alt="">${i === 0 ? '<span class="prog"><i></i></span>' : ""}</button>`).join("")}</div>` : "";
    return `<div class="una">
      <img class="retrato" src="${this.retratos[e.tipo]}" alt="">
      <div class="datos">
        <div class="nombre">${d.nombre}</div>
        <div class="estado"></div>
        <div class="vida"><i></i></div><div class="vida-n"></div>
        ${e.completo === false ? '<div class="prog obra"><i></i></div>' : ""}
        <div class="stats">${st.map(([k, v]) => `<span><small>${k}</small>${v}</span>`).join("")}</div>
        ${e.dueño === JUGADOR && d.desc && !cola ? `<p class="desc">${d.desc}</p>` : ""}
      </div>
      ${cola}
    </div>`;
  }

  /* ---------------------------------------------------------------- grilla de comandos */

  comandosPara(sel) {
    const ents = sel.map(id => this.m.ents.get(id)).filter(e => e && e.dueño === JUGADOR);
    const g = new Array(12).fill(null);
    if (!ents.length) return g;
    const unidades = ents.filter(e => e.clase === "unidad");
    if (unidades.length) {
      const peones = unidades.filter(u => UNIDADES[u.tipo].construye);
      if (this.menu === "construir" && peones.length) {
        ["granja", "cuartel", "herreria", "torre", "barricada", "muralla", "castillo"].forEach((t, i) => {
          const d = EDIFICIOS[t];
          g[i] = { tipo: "construir", edificio: t, img: this.retratos[t], titulo: d.nombre, costo: d.costo, desc: d.desc, requisito: this.m.bloqueo(JUGADOR, d) };
        });
        g[11] = { tipo: "volver", svg: ICONOS.volver, titulo: "Volver" };
        return g;
      }
      g[0] = { tipo: "mover", svg: ICONOS.mover, titulo: "Mover", desc: "Clic en el mapa. (Clic derecho hace lo mismo.)" };
      g[1] = { tipo: "detener", svg: ICONOS.detener, titulo: "Detener" };
      g[2] = { tipo: "mantener", svg: ICONOS.mantener, titulo: "Mantener posición", desc: "Atacan lo que entre en su alcance, pero no persiguen." };
      g[4] = { tipo: "atacar", svg: ICONOS.atacar, titulo: "Atacar", desc: "Clic en un enemigo, o en el suelo para avanzar atacando todo lo que encuentren." };
      if (peones.length) g[8] = { tipo: "submenu", svg: ICONOS.construir, titulo: "Construir", desc: "Elegí qué edificio levantar." };
      return g;
    }
    const tipo = ents[0].tipo;
    if (ents.every(e => e.clase === "edificio" && e.tipo === tipo)) {
      const e = ents[0], d = EDIFICIOS[tipo];
      g[10] = { tipo: "girar", svg: ICONOS.girar, titulo: "Girar 90°", desc: `Cambia hacia dónde mira el edificio. Al ubicarlo: apretá el clic izquierdo, arrastrá hacia donde querés la fachada y soltá (o tecla ${nombreTecla(config.valor.teclas.girarEdificio)}).` };
      if (!e.completo) { g[11] = { tipo: "cancelar", svg: ICONOS.cancelar, titulo: "Cancelar obra", desc: "Devuelve el 75 % de lo invertido." }; return g; }
      (d.entrena || []).forEach((t, i) => {
        const u = UNIDADES[t];
        g[i] = { tipo: "entrenar", unidad: t, img: this.retratos[t], titulo: u.nombre, costo: u.costo, pob: u.pob, desc: u.desc, requisito: this.m.bloqueo(JUGADOR, u) };
      });
      // castillo: subir el reino de nivel
      if (d.mejora) {
        const sig = NIVELES[e.nivel + 1];
        if (sig) {
          const falta = sig.requiere && !this.m.edificiosDe(JUGADOR).some(b => b.tipo === sig.requiere && b.completo);
          g[4] = { tipo: "mejorar", img: iconoSVG("corona", String(e.nivel + 1)), titulo: `Mejorar a ${sig.nombre}`, costo: sig.costo,
            desc: `Más vida y comida para el castillo. Destraba: ${destrabesDe(e.nivel + 1).join(", ")}.`,
            requisito: e.cola.includes("nivel") ? "La mejora ya está en marcha." : falta ? `Requiere una ${EDIFICIOS[sig.requiere].nombre.toLowerCase()} terminada.` : null };
        }
      }
      // herrería: investigaciones (I arriba, II abajo)
      if (d.investiga) {
        const J = this.m.jugadores[JUGADOR];
        ["armas1", "flechas1", "armadura1", null, "armas2", "flechas2", "armadura2"].forEach((k, i) => {
          if (!k) return;
          const inv = INVESTIGACIONES[k];
          const req = J.investigado.has(k) ? "Ya investigada." : J.enCurso.has(k) ? "En curso." : this.m.bloqueo(JUGADOR, inv);
          g[i] = { tipo: "investigar", inv: k, img: iconoSVG(inv.icono, inv.grado), titulo: inv.nombre, costo: J.investigado.has(k) ? null : inv.costo, desc: inv.desc, requisito: req, hecha: J.investigado.has(k) };
        });
      }
      if (d.entrena) g[7] = { tipo: "reunion", svg: ICONOS.reunion, titulo: "Punto de reunión", desc: "Clic en el mapa: ahí van las unidades nuevas. Sobre una mina o un árbol, los peones se ponen a trabajar." };
      if (e.cola.length) g[11] = { tipo: "cancelar", svg: ICONOS.cancelar, titulo: "Cancelar el último de la cola", desc: "Devuelve lo gastado." };
    }
    return g;
  }

  pintarComandos(sel) {
    const g = this.comandosPara(sel);
    const J = this.m.jugadores[JUGADOR];
    const firma = g.map(c => c ? c.tipo + (c.edificio || c.unidad || c.inv || "") + (c.requisito || "") : "_").join("|") + this.acc.modo() + config.valor.teclas.grilla.join("");
    const cont = this.$("#comandos");
    if (firma !== this.firma) {
      this.firma = firma; this.botones = g;
      cont.innerHTML = g.map((c, i) => c
        ? `<button data-i="${i}" class="${this.acc.modo() === c.tipo ? "activo" : ""}"><span class="ico">${c.img ? `<img src="${c.img}" alt="">` : c.svg}</span><kbd>${nombreTecla(teclaGrilla(i))}</kbd>${c.costo ? '<span class="falta"></span>' : ""}</button>`
        : `<span class="vacia"></span>`).join("");
    }
    // ¿alcanza? (se recalcula cada cuadro sin rearmar el DOM)
    cont.querySelectorAll("button[data-i]").forEach(b => {
      const c = g[+b.dataset.i]; if (!c) return;
      const sinPlata = c.costo && (J.oro < c.costo.oro || J.madera < c.costo.madera);
      const sinComida = c.pob && J.pob + c.pob > J.pobMax;
      b.disabled = !!c.requisito;
      b.classList.toggle("hecha", !!c.hecha);
      b.classList.toggle("caro", !!(sinPlata || sinComida));
    });
  }

  mostrarTip(b) {
    const c = this.botones[+b.dataset.i]; if (!c) return;
    const J = this.m.jugadores[JUGADOR];
    const costo = c.costo ? `<div class="costo">${c.costo.oro ? `<span class="${J.oro < c.costo.oro ? "no" : ""}">${RECURSO_SVG.oro}${c.costo.oro}</span>` : ""}${c.costo.madera ? `<span class="${J.madera < c.costo.madera ? "no" : ""}">${RECURSO_SVG.madera}${c.costo.madera}</span>` : ""}${c.pob ? `<span class="${J.pob + c.pob > J.pobMax ? "no" : ""}">${RECURSO_SVG.pob}${c.pob}</span>` : ""}</div>` : "";
    this.tip.innerHTML = `<b>${c.titulo}</b> <kbd>${nombreTecla(teclaGrilla(+b.dataset.i))}</kbd>${costo}${c.requisito ? `<p class="no">${c.requisito}</p>` : ""}${c.desc ? `<p>${c.desc}</p>` : ""}`;
    const r = b.getBoundingClientRect();
    this.tip.hidden = false;
    this.tip.style.left = Math.min(window.innerWidth - 300, r.left) + "px";
    this.tip.style.bottom = window.innerHeight - r.top + 10 + "px";
  }

  // tecla de la grilla o clic en el botón
  ejecutar(i) {
    const c = this.botones[i]; if (!c) return false;
    if (c.tipo === "submenu") { this.menu = "construir"; this.firma = ""; return true; }
    if (c.tipo === "volver") { this.menu = "base"; this.firma = ""; return true; }
    if (c.requisito) { this.aviso(c.requisito, "error"); return true; }
    this.acc.comando(c);
    return true;
  }
  tecla(k) { const i = config.valor.teclas.grilla.indexOf(k); return i >= 0 ? this.ejecutar(i) : false; }
}

/* ================================================================ minimapa */

class Minimapa {
  constructor(lienzo, mundo, acciones) {
    this.c = lienzo; this.m = mundo; this.acc = acciones;
    const N = mundo.N, esc = 2;
    lienzo.width = lienzo.height = N * esc; this.esc = esc;
    this.ctx = lienzo.getContext("2d");
    this.base = document.createElement("canvas"); this.base.width = this.base.height = N;
    this.niebla = document.createElement("canvas"); this.niebla.width = this.niebla.height = N;
    this.pintarBase();
    this.cuadro = 0;
    const llevar = e => {
      const r = lienzo.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width * N, z: (e.clientY - r.top) / r.height * N };
    };
    let arrastrando = false;
    lienzo.addEventListener("pointerdown", e => {
      e.preventDefault(); e.stopPropagation();
      const p = llevar(e);
      if (e.button === 2) { acciones.ordenMapa(p.x, p.z); return; }
      if (e.button === 0) { arrastrando = true; lienzo.setPointerCapture(e.pointerId); acciones.centrar(p.x, p.z); }
    });
    lienzo.addEventListener("pointermove", e => { if (arrastrando) { const p = llevar(e); acciones.centrar(p.x, p.z); } });
    lienzo.addEventListener("pointerup", () => arrastrando = false);
    lienzo.addEventListener("contextmenu", e => e.preventDefault());
  }

  pintarBase() {
    const N = this.m.N, mapa = this.m.mapa, ctx = this.base.getContext("2d"), img = ctx.createImageData(N, N);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x, t = mapa.tipo[i], h = mapa.alturaEn(x + 0.5, z + 0.5);
      let c = t === ARBOL ? [34, 66, 36] : t === ROCA ? [118, 116, 110] : t === AGUA ? [34, 72, 92] : [86, 118, 54];
      const k = 0.85 + h * 0.12;
      img.data.set([c[0] * k, c[1] * k, c[2] * k, 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
    this.sucio = false;
  }
  marcarSucio() { this.sucio = true; }

  dibujar() {
    if (++this.cuadro % 3) return;          // a ~20 cuadros por segundo alcanza
    if (this.sucio) this.pintarBase();
    const N = this.m.N, ctx = this.ctx, esc = this.esc;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base, 0, 0, N * esc, N * esc);
    // entidades
    for (const e of this.m.ents.values()) {
      if (e.clase === "mina") { if (!this.m.explorado(JUGADOR, e.x, e.z)) continue; ctx.fillStyle = "#ffd34d"; ctx.fillRect(e.tx * esc, e.tz * esc, e.lado * esc, e.lado * esc); continue; }
      if (e.dueño !== JUGADOR && (e.clase === "unidad" ? !this.m.visible(JUGADOR, e.x, e.z) : !this.m.explorado(JUGADOR, e.x, e.z))) continue;
      ctx.fillStyle = this.m.jugadores[e.dueño].color;
      if (e.clase === "edificio") { ctx.fillRect(e.tx * esc, e.tz * esc, e.lado * esc, e.lado * esc); ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.strokeRect(e.tx * esc + 0.5, e.tz * esc + 0.5, e.lado * esc - 1, e.lado * esc - 1); }
      else if (!e.oculto) ctx.fillRect(e.x * esc - 1.5, e.z * esc - 1.5, 3, 3);
    }
    // niebla
    const vis = this.m.jugadores[JUGADOR].vis, nctx = this.niebla.getContext("2d"), img = nctx.createImageData(N, N);
    for (let i = 0; i < vis.length; i++) img.data[i * 4 + 3] = vis[i] === 2 ? 0 : vis[i] === 1 ? 120 : 245;
    nctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.niebla, 0, 0, N * esc, N * esc);
    // lo que muestra la cámara
    const q = this.acc.vistaEnSuelo();
    if (q) {
      ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 1.5; ctx.beginPath();
      q.forEach((p, i) => ctx[i ? "lineTo" : "moveTo"](p.x * esc, p.z * esc)); ctx.closePath(); ctx.stroke();
    }
    // avisos de ataque
    const t = performance.now() / 1000;
    for (const a of this.acc.alertas()) {
      const f = (t - a.t) % 1; ctx.strokeStyle = a.oro ? `rgba(255,214,90,${1 - f})` : `rgba(255,70,70,${1 - f})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(a.x * esc, a.z * esc, 4 + f * 14, 0, Math.PI * 2); ctx.stroke();
    }
  }
}

export { POB_MAX };
