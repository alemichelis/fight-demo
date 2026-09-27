// Entrada: teclado y gamepad → la misma estructura para cada jugador { x, arriba, abajo, bloq, p, k, s, pP, pK, pS }.
// pP/pK/pS son «recién apretado este cuadro» (flancos); el luchador les agrega un buffer corto.

const MAPAS = {
  1: { izq: ["KeyA"], der: ["KeyD"], arriba: ["KeyW", "Space"], abajo: ["KeyS"], p: ["KeyF"], k: ["KeyG"], s: ["KeyH"], bloq: ["KeyR", "ShiftLeft"] },
  2: { izq: ["ArrowLeft"], der: ["ArrowRight"], arriba: ["ArrowUp", "Space"], abajo: ["ArrowDown"], p: ["KeyJ"], k: ["KeyK"], s: ["KeyL"], bloq: ["KeyI", "ShiftRight"] }
};

export class Controles {
  constructor() {
    this.teclas = new Set();
    this.remotoTeclas = { 1: new Set(), 2: new Set() };   // teclas de jugadores remotos (llegan por WebRTC), por lado de la pelea
    this.fuentes = { 1: "local", 2: "local" };            // quién maneja cada lado: teclado de esta PC o un amigo conectado
    this.flancos = new Set();
    this.previo = { 1: {}, 2: {} };
    this.alPresionar = null;                       // callback(codigo) para menús
    this._d = e => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "Tab"].includes(e.code)) e.preventDefault();
      if (!this.teclas.has(e.code)) this.flancos.add(e.code);
      this.teclas.add(e.code);
      if (!e.repeat || ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD", "KeyW", "KeyS"].includes(e.code)) this.alPresionar?.(e.code, e);
    };
    this._u = e => this.teclas.delete(e.code);
    this._b = () => this.teclas.clear();
    window.addEventListener("keydown", this._d);
    window.addEventListener("keyup", this._u);
    window.addEventListener("blur", this._b);
  }

  destruir() { window.removeEventListener("keydown", this._d); window.removeEventListener("keyup", this._u); window.removeEventListener("blur", this._b); }

  /** Llamar una vez por cuadro DESPUÉS de leer todo. */
  cerrarCuadro() { this.flancos.clear(); }

  _pad(i) {
    try { const p = navigator.getGamepads?.()[i]; if (!p) return null; const b = n => p.buttons[n]?.pressed; const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      return { izq: b(14) || ax < -0.45, der: b(15) || ax > 0.45, arriba: b(12) || ay < -0.55, abajo: b(13) || ay > 0.55, p: b(2), k: b(0), s: b(3), bloq: b(1) || b(4) || b(5) || b(6) || b(7) }; }
    catch (e) { return null; }
  }

  /** modo1p: el jugador 1 también puede usar el mapa del 2 (flechas + JKL) */
  leer(jugador, { compartido = false } = {}) {
    const remoto = this.fuentes[jugador] === "remoto", fuente = remoto ? this.remotoTeclas[jugador] : this.teclas;
    // el amigo remoto y el anfitrión que juega solo pueden usar cualquiera de los dos juegos de teclas
    const mapas = remoto || compartido ? [MAPAS[1], MAPAS[2]] : [MAPAS[jugador]];
    const dn = ks => mapas.some(m => m[ks].some(c => fuente.has(c)));
    const pad = remoto ? null : this._pad(jugador - 1) || (compartido ? this._pad(0) : null);
    const v = {
      izq: dn("izq") || !!pad?.izq, der: dn("der") || !!pad?.der, arriba: dn("arriba") || !!pad?.arriba, abajo: dn("abajo") || !!pad?.abajo,
      p: dn("p") || !!pad?.p, k: dn("k") || !!pad?.k, s: dn("s") || !!pad?.s, bloq: dn("bloq") || !!pad?.bloq
    };
    const prev = this.previo[jugador];
    const out = { x: (v.der ? 1 : 0) - (v.izq ? 1 : 0), arriba: v.arriba, abajo: v.abajo, bloq: v.bloq, p: v.p, k: v.k, s: v.s,
      pP: v.p && !prev.p, pK: v.k && !prev.k, pS: v.s && !prev.s };
    this.previo[jugador] = { p: v.p, k: v.k, s: v.s };
    return out;
  }
}

export const AYUDA = [
  ["Mover", "A / D", "← / →"], ["Saltar", "W o Espacio", "↑ o Espacio"], ["Agacharse", "S", "↓"],
  ["Puño", "F", "J"], ["Patada", "G", "K"], ["Especial (proyectil)", "H", "L"], ["Bloquear", "R (o Shift)", "I (o Shift)"],
  ["Gancho", "S + F", "↓ + J"], ["Barrida", "S + G", "↓ + K"], ["Ataque aéreo", "Saltar + F / G", "Saltar + J / K"]
];
