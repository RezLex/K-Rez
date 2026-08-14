import { h, mount } from "../utils/dom-helpers.js";
import { createSong, updateSongMeta, getSong } from "../data/songs-repo.js";
import { navigate } from "../router.js";

export async function renderSongEditView(root, songId) {
  const isNew = !songId;
  const existing = isNew ? null : await getSong(songId);
  if (!isNew && !existing) {
    navigate("/songs");
    return;
  }

  const nombreInput = h("input", { type: "text", value: existing?.nombre ?? "", placeholder: "Nombre" });
  const artistaInput = h("input", { type: "text", value: existing?.artista ?? "", placeholder: "Artista" });
  const keyInput = h("input", { type: "text", value: existing?.key ?? "", placeholder: "Tonalidad (ej. Am)" });
  const bpmInput = h("input", { type: "number", value: existing?.bpm ?? "", placeholder: "BPM" });

  const form = h(
    "form",
    {
      class: "stack",
      onsubmit: async (event) => {
        event.preventDefault();
        const meta = {
          nombre: nombreInput.value.trim(),
          artista: artistaInput.value.trim(),
          key: keyInput.value.trim(),
          bpm: bpmInput.value ? Number(bpmInput.value) : null,
        };
        if (isNew) {
          await createSong(meta);
        } else {
          await updateSongMeta(songId, meta);
        }
        navigate("/songs");
      },
    },
    [
      h("h1", {}, [isNew ? "Nueva canción" : "Editar canción"]),
      nombreInput,
      artistaInput,
      keyInput,
      bpmInput,
      h("div", { class: "actions" }, [
        h("button", { type: "button", class: "ghost", onclick: () => navigate("/songs") }, ["Cancelar"]),
        h("button", { type: "submit", class: "primary" }, ["Guardar"]),
      ]),
    ]
  );

  mount(root, h("div", { class: "screen" }, [form]));
}
