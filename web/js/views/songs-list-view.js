import { h, mount } from "../utils/dom-helpers.js";
import { listSongsForUser, deleteSong } from "../data/songs-repo.js";
import { signOutUser } from "../auth/auth-service.js";
import { navigate } from "../router.js";

export async function renderSongsListView(root, user) {
  const list = h("ul", { class: "song-list" }, [h("li", {}, ["Cargando..."])]);

  mount(
    root,
    h("div", { class: "screen" }, [
      h("header", { class: "bar" }, [
        h("h1", {}, ["Mis canciones"]),
        h("button", { class: "ghost", onclick: () => signOutUser() }, ["Salir"]),
      ]),
      h("button", { class: "primary", onclick: () => navigate("/songs/new") }, ["+ Nueva canción"]),
      list,
    ])
  );

  const songs = await listSongsForUser(user.uid);
  if (songs.length === 0) {
    list.replaceChildren(h("li", { class: "muted" }, ["Todavía no hay canciones."]));
    return;
  }

  list.replaceChildren(
    ...songs.map((song) =>
      h("li", { class: "song-row" }, [
        h(
          "button",
          { class: "song-link", onclick: () => navigate(`/songs/${song.id}`) },
          [`${song.nombre} — ${song.artista}`]
        ),
        h(
          "button",
          { class: "ghost", onclick: () => navigate(`/songs/${song.id}/edit`) },
          ["Editar"]
        ),
        h(
          "button",
          {
            class: "ghost danger",
            onclick: async () => {
              if (!confirm(`¿Eliminar "${song.nombre}"?`)) return;
              await deleteSong(song.id);
              renderSongsListView(root, user);
            },
          },
          ["Eliminar"]
        ),
      ])
    )
  );
}
