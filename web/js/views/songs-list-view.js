import { h, mount } from "../utils/dom-helpers.js";
import { listSongsForUser } from "../data/songs-repo.js";
import { signOutUser } from "../auth/auth-service.js";
import { navigate } from "../router.js";
import { getPlayableUrl } from "../media/media-url.js";
import { icon } from "../utils/icons.js";
import { requestAutoplay } from "./songs-sidebar.js";

function songMatches(song, query) {
  if (!query) return true;
  return `${song.nombre} ${song.artista}`.toLowerCase().includes(query);
}

function renderSongCard(song) {
  const cover = h("img", { class: "hidden", alt: "" });
  const placeholder = h("span", { class: "song-card-cover-placeholder" }, ["Sin carátula"]);

  if (song.caratulaUrl) {
    getPlayableUrl(song.id, "caratula").then((url) => {
      cover.src = url;
      cover.classList.remove("hidden");
      placeholder.classList.add("hidden");
    });
  }

  return h(
    "div",
    { class: "song-card", onclick: () => navigate(`/songs/${song.id}`) },
    [
      h("div", { class: "song-card-cover" }, [
        cover,
        placeholder,
        h(
          "button",
          {
            class: "song-card-play",
            title: "Reproducir",
            onclick: (event) => {
              event.stopPropagation();
              requestAutoplay(song.id, null);
              navigate(`/songs/${song.id}`);
            },
          },
          [icon("play")]
        ),
      ]),
      h("div", { class: "song-card-info" }, [
        h("strong", { class: "song-card-title" }, [song.nombre]),
        h("span", { class: "song-card-artist" }, [song.artista]),
      ]),
    ]
  );
}

export async function renderSongsListView(root, user) {
  const grid = h("div", { class: "songs-grid" }, [h("p", { class: "muted" }, ["Cargando..."])]);
  const searchInput = h("input", {
    type: "search",
    class: "songs-search",
    placeholder: "Buscar por nombre o artista...",
  });

  let songs = [];

  function renderGrid() {
    if (songs.length === 0) {
      grid.replaceChildren(h("p", { class: "muted" }, ["Todavía no hay canciones."]));
      return;
    }
    const query = searchInput.value.trim().toLowerCase();
    const filtered = songs.filter((song) => songMatches(song, query));
    if (filtered.length === 0) {
      grid.replaceChildren(h("p", { class: "muted" }, ["Ninguna canción coincide con la búsqueda."]));
      return;
    }
    grid.replaceChildren(...filtered.map(renderSongCard));
  }

  searchInput.addEventListener("input", renderGrid);

  mount(
    root,
    h("div", { class: "screen screen-wide has-header-bar" }, [
      h("header", { class: "bar screen-header" }, [
        h("h1", {}, ["Mis canciones"]),
        h("button", { class: "ghost", onclick: () => signOutUser() }, ["Salir"]),
      ]),
      h("div", { class: "bar songs-toolbar" }, [
        searchInput,
        h("button", { class: "primary", onclick: () => navigate("/songs/new") }, ["+ Nueva canción"]),
      ]),
      grid,
    ])
  );

  songs = await listSongsForUser(user.uid);
  renderGrid();
}
