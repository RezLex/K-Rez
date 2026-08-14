export function attachLyricsPlayback(playerController, lyricsEditor, { scrollIntoView = true } = {}) {
  let activeRow = null;

  return playerController.on("timeupdate", ({ currentTime }) => {
    const originalTime = playerController.convertBetweenVersions(
      currentTime,
      playerController.activeVersionKey,
      "original"
    );

    let nextActiveEntry = null;
    for (const entry of lyricsEditor.getRowEntries()) {
      if (entry.line.timestampSeconds === null) continue;
      if (entry.line.timestampSeconds > originalTime) continue;
      if (!nextActiveEntry || entry.line.timestampSeconds > nextActiveEntry.line.timestampSeconds) {
        nextActiveEntry = entry;
      }
    }

    const nextActiveRow = nextActiveEntry?.row ?? null;
    if (nextActiveRow === activeRow) return;

    activeRow?.classList.remove("active");
    activeRow = nextActiveRow;
    activeRow?.classList.add("active");
    if (scrollIntoView) activeRow?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
}
