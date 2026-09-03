// =============================================================
// Sistema central de portadas
// -------------------------------------------------------------
// Regla de oro:
//  - En IndexedDB SOLO se guardan Blobs o URLs http(s)/data.
//  - Las URLs "blob:" son efímeras (mueren al recargar), por lo
//    que nunca deben persistirse. Este módulo centraliza la
//    detección, saneamiento y resolución de portadas.
// =============================================================

const blobUrlCache = new WeakMap(); // Blob -> objectURL

/** ¿Es una URL de objeto efímera (muere al recargar)? */
export function isBlobUrl(cover) {
  return typeof cover === "string" && cover.startsWith("blob:");
}

/** ¿Es un dato binario guardable en IndexedDB? */
export function isBinaryCover(cover) {
  return cover instanceof Blob || cover instanceof File;
}

/** ¿Es una portada persistible tal cual (http/data URL)? */
export function isStorableUrl(cover) {
  return typeof cover === "string" && (/^https?:\/\//.test(cover) || cover.startsWith("data:"));
}

/**
 * Devuelve la versión SEGURA para guardar en IndexedDB.
 * - blob: strings -> null (inválidos tras recargar)
 * - Blob/File -> se guarda tal cual (IndexedDB los soporta)
 * - http/data -> tal cual
 */
export function sanitizeCoverForStorage(cover) {
  if (!cover) return null;
  if (isBlobUrl(cover)) return null;
  if (isBinaryCover(cover) || isStorableUrl(cover)) return cover;
  return null;
}

/**
 * Resuelve cualquier forma de portada a una URL usable en <img>.
 * - Si es Blob/File: genera o reutiliza su object URL desde caché.
 * - Si es string: lo devuelve tal cual para que el <img> lo renderice
 *   (incluyendo blob: creados en la sesión actual, http(s) o data:).
 * - Si es nulo o vacío: devuelve null.
 */
export function toDisplayUrl(cover) {
  if (!cover) return null;
  if (isBinaryCover(cover)) {
    let url = blobUrlCache.get(cover);
    if (!url) {
      url = URL.createObjectURL(cover);
      blobUrlCache.set(cover, url);
    }
    return url;
  }
  if (typeof cover === "string" && cover.trim().length > 0) {
    return cover.trim();
  }
  return null;
}

/** Libera object URLs en caché (opcional, p.ej. al vaciar biblioteca). */
export function clearCoverCache() {
  // WeakMap no es iterable; se libera solo con el GC. Reservado por simetría.
}

/**
 * Resuelve la portada de una canción asegurando que si la canción no tiene
 * portada directa pero pertenece a un álbum con portada, la obtenga de ahí.
 */
export function resolveSongCover(library, song) {
  if (!song) return null;
  if (song.cover) return toDisplayUrl(song.cover);
  if (song.albumId && Array.isArray(library?.albums)) {
    const album = library.albums.find((a) => a.id === song.albumId);
    if (album?.cover) return toDisplayUrl(album.cover);
  }
  return null;
}

/**
 * Resuelve la portada "en vivo" de una entidad de historial
 * consultando el estado actual de la biblioteca. Es la fuente de
 * verdad tras recargar: el cover persistido en historial puede ser
 * una URL muerta, pero el álbum/canción sigue existiendo.
 */
export function resolveHistoryCover(library, entry) {
  if (!entry) return null;

  let liveCover = null;
  if (entry.type === "album") {
    liveCover = library?.albums?.find(a => a.id === entry.itemId)?.cover;
  } else if (entry.type === "song") {
    const song = library?.songs?.find(s => s.id === entry.itemId);
    liveCover = song?.cover;
    if (!liveCover && song?.albumId) {
      liveCover = library?.albums?.find(a => a.id === song.albumId)?.cover;
    }
  } else if (entry.type === "playlist") {
    liveCover = library?.playlists?.find(p => p.id === entry.itemId)?.cover;
  }

  // 1. Si encontramos el recurso vivo en la sesión actual, usarlo:
  if (liveCover) {
    return toDisplayUrl(liveCover);
  }

  // 2. Si el registro guardado contiene una URL blob: huérfana de una sesión
  // anterior, NO la devolvemos para evitar net::ERR_FILE_NOT_FOUND en consola.
  if (isBlobUrl(entry.cover)) {
    return null;
  }

  // 3. Si era una URL externa http o data: válida, devolverla:
  return toDisplayUrl(entry.cover);
}

/**
 * Reduce y comprime una imagen local a un Blob JPEG para almacenamiento eficiente en IndexedDB.
 */
export function downscaleImage(file, maxSize = 640) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('Archivo no es una imagen válida'));
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        URL.revokeObjectURL(url);
        blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen'));
      }, 'image/jpeg', 0.88);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Error al cargar la imagen'));
    };
    img.src = url;
  });
}
