// Configuración de la persona: gráficos, controles y sonido. Se guarda en el navegador y se aplica en vivo
// (quien la cambia avisa con aplicar(), y cada parte del juego escucha con alCambiar()).

const CLAVE = "coronas-config";

export const PRESETS = {
  alta:  { ratio: 2,   sombras: 4096, gtao: true,  bloom: true,  smaa: true,  pasto: 3.5 },
  media: { ratio: 1.5, sombras: 2048, gtao: false, bloom: true,  smaa: true,  pasto: 1.8 },
  baja:  { ratio: 1,   sombras: 1024, gtao: false, bloom: false, smaa: false, pasto: 0 }
};

// acciones con tecla propia (la grilla de comandos son 12 teclas aparte, por posición)
export const ACCIONES = {
  girarIzq: { nombre: "Girar la cámara a la izquierda", def: "," },
  girarDer: { nombre: "Girar la cámara a la derecha", def: "." },
  norte:    { nombre: "Volver la cámara al norte", def: "n" },
  girarEdificio: { nombre: "Girar el edificio (al ubicarlo o seleccionado)", def: "t" },
  alerta:   { nombre: "Ir a la última alerta", def: " " },
  menu:     { nombre: "Abrir el menú", def: "F10" }
};
export const GRILLA_QWERTY = ["q", "w", "e", "r", "a", "s", "d", "f", "z", "x", "c", "v"];
export const GRILLA_AZERTY = ["a", "z", "e", "r", "q", "s", "d", "f", "w", "x", "c", "v"];

function defecto(calidad = "alta") {
  return {
    graficos: { calidad, ...PRESETS[calidad] },
    camara: { bordes: true, velocidad: 1, invertirGiro: false },
    audio: { volumen: 0.7 },
    teclas: { grilla: [...GRILLA_QWERTY], ...Object.fromEntries(Object.entries(ACCIONES).map(([k, a]) => [k, a.def])) },
    elegidaPorPersona: false            // si la calidad la eligió el juego, puede bajarla sola si no da el rendimiento
  };
}

// mezcla lo guardado con los valores por defecto: una versión nueva del juego con opciones nuevas no rompe nada
function mezclar(base, extra) {
  for (const k in extra) {
    if (extra[k] && typeof extra[k] === "object" && !Array.isArray(extra[k]) && base[k]) mezclar(base[k], extra[k]);
    else if (k in base) base[k] = extra[k];
  }
  return base;
}

export const config = {
  valor: null,
  oyentes: [],
  cargar(calidadSugerida) {
    let guardada = null;
    try { guardada = JSON.parse(localStorage.getItem(CLAVE) || "null"); } catch {}
    this.valor = mezclar(defecto(calidadSugerida), guardada || {});
    if (this.valor.teclas.grilla.length !== 12) this.valor.teclas.grilla = [...GRILLA_QWERTY];
    return this.valor;
  },
  guardar() { try { localStorage.setItem(CLAVE, JSON.stringify(this.valor)); } catch {} },
  aplicar() { this.guardar(); for (const f of this.oyentes) f(this.valor); },
  alCambiar(f) { this.oyentes.push(f); f(this.valor); },
  usarPreset(nombre) { Object.assign(this.valor.graficos, { calidad: nombre, ...PRESETS[nombre] }); },
  // si los ajustes sueltos ya no coinciden con ningún preset, la calidad pasa a «personalizada»
  revisarPreset() {
    const g = this.valor.graficos;
    const igual = Object.entries(PRESETS).find(([, p]) => Object.keys(p).every(k => p[k] === g[k]));
    g.calidad = igual ? igual[0] : "personalizada";
  },
  restablecer(seccion) { const d = defecto(this.valor.graficos.calidad === "personalizada" ? "alta" : this.valor.graficos.calidad); this.valor[seccion] = d[seccion]; }
};

// nombre legible de una tecla
export function nombreTecla(k) {
  if (!k) return "—";
  return { " ": "Espacio", ",": ",", ".": ".", ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Escape: "Esc" }[k] || (k.length === 1 ? k.toUpperCase() : k);
}
