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
    modelo: { glb: null, escala: 1 }
  },
  soldado: {
    nombre: "Soldado", desc: "Infantería pesada con espada y escudo. Aguanta en primera línea.",
    costo: { oro: 125, madera: 0 }, pob: 1, tiempo: 18,
    vida: 190, armadura: 3, velocidad: 2.3, radio: 0.38, vision: 7, altura: 1.05,
    ataque: { danio: 13, rango: 0.55, cadencia: 1.1 },
    modelo: { glb: null, escala: 1 }
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
    requiere: "herreria",
    modelo: { glb: null, escala: 1 }
  }
};

export const EDIFICIOS = {
  castillo: {
    nombre: "Castillo", desc: "Corazón del reino: entrena peones y recibe el oro y la madera.",
    costo: { oro: 450, madera: 250 }, tiempo: 70, lado: 4,
    vida: 1600, armadura: 4, vision: 12, pobDa: 10, entrega: true, entrena: ["peon"],
    modelo: { glb: null, escala: 1 }
  },
  granja: {
    nombre: "Granja", desc: "Alimenta a tu gente: cada granja suma 6 de población.",
    costo: { oro: 80, madera: 30 }, tiempo: 18, lado: 2,
    vida: 320, armadura: 1, vision: 4, pobDa: 6,
    modelo: { glb: null, escala: 1 }
  },
  cuartel: {
    nombre: "Cuartel", desc: "Entrena soldados, arqueras y, con herrería, caballeros.",
    costo: { oro: 170, madera: 90 }, tiempo: 34, lado: 3,
    vida: 800, armadura: 3, vision: 6, entrena: ["soldado", "arquero", "caballero"],
    modelo: { glb: null, escala: 1 }
  },
  herreria: {
    nombre: "Herrería", desc: "Forja armaduras pesadas: habilita a los caballeros.",
    costo: { oro: 140, madera: 120 }, tiempo: 30, lado: 3,
    vida: 650, armadura: 3, vision: 5,
    modelo: { glb: null, escala: 1 }
  },
  torre: {
    nombre: "Torre de guardia", desc: "Defensa fija: dispara flechas a los enemigos que se acercan.",
    costo: { oro: 110, madera: 100 }, tiempo: 30, lado: 2,
    vida: 520, armadura: 3, vision: 10,
    ataque: { danio: 11, rango: 7.5, cadencia: 1.3, proyectil: "flecha" },
    modelo: { glb: null, escala: 1 }
  }
};
// los peones pueden levantar todos los edificios
UNIDADES.peon.construye = Object.keys(EDIFICIOS);

export const MINA = { nombre: "Mina de oro", lado: 3, oro: 9000, vision: 0, modelo: { glb: null, escala: 1 } };

// Grilla de comandos: 4 columnas × 3 filas con teclas fijas por posición (como los RTS modernos).
export const TECLAS_GRILLA = ["q", "w", "e", "r", "a", "s", "d", "f", "z", "x", "c", "v"];

export const DIFICULTADES = {
  facil:   { nombre: "Fácil",   ritmo: 0.75, ejercito: 9,  primerAtaque: 330, peones: 9 },
  normal:  { nombre: "Normal",  ritmo: 1.0,  ejercito: 7,  primerAtaque: 270, peones: 12 },
  dificil: { nombre: "Difícil", ritmo: 1.25, ejercito: 6,  primerAtaque: 210, peones: 15 }
};
