// Creador de avatares con Avaturn: abre el editor oficial (SDK en un iframe), recibe el GLB exportado y lo guarda en la cuenta del
// jugador (POST /api/avatares → MySQL). Si el editor no devuelve el modelo queda la salida manual: subir el GLB descargado.

import { pedir, configuracion } from "./sesion.js";
import { FIGHT, ZOMBIE_ANIMS } from "./personajes.js";

const SDK = "https://cdn.jsdelivr.net/npm/@avaturn/sdk/dist/index.js";
const COLORES = ["#3fb6ff", "#ff5fa8", "#ffd23f", "#7dffb0", "#c05bff", "#ff8f3f"];

/** Definición jugable de un avatar guardado: mismo rig que Avaturn, con los FBX de pelea retargeteados. */
export function defAvatar({ avatarId, jugador, avatar }, slot = 0) {
  return {
    id: `av${avatarId}`, nombre: String(jugador || "JUGADOR").toUpperCase().slice(0, 12), titulo: String(avatar || "Avaturn"), color: COLORES[slot % COLORES.length],
    modelo: `/api/avatar/${avatarId}.glb`,
    anims: [{ url: ZOMBIE_ANIMS, modo: "retarget" }, { url: "/assets/models/avatar-moves.glb", modo: "propio" }],
    retarget: true, fbx: FIGHT, altura: 1.75, custom: true
  };
}

function encontrarModelo(data) {
  if (!data) return null;
  if (typeof data.url === "string" && data.url) return data.url;
  for (const v of Object.values(data)) if (typeof v === "string" && (v.startsWith("blob:") || /^data:(model|application)\//.test(v))) return v;
  return null;
}

/** Resuelve con { id, nombre } del avatar ya guardado en la cuenta, o null si se cancela. */
export function abrirCreadorAvaturn(contenedor, { sugerido = "HEROE" } = {}) {
  return new Promise(async resolver => {
    const cfg = await configuracion(), sub = cfg.avaturn || "musicverse";
    const el = document.createElement("div"); el.className = "modal-av";
    el.innerHTML = `
      <div class="ma-caja">
        <div class="ma-cab"><b>Crear avatar · Avaturn</b><button class="ma-x" title="Cerrar">✕</button></div>
        <div class="ma-barra">
          <label>Nombre del avatar <input class="ma-nombre" maxlength="12" value="${sugerido}"></label>
          <button class="ma-reabrir">Reabrir editor</button>
          <button class="ma-subir">Subir un GLB</button><input type="file" accept=".glb,model/gltf-binary" hidden>
        </div>
        <div class="ma-host"><p>Abriendo el editor de Avaturn…</p></div>
        <div class="ma-estado"></div>
      </div>`;
    contenedor.append(el);
    const $ = s => el.querySelector(s), host = $(".ma-host"), estado = $(".ma-estado");
    let cerrado = false;
    const cerrar = r => { if (cerrado) return; cerrado = true; el.remove(); resolver(r || null); };
    $(".ma-x").onclick = () => cerrar(null);
    el.addEventListener("keydown", e => e.stopPropagation());

    async function guardar(blob) {
      estado.textContent = "Guardando tu avatar…";
      try {
        const nombre = ($(".ma-nombre").value || "HEROE").trim();
        const r = await pedir(`/api/avatares?nombre=${encodeURIComponent(nombre)}`, { metodo: "POST", cuerpo: blob });
        cerrar({ id: r.id, nombre: r.nombre });
      } catch (e) { estado.textContent = "No se pudo guardar: " + e.message; }
    }

    async function abrirEditor() {
      host.innerHTML = "<p>Abriendo el editor de Avaturn…</p>";
      try {
        const { AvaturnSDK } = await import(/* @vite-ignore */ SDK);
        const sdk = new AvaturnSDK(); host.replaceChildren();
        await sdk.init(host, { url: `https://${sub}.avaturn.dev` });
        sdk.on("export", async data => {
          const origen = encontrarModelo(data);
          if (!origen) { estado.textContent = "Avaturn terminó pero no devolvió un modelo. Probá con «Subir un GLB»."; return; }
          try { guardar(await (await fetch(origen)).blob()); } catch (e) { estado.textContent = "No pude leer el modelo: " + e.message; }
        });
      } catch (e) { host.innerHTML = `<p class="err">No pude abrir el editor de Avaturn: ${e.message}<br>Podés descargar tu avatar desde Avaturn y usar «Subir un GLB».</p>`; }
    }
    $(".ma-reabrir").onclick = abrirEditor;
    const inp = el.querySelector("input[type=file]");
    $(".ma-subir").onclick = () => inp.click();
    inp.onchange = () => { if (inp.files[0]) guardar(inp.files[0]); };
    abrirEditor();
  });
}
