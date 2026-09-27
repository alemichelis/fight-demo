// Sonido procedural (Web Audio, sin archivos): impactos, gongs, viento y un dron ambiental.
// Cuando haya audios reales, cada función se reemplaza por una reproducción y el resto del juego no cambia.
// Todo está protegido: si el navegador no deja crear audio (o todavía no hubo un gesto del usuario), el juego sigue mudo.

let ctx = null, maestro = null, ruidoBuf = null, ambiente = null;

function audio() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      maestro = ctx.createGain(); maestro.gain.value = 0.8;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5;
      maestro.connect(comp).connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch (e) { return null; }
}

const ruido = a => {
  if (!ruidoBuf) { ruidoBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate); const d = ruidoBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = a.createBufferSource(); s.buffer = ruidoBuf; return s;
};

function soplido({ dur = 0.15, f0 = 2000, f1 = 300, vol = 0.4, tipo = "lowpass", q = 1, retraso = 0 }) {
  const a = audio(); if (!a) return;
  const t = a.currentTime + retraso, s = ruido(a), f = a.createBiquadFilter(), g = a.createGain();
  f.type = tipo; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(maestro); s.start(t); s.stop(t + dur + 0.05);
}

function tono({ tipo = "sine", f0 = 440, f1 = 440, dur = 0.15, vol = 0.2, retraso = 0, ataque = 0.005 }) {
  const a = audio(); if (!a) return;
  const t = a.currentTime + retraso, o = a.createOscillator(), g = a.createGain();
  o.type = tipo; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + ataque); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(maestro); o.start(t); o.stop(t + dur + 0.05);
}

export const sfx = {
  activar() { audio(); },
  /** fuerza 0..1 */
  golpe(fuerza = 0.5) {
    soplido({ dur: 0.12 + fuerza * 0.08, f0: 3800, f1: 180, vol: 0.5 + fuerza * 0.4 });
    tono({ f0: 150 + fuerza * 40, f1: 38, dur: 0.22, vol: 0.5 + fuerza * 0.3, tipo: "sine" });
    if (fuerza > 0.6) tono({ f0: 90, f1: 30, dur: 0.4, vol: 0.5, tipo: "triangle", retraso: 0.02 });
  },
  whoosh(grave = 0) { soplido({ dur: 0.2, f0: 500 + grave * -200, f1: 2600 - grave * 800, vol: 0.22, tipo: "bandpass", q: 1.4 }); },
  bloqueo() {
    tono({ f0: 1400, f1: 900, dur: 0.16, vol: 0.14, tipo: "square" }); tono({ f0: 2100, f1: 1500, dur: 0.12, vol: 0.09, tipo: "triangle" });
    soplido({ dur: 0.08, f0: 6000, f1: 1500, vol: 0.3, tipo: "highpass" }); tono({ f0: 120, f1: 60, dur: 0.15, vol: 0.3 });
  },
  proyectil() { tono({ f0: 180, f1: 900, dur: 0.5, vol: 0.14, tipo: "sawtooth" }); soplido({ dur: 0.5, f0: 300, f1: 3000, vol: 0.2, tipo: "bandpass", q: 2 }); },
  explosion() { soplido({ dur: 0.5, f0: 2500, f1: 60, vol: 0.6 }); tono({ f0: 110, f1: 28, dur: 0.6, vol: 0.6, tipo: "sine" }); },
  salto() { soplido({ dur: 0.18, f0: 400, f1: 1400, vol: 0.12, tipo: "bandpass" }); },
  aterrizar() { soplido({ dur: 0.14, f0: 700, f1: 120, vol: 0.28 }); tono({ f0: 70, f1: 40, dur: 0.16, vol: 0.3 }); },
  caida() { soplido({ dur: 0.3, f0: 900, f1: 60, vol: 0.5 }); tono({ f0: 80, f1: 30, dur: 0.4, vol: 0.55 }); },
  ui() { tono({ f0: 720, f1: 900, dur: 0.06, vol: 0.09, tipo: "triangle" }); },
  mover() { tono({ f0: 520, f1: 520, dur: 0.045, vol: 0.07, tipo: "triangle" }); },
  confirmar() { tono({ f0: 330, f1: 660, dur: 0.16, vol: 0.14, tipo: "sawtooth" }); soplido({ dur: 0.25, f0: 3000, f1: 400, vol: 0.2 }); tono({ f0: 98, f1: 60, dur: 0.5, vol: 0.28 }); },
  /** Gong: parciales inarmónicos con caída larga. */
  gong(vol = 1) {
    for (const [k, v] of [[1, 0.5], [1.51, 0.3], [2.03, 0.24], [2.72, 0.16], [3.4, 0.1], [4.6, 0.06]])
      tono({ f0: 96 * k, f1: 96 * k * 0.995, dur: 3.2 / (0.6 + k * 0.4), vol: 0.32 * v * vol, ataque: 0.012 });
    soplido({ dur: 0.35, f0: 5000, f1: 500, vol: 0.25 * vol });
  },
  tambor(vol = 1) { tono({ f0: 130, f1: 44, dur: 0.5, vol: 0.7 * vol, tipo: "sine" }); soplido({ dur: 0.12, f0: 1800, f1: 200, vol: 0.3 * vol }); },
  ko() { this.tambor(1.2); tono({ f0: 55, f1: 28, dur: 1.4, vol: 0.5, tipo: "sawtooth" }); soplido({ dur: 1.2, f0: 800, f1: 40, vol: 0.4 }); },
  fight() { this.gong(1); this.tambor(1); },
  ronda() { this.tambor(0.9); tono({ f0: 82, f1: 70, dur: 0.9, vol: 0.28, tipo: "sawtooth" }); }
};

/** Viento + dron grave: 0 = apagado. Se puede llamar seguido; sólo cambia el nivel. */
export const ambiental = {
  poner(nivel = 0.3, { viento = 1, dron = 1 } = {}) {
    const a = audio(); if (!a) return;
    if (!ambiente) {
      const s = ruido(a); s.loop = true;
      const f = a.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 500; f.Q.value = 0.7;
      const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = 0.08; lg.gain.value = 280; lfo.connect(lg).connect(f.frequency); lfo.start();
      const gv = a.createGain(); gv.gain.value = 0; s.connect(f).connect(gv).connect(maestro); s.start();
      const gd = a.createGain(); gd.gain.value = 0;
      const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 260;
      for (const [fr, det] of [[55, -6], [55.4, 5], [82.4, 3], [110, -4]]) { const o = a.createOscillator(); o.type = "sawtooth"; o.frequency.value = fr; o.detune.value = det; o.connect(lp); o.start(); }
      lp.connect(gd).connect(maestro);
      ambiente = { gv, gd };
    }
    const t = a.currentTime;
    ambiente.gv.gain.linearRampToValueAtTime(0.12 * nivel * viento, t + 1.2);
    ambiente.gd.gain.linearRampToValueAtTime(0.06 * nivel * dron, t + 1.2);
  },
  silencio() { this.poner(0); }
};
