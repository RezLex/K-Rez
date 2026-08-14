import { PlayerSource } from "./player-source.js";

export class FileAudioSource extends PlayerSource {
  #audio;

  constructor() {
    super();
    this.#audio = new Audio();
    this.#audio.preload = "metadata";
    this.#audio.addEventListener("loadedmetadata", () => this.emit("ready"));
    this.#audio.addEventListener("play", () => this.emit("play"));
    this.#audio.addEventListener("pause", () => this.emit("pause"));
    this.#audio.addEventListener("timeupdate", () =>
      this.emit("timeupdate", { currentTime: this.#audio.currentTime })
    );
    this.#audio.addEventListener("ended", () => this.emit("ended"));
    this.#audio.addEventListener("error", () => this.emit("error", this.#audio.error));
  }

  async load(url) {
    this.#audio.src = url;
    this.#audio.load();
  }

  play() {
    return this.#audio.play();
  }

  pause() {
    this.#audio.pause();
  }

  seekTo(seconds) {
    this.#audio.currentTime = seconds;
  }

  getCurrentTime() {
    return this.#audio.currentTime;
  }

  getDuration() {
    return this.#audio.duration || 0;
  }

  getBufferedFraction() {
    const duration = this.#audio.duration;
    const buffered = this.#audio.buffered;
    if (!duration || buffered.length === 0) return 0;
    return buffered.end(buffered.length - 1) / duration;
  }

  setVolume(fraction) {
    this.#audio.volume = Math.min(1, Math.max(0, fraction));
  }

  destroy() {
    this.#audio.pause();
    this.#audio.removeAttribute("src");
    this.#audio.load();
  }
}
