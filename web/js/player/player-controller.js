import { EventEmitter } from "../utils/events.js";
import { FileAudioSource } from "./file-audio-source.js";
import { YoutubeSource } from "./youtube-source.js";
import { MixSource } from "./mix-source.js";

// "timeupdate" NO se relaya de la fuente — YoutubeSource lo emite por poll
// cada 250ms y el timeupdate nativo de <audio> anda por el mismo orden de
// magnitud (throttleado por el navegador), suficiente para la barra de
// progreso pero se nota como delay al resaltar la letra en vivo (contra un
// seek por click, que es instantáneo). Se reemplaza por un loop propio de
// requestAnimationFrame (~16ms) mientras está sonando — ver #startTimeLoop.
const RELAYED_EVENTS = ["ready", "play", "pause", "ended", "error"];
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
  #rafHandle = null;

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

  // Para cuando una vista se monta sobre una sesión que ya estaba sonando
  // (ver player-session.js): no hay un evento "play"/"pause" nuevo por
  // venir, así que el botón de play necesita poder preguntar el estado
  // actual en vez de esperar uno.
  get isPlaying() {
    return this.#isPlaying;
  }

  // "mix" no es una entrada real de `versiones` — las pistas de la mezcla
  // (instrumental + voces) son stems del mismo archivo que karaoke, así que
  // comparten su offsetSeconds en vez de tener uno propio.
  offsetOf(versionKey) {
    const key = versionKey === "mix" ? "karaoke" : versionKey;
    return this.#song.versiones[key]?.offsetSeconds ?? 0;
  }

  setVersionOffset(versionKey, offsetSeconds) {
    const key = versionKey === "mix" ? "karaoke" : versionKey;
    this.#song.versiones[key].offsetSeconds = offsetSeconds;
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
        if (event === "play") {
          this.#isPlaying = true;
          this.#startTimeLoop();
        }
        if (event === "pause" || event === "ended") this.#isPlaying = false;
        this.emit(event, payload);
      })
    );
  }

  #startTimeLoop() {
    if (this.#rafHandle !== null) return;
    const tick = () => {
      this.emit("timeupdate", { currentTime: this.getCurrentTime() });
      this.#rafHandle = this.#isPlaying ? requestAnimationFrame(tick) : null;
    };
    this.#rafHandle = requestAnimationFrame(tick);
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

  async loadMix(instrumentalUrl, vocalsUrl) {
    const source = this.#sources.get("mix") ?? new MixSource();
    this.#sources.set("mix", source);
    this.#relay(source);
    this.#activeVersionKey = "mix";
    await source.loadTracks(instrumentalUrl, vocalsUrl);
    this.#loadedVersions.add("mix");
  }

  async reloadMix(instrumentalUrl, vocalsUrl) {
    const currentSource = this.#sources.get("mix");
    const currentTime = currentSource ? currentSource.getCurrentTime() : 0;
    const currentMix = currentSource?.getMix();
    const wasPlaying = this.#isPlaying;

    currentSource?.destroy();
    this.#sources.delete("mix");
    this.#loadedVersions.delete("mix");

    await this.loadMix(instrumentalUrl, vocalsUrl);
    if (currentMix !== undefined) this.setMix(currentMix);
    this.seekTo(currentTime);
    if (wasPlaying) this.play();
  }

  setMix(t) {
    this.activeSource?.setMix?.(t);
  }

  getMix() {
    return this.activeSource?.getMix?.() ?? 0.5;
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
    // Con el loop de timeupdate corriendo solo mientras suena (ver
    // #startTimeLoop), un seek en pausa no dispararía ningún timeupdate — se
    // emite uno al toque para que la barra/letra reflejen la nueva posición.
    this.emit("timeupdate", { currentTime: this.getCurrentTime() });
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
    if (this.#rafHandle !== null) cancelAnimationFrame(this.#rafHandle);
    this.#unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.#sources.forEach((source) => source.destroy());
    this.#sources.clear();
    this.#loadedVersions.clear();
  }
}
