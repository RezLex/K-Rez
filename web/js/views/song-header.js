import { h } from "../utils/dom-helpers.js";
import { navigate } from "../router.js";
import { icon } from "../utils/icons.js";

// Header compartido entre Config y Live: título + artista/key a la
// izquierda, botón primario (según `mode`) + volver a la lista a la
// derecha. `mode: "config"` muestra ícono play + "Live" (deshabilitado si
// !canGoLive); `mode: "live"` muestra ícono settings + "Config".
//
// `position: fixed` y alto fijo (`--bar-height`, ver base.css) para ocupar
// todo el ancho de la ventana y medir siempre lo mismo que `.player-bar` —
// título y artista truncan con ellipsis en vez de envolver, así que no hace
// falta medir el alto real en vivo (a diferencia de `.player-bar`, que sí
// puede crecer por el control de mezcla). El contenido de la pantalla
// reserva ese mismo `--bar-height` como padding-top vía `.has-header-bar`.
export function renderSongHeader(songId, song, { mode, canGoLive }) {
  const primaryButton =
    mode === "config"
      ? h(
          "button",
          { class: "ghost", disabled: canGoLive ? null : "true", onclick: () => navigate(`/songs/${songId}`) },
          [icon("play"), " Live"]
        )
      : h(
          "button",
          { class: "ghost", onclick: () => navigate(`/songs/${songId}/config`) },
          [icon("settings"), " Config"]
        );

  return h("header", { class: "bar screen-header" }, [
    h("div", { class: "screen-header-title" }, [
      h("h1", {}, [song.nombre]),
      h("p", { class: "muted" }, [`${song.artista}${song.key ? " — " + song.key : ""}`]),
    ]),
    h("div", { class: "actions" }, [
      primaryButton,
      h(
        "button",
        { class: "ghost", title: "Volver a mis canciones", onclick: () => navigate("/songs") },
        [icon("house")]
      ),
    ]),
  ]);
}
