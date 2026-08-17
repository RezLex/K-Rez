import { h, mount } from "../utils/dom-helpers.js";
import { getSong } from "../data/songs-repo.js";
import { getPlayableUrl } from "../media/media-url.js";
import { OTHER_VERSION, isVersionUsable, resolveVersionUrl, activeFileUrl } from "../player/version-resolution.js";
import { getPlayerSession } from "../player/player-session.js";
import { createPlayerBar } from "../player/player-bar.js";
import { createMixSlider } from "../player/mix-control.js";
import * as audioReactiveBg from "../player/audio-reactive-bg.js";
import { attachLyricsPlayback } from "../lyrics/lyrics-playback.js";
import { navigate } from "../router.js";
import { createSongsSidebar, takeAutoplayRequest } from "./songs-sidebar.js";
import { renderSongHeader } from "./song-header.js";
import { applyCoverAccent, clearCoverAccent, trackGlowPosition, stopTrackingGlowPosition } from "./cover-accent.js";

const LIVE_BLOCKED_KEY = "k-rez-live-blocked";
const VERSION_LABEL = { original: "Original", karaoke: "Karaoke" };

// "[algo]" es una marca de sección instrumental/no cantada (ej. "[Inst]"), no
// una línea de letra real — se acepta tanto pegada en el textarea de Config
// como tipeada a mano en una fila. "[]" (sin etiqueta) es el estado por
// defecto: existe como fila real (para poder marcarle tiempo y así apagar el
// resaltado de la línea anterior) pero no muestra texto en Live.
function parseMarkerLine(texto) {
  const match = texto.trim().match(/^\[(.*)\]$/);
  return match ? match[1].trim() : null;
}

function renderLyricsPanel(letra, { seekToOriginalTime }) {
  const container = h("div", { class: "live-lyrics" }, []);
  const rowEntries = [];
  const children = [];
  for (const line of letra) {
    if (line.texto.trim() === "") {
      children.push(h("div", { class: "live-lyrics-gap" }, []));
      continue;
    }
    const marker = parseMarkerLine(line.texto);
    if (marker === "") {
      // Marcador "[]" sin etiqueta: fila real para el resaltado (apaga la
      // línea anterior apenas empieza el instrumental) pero no ocupa espacio
      // en Live — a diferencia de una línea en blanco, no se agrega al DOM.
      rowEntries.push({ row: h("div", {}, []), line });
      continue;
    }
    const marked = line.timestampSeconds !== null;
    const classes = ["live-lyrics-line"];
    if (marked) classes.push("marked");
    if (marker !== null) classes.push("live-lyrics-marker");
    const row = h(
      "div",
      {
        class: classes.join(" "),
        onclick: () => {
          if (marked) seekToOriginalTime(line.timestampSeconds);
        },
      },
      [marker !== null ? `[${marker}]` : line.texto]
    );
    rowEntries.push({ row, line });
    children.push(row);
  }
  container.replaceChildren(...children);
  return { element: container, getRowEntries: () => rowEntries };
}

function renderSectionsChips(secciones, { seekToOriginalTime }) {
  // Sin esto, una canción sin secciones deja el contenedor vacío pero
  // presente: no ocupa alto propio, pero al seguir siendo un ítem flex de
  // `.live-main` igual consume el `gap` de la columna, dejando un hueco
  // fantasma entre el header y la carátula/letra.
  const container = h("div", { class: secciones.length ? "live-sections-chips" : "live-sections-chips hidden" }, []);
  const rowEntries = secciones.map((section) => {
    const row = h(
      "button",
      {
        class: "ghost live-chip",
        onclick: () => {
          if (section.timestampSeconds !== null) seekToOriginalTime(section.timestampSeconds);
        },
      },
      [section.nombre]
    );
    return { row, line: section };
  });
  container.replaceChildren(...rowEntries.map((entry) => entry.row));
  return { element: container, getRowEntries: () => rowEntries };
}

export async function renderLiveView(root, songId) {
  const song = await getSong(songId);
  if (!song) {
    navigate("/songs");
    return;
  }

  const canGoLive = isVersionUsable(song.versiones.original) || isVersionUsable(song.versiones.karaoke);
  if (!canGoLive) {
    sessionStorage.setItem(LIVE_BLOCKED_KEY, "1");
    navigate(`/songs/${songId}/config`);
    return;
  }

  // getPlayerSession reusa el reproductor existente si el usuario venía de
  // Config de la misma canción (no corta el audio ni pierde posición) —
  // solo arranca uno nuevo si es una canción distinta o no había sesión.
  const session = getPlayerSession(song);
  const { playerController, mixMode, youtubeContainer, coverArt } = session;
  // El contenedor es compartido con Config (para no perder el iframe/audio
  // al navegar) — ahí se lo esconde con "hidden"; acá hay que sacárselo por
  // si la sesión viene de Config, donde no se veía.
  youtubeContainer.classList.remove("hidden");

  // Si se abrió desde el botón ▶ del sidebar de canciones, arrancar a
  // reproducir solo, sin esperar un click más — el "modo" que llevaba el
  // pedido ya no importa acá: si la sesión venía de otra vista de la MISMA
  // canción, no tiene sentido recargarla solo para respetarlo.
  const autoplayMode = takeAutoplayRequest(songId);
  let autoplayPending = Boolean(autoplayMode);

  function isYoutubeVideoVisible() {
    const key = playerController.activeVersionKey ?? session.initialKey;
    return key === "original" && song.versiones.original.tipo === "youtube";
  }

  function updateCoverArt() {
    const showCover = Boolean(song.caratulaUrl) && !isYoutubeVideoVisible();
    coverArt.classList.toggle("hidden", !showCover);
  }

  if (song.caratulaUrl) {
    getPlayableUrl(songId, "caratula").then((url) => {
      coverArt.src = url;
      updateCoverArt();
      applyCoverAccent(songId, url);
      trackGlowPosition(coverArt);
    });
  } else {
    clearCoverAccent(songId);
  }

  const playbackUnsubscribers = [];

  function cleanup() {
    playbackUnsubscribers.forEach((unsubscribe) => unsubscribe());
    playerBar.destroy();
    mixControl?.destroy();
    stopTrackingGlowPosition();
  }

  const seekToOriginalTime = (originalTime) => {
    if (!playerController.activeVersionKey) return;
    playerController.seekTo(
      playerController.convertBetweenVersions(originalTime, "original", playerController.activeVersionKey)
    );
  };

  const lyricsPanel = renderLyricsPanel(song.letra, { seekToOriginalTime });
  const sectionsChips = renderSectionsChips(song.secciones ?? [], { seekToOriginalTime });

  const statusBox = h("p", { class: "muted" }, ["Cargando reproductor..."]);
  // El espacio del video queda siempre reservado (mismo layout de dos
  // columnas en desktop), tenga o no un link de YouTube configurado la
  // versión activa — así no salta el layout al cambiar entre Original/Karaoke.
  // lyricsPanel.element va envuelto en .live-lyrics-wrap (sin padding
  // propio) en vez de competir directo por alto contra .youtube-container:
  // el padding gigante de .live-lyrics (ver lyrics.css, es el truco para
  // poder centrar la primera/última línea al hacer scroll) hacía que el
  // flex de acá lo tratara como "más alto" que su contenido real y terminara
  // más largo que la columna de la carátula, asomando por detrás del
  // reproductor. El wrapper, sin ese padding, no tiene ese problema.
  const bodyContainer = h("div", { class: "live-layout" }, [
    youtubeContainer,
    h("div", { class: "live-lyrics-wrap" }, [lyricsPanel.element]),
  ]);

  let versionToggleButton = null;
  let mixControl = null;
  let middleControl;

  if (mixMode) {
    mixControl = createMixSlider(playerController);
    middleControl = mixControl.element;
  } else {
    versionToggleButton = h("button", { class: "ghost", disabled: "true" }, ["—"]);
    middleControl = versionToggleButton;
  }

  // Un solo botón (en vez de dos pills) que muestra la versión activa y
  // alterna a la otra — mismo patrón que usa Config. En karaoke se pone azul
  // (primary) para que el modo activo se note de un vistazo, y el video de
  // YouTube (si la versión karaoke es de ese tipo) se oculta — el karaoke se
  // usa para cantar mirando la letra, no el video — pero conserva su espacio
  // (visibility, no display) para no correr el layout al cambiar de modo.
  function updateVersionToggleButton() {
    if (!versionToggleButton) {
      updateCoverArt();
      return;
    }
    const key = playerController.activeVersionKey;
    versionToggleButton.textContent = key ? VERSION_LABEL[key] : "—";
    versionToggleButton.className = key === "karaoke" ? "primary" : "ghost";
    versionToggleButton.disabled = !key || !isVersionUsable(song.versiones[OTHER_VERSION[key]]);
    youtubeContainer.classList.toggle("hide-video", !isYoutubeVideoVisible());
    updateCoverArt();
  }

  if (versionToggleButton) {
    versionToggleButton.addEventListener("click", async () => {
      const targetKey = OTHER_VERSION[playerController.activeVersionKey];
      if (!isVersionUsable(song.versiones[targetKey])) return;
      versionToggleButton.disabled = true;
      await resolveVersionUrl(playerController, song, targetKey);
      await playerController.switchTo(targetKey);
      audioReactiveBg.setActiveFileUrl(activeFileUrl(song, targetKey));
      updateVersionToggleButton();
    });
  }

  function handleReady() {
    updateVersionToggleButton();
    if (autoplayPending) {
      autoplayPending = false;
      playerController.play();
    }
  }

  const sidebar = createSongsSidebar({ getCurrentMode: () => playerController.activeVersionKey });

  const playerBar = createPlayerBar({
    playerController,
    session,
    song,
    mixMode,
    middleControl,
    statusBox,
    onReady: handleReady,
  });

  const screenElement = h("div", { class: "screen screen-wide has-player-bar has-header-bar live-screen" }, [
    renderSongHeader(songId, song, { mode: "live", canGoLive }),

    h("div", { class: "live-main" }, [sectionsChips.element, statusBox, bodyContainer]),
  ]);

  mount(root, h("div", {}, [screenElement, playerBar.element, sidebar.element]));

  window.addEventListener("hashchange", cleanup, { once: true });

  if (!session.initialKey) return;

  try {
    await session.loadPromise;
    // No hace falta llamar updateVersionToggleButton() acá: el "ready" que
    // dispara la carga (adentro de loadPromise) ya la corrió vía
    // onReady/handleReady dentro de createPlayerBar.
    playbackUnsubscribers.push(attachLyricsPlayback(playerController, lyricsPanel));
    playbackUnsubscribers.push(
      attachLyricsPlayback(playerController, sectionsChips, {
        scrollOptions: { block: "nearest", inline: "center" },
      })
    );
  } catch (err) {
    statusBox.textContent = "No se pudo cargar el reproductor.";
  }
}
