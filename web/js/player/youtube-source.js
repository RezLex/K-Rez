import { PlayerSource } from "./player-source.js";

let apiPromise = null;

function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      window.onYouTubeIframeAPIReady = () => resolve(window.YT);
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

function extractVideoId(url) {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/
  );
  return match ? match[1] : null;
}

export class YoutubeSource extends PlayerSource {
  #container;
  #player = null;
  #pollHandle = null;
  #lastTime = -1;

  constructor(container) {
    super();
    this.#container = container;
  }

  async load(url) {
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error("URL de YouTube inválida");

    const YT = await loadYouTubeApi();

    if (!this.#player) {
      // YT.Player reemplaza el elemento que recibe por un <iframe> — se le pasa
      // un div interno descartable para que el contenedor del caller nunca sea
      // sustituido y siga sirviendo para mostrar/ocultar u organizar el layout.
      const mountPoint = document.createElement("div");
      this.#container.appendChild(mountPoint);
      await new Promise((resolve) => {
        this.#player = new YT.Player(mountPoint, {
          width: "100%",
          height: "100%",
          videoId,
          playerVars: { playsinline: 1 },
          events: {
            onReady: () => {
              this.#startPolling();
              resolve();
            },
            onStateChange: (event) => this.#handleStateChange(event),
          },
        });
      });
    } else {
      await new Promise((resolve) => {
        const handler = (event) => {
          if (event.data === YT.PlayerState.CUED) {
            this.#player.removeEventListener("onStateChange", handler);
            resolve();
          }
        };
        this.#player.addEventListener("onStateChange", handler);
        this.#player.cueVideoById(videoId);
      });
    }

    this.emit("ready");
  }

  #handleStateChange(event) {
    const YT = window.YT;
    if (event.data === YT.PlayerState.PLAYING) this.emit("play");
    else if (event.data === YT.PlayerState.PAUSED) this.emit("pause");
    else if (event.data === YT.PlayerState.ENDED) this.emit("ended");
  }

  #startPolling() {
    if (this.#pollHandle) return;
    this.#pollHandle = setInterval(() => {
      if (!this.#player?.getCurrentTime) return;
      const currentTime = this.#player.getCurrentTime();
      if (currentTime !== this.#lastTime) {
        this.#lastTime = currentTime;
        this.emit("timeupdate", { currentTime });
      }
    }, 250);
  }

  play() {
    this.#player?.playVideo();
  }

  pause() {
    this.#player?.pauseVideo();
  }

  seekTo(seconds) {
    this.#player?.seekTo(seconds, true);
  }

  getCurrentTime() {
    return this.#player?.getCurrentTime() ?? 0;
  }

  getDuration() {
    return this.#player?.getDuration() ?? 0;
  }

  getBufferedFraction() {
    return this.#player?.getVideoLoadedFraction() ?? 0;
  }

  setVolume(fraction) {
    this.#player?.setVolume(Math.round(Math.min(1, Math.max(0, fraction)) * 100));
  }

  destroy() {
    if (this.#pollHandle) clearInterval(this.#pollHandle);
    this.#player?.destroy();
    this.#player = null;
  }
}
