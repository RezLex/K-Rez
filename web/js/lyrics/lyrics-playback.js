// Corrige un delay percibido entre el audio y el resaltado en Live: sin
// esto la línea se marca justo cuando debería, pero se siente tarde. Adelanta
// el tiempo usado para decidir qué línea está activa, no el audio en sí.
const LYRICS_LEAD_SECONDS = 0.15;

// El scroll usa un adelanto propio, mayor al del resaltado: así el
// scrollIntoView (que es una animación "smooth", no instantánea) ya viene
// moviéndose cuando la frase se marca, en vez de arrancar recién en ese
// momento y notarse siempre atrás. 100ms de margen sobre el resaltado.
const SCROLL_LEAD_SECONDS = LYRICS_LEAD_SECONDS + 0.1;

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

  // Qué entradas están "activas" al tiempo dado, y cuál de ellas es la
  // primaria (la de timestamp más reciente). Se llama dos veces por tick,
  // una vez por cada tiempo adelantado (resaltado y scroll, por separado).
  function computeActive(atTime, entries) {
    let primary = null;
    const active = [];
    for (const entry of entries) {
      const { timestampSeconds } = entry.line;
      if (timestampSeconds > atTime) continue;
      if (atTime >= effectiveEnd(entry, entries)) continue;
      active.push(entry);
      if (!primary || timestampSeconds > primary.line.timestampSeconds) primary = entry;
    }
    return { active, primary };
  }

  return playerController.on("timeupdate", ({ currentTime }) => {
    const originalTime = playerController.convertBetweenVersions(
      currentTime,
      playerController.activeVersionKey,
      "original"
    );

    const entries = lyricsEditor.getRowEntries().filter((entry) => entry.line.timestampSeconds !== null);

    const { active: nextActiveEntries } = computeActive(originalTime + LYRICS_LEAD_SECONDS, entries);
    const { primary: nextPrimaryEntry } = computeActive(originalTime + SCROLL_LEAD_SECONDS, entries);

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
