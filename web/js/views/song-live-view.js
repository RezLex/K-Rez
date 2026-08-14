import { h, mount } from "../utils/dom-helpers.js";
import { formatTime } from "../utils/time-format.js";
import { getSong } from "../data/songs-repo.js";
import { PlayerController } from "../player/player-controller.js";
import {
  TOKEN_REFRESH_MS,
  OTHER_VERSION,
  isVersionUsable,
  resolveVersionUrl,
  bufferColorClass,
} from "../player/version-resolution.js";
import { attachLyricsPlayback } from "../lyrics/lyrics-playback.js";
import { navigate } from "../router.js";

const LIVE_BLOCKED_KEY = "k-rez-live-blocked";

function renderLyricsPanel(letra, { seekToOriginalTime }) {
  const container = h("div", { class: "live-lyrics" }, []);
  const rowEntries = [];
  const children = letra.map((line) => {
    if (line.texto.trim() === "") {
      return h("div", { class: "live-lyrics-gap" }, []);
    }
    const marked = line.timestampSeconds !== null;
    const row = h(
      "div",
      {
        class: marked ? "live-lyrics-line marked" : "live-lyrics-line",
        onclick: () => {
          if (marked) seekToOriginalTime(line.timestampSeconds);
        },
      },
      [line.texto]
    );
    rowEntries.push({ row, line });
    return row;
  });
  container.replaceChildren(...children);
  return { element: container, getRowEntries: () => rowEntries };
}

function renderSectionsChips(secciones, { seekToOriginalTime }) {
  const container = h("div", { class: "live-sections-chips" }, []);
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

  const initialKey = isVersionUsable(song.versiones.original) ? "original" : "karaoke";

  const youtubeContainer = h("div", { class: "youtube-container" });
  const playerController = new PlayerController(song, { youtubeContainer });
  let refreshHandle = null;
  const playbackUnsubscribers = [];

  function cleanup() {
    if (refreshHandle) clearInterval(refreshHandle);
    playbackUnsubscribers.forEach((unsubscribe) => unsubscribe());
    playerController.destroy();
  }

  const seekToOriginalTime = (originalTime) => {
    if (!playerController.activeVersionKey) return;
    playerController.seekTo(
      playerController.convertBetweenVersions(originalTime, "original", playerController.activeVersionKey)
    );
  };

  const lyricsPanel = renderLyricsPanel(song.letra, { seekToOriginalTime });
  const sectionsChips = renderSectionsChips(song.secciones ?? [], { seekToOriginalTime });

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
  const progressBar = h("input", {
    type: "range",
    class: "seek-slider",
    min: "0",
    max: "0",
    step: "0.1",
    value: "0",
    disabled: "true",
  });
  const timeLabel = h("span", { class: "muted" }, ["0:00 / 0:00"]);
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
    progressBar,
  ]);
  const statusBox = h("p", { class: "muted" }, ["Cargando reproductor..."]);
  youtubeContainer.classList.add("hidden");
  const bodyContainer = h("div", { class: "live-layout" }, [youtubeContainer, lyricsPanel.element]);

  let scrubbing = false;
  progressBar.addEventListener("pointerdown", () => {
    scrubbing = true;
  });
  progressBar.addEventListener("change", () => {
    playerController.seekTo(Number(progressBar.value));
    scrubbing = false;
  });

  playButton.addEventListener("click", () => {
    if (!playerController.activeVersionKey) return;
    if (playButton.textContent === "▶") playerController.play();
    else playerController.pause();
  });

  playerController.on("ready", () => {
    progressBar.max = String(playerController.getDuration() || 0);
    progressBar.disabled = false;
    playButton.disabled = false;
    seekBackButton.disabled = false;
    seekForwardButton.disabled = false;
    statusBox.classList.add("hidden");
  });
  playerController.on("play", () => {
    playButton.textContent = "⏸";
  });
  playerController.on("pause", () => {
    playButton.textContent = "▶";
  });
  playerController.on("timeupdate", ({ currentTime }) => {
    if (!scrubbing) progressBar.value = String(currentTime);
    const duration = playerController.getDuration();
    progressBar.style.setProperty("--played", `${duration ? (currentTime / duration) * 100 : 0}%`);
    timeLabel.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    originalBufferFill.style.width = `${Math.round(playerController.getBufferedFractionFor("original") * 100)}%`;
    karaokeBufferFill.style.width = `${Math.round(playerController.getBufferedFractionFor("karaoke") * 100)}%`;
  });

  function updateBodyLayout() {
    const activeVersion = song.versiones[playerController.activeVersionKey];
    const isYoutube = activeVersion?.tipo === "youtube";
    bodyContainer.classList.toggle("live-layout-single", !isYoutube);
    youtubeContainer.classList.toggle("hidden", !isYoutube);
  }

  function updatePills() {
    originalPill.className = playerController.activeVersionKey === "original" ? "primary" : "ghost";
    originalPill.disabled = !isVersionUsable(song.versiones.original);
    karaokePill.className = playerController.activeVersionKey === "karaoke" ? "primary" : "ghost";
    karaokePill.disabled = !isVersionUsable(song.versiones.karaoke);
  }

  async function switchMode(versionKey) {
    if (playerController.activeVersionKey === versionKey) return;
    if (!isVersionUsable(song.versiones[versionKey])) return;
    originalPill.disabled = true;
    karaokePill.disabled = true;
    await resolveVersionUrl(playerController, song, versionKey);
    await playerController.switchTo(versionKey);
    updatePills();
    updateBodyLayout();
  }

  const originalPill = h("button", { class: "ghost", onclick: () => switchMode("original") }, ["Original"]);
  const karaokePill = h("button", { class: "ghost", onclick: () => switchMode("karaoke") }, ["Karaoke"]);

  mount(
    root,
    h("div", {}, [
      h("div", { class: "screen screen-wide has-player-bar" }, [
        h("header", { class: "bar" }, [
          h("div", {}, [
            h("h1", {}, [song.nombre]),
            h("p", { class: "muted" }, [`${song.artista}${song.key ? " — " + song.key : ""}`]),
          ]),
          h("div", { class: "bar" }, [
            originalPill,
            karaokePill,
            h("button", { class: "ghost", onclick: () => navigate(`/songs/${songId}/config`) }, ["⚙ Configurar"]),
            h("button", { class: "ghost", onclick: () => navigate("/songs") }, ["Volver"]),
          ]),
        ]),

        sectionsChips.element,
        statusBox,

        bodyContainer,
      ]),
      h("div", { class: "player-bar" }, [
        h("div", { class: "player-bar-inner player-transport" }, [
          seekBackButton,
          playButton,
          seekForwardButton,
          seekWrapper,
          timeLabel,
        ]),
      ]),
    ])
  );

  updatePills();
  updateBodyLayout();

  try {
    await resolveVersionUrl(playerController, song, initialKey);
    await playerController.loadVersion(initialKey);
    updatePills();
    updateBodyLayout();
    playbackUnsubscribers.push(attachLyricsPlayback(playerController, lyricsPanel));
    playbackUnsubscribers.push(attachLyricsPlayback(playerController, sectionsChips));
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
