import { PlayerSource } from "./player-source.js";
import { FileAudioSource } from "./file-audio-source.js";

// Ni bien las dos pistas difieren más que esto, se re-sincroniza la de voces
// contra la instrumental (que actúa de reloj). No hace falta Web Audio API
// para esto — dos <audio> nativos con corrección periódica alcanza para una
// canción de unos pocos minutos.
//
// La corrección tiene dos niveles: un desvío chico (SOFT) es normal —
// clocks de decodificación levemente distintos, más marcado en navegadores
// móviles — y se corrige de a poco pisando el playbackRate de las voces
// unos puntos por encima/debajo de 1 hasta que vuelve a alinearse; eso es
// inaudible. Un seekTo() duro (HARD) sí se nota como un corte/glitch en la
// voz, sobre todo en mobile, así que se reserva para desvíos grandes que
// indican un stall real (p.ej. rebuffering), no drift normal de reloj.
const SOFT_DRIFT_THRESHOLD_SECONDS = 0.05;
const HARD_DRIFT_THRESHOLD_SECONDS = 0.75;
const CORRECTION_RATE_OFFSET = 0.03;

// Mezcla dos stems complementarios (instrumental + voces) que juntos
// reconstruyen el original — no es un crossfade entre dos tomas del mismo
// audio. mix=0 → solo instrumental, mix=1 → solo voces, mix=0.5 → ambas
// pistas a full volumen (así el punto medio suena como el original).
export class MixSource extends PlayerSource {
  #instrumental = new FileAudioSource();
  #vocals = new FileAudioSource();
  #mix = 0.5;

  constructor() {
    super();
    this.#instrumental.on("play", () => this.emit("play"));
    this.#instrumental.on("pause", () => this.emit("pause"));
    this.#instrumental.on("ended", () => this.emit("ended"));
    this.#instrumental.on("error", (payload) => this.emit("error", payload));
    this.#instrumental.on("timeupdate", ({ currentTime }) => {
      this.#correctDrift(currentTime);
      this.emit("timeupdate", { currentTime });
    });
  }

  #correctDrift(instrumentalTime) {
    const vocalsTime = this.#vocals.getCurrentTime();
    const drift = vocalsTime - instrumentalTime;
    const absDrift = Math.abs(drift);

    if (absDrift > HARD_DRIFT_THRESHOLD_SECONDS) {
      this.#vocals.seekTo(instrumentalTime);
      this.#vocals.setPlaybackRate(1);
      return;
    }

    if (absDrift > SOFT_DRIFT_THRESHOLD_SECONDS) {
      this.#vocals.setPlaybackRate(drift > 0 ? 1 - CORRECTION_RATE_OFFSET : 1 + CORRECTION_RATE_OFFSET);
    } else {
      this.#vocals.setPlaybackRate(1);
    }
  }

  // FileAudioSource.load() no espera a que el navegador termine de leer los
  // metadatos (solo dispara audio.load() y vuelve) — su duración/"ready" real
  // llegan después, vía el evento nativo "loadedmetadata". Esperar solo el
  // Promise.all de acá emitía "ready" antes de tiempo, con getDuration() en 0
  // todavía — eso dejaba el slider de reproducción con max="0" (inutilizable)
  // apenas se entraba a modo mezcla. Hay que esperar el "ready" real de cada
  // fuente, igual que el resto de la app lo hace para original/karaoke.
  #waitForReady(source) {
    return new Promise((resolve) => {
      const unsubscribe = source.on("ready", () => {
        unsubscribe();
        resolve();
      });
    });
  }

  async loadTracks(instrumentalUrl, vocalsUrl) {
    const instrumentalReady = this.#waitForReady(this.#instrumental);
    const vocalsReady = this.#waitForReady(this.#vocals);
    this.#instrumental.load(instrumentalUrl);
    this.#vocals.load(vocalsUrl);
    await Promise.all([instrumentalReady, vocalsReady]);
    this.setMix(this.#mix);
    this.emit("ready");
  }

  // Ninguno de los dos forma parte del contrato de PlayerSource — solo los
  // usa MixSource (y PlayerController.setMix/reloadMix).
  setMix(t) {
    this.#mix = Math.min(1, Math.max(0, t));
    this.#instrumental.setVolume(Math.min(1, 2 * (1 - this.#mix)));
    this.#vocals.setVolume(Math.min(1, 2 * this.#mix));
  }

  getMix() {
    return this.#mix;
  }

  async play() {
    await Promise.all([this.#instrumental.play(), this.#vocals.play()]);
  }

  pause() {
    this.#instrumental.pause();
    this.#vocals.pause();
  }

  seekTo(seconds) {
    this.#instrumental.seekTo(seconds);
    this.#vocals.seekTo(seconds);
    // Después de un seek manual las dos pistas quedan alineadas — si había
    // una corrección SOFT en curso (playbackRate != 1), pisarla acá evita
    // que la voz arranque de nuevo a velocidad distinta desde la posición
    // recién elegida.
    this.#vocals.setPlaybackRate(1);
  }

  getCurrentTime() {
    return this.#instrumental.getCurrentTime();
  }

  getDuration() {
    return this.#instrumental.getDuration();
  }

  getBufferedFraction() {
    return Math.min(this.#instrumental.getBufferedFraction(), this.#vocals.getBufferedFraction());
  }

  destroy() {
    this.#instrumental.destroy();
    this.#vocals.destroy();
  }
}
