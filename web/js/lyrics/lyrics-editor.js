import { h } from "../utils/dom-helpers.js";
import { updateLyrics } from "../data/songs-repo.js";
import { icon } from "../utils/icons.js";

function formatOffsetTime(seconds) {
  // Sin toFixed: el valor ya viene redondeado a 2 decimales al setearlo
  // (nudges/marcar/commitTimeEdit) — mostrar el número tal cual, sin forzar
  // una cantidad de decimales que no sea la real.
  return String(seconds);
}

function formatTimeValue(value) {
  return value === null || value === undefined ? "--:--" : formatOffsetTime(value);
}

// Clickear cualquier botón de la fila mientras el input de texto está en
// modo edición dispara primero el "blur" del input (el foco pasa al botón),
// lo que ya lo pone en readOnly=true — sin esto, "Listo" leía ese estado ya
// cambiado y reabría el modo edición en vez de cerrarlo. preventDefault en
// mousedown evita que el botón le saque el foco al input, así los controles
// de tiempo quedan usables en cualquier momento sin interferir con la edición.
function preventBlur(event) {
  event.preventDefault();
}

// Huecos de silencio/instrumental más largos que esto se convierten en una
// línea en blanco (separador de estrofa) al importar cuando el JSON no trae
// separadores explícitos — solo aplica a fuentes externas (ver
// parseImportedLyrics: un JSON reexportado por K-Rez ya trae sus propios
// separadores y no pasa por esta heurística).
const IMPORT_GAP_SECONDS = 3;

function parseImportedLyrics(json, songName) {
  if (!json || !Array.isArray(json.lines)) {
    throw new Error('el JSON debe tener un array "lines"');
  }
  if (songName && json.song && json.song !== songName) {
    const proceed = confirm(
      `Este JSON es de "${json.song}", estás importando en "${songName}". ¿Continuar de todas formas?`
    );
    if (!proceed) return null;
  }

  const newLines = [];
  let prevEnd = null;
  for (const entry of json.lines) {
    const text = typeof entry.text === "string" ? entry.text : "";
    if (text.trim() === "") {
      // Separador explícito (viene de un "Exportar JSON" previo) — se respeta
      // tal cual, sin volver a inferirlo por hueco de tiempo.
      newLines.push({ texto: "", timestampSeconds: null, endSeconds: null });
      prevEnd = null;
      continue;
    }
    if (typeof entry.start !== "number") continue;
    const start = Math.round(entry.start * 100) / 100;
    const end = typeof entry.end === "number" ? Math.round(entry.end * 100) / 100 : null;
    if (prevEnd !== null && start - prevEnd > IMPORT_GAP_SECONDS) {
      newLines.push({ texto: "", timestampSeconds: null, endSeconds: null });
    }
    newLines.push({ texto: text, timestampSeconds: start, endSeconds: end });
    prevEnd = end ?? start;
  }
  return newLines;
}

// Reconcilia el texto pegado/editado en el textarea de "Cargar letra" contra
// las líneas actuales, para no perder los tiempos ya marcados. Usa LCS por
// texto exacto (igual que un diff): las líneas sin cambios conservan su
// timestampSeconds/endSeconds sin importar que se hayan agregado o borrado
// otras alrededor. Dentro de cada hueco entre dos coincidencias, empareja
// posicionalmente lo que quedó de un lado y del otro (mismo conteo = "edité
// esta frase, no la borré y agregué otra") para conservar el tiempo también
// en ese caso; lo que sobra del lado nuevo es una línea realmente nueva y
// arranca en 0s (o null si es un separador en blanco).
function reconcileBulkLyrics(oldLines, newTextos) {
  const oldTextos = oldLines.map((line) => line.texto);
  const n = oldTextos.length;
  const m = newTextos.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        oldTextos[i] === newTextos[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const blankLine = (texto) => ({ texto, timestampSeconds: null });
  const freshLine = (texto) => (texto.trim() === "" ? blankLine(texto) : { texto, timestampSeconds: 0 });

  const result = [];
  let pendingOld = [];
  let pendingNew = [];

  function flushPending() {
    const pairs = Math.min(pendingOld.length, pendingNew.length);
    for (let k = 0; k < pairs; k++) {
      const texto = newTextos[pendingNew[k]];
      result.push(texto.trim() === "" ? blankLine(texto) : { ...oldLines[pendingOld[k]], texto });
    }
    for (let k = pairs; k < pendingNew.length; k++) {
      result.push(freshLine(newTextos[pendingNew[k]]));
    }
    pendingOld = [];
    pendingNew = [];
  }

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldTextos[i] === newTextos[j]) {
      flushPending();
      result.push({ ...oldLines[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      pendingOld.push(i);
      i++;
    } else {
      pendingNew.push(j);
      j++;
    }
  }
  while (i < n) pendingOld.push(i++);
  while (j < m) pendingNew.push(j++);
  flushPending();

  return result;
}

function exportLyricsJson(lines, songName) {
  const exportLines = lines.map((line) => {
    if (line.texto.trim() === "") return { text: "", start: null, end: null };
    const entry = { text: line.texto, start: line.timestampSeconds };
    if (line.endSeconds !== null && line.endSeconds !== undefined) entry.end = line.endSeconds;
    return entry;
  });
  const blob = new Blob([JSON.stringify({ song: songName ?? "", lines: exportLines }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = h("a", { href: url, download: `${songName || "letra"}.json` }, []);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createLyricsEditor(
  songId,
  initialLetra,
  { getCurrentOriginalTime, seekToOriginalTime, songName }
) {
  const lines = initialLetra.map((line) => ({ ...line }));
  const rowsContainer = h("div", { class: "lyrics-rows" }, []);
  let rowEntries = [];
  // "setup" (default): como estaba hasta ahora — controles de tiempo
  // visibles (según haya texto o no), texto de solo lectura con toggle
  // ✎/✓ por fila, sin botones de agregar/eliminar línea.
  // "edicion": todas las filas editables a la vez (sin el toggle ✎/✓ por
  // fila, que ahí no tiene sentido), con +↑/+↓/✕ visibles para reestructurar
  // la letra, y sin ningún control de tiempo (no es el momento de marcar
  // tiempos, es el de reescribir contenido).
  let mode = "setup";

  function renderRows() {
    rowEntries = lines.map((line, index) => {
      // Los campos de tiempo (start/end) son inputs de texto editables a
      // mano: al enfocarlos muestran el número crudo (sin el sufijo "s") y
      // seleccionado para sobreescribir fácil; al perder el foco o con
      // Enter, se parsea y se guarda. El seek-por-click que tenían antes se
      // sacó (ya lo cubre el click en las dos zonas del texto de la línea) —
      // si no, no se podría ni clickear para poner el cursor a escribir.
      function commitTimeEdit(field, rawValue, displayInput) {
        const trimmed = rawValue.trim();
        if (trimmed === "") {
          lines[index][field] = null;
        } else {
          const parsed = parseFloat(trimmed.replace(",", "."));
          if (!Number.isNaN(parsed)) {
            lines[index][field] = Math.max(0, Math.round(parsed * 100) / 100);
          }
        }
        displayInput.value = formatTimeValue(lines[index][field]);
      }

      const timeButton = h("input", {
        type: "text",
        inputmode: "decimal",
        class: "ghost lyrics-time",
        value: formatTimeValue(line.timestampSeconds),
        onfocus: (event) => {
          event.target.value = lines[index].timestampSeconds === null ? "" : String(lines[index].timestampSeconds);
          event.target.select();
        },
        onblur: (event) => commitTimeEdit("timestampSeconds", event.target.value, timeButton),
        onkeydown: (event) => {
          if (event.key === "Enter") event.target.blur();
        },
      });

      function nudgeTimestamp(delta) {
        if (lines[index].timestampSeconds === null) return;
        const next = Math.max(0, Math.round((lines[index].timestampSeconds + delta) * 100) / 100);
        lines[index].timestampSeconds = next;
        timeButton.value = formatTimeValue(next);
      }

      const nudgeMinusButton = h(
        "button",
        {
          class: "ghost",
          title: "Restar 0.1s",
          onmousedown: preventBlur,
          onclick: () => nudgeTimestamp(-0.1),
        },
        ["−"]
      );
      const nudgePlusButton = h(
        "button",
        {
          class: "ghost",
          title: "Sumar 0.1s",
          onmousedown: preventBlur,
          onclick: () => nudgeTimestamp(0.1),
        },
        ["+"]
      );

      const endTimeButton = h("input", {
        type: "text",
        inputmode: "decimal",
        class: "ghost lyrics-time",
        value: formatTimeValue(line.endSeconds),
        onfocus: (event) => {
          event.target.value = lines[index].endSeconds == null ? "" : String(lines[index].endSeconds);
          event.target.select();
        },
        onblur: (event) => commitTimeEdit("endSeconds", event.target.value, endTimeButton),
        onkeydown: (event) => {
          if (event.key === "Enter") event.target.blur();
        },
      });

      function nudgeEndTimestamp(delta) {
        if (lines[index].endSeconds == null) return;
        const next = Math.max(0, Math.round((lines[index].endSeconds + delta) * 100) / 100);
        lines[index].endSeconds = next;
        endTimeButton.value = formatTimeValue(next);
      }

      const nudgeEndMinusButton = h(
        "button",
        {
          class: "ghost",
          title: "Restar 0.1s",
          onmousedown: preventBlur,
          onclick: () => nudgeEndTimestamp(-0.1),
        },
        ["−"]
      );
      const nudgeEndPlusButton = h(
        "button",
        {
          class: "ghost",
          title: "Sumar 0.1s",
          onmousedown: preventBlur,
          onclick: () => nudgeEndTimestamp(0.1),
        },
        ["+"]
      );

      const markButton = h(
        "button",
        {
          class: "ghost",
          title: "Marcar Inicio",
          onmousedown: preventBlur,
          onclick: () => {
            const time = getCurrentOriginalTime();
            if (time === null) return;
            const rounded = Math.round(time * 100) / 100;
            lines[index].timestampSeconds = rounded;
            timeButton.value = formatTimeValue(rounded);
          },
        },
        [icon("circle")]
      );

      const markEndButton = h(
        "button",
        {
          class: "ghost",
          title: "Marcar Fin",
          onmousedown: preventBlur,
          onclick: () => {
            const time = getCurrentOriginalTime();
            if (time === null) return;
            const rounded = Math.round(time * 100) / 100;
            lines[index].endSeconds = rounded;
            endTimeButton.value = formatTimeValue(rounded);
          },
        },
        [icon("circle")]
      );

      const startGroup = h("span", { class: "lyrics-time-group lyrics-time-group-start" }, [
        markButton,
        nudgeMinusButton,
        timeButton,
        nudgePlusButton,
      ]);
      const endGroup = h("span", { class: "lyrics-time-group lyrics-time-group-end" }, [
        nudgeEndMinusButton,
        endTimeButton,
        nudgeEndPlusButton,
        markEndButton,
      ]);

      // Sin texto no hay nada que cronometrar ni nada para hacer seek: los
      // controles de tiempo se ocultan (visibility, no display, para no
      // desalinear los íconos de la derecha entre filas), y el input pierde
      // el look/comportamiento clickeable de las dos zonas (no tiene sentido
      // marcar un punto en una línea vacía). En modo "edicion" ni siquiera se
      // agregan al DOM (ver ensamblado de la fila más abajo).
      function syncBlankState() {
        const isBlank = lines[index].texto.trim() === "";
        startGroup.classList.toggle("time-controls-hidden", isBlank);
        endGroup.classList.toggle("time-controls-hidden", isBlank);
        textWrap.classList.toggle("blank", isBlank);
      }

      // El texto es de solo lectura en Setup (ahí solo se puede hacer seek
      // clickeando las dos zonas) y editable siempre en Edición — ya no hay
      // toggle ✎/✓ por fila, editar texto es una capacidad exclusiva del
      // modo Edición (ver `mode`/`setMode`).
      const textInput = h("input", {
        type: "text",
        value: line.texto,
        readonly: mode === "setup" ? "true" : null,
        onclick: (event) => {
          if (!textInput.readOnly || lines[index].texto.trim() === "") return;
          const rect = textInput.getBoundingClientRect();
          const clickedRightHalf = event.clientX - rect.left > rect.width / 2;
          if (clickedRightHalf) {
            if (lines[index].endSeconds != null) seekToOriginalTime(lines[index].endSeconds);
          } else if (lines[index].timestampSeconds !== null) {
            seekToOriginalTime(lines[index].timestampSeconds);
          }
        },
        oninput: (event) => {
          lines[index].texto = event.target.value;
          syncBlankState();
        },
      });

      const textWrap = h("div", { class: "lyrics-text-wrap" }, [textInput]);
      syncBlankState();

      function insertBlankLine(offset) {
        lines.splice(index + offset, 0, { texto: "", timestampSeconds: null });
        renderRows();
      }

      const addAboveButton = h(
        "button",
        {
          class: "ghost",
          title: "Agregar línea arriba",
          onmousedown: preventBlur,
          onclick: () => insertBlankLine(0),
        },
        [icon("arrowUp")]
      );
      const addBelowButton = h(
        "button",
        {
          class: "ghost",
          title: "Agregar línea abajo",
          onmousedown: preventBlur,
          onclick: () => insertBlankLine(1),
        },
        [icon("arrowDown")]
      );

      const deleteButton = h(
        "button",
        {
          class: "ghost danger",
          title: "Eliminar",
          onmousedown: preventBlur,
          onclick: () => {
            lines.splice(index, 1);
            renderRows();
          },
        },
        [icon("x")]
      );

      const rowChildren =
        mode === "setup"
          ? [startGroup, textWrap, endGroup]
          : [textWrap, addAboveButton, addBelowButton, deleteButton];
      const row = h("div", { class: "lyrics-row" }, rowChildren);
      return { row, line };
    });
    rowsContainer.replaceChildren(...rowEntries.map((entry) => entry.row));
  }

  renderRows();

  // Modo Setup (default): controles de tiempo visibles, texto de solo
  // lectura con toggle ✎/✓ por fila, sin agregar/eliminar líneas — pensado
  // para el trabajo fino de marcar tiempos sin arriesgar la estructura.
  // Modo Edición: todo el texto editable a la vez, con los íconos de
  // agregar arriba/abajo y eliminar para reestructurar la letra, sin
  // controles de tiempo — pensado para reescribir/reordenar contenido sin
  // la distracción de los tiempos.
  const setupModeButton = h(
    "button",
    { title: "Modo Setup — marcar tiempos", onclick: () => setMode("setup") },
    [icon("settings"), " Setup"]
  );
  const editModeButton = h(
    "button",
    { title: "Modo Edición — reescribir, agregar o eliminar líneas", onclick: () => setMode("edicion") },
    [icon("pencil"), " Edición"]
  );

  function updateModeButtons() {
    setupModeButton.className = mode === "setup" ? "primary" : "ghost";
    editModeButton.className = mode === "edicion" ? "primary" : "ghost";
    // "+ Línea" (agregar al final) es, ni más ni menos, otro botón de
    // agregar línea — se rige por la misma regla que los íconos de agregar
    // arriba/abajo/eliminar de cada fila.
    addButton?.classList.toggle("hidden", mode !== "edicion");
  }

  function setMode(next) {
    if (mode === next) return;
    mode = next;
    updateModeButtons();
    renderRows();
  }

  // El textarea de reemplazo masivo no vive en la vista normal — solo
  // aparece bajo pedido explícito (botón "Reemplazar") y con confirmación,
  // igual que "Exportar" es una acción puntual y no un campo siempre visible.
  const replaceTextarea = h("textarea", {
    rows: "8",
    placeholder: "Pegá el texto nuevo acá, una frase por línea.",
  });

  function closeReplace() {
    setReplaceVisible(false);
  }

  const replaceApplyButton = h(
    "button",
    {
      class: "ghost",
      title: "Aplicar reemplazo",
      onclick: () => {
        const newTextos = replaceTextarea.value.split("\n").map((texto) => texto.trim());
        const newLines = reconcileBulkLyrics(lines, newTextos);
        lines.splice(0, lines.length, ...newLines);
        closeReplace();
        renderRows();
      },
    },
    [icon("check"), " Aplicar"]
  );
  const replaceCancelButton = h(
    "button",
    { class: "ghost", title: "Cancelar", onclick: closeReplace },
    [icon("x"), " Cancelar"]
  );
  const replaceBlock = h("div", { class: "stack lyrics-replace hidden" }, [
    replaceTextarea,
    h("div", { class: "actions" }, [replaceApplyButton, replaceCancelButton]),
  ]);

  const replaceButton = h(
    "button",
    {
      class: "ghost",
      title: "Reemplazar letra completa",
      onclick: () => {
        const confirmed = confirm(
          "Vas a pegar texto nuevo para reemplazar la letra. Las frases que no cambien conservan su tiempo marcado; las nuevas arrancan en 0s. ¿Continuar?"
        );
        if (!confirmed) return;
        replaceTextarea.value = lines.map((line) => line.texto).join("\n");
        setReplaceVisible(true);
      },
    },
    [icon("arrowLeftRight"), " Reemplazar"]
  );

  const importFileInput = h("input", {
    type: "file",
    accept: "application/json,.json",
    style: "display:none",
    onchange: async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const json = JSON.parse(await file.text());
        if (lines.length > 0 && !confirm("Esto reemplaza la letra actual. ¿Continuar?")) return;
        const newLines = parseImportedLyrics(json, songName);
        if (!newLines) return;
        lines.splice(0, lines.length, ...newLines);
        renderRows();
      } catch (err) {
        alert(`No se pudo importar el JSON: ${err.message}`);
      } finally {
        importFileInput.value = "";
      }
    },
  });

  const importButton = h(
    "button",
    { class: "ghost", title: "Importar JSON", onclick: () => importFileInput.click() },
    [icon("arrowDown"), " Importar"]
  );

  const exportButton = h(
    "button",
    { class: "ghost", title: "Exportar JSON", onclick: () => exportLyricsJson(lines, songName) },
    [icon("arrowUp"), " Exportar"]
  );

  const addButton = h(
    "button",
    {
      class: "ghost",
      title: "Agregar línea al final",
      onclick: () => {
        lines.push({ texto: "", timestampSeconds: null });
        renderRows();
      },
    },
    ["+ Línea"]
  );

  const saveButton = h(
    "button",
    {
      class: "primary",
      title: "Guardar letra",
      onclick: async () => {
        await updateLyrics(songId, lines);
        saveButton.replaceChildren(icon("check"), " Guardado");
        setTimeout(() => {
          saveButton.replaceChildren(icon("save"), " Guardar");
        }, 1500);
      },
    },
    [icon("save"), " Guardar"]
  );

  updateModeButtons();

  const toolbar = h("div", { class: "actions" }, [
    setupModeButton,
    editModeButton,
    replaceButton,
    importButton,
    exportButton,
    importFileInput,
  ]);
  const bottomActions = h("div", { class: "actions" }, [addButton, saveButton]);

  // Reemplazo y setup normal son vistas mutuamente excluyentes: mientras el
  // textarea de reemplazo está abierto no tiene sentido ver además la lista
  // de filas ni el resto del toolbar (nada de eso aplica hasta confirmar o
  // cancelar el reemplazo).
  function setReplaceVisible(visible) {
    replaceBlock.classList.toggle("hidden", !visible);
    toolbar.classList.toggle("hidden", visible);
    rowsContainer.classList.toggle("hidden", visible);
    bottomActions.classList.toggle("hidden", visible);
  }

  const element = h("div", { class: "stack lyrics-editor" }, [
    toolbar,
    replaceBlock,
    rowsContainer,
    bottomActions,
  ]);

  return {
    element,
    getRowEntries: () => rowEntries,
  };
}
