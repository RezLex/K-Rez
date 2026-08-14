import { h, mount } from "../utils/dom-helpers.js";
import { formatTime } from "../utils/time-format.js";
import { getSong, updateVersion } from "../data/songs-repo.js";
import { uploadAudioFile } from "../media/api-client.js";
import { PlayerController } from "../player/player-controller.js";
import {
  TOKEN_REFRESH_MS,
  OTHER_VERSION,
  isVersionUsable,
  resolveVersionUrl,
  bufferColorClass,
} from "../player/version-resolution.js";
import { renderOffsetCalibrator } from "../player/offset-calibrator.js";
import { createLyricsEditor } from "../lyrics/lyrics-editor.js";
import { createSectionsEditor } from "../lyrics/sections-editor.js";
import { attachLyricsPlayback } from "../lyrics/lyrics-playback.js";
import { navigate } from "../router.js";

const LIVE_BLOCKED_KEY = "k-rez-live-blocked";

function takeLiveBlockedNotice() {
  const hadNotice = sessionStorage.getItem(LIVE_BLOCKED_KEY);
  sessionStorage.removeItem(LIVE_BLOCKED_KEY);
  return Boolean(hadNotice);
}

function renderFilePanel(songId, version, versionKey, onChanged) {
  const status = h("span", { class: "muted" }, [
    version.url ? "Archivo cargado." : "Sin archivo.",
  ]);
  const fileInput = h("input", { type: "file", accept: "audio/*" });
  const uploadButton = h(
    "button",
    {
      class: "ghost",
      onclick: async () => {
        const file = fileInput.files[0];
        if (!file) return;
        uploadButton.disabled = true;
        uploadButton.textContent = "Subiendo...";
        try {
          await uploadAudioFile(file, songId, versionKey);
          await updateVersion(songId, versionKey, {
            tipo: "archivo",
            url: `/media/${songId}/${versionKey}`,
          });
          onChanged();
        } catch (err) {
          uploadButton.disabled = false;
          uploadButton.textContent = "Subir";
          alert("No se pudo subir el archivo.");
        }
      },
    },
    ["Subir"]
  );

  return h("div", { class: "stack" }, [status, fileInput, uploadButton]);
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
    h("div", { class: "bar" }, [h("strong", {}, [title]), tipoSelect]),
    body,
  ]);
}

export async function renderSongConfigView(root, songId) {
  const song = await getSong(songId);
  if (!song) {
    navigate("/songs");
    return;
  }

  const liveBlockedNotice = takeLiveBlockedNotice();

  const initialKey = isVersionUsable(song.versiones.original)
    ? "original"
    : isVersionUsable(song.versiones.karaoke)
    ? "karaoke"
    : null;

  const youtubeContainer = h("div", { class: "youtube-container" });
  const playerController = new PlayerController(song, { youtubeContainer });
  let refreshHandle = null;
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

  const lyricsEditor = createLyricsEditor(songId, song.letra, timelineCallbacks);
  const sectionsEditor = createSectionsEditor(songId, song.secciones ?? [], timelineCallbacks);

  function cleanup() {
    if (refreshHandle) clearInterval(refreshHandle);
    playbackUnsubscribers.forEach((unsubscribe) => unsubscribe());
    playerController.destroy();
  }

  function rerender() {
    cleanup();
    renderSongConfigView(root, songId);
  }

  const playButton = h("button", { class: "primary", disabled: "true" }, ["▶"]);
  const seekBackButton = h(
    "button",
    {
      class: "ghost seek-step",
      disabled: "true",
      onclick: () => playerController.seekTo(Math.max(0, playerController.getCurrentTime() - 1)),
    },
    ["−1s"]
  );
  const seekForwardButton = h(
    "button",
    {
      class: "ghost seek-step",
      disabled: "true",
      onclick: () => playerController.seekTo(playerController.getCurrentTime() + 1),
    },
    ["+1s"]
  );
  const seekSlider = h("input", {
    type: "range",
    class: "seek-slider",
    min: "0",
    max: "0",
    step: "0.1",
    value: "0",
    disabled: "true",
  });
  const timeLabel = h("span", { class: "muted" }, ["0:00 / 0:00"]);
  const toggleButton = h("button", { class: "ghost", disabled: "true" }, ["Cambiar versión"]);
  const originalBufferFill = h(
    "div",
    { class: `seek-buffer-fill ${bufferColorClass("original", song)}` },
    []
  );
  const karaokeBufferFill = h(
    "div",
    { class: `seek-buffer-fill ${bufferColorClass("karaoke", song)}` },
    []
  );
  const seekWrapper = h("div", { class: "seek-wrapper" }, [
    h("div", { class: "seek-buffer-track" }, [originalBufferFill, karaokeBufferFill]),
    seekSlider,
  ]);
  const calibratorSlot = h("div", {}, []);
  const statusBox = h("p", { class: "muted" }, [
    initialKey ? "Cargando reproductor..." : "Carga un archivo o un link para poder reproducir.",
  ]);
  const liveNoticeBox = h("p", { class: liveBlockedNotice ? "error" : "error hidden" }, [
    "Configura un archivo o link para poder usar Live.",
  ]);

  let scrubbing = false;

  seekSlider.addEventListener("pointerdown", () => {
    scrubbing = true;
  });
  seekSlider.addEventListener("change", () => {
    playerController.seekTo(Number(seekSlider.value));
    scrubbing = false;
  });

  playButton.addEventListener("click", () => {
    if (playerController.activeVersionKey === null) return;
    if (playButton.textContent === "▶") playerController.play();
    else playerController.pause();
  });

  playerController.on("ready", () => {
    seekSlider.max = String(playerController.getDuration() || 0);
    seekSlider.disabled = false;
    playButton.disabled = false;
    seekBackButton.disabled = false;
    seekForwardButton.disabled = false;
    toggleButton.disabled = !isVersionUsable(song.versiones[OTHER_VERSION[playerController.activeVersionKey]]);
    statusBox.classList.add("hidden");
  });
  playerController.on("play", () => {
    playButton.textContent = "⏸";
  });
  playerController.on("pause", () => {
    playButton.textContent = "▶";
  });
  playerController.on("timeupdate", ({ currentTime }) => {
    if (!scrubbing) seekSlider.value = String(currentTime);
    const duration = playerController.getDuration();
    seekSlider.style.setProperty("--played", `${duration ? (currentTime / duration) * 100 : 0}%`);
    timeLabel.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    originalBufferFill.style.width = `${Math.round(playerController.getBufferedFractionFor("original") * 100)}%`;
    karaokeBufferFill.style.width = `${Math.round(playerController.getBufferedFractionFor("karaoke") * 100)}%`;
  });

  toggleButton.addEventListener("click", async () => {
    const targetKey = OTHER_VERSION[playerController.activeVersionKey];
    toggleButton.disabled = true;
    await resolveVersionUrl(playerController, song, targetKey);
    await playerController.switchTo(targetKey);
    calibratorSlot.replaceChildren(renderOffsetCalibrator(songId, playerController, targetKey));
    toggleButton.disabled = false;
  });

  const canGoLive = isVersionUsable(song.versiones.original) || isVersionUsable(song.versiones.karaoke);

  mount(
    root,
    h("div", {}, [
      h("div", { class: "screen screen-wide has-player-bar" }, [
        h("header", { class: "bar" }, [
          h("h1", {}, [song.nombre]),
          h("div", { class: "bar" }, [
            h(
              "button",
              {
                class: "primary",
                disabled: canGoLive ? null : "true",
                onclick: () => navigate(`/songs/${songId}`),
              },
              ["▶ Ver Live"]
            ),
            h("button", { class: "ghost", onclick: () => navigate(`/songs/${songId}`) }, ["Volver"]),
          ]),
        ]),
        h("p", { class: "muted" }, [`${song.artista}${song.key ? " — " + song.key : ""}`]),
        liveNoticeBox,
        statusBox,
        calibratorSlot,
        youtubeContainer,

        h("h2", {}, ["Estructura"]),
        sectionsEditor.element,

        h("h2", {}, ["Letra"]),
        lyricsEditor.element,

        h("h2", {}, ["Versiones"]),
        h("div", { class: "version-panels" }, [
          renderVersionPanel(songId, song, "original", rerender),
          renderVersionPanel(songId, song, "karaoke", rerender),
        ]),

        h("button", { class: "ghost", onclick: () => navigate(`/songs/${songId}/edit`) }, [
          "Editar datos de la canción",
        ]),
      ]),
      h("div", { class: "player-bar" }, [
        h("div", { class: "player-bar-inner player-transport" }, [
          seekBackButton,
          playButton,
          seekForwardButton,
          seekWrapper,
          timeLabel,
          toggleButton,
        ]),
      ]),
    ])
  );

  if (!initialKey) return;

  try {
    await resolveVersionUrl(playerController, song, initialKey);
    await playerController.loadVersion(initialKey);
    calibratorSlot.replaceChildren(renderOffsetCalibrator(songId, playerController, initialKey));
    playbackUnsubscribers.push(
      attachLyricsPlayback(playerController, lyricsEditor, { scrollIntoView: false })
    );
    playbackUnsubscribers.push(
      attachLyricsPlayback(playerController, sectionsEditor, { scrollIntoView: false })
    );
  } catch (err) {
    statusBox.textContent = "No se pudo cargar el reproductor.";
    return;
  }

  const otherKey = OTHER_VERSION[initialKey];
  if (isVersionUsable(song.versiones[otherKey])) {
    resolveVersionUrl(playerController, song, otherKey).then(() =>
      playerController.preloadVersion(otherKey)
    );
  }

  refreshHandle = setInterval(async () => {
    const activeKey = playerController.activeVersionKey;
    if (song.versiones[activeKey]?.tipo !== "archivo") return;
    await resolveVersionUrl(playerController, song, activeKey);
    await playerController.reloadActiveVersion();
  }, TOKEN_REFRESH_MS);

  window.addEventListener("hashchange", cleanup, { once: true });
}
