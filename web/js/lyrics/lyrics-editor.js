import { h } from "../utils/dom-helpers.js";
import { updateLyrics } from "../data/songs-repo.js";

function formatOffsetTime(seconds) {
  return `${seconds.toFixed(1)}s`;
}

export function createLyricsEditor(songId, initialLetra, { getCurrentOriginalTime, seekToOriginalTime }) {
  const lines = initialLetra.map((line) => ({ ...line }));
  // Líneas en blanco vienen del "Cargar letra" y son solo separadores visuales
  // para Live — no se editan en Config. Las agregadas a mano con "+ Línea" son
  // la excepción: se muestran aunque estén vacías, porque el usuario las está
  // llenando activamente.
  const alwaysShow = new Set();
  const rowsContainer = h("div", { class: "lyrics-rows" }, []);
  let rowEntries = [];

  function renderRows() {
    rowEntries = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.texto.trim() !== "" || alwaysShow.has(line))
      .map(({ line, index }) => {
        const timeButton = h(
          "button",
          {
            class: "ghost lyrics-time",
            onclick: () => {
              if (lines[index].timestampSeconds !== null) {
                seekToOriginalTime(lines[index].timestampSeconds);
              }
            },
          },
          [line.timestampSeconds === null ? "--:--" : formatOffsetTime(line.timestampSeconds)]
        );

        function nudgeTimestamp(delta) {
          if (lines[index].timestampSeconds === null) return;
          const next = Math.max(0, Math.round((lines[index].timestampSeconds + delta) * 100) / 100);
          lines[index].timestampSeconds = next;
          timeButton.textContent = formatOffsetTime(next);
        }

        const nudgeMinusButton = h(
          "button",
          { class: "ghost", onclick: () => nudgeTimestamp(-0.1) },
          ["−0.1"]
        );
        const nudgePlusButton = h(
          "button",
          { class: "ghost", onclick: () => nudgeTimestamp(0.1) },
          ["+0.1"]
        );

        const markButton = h(
          "button",
          {
            class: "ghost",
            disabled: line.texto.trim() === "" ? "true" : null,
            onclick: () => {
              const time = getCurrentOriginalTime();
              if (time === null) return;
              lines[index].timestampSeconds = Math.round(time * 100) / 100;
              timeButton.textContent = formatOffsetTime(lines[index].timestampSeconds);
            },
          },
          ["Marcar tiempo"]
        );

        const editButton = h(
          "button",
          {
            class: "ghost",
            onclick: () => {
              textInput.readOnly = !textInput.readOnly;
              editButton.textContent = textInput.readOnly ? "Editar" : "Listo";
              if (!textInput.readOnly) textInput.focus();
            },
          },
          ["Editar"]
        );

        const textInput = h("input", {
          type: "text",
          value: line.texto,
          readonly: "true",
          placeholder: "(línea en blanco — separa estrofas en Live)",
          onclick: () => {
            if (textInput.readOnly && lines[index].timestampSeconds !== null) {
              seekToOriginalTime(lines[index].timestampSeconds);
            }
          },
          oninput: (event) => {
            lines[index].texto = event.target.value;
            markButton.disabled = event.target.value.trim() === "";
          },
          onblur: () => {
            textInput.readOnly = true;
            editButton.textContent = "Editar";
          },
        });

        const deleteButton = h(
          "button",
          {
            class: "ghost danger",
            onclick: () => {
              lines.splice(index, 1);
              renderRows();
            },
          },
          ["Eliminar"]
        );

        const row = h("div", { class: "lyrics-row" }, [
          timeButton,
          nudgeMinusButton,
          nudgePlusButton,
          textInput,
          editButton,
          markButton,
          deleteButton,
        ]);
        return { row, line };
      });
    rowsContainer.replaceChildren(...rowEntries.map((entry) => entry.row));
  }

  renderRows();

  const bulkTextarea = h("textarea", {
    rows: "6",
    placeholder: "Pegá la letra completa acá, una frase por línea. Después marcás el tiempo de cada una.",
  });
  // <textarea> no soporta el atributo "value" (a diferencia de <input>) — hay
  // que asignar la propiedad directamente para que el contenido se vea.
  bulkTextarea.value = lines.map((line) => line.texto).join("\n");
  const bulkLoadButton = h(
    "button",
    {
      class: "ghost",
      onclick: () => {
        const newLines = bulkTextarea.value
          .split("\n")
          .map((texto) => ({ texto: texto.trim(), timestampSeconds: null }));
        if (newLines.length === 0) return;
        if (lines.length > 0 && !confirm("Esto reemplaza la letra actual. ¿Continuar?")) return;
        lines.splice(0, lines.length, ...newLines);
        bulkTextarea.value = newLines.map((line) => line.texto).join("\n");
        renderRows();
      },
    },
    ["Cargar letra"]
  );

  const addButton = h(
    "button",
    {
      class: "ghost",
      onclick: () => {
        const newLine = { texto: "", timestampSeconds: null };
        alwaysShow.add(newLine);
        lines.push(newLine);
        renderRows();
      },
    },
    ["+ Línea"]
  );

  const saveButton = h(
    "button",
    {
      class: "primary",
      onclick: async () => {
        await updateLyrics(songId, lines);
        saveButton.textContent = "Guardado";
        setTimeout(() => {
          saveButton.textContent = "Guardar letra";
        }, 1500);
      },
    },
    ["Guardar letra"]
  );

  const element = h("div", { class: "stack" }, [
    h("div", { class: "stack lyrics-bulk" }, [bulkTextarea, bulkLoadButton]),
    rowsContainer,
    h("div", { class: "actions" }, [addButton, saveButton]),
  ]);

  return {
    element,
    getRowEntries: () => rowEntries,
  };
}
