// Sesión del navegador: token en localStorage + llamadas a la API con el token puesto.
// El login con Google usa Google Identity Services (el botón oficial) y el servidor verifica la credencial.

const LS = "reino.token";
const leer = () => { try { return localStorage.getItem(LS) || ""; } catch (e) { return ""; } };
const guardar = t => { try { t ? localStorage.setItem(LS, t) : localStorage.removeItem(LS); } catch (e) { /* sin almacenamiento: la sesión dura lo que la pestaña */ } };
let memoria = leer();

export const token = () => memoria;

export async function pedir(url, { metodo = "GET", cuerpo, tipo } = {}) {
  const cab = {};
  if (memoria) cab.Authorization = "Bearer " + memoria;
  let body;
  if (cuerpo instanceof Blob || cuerpo instanceof ArrayBuffer) { body = cuerpo; cab["Content-Type"] = tipo || "application/octet-stream"; }
  else if (cuerpo !== undefined) { body = JSON.stringify(cuerpo); cab["Content-Type"] = "application/json"; }
  let r;
  try { r = await fetch(url, { method: metodo, headers: cab, body }); }
  catch (e) { throw new Error("No hay conexión con el servidor."); }
  const d = (r.headers.get("content-type") || "").includes("json") ? await r.json() : {};
  if (!r.ok) { const e = new Error(d.msg || `Error ${r.status}`); e.status = r.status; throw e; }
  return d;
}

let config = null;
export const configuracion = async () => config || (config = await pedir("/api/config").catch(() => ({ google: null })));

/** Devuelve el usuario de la sesión guardada o null. */
export async function usuarioActual() {
  if (!memoria) return null;
  try { return (await pedir("/api/yo")).usuario; }
  catch (e) { if (e.status === 401) { memoria = ""; guardar(""); } return null; }
}

const abrir = d => { memoria = d.token; guardar(d.token); return d.usuario; };
export const registrar = (usuario, clave) => pedir("/api/registro", { metodo: "POST", cuerpo: { usuario, clave } }).then(abrir);
export const entrar = (usuario, clave) => pedir("/api/login", { metodo: "POST", cuerpo: { usuario, clave } }).then(abrir);
export const entrarConGoogle = credential => pedir("/api/google", { metodo: "POST", cuerpo: { credential } }).then(abrir);
export async function salir() { try { await pedir("/api/logout", { metodo: "POST" }); } catch (e) { /* ya caducó */ } memoria = ""; guardar(""); }

/* ---------------------------------------------------------------- formulario de acceso (lo usan el menú y la sala) */

let gsi = null;
const cargarGoogle = () => gsi || (gsi = new Promise((ok, mal) => {
  if (window.google?.accounts?.id) return ok();
  const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true;
  s.onload = ok; s.onerror = () => mal(new Error("No pude cargar Google")); document.head.append(s);
}));

/** Pinta el formulario en `el`. Resuelve con el usuario cuando inicia sesión. */
export function formularioAcceso(el, { titulo = "Entrá para jugar" } = {}) {
  return new Promise(async resolver => {
    el.innerHTML = `
      <div class="ac">
        <h2>${titulo}</h2>
        <div class="ac-google" hidden><div class="ac-gbtn"></div><div class="ac-o">o con usuario y clave</div></div>
        <div class="ac-tabs"><button data-m="login" class="on">Ya tengo cuenta</button><button data-m="registro">Crear cuenta</button></div>
        <label>Usuario<input class="ac-u" autocomplete="username" maxlength="20" spellcheck="false"></label>
        <label>Clave<input class="ac-c" type="password" autocomplete="current-password" maxlength="100"></label>
        <button class="ac-ok">Entrar</button>
        <p class="ac-err"></p>
      </div>`;
    const $ = s => el.querySelector(s); let modo = "login";
    const err = m => { $(".ac-err").textContent = m || ""; };
    el.querySelectorAll(".ac-tabs button").forEach(b => b.onclick = () => {
      modo = b.dataset.m; el.querySelectorAll(".ac-tabs button").forEach(x => x.classList.toggle("on", x === b));
      $(".ac-ok").textContent = modo === "login" ? "Entrar" : "Crear mi cuenta"; $(".ac-c").autocomplete = modo === "login" ? "current-password" : "new-password"; err("");
    });
    const enviar = async () => {
      err(""); $(".ac-ok").disabled = true;
      try { resolver(await (modo === "login" ? entrar : registrar)($(".ac-u").value.trim(), $(".ac-c").value)); }
      catch (e) { err(e.message); $(".ac-ok").disabled = false; }
    };
    $(".ac-ok").onclick = enviar;
    el.querySelectorAll("input").forEach(i => i.addEventListener("keydown", e => { if (e.key === "Enter") enviar(); }));

    const cfg = await configuracion();
    if (cfg.google) {
      try {
        await cargarGoogle();
        window.google.accounts.id.initialize({ client_id: cfg.google, callback: async r => { try { resolver(await entrarConGoogle(r.credential)); } catch (e) { err(e.message); } } });
        window.google.accounts.id.renderButton($(".ac-gbtn"), { theme: "filled_black", size: "large", text: "signin_with", shape: "pill", locale: "es", width: 280 });
        $(".ac-google").hidden = false;
      } catch (e) { err("Google no está disponible ahora: " + e.message); }
    }
  });
}
