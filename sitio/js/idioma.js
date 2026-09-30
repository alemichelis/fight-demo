/* Daxenworld · idioma (español / inglés)
   El HTML de todo el sitio está escrito en español; en inglés se traduce en el navegador con el diccionario de
   /js/en.js. Cada página se carga así, en el <head> y antes que cualquier otro script:

     <html lang="es" data-i18n="pov">                 ← ámbito del diccionario (lo común vale en todas)
     <script src="/js/idioma.js"></script>
     <script src="/js/en.js"></script>

   El idioma sale de ?lang=en|es, si no de lo que la persona eligió antes (localStorage) y si no, del navegador.
   Lo que el JS de la página inserta después en el DOM se traduce solo (MutationObserver); para textos que se
   escriben letra por letra o se arman con datos, usar t("texto en español").
   El selector ES / EN se dibuja en cualquier elemento con el atributo data-idioma. */
(function () {
  "use strict";
  var CLAVE = "dx-idioma";
  var q = null, guardado = null;
  try { q = new URLSearchParams(location.search).get("lang"); } catch (e) {}
  try { guardado = localStorage.getItem(CLAVE); } catch (e) {}
  var valido = function (l) { return l === "es" || l === "en"; };
  if (valido(q)) { try { localStorage.setItem(CLAVE, q); } catch (e) {} }
  var idioma = valido(q) ? q : valido(guardado) ? guardado : (/^es\b/i.test(navigator.language || "es") ? "es" : "en");
  var EN = idioma === "en";
  window.DX_IDIOMA = idioma;
  document.documentElement.lang = idioma;

  var estilo = document.createElement("style");
  estilo.textContent =
    "html.dx-traduciendo body{visibility:hidden}" +
    ".dx-idioma{display:inline-flex;align-items:center;gap:2px;padding:3px;border-radius:999px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.3);font-family:inherit;font-size:11px;font-weight:600;line-height:1;letter-spacing:.08em}" +
    ".dx-idioma button{font:inherit;letter-spacing:inherit;color:inherit;background:none;border:0;cursor:pointer;padding:6px 9px;border-radius:999px;opacity:.55;transition:opacity .2s,background .2s}" +
    ".dx-idioma button:hover{opacity:1}.dx-idioma button[aria-pressed=true]{opacity:1;background:rgba(255,255,255,.16)}";
  document.head.appendChild(estilo);
  if (EN) document.documentElement.classList.add("dx-traduciendo");

  /* ---------------------------------------------------------------- diccionario */
  var DIC = {}, PATRONES = [];
  var tiene = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  // ambitos: { comun: {"es": "en"}, pov: {...} } · patrones: [[/regex/, "reemplazo" | function (m, ...grupos)]]
  window.dxDiccionario = function (ambitos, patrones) {
    for (var a in ambitos) { DIC[a] = DIC[a] || {}; for (var k in ambitos[a]) DIC[a][k] = ambitos[a][k]; }
    if (patrones) PATRONES = PATRONES.concat(patrones);
  };
  function buscar(s) {
    var a = document.documentElement.getAttribute("data-i18n"), d;
    if (a && (d = DIC[a]) && tiene(d, s)) return d[s];
    if ((d = DIC.comun) && tiene(d, s)) return d[s];
    for (var i = 0; i < PATRONES.length; i++) {
      var m = s.match(PATRONES[i][0]);
      if (m) return typeof PATRONES[i][1] === "function" ? PATRONES[i][1].apply(null, m) : s.replace(PATRONES[i][0], PATRONES[i][1]);
    }
    // «Juegos · Reino Caído», «RIFLE DE ASALTO · EQUIPADA»: se traduce cada parte por separado
    if (s.indexOf(" · ") > 0) {
      var cambio = false, partes = s.split(" · ").map(function (p) { var r = buscar(p); if (r !== null) { cambio = true; return r; } return p; });
      return cambio ? partes.join(" · ") : null;
    }
    return null;
  }
  // Traduce conservando los espacios de los bordes (los nodos de texto del HTML los traen). null = no hay traducción.
  function traducir(texto) {
    var clave = texto.replace(/\s+/g, " ").trim();
    if (!clave) return null;
    var r = buscar(clave);
    if (r === null || r === clave) return null;
    return texto.match(/^\s*/)[0] + r + texto.match(/\s*$/)[0];
  }
  window.t = function (s) { if (!EN) return s; var r = traducir(String(s)); return r === null ? s : r; };

  /* ---------------------------------------------------------------- DOM */
  var ATRIBUTOS = ["alt", "aria-label", "placeholder", "title"];
  var SALTEAR = /^(SCRIPT|STYLE|TEXTAREA|CODE|PRE)$/;
  function traducirNodo(n) {
    if (n.nodeType === 3) {
      if (n.parentNode && SALTEAR.test(n.parentNode.nodeName)) return;
      var r = traducir(n.data); if (r !== null) n.data = r;
      return;
    }
    if (n.nodeType !== 1 || n.hasAttribute("data-no-traducir")) return;
    for (var i = 0; i < ATRIBUTOS.length; i++) traducirAtributo(n, ATRIBUTOS[i]);
    if (SALTEAR.test(n.nodeName)) return;                    // de un <textarea> se traduce el placeholder, no lo que escribió la persona
    for (var c = n.firstChild; c; c = c.nextSibling) traducirNodo(c);
  }
  function traducirAtributo(el, a) {
    var v = el.getAttribute(a); if (!v) return;
    var r = traducir(v); if (r !== null) el.setAttribute(a, r);
  }
  function traducirTodo() {
    document.title = window.t(document.title);
    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute("content", window.t(desc.getAttribute("content")));
    traducirNodo(document.body);
    new MutationObserver(function (cambios) {
      cambios.forEach(function (c) {
        if (c.type === "childList") c.addedNodes.forEach(function (n) { if (!(n.parentNode && n.parentNode.closest && n.parentNode.closest("[data-no-traducir]"))) traducirNodo(n); });
        else if (c.type === "characterData") traducirNodo(c.target);
        else if (c.type === "attributes") traducirAtributo(c.target, c.attributeName);
      });
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });
  }

  /* ---------------------------------------------------------------- selector ES / EN */
  function cambiar(l) {
    if (l === idioma) return;
    try { localStorage.setItem(CLAVE, l); } catch (e) {}
    var u = new URL(location.href);
    if (u.searchParams.has("lang")) { u.searchParams.set("lang", l); location.replace(u.href); }
    else location.reload();
  }
  function pintarSelectores() {
    var enMarco = false;
    try { enMarco = window.self !== window.top; } catch (e) { enMarco = true; }
    document.querySelectorAll("[data-idioma]").forEach(function (el) {
      if (enMarco) { el.hidden = true; return; }     // dentro de la vitrina de /menues manda la página de afuera
      el.classList.add("dx-idioma");
      el.setAttribute("role", "group");
      el.setAttribute("aria-label", EN ? "Language" : "Idioma");
      el.setAttribute("data-no-traducir", "");
      el.innerHTML = ["es", "en"].map(function (l) {
        return '<button type="button" lang="' + l + '" aria-pressed="' + (l === idioma) + '" title="' + (l === "es" ? "Español" : "English") + '">' + l.toUpperCase() + "</button>";
      }).join("");
      el.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) cambiar(b.getAttribute("lang")); });
    });
  }

  function listo() {
    pintarSelectores();
    if (EN) { try { traducirTodo(); } finally { document.documentElement.classList.remove("dx-traduciendo"); } }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", listo); else listo();
  if (EN) setTimeout(function () { document.documentElement.classList.remove("dx-traduciendo"); }, 2500);   // por si algo falla, nunca dejar la página oculta
})();
