import { getPlayableUrl } from "../media/media-url.js";

export const TOKEN_REFRESH_MS = 10 * 60 * 1000;
export const OTHER_VERSION = { original: "karaoke", karaoke: "original" };

export function isVersionUsable(version) {
  return Boolean(version?.url);
}

export async function resolveVersionUrl(playerController, song, versionKey) {
  const version = song.versiones[versionKey];
  if (version.tipo === "archivo" && version.url) {
    const playableUrl = await getPlayableUrl(song.id, versionKey);
    playerController.setVersionUrl(versionKey, playableUrl);
  }
}

export function bufferColorClass(versionKey, song) {
  if (song.versiones[versionKey]?.tipo === "youtube") return "buffer-youtube";
  return versionKey === "original" ? "buffer-original-file" : "";
}
