import { h } from "../utils/dom-helpers.js";
import { PlayerController } from "./player-controller.js";
import {
  TOKEN_REFRESH_MS,
  OTHER_VERSION,
  isVersionUsable,
  isMixActive,
  resolveVersionUrl,
  resolveMixUrls,
  activeFileUrl,
} from "./version-resolution.js";
import * as audioReactiveBg from "./audio-reactive-bg.js";

// Sesión de reproducción a nivel de módulo, separada del ciclo de vida de
// cada vista — vive mientras el usuario esté en Live o Config de la MISMA
// canción, así que navegar entre esas dos rutas no corta el audio ni pierde
// la posición (antes cada vista creaba y destruía su propio
// PlayerController al montar/desmontar).
let session = null;

function isSameSongRoute(path, songId) {
  return path === `/songs/${songId}` || path === `/songs/${songId}/config`;
}

// Único listener global: si la navegación deja las rutas de esta canción
// (a /songs, a otra canción, a /songs/:id/edit, etc.), no queda nada más
// que vaya a volver a pedir la sesión — hay que cortarla acá, si no el
// audio sigue sonando en segundo plano sin ninguna UI que lo controle.
window.addEventListener("hashchange", () => {
  if (!session) return;
  const path = location.hash.slice(1) || "/";
  if (!isSameSongRoute(path, session.songId)) destroyPlayerSession();
});

export function destroyPlayerSession() {
  if (!session) return;
  if (session.refreshHandle) clearInterval(session.refreshHandle);
  session.playerController.destroy();
  audioReactiveBg.stop();
  session = null;
}

// Sincrónica a propósito: arranca (o continúa) la carga en background vía
// session.loadPromise en vez de bloquear — así una vista que se monta sobre
// una sesión ya lista puede seguir de largo sin esperar nada, y una que
// arranca de cero puede awaitear ese mismo promise para mostrar "Cargando..."
// / manejar el error, igual que antes.
export function getPlayerSession(song) {
  if (session?.songId === song.id) return session;
  destroyPlayerSession();
  session = createSession(song);
  return session;
}

function createSession(song) {
  const coverArt = h("img", { class: "cover-art hidden" });
  const youtubeContainer = h("div", { class: "youtube-container" }, [coverArt]);
  const playerController = new PlayerController(song, { youtubeContainer });
  audioReactiveBg.startIdleLoop();
  playerController.on("play", () => audioReactiveBg.setPlaying(true));
  playerController.on("pause", () => audioReactiveBg.setPlaying(false));
  playerController.on("ended", () => audioReactiveBg.setPlaying(false));

  const mixMode = isMixActive(song);
  const initialKey = mixMode
    ? "mix"
    : isVersionUsable(song.versiones.original)
    ? "original"
    : isVersionUsable(song.versiones.karaoke)
    ? "karaoke"
    : null;

  const newSession = {
    songId: song.id,
    playerController,
    youtubeContainer,
    coverArt,
    mixMode,
    initialKey,
    isReady: false,
    refreshHandle: null,
    loadPromise: Promise.resolve(),
  };

  if (initialKey) {
    newSession.loadPromise = startPlayback(newSession, song);
  }

  return newSession;
}

async function startPlayback(activeSession, song) {
  const { playerController, mixMode, initialKey } = activeSession;

  if (mixMode) {
    const { instrumentalUrl, vocalsUrl } = await resolveMixUrls(song);
    await playerController.loadMix(instrumentalUrl, vocalsUrl);
    audioReactiveBg.setActiveFileUrl(instrumentalUrl);
  } else {
    await resolveVersionUrl(playerController, song, initialKey);
    await playerController.loadVersion(initialKey);
    audioReactiveBg.setActiveFileUrl(activeFileUrl(song, initialKey));
    const otherKey = OTHER_VERSION[initialKey];
    if (isVersionUsable(song.versiones[otherKey])) {
      resolveVersionUrl(playerController, song, otherKey).then(() =>
        playerController.preloadVersion(otherKey)
      );
    }
  }

  activeSession.isReady = true;
  activeSession.refreshHandle = setInterval(async () => {
    if (mixMode) {
      const { instrumentalUrl, vocalsUrl } = await resolveMixUrls(song);
      await playerController.reloadMix(instrumentalUrl, vocalsUrl);
      audioReactiveBg.setActiveFileUrl(instrumentalUrl);
      return;
    }
    const activeKey = playerController.activeVersionKey;
    if (song.versiones[activeKey]?.tipo !== "archivo") return;
    await resolveVersionUrl(playerController, song, activeKey);
    await playerController.reloadActiveVersion();
    audioReactiveBg.setActiveFileUrl(activeFileUrl(song, activeKey));
  }, TOKEN_REFRESH_MS);
}
