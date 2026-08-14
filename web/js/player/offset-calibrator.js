import { h } from "../utils/dom-helpers.js";
import { updateVersionOffset } from "../data/songs-repo.js";

function formatOffset(value) {
  return `${value.toFixed(2)}s`;
}

export function renderOffsetCalibrator(songId, playerController, versionKey) {
  const valueLabel = h("span", { class: "offset-value" }, [
    formatOffset(playerController.offsetOf(versionKey)),
  ]);

  function setOffset(value) {
    const rounded = Math.round(value * 100) / 100;
    playerController.setVersionOffset(versionKey, rounded);
    valueLabel.textContent = formatOffset(rounded);
  }

  function nudge(delta) {
    setOffset(playerController.offsetOf(versionKey) + delta);
  }

  const saveButton = h(
    "button",
    {
      class: "ghost",
      onclick: async () => {
        await updateVersionOffset(songId, versionKey, playerController.offsetOf(versionKey));
        saveButton.textContent = "Guardado";
        setTimeout(() => {
          saveButton.textContent = "Guardar offset";
        }, 1500);
      },
    },
    ["Guardar offset"]
  );

  return h("div", { class: "offset-calibrator" }, [
    h("span", { class: "muted" }, ["Offset "]),
    valueLabel,
    h("button", { class: "ghost", onclick: () => nudge(-0.5) }, ["−0.5"]),
    h("button", { class: "ghost", onclick: () => nudge(-0.1) }, ["−0.1"]),
    h("button", { class: "ghost", onclick: () => nudge(0.1) }, ["+0.1"]),
    h("button", { class: "ghost", onclick: () => nudge(0.5) }, ["+0.5"]),
    h(
      "button",
      { class: "ghost", onclick: () => setOffset(playerController.getCurrentTime()) },
      ["Marcar inicio real"]
    ),
    saveButton,
  ]);
}
