import { h } from "../utils/dom-helpers.js";
import { updateSections } from "../data/songs-repo.js";

const TIPOS = ["Intro", "Verso", "Estribillo", "Puente", "Outro"];
const CUSTOM = "__custom__";

function formatOffsetTime(seconds) {
  return `${seconds.toFixed(1)}s`;
}

function nextName(sections, tipo) {
  const count = sections.filter(
    (section) => section.nombre === tipo || section.nombre.startsWith(`${tipo} `)
  ).length;
  return `${tipo} ${count + 1}`;
}

export function createSectionsEditor(songId, initialSecciones, { getCurrentOriginalTime, seekToOriginalTime }) {
  const sections = initialSecciones.map((section) => ({ ...section }));
  const rowsContainer = h("div", { class: "lyrics-rows" }, []);
  let rowEntries = [];

  function renderRows() {
    rowEntries = sections.map((section, index) => {
      const timeButton = h(
        "button",
        {
          class: "ghost lyrics-time",
          onclick: () => {
            if (sections[index].timestampSeconds !== null) {
              seekToOriginalTime(sections[index].timestampSeconds);
            }
          },
        },
        [section.timestampSeconds === null ? "--:--" : formatOffsetTime(section.timestampSeconds)]
      );

      function nudgeTimestamp(delta) {
        if (sections[index].timestampSeconds === null) return;
        const next = Math.max(0, Math.round((sections[index].timestampSeconds + delta) * 100) / 100);
        sections[index].timestampSeconds = next;
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
          onclick: () => {
            const time = getCurrentOriginalTime();
            if (time === null) return;
            sections[index].timestampSeconds = Math.round(time * 100) / 100;
            timeButton.textContent = formatOffsetTime(sections[index].timestampSeconds);
          },
        },
        ["Marcar tiempo"]
      );

      const editButton = h(
        "button",
        {
          class: "ghost",
          onclick: () => {
            nameInput.readOnly = !nameInput.readOnly;
            editButton.textContent = nameInput.readOnly ? "Editar" : "Listo";
            if (!nameInput.readOnly) nameInput.focus();
          },
        },
        ["Editar"]
      );

      const nameInput = h("input", {
        type: "text",
        value: section.nombre,
        readonly: "true",
        onclick: () => {
          if (nameInput.readOnly && sections[index].timestampSeconds !== null) {
            seekToOriginalTime(sections[index].timestampSeconds);
          }
        },
        oninput: (event) => {
          sections[index].nombre = event.target.value;
        },
        onblur: () => {
          nameInput.readOnly = true;
          editButton.textContent = "Editar";
        },
      });

      const deleteButton = h(
        "button",
        {
          class: "ghost danger",
          onclick: () => {
            sections.splice(index, 1);
            renderRows();
          },
        },
        ["Eliminar"]
      );

      const row = h("div", { class: "lyrics-row" }, [
        timeButton,
        nudgeMinusButton,
        nudgePlusButton,
        nameInput,
        editButton,
        markButton,
        deleteButton,
      ]);
      return { row, line: section };
    });
    rowsContainer.replaceChildren(...rowEntries.map((entry) => entry.row));
  }

  renderRows();

  const tipoSelect = h("select", {}, [
    ...TIPOS.map((tipo) => h("option", { value: tipo }, [tipo])),
    h("option", { value: CUSTOM }, ["Otro"]),
  ]);
  const customInput = h("input", { type: "text", placeholder: "Nombre de la sección", class: "hidden" });
  tipoSelect.addEventListener("change", () => {
    customInput.classList.toggle("hidden", tipoSelect.value !== CUSTOM);
  });

  const addButton = h(
    "button",
    {
      class: "ghost",
      onclick: () => {
        const nombre =
          tipoSelect.value === CUSTOM ? customInput.value.trim() : nextName(sections, tipoSelect.value);
        if (!nombre) return;
        sections.push({ nombre, timestampSeconds: null });
        customInput.value = "";
        renderRows();
      },
    },
    ["+ Sección"]
  );

  const saveButton = h(
    "button",
    {
      class: "primary",
      onclick: async () => {
        await updateSections(songId, sections);
        saveButton.textContent = "Guardado";
        setTimeout(() => {
          saveButton.textContent = "Guardar secciones";
        }, 1500);
      },
    },
    ["Guardar secciones"]
  );

  const element = h("div", { class: "stack" }, [
    rowsContainer,
    h("div", { class: "bar" }, [tipoSelect, customInput, addButton]),
    h("div", { class: "actions" }, [saveButton]),
  ]);

  return {
    element,
    getRowEntries: () => rowEntries,
  };
}
