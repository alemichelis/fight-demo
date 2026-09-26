// Cliente de la API de server.js. Todo lo que toca disco pasa por acá.

async function pedir(url, opciones) {
  let r;
  try { r = await fetch(url, opciones); }
  catch (e) { throw new Error("No hay conexión con el servidor del motor (¿está corriendo `node server.js`?)"); }
  const tipo = r.headers.get("content-type") || "";
  const cuerpo = tipo.includes("json") ? await r.json() : null;
  if (!r.ok) throw new Error((cuerpo && cuerpo.msg) || `Error ${r.status} en ${url}`);
  return cuerpo;
}

const put = (url, body, type) => pedir(url, { method: "PUT", headers: { "Content-Type": type }, body });

export const api = {
  levels: () => pedir("/api/levels"),
  level: id => pedir(`/api/levels/${encodeURIComponent(id)}`),
  saveLevel: (id, data) => put(`/api/levels/${encodeURIComponent(id)}`, JSON.stringify(data), "application/json"),
  saveThumb: (id, blob) => put(`/api/levels/${encodeURIComponent(id)}/thumb`, blob, "image/png"),
  deleteLevel: id => pedir(`/api/levels/${encodeURIComponent(id)}`, { method: "DELETE" }),
  assets: () => pedir("/api/assets"),
  plugins: () => pedir("/api/plugins"),
  upload: (name, blob) => pedir(`/api/upload?name=${encodeURIComponent(name)}`, {
    method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: blob
  })
};

/* Convierte "Mi Nivel Épico!" en "mi-nivel-epico". Mismo criterio que el servidor,
   así el id que se ve es el que termina siendo el archivo. */
export function slug(texto) {
  return String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}
