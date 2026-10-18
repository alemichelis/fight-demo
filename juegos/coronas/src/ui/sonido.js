// Sonidos sintetizados con WebAudio (sin archivos): confirmaciones, golpes, alertas y fanfarrias.
// Son provisorios hasta tener audio grabado; la interfaz (sonar("nombre")) queda igual.

let ac = null, master = null, volumen = 0.7;
function iniciar() {
  if (ac) return ac;
  try { ac = new AudioContext(); master = ac.createGain(); master.gain.value = volumen * 0.5; master.connect(ac.destination); } catch { ac = null; }
  return ac;
}
export function fijarVolumen(v) { volumen = v; if (master) master.gain.value = v * 0.5; }
addEventListener("pointerdown", () => { iniciar(); if (ac?.state === "suspended") ac.resume(); }, { once: false });

function tono(f, dur, { tipo = "sine", vol = 0.3, ataque = 0.005, desliz = 0, cuando = 0 } = {}) {
  if (!iniciar()) return;
  const t = ac.currentTime + cuando, o = ac.createOscillator(), g = ac.createGain();
  o.type = tipo; o.frequency.setValueAtTime(f, t); if (desliz) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * desliz), t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + ataque); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function ruido(dur, { vol = 0.25, filtro = 1800, q = 1, cuando = 0 } = {}) {
  if (!iniciar()) return;
  const t = ac.currentTime + cuando, n = Math.floor(ac.sampleRate * dur), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = b; f.type = "bandpass"; f.frequency.value = filtro; f.Q.value = q; g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(master); s.start(t);
}

const ultimo = new Map();
const SONIDOS = {
  clic: () => tono(880, 0.05, { tipo: "triangle", vol: 0.12 }),
  orden: () => { tono(520, 0.07, { tipo: "triangle", vol: 0.14 }); tono(780, 0.08, { tipo: "triangle", vol: 0.1, cuando: 0.05 }); },
  ataque: () => { tono(330, 0.09, { tipo: "sawtooth", vol: 0.08, desliz: 0.7 }); tono(250, 0.12, { tipo: "sawtooth", vol: 0.08, cuando: 0.06, desliz: 0.6 }); },
  error: () => tono(180, 0.18, { tipo: "square", vol: 0.08, desliz: 0.8 }),
  espada: () => { ruido(0.12, { vol: 0.12, filtro: 3200, q: 6 }); tono(1900 + Math.random() * 600, 0.15, { tipo: "triangle", vol: 0.04 }); },
  flecha: () => ruido(0.16, { vol: 0.06, filtro: 2400, q: 2 }),
  hacha: () => { ruido(0.07, { vol: 0.1, filtro: 900, q: 3 }); tono(160, 0.08, { vol: 0.08 }); },
  construido: () => [523, 659, 784].forEach((f, i) => tono(f, 0.35, { tipo: "triangle", vol: 0.13, cuando: i * 0.09 })),
  entrenado: () => { tono(440, 0.12, { tipo: "triangle", vol: 0.1 }); tono(660, 0.18, { tipo: "triangle", vol: 0.1, cuando: 0.08 }); },
  alerta: () => [0, 0.32].forEach(c => { tono(220, 0.28, { tipo: "sawtooth", vol: 0.1, cuando: c }); tono(277, 0.28, { tipo: "sawtooth", vol: 0.07, cuando: c }); }),
  derrumbe: () => { ruido(1.2, { vol: 0.25, filtro: 260, q: 0.7 }); tono(70, 1.0, { vol: 0.15, desliz: 0.5 }); },
  victoria: () => [523, 659, 784, 1047].forEach((f, i) => tono(f, 0.6, { tipo: "triangle", vol: 0.15, cuando: i * 0.16 })),
  derrota: () => [392, 349, 311, 262].forEach((f, i) => tono(f, 0.7, { tipo: "triangle", vol: 0.14, cuando: i * 0.22 }))
};

// limita repeticiones (en una batalla grande no queremos cien golpes por segundo)
export function sonar(nombre, min = 0.06) {
  const t = performance.now() / 1000;
  if (t - (ultimo.get(nombre) || 0) < min) return;
  ultimo.set(nombre, t);
  SONIDOS[nombre]?.();
}
