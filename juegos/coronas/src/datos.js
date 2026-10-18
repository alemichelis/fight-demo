// Coronas de Hierro · datos del juego.
// Todo el balance vive acá como números: para ajustar el juego se toca este archivo, no la lógica.
// «modelo.glb» queda en null mientras se usa el modelo procedural; cuando tengamos el GLB final se pone la ruta
// y el resto del juego no cambia (ver src/render/modelos.js).

export const TICK = 1 / 20;            // la simulación corre a 20 pasos por segundo, siempre igual (lista para lockstep online)
export const LADO_MAPA = 112;          // casillas por lado; 1 casilla = 1 unidad del mundo
export const POB_MAX = 80;
export const RECURSOS_INICIALES = { oro: 450, madera: 250 };
export const MADERA_POR_ARBOL = 60;

export const COLORES_JUGADOR = ["#3d8bff", "#e5484d", "#2fbf71", "#f0b429"];

export const UNIDADES = {
  peon: {
    nombre: "Peón", desc: "Junta oro y madera, y levanta edificios.",
    costo: { oro: 50, madera: 0 }, pob: 1, tiempo: 12,
    vida: 70, armadura: 0, velocidad: 2.5, radio: 0.32, vision: 7, altura: 0.95,
    ataque: { danio: 4, rango: 0.45, cadencia: 1.3 },
    recolecta: { carga: 10, tiempoOro: 2.2, tiempoMadera: 3.4 },
    construye: ["granja", "cuartel", "torre", "castillo"],
    modelo: { glb: "/juegos/coronas/assets/modelos/peon.glb", huesos: true }
  },
  soldado: {
    nombre: "Soldado", desc: "Infantería pesada con espada y escudo. Aguanta en primera línea.",
    costo: { oro: 125, madera: 0 }, pob: 1, tiempo: 18,
    vida: 190, armadura: 3, velocidad: 2.3, radio: 0.38, vision: 7, altura: 1.05,
    ataque: { danio: 13, rango: 0.55, cadencia: 1.1 },
    modelo: { glb: "/juegos/coronas/assets/modelos/soldado.glb" }
  },
  arquero: {
    nombre: "Arquera", desc: "Ataca a distancia. Frágil de cerca: protegela detrás de los soldados.",
    costo: { oro: 80, madera: 40 }, pob: 1, tiempo: 16,
    vida: 95, armadura: 0, velocidad: 2.6, radio: 0.34, vision: 8, altura: 1.0,
    ataque: { danio: 10, rango: 6.5, cadencia: 1.5, proyectil: "flecha" },
    modelo: { glb: null, escala: 1 }
  },
  caballero: {
    nombre: "Caballero", desc: "Caballería rápida y dura. Ideal para flanquear y cazar arqueras.",
    costo: { oro: 200, madera: 60 }, pob: 2, tiempo: 26,
    vida: 300, armadura: 4, velocidad: 3.4, radio: 0.5, vision: 8, altura: 1.6,
    ataque: { danio: 18, rango: 0.6, cadencia: 1.2 },
    requiere: "herreria", nivel: 2,
    modelo: { glb: null, escala: 1 }
  }
};

UNIDADES.catapulta = {
  nombre: "Catapulta", desc: "Arma de asedio: lanza rocas desde lejos. Devastadora contra edificios, torpe contra tropas.",
  costo: { oro: 220, madera: 180 }, pob: 3, tiempo: 32,
  vida: 240, armadura: 2, velocidad: 1.45, radio: 0.62, vision: 9, altura: 1.4,
  ataque: { danio: 26, rango: 9, cadencia: 3.6, proyectil: "roca", vsEdificios: 2.6 },
  nivel: 3,
  modelo: { glb: null, escala: 1 }
};

// Niveles del reino: se sube desde el castillo y cada nivel destraba edificios, tropas e investigaciones.
export const NIVELES = [
  null,
  { nombre: "Aldea" },
  { nombre: "Fortaleza", costo: { oro: 350, madera: 250 }, tiempo: 45, vidaExtra: 600, pobExtra: 4 },
  { nombre: "Ciudadela", costo: { oro: 600, madera: 400 }, tiempo: 60, vidaExtra: 1200, pobExtra: 8, requiere: "herreria" }
];

// Investigaciones de la herrería: mejoras permanentes para todo el ejército.
export const INVESTIGACIONES = {
  armas1:    { nombre: "Filo de acero", desc: "+2 de daño para soldados y caballeros.", costo: { oro: 150, madera: 75 }, tiempo: 30, nivel: 2, efecto: { cuerpo: 2 }, icono: "espada", grado: "I" },
  flechas1:  { nombre: "Puntas de hierro", desc: "+2 de daño para arqueras y torres.", costo: { oro: 125, madera: 100 }, tiempo: 30, nivel: 2, efecto: { distancia: 2 }, icono: "flecha", grado: "I" },
  armadura1: { nombre: "Cota de malla", desc: "+1 de armadura para todas las tropas.", costo: { oro: 150, madera: 100 }, tiempo: 35, nivel: 2, efecto: { armadura: 1 }, icono: "escudo", grado: "I" },
  armas2:    { nombre: "Acero templado", desc: "+3 de daño para soldados y caballeros.", costo: { oro: 275, madera: 150 }, tiempo: 45, nivel: 3, requiere: "armas1", efecto: { cuerpo: 3 }, icono: "espada", grado: "II" },
  flechas2:  { nombre: "Puntas templadas", desc: "+3 de daño para arqueras y torres.", costo: { oro: 250, madera: 200 }, tiempo: 45, nivel: 3, requiere: "flechas1", efecto: { distancia: 3 }, icono: "flecha", grado: "II" },
  armadura2: { nombre: "Armadura de placas", desc: "+2 de armadura para todas las tropas.", costo: { oro: 275, madera: 200 }, tiempo: 50, nivel: 3, requiere: "armadura1", efecto: { armadura: 2 }, icono: "escudo", grado: "II" }
};

export const EDIFICIOS = {
  castillo: {
    nombre: "Castillo", desc: "Corazón del reino: entrena peones y recibe el oro y la madera.",
    costo: { oro: 450, madera: 250 }, tiempo: 55, lado: 4,
    vida: 1600, armadura: 4, vision: 13, pobDa: 10, entrega: true, entrena: ["peon"], mejora: true,
    // procedural en los tres niveles (el castillo de Laarne quedaba como una maqueta chata en la huella de 4×4)
    modelo: { glb: null }
  },
  granja: {
    nombre: "Granja", desc: "Alimenta a tu gente: cada granja suma 6 de población.",
    costo: { oro: 80, madera: 30 }, tiempo: 14, lado: 2,
    vida: 320, armadura: 1, vision: 4, pobDa: 6,
    modelo: { glb: "/juegos/coronas/assets/modelos/granja.glb" }
  },
  cuartel: {
    nombre: "Cuartel", desc: "Entrena soldados, arqueras y, con herrería, caballeros.",
    costo: { oro: 170, madera: 90 }, tiempo: 26, lado: 3,
    vida: 800, armadura: 3, vision: 6, entrena: ["soldado", "arquero", "caballero", "catapulta"],
    modelo: { glb: null, escala: 1 }
  },
  herreria: {
    nombre: "Herrería", desc: "Investiga mejoras de armas y armaduras, y habilita a los caballeros.",
    costo: { oro: 140, madera: 120 }, tiempo: 24, lado: 3, nivel: 2,
    vida: 650, armadura: 3, vision: 5, investiga: true,
    modelo: { glb: null, escala: 1 }
  },
  torre: {
    nombre: "Torre de guardia", desc: "Defensa fija: dispara flechas a los enemigos que se acercan.",
    costo: { oro: 110, madera: 100 }, tiempo: 24, lado: 2, nivel: 2,
    vida: 520, armadura: 3, vision: 10,
    ataque: { danio: 11, rango: 7.5, cadencia: 1.3, proyectil: "flecha" },
    modelo: { glb: null, escala: 1 }
  }
};
EDIFICIOS.barricada = {
  nombre: "Barricada", desc: "Empalizada de madera que corta el paso. Arrastrá para levantar una línea entera.",
  costo: { oro: 0, madera: 12 }, tiempo: 4, lado: 1, muro: true,
  vida: 240, armadura: 4, vision: 2,
  modelo: { glb: null, escala: 1 }
};
EDIFICIOS.muralla = {
  nombre: "Muralla de piedra", desc: "Muro de piedra, mucho más duro que la barricada. Arrastrá para levantar una línea.",
  costo: { oro: 18, madera: 4 }, tiempo: 7, lado: 1, muro: true, nivel: 2,
  vida: 700, armadura: 8, vision: 2,
  modelo: { glb: "/juegos/coronas/assets/modelos/muralla.glb" }
};

// los peones pueden levantar todos los edificios
UNIDADES.peon.construye = Object.keys(EDIFICIOS);

// árboles GLB que se mezclan en los bosques (fracción según la calidad gráfica, ver main.js)
export const ARBOLES_GLB = ["/juegos/coronas/assets/modelos/arbol-olmo.glb"];

export const MINA = { nombre: "Mina de oro", lado: 3, oro: 9000, vision: 0, modelo: { glb: "/juegos/coronas/assets/modelos/mina.glb", escala: 1.12, material: { color: "#857563", metalness: 0, roughness: 0.92, sinBrillo: true } } };


export const DIFICULTADES = {
  facil:   { nombre: "Fácil",   ritmo: 0.75, ejercito: 9,  primerAtaque: 330, peones: 9 },
  normal:  { nombre: "Normal",  ritmo: 1.0,  ejercito: 7,  primerAtaque: 270, peones: 12 },
  dificil: { nombre: "Difícil", ritmo: 1.25, ejercito: 6,  primerAtaque: 210, peones: 15 }
};
