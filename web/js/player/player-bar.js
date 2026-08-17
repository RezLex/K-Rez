import { h, attachSpacebarToggle } from "../utils/dom-helpers.js";
import { formatTime } from "../utils/time-format.js";
import { bufferColorClass } from "./version-resolution.js";
import { icon } from "../utils/icons.js";

// Barra de transporte compartida entre Config y Live — play/pause, ±1s,
// seek + buffer, time label. Lo único que cada vista arma por su cuenta es
// `middleControl` (el toggle Original/Karaoke o el control de mezcla): sus
// efectos secundarios (calibrador en Config, cover-art en Live) son
// genuinamente distintos entre las dos vistas, así que no viven acá.
export function createPlayerBar({
  playerController,
  session,
  song,
  mixMode,
  middleControl,
  statusBox,
  onReady,
}) {
  const playButton = h("button", { class: "primary", disabled: "true" }, [icon("play")]);
  // dataset en vez de comparar textContent — ahora el contenido es un <svg>,
  // no texto, así que el estado necesita guardarse aparte.
  function setPlayIcon(isPlaying) {
    playButton.dataset.state = isPlaying ? "playing" : "paused";
    playButton.replaceChildren(icon(isPlaying ? "pause" : "play"));
  }
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
  const mixBufferFill = h("div", { class: "seek-buffer-fill full" }, []);
  const seekWrapper = h("div", { class: "seek-wrapper" }, [
    h(
      "div",
      { class: "seek-buffer-track" },
      mixMode ? [mixBufferFill] : [originalBufferFill, karaokeBufferFill]
    ),
    seekSlider,
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
    if (!playerController.activeVersionKey) return;
    if (playButton.dataset.state !== "playing") playerController.play();
    else playerController.pause();
  });

  function syncTime({ currentTime }) {
    if (!scrubbing) seekSlider.value = String(currentTime);
    const duration = playerController.getDuration();
    seekSlider.style.setProperty("--played", `${duration ? (currentTime / duration) * 100 : 0}%`);
    timeLabel.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    if (mixMode) {
      mixBufferFill.style.width = `${Math.round(playerController.getBufferedFraction() * 100)}%`;
    } else {
      originalBufferFill.style.width = `${Math.round(playerController.getBufferedFractionFor("original") * 100)}%`;
      karaokeBufferFill.style.width = `${Math.round(playerController.getBufferedFractionFor("karaoke") * 100)}%`;
    }
  }

  function syncReady() {
    seekSlider.max = String(playerController.getDuration() || 0);
    seekSlider.disabled = false;
    playButton.disabled = false;
    seekBackButton.disabled = false;
    seekForwardButton.disabled = false;
    setPlayIcon(playerController.isPlaying);
    statusBox?.classList.add("hidden");
    syncTime({ currentTime: playerController.getCurrentTime() });
    onReady?.();
  }

  const unsubscribers = [
    attachSpacebarToggle(playButton),
    playerController.on("play", () => setPlayIcon(true)),
    playerController.on("pause", () => setPlayIcon(false)),
    playerController.on("timeupdate", syncTime),
    playerController.on("ready", syncReady),
  ];
  // Si la sesión ya estaba lista (reuso al navegar entre Live/Config), el
  // evento "ready" no va a volver a disparar — hay que sincronizar la UI a
  // mano una vez acá, si no la barra se queda deshabilitada para siempre.
  if (session.isReady) syncReady();

  const element = h("div", { class: "player-bar" }, [
    h("div", { class: "player-bar-inner player-transport" }, [
      seekBackButton,
      playButton,
      seekForwardButton,
      seekWrapper,
      timeLabel,
      middleControl,
    ]),
  ]);

  // .has-player-bar reserva espacio abajo (padding-bottom) para que el
  // contenido de Config/Live no quede tapado por esta barra fija — medirla
  // en vivo en vez de asumir un alto fijo a ojo: la altura real varía
  // (el control de mezcla, wrap de botones en pantallas angostas, etc.),
  // y un número fijo que no coincide deja contenido asomando por detrás.
  const heightObserver = new ResizeObserver(() => {
    document.documentElement.style.setProperty("--player-bar-height", `${element.offsetHeight}px`);
  });
  heightObserver.observe(element);

  return {
    element,
    destroy: () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      heightObserver.disconnect();
    },
  };
}
