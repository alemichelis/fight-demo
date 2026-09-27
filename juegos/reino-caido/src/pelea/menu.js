// Menú principal (liviano, sin 3D): cuenta, mis avatares, crear/unirse a un torneo, mis torneos y ranking.

import { usuarioActual, formularioAcceso, salir, pedir } from "./sesion.js";
import { abrirCreadorAvaturn } from "./avaturn.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mb = n => (n / 1048576).toFixed(1) + " MB";

export async function iniciarMenu() {
  document.querySelector("#carga")?.classList.add("off"); document.querySelector("#negro")?.classList.add("off");
  document.querySelector("#mundo").style.display = "none";
  document.body.classList.add("modo-menu");
  const ui = document.querySelector("#ui"); ui.style.pointerEvents = "auto";
  const raiz = document.createElement("div"); raiz.className = "mn"; ui.append(raiz);
  const cab = () => `<header class="mn-cab"><div><div class="kicker">Torneo de las Sombras</div><h1>Reino Caído</h1></div><div class="mn-user"></div></header>`;

  async function pantalla() {
    const u = await usuarioActual();
    if (!u) {
      raiz.innerHTML = cab() + `<main class="mn-centro"><div class="mn-caja"><div class="mn-form"></div></div></main>`;
      await formularioAcceso(raiz.querySelector(".mn-form"), { titulo: "Entrá para crear tu avatar y pelear" });
      return pantalla();
    }
    return principal(u);
  }

  async function principal(u) {
    raiz.innerHTML = cab() + `
      <main class="mn-grilla">
        <section class="mn-caja mn-av"><h2>Mis avatares</h2><div class="mn-avs"></div></section>
        <section class="mn-caja"><h2>Crear un torneo</h2>
          <label>Nombre<input class="t-nombre" maxlength="60" placeholder="Copa de los Amigos" value="Torneo de ${esc(u.nombre)}"></label>
          <label>Cantidad de peleas<select class="t-peleas"><option>5</option><option selected>10</option><option>15</option><option>20</option><option>30</option><option>50</option></select></label>
          <label>Peleás con<select class="t-avatar"></select></label>
          <button class="mn-primario t-crear">Crear y abrir la arena</button><p class="mn-err t-err"></p>
          <p class="mn-nota">Vos hacés de anfitrión: tu computadora corre el juego y lo transmite. Cuando gana alguien, sus amigos tienen 1 minuto para entrar a desafiarlo.</p>
        </section>
        <section class="mn-caja"><h2>Unirme a un torneo</h2>
          <label>Código del torneo<input class="u-cod" maxlength="8" placeholder="K7QF2" autocapitalize="characters"></label>
          <button class="mn-primario u-ir">Entrar a la sala</button><p class="mn-err u-err"></p>
        </section>
        <section class="mn-caja"><h2>Mis torneos</h2><div class="mn-lista mt"></div></section>
        <section class="mn-caja"><h2>Ranking mundial</h2><div class="mn-lista rk"></div></section>
      </main>
      <div class="mn-modal" hidden></div>`;
    const $ = s => raiz.querySelector(s);
    $(".mn-user").innerHTML = `${u.foto ? `<img src="${esc(u.foto)}" alt="" referrerpolicy="no-referrer">` : ""}<span>${esc(u.nombre)}</span><button class="mn-salir">Salir</button>`;
    $(".mn-salir").onclick = async () => { await salir(); pantalla(); };

    /* ---- avatares */
    let avatares = [];
    const pintarAvatares = async () => {
      const d = await pedir("/api/avatares"); avatares = d.avatares;
      $(".mn-avs").innerHTML = avatares.map(a => `<div class="mn-avc"><div class="mn-sil">🥷</div><b>${esc(a.nombre)}</b><small>${mb(a.tam)}</small><button data-b="${a.id}" title="Borrar">✕</button></div>`).join("")
        + (avatares.length < d.max ? `<button class="mn-avc mn-nuevo"><div class="mn-sil">+</div><b>Crear avatar</b><small>con Avaturn · desde una selfie</small></button>` : "");
      $(".mn-avs").querySelectorAll("[data-b]").forEach(b => b.onclick = async e => { e.stopPropagation(); if (confirm("¿Borrar este avatar?")) { await pedir(`/api/avatares/${b.dataset.b}`, { metodo: "DELETE" }); pintarAvatares(); } });
      const nuevo = $(".mn-nuevo"); if (nuevo) nuevo.onclick = async () => { const r = await abrirCreadorAvaturn(document.body, { sugerido: u.nombre.toUpperCase().slice(0, 12) }); if (r) pintarAvatares(); };
      $(".t-avatar").innerHTML = avatares.length ? avatares.map(a => `<option value="${a.id}">${esc(a.nombre)}</option>`).join("") : `<option value="">— creá un avatar primero —</option>`;
    };
    await pintarAvatares();

    /* ---- crear / unirse */
    $(".t-crear").onclick = async () => {
      const av = $(".t-avatar").value; if (!av) { $(".t-err").textContent = "Primero creá tu avatar con Avaturn."; return; }
      $(".t-crear").disabled = true; $(".t-err").textContent = "";
      try {
        const t = await pedir("/api/torneos", { metodo: "POST", cuerpo: { nombre: $(".t-nombre").value, peleas: $(".t-peleas").value } });
        location.href = `/juegos/reino-caido/?arena=${t.codigo}&av=${av}`;
      } catch (e) { $(".t-err").textContent = e.message; $(".t-crear").disabled = false; }
    };
    const unirse = () => { const c = $(".u-cod").value.trim().toUpperCase(); if (c.length < 4) { $(".u-err").textContent = "Escribí el código que te pasaron."; return; } location.href = `/juegos/reino-caido/?t=${encodeURIComponent(c)}`; };
    $(".u-ir").onclick = unirse; $(".u-cod").addEventListener("keydown", e => { if (e.key === "Enter") unirse(); });

    /* ---- mis torneos y ranking */
    const detalle = async codigo => {
      const m = $(".mn-modal"); m.hidden = false; m.innerHTML = `<div class="mn-caja mn-det"><p>Cargando…</p></div>`;
      try {
        const d = await pedir(`/api/torneos/${codigo}`), t = d.torneo;
        m.innerHTML = `<div class="mn-caja mn-det"><button class="mn-x">✕</button>
          <h2>${esc(t.nombre)}</h2><p class="mn-sub">Código <b>${esc(t.codigo)}</b> · ${t.jugadas}/${t.total} peleas · ${t.estado === "terminado" ? `Terminado${t.campeon ? ` — 🏆 ${esc(t.campeon)}` : ""}` : "En curso"}</p>
          ${tablaHTML(d.tabla)}
          <h3>Últimas peleas</h3>${d.peleas.length ? d.peleas.map(p => `<div class="mn-fila"><span><b>${esc(p.ganador)}</b> venció a ${esc(p.perdedor)}</span><em>${p.rondas_ganador}-${p.rondas_perdedor}</em></div>`).join("") : "<p class='mn-nota'>Todavía no hubo peleas.</p>"}</div>`;
        m.querySelector(".mn-x").onclick = () => { m.hidden = true; };
      } catch (e) { m.innerHTML = `<div class="mn-caja mn-det"><button class="mn-x">✕</button><p class="mn-err">${esc(e.message)}</p></div>`; m.querySelector(".mn-x").onclick = () => { m.hidden = true; }; }
    };
    const tablaHTML = filas => filas.length ? `<div class="mn-tabla"><div class="mn-fila mn-th"><span>#</span><span>Jugador</span><em>V</em><em>D</em></div>${filas.map((f, i) => `<div class="mn-fila"><span>${i + 1}</span><span>${f.foto ? `<img src="${esc(f.foto)}" alt="" referrerpolicy="no-referrer">` : ""}${esc(f.nombre)}</span><em>${f.victorias}</em><em>${f.derrotas}</em></div>`).join("")}</div>` : "<p class='mn-nota'>Sin resultados todavía.</p>";
    try {
      const { torneos } = await pedir("/api/mis-torneos");
      $(".mt").innerHTML = torneos.length ? torneos.map(t => `<div class="mn-fila"><span><b>${esc(t.nombre)}</b><small>${esc(t.codigo)} · ${t.jugadas}/${t.total}${t.estado === "terminado" ? " · terminado" : ""}</small></span>
        <span class="mn-bts">${t.soy_creador && t.estado === "abierto" ? `<button data-a="${t.codigo}">Abrir arena</button>` : ""}<button data-v="${t.codigo}">Ver</button></span></div>`).join("") : "<p class='mn-nota'>Todavía no participaste en ningún torneo.</p>";
      $(".mt").querySelectorAll("[data-v]").forEach(b => b.onclick = () => detalle(b.dataset.v));
      $(".mt").querySelectorAll("[data-a]").forEach(b => b.onclick = () => { const av = $(".t-avatar").value; if (!av) { alert("Primero creá tu avatar con Avaturn."); return; } location.href = `/juegos/reino-caido/?arena=${b.dataset.a}&av=${av}`; });
    } catch (e) { $(".mt").innerHTML = `<p class="mn-err">${esc(e.message)}</p>`; }
    try {
      const { ranking } = await pedir("/api/ranking");
      $(".rk").innerHTML = ranking.length ? `<div class="mn-fila mn-th"><span>Jugador</span><em>🏆</em><em>V</em><em>D</em></div>` + ranking.slice(0, 15).map((f, i) => `<div class="mn-fila"><span>${i + 1}. ${esc(f.nombre)}</span><em>${f.titulos}</em><em>${f.victorias}</em><em>${f.derrotas}</em></div>`).join("") : "<p class='mn-nota'>Aún no hay peleas registradas.</p>";
    } catch (e) { $(".rk").innerHTML = `<p class="mn-err">${esc(e.message)}</p>`; }
  }

  pantalla().catch(e => { raiz.innerHTML = cab() + `<main class="mn-centro"><div class="mn-caja"><p class="mn-err">${esc(e.message)}</p></div></main>`; });
}
