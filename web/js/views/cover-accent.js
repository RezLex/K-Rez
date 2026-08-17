import { extractDominantColor } from "../utils/color-extract.js";

// Estado a nivel de módulo (no por vista) a propósito: el degradado y el
// --accent de carátula tienen que verse igual en el header y en la
// player-bar, que son hermanos en el DOM (no uno adentro del otro), así que
// la única forma de que ambos hereden la misma custom property es ponerla
// arriba de los dos — en `body`.
let currentSongId = null;
let glowElement = null;
let glowObserver = null;

// --glow-x/--glow-y (ver base.css, body.has-cover-accent::before) son el
// centro de la carátula REAL en pantalla, en % del viewport — no un punto
// fijo. getBoundingClientRect() ya da coordenadas relativas al viewport,
// igual que el pseudo-elemento del fondo (position:fixed), así que no hace
// falta ningún ajuste por scroll.
//
// width/height 0 (rect "degenerado") es lo que devuelve un elemento
// display:none — pasa en Live cuando se muestra el video de YouTube en vez
// de la carátula (coverArt se oculta con .hidden, ver song-live-view.js).
// Sin este guard, esos ceros se leían como "centro en la esquina superior
// izquierda" y el brillo saltaba ahí en vez de quedarse quieto en el último
// centro real conocido — la carátula sigue estando "ahí", solo tapada.
function updateGlowPosition() {
  if (!glowElement?.isConnected) return;
  const rect = glowElement.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;
  const x = ((rect.left + rect.width / 2) / window.innerWidth) * 100;
  const y = ((rect.top + rect.height / 2) / window.innerHeight) * 100;
  document.body.style.setProperty("--glow-x", `${x.toFixed(2)}%`);
  document.body.style.setProperty("--glow-y", `${y.toFixed(2)}%`);
}

// Se llama junto con applyCoverAccent, pasándole el elemento que MUESTRA la
// carátula en esa vista (el <img> grande de Live, el thumbnail de Config) —
// cada vista tiene el suyo, recreado en cada mount, así que llamar esto de
// nuevo ya reemplaza el tracking anterior sin necesitar un cleanup aparte.
// ResizeObserver cubre cambios de tamaño/layout del elemento (breakpoint,
// sidebar); resize/scroll del viewport cubren todo lo demás (el elemento
// puede no cambiar de tamaño y aun así moverse en pantalla).
export function trackGlowPosition(element) {
  stopTrackingGlowPosition();
  glowElement = element;
  glowObserver = new ResizeObserver(updateGlowPosition);
  glowObserver.observe(element);
  window.addEventListener("resize", updateGlowPosition, { passive: true });
  window.addEventListener("scroll", updateGlowPosition, { passive: true, capture: true });
  updateGlowPosition();
}

export function stopTrackingGlowPosition() {
  glowObserver?.disconnect();
  glowObserver = null;
  glowElement = null;
  window.removeEventListener("resize", updateGlowPosition);
  window.removeEventListener("scroll", updateGlowPosition, { capture: true });
}

// Se llama en cada mount de Live/Config: si la sesión no tiene carátula (o
// es una canción distinta a la que dejó puesto el acento), lo saca. Si es
// la misma canción que ya lo tenía aplicado, no hace nada — evita un
// parpadeo a "sin acento" y de vuelta mientras se resuelve la URL de nuevo.
export function clearCoverAccent(songId) {
  if (songId !== undefined && currentSongId !== songId) return;
  currentSongId = null;
  document.body.classList.remove("has-cover-accent");
  document.body.style.removeProperty("--cover-accent");
  stopTrackingGlowPosition();
}

export function applyCoverAccent(songId, url) {
  currentSongId = songId;
  extractDominantColor(url).then((color) => {
    // Si mientras se resolvía esto el usuario ya navegó a otra canción, no
    // pisar su acento con el de esta carga vieja.
    if (!color || currentSongId !== songId) return;
    document.body.style.setProperty("--cover-accent", `${color.r}, ${color.g}, ${color.b}`);
    document.body.classList.add("has-cover-accent");
  });
}
