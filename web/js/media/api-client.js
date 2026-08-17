import { getIdToken } from "../auth/auth-service.js";

// Cloudflare Tunnel de Plan A (HTTPS, público) — reemplaza la IP de Tailscale
// directa (http://100.82.19.31:8081) desde 2026-08-17, resolviendo el bloqueo
// de mixed-content contra GitHub Pages. Pendiente: confirmar si Plan A activa
// Cloudflare Access sobre este hostname (ver docs/pendientes-plan-a.md).
export const MEDIA_BASE_URL = "https://k-api.rez-lex.com";

async function authorizedFetch(path, options = {}) {
  const idToken = await getIdToken();
  const response = await fetch(`${MEDIA_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${idToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Plan A respondió ${response.status} en ${path}`);
  }
  return response;
}

export async function requestMediaToken(cancionId, version) {
  const response = await authorizedFetch("/api/media-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cancion_id: cancionId, version }),
  });
  const data = await response.json();
  return { token: data.token, expiresInSeconds: data.expires_in };
}

export async function uploadMediaFile(file, cancionId, version, { signal } = {}) {
  const form = new FormData();
  form.append("cancion_id", cancionId);
  form.append("version", version);
  form.append("file", file);

  const response = await authorizedFetch("/api/upload", {
    method: "POST",
    body: form,
    signal,
  });
  return response.json();
}

// Best-effort: el endpoint es idempotente (404 si no existe), así que el
// caller no necesita manejar el resultado — se usa para no dejar huérfano en
// el storage de Plan A el archivo de una versión que se acaba de reemplazar.
export async function deleteMediaFile(cancionId, version) {
  try {
    await authorizedFetch(`/media/${cancionId}/${version}`, { method: "DELETE" });
  } catch {
    // Ignorado a propósito — ver comentario arriba.
  }
}
