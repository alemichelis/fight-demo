// MySQL/MariaDB: una sola base para TODOS los grupos; cada torneo se identifica por su código y toda consulta filtra por él.
//
// Variables de entorno (en Hostinger: hPanel → Bases de datos → MySQL; el host suele ser localhost):
//   DB_HOST  DB_PORT(3306)  DB_USER  DB_PASSWORD  DB_NAME        (o DATABASE_URL=mysql://user:pass@host:3306/nombre)

import mysql from "mysql2/promise";

let pool = null;
export const q = async (sql, params = []) => (await pool.query(sql, params))[0];

export async function iniciarDB() {
  const cfg = process.env.DATABASE_URL ? { uri: process.env.DATABASE_URL } : {
    host: process.env.DB_HOST || "localhost", port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root", password: process.env.DB_PASSWORD || "", database: process.env.DB_NAME || "reino_caido"
  };
  pool = mysql.createPool({ ...cfg, waitForConnections: true, connectionLimit: 10, charset: "utf8mb4", dateStrings: false, supportBigNumbers: true, bigNumberStrings: false });
  await pool.query("SELECT 1");
  const tablas = [
    `CREATE TABLE IF NOT EXISTS usuarios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuario VARCHAR(24) NULL UNIQUE,
      nombre VARCHAR(40) NOT NULL,
      email VARCHAR(190) NULL UNIQUE,
      google_sub VARCHAR(64) NULL UNIQUE,
      foto VARCHAR(400) NULL,
      clave_hash VARCHAR(200) NULL,
      creado TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4`,
    `CREATE TABLE IF NOT EXISTS sesiones (
      token_hash CHAR(64) PRIMARY KEY,
      usuario_id INT NOT NULL,
      expira DATETIME NOT NULL,
      INDEX (usuario_id), INDEX (expira),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4`,
    `CREATE TABLE IF NOT EXISTS avatares (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuario_id INT NOT NULL,
      nombre VARCHAR(24) NOT NULL,
      glb LONGBLOB NOT NULL,
      tam INT NOT NULL,
      creado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (usuario_id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4`,
    `CREATE TABLE IF NOT EXISTS torneos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      codigo VARCHAR(8) NOT NULL UNIQUE,
      nombre VARCHAR(60) NOT NULL,
      creador_id INT NOT NULL,
      total_peleas INT NOT NULL,
      estado ENUM('abierto','terminado') NOT NULL DEFAULT 'abierto',
      campeon_id INT NULL,
      creado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      terminado_en DATETIME NULL,
      INDEX (creador_id),
      FOREIGN KEY (creador_id) REFERENCES usuarios(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4`,
    `CREATE TABLE IF NOT EXISTS peleas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      torneo_id INT NOT NULL,
      ganador_id INT NOT NULL,
      perdedor_id INT NOT NULL,
      ganador_avatar_id INT NULL,
      perdedor_avatar_id INT NULL,
      rondas_ganador TINYINT NOT NULL DEFAULT 2,
      rondas_perdedor TINYINT NOT NULL DEFAULT 0,
      creado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (torneo_id),
      FOREIGN KEY (torneo_id) REFERENCES torneos(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4`
  ];
  for (const t of tablas) await pool.query(t);
  await pool.query("DELETE FROM sesiones WHERE expira < NOW()");
  return true;
}

/** Tabla de posiciones de UN torneo: victorias (puntos), derrotas y avatar más usado. */
export async function tablaTorneo(torneoId) {
  return q(`
    SELECT u.id, u.nombre, u.foto,
           SUM(p.ganador_id = u.id) AS victorias, SUM(p.perdedor_id = u.id) AS derrotas,
           MIN(p.creado) AS desde
    FROM peleas p JOIN usuarios u ON u.id IN (p.ganador_id, p.perdedor_id)
    WHERE p.torneo_id = ?
    GROUP BY u.id, u.nombre, u.foto
    ORDER BY victorias DESC, derrotas ASC, desde ASC`, [torneoId]);
}
