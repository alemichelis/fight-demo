// Interfaz en pantalla: recursos, minimapa, panel de selección y grilla de comandos.
// La grilla se arma según lo seleccionado; cada botón tiene tecla fija por posición (Q W E R / A S D F / Z X C V).

import { UNIDADES, EDIFICIOS, MINA, TECLAS_GRILLA, POB_MAX } from "../datos.js";
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
  reunion: '<svg viewBox="0 0 24 24"><path d="M6 21V4M6 4h11l-2.5 4L17 12H6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>'
};
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
        </div>
        <div class="reloj" id="reloj">00:00</div>
        <button class="btn-menu" id="btn-menu" title="Menú (F10)">Menú</button>
      </div>
      <div class="avisos" id="avisos" aria-live="polite"></div>
      <div class="inf">
        <div class="minimapa marco"><canvas id="minimapa"></canvas></div>
        <div class="info marco" id="info"></div>
        <div class="comandos marco" id="comandos"></div>
      </div>
      <div class="tip" id="tip" hidden></div>`;
    this.$ = s => raiz.querySelector(s);
    this.tip = this.$("#tip");
    this.mini = new Minimapa(this.$("#minimapa"), mundo, acciones);
    this.$("#btn-menu").addEventListener("click", () => acciones.menu());
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
    pob.classList.toggle("lleno", J.pob >= J.pobMax);
    const t = Math.floor(this.m.tiempo); this.$("#reloj").textContent = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
    this.pintarInfo(seleccion);
    this.pintarComandos(seleccion);
    this.mini.dibujar();
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
    const firma = ents.map(e => e.id + (e.completo === false ? "o" : "") + (e.cola ? e.cola.join() : "")).join(",");
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
      if (pr) pr.style.width = (e.completo === false ? e.progreso : e.cola?.length ? e.colaT / UNIDADES[e.cola[0]].tiempo : 0) * 100 + "%";
      const est = info.querySelector(".estado"); if (est) est.textContent = this.estado(e);
    } else {
      info.querySelectorAll(".mini-ret").forEach(b => { const e = this.m.ents.get(+b.dataset.sel); if (e) b.querySelector("b").style.width = Math.max(0, e.vida / e.vidaMax) * 100 + "%"; });
    }
  }

  nombre(e) { return e.clase === "mina" ? MINA.nombre : (UNIDADES[e.tipo] || EDIFICIOS[e.tipo]).nombre; }

  estado(e) {
    if (e.clase === "mina") return "Recurso neutral";
    if (e.dueño !== JUGADOR) return e.dueño >= 0 ? this.m.jugadores[e.dueño].nombre : "";
    if (e.clase === "edificio") return !e.completo ? `En obra · ${Math.floor(e.progreso * 100)}%` : e.cola.length ? `Entrenando: ${UNIDADES[e.cola[0]].nombre}` : "Listo";
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
    if (d.pobDa && e.completo) st.push(["Comida", "+" + d.pobDa]);
    const cola = e.clase === "edificio" && e.dueño === JUGADOR && e.cola.length ? `<div class="cola">${e.cola.map((t, i) => `<button data-cola="${i}" data-ed="${e.id}" title="Cancelar ${UNIDADES[t].nombre}"><img src="${this.retratos[t]}" alt="">${i === 0 ? '<span class="prog"><i></i></span>' : ""}</button>`).join("")}</div>` : "";
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
        ["granja", "cuartel", "herreria", "torre", "castillo"].forEach((t, i) => {
          const d = EDIFICIOS[t];
          g[i] = { tipo: "construir", edificio: t, img: this.retratos[t], titulo: d.nombre, costo: d.costo, desc: d.desc };
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
      if (!e.completo) { g[11] = { tipo: "cancelar", svg: ICONOS.cancelar, titulo: "Cancelar obra", desc: "Devuelve el 75 % de lo invertido." }; return g; }
      (d.entrena || []).forEach((t, i) => {
        const u = UNIDADES[t], falta = u.requiere && !this.m.edificiosDe(JUGADOR).some(b => b.tipo === u.requiere && b.completo);
        g[i] = { tipo: "entrenar", unidad: t, img: this.retratos[t], titulo: u.nombre, costo: u.costo, pob: u.pob, desc: u.desc, requisito: falta ? `Requiere ${EDIFICIOS[u.requiere].nombre}` : null };
      });
      if (d.entrena) g[7] = { tipo: "reunion", svg: ICONOS.reunion, titulo: "Punto de reunión", desc: "Clic en el mapa: ahí van las unidades nuevas. Sobre una mina o un árbol, los peones se ponen a trabajar." };
      if (e.cola.length) g[11] = { tipo: "cancelar", svg: ICONOS.cancelar, titulo: "Cancelar entrenamiento", desc: "Cancela el último de la cola y devuelve lo gastado." };
    }
    return g;
  }

  pintarComandos(sel) {
    const g = this.comandosPara(sel);
    const J = this.m.jugadores[JUGADOR];
    const firma = g.map(c => c ? c.tipo + (c.edificio || c.unidad || "") + (c.requisito || "") : "_").join("|") + this.acc.modo();
    const cont = this.$("#comandos");
    if (firma !== this.firma) {
      this.firma = firma; this.botones = g;
      cont.innerHTML = g.map((c, i) => c
        ? `<button data-i="${i}" class="${this.acc.modo() === c.tipo ? "activo" : ""}"><span class="ico">${c.img ? `<img src="${c.img}" alt="">` : c.svg}</span><kbd>${TECLAS_GRILLA[i].toUpperCase()}</kbd>${c.costo ? '<span class="falta"></span>' : ""}</button>`
        : `<span class="vacia"></span>`).join("");
    }
    // ¿alcanza? (se recalcula cada cuadro sin rearmar el DOM)
    cont.querySelectorAll("button[data-i]").forEach(b => {
      const c = g[+b.dataset.i]; if (!c) return;
      const sinPlata = c.costo && (J.oro < c.costo.oro || J.madera < c.costo.madera);
      const sinComida = c.pob && J.pob + c.pob > J.pobMax;
      b.disabled = !!c.requisito;
      b.classList.toggle("caro", !!(sinPlata || sinComida));
    });
  }

  mostrarTip(b) {
    const c = this.botones[+b.dataset.i]; if (!c) return;
    const J = this.m.jugadores[JUGADOR];
    const costo = c.costo ? `<div class="costo">${c.costo.oro ? `<span class="${J.oro < c.costo.oro ? "no" : ""}">${RECURSO_SVG.oro}${c.costo.oro}</span>` : ""}${c.costo.madera ? `<span class="${J.madera < c.costo.madera ? "no" : ""}">${RECURSO_SVG.madera}${c.costo.madera}</span>` : ""}${c.pob ? `<span class="${J.pob + c.pob > J.pobMax ? "no" : ""}">${RECURSO_SVG.pob}${c.pob}</span>` : ""}</div>` : "";
    this.tip.innerHTML = `<b>${c.titulo}</b> <kbd>${TECLAS_GRILLA[+b.dataset.i].toUpperCase()}</kbd>${costo}${c.requisito ? `<p class="no">${c.requisito}</p>` : ""}${c.desc ? `<p>${c.desc}</p>` : ""}`;
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
  tecla(letra) { const i = TECLAS_GRILLA.indexOf(letra); return i >= 0 ? this.ejecutar(i) : false; }
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
      const f = (t - a.t) % 1; ctx.strokeStyle = `rgba(255,70,70,${1 - f})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(a.x * esc, a.z * esc, 4 + f * 14, 0, Math.PI * 2); ctx.stroke();
    }
  }
}

export { POB_MAX };
