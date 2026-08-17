import { getPlayableUrl } from "../media/media-url.js";

export const TOKEN_REFRESH_MS = 10 * 60 * 1000;
export const OTHER_VERSION = { original: "karaoke", karaoke: "original" };

export function isVersionUsable(version) {
  return Boolean(version?.url);
}

export function isMixActive(song) {
  return Boolean(song.versiones.karaoke?.url) && Boolean(song.versiones.karaoke?.vocalsUrl);
}

export async function resolveVersionUrl(playerController, song, versionKey) {
  const version = song.versiones[versionKey];
  if (version.tipo === "archivo" && version.url) {
    const playableUrl = await getPlayableUrl(song.id, versionKey);
    playerController.setVersionUrl(versionKey, playableUrl);
  }
}

// Para el fondo reactivo al audio (ver audio-reactive-bg.js): solo se puede
// analizar una versión de ARCHIVO (YouTube es un iframe cross-origin, sin
// forma de leer su audio). Devuelve la URL tokenizada ya resuelta por
// resolveVersionUrl (que la deja escrita en song.versiones[versionKey].url),
// o null si la versión activa es de YouTube o no hay ninguna cargada.
export function activeFileUrl(song, versionKey) {
  if (!versionKey) return null;
  const version = song.versiones[versionKey];
  return version?.tipo === "archivo" ? version.url : null;
}

export async function resolveMixUrls(song) {
  const [instrumentalUrl, vocalsUrl] = await Promise.all([
    getPlayableUrl(song.id, "karaoke"),
    getPlayableUrl(song.id, "vocals"),
  ]);
  return { instrumentalUrl, vocalsUrl };
}

export function bufferColorClass(versionKey, song) {
  if (song.versiones[versionKey]?.tipo === "youtube") return "buffer-youtube";
  return versionKey === "original" ? "buffer-original-file" : "";
}
