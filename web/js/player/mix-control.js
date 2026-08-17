import { h } from "../utils/dom-helpers.js";
import { icon } from "../utils/icons.js";

const PRESETS = [
  { value: 0, label: "Inst", title: "Solo instrumental" },
  { value: 0.5, label: "Original", title: "Mezcla original (voces + instrumental al 100%)" },
  { value: 1, label: "Voz", title: "Solo voz" },
];
const PRESET_EPSILON = 0.001;

// Segmented control [Inst | Original | Voz | ▾] que se ve como un solo
// botón — el segmento con el valor activo se marca en azul. El slider de
// ajuste fino vive en un popover flotante, oculto por default: se abre con
// ▾ y se cierra solo al elegir un preset, tocar ▾ de nuevo, o clickear
// afuera — nunca compite por espacio con los tres botones.
export function createMixSlider(playerController) {
  // playerController.getMix() (no 0.5 fijo): con la sesión de reproducción
  // persistente (player-session.js) este control puede nacer sobre un
  // reproductor que ya venía sonando con otra mezcla elegida en la otra
  // vista — tiene que arrancar mostrando eso, no resetear a la mitad.
  const slider = h("input", {
    type: "range",
    class: "mix-slider",
    min: "0",
    max: "1",
    step: "0.01",
    value: String(playerController.getMix()),
    title: "Mezcla instrumental / voces",
  });

  const popover = h("div", { class: "mix-popover hidden" }, [
    h("span", { class: "muted" }, ["Inst"]),
    slider,
    h("span", { class: "muted" }, ["Voz"]),
  ]);

  let isOpen = false;

  function handleOutsideClick(event) {
    if (!wrapper.contains(event.target)) setOpen(false);
  }

  function setOpen(next) {
    isOpen = next;
    popover.classList.toggle("hidden", !isOpen);
    toggleButton.classList.toggle("open", isOpen);
    if (isOpen) document.addEventListener("mousedown", handleOutsideClick);
    else document.removeEventListener("mousedown", handleOutsideClick);
  }

  function updateActiveSegment() {
    const current = Number(slider.value);
    let matchedPreset = false;
    presetButtons.forEach((button, i) => {
      const isMatch = Math.abs(current - PRESETS[i].value) < PRESET_EPSILON;
      button.classList.toggle("active", isMatch);
      if (isMatch) matchedPreset = true;
    });
    // Sin preset exacto: el mix está en un punto intermedio elegido a mano
    // desde el popover — marcar el ▾ como "activo" para que quede claro que
    // hay una mezcla personalizada corriendo, no solo un ajuste sin aplicar.
    toggleButton.classList.toggle("active", !matchedPreset);
  }

  function setMix(value) {
    slider.value = String(value);
    playerController.setMix(value);
    updateActiveSegment();
  }

  slider.addEventListener("input", () => {
    playerController.setMix(Number(slider.value));
    updateActiveSegment();
  });

  const presetButtons = PRESETS.map(({ value, label, title }) =>
    h(
      "button",
      {
        class: "mix-segment",
        title,
        onclick: () => {
          setOpen(false);
          setMix(value);
        },
      },
      [label]
    )
  );

  const toggleButton = h(
    "button",
    {
      class: "mix-segment mix-segment-toggle",
      title: "Ajuste fino",
      onclick: () => setOpen(!isOpen),
    },
    [icon("chevronDown")]
  );

  const segmented = h("div", { class: "mix-segmented" }, [...presetButtons, toggleButton]);
  // El popover vive afuera de .mix-segmented a propósito: ese div tiene
  // overflow:hidden (para redondear las puntas del grupo de botones), y eso
  // recorta cualquier hijo posicionado fuera de su caja — incluido un
  // popover que "flota" arriba. Un wrapper hermano sin overflow:hidden es el
  // que ancla el position:absolute del popover.
  const wrapper = h("div", { class: "mix-control" }, [popover, segmented]);

  updateActiveSegment();

  return {
    element: wrapper,
    slider,
    // El listener de "click afuera" vive en `document`, no en `wrapper` —
    // si la vista se desmonta con el popover abierto, hay que sacarlo a
    // mano o queda corriendo indefinidamente.
    destroy: () => document.removeEventListener("mousedown", handleOutsideClick),
  };
}
