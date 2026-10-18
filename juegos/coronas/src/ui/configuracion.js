// Pantalla de configuración: gráficos, controles (con reasignación de teclas) y sonido.
// Cada cambio se aplica en el momento y se guarda; «Listo» sólo cierra.

import { config, ACCIONES, GRILLA_QWERTY, GRILLA_AZERTY, nombreTecla } from "../config.js";
import { sonar } from "./sonido.js";

const OPC = {
  calidad: [["alta", "Alta"], ["media", "Media"], ["baja", "Baja"]],
  ratio: [[1, "100 %"], [1.5, "150 %"], [2, "200 %"]],
  sombras: [[0, "No"], [1024, "Bajas"], [2048, "Medias"], [4096, "Altas"]],
  pasto: [[0, "No"], [2.5, "Poco"], [5, "Mucho"]]
};

export function normalizarTecla(k) { return k.length === 1 ? k.toLowerCase() : k; }

export class Configuracion {
  constructor(capa) {
    this.capa = capa;
    this.solapa = "graficos";
    this.esperando = null;            // qué acción espera una tecla nueva
    this.alCerrar = null;
    capa.addEventListener("click", e => this.clic(e));
    capa.addEventListener("input", e => this.entrada(e));
    // mientras está abierta, las teclas son de esta pantalla (no del juego)
    addEventListener("keydown", e => this.tecla(e), true);
  }

  abrir(alCerrar) { this.alCerrar = alCerrar; this.capa.hidden = false; this.pintar(); }
  cerrar() { this.esperando = null; this.capa.hidden = true; this.alCerrar?.(); }
  abierta() { return !this.capa.hidden; }

  pintar() {
    const v = config.valor, g = v.graficos;
    const selector = (clave, opciones, actual) => `<div class="selector">${opciones.map(([val, txt]) => `<button data-op="${clave}" data-v="${val}" aria-pressed="${String(val) === String(actual)}">${txt}</button>`).join("")}</div>`;
    const interruptor = (clave, valor) => `<button class="interruptor" data-sw="${clave}" role="switch" aria-checked="${valor}"><i></i></button>`;
    const fila = (titulo, ayuda, control) => `<div class="fila-cfg"><div><b>${titulo}</b>${ayuda ? `<small>${ayuda}</small>` : ""}</div>${control}</div>`;
    const teclaBtn = (id, k) => `<button class="tecla-cfg ${this.esperando === id ? "esperando" : ""}" data-tecla="${id}">${this.esperando === id ? "Presioná una tecla…" : nombreTecla(k)}</button>`;
    let cuerpo = "";
    if (this.solapa === "graficos") {
      cuerpo = fila("Calidad general", g.calidad === "personalizada" ? "Personalizada: ajustaste opciones sueltas." : "Ajusta todo de una vez.", selector("calidad", OPC.calidad, g.calidad))
        + fila("Nitidez", "Resolución de dibujo. Más alta se ve más fina y pide más a la placa.", selector("ratio", OPC.ratio, g.ratio))
        + fila("Sombras", "Sombras de edificios, árboles y tropas.", selector("sombras", OPC.sombras, g.sombras))
        + fila("Oclusión ambiental", "Sombreado de contacto en rincones y bases. Lo más pesado.", interruptor("gtao", g.gtao))
        + fila("Brillo de luces", "Resplandor de fuego, faroles y destellos (bloom).", interruptor("bloom", g.bloom))
        + fila("Suavizado de bordes", "Quita los serruchos de los bordes (SMAA).", interruptor("smaa", g.smaa))
        + fila("Pasto", "Matas de pasto con viento sobre el terreno.", selector("pasto", OPC.pasto, g.pasto));
    } else if (this.solapa === "controles") {
      const c = v.camara, t = v.teclas;
      cuerpo = fila("Mover la cámara con los bordes", "Llevar el mouse al borde de la pantalla desplaza la vista.", interruptor("bordes", c.bordes))
        + fila("Velocidad de la cámara", "", `<input type="range" min="0.4" max="2.2" step="0.1" value="${c.velocidad}" data-rango="velocidad"><output>${c.velocidad.toFixed(1)}×</output>`)
        + fila("Invertir el giro con el mouse", "Shift + arrastrar con el botón del medio.", interruptor("invertirGiro", c.invertirGiro))
        + `<h4>Teclas</h4>`
        + Object.entries(ACCIONES).map(([id, a]) => fila(a.nombre, "", teclaBtn(id, t[id]))).join("")
        + `<h4>Grilla de comandos <span class="presets"><button data-grilla="qwerty">QWERTY</button><button data-grilla="azerty">AZERTY</button></span></h4>
           <p class="nota">Cada botón de la grilla de abajo a la derecha usa la tecla de su misma posición.</p>
           <div class="grilla-cfg">${t.grilla.map((k, i) => teclaBtn("g" + i, k)).join("")}</div>`;
    } else {
      cuerpo = fila("Volumen", "", `<input type="range" min="0" max="1" step="0.05" value="${v.audio.volumen}" data-rango="volumen"><output>${Math.round(v.audio.volumen * 100)} %</output>`)
        + fila("Probar sonido", "", `<button class="sec chico" data-probar>Reproducir</button>`);
    }
    this.capa.innerHTML = `<div class="menu-caja ancha">
      <div class="titulo chico"><span>Configuración</span></div>
      <div class="solapas">${[["graficos", "Gráficos"], ["controles", "Controles"], ["sonido", "Sonido"]].map(([k, n]) => `<button data-solapa="${k}" aria-selected="${k === this.solapa}">${n}</button>`).join("")}</div>
      <div class="panel-cfg">${cuerpo}</div>
      <div class="pie-cfg"><button class="sec" data-restablecer>Valores por defecto</button><button class="jugar" data-listo>Listo</button></div>
    </div>`;
  }

  clic(e) {
    const b = e.target.closest("button"); if (!b) return;
    const v = config.valor;
    if (b.dataset.solapa) { this.solapa = b.dataset.solapa; this.esperando = null; }
    else if (b.dataset.listo !== undefined) { sonar("clic"); this.cerrar(); return; }
    else if (b.dataset.restablecer !== undefined) {
      config.restablecer(this.solapa === "graficos" ? "graficos" : this.solapa === "controles" ? "camara" : "audio");
      if (this.solapa === "controles") config.restablecer("teclas");
      if (this.solapa === "graficos") v.elegidaPorPersona = false;
      config.aplicar();
    }
    else if (b.dataset.op) {
      const val = b.dataset.op === "calidad" ? b.dataset.v : Number(b.dataset.v);
      if (b.dataset.op === "calidad") config.usarPreset(val);
      else { v.graficos[b.dataset.op] = val; config.revisarPreset(); }
      v.elegidaPorPersona = true;
      config.aplicar();
    }
    else if (b.dataset.sw) {
      const enGraficos = b.dataset.sw in v.graficos, obj = enGraficos ? v.graficos : v.camara;
      obj[b.dataset.sw] = !obj[b.dataset.sw];
      if (enGraficos) { config.revisarPreset(); v.elegidaPorPersona = true; }
      config.aplicar();
    }
    else if (b.dataset.tecla) { this.esperando = this.esperando === b.dataset.tecla ? null : b.dataset.tecla; }
    else if (b.dataset.grilla) { v.teclas.grilla = [...(b.dataset.grilla === "azerty" ? GRILLA_AZERTY : GRILLA_QWERTY)]; config.aplicar(); }
    else if (b.dataset.probar !== undefined) { sonar("construido"); return; }
    sonar("clic");
    this.pintar();
  }

  entrada(e) {
    const r = e.target.dataset.rango; if (!r) return;
    const val = Number(e.target.value), v = config.valor;
    if (r === "volumen") { v.audio.volumen = val; e.target.nextElementSibling.textContent = Math.round(val * 100) + " %"; }
    else { v.camara.velocidad = val; e.target.nextElementSibling.textContent = val.toFixed(1) + "×"; }
    config.aplicar();
  }

  tecla(e) {
    if (!this.abierta()) return;
    e.stopImmediatePropagation();
    if (!this.esperando) { if (e.key === "Escape") { e.preventDefault(); this.cerrar(); } return; }
    e.preventDefault();
    if (e.key === "Escape") { this.esperando = null; this.pintar(); return; }
    if (["Shift", "Control", "Alt", "Meta", "Tab"].includes(e.key)) return;
    const nueva = normalizarTecla(e.key), t = config.valor.teclas, id = this.esperando;
    const actual = id[0] === "g" && /^g\d+$/.test(id) ? t.grilla[+id.slice(1)] : t[id];
    // si otra acción ya usaba esa tecla, se intercambian (nunca quedan dos acciones con la misma)
    const iDup = t.grilla.indexOf(nueva);
    if (iDup >= 0 && "g" + iDup !== id) t.grilla[iDup] = actual;
    for (const k of Object.keys(ACCIONES)) if (k !== id && t[k] === nueva) t[k] = actual;
    if (/^g\d+$/.test(id)) t.grilla[+id.slice(1)] = nueva; else t[id] = nueva;
    this.esperando = null;
    config.aplicar(); sonar("clic"); this.pintar();
  }
}
