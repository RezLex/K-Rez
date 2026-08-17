import { h } from "../utils/dom-helpers.js";

// Slot unificado para un archivo: la misma caja muestra el archivo actual
// (nombre + Reemplazar/Eliminar) o la zona de arrastrar/click-para-elegir —
// nunca las dos a la vez ni en cajas separadas. "Reemplazar" es un paso
// explícito (clickearlo) antes de poder soltar/elegir uno nuevo — evita
// perder el archivo actual por un drag accidental encima del slot.
export function createFileSlot({ accept, fileName, hasFile, confirmMessage, onUpload, onDelete }) {
  const fileInput = h("input", { type: "file", accept, class: "hidden" });
  const box = h("div", { class: "file-slot" }, []);
  let mode = hasFile ? "filled" : "dropzone";
  let currentAbort = null;

  function render() {
    box.classList.toggle("file-slot-dropzone", mode === "dropzone");
    if (mode === "dropzone") {
      box.replaceChildren(
        h("span", { class: "muted" }, ["Arrastrá un archivo acá o hacé click para elegirlo"]),
        fileInput
      );
      return;
    }

    if (mode === "uploading") {
      const uploadingLabel = h("span", { class: "file-slot-name" }, [`Subiendo: ${fileName}`]);
      const cancelButton = h(
        "button",
        {
          class: "ghost",
          onclick: (event) => {
            event.stopPropagation();
            currentAbort?.abort();
          },
        },
        ["Cancelar"]
      );
      box.replaceChildren(
        h("div", { class: "file-slot-current" }, [
          uploadingLabel,
          h("div", { class: "file-slot-actions" }, [cancelButton]),
        ])
      );
      return;
    }

    const nameLabel = h("span", { class: "file-slot-name" }, [fileName || "Archivo cargado"]);

    const replaceButton = h(
      "button",
      {
        class: "ghost",
        onclick: (event) => {
          event.stopPropagation();
          mode = "dropzone";
          render();
        },
      },
      ["Reemplazar"]
    );
    const deleteButton = h(
      "button",
      {
        class: "ghost danger",
        onclick: async (event) => {
          event.stopPropagation();
          if (!confirm("¿Eliminar este archivo?")) return;
          replaceButton.disabled = true;
          deleteButton.disabled = true;
          await onDelete();
        },
      },
      ["Eliminar"]
    );
    box.replaceChildren(
      h("div", { class: "file-slot-current" }, [
        nameLabel,
        h("div", { class: "file-slot-actions" }, [replaceButton, deleteButton]),
      ])
    );
  }

  async function startUpload(file) {
    if (confirmMessage && !confirm(confirmMessage)) return;
    const revertTo = hasFile ? "filled" : "dropzone";
    currentAbort = new AbortController();
    mode = "uploading";
    fileName = file.name;
    render();
    try {
      await onUpload(file, currentAbort.signal);
      // Éxito: el caller dispara un re-render completo de la vista con los
      // datos frescos de Firestore — este slot no necesita seguir vivo.
    } catch (err) {
      if (err?.name !== "AbortError") alert("No se pudo subir el archivo.");
      mode = revertTo;
      render();
    } finally {
      currentAbort = null;
    }
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (file) startUpload(file);
  });

  box.addEventListener("click", () => {
    if (mode === "dropzone") fileInput.click();
  });
  box.addEventListener("dragover", (event) => {
    if (mode !== "dropzone") return;
    event.preventDefault();
    box.classList.add("drag-over");
  });
  box.addEventListener("dragleave", () => box.classList.remove("drag-over"));
  box.addEventListener("drop", (event) => {
    if (mode !== "dropzone") return;
    event.preventDefault();
    box.classList.remove("drag-over");
    const file = event.dataTransfer.files[0];
    if (file) startUpload(file);
  });

  render();
  return { element: box };
}
