// Punto de entrada. Según la URL:
//   /juegos/reino-caido/    menú (cuenta, avatares, crear/unirse a un torneo)          → menu.js   (sin 3D)
//   /juegos/reino-caido/?arena=CODIGO&av=ID   arena del anfitrión (corre el juego 3D)  → anfitrion.js
//   /juegos/reino-caido/?t=CODIGO             sala de un amigo: mira, desafía y pelea  → cliente.js (sin 3D)

const P = new URLSearchParams(location.search);
const $ = s => document.querySelector(s);

if (P.get("arena")) {
  const { Anfitrion } = await import("./anfitrion.js");
  const app = new Anfitrion(P.get("arena").toUpperCase(), parseInt(P.get("av"), 10) || 0);
  app.arrancar().catch(e => { console.error(e); $("#carga .c-paso").textContent = "Error: " + e.message; });
} else if (P.get("t") || P.get("sala")) {
  const { iniciarCliente } = await import("./cliente.js");
  iniciarCliente((P.get("t") || P.get("sala")).toUpperCase());
} else {
  const { iniciarMenu } = await import("./menu.js");
  iniciarMenu();
}
