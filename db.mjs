// Postgres (Supabase): una sola base para TODOS los grupos; cada torneo se identifica por su código y toda consulta filtra por él.
//
// Variables de entorno: en Supabase, Configuración → Base de datos → «Connection string» (modo URI) da un
// DATABASE_URL=postgres://usuario:clave@host:5432/postgres — es lo único que hace falta. Si Hostinger te da los
// datos sueltos en vez de la URL completa, también se aceptan DB_HOST / DB_PORT(5432) / DB_USER / DB_PASSWORD / DB_NAME.

import pg from "pg";

const { Pool } = pg;
let pool = null;

/** Nuestras consultas usan `?` (como MySQL); Postgres pide `$1, $2...`. Se traduce acá para no tocar cada consulta. */
function aPg(sql) { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); }
export const q = async (sql, params = []) => (await pool.query(aPg(sql), params)).rows;

export async function iniciarDB() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  const local = h => !h || h === "localhost" || h === "127.0.0.1";
  const cfg = url
    ? { connectionString: url, ssl: local(new URL(url).hostname) ? false : { rejectUnauthorized: false } }
    : {
        host: process.env.DB_HOST || "localhost", port: Number(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER || "postgres", password: process.env.DB_PASSWORD || "", database: process.env.DB_NAME || "postgres",
        ssl: local(process.env.DB_HOST) ? false : { rejectUnauthorized: false }
      };
  pool = new Pool({ ...cfg, max: 10 });
  await pool.query("SELECT 1");
  const sql = [
    `CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      usuario VARCHAR(24) UNIQUE,
      nombre VARCHAR(40) NOT NULL,
      email VARCHAR(190) UNIQUE,
      google_sub VARCHAR(64) UNIQUE,
      foto VARCHAR(400),
      clave_hash VARCHAR(200),
      creado TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS sesiones (
      token_hash CHAR(64) PRIMARY KEY,
      usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      expira TIMESTAMPTZ NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS sesiones_usuario_idx ON sesiones(usuario_id)`,
    `CREATE INDEX IF NOT EXISTS sesiones_expira_idx ON sesiones(expira)`,
    `CREATE TABLE IF NOT EXISTS avatares (
      id SERIAL PRIMARY KEY,
      usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      nombre VARCHAR(24) NOT NULL,
      glb BYTEA NOT NULL,
      tam INT NOT NULL,
      creado TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS avatares_usuario_idx ON avatares(usuario_id)`,
    `CREATE TABLE IF NOT EXISTS torneos (
      id SERIAL PRIMARY KEY,
      codigo VARCHAR(8) NOT NULL UNIQUE,
      nombre VARCHAR(60) NOT NULL,
      creador_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      total_peleas INT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'terminado')),
      campeon_id INT,
      creado TIMESTAMPTZ NOT NULL DEFAULT now(),
      terminado_en TIMESTAMPTZ
    )`,
    `CREATE INDEX IF NOT EXISTS torneos_creador_idx ON torneos(creador_id)`,
    `CREATE TABLE IF NOT EXISTS peleas (
      id SERIAL PRIMARY KEY,
      torneo_id INT NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
      ganador_id INT NOT NULL,
      perdedor_id INT NOT NULL,
      ganador_avatar_id INT,
      perdedor_avatar_id INT,
      rondas_ganador SMALLINT NOT NULL DEFAULT 2,
      rondas_perdedor SMALLINT NOT NULL DEFAULT 0,
      creado TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS peleas_torneo_idx ON peleas(torneo_id)`
  ];
  for (const s of sql) await pool.query(s);
  await pool.query("DELETE FROM sesiones WHERE expira < NOW()");
  return true;
}

/** Tabla de posiciones de UN torneo: victorias (puntos), derrotas y quién llegó antes (desempate). */
export async function tablaTorneo(torneoId) {
  return q(`
    SELECT u.id, u.nombre, u.foto,
           SUM((p.ganador_id = u.id)::int) AS victorias, SUM((p.perdedor_id = u.id)::int) AS derrotas,
           MIN(p.creado) AS desde
    FROM peleas p JOIN usuarios u ON u.id IN (p.ganador_id, p.perdedor_id)
    WHERE p.torneo_id = ?
    GROUP BY u.id, u.nombre, u.foto
    ORDER BY victorias DESC, derrotas ASC, desde ASC`, [torneoId]);
}
