const RELEASE_TYPES = new Set([
  "album",
  "single",
  "ep",
  "compilation",
  "soundtrack",
  "live",
  "mixtape",
  "other",
  "unknown",
]);

const GENERIC_GENRES = new Set([
  "music", "musica", "música", "audio", "sound", "unknown", "other",
  "misc", "general", "various", "n/a", "n a",
]);

function clean(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

export function normalizeComparable(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[()[\]{}]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeIsrc(value) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizeReleaseTitle(value) {
  return clean(value)
    .replace(/\s*(?:[-–—]\s*)?(?:\((?:single|ep)\)|[-–—]\s*(?:single|ep))\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function createStableFileId(file) {
  if (!file) return crypto.randomUUID();

  const parts = [];

  const directPath =
    typeof file.webkitRelativePath === "string" && file.webkitRelativePath.trim()
      ? file.webkitRelativePath
      : typeof file.relativePath === "string" && file.relativePath.trim()
        ? file.relativePath
        : typeof file.path === "string" && file.path.trim()
          ? file.path
          : typeof file.fullPath === "string" && file.fullPath.trim()
            ? file.fullPath
            : "";

  const rawName = clean(file.name || file.filename);
  if (directPath) parts.push(normalizeComparable(directPath));
  if (rawName) parts.push(normalizeComparable(rawName));

  if (parts.length) {
    return parts.join("::");
  }

  return `file:${crypto.randomUUID()}`;
}

export function parseArtistString(value) {
  if (Array.isArray(value)) return value.flatMap(parseArtistString);
  const text = clean(value);
  if (!text) return [];

  // Ampersand is deliberately preserved: Andy & Lucas is one artist.
  return text
    .split(/\s*,\s*/)
    .flatMap((part) => part.split(/\s+(?:feat\.?|ft\.?|featuring|con)\s+/i))
    .map((part) => part.trim())
    .filter(Boolean);
}

export function normalizeArtistCredits(credits, fallback) {
  if (Array.isArray(credits) && credits.length) {
    return credits
      .filter(Boolean)
      .map((credit) => {
        if (typeof credit === "string") return { name: credit.trim(), role: "main" };
        const artist = (credit && typeof credit === "object" ? credit.artist : null) || {};
        return {
          id: clean(credit.id || credit.artistId || artist.id),
          name: clean(credit.name || artist.name),
          role: clean(credit.role) || "main",
          joinphrase: clean(credit.joinphrase),
          artistId: clean(credit.artistId || artist.id),
          source: clean(credit.source || artist.source),
          musicBrainzId: clean(credit.musicBrainzId || artist.musicBrainzId || artist.id),
        };
      })
      .filter((credit) => credit.name);
  }

  const names = parseArtistString(fallback);
  return names.map((name, index) => ({
    name,
    role: index === 0 ? "main" : "featured",
  }));
}

function artistEntityKey(entity) {
  return normalizeComparable(entity?.id || entity?.musicBrainzId || entity?.name || entity);
}

export function resolveArtistEntities(value, evidence = {}) {
  const raw = Array.isArray(value) ? value : [value];
  const structured = evidence.artistCredits || evidence.artists || raw;
  const credits = normalizeArtistCredits(structured, "");

  if (credits.length && (evidence.artistCredits || evidence.artists || raw.some((item) => typeof item !== "string") || raw.length > 1)) {
    return credits;
  }

  const text = clean(raw.find((item) => typeof item === "string") || evidence.artist || value);
  if (!text) return [];

  const wholeEntity = evidence.artistEntity &&
    normalizeComparable(evidence.artistEntity.name) === normalizeComparable(text)
    ? evidence.artistEntity
    : null;
  if (wholeEntity) return normalizeArtistCredits([wholeEntity], "");

  const separators = /\s+(?:feat\.?|ft\.?|featuring|and|y)\s+|\s*&\s*/i;
  const parts = text.split(separators).map((part) => part.trim()).filter(Boolean);
  const validated = Array.isArray(evidence.artistEntities)
    ? evidence.artistEntities
      .filter((entity) => parts.some((part) => normalizeComparable(part) === normalizeComparable(entity?.name)))
    : [];

  if (parts.length > 1 && validated.length === parts.length) {
    return normalizeArtistCredits(validated, "");
  }

  return [{ name: text, role: "main", joinphrase: "" }];
}

export function artistEntityName(value) {
  return clean(typeof value === "string" ? value : value?.name);
}

export function artistEntityId(value) {
  return clean(typeof value === "string" ? "" : value?.id || value?.artistId || value?.musicBrainzId);
}

export function mergeArtists(...sources) {
  const result = [];
  const seen = new Set();
  for (const source of sources) {
    for (const entity of (Array.isArray(source) ? source : [source])) {
      const name = artistEntityName(entity);
      const key = artistEntityId(entity) || normalizeComparable(name);
      if (key && !seen.has(key)) {
        seen.add(key);
        result.push(name);
      }
    }
  }
  return result;
}

export function artistsEquivalent(left, right) {
  const a = mergeArtists(left).map(normalizeComparable).sort();
  const b = mergeArtists(right).map(normalizeComparable).sort();
  return a.length > 0 && a.length === b.length && a.every((name, index) => name === b[index]);
}

export function artistsToDisplayString(artists) {
  return resolveArtistEntities(artists).map(artistEntityName).join(", ");
}

export function cleanGenres(values) {
  const list = Array.isArray(values) ? values : [values];
  const seen = new Set();
  return list
    .map(clean)
    .filter((genre) => {
      const key = normalizeComparable(genre);
      if (!key || GENERIC_GENRES.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function resolveReleaseType({ primaryType, secondaryTypes, collectionType, title } = {}) {
  const primary = normalizeComparable(primaryType);
  const secondary = (secondaryTypes || []).map(normalizeComparable);
  const collection = normalizeComparable(collectionType);
  const titleKey = normalizeComparable(title);

  if (primary === "album") return secondary.includes("live") ? "live" : "album";
  if (primary === "single") return "single";
  if (primary === "ep") return "ep";
  if (secondary.includes("compilation")) return "compilation";
  if (secondary.includes("soundtrack")) return "soundtrack";
  if (secondary.includes("mixtape") || secondary.includes("dj mix")) return "mixtape";
  if (collection === "album") return "album";
  if (collection === "single" || /\b(single|ep)\b/.test(titleKey)) {
    return titleKey.includes(" ep") || titleKey.endsWith(" ep") ? "ep" : "single";
  }
  return RELEASE_TYPES.has(primary) ? primary : "unknown";
}

export function createRecording(input = {}) {
  const artistCredits = resolveArtistEntities(input.artists || input.artistCredits || input.artist, {
    artist: input.artist,
    artistEntity: input.artistEntity,
    artistEntities: input.artistEntities,
    artists: input.artists,
    artistCredits: input.artistCredits,
  });
  const artists = artistCredits.map((credit) => ({ ...credit }));
  return {
    id: input.id || input.fileId || input.path || crypto.randomUUID(),
    fileId: clean(input.fileId || input.id),
    path: clean(input.path),
    filename: clean(input.filename),
    title: clean(input.title),
    artists,
    artistCredits,
    artist: (input.artistCredits || input.artists || input.artistEntity || input.artistEntities)
      ? artistsToDisplayString(artistCredits)
      : clean(input.artist) || artistsToDisplayString(artistCredits),
    // Song metadata is deliberately self-contained. `album` is only text;
    // it never identifies a mutable collection or artwork owner.
    album: clean(input.album),
    albumArtist: clean(input.albumArtist),
    year: Number(input.year) || null,
    track: Number(input.track) || null,
    trackTotal: Number(input.trackTotal) || null,
    disk: Number(input.disk) || null,
    diskTotal: Number(input.diskTotal) || null,
    duration: Number(input.duration) || 0,
    metadata: input.metadata || {},
    releaseIds: [...new Set(input.releaseIds || [])],
    primaryReleaseId: input.primaryReleaseId || null,
    releaseGroupIds: [...new Set(input.releaseGroupIds || [])],
    genres: cleanGenres(input.genres || input.genre),
    genre: cleanGenres(input.genres || input.genre),
    isrc: normalizeIsrc(input.isrc),
    musicBrainzRecordingId: clean(input.musicBrainzRecordingId),
    acoustid: clean(input.acoustid),
    localMetadata: input.localMetadata || {},
    identification: input.identification || {},
    identifiedMetadata: input.identifiedMetadata || null,
    cover: input.cover || null,
  };
}

function normalizeReleaseArtistEntities(values) {
  const result = [];
  const seen = new Set();

  for (const value of values || []) {
    const entity = typeof value === "string"
      ? { name: value }
      : value || {};
    const name = clean(entity.name || entity.artist?.name);
    const id = clean(
      entity.id || entity.artistId || entity.musicBrainzId || entity.artist?.id,
    );
    const key = id ? `id:${id}` : `name:${normalizeComparable(name)}`;
    if (!name || seen.has(key)) continue;
    seen.add(key);
    result.push({
      id,
      name,
      role: clean(entity.role) || "main",
      joinphrase: clean(entity.joinphrase),
    });
  }

  return result;
}

export function createRelease(input = {}) {
  const explicitPrimaryArtists = normalizeReleaseArtistEntities(
    input.primaryArtists || input.artistCredits || input.releaseArtistCredits,
  );
  const primaryArtists = explicitPrimaryArtists.length
    ? explicitPrimaryArtists
    : normalizeReleaseArtistEntities(input.artists || input.artist || input.albumArtist);
  const artists = primaryArtists.map((artist) => artist.name);
  const involvedArtists = normalizeReleaseArtistEntities(input.involvedArtists);
  const originalTitle = clean(input.originalTitle || input.title || input.name);
  const type = resolveReleaseType({ ...input, title: originalTitle });
  const rawArtworks = Array.isArray(input.artworks)
    ? input.artworks
    : Array.isArray(input.artwork)
      ? input.artwork
      : Array.isArray(input.coverAlternatives)
        ? input.coverAlternatives
        : [];
  const artworks = rawArtworks
    .map((art) => (typeof art === 'string' ? { url: art, source: input.source || 'release' } : { ...art }))
    .filter((art) => Boolean(art?.url));
  const coverVal = input.cover || null;
  const coverUrlVal = clean(input.coverUrl || (typeof coverVal === 'string' && !coverVal.startsWith('blob:') ? coverVal : ''));
  if (coverVal && !artworks.some((art) => art.url === coverVal)) {
    artworks.unshift({ url: coverVal, source: input.source || 'release' });
  }
  if (coverUrlVal && !artworks.some((art) => art.url === coverUrlVal)) {
    artworks.push({ url: coverUrlVal, source: input.source || 'release' });
  }

  return {
    id: input.id || input.musicBrainzReleaseId || `release_${crypto.randomUUID()}`,
    title: normalizeReleaseTitle(input.title || input.name),
    originalTitle,
    type,
    releaseGroupId: clean(input.releaseGroupId || input.musicBrainzReleaseGroupId),
    primaryArtists,
    involvedArtists,
    artists,
    artist: clean(input.artist) || artistsToDisplayString(artists),
    albumArtist: clean(input.albumArtist),
    releaseDate: clean(input.releaseDate),
    year: clean(input.year || input.releaseDate).match(/\b(?:19|20)\d{2}\b/)?.[0] || "",
    country: clean(input.country),
    label: clean(input.label),
    catalogNumber: clean(input.catalogNumber),
    barcode: clean(input.barcode),
    trackCount: Number(input.trackCount) || 0,
    discCount: Number(input.discCount) || 0,
    trackNumber: Number(input.trackNumber) || 0,
    trackTotal: Number(input.trackTotal || input.trackCount) || 0,
    discNumber: Number(input.discNumber) || 0,
    discTotal: Number(input.discTotal || input.discCount) || 0,
    cover: coverVal,
    coverUrl: coverUrlVal,
    coverProvenance: input.coverProvenance || null,
    artworks,
    coverAlternatives: artworks.map((a) => ({ ...a })),
    musicBrainzReleaseId: clean(input.musicBrainzReleaseId || input.id),
    musicBrainzReleaseGroupId: clean(input.musicBrainzReleaseGroupId || input.releaseGroupId),
    tracks: [...new Set(input.tracks || [])],
    editions: input.editions || [],
    isPrimary: Boolean(input.isPrimary),
    source: clean(input.source),
    metadataSources: input.metadataSources || {},
  };
}

export function setReleaseCover(release = {}, newCoverUrl, source = 'manual') {
  const currentArtworks = Array.isArray(release.artworks)
    ? release.artworks.map((a) => ({ ...a }))
    : Array.isArray(release.coverAlternatives)
      ? release.coverAlternatives.map((a) => ({ ...a }))
      : [];
  const prevCover = release.cover || release.coverUrl;
  if (prevCover && !currentArtworks.some((a) => a.url === prevCover)) {
    currentArtworks.push({ url: prevCover, source: release.source || 'release' });
  }
  if (newCoverUrl && !currentArtworks.some((a) => a.url === newCoverUrl)) {
    currentArtworks.push({ url: newCoverUrl, source });
  }
  return {
    ...release,
    cover: newCoverUrl,
    coverUrl: newCoverUrl,
    artworks: currentArtworks,
    coverAlternatives: currentArtworks.map((a) => ({ ...a })),
  };
}

export function createReleaseGroup(input = {}) {
  const artists = mergeArtists(input.artists, input.artist);
  const primaryType = RELEASE_TYPES.has(input.primaryType) && input.primaryType !== "unknown"
    ? input.primaryType
    : "other";
  return {
    id: input.id || input.musicBrainzReleaseGroupId || `release-group_${crypto.randomUUID()}`,
    title: clean(input.title),
    primaryType,
    secondaryTypes: [...new Set(input.secondaryTypes || [])],
    artists,
    artist: clean(input.artist) || artistsToDisplayString(artists),
    firstReleaseDate: clean(input.firstReleaseDate),
    musicBrainzReleaseGroupId: clean(input.musicBrainzReleaseGroupId || input.id),
    cover: input.cover || null,
    releases: [...new Set(input.releases || [])],
  };
}

export function createReleaseTrack(input = {}) {
  return {
    id: input.id || `${input.releaseId}:${input.recordingId}:${input.discNumber || 1}:${input.trackNumber || 0}`,
    recordingId: clean(input.recordingId),
    releaseId: clean(input.releaseId),
    discNumber: Number(input.discNumber) || 1,
    trackNumber: Number(input.trackNumber) || 0,
    trackTotal: Number(input.trackTotal) || 0,
    title: clean(input.title),
    duration: Number(input.duration) || 0,
  };
}

export { RELEASE_TYPES };
