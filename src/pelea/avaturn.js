// Creador de personajes con Avaturn dentro del juego: abre el editor (SDK oficial en un iframe), recibe el GLB exportado,
// lo sube al servidor (assets/uploads) y lo registra como luchador. Los personajes creados se guardan en localStorage.
// Si el editor no dispara el evento de export, queda la salida manual: subir el GLB descargado de Avaturn.

import { api } from "../core/api.js";
import { ROSTER, FIGHT, ZOMBIE_ANIMS } from "./personajes.js";

const SDK = "https://cdn.jsdelivr.net/npm/@avaturn/sdk/dist/index.js";
const LS = "pelea.personajes";
const LS_SUB = "pelea.avaturn.subdominio";
const COLORES = ["#3fb6ff", "#ff5fa8", "#ffd23f", "#7dffb0", "#c05bff", "#ff8f3f"];

const leer = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento: no se persiste */ } };

export const MAX_CUSTOM = 6;

/** Definición jugable para un GLB de Avaturn (mismo rig que el avatar base: usa sus clips y los FBX de pelea retargeteados). */
export function defAvaturn({ id, nombre, modelo }, n) {
  return {
    id, nombre: nombre.toUpperCase().slice(0, 12), titulo: "Creado con Avaturn", color: COLORES[n % COLORES.length], modelo,
    anims: [{ url: ZOMBIE_ANIMS, modo: "retarget" }, { url: "/assets/models/avatar-moves.glb", modo: "propio" }],
    retarget: true, fbx: FIGHT, altura: 1.75, custom: true
  };
}

/** Recupera los personajes creados en sesiones anteriores y los suma al plantel. */
export function cargarPersonajesGuardados() {
  const lista = leer(LS, []);
  lista.forEach((p, i) => { if (!ROSTER.some(r => r.id === p.id)) ROSTER.push(defAvaturn(p, i)); });
}

export function borrarPersonaje(id) {
  const i = ROSTER.findIndex(r => r.id === id && r.custom);
  if (i >= 0) ROSTER.splice(i, 1);
  guardar(LS, leer(LS, []).filter(p => p.id !== id));
}

function encontrarModelo(data) {
  if (!data) return null;
  if (typeof data.url === "string" && data.url) return data.url;
  for (const v of Object.values(data)) if (typeof v === "string" && (v.startsWith("blob:") || /^data:(model|application)\//.test(v))) return v;
  return null;
}

/**
 * Abre el creador. Resuelve con la definición nueva (ya registrada en ROSTER) o null si se cancela.
 * `alTeclado(bool)` avisa a la pantalla que ignore el teclado mientras el modal está abierto.
 */
export function abrirCreadorAvaturn(contenedor) {
  return new Promise(resolver => {
    const el = document.createElement("div"); el.className = "modal-av";
    el.innerHTML = `
      <div class="ma-caja">
        <div class="ma-cab"><b>Crear personaje · Avaturn</b><button class="ma-x" title="Cerrar">✕</button></div>
        <div class="ma-barra">
          <label>Nombre <input class="ma-nombre" maxlength="12" placeholder="MI HEROE" value="HEROE ${leer(LS, []).length + 1}"></label>
          <label>Subdominio <input class="ma-sub" value="${leer(LS_SUB, "musicverse")}"><span>.avaturn.dev</span></label>
          <button class="ma-reabrir">Abrir editor</button>
          <button class="ma-subir">Subir un GLB</button><input type="file" accept=".glb,model/gltf-binary" hidden>
        </div>
        <div class="ma-host"><p>Abriendo el editor de Avaturn…</p></div>
        <div class="ma-estado"></div>
      </div>`;
    contenedor.append(el);
    const $ = s => el.querySelector(s), host = $(".ma-host"), estado = $(".ma-estado");
    let cerrado = false;
    const cerrar = def => { if (cerrado) return; cerrado = true; el.remove(); resolver(def || null); };
    $(".ma-x").onclick = () => cerrar(null);
    el.addEventListener("keydown", e => e.stopPropagation());

    async function registrar(blob) {
      estado.textContent = "Guardando el personaje en el servidor…";
      try {
        const nombre = ($(".ma-nombre").value || "HEROE").trim();
        const id = `av-${Date.now().toString(36)}`;
        const r = await api.upload(`${id}.glb`, blob);
        const p = { id, nombre, modelo: "/" + String(r.path).replace(/^\/+/, "") };
        const lista = leer(LS, []); lista.push(p); guardar(LS, lista);
        const def = defAvaturn(p, lista.length - 1); ROSTER.push(def);
        cerrar(def);
      } catch (e) { estado.textContent = "No se pudo guardar: " + e.message; }
    }

    async function abrirEditor() {
      const sub = $(".ma-sub").value.trim().replace(/\.avaturn\.dev.*$/, "") || "musicverse"; guardar(LS_SUB, sub);
      host.innerHTML = "<p>Abriendo el editor de Avaturn…</p>";
      try {
        const { AvaturnSDK } = await import(/* @vite-ignore */ SDK);
        const sdk = new AvaturnSDK(); host.replaceChildren();
        await sdk.init(host, { url: `https://${sub}.avaturn.dev` });
        sdk.on("export", async data => {
          const origen = encontrarModelo(data);
          if (!origen) { estado.textContent = "Avaturn terminó pero no devolvió un modelo. Probá con «Subir un GLB»."; return; }
          try { registrar(await (await fetch(origen)).blob()); } catch (e) { estado.textContent = "No pude leer el modelo: " + e.message; }
        });
      } catch (e) { host.innerHTML = `<p class="err">No pude abrir el editor de Avaturn: ${e.message}<br>Subdominio usado: ${sub}.avaturn.dev — cambialo arriba o subí un GLB.</p>`; }
    }
    $(".ma-reabrir").onclick = abrirEditor;
    const inp = el.querySelector("input[type=file]");
    $(".ma-subir").onclick = () => inp.click();
    inp.onchange = () => { if (inp.files[0]) registrar(inp.files[0]); };
    abrirEditor();
  });
}
