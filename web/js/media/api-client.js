import { getIdToken } from "../auth/auth-service.js";

// Solo alcanzable por Tailscale por ahora (http, no https) — mixed-content
// bloqueará esto desde GitHub Pages hasta que Plan A tenga el Cloudflare
// Tunnel (https) listo. Cambiar entonces.
export const MEDIA_BASE_URL = "http://100.82.19.31:8081";

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

export async function uploadAudioFile(file, cancionId, version) {
  const form = new FormData();
  form.append("cancion_id", cancionId);
  form.append("version", version);
  form.append("file", file);

  const response = await authorizedFetch("/api/upload", {
    method: "POST",
    body: form,
  });
  return response.json();
}
