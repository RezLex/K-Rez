import { MEDIA_BASE_URL, requestMediaToken } from "./api-client.js";

export async function getPlayableUrl(cancionId, version) {
  const { token } = await requestMediaToken(cancionId, version);
  return `${MEDIA_BASE_URL}/media/${cancionId}/${version}?token=${encodeURIComponent(token)}`;
}
