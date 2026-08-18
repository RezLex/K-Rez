import { h } from "../utils/dom-helpers.js";
import { listSongsForUser } from "../data/songs-repo.js";
import { getCurrentUser } from "../auth/auth-service.js";
import { navigate } from "../router.js";
import { icon } from "../utils/icons.js";

const AUTOPLAY_KEY = "k-rez-autoplay-request";

// Guarda un pedido de autoplay para songId (y opcionalmente el modo
// original/karaoke que estaba sonando) — lo consume takeAutoplayRequest() al
// entrar a Live. Compartido entre el botón ▶ de este sidebar y las cards de
// /songs, que disparan el mismo autoplay al abrir una canción.
export function requestAutoplay(songId, mode) {
  sessionStorage.setItem(AUTOPLAY_KEY, JSON.stringify({ songId, mode }));
}

// Se llama una sola vez al abrir Live: si hay un pedido de autoplay
// guardado (desde el botón ▶ de un item del sidebar) y es para esta misma
// canción, devuelve el modo (original/karaoke) con el que había que abrirla.
// Se consume (se borra) siempre, sea o no para esta canción, para no
// dejarlo pendiente y disparar un autoplay viejo en una navegación futura.
export function takeAutoplayRequest(songId) {
  const raw = sessionStorage.getItem(AUTOPLAY_KEY);
  sessionStorage.removeItem(AUTOPLAY_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return data.songId === songId ? data.mode : null;
  } catch {
    return null;
  }
}

// Panel lateral con la lista de canciones del usuario, para cambiar de
// canción sin volver a /songs. getCurrentMode() se consulta recién al
// clickear ▶ en un item — así el modo que se lleva a la canción destino es
// el que esté sonando en ESE momento en la vista actual (Live o Config).
export function createSongsSidebar({ getCurrentMode }) {
  const listEl = h("ul", { class: "songs-sidebar-list" }, [h("li", { class: "muted" }, ["Cargando..."])]);
  let loaded = false;
  let isOpen = false;

  // "open" en vez de "hidden" en el panel: display:none no se puede animar,
  // así que el panel siempre está en el DOM y se desliza con transform (ver
  // .songs-sidebar en components.css) — .hidden se queda solo para el
  // backdrop, cuyo aparecer/desaparecer instantáneo no se nota tanto como el
  // del panel. La pestaña (tab) se mueve junto con el panel: ambas comparten
  // --sidebar-width y la misma duración de transición.
  function close() {
    isOpen = false;
    backdrop.classList.add("hidden");
    panel.classList.remove("open");
    tab.classList.remove("open");
  }

  function open() {
    isOpen = true;
    backdrop.classList.remove("hidden");
    panel.classList.add("open");
    tab.classList.add("open");
    if (!loaded) loadSongs();
  }

  async function loadSongs() {
    loaded = true;
    const user = getCurrentUser();
    if (!user) return;
    const songs = await listSongsForUser(user.uid);
    if (songs.length === 0) {
      listEl.replaceChildren(h("li", { class: "muted" }, ["No hay canciones."]));
      return;
    }
    listEl.replaceChildren(
      ...songs.map((song) =>
        h("li", { class: "songs-sidebar-item" }, [
          h(
            "button",
            {
              class: "ghost songs-sidebar-play",
              title: "Reproducir",
              onclick: () => {
                requestAutoplay(song.id, getCurrentMode());
                close();
                navigate(`/songs/${song.id}`);
              },
            },
            [icon("play")]
          ),
          h(
            "button",
            {
              class: "songs-sidebar-link",
              onclick: () => {
                close();
                navigate(`/songs/${song.id}`);
              },
            },
            [`${song.nombre} — ${song.artista}`]
          ),
        ])
      )
    );
  }

  const backdrop = h("div", { class: "songs-sidebar-backdrop hidden", onclick: close });
  const panel = h("div", { class: "songs-sidebar" }, [
    h("div", { class: "bar" }, [
      h("h2", {}, ["Canciones"]),
      h("button", { class: "ghost", onclick: close }, [icon("x")]),
    ]),
    listEl,
  ]);

  // Pestaña fija al borde izquierdo, siempre visible (ya no vive en la
  // player-bar) — hace de manija del panel: se desliza junto con él (ver
  // .songs-sidebar-tab.open) para leerse como una sola pieza, no dos
  // controles separados. Toggle (no solo "open"), porque ahora queda pegada
  // al borde del panel abierto — tiene más sentido que cerrarlo requiera
  // clickearla de nuevo, en vez de solo el backdrop o la "✕" de adentro.
  const tab = h(
    "button",
    { class: "songs-sidebar-tab", title: "Canciones", onclick: () => (isOpen ? close() : open()) },
    [icon("menu")]
  );

  return { element: h("div", {}, [tab, backdrop, panel]) };
}
