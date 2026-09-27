// HUD de la pelea (DOM sobre el canvas): barras de vida con estela de daño, cronómetro, rondas ganadas,
// anuncios grandes, contador de combo y los menús de pausa / fin de partida.

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export class HudPelea {
  constructor(contenedor, jugadores) {
    this.raiz = el("div", "hud");
    const lado = (j, i) => {
      const s = el("div", `hud-lado l${i}`);
      s.innerHTML = `
        <div class="hud-retrato" style="--c:${j.def.color}"><img src="${j.retrato || ""}" alt=""></div>
        <div class="hud-centro">
          <div class="hud-barra"><div class="estela"></div><div class="vida"></div><div class="brillo"></div></div>
          <div class="hud-nombre"><span class="n">${j.def.nombre}</span><span class="tag">${j.esCPU ? "CPU" : "P" + i}</span><span class="pips"><i></i><i></i></span></div>
        </div>`;
      return s;
    };
    this.raiz.append(lado(jugadores[0], 1), el("div", "hud-tiempo", `<div class="marco"><span class="t">60</span></div>`), lado(jugadores[1], 2));
    this.anuncio = el("div", "anuncio"); this.sub = el("div", "anuncio-sub");
    this.comboEls = [el("div", "combo c1"), el("div", "combo c2")];
    this.menu = el("div", "menu-pelea");
    this.raiz.append(this.anuncio, this.sub, ...this.comboEls, this.menu);
    contenedor.append(this.raiz);
    this.q = i => this.raiz.querySelector(`.l${i}`);
    this.estado = [{ vida: 1, estela: 1, pausa: 0 }, { vida: 1, estela: 1, pausa: 0 }];
    this._t = null;
  }

  destruir() { this.raiz.remove(); }

  dano(idx, fraccion, atacante, combo) {
    const e = this.estado[idx - 1]; e.vida = Math.max(0, fraccion); e.pausa = 0.5;
    const b = this.q(idx).querySelector(".hud-barra"); b.classList.remove("golpe"); void b.offsetWidth; b.classList.add("golpe");
    if (combo >= 2) {
      const c = this.comboEls[atacante - 1]; c.innerHTML = `<b>${combo}</b><span>GOLPES</span>`;
      c.classList.remove("on"); void c.offsetWidth; c.classList.add("on"); clearTimeout(c._t); c._t = setTimeout(() => c.classList.remove("on"), 1300);
    }
  }

  tiempo(s) { const t = this.raiz.querySelector(".hud-tiempo .t"); const n = String(Math.max(0, Math.ceil(s))); if (t.textContent !== n) { t.textContent = n; t.parentElement.classList.toggle("urgente", s <= 10); } }

  rondas(g1, g2) {
    [g1, g2].forEach((g, i) => this.q(i + 1).querySelectorAll(".pips i").forEach((p, k) => p.classList.toggle("on", k < g)));
  }

  reiniciarBarras() { this.estado.forEach(e => { e.vida = 1; e.estela = 1; e.pausa = 0; }); }

  update(dt) {
    this.estado.forEach((e, i) => {
      if (e.pausa > 0) e.pausa -= dt; else e.estela += (e.vida - e.estela) * Math.min(1, dt * 3.5);
      if (e.estela < e.vida) e.estela = e.vida;
      const l = this.q(i + 1);
      l.style.setProperty("--v", e.vida.toFixed(4)); l.style.setProperty("--e", e.estela.toFixed(4));
      l.classList.toggle("critico", e.vida < 0.25 && e.vida > 0);
    });
  }

  /** Texto grande central. clase: '' | 'ko' | 'ganador' */
  anunciar(texto, { sub = "", dur = 1.2, clase = "" } = {}) {
    clearTimeout(this._t);
    this.anuncio.className = `anuncio ${clase}`; this.anuncio.textContent = texto; this.sub.textContent = sub;
    void this.anuncio.offsetWidth; this.anuncio.classList.add("on"); this.sub.classList.toggle("on", !!sub);
    if (dur > 0) this._t = setTimeout(() => { this.anuncio.classList.remove("on"); this.sub.classList.remove("on"); }, dur * 1000);
  }

  /** Menú vertical (pausa / fin). opciones: [{ texto, fn }]; navegable con teclado y mouse. */
  abrirMenu(titulo, opciones, sub = "") {
    this.menu.innerHTML = `<div class="mp-tit">${titulo}</div>${sub ? `<div class="mp-sub">${sub}</div>` : ""}<ul></ul>`;
    const ul = this.menu.querySelector("ul");
    this.sel = 0; this.opciones = opciones;
    opciones.forEach((o, i) => { const li = el("li", "", o.texto); li.onmouseenter = () => this._sel(i); li.onclick = () => o.fn(); ul.append(li); });
    this._sel(0); this.menu.classList.add("on");
  }
  _sel(i) { this.sel = (i + this.opciones.length) % this.opciones.length; this.menu.querySelectorAll("li").forEach((l, k) => l.classList.toggle("sel", k === this.sel)); }
  teclaMenu(cod) {
    if (!this.menu.classList.contains("on")) return false;
    if (["ArrowUp", "KeyW"].includes(cod)) this._sel(this.sel - 1);
    else if (["ArrowDown", "KeyS"].includes(cod)) this._sel(this.sel + 1);
    else if (["Enter", "Space", "KeyF", "KeyJ"].includes(cod)) this.opciones[this.sel].fn();
    else return !["Escape", "KeyP"].includes(cod);
    return true;
  }
  cerrarMenu() { this.menu.classList.remove("on"); }
}
