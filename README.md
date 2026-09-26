# Reino Caído — torneos de pelea entre amigos

Juego de pelea 3D en el navegador (Three.js). Cada jugador crea su avatar con una selfie (Avaturn), un anfitrión abre un torneo,
los amigos entran por link, se desafían de a uno y todo queda en una tabla de posiciones guardada en MySQL.

## Cómo se juega
1. Cada uno entra con **usuario y clave** (se registra en la pantalla de acceso) y crea su avatar (botón «Crear avatar»).
2. Un jugador **crea el torneo** (nombre + cantidad de peleas) y se convierte en el **anfitrión**: su PC corre el juego y lo transmite.
3. El anfitrión toca **«Transmitir»**, comparte la pestaña y le pasa el link a sus amigos (`/?t=CODIGO`).
4. Los amigos abren el link, ven la pelea en vivo y, cuando hay una **ventana de 1 minuto**, eligen su avatar y **desafían**. El primero en tocar pelea.
5. El que gana **sigue en pie**; se abre otra ventana de 1 minuto para el siguiente rival. Si nadie entra, el anfitrión decide esperar otro minuto o terminar.
6. Al llegar a la cantidad de peleas (o si el anfitrión termina antes) se anuncia el **campeón**: quien tenga más victorias.

Cada torneo es independiente: se identifica por su código y todas las consultas filtran por él, así que miles de grupos comparten la misma base sin mezclarse.

## Escenarios
El anfitrión elige el escenario en el lobby (o «Aleatorio», que sortea uno por pelea). Hay 9:
Templo del Ocaso, Templo Lunar, Santuario del Alba, Forja del Volcán, Cumbre de la Tormenta, Ventisca del Norte,
**Calle Apocalíptica**, **Azotea Cyberpunk** y **Mazmorra Medieval**. Los tres últimos tienen geometría propia
(`src/pelea/escenarios.js`); agregar otro es sumar una función ahí y una entrada en `TEMAS` (`src/pelea/arena.js`).
La primera vez que se elige un escenario se construye (unos segundos) y después se reutiliza.

## Qué necesita el hosting
- **Node 18 o más nuevo** (no sirve un hosting estático: hay WebSocket y API).
- **Una base MySQL/MariaDB**. Las tablas se crean solas al arrancar.
- **HTTPS** (para los micrófonos).

### Variables de entorno
| Variable | Para qué |
|---|---|
| `DB_HOST` | Servidor MySQL (en Hostinger suele ser `localhost`; mirá hPanel → Bases de datos) |
| `DB_PORT` | Puerto (3306 por defecto) |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Credenciales y nombre de la base |
| `DATABASE_URL` | Alternativa a las cuatro anteriores: `mysql://usuario:clave@host:3306/base` |
| `AVATURN_SUBDOMAIN` | Subdominio de tu cuenta de Avaturn (por defecto `musicverse`) |
| `PORT` | Lo pone el hosting solo |

Comando de inicio: `npm start` (equivale a `node server.js`). Comprobación: `/salud` responde `ok` cuando la base está conectada.

### Más adelante (opcional): login con Google
Por ahora sólo se entra con usuario y clave. El login con Google ya está programado pero apagado: si algún día lo querés, poné la variable `GOOGLE_CLIENT_ID` y aparece el botón solo.
1. En https://console.cloud.google.com → *APIs y servicios* → *Credenciales* → **Crear credenciales → ID de cliente de OAuth** → tipo **Aplicación web**.
2. En **Orígenes de JavaScript autorizados** poné la dirección pública del juego (`https://tu-dominio.com`) y, para probar en tu PC, `http://localhost:5173`.
3. Copiá el **ID de cliente** y guardalo en la variable `GOOGLE_CLIENT_ID` (esa variable no está en la tabla de arriba a propósito). No hace falta el secreto: la credencial se verifica en el servidor.
4. En la pantalla de consentimiento agregá tu Gmail (y los de tus amigos) como usuarios de prueba, o publicá la app.

## Probar en tu PC
```
npm install
DB_USER=root DB_NAME=reino_caido node server.js       # o guardá las variables en .env.local y usá: node --env-file=.env.local server.js
```
Abrí http://localhost:5173. La base tiene que existir (`CREATE DATABASE reino_caido CHARACTER SET utf8mb4;`).

## Cosas a tener en cuenta
- **Los avatares (GLB de 5–15 MB) se guardan en la base** (LONGBLOB), así sobreviven a los redeploys del hosting. Si tu MySQL tiene `max_allowed_packet` bajo (<16 MB), subilo. Máximo 5 avatares por cuenta.
- **El anfitrión aguanta el peso**: su PC corre el juego y sube video a cada amigo (~2–3 Mbps por persona). El servidor limita la sala a 14 conectados.
- **Trampa**: el anfitrión informa el resultado de cada pelea; se confía en él (es un juego entre amigos).
- Para conexiones entre redes muy restrictivas haría falta un servidor TURN propio (se usan STUN públicos de Google).
- Las tipografías vienen de Google Fonts.
