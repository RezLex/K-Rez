// Íconos de Lucide (https://lucide.dev, licencia ISC) como SVG inline — sin
// CDN ni paso de build, cada <path>/<circle> es el trazo exacto del set
// oficial. Sin width/height fijos (se escalan por CSS vía font-size, ver
// .icon en base.css) para poder mezclarse con texto en el mismo botón sin
// descuadrar la línea, igual que hacían antes los caracteres Unicode que
// reemplazan (▶ ⏸ ⚙ ⌂ ☰ ✕ ▾ ● ↑ ↓ ✎ ✓ ⇄ ⤓).

const PATHS = {
  play: '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>',
  pause: '<rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/>',
  settings:
    '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
  house:
    '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  menu: '<path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  circle: '<circle cx="12" cy="12" r="10"/>',
  arrowUp: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  pencil:
    '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  arrowLeftRight: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  alertCircle:
    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
};

const parser = document.createElement("template");

// play/pause/circle vienen rellenos por default (fill: currentColor) — así
// se leen los controles principales del reproductor de un vistazo, en vez
// del look hueco/outline que sí tiene el resto de los íconos de Lucide.
// "circle" es el punto de "Marcar Inicio/Fin" en el editor de letra, que
// antes era el caracter "●" (siempre relleno). El param `filled` permite
// pisar este default en cualquier sentido si hiciera falta.
const FILLED_BY_DEFAULT = new Set(["play", "pause", "circle"]);

export function icon(name, { filled = FILLED_BY_DEFAULT.has(name) } = {}) {
  parser.innerHTML =
    `<svg viewBox="0 0 24 24" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon" aria-hidden="true">` +
    `${PATHS[name]}</svg>`;
  const node = parser.content.firstElementChild;
  parser.innerHTML = "";
  return node;
}
