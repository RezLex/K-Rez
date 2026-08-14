import { EventEmitter } from "../utils/events.js";

export class PlayerSource extends EventEmitter {
  async load(_url) {
    throw new Error("PlayerSource.load not implemented");
  }

  play() {
    throw new Error("PlayerSource.play not implemented");
  }

  pause() {
    throw new Error("PlayerSource.pause not implemented");
  }

  seekTo(_seconds) {
    throw new Error("PlayerSource.seekTo not implemented");
  }

  getCurrentTime() {
    throw new Error("PlayerSource.getCurrentTime not implemented");
  }

  getDuration() {
    throw new Error("PlayerSource.getDuration not implemented");
  }

  getBufferedFraction() {
    return 0;
  }

  setVolume(_fraction) {}

  destroy() {}
}
