export function formatTime(seconds, empty = "0:00") {
  if (!seconds || Number.isNaN(seconds)) return empty;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}

export function formatDuration(seconds) {return formatTime(seconds, "");}

export function formatTimeOfDay(timestamp, empty = "--:--") {
  if (!timestamp) return empty;
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

export function navigateToArtist(router, name, { library, closeOverlays = false, onClose } = {}) {
  if (!name || name === "Unknown" || name === "Artista desconocido") return;
  onClose?.();
  if (closeOverlays && library) {library.closeNowPlaying(); library.closeQueue();}
  router.push({ name: "artist", params: { name: encodeURIComponent(name.trim()) } });
}

export function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function scrollCarouselContainer(container, direction) {
  if (!container) return;
  container.scrollBy({left: Math.max(container.clientWidth * 0.8, 300) * direction, behavior: "smooth"});
}

export function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function playHistoryEntry(item, { library, router, isMobile, passReleaseId = false } = {}) {
  if (!item) return;
  if (item.type === "song") {
    const song = library.songs.find((s) => s.id === item.itemId);
    if (song) {
      passReleaseId ? library.playSong(song, false, { releaseId: item.releaseId }) : library.playSong(song);
      const mobile = isMobile !== undefined ? isMobile : (typeof window !== "undefined" && window.innerWidth <= 760);
      if (mobile) library.openNowPlaying();
    }
  } else if (item.type === "album" || item.type === "release") {
    router.push({ name: "album", params: { id: item.itemId } });
  } else if (item.type === "playlist") {
    router.push({ name: "playlist", params: { playlistId: item.itemId } });
  }
}
