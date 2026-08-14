import { EventEmitter } from "../utils/events.js";
import { FileAudioSource } from "./file-audio-source.js";
import { YoutubeSource } from "./youtube-source.js";

const RELAYED_EVENTS = ["ready", "play", "pause", "timeupdate", "ended", "error"];
const CROSSFADE_MS = 600;
const CROSSFADE_STEPS = 12;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PlayerController extends EventEmitter {
  #song;
  #youtubeContainer;
  #sources = new Map();
  #loadedVersions = new Set();
  #activeVersionKey = null;
  #unsubscribers = [];
  #isPlaying = false;

  constructor(song, { youtubeContainer } = {}) {
    super();
    this.#song = song;
    this.#youtubeContainer = youtubeContainer;
  }

  get activeVersionKey() {
    return this.#activeVersionKey;
  }

  get activeSource() {
    return this.#sources.get(this.#activeVersionKey);
  }

  offsetOf(versionKey) {
    return this.#song.versiones[versionKey]?.offsetSeconds ?? 0;
  }

  setVersionOffset(versionKey, offsetSeconds) {
    this.#song.versiones[versionKey].offsetSeconds = offsetSeconds;
  }

  setVersionUrl(versionKey, url) {
    this.#song.versiones[versionKey].url = url;
  }

  convertBetweenVersions(seconds, fromKey, toKey) {
    return seconds - this.offsetOf(fromKey) + this.offsetOf(toKey);
  }

  #sourceFor(versionKey) {
    if (this.#sources.has(versionKey)) return this.#sources.get(versionKey);
    const version = this.#song.versiones[versionKey];
    const source =
      version.tipo === "youtube"
        ? new YoutubeSource(this.#youtubeContainer)
        : new FileAudioSource();
    this.#sources.set(versionKey, source);
    return source;
  }

  #relay(source) {
    this.#unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.#unsubscribers = RELAYED_EVENTS.map((event) =>
      source.on(event, (payload) => {
        if (event === "play") this.#isPlaying = true;
        if (event === "pause" || event === "ended") this.#isPlaying = false;
        this.emit(event, payload);
      })
    );
  }

  // Precarga una versión en segundo plano (sin activarla ni emitir sus
  // eventos) para que un switchTo posterior no tenga que esperar la descarga.
  async preloadVersion(versionKey) {
    if (versionKey === this.#activeVersionKey || this.#loadedVersions.has(versionKey)) return;
    const version = this.#song.versiones[versionKey];
    if (!version?.url) return;
    const source = this.#sourceFor(versionKey);
    await source.load(version.url);
    this.#loadedVersions.add(versionKey);
  }

  async loadVersion(versionKey) {
    const version = this.#song.versiones[versionKey];
    const source = this.#sourceFor(versionKey);
    this.#relay(source);
    this.#activeVersionKey = versionKey;
    if (this.#loadedVersions.has(versionKey)) {
      this.emit("ready");
      return;
    }
    await source.load(version.url);
    this.#loadedVersions.add(versionKey);
  }

  async switchTo(versionKey) {
    if (versionKey === this.#activeVersionKey) return;
    const previousSource = this.activeSource;
    const previousKey = this.#activeVersionKey;
    const currentTime = previousSource ? previousSource.getCurrentTime() : 0;
    const wasPlaying = this.#isPlaying;

    const targetTime = this.convertBetweenVersions(currentTime, previousKey, versionKey);
    await this.loadVersion(versionKey);
    this.seekTo(targetTime);

    if (!wasPlaying) {
      previousSource?.pause();
      return;
    }

    if (previousSource) {
      await this.#crossfade(previousSource, this.activeSource);
    } else {
      await this.play();
    }
  }

  async #crossfade(fromSource, toSource) {
    toSource.setVolume(0);
    await toSource.play();
    for (let step = 1; step <= CROSSFADE_STEPS; step++) {
      await sleep(CROSSFADE_MS / CROSSFADE_STEPS);
      const t = step / CROSSFADE_STEPS;
      fromSource.setVolume(1 - t);
      toSource.setVolume(t);
    }
    fromSource.pause();
    fromSource.setVolume(1);
  }

  async reloadActiveVersion() {
    const versionKey = this.#activeVersionKey;
    if (!versionKey) return;
    const currentSource = this.activeSource;
    const currentTime = currentSource ? currentSource.getCurrentTime() : 0;
    const wasPlaying = this.#isPlaying;

    currentSource?.destroy();
    this.#sources.delete(versionKey);
    this.#loadedVersions.delete(versionKey);

    await this.loadVersion(versionKey);
    this.seekTo(currentTime);
    if (wasPlaying) this.play();
  }

  play() {
    return this.activeSource?.play();
  }

  pause() {
    this.activeSource?.pause();
  }

  seekTo(seconds) {
    this.activeSource?.seekTo(seconds);
  }

  getCurrentTime() {
    return this.activeSource?.getCurrentTime() ?? 0;
  }

  getDuration() {
    return this.activeSource?.getDuration() ?? 0;
  }

  getBufferedFraction() {
    return this.activeSource?.getBufferedFraction() ?? 0;
  }

  getBufferedFractionFor(versionKey) {
    return this.#sources.get(versionKey)?.getBufferedFraction() ?? 0;
  }

  destroy() {
    this.#unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.#sources.forEach((source) => source.destroy());
    this.#sources.clear();
    this.#loadedVersions.clear();
  }
}
