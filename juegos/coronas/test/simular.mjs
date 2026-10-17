// Partida IA contra IA sin gráficos, a toda velocidad: sirve para detectar cuelgues, unidades trabadas y
// desbalances sin abrir el navegador.
//   node juegos/coronas/test/simular.mjs [semilla] [minutos] [dificultad0] [dificultad1]

import { Mundo } from "../src/sim/mundo.js";
import { IA } from "../src/sim/ia.js";
import { TICK } from "../src/datos.js";

const semilla = Number(process.argv[2]) || 7, minutos = Number(process.argv[3]) || 25;
const difs = [process.argv[4] || "normal", process.argv[5] || "normal"];
const m = new Mundo({ semilla, jugadores: [{ nombre: "Azul", ia: true }, { nombre: "Rojo", ia: true }] });
const ias = [new IA(m, 0, difs[0]), new IA(m, 1, difs[1])];

const t0 = performance.now();
const pasos = Math.round(minutos * 60 / TICK);
let peorPaso = 0;
for (let i = 0; i < pasos && m.ganador < 0; i++) {
  const a = performance.now();
  for (const ia of ias) ia.pensar();
  m.paso();
  m.eventos.length = 0;
  peorPaso = Math.max(peorPaso, performance.now() - a);
  if (m.tick % (60 * 20) === 0) {
    const fila = m.jugadores.map(J => {
      const u = m.unidadesDe(J.id), e = m.edificiosDe(J.id);
      const quietos = u.filter(x => !x.orden).length;
      return `${J.nombre}: oro ${J.oro} mad ${J.madera} pob ${J.pob}/${J.pobMax} uds ${u.length} (quietas ${quietos}) edif ${e.map(x => x.tipo[0] + (x.completo ? "" : "*")).join("")}`;
    });
    console.log(`min ${String(Math.round(m.tiempo / 60)).padStart(2)} | ${fila.join(" | ")}`);
  }
}
const ms = performance.now() - t0;
console.log(`\nfin: ${m.ganador >= 0 ? "ganó " + m.jugadores[m.ganador].nombre : m.ganador === -2 ? "empate" : "sin ganador"} a los ${(m.tiempo / 60).toFixed(1)} min`);
console.log(`simulación: ${(ms / 1000).toFixed(1)} s reales, paso promedio ${(ms / m.tick).toFixed(2)} ms, peor paso ${peorPaso.toFixed(1)} ms`);
for (const J of m.jugadores) console.log(`  ${J.nombre}: ${JSON.stringify(J.stats)}`);
