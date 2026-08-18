import { h, mount } from "../utils/dom-helpers.js";
import { getSong, updateVersion, updateSongMeta, deleteSong } from "../data/songs-repo.js";
import { uploadMediaFile, deleteMediaFile } from "../media/api-client.js";
import { getPlayableUrl } from "../media/media-url.js";
import {
  OTHER_VERSION,
  isVersionUsable,
  isMixActive,
  resolveVersionUrl,
  activeFileUrl,
} from "../player/version-resolution.js";
import { getPlayerSession, destroyPlayerSession } from "../player/player-session.js";
import { createPlayerBar } from "../player/player-bar.js";
import { renderOffsetCalibrator } from "../player/offset-calibrator.js";
import { createMixSlider } from "../player/mix-control.js";
import * as audioReactiveBg from "../player/audio-reactive-bg.js";
import { createLyricsEditor } from "../lyrics/lyrics-editor.js";
import { createSectionsEditor } from "../lyrics/sections-editor.js";
import { attachLyricsPlayback } from "../lyrics/lyrics-playback.js";
import { navigate } from "../router.js";
import { createSongsSidebar } from "./songs-sidebar.js";
import { createFileSlot } from "./file-slot.js";
import { renderSongHeader } from "./song-header.js";
import { applyCoverAccent, clearCoverAccent, trackGlowPosition, stopTrackingGlowPosition } from "./cover-accent.js";

const LIVE_BLOCKED_KEY = "k-rez-live-blocked";
const VERSION_LABEL = { original: "Original", karaoke: "Karaoke" };

function takeLiveBlockedNotice() {
  const hadNotice = sessionStorage.getItem(LIVE_BLOCKED_KEY);
  sessionStorage.removeItem(LIVE_BLOCKED_KEY);
  return Boolean(hadNotice);
}

// Encabezado consistente para los 4 tiles de "Versiones": título + pill de
// estado a la izquierda, control opcional (select de tipo, etc.) a la
// derecha — mismo patrón para que Original/Karaoke/Voces/Carátula se lean
// como una sola familia de componentes, no cuatro layouts distintos.
function renderPanelHeader(title, status, control) {
  const pillClass = status.variant ? `status-pill status-pill--${status.variant}` : "status-pill";
  const children = [h("strong", {}, [title]), h("span", { class: pillClass }, [status.label])];
  return h("div", { class: "bar" }, [
    h("div", { class: "version-panel-title" }, children),
    ...(control ? [control] : []),
  ]);
}

function versionStatus(version) {
  const isYoutube = version.tipo === "youtube";
  if (!version.url) return { label: isYoutube ? "Sin link" : "Sin archivo", variant: null };
  return { label: isYoutube ? "Link guardado" : "Archivo cargado", variant: "loaded" };
}

function renderFilePanel(songId, version, versionKey, onChanged) {
  return createFileSlot({
    accept: "audio/*",
    fileName: version.fileName,
    hasFile: Boolean(version.url),
    onUpload: async (file, signal) => {
      await uploadMediaFile(file, songId, versionKey, { signal });
      await updateVersion(songId, versionKey, {
        tipo: "archivo",
        url: `/media/${songId}/${versionKey}`,
        fileName: file.name,
      });
      onChanged();
    },
    onDelete: async () => {
      await updateVersion(songId, versionKey, { url: "", fileName: "" });
      await deleteMediaFile(songId, versionKey);
      onChanged();
    },
  }).element;
}

function renderYoutubePanel(songId, version, versionKey, onChanged) {
  const urlInput = h("input", {
    type: "url",
    value: version.url ?? "",
    placeholder: "https://www.youtube.com/watch?v=...",
  });
  const saveButton = h(
    "button",
    {
      class: "ghost",
      onclick: async () => {
        await updateVersion(songId, versionKey, { tipo: "youtube", url: urlInput.value.trim() });
        onChanged();
      },
    },
    ["Guardar link"]
  );

  return h("div", { class: "stack" }, [urlInput, saveButton]);
}

function renderVersionPanel(songId, song, versionKey, onChanged) {
  const version = song.versiones[versionKey];
  const title = versionKey === "original" ? "Original" : "Karaoke";
  // Con la mezcla activa, tanto Original (ya no existe) como Karaoke (parte
  // de la mezcla) se bloquean por igual — para tocar cualquiera de los dos
  // primero hay que deshacer la mezcla desde el panel Voces.
  const locked = isMixActive(song);

  if (locked) {
    return h("div", { class: "version-panel locked" }, [
      renderPanelHeader(title, { label: "Bloqueado", variant: "locked" }),
      h("p", { class: "muted" }, [
        "No disponible mientras haya mezcla de voces + instrumental. Quitá el archivo de voces (panel Voces) para volver a habilitarlo.",
      ]),
    ]);
  }

  const tipoSelect = h(
    "select",
    {
      onchange: async (event) => {
        await updateVersion(songId, versionKey, { tipo: event.target.value, url: "" });
        onChanged();
      },
    },
    [h("option", { value: "archivo" }, ["Archivo"]), h("option", { value: "youtube" }, ["YouTube"])]
  );
  tipoSelect.value = version.tipo;

  const body =
    version.tipo === "youtube"
      ? renderYoutubePanel(songId, version, versionKey, onChanged)
      : renderFilePanel(songId, version, versionKey, onChanged);

  return h("div", { class: "version-panel" }, [
    renderPanelHeader(title, versionStatus(version), tipoSelect),
    body,
  ]);
}

function renderVocesPanel(songId, song, onChanged) {
  const karaoke = song.versiones.karaoke;
  const karaokeReady = karaoke.tipo === "archivo" && Boolean(karaoke.url);

  if (!karaokeReady) {
    return h("div", { class: "version-panel locked" }, [
      renderPanelHeader("Voces", { label: "Esperando instrumental", variant: "locked" }),
      h("p", { class: "muted" }, ["Subí el instrumental (Karaoke) como archivo primero."]),
    ]);
  }

  const slot = createFileSlot({
    accept: "audio/*",
    fileName: karaoke.vocalsFileName,
    hasFile: Boolean(karaoke.vocalsUrl),
    confirmMessage: karaoke.vocalsUrl
      ? null
      : "Esto va a reemplazar Original por el modo de mezcla Instrumental/Voces. ¿Continuar?",
    onUpload: async (file, signal) => {
      await uploadMediaFile(file, songId, "vocals", { signal });
      await updateVersion(songId, "karaoke", {
        vocalsUrl: `/media/${songId}/vocals`,
        vocalsFileName: file.name,
      });
      await updateVersion(songId, "original", { url: "", fileName: "" });
      await deleteMediaFile(songId, "original");
      onChanged();
    },
    onDelete: async () => {
      await updateVersion(songId, "karaoke", { vocalsUrl: "", vocalsFileName: "" });
      await deleteMediaFile(songId, "vocals");
      onChanged();
    },
  });

  return h("div", { class: "version-panel" }, [
    renderPanelHeader("Voces", karaoke.vocalsUrl ? { label: "Cargado", variant: "loaded" } : { label: "Sin archivo", variant: null }),
    slot.element,
  ]);
}

function renderCoverPanel(songId, song, onChanged) {
  const preview = h("img", { class: "hidden" });
  const placeholder = h("span", { class: "cover-frame-placeholder" }, ["Sin carátula"]);
  const frame = h("div", { class: "cover-frame" }, [preview, placeholder]);
  if (song.caratulaUrl) {
    getPlayableUrl(songId, "caratula").then((url) => {
      preview.src = url;
      preview.classList.remove("hidden");
      placeholder.classList.add("hidden");
      applyCoverAccent(songId, url);
      trackGlowPosition(frame);
    });
  } else {
    clearCoverAccent(songId);
  }

  const slot = createFileSlot({
    accept: "image/*",
    fileName: song.caratulaFileName,
    hasFile: Boolean(song.caratulaUrl),
    onUpload: async (file, signal) => {
      await uploadMediaFile(file, songId, "caratula", { signal });
      await updateSongMeta(songId, {
        caratulaUrl: `/media/${songId}/caratula`,
        caratulaFileName: file.name,
      });
      onChanged();
    },
    onDelete: async () => {
      await updateSongMeta(songId, { caratulaUrl: "", caratulaFileName: "" });
      await deleteMediaFile(songId, "caratula");
      onChanged();
    },
  });

  return h("div", { class: "version-panel" }, [
    renderPanelHeader("Carátula", {
      label: song.caratulaUrl ? "Cargada" : "Sin carátula",
      variant: song.caratulaUrl ? "loaded" : null,
    }),
    h("div", { class: "version-panel-body" }, [frame, slot.element]),
  ]);
}

export async function renderSongConfigView(root, songId) {
  const song = await getSong(songId);
  if (!song) {
    navigate("/songs");
    return;
  }

  const liveBlockedNotice = takeLiveBlockedNotice();

  // getPlayerSession reusa el reproductor existente si el usuario venía de
  // Live de la misma canción (no corta el audio ni pierde posición) — solo
  // arranca uno nuevo si es una canción distinta o no había sesión.
  const session = getPlayerSession(song);
  const { playerController, mixMode } = session;
  // Config no muestra el video — el contenedor es compartido con Live (para
  // no perder el iframe/audio al navegar), así que hay que forzar el
  // "hidden" acá por si la sesión viene de Live, donde se ve.
  session.youtubeContainer.classList.add("hidden");
  const playbackUnsubscribers = [];

  const timelineCallbacks = {
    getCurrentOriginalTime: () =>
      playerController.activeVersionKey
        ? playerController.convertBetweenVersions(
            playerController.getCurrentTime(),
            playerController.activeVersionKey,
            "original"
          )
        : null,
    seekToOriginalTime: (originalTime) => {
      if (!playerController.activeVersionKey) return;
      playerController.seekTo(
        playerController.convertBetweenVersions(originalTime, "original", playerController.activeVersionKey)
      );
    },
  };

  const lyricsEditor = createLyricsEditor(songId, song.letra, {
    ...timelineCallbacks,
    songName: song.nombre,
  });
  const sectionsEditor = createSectionsEditor(songId, song.secciones ?? [], timelineCallbacks);

  function cleanup() {
    playbackUnsubscribers.forEach((unsubscribe) => unsubscribe());
    playerBar.destroy();
    mixControl?.destroy();
    stopTrackingGlowPosition();
  }

  // A diferencia de cleanup() (que solo desengancha esta vista), rerender()
  // se dispara porque el contenido de audio realmente cambió (subida/borrado
  // en algún panel de "Archivos") — ahí sí hay que tirar la sesión entera y
  // arrancar una nueva con los datos frescos, no solo remontar la vista.
  function rerender() {
    cleanup();
    destroyPlayerSession();
    renderSongConfigView(root, songId);
  }

  let toggleButton = null;
  let mixControl = null;
  let middleControl;

  if (mixMode) {
    mixControl = createMixSlider(playerController);
    middleControl = mixControl.element;
  } else {
    toggleButton = h("button", { class: "ghost", disabled: "true" }, ["—"]);
    middleControl = toggleButton;
  }

  function updateToggleButton() {
    if (!toggleButton) return;
    const key = playerController.activeVersionKey;
    toggleButton.textContent = key ? VERSION_LABEL[key] : "—";
    toggleButton.className = key === "karaoke" ? "primary" : "ghost";
    toggleButton.disabled = !key || !isVersionUsable(song.versiones[OTHER_VERSION[key]]);
  }

  const calibratorSlot = h("div", {}, []);

  if (toggleButton) {
    toggleButton.addEventListener("click", async () => {
      const targetKey = OTHER_VERSION[playerController.activeVersionKey];
      toggleButton.disabled = true;
      await resolveVersionUrl(playerController, song, targetKey);
      await playerController.switchTo(targetKey);
      audioReactiveBg.setActiveFileUrl(activeFileUrl(song, targetKey));
      calibratorSlot.replaceChildren(renderOffsetCalibrator(songId, playerController, targetKey));
      updateToggleButton();
    });
  }

  const statusBox = h("p", { class: "muted" }, [
    session.initialKey ? "Cargando reproductor..." : "Carga un archivo o un link para poder reproducir.",
  ]);
  const liveNoticeBox = h("p", { class: liveBlockedNotice ? "error" : "error hidden" }, [
    "Configura un archivo o link para poder usar Live.",
  ]);

  const canGoLive = isVersionUsable(song.versiones.original) || isVersionUsable(song.versiones.karaoke);
  const sidebar = createSongsSidebar({ getCurrentMode: () => playerController.activeVersionKey });

  const playerBar = createPlayerBar({
    playerController,
    session,
    song,
    mixMode,
    middleControl,
    statusBox,
    onReady: updateToggleButton,
  });

  const screenElement = h("div", { class: "screen screen-wide has-player-bar has-header-bar config-screen" }, [
    renderSongHeader(songId, song, { mode: "config", canGoLive }),
    h("div", { class: "config-main" }, [
      liveNoticeBox,
      statusBox,
      calibratorSlot,
      session.youtubeContainer,

      h("h2", {}, ["Estructura"]),
      sectionsEditor.element,

      h("h2", {}, ["Letra"]),
      lyricsEditor.element,

      h("h2", {}, ["Archivos"]),
      h("div", { class: "version-panels" }, [
        renderVersionPanel(songId, song, "original", rerender),
        renderVersionPanel(songId, song, "karaoke", rerender),
        renderVocesPanel(songId, song, rerender),
        renderCoverPanel(songId, song, rerender),
      ]),

      h("button", { class: "ghost", onclick: () => navigate(`/songs/${songId}/edit`) }, [
        "Editar datos de la canción",
      ]),

      h("h2", {}, ["Zona de peligro"]),
      h(
        "button",
        {
          class: "ghost danger",
          onclick: async () => {
            if (!confirm(`¿Eliminar "${song.nombre}"? Esta acción no se puede deshacer.`)) return;
            await deleteSong(songId);
            navigate("/songs");
          },
        },
        ["Eliminar canción"]
      ),
    ]),
  ]);

  mount(root, h("div", {}, [screenElement, playerBar.element, sidebar.element]));

  window.addEventListener("hashchange", cleanup, { once: true });

  if (!session.initialKey) return;

  try {
    await session.loadPromise;
    const activeKey = mixMode ? "karaoke" : playerController.activeVersionKey;
    calibratorSlot.replaceChildren(renderOffsetCalibrator(songId, playerController, activeKey));
    playbackUnsubscribers.push(
      attachLyricsPlayback(playerController, lyricsEditor, { scrollIntoView: false })
    );
    playbackUnsubscribers.push(
      attachLyricsPlayback(playerController, sectionsEditor, { scrollIntoView: false })
    );
  } catch (err) {
    statusBox.textContent = "No se pudo cargar el reproductor.";
  }
}
