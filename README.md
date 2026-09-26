# Reino Caído — carpeta lista para subir

Necesita **Node 18+** (no es un sitio estático: el servidor guarda los personajes de Avaturn y coordina las salas online).

## Subir a un hosting
1. Subí esta carpeta entera (con `node_modules/ws` ya incluido, no hace falta `npm install`; si tu hosting lo corre igual, no rompe nada).
2. Comando de inicio: `node server.js` (o `npm start`). Usa la variable `PORT` que ponga el hosting.
3. Abrí la URL pública: el juego está en `/`.

Sirve cualquier hosting con Node y WebSocket: Render, Railway, Fly.io, un VPS, etc. Los hostings puramente estáticos
(GitHub Pages, Netlify, Vercel estático) muestran el juego pero **no** funcionan ni las salas online ni guardar personajes de Avaturn.

## Salas online
Con HTTPS (lo dan los hostings de arriba) los links de sala salen con la dirección pública y los micrófonos funcionan.
Desde un VPS propio: ponele HTTPS (Caddy/nginx + certificado) o el micrófono no se podrá abrir.

## Ojo
- Los personajes de Avaturn se guardan en `assets/uploads/`. En hostings con disco efímero (plan gratis de Render, Heroku) se borran al reiniciar: montá un volumen o aceptá que se pierdan.
- Un servidor de salas STUN público no atraviesa todas las redes; para eso haría falta un TURN propio.
- Las tipografías vienen de Google Fonts (hace falta internet del lado del jugador).

## Probar en local
`node server.js` → http://localhost:5173
