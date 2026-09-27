# Daxenworld — portal con Reino Caído

Este repo sirve dos cosas con **un solo servidor Node**:
- **`/`** → el sitio de Daxenworld (`sitio/`, estático).
- **`/juegos/reino-caido`** → el primer juego del catálogo: un juego de pelea 3D (Three.js) donde cada jugador crea su
  avatar con una selfie (Avaturn), un anfitrión abre un torneo y sus amigos entran por link a desafiarse.

La **cuenta de usuario es del portal**, no del juego: un mismo login (`/api`) sirve para crear avatares y jugar
cualquier juego que se sume después. Todo queda guardado en una sola base Postgres (Supabase).

```
sitio/                el sitio (estático)
juegos/reino-caido/   este juego (index.html, css/, src/pelea/, assets/)
juegos/<otro>/        el próximo juego que se agregue — misma idea
src/core/             compartido entre juegos (por ahora, el cargador de modelos 3D)
server.js, api.mjs, db.mjs, salas.mjs    el servidor: sitio + juegos + cuentas + salas en vivo
```

Para sumar un juego nuevo: una carpeta en `juegos/<id>/` con su propio `index.html`. El servidor la sirve sola, sin
tocar nada más — y si usa `three.js` (u otra librería ya en `/node_modules`), no hace falta reinstalarla: los imports
absolutos (`/node_modules/…`) se resuelven siempre desde la raíz.

## Reino Caído: cómo se juega
1. Cada uno entra con **usuario y clave** (se registra en la pantalla de acceso, `/juegos/reino-caido/`) y crea su avatar (botón «Crear avatar»).
2. Un jugador **crea el torneo** (nombre + cantidad de peleas) y se convierte en el **anfitrión**: su PC corre el juego y lo transmite.
3. El anfitrión toca **«Transmitir»**, comparte la pestaña y le pasa el link a sus amigos (`/juegos/reino-caido/?t=CODIGO`).
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
- **Una base Postgres** (el proyecto usa [Supabase](https://supabase.com), gratis para este uso). Las tablas se crean solas al arrancar.
- **HTTPS** (para los micrófonos).

### Base de datos (Supabase)
1. Creá un proyecto en https://supabase.com (es gratis).
2. Andá a **Project Settings → Database → Connection string**, pestaña **URI**, y copiala. Se ve así:
   `postgresql://postgres:TU-CLAVE@db.xxxxxxxxxxxx.supabase.co:5432/postgres`
3. Esa URL completa es la variable `DATABASE_URL`. Es lo único que hace falta para la base.

### Variables de entorno
| Variable | Para qué |
|---|---|
| `DATABASE_URL` | La cadena de conexión de Supabase (ver arriba) |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Alternativa si no tenés la URL completa, sino los datos sueltos (puerto 5432 por defecto) |
| `AVATURN_SUBDOMAIN` | Subdominio de tu cuenta de Avaturn (por defecto `musicverse`) |
| `PORT` | Lo pone el hosting solo |

Comando de inicio: `npm start` (equivale a `node server.js`). Comprobación: `/salud` responde `ok` cuando la base está conectada.
El dominio se conecta entero a esta app (no hace falta subdominio aparte): `daxenworld.com` sirve el sitio y
`daxenworld.com/juegos/reino-caido` el juego.

### Más adelante (opcional): login con Google
Por ahora sólo se entra con usuario y clave. El login con Google ya está programado pero apagado: si algún día lo querés, poné la variable `GOOGLE_CLIENT_ID` y aparece el botón solo.
1. En https://console.cloud.google.com → *APIs y servicios* → *Credenciales* → **Crear credenciales → ID de cliente de OAuth** → tipo **Aplicación web**.
2. En **Orígenes de JavaScript autorizados** poné la dirección pública del juego (`https://tu-dominio.com`) y, para probar en tu PC, `http://localhost:5173`.
3. Copiá el **ID de cliente** y guardalo en la variable `GOOGLE_CLIENT_ID` (esa variable no está en la tabla de arriba a propósito). No hace falta el secreto: la credencial se verifica en el servidor.
4. En la pantalla de consentimiento agregá tu Gmail (y los de tus amigos) como usuarios de prueba, o publicá la app.

## Probar en tu PC
```
npm install
echo DATABASE_URL=postgresql://postgres:TU-CLAVE@db.xxxxxxxxxxxx.supabase.co:5432/postgres > .env.local
node --env-file=.env.local server.js
```
Abrí http://localhost:5173.

## Cosas a tener en cuenta
- **Los avatares (GLB de 5–15 MB) se guardan en la base** (columna `BYTEA`), así sobreviven a los redeploys del hosting. Máximo 5 avatares por cuenta.
- **El anfitrión aguanta el peso**: su PC corre el juego y sube video a cada amigo (~2–3 Mbps por persona). El servidor limita la sala a 14 conectados.
- **Trampa**: el anfitrión informa el resultado de cada pelea; se confía en él (es un juego entre amigos).
- Para conexiones entre redes muy restrictivas haría falta un servidor TURN propio (se usan STUN públicos de Google).
- Las tipografías vienen de Google Fonts.
