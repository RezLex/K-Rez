export function attachLyricsPlayback(
  playerController,
  lyricsEditor,
  { scrollIntoView = true, scrollOptions = { block: "center", inline: "nearest" } } = {}
) {
  let activeRows = new Set();
  let primaryRow = null;

  // Fin efectivo de una línea: su endSeconds si lo tiene, si no, el start de
  // la próxima línea que empieza después (mismo comportamiento de "dura
  // hasta que la siguiente arranca" que ya existía). Con esto, una línea
  // puede seguir activa aunque otra ya haya empezado (si la primera trae
  // endSeconds y todavía no llegó) — a propósito: si los rangos configurados
  // se superponen, deben marcarse varias frases a la vez, no solo la última
  // que arrancó.
  function effectiveEnd(entry, entries) {
    if (entry.line.endSeconds !== null && entry.line.endSeconds !== undefined) {
      return entry.line.endSeconds;
    }
    let next = Infinity;
    for (const other of entries) {
      if (
        other.line.timestampSeconds > entry.line.timestampSeconds &&
        other.line.timestampSeconds < next
      ) {
        next = other.line.timestampSeconds;
      }
    }
    return next;
  }

  return playerController.on("timeupdate", ({ currentTime }) => {
    const originalTime = playerController.convertBetweenVersions(
      currentTime,
      playerController.activeVersionKey,
      "original"
    );

    const entries = lyricsEditor.getRowEntries().filter((entry) => entry.line.timestampSeconds !== null);

    let nextPrimaryEntry = null;
    const nextActiveEntries = [];
    for (const entry of entries) {
      const { timestampSeconds } = entry.line;
      if (timestampSeconds > originalTime) continue;
      if (originalTime >= effectiveEnd(entry, entries)) continue;
      nextActiveEntries.push(entry);
      if (!nextPrimaryEntry || timestampSeconds > nextPrimaryEntry.line.timestampSeconds) {
        nextPrimaryEntry = entry;
      }
    }

    const nextActiveRows = new Set(nextActiveEntries.map((entry) => entry.row));
    for (const row of activeRows) {
      if (!nextActiveRows.has(row)) row.classList.remove("active");
    }
    for (const row of nextActiveRows) {
      if (!activeRows.has(row)) row.classList.add("active");
    }
    activeRows = nextActiveRows;

    const nextPrimaryRow = nextPrimaryEntry?.row ?? null;
    if (nextPrimaryRow === primaryRow) return;
    primaryRow = nextPrimaryRow;
    if (scrollIntoView) primaryRow?.scrollIntoView({ behavior: "smooth", ...scrollOptions });
  });
}
