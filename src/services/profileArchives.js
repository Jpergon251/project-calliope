import { reactive } from "vue";
import { Capacitor } from "@capacitor/core";
import FolderPicker from "../plugins/folderPicker.js";
import { DEFAULT_PREFERENCES } from "../lib/profilePreferences.js";
import { validateUsername } from "../lib/profileIdentity.js";

export const PROFILE_ARCHIVE_FORMAT = "calliope-profile";
export const PROFILE_ARCHIVE_VERSION = 3;
export const MAX_PROFILE_ARCHIVE_BYTES = 25 * 1024 * 1024;
const MAX_RECORDS = 100_000;
const SENSITIVE_KEYS = /(credential|password|token|secret|api.?key|authorization|cookie|avatarblob|bannerblob|directoryhandle|filehandle|nativeuri|filepath|^path$|^uri$)/i;
const syncPromises = new Map();
const syncRevisions = new Map();

export const profileSyncStatuses = reactive({});

async function openProfileDb() {
  return (await import("../lib/db.js")).dbPromise;
}

function isBinary(value) {
  return value instanceof Blob
    || (typeof File !== "undefined" && value instanceof File)
    || value instanceof ArrayBuffer
    || ArrayBuffer.isView(value);
}

function cleanJsonValue(value, seen = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    if (typeof value === "string" && value.startsWith("blob:")) return null;
    if (typeof value === "string" && value.startsWith("data:")) return null;
    return value;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  if (typeof value !== "object" || isBinary(value) || seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    const result = value.map((item) => cleanJsonValue(item, seen));
    seen.delete(value);
    return result;
  }

  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "__proto__" || SENSITIVE_KEYS.test(key)) continue;
    if (key === "favorite") continue;
    result[key] = cleanJsonValue(child, seen);
  }
  seen.delete(value);
  return result;
}

function archivePreferences(preferences = {}) {
  const result = {};
  for (const [key, defaultValue] of Object.entries(DEFAULT_PREFERENCES)) {
    const value = preferences[key];
    if (typeof value !== typeof defaultValue) continue;
    if (key === "volume" && (!Number.isFinite(value) || value < 0 || value > 1)) continue;
    result[key] = value;
  }
  return result;
}

function assertSafeJsonTree(value, depth = 0, budget = { nodes: 0 }) {
  budget.nodes += 1;
  if (budget.nodes > 250_000 || depth > 40) {
    throw new Error("El archivo de perfil tiene una estructura demasiado profunda o extensa.");
  }
  if (typeof value === "string" && value.length > MAX_PROFILE_ARCHIVE_BYTES) {
    throw new Error("El archivo de perfil contiene un campo de texto demasiado grande.");
  }
  if (Array.isArray(value)) {
    for (const child of value) assertSafeJsonTree(child, depth + 1, budget);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "__proto__" || key.length > 256) {
        throw new Error("El archivo de perfil contiene una clave no permitida.");
      }
      assertSafeJsonTree(child, depth + 1, budget);
    }
  }
}

export function normalizeProfileDirectoryName(name, profileId, occupiedNames = []) {
  const normalized = String(name || "")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 64);
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(normalized);
  const base = !normalized || normalized === "." || normalized === ".." || reserved
    ? `Perfil-${String(profileId || "local").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "local"}`
    : normalized;
  const occupied = new Set(occupiedNames.map((value) => String(value).normalize("NFKC").toLocaleLowerCase()));
  if (!occupied.has(base.toLocaleLowerCase())) return base;
  const suffix = String(profileId || "local").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "local";
  const candidate = `${base.slice(0, 54)}-${suffix}`;
  if (!occupied.has(candidate.toLocaleLowerCase())) return candidate;
  let index = 2;
  while (occupied.has(`${candidate.slice(0, 60)}-${index}`.toLocaleLowerCase())) index += 1;
  return `${candidate.slice(0, 60)}-${index}`;
}

function archivePlaylist(playlist, order) {
  return {
    id: String(playlist.id),
    name: String(playlist.name || ""),
    songIds: Array.isArray(playlist.songIds)
      ? playlist.songIds.filter((id) => typeof id === "string" && id).map(profileSongReferenceId)
      : [],
    order,
  };
}

function archiveHistoryRecord(item) {
  return {
    id: typeof item.id === "string" ? item.id : "",
    type: String(item.type || "song"),
    itemId: item.type === "song"
      ? profileSongReferenceId(item.itemId)
      : item.type === "album"
        ? profileAlbumReferenceId(item.itemId)
        : String(item.itemId || ""),
    timestamp: Number(item.timestamp) || 0,
    playCount: Math.max(1, Number(item.playCount) || 1),
  };
}

function archiveRating(item) {
  return {
    songId: profileSongReferenceId(item.songId),
    rating: item.rating,
    updatedAt: Number(item.updatedAt) || 0,
  };
}

function archiveQueue(queue) {
  if (!queue || typeof queue !== "object" || Array.isArray(queue)) return null;
  return {
    savedAt: Number(queue.savedAt) || 0,
    playingSongId: typeof queue.playingSongId === "string" ? profileSongReferenceId(queue.playingSongId) : null,
    queueIds: Array.isArray(queue.queueIds) ? queue.queueIds.filter((id) => typeof id === "string" && id).map(profileSongReferenceId) : [],
    historyIds: Array.isArray(queue.historyIds) ? queue.historyIds.filter((id) => typeof id === "string" && id).map(profileSongReferenceId) : [],
    activeQueueHistoryIds: Array.isArray(queue.activeQueueHistoryIds)
      ? queue.activeQueueHistoryIds.filter((id) => typeof id === "string" && id).map(profileSongReferenceId)
      : [],
    isShuffleEnabled: Boolean(queue.isShuffleEnabled),
    originalQueueIds: Array.isArray(queue.originalQueueIds)
      ? queue.originalQueueIds.filter((id) => typeof id === "string" && id).map(profileSongReferenceId)
      : [],
    autoplay: Boolean(queue.autoplay),
    repeatMode: ["off", "all", "one"].includes(queue.repeatMode) ? queue.repeatMode : "off",
  };
}

function archiveStatsSummary(summary) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return null;
  const songStats = {};
  for (const [sourceSongId, stat] of Object.entries(summary.songStats || {})) {
    const songId = profileSongReferenceId(sourceSongId);
    if (typeof songId !== "string" || !stat || typeof stat !== "object") continue;
    songStats[songId] = {
      playCount: Number(stat.playCount) || 0,
      totalListenTime: Number(stat.totalListenTime) || 0,
      firstPlayedAt: Number(stat.firstPlayedAt) || 0,
      lastPlayedAt: Number(stat.lastPlayedAt) || 0,
    };
  }
  const artistStats = {};
  for (const [artistName, stat] of Object.entries(summary.artistStats || {})) {
    if (!stat || typeof stat !== "object") continue;
    const key = /^artist-stat-[a-f0-9]{8}$/.test(artistName)
      ? artistName
      : profileMetricArtistId(artistName);
    const existing = artistStats[key] || { playCount: 0, totalListenTime: 0, lastPlayedAt: 0 };
    existing.playCount += Number(stat.playCount) || 0;
    existing.totalListenTime += Number(stat.totalListenTime) || 0;
    existing.lastPlayedAt = Math.max(existing.lastPlayedAt, Number(stat.lastPlayedAt) || 0);
    artistStats[key] = existing;
  }
  const albumStats = {};
  for (const [albumKey, stat] of Object.entries(summary.albumStats || {})) {
    if (!stat || typeof stat !== "object") continue;
    const key = /^album-stat-[a-f0-9]{8}$/.test(albumKey)
      ? albumKey
      : profileMetricAlbumId(albumKey);
    const existing = albumStats[key] || { playCount: 0, totalListenTime: 0, lastPlayedAt: 0 };
    existing.playCount += Number(stat.playCount) || 0;
    existing.totalListenTime += Number(stat.totalListenTime) || 0;
    existing.lastPlayedAt = Math.max(existing.lastPlayedAt, Number(stat.lastPlayedAt) || 0);
    albumStats[key] = existing;
  }
  const dayStats = {};
  for (const [date, stat] of Object.entries(summary.dayStats || {})) {
    if (!stat || typeof stat !== "object") continue;
    dayStats[date] = {
      date: String(stat.date || date),
      plays: Number(stat.plays) || 0,
      listenTime: Number(stat.listenTime) || 0,
    };
  }
  return {
    totalPlays: Number(summary.totalPlays) || 0,
    totalListenTime: Number(summary.totalListenTime) || 0,
    songStats,
    artistStats,
    albumStats,
    dayStats,
  };
}

function hashProfileMetricKey(value) {
  const normalized = String(value || "").normalize("NFKC").toLocaleLowerCase().trim();
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function hashOpaqueValue(value) {
  let hash = 0xcbf29ce484222325n;
  const source = String(value || "");
  for (let index = 0; index < source.length; index += 1) {
    hash ^= BigInt(source.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function profileMetricArtistId(name) {
  return `artist-stat-${hashProfileMetricKey(name)}`;
}

export function profileMetricAlbumId(id) {
  return `album-stat-${hashProfileMetricKey(id)}`;
}

export function profileSongReferenceId(id) {
  const value = String(id || "");
  if (!value) return "";
  return /^song-ref-[a-f0-9]{16}$/.test(value)
    ? value
    : `song-ref-${hashOpaqueValue(value)}`;
}

function profileAlbumReferenceId(id) {
  const value = String(id || "");
  if (!value) return "";
  return /^album-ref-[a-f0-9]{16}$/.test(value)
    ? value
    : `album-ref-${hashOpaqueValue(value)}`;
}

function isPortableSongReference(id) {
  return typeof id === "string" && /^song-ref-[a-f0-9]{16}$/.test(id);
}

function isPortableAlbumReference(id) {
  return typeof id === "string" && /^album-ref-[a-f0-9]{16}$/.test(id);
}

function archiveHasPortableReferences(archive) {
  return collectProfileSongReferences(archive).some(isPortableSongReference)
    || (archive.history || []).some((item) =>
      item.type === "album" && isPortableAlbumReference(item.itemId),
    );
}

function validateStatsSummary(summary) {
  if (summary === null) return;
  for (const key of ["songStats", "artistStats", "albumStats", "dayStats"]) {
    const section = summary[key];
    if (section !== undefined && (!section || typeof section !== "object" || Array.isArray(section))) {
      throw new Error(`La sección «${key}» de las estadísticas no es válida.`);
    }
  }
  for (const key of ["totalPlays", "totalListenTime"]) {
    if (summary[key] !== undefined && (!Number.isFinite(summary[key]) || summary[key] < 0)) {
      throw new Error("Los totales de las estadísticas no son válidos.");
    }
  }
  for (const sectionKey of ["songStats", "artistStats", "albumStats", "dayStats"]) {
    for (const stat of Object.values(summary[sectionKey] || {})) {
      if (!stat || typeof stat !== "object" || Array.isArray(stat)) {
        throw new Error("Hay un agregado estadístico no válido.");
      }
      for (const key of ["playCount", "totalListenTime", "firstPlayedAt", "lastPlayedAt", "plays", "listenTime"]) {
        if (stat[key] !== undefined && (!Number.isFinite(stat[key]) || stat[key] < 0)) {
          throw new Error("Hay un contador o fecha estadística no válida.");
        }
      }
    }
  }
}

function archivePlaybackEvent(item) {
  return {
    id: typeof item.id === "string" ? item.id : "",
    songId: profileSongReferenceId(item.songId),
    listenTime: Number(item.listenTime) || 0,
    timestamp: Number(item.timestamp) || 0,
    dateStr: typeof item.dateStr === "string" ? item.dateStr : "",
  };
}

export function buildProfileArchive({ profile, playlists, history, stats, ratings, queue }) {
  if (!profile?.id || !profile?.name) {
    throw new Error("El perfil no tiene una identidad válida para exportar.");
  }

  const cleanProfile = {
    id: String(profile.id),
    name: String(profile.displayName || profile.name),
    createdAt: Number(profile.createdAt) || Date.now(),
    updatedAt: Number(profile.updatedAt) || Date.now(),
    preferences: archivePreferences(profile.preferences || {}),
    username: typeof profile.username === "string"
      ? (validateUsername(profile.username).valid ? validateUsername(profile.username).username : "")
      : "",
    bio: typeof profile.bio === "string" ? profile.bio : "",
  };
  const cleanPlaylists = (playlists || []).map((item, index) => archivePlaylist(item, index));
  const cleanHistory = (history || []).map(archiveHistoryRecord);
  const cleanStats = {
    summary: archiveStatsSummary(stats?.summary),
    events: (stats?.events || []).map(archivePlaybackEvent),
  };
  const cleanRatings = (ratings || []).map(archiveRating);

  return {
    format: PROFILE_ARCHIVE_FORMAT,
    formatVersion: PROFILE_ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    profile: cleanProfile,
    playlists: cleanPlaylists,
    metrics: {
      summary: cleanStats.summary,
      events: cleanStats.events,
    },
    history: cleanHistory,
    ratings: cleanRatings,
    queue: archiveQueue(queue),
  };
}

function assertRecordArray(value, label) {
  if (!Array.isArray(value) || value.length > MAX_RECORDS) {
    throw new Error(`El archivo de perfil contiene una sección ${label} no válida o demasiado grande.`);
  }
}

export function validateProfileArchive(input) {
  assertSafeJsonTree(input);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("El archivo no contiene un perfil JSON válido.");
  }
  if (input.format !== PROFILE_ARCHIVE_FORMAT) {
    throw new Error("El archivo no es una exportación de perfil de Calliope.");
  }
  if (!Number.isInteger(input.formatVersion) || input.formatVersion > PROFILE_ARCHIVE_VERSION) {
    throw new Error(`La versión ${input.formatVersion} del perfil no es compatible con esta versión de Calliope.`);
  }
  if (input.formatVersion < 1) {
    throw new Error("La versión del perfil no es válida.");
  }

  const archive = input.formatVersion === 1
    ? migrateProfileArchiveV1(input)
    : input.formatVersion === 2
      ? migrateProfileArchiveV2(input)
      : input;
  const username = archive.profile?.username;
  if (
    username !== undefined
    && username !== ""
    && (typeof username !== "string" || !validateUsername(username).valid)
  ) {
    throw new Error("El nombre de usuario del perfil no es válido.");
  }
  if (
    !archive.profile
    || typeof archive.profile.id !== "string"
    || !archive.profile.id
    || typeof archive.profile.name !== "string"
    || !archive.profile.name.trim()
    || archive.profile.name.length > 80
    || archive.profile.id.length > 128
    || (archive.profile.username !== undefined
      && (typeof archive.profile.username !== "string" || archive.profile.username.length > 30))
    || (archive.profile.bio !== undefined
      && (typeof archive.profile.bio !== "string" || archive.profile.bio.length > 240))
    || !Number.isFinite(archive.profile.createdAt)
    || !Number.isFinite(archive.profile.updatedAt)
    || !archive.profile.preferences
    || typeof archive.profile.preferences !== "object"
    || Array.isArray(archive.profile.preferences)
  ) {
    throw new Error("Faltan datos obligatorios o tienen tipos incorrectos.");
  }
  for (const [key, value] of Object.entries(archive.profile.preferences)) {
    const defaultValue = DEFAULT_PREFERENCES[key];
    if (
      defaultValue === undefined
      || typeof value !== typeof defaultValue
      || (key === "volume" && (!Number.isFinite(value) || value < 0 || value > 1))
    ) {
      throw new Error(`La preferencia «${key}» no es compatible o tiene un tipo incorrecto.`);
    }
  }

  assertRecordArray(archive.playlists, "listas");
  assertRecordArray(archive.history, "historial");
  assertRecordArray(archive.ratings, "valoraciones");
  assertRecordArray(archive.metrics?.events, "métricas");
  if (archive.metrics?.summary !== null && (typeof archive.metrics?.summary !== "object" || Array.isArray(archive.metrics.summary))) {
    throw new Error("El resumen de métricas no es válido.");
  }
  validateStatsSummary(archive.metrics.summary);

  for (const playlist of archive.playlists) {
    if (
      !playlist
      || typeof playlist.id !== "string"
      || !playlist.id
      || typeof playlist.name !== "string"
      || !Array.isArray(playlist.songIds)
      || playlist.songIds.some((id) => typeof id !== "string" || !id)
      || !Number.isInteger(playlist.order)
    ) {
      throw new Error("Hay una lista de reproducción no válida.");
    }
  }
  for (const record of archive.history) {
    if (
      !record
      || typeof record.type !== "string"
      || !record.type
      || typeof record.itemId !== "string"
      || !record.itemId
      || !Number.isFinite(record.timestamp)
      || !Number.isFinite(record.playCount)
    ) {
      throw new Error("Hay un registro de historial no válido.");
    }
  }
  for (const rating of archive.ratings) {
    if (!rating || typeof rating.songId !== "string" || !rating.songId || !["like", "dislike", "neutral"].includes(rating.rating)) {
      throw new Error("Hay una valoración musical no válida.");
    }
  }
  for (const event of archive.metrics.events) {
    if (
      !event
      || typeof event.songId !== "string"
      || !event.songId
      || !Number.isFinite(event.listenTime)
      || !Number.isFinite(event.timestamp)
    ) {
      throw new Error("Hay un evento de reproducción no válido.");
    }
  }
  if (
    archive.queue !== undefined
    && archive.queue !== null
    && (
      typeof archive.queue !== "object"
      || Array.isArray(archive.queue)
      || ["queueIds", "historyIds", "activeQueueHistoryIds", "originalQueueIds"].some((key) =>
        archive.queue[key] !== undefined
        && (!Array.isArray(archive.queue[key]) || archive.queue[key].some((id) => typeof id !== "string" || !id)),
      )
      || (archive.queue.repeatMode !== undefined && !["off", "all", "one"].includes(archive.queue.repeatMode))
    )
  ) {
    throw new Error("El estado de la cola de reproducción no es válido.");
  }

  const canonicalArchive = buildProfileArchive({
    profile: archive.profile,
    playlists: [...archive.playlists].sort((a, b) => a.order - b.order),
    history: archive.history,
    stats: archive.metrics,
    ratings: archive.ratings,
    queue: archive.queue,
  });
  return { archive: canonicalArchive, songIds: collectProfileSongReferences(canonicalArchive) };
}

export function collectProfileSongReferences(archive) {
  const ids = new Set();
  for (const playlist of archive.playlists || []) {
    for (const id of playlist.songIds || []) if (typeof id === "string" && id) ids.add(id);
  }
  for (const item of archive.history || []) {
    if (item.type === "song" && item.itemId) ids.add(item.itemId);
  }
  for (const rating of archive.ratings || []) if (rating.songId) ids.add(rating.songId);
  for (const event of archive.metrics?.events || []) if (event.songId) ids.add(event.songId);
  for (const id of Object.keys(archive.metrics?.summary?.songStats || {})) ids.add(id);
  const queue = archive.queue;
  if (queue) {
    if (queue.playingSongId) ids.add(queue.playingSongId);
    for (const key of ["queueIds", "historyIds", "activeQueueHistoryIds", "originalQueueIds"]) {
      for (const id of queue[key] || []) ids.add(id);
    }
  }
  return ids;
}

export function resolveProfileSongReferences(archive, currentSongs = [], currentAlbums = []) {
  const songIdMap = new Map(
    currentSongs
      .filter((song) => typeof song?.id === "string" && song.id)
      .map((song) => [profileSongReferenceId(song.id), song.id]),
  );
  const albumIdMap = new Map(
    currentAlbums.filter((album) => typeof album?.id === "string" && album.id)
      .map((album) => [profileAlbumReferenceId(album.id), album.id]) || [],
  );
  const songIds = collectProfileSongReferences(archive);
  const resolvedCount = [...songIds].filter((id) => songIdMap.has(id)).length;
  const resolveSongId = (id) => songIdMap.get(id) || id;
  const resolveAlbumId = (id) => albumIdMap.get(id) || id;
  const resolvedArchive = {
    ...archive,
    playlists: archive.playlists.map((playlist) => ({
      ...playlist,
      songIds: playlist.songIds.map(resolveSongId),
    })),
    history: archive.history.map((item) => ({
      ...item,
      itemId: item.type === "song"
        ? resolveSongId(item.itemId)
        : item.type === "album"
          ? resolveAlbumId(item.itemId)
          : item.itemId,
    })),
    ratings: archive.ratings.map((rating) => ({ ...rating, songId: resolveSongId(rating.songId) })),
    metrics: {
      ...archive.metrics,
      events: archive.metrics.events.map((event) => ({ ...event, songId: resolveSongId(event.songId) })),
      summary: archive.metrics.summary
        ? {
            ...archive.metrics.summary,
            songStats: Object.fromEntries(
              Object.entries(archive.metrics.summary.songStats || {})
                .map(([id, stat]) => [resolveSongId(id), stat]),
            ),
          }
        : null,
    },
    queue: archive.queue
      ? {
          ...archive.queue,
          playingSongId: archive.queue.playingSongId
            ? resolveSongId(archive.queue.playingSongId)
            : null,
          queueIds: (archive.queue.queueIds || []).map(resolveSongId),
          historyIds: (archive.queue.historyIds || []).map(resolveSongId),
          activeQueueHistoryIds: (archive.queue.activeQueueHistoryIds || []).map(resolveSongId),
          originalQueueIds: (archive.queue.originalQueueIds || []).map(resolveSongId),
        }
      : null,
  };
  return {
    archive: resolvedArchive,
    resolvedCount,
    unresolvedCount: songIds.size - resolvedCount,
  };
}

function mapQueueSongReferences(queue, resolveSongId) {
  if (!queue || typeof queue !== "object" || Array.isArray(queue)) return queue;
  return {
    ...queue,
    playingSongId: queue.playingSongId ? resolveSongId(queue.playingSongId) : null,
    queueIds: (queue.queueIds || []).map(resolveSongId),
    historyIds: (queue.historyIds || []).map(resolveSongId),
    activeQueueHistoryIds: (queue.activeQueueHistoryIds || []).map(resolveSongId),
    originalQueueIds: (queue.originalQueueIds || []).map(resolveSongId),
    savedPlayingSong: queue.savedPlayingSong?.id
      ? { ...queue.savedPlayingSong, id: resolveSongId(queue.savedPlayingSong.id) }
      : queue.savedPlayingSong,
  };
}

export async function resolveStoredProfileSongReferences(profileId, currentSongs = [], currentAlbums = []) {
  const songIdMap = new Map(
    currentSongs
      .filter((song) => typeof song?.id === "string" && song.id)
      .map((song) => [profileSongReferenceId(song.id), song.id]),
  );
  const albumIdMap = new Map(
    currentAlbums
      .filter((album) => typeof album?.id === "string" && album.id)
      .map((album) => [profileAlbumReferenceId(album.id), album.id]),
  );
  const resolveSongId = (id) => songIdMap.get(id) || id;
  const resolveAlbumId = (id) => albumIdMap.get(id) || id;
  const db = await openProfileDb();
  const savedProfile = await db.get("profiles", profileId);
  if (!savedProfile?.portableReferencesPending) {
    return { changed: false, queueState: savedProfile?.queueState || null };
  }
  let localQueue = null;
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(`calliope:queue_state:${profileId}`);
      if (raw) localQueue = JSON.parse(raw);
    } catch (error) {
      console.warn("[profileArchives] No se pudo leer la cola local al resolver referencias:", error);
    }
  }
  const tx = db.transaction(["profiles", "playlists", "history", "playback_stats", "song_ratings"], "readwrite");
  const profileStore = tx.objectStore("profiles");
  const profile = await profileStore.get(profileId);
  let changed = false;
  let queueState = profile?.queueState || null;
  let portableReferencesPending = profile?.portableReferencesPending === true;
  const resolvedLocalQueue = mapQueueSongReferences(localQueue, resolveSongId);
  const resolvedRecords = {};

  for (const [storeName, mapRecord] of [
    ["playlists", (record) => ({
      ...record,
      songIds: (record.songIds || []).map(resolveSongId),
    })],
    ["history", (record) => ({
      ...record,
      itemId: record.type === "song"
        ? resolveSongId(record.itemId)
        : record.type === "album"
          ? resolveAlbumId(record.itemId)
          : record.itemId,
    })],
    ["playback_stats", (record) => {
      if (record.id === `summary_${profileId}` && record.songStats) {
        return {
          ...record,
          songStats: Object.fromEntries(
            Object.entries(record.songStats).map(([id, stat]) => [resolveSongId(id), stat]),
          ),
        };
      }
      return typeof record.songId === "string"
        ? { ...record, songId: resolveSongId(record.songId) }
        : record;
    }],
    ["song_ratings", (record) => {
      const songId = resolveSongId(record.songId);
      return songId === record.songId
        ? record
        : { ...record, id: `${profileId}:${songId}`, songId };
    }],
  ]) {
    const store = tx.objectStore(storeName);
    const records = await store.getAll();
    resolvedRecords[storeName] = [];
    for (const record of records) {
      if (record.profileId !== profileId) continue;
      const mapped = mapRecord(record);
      resolvedRecords[storeName].push(mapped);
      if (JSON.stringify(mapped) === JSON.stringify(record)) continue;
      if (storeName === "song_ratings" && mapped.id !== record.id) await store.delete(record.id);
      await store.put(mapped);
      changed = true;
    }
  }

  if (profile) {
    queueState = mapQueueSongReferences(profile.queueState, resolveSongId);
    const pending = [
      ...(resolvedRecords.playlists || []).flatMap((record) => record.songIds || []),
      ...(resolvedRecords.history || []).flatMap((record) => [
        record.type === "song" ? record.itemId : null,
        record.type === "album" ? record.itemId : null,
      ]),
      ...(resolvedRecords.playback_stats || []).flatMap((record) => [
        record.songId,
        ...Object.keys(record.songStats || {}),
      ]),
      ...(resolvedRecords.song_ratings || []).map((record) => record.songId),
      queueState?.playingSongId,
      ...(queueState?.queueIds || []),
      ...(queueState?.historyIds || []),
      ...(queueState?.activeQueueHistoryIds || []),
      ...(queueState?.originalQueueIds || []),
      resolvedLocalQueue?.playingSongId,
      ...(resolvedLocalQueue?.queueIds || []),
      ...(resolvedLocalQueue?.historyIds || []),
      ...(resolvedLocalQueue?.activeQueueHistoryIds || []),
      ...(resolvedLocalQueue?.originalQueueIds || []),
    ].some((id) => isPortableSongReference(id) || isPortableAlbumReference(id));
    portableReferencesPending = pending;
    if (
      JSON.stringify(queueState) !== JSON.stringify(profile.queueState)
      || profile.portableReferencesPending !== pending
    ) {
      await profileStore.put({ ...profile, queueState, portableReferencesPending: pending });
      changed = true;
    }
  }
  await tx.done;

  if (typeof localStorage !== "undefined" && localQueue) {
    try {
      const key = `calliope:queue_state:${profileId}`;
      if (JSON.stringify(resolvedLocalQueue) !== JSON.stringify(localQueue)) {
        localStorage.setItem(key, JSON.stringify(resolvedLocalQueue));
        if (!queueState || Number(resolvedLocalQueue.savedAt || 0) >= Number(queueState.savedAt || 0)) {
          queueState = resolvedLocalQueue;
        }
        changed = true;
      }
    } catch (error) {
      console.warn("[profileArchives] No se pudieron resolver las referencias de la cola local:", error);
    }
  }
  if (changed) scheduleProfileSync(profileId);
  return { changed, queueState, portableReferencesPending };
}

function migrateProfileArchiveV1(input) {
  if (
    !input.profile
    || typeof input.profile !== "object"
    || !Array.isArray(input.playlists)
    || !Array.isArray(input.history)
    || !Array.isArray(input.ratings)
    || !input.metrics
    || !Array.isArray(input.metrics.events)
    || !input.library
    || !Array.isArray(input.library.songs)
    || !Array.isArray(input.library.metadata)
  ) {
    throw new Error("El respaldo v1 está incompleto o no tiene una estructura válida.");
  }
  assertRecordArray(input.playlists, "listas");
  assertRecordArray(input.history, "historial");
  assertRecordArray(input.ratings, "valoraciones");
  assertRecordArray(input.metrics.events, "métricas");
  assertRecordArray(input.library.songs, "referencias de biblioteca");
  assertRecordArray(input.library.metadata, "metadatos");
  if (
    !input.profile.id
    || typeof input.profile.id !== "string"
    || typeof (input.profile.displayName || input.profile.name) !== "string"
    || !Number.isFinite(input.profile.createdAt)
    || !Number.isFinite(input.profile.updatedAt)
    || !input.profile.preferences
    || typeof input.profile.preferences !== "object"
    || Array.isArray(input.profile.preferences)
    || (input.metrics.summary !== null
      && (typeof input.metrics.summary !== "object" || Array.isArray(input.metrics.summary)))
  ) {
    throw new Error("La identidad o las métricas del respaldo v1 no son válidas.");
  }
  for (const [key, value] of Object.entries(input.profile.preferences)) {
    const defaultValue = DEFAULT_PREFERENCES[key];
    if (defaultValue === undefined || typeof value !== typeof defaultValue) {
      throw new Error(`La preferencia «${key}» del respaldo v1 no es válida.`);
    }
  }
  validateStatsSummary(input.metrics.summary);
  for (const playlist of input.playlists) {
    if (
      !playlist
      || typeof playlist.id !== "string"
      || typeof playlist.name !== "string"
      || !Array.isArray(playlist.songIds)
      || playlist.songIds.some((id) => typeof id !== "string" || !id)
    ) {
      throw new Error("El respaldo v1 contiene una lista de reproducción no válida.");
    }
  }
  for (const item of input.history) {
    if (
      !item
      || typeof item.type !== "string"
      || typeof item.itemId !== "string"
      || !item.itemId
      || !Number.isFinite(item.timestamp)
    ) {
      throw new Error("El respaldo v1 contiene un registro de historial no válido.");
    }
  }
  for (const rating of input.ratings) {
    if (
      !rating
      || typeof rating.songId !== "string"
      || !["like", "dislike", "neutral"].includes(rating.rating)
    ) {
      throw new Error("El respaldo v1 contiene una valoración no válida.");
    }
  }
  for (const event of input.metrics.events) {
    if (
      !event
      || typeof event.songId !== "string"
      || !event.songId
      || !Number.isFinite(event.listenTime)
      || !Number.isFinite(event.timestamp)
    ) {
      throw new Error("El respaldo v1 contiene un evento de reproducción no válido.");
    }
  }
  for (const song of input.library.songs) {
    if (!song || typeof song.id !== "string" || !song.id) {
      throw new Error("El respaldo v1 contiene referencias de canciones no válidas.");
    }
  }
  for (const metadata of input.library.metadata) {
    if (!metadata || typeof metadata.id !== "string" || !metadata.id) {
      throw new Error("El respaldo v1 contiene metadatos de biblioteca no válidos.");
    }
  }
  if (
    input.queue !== undefined
    && input.queue !== null
    && (
      typeof input.queue !== "object"
      || Array.isArray(input.queue)
      || ["queueIds", "historyIds", "activeQueueHistoryIds", "originalQueueIds"].some((key) =>
        input.queue[key] !== undefined
        && (!Array.isArray(input.queue[key]) || input.queue[key].some((id) => typeof id !== "string")),
      )
      || (input.queue.repeatMode !== undefined && !["off", "all", "one"].includes(input.queue.repeatMode))
    )
  ) {
    throw new Error("El estado de cola del respaldo v1 no es válido.");
  }

  const playlists = input.playlists.map((item) => ({ ...item, songIds: [...item.songIds] }));
  const legacyFavorites = input.favorites?.songIds;
  if (
    legacyFavorites !== undefined
    && (!Array.isArray(legacyFavorites) || legacyFavorites.some((id) => typeof id !== "string" || !id))
  ) {
    throw new Error("La lista de favoritos del respaldo v1 no es válida.");
  }
  if (Array.isArray(legacyFavorites)) {
    let favorites = playlists.find((playlist) => playlist.id === "favorites");
    if (!favorites && legacyFavorites.length) {
      favorites = { id: "favorites", name: "Favoritos", songIds: [] };
      playlists.unshift(favorites);
    }
    if (favorites) favorites.songIds = [...new Set([...favorites.songIds, ...legacyFavorites])];
  }

  const migrated = buildProfileArchive({
    profile: input.profile,
    playlists,
    history: input.history,
    stats: input.metrics,
    ratings: input.ratings,
    queue: input.queue,
  });
  return migrated;
}

function migrateProfileArchiveV2(input) {
  if (
    !input.profile
    || typeof input.profile !== "object"
    || !Array.isArray(input.playlists)
    || !Array.isArray(input.history)
    || !Array.isArray(input.ratings)
    || !input.metrics
    || !Array.isArray(input.metrics.events)
  ) {
    throw new Error("El respaldo v2 está incompleto o no tiene una estructura válida.");
  }
  assertRecordArray(input.playlists, "listas");
  assertRecordArray(input.history, "historial");
  assertRecordArray(input.ratings, "valoraciones");
  assertRecordArray(input.metrics.events, "métricas");
  if (
    !input.profile.id
    || typeof input.profile.id !== "string"
    || typeof input.profile.name !== "string"
    || !Number.isFinite(input.profile.createdAt)
    || !Number.isFinite(input.profile.updatedAt)
    || !input.profile.preferences
    || typeof input.profile.preferences !== "object"
    || Array.isArray(input.profile.preferences)
    || (input.metrics.summary !== null
      && (typeof input.metrics.summary !== "object" || Array.isArray(input.metrics.summary)))
  ) {
    throw new Error("La identidad o las métricas del respaldo v2 no son válidas.");
  }
  for (const [key, value] of Object.entries(input.profile.preferences)) {
    const defaultValue = DEFAULT_PREFERENCES[key];
    if (
      defaultValue === undefined
      || typeof value !== typeof defaultValue
      || (key === "volume" && (!Number.isFinite(value) || value < 0 || value > 1))
    ) {
      throw new Error(`La preferencia «${key}» del respaldo v2 no es válida.`);
    }
  }
  validateStatsSummary(input.metrics.summary);
  for (const playlist of input.playlists) {
    if (
      !playlist
      || typeof playlist.id !== "string"
      || !playlist.id
      || typeof playlist.name !== "string"
      || !Array.isArray(playlist.songIds)
      || playlist.songIds.some((id) => typeof id !== "string" || !id)
      || !Number.isInteger(playlist.order)
    ) {
      throw new Error("El respaldo v2 contiene una lista de reproducción no válida.");
    }
  }
  for (const item of input.history) {
    if (
      !item
      || typeof item.type !== "string"
      || !item.type
      || typeof item.itemId !== "string"
      || !item.itemId
      || !Number.isFinite(item.timestamp)
      || !Number.isFinite(item.playCount)
    ) {
      throw new Error("El respaldo v2 contiene un registro de historial no válido.");
    }
  }
  for (const rating of input.ratings) {
    if (
      !rating
      || typeof rating.songId !== "string"
      || !rating.songId
      || !["like", "dislike", "neutral"].includes(rating.rating)
    ) {
      throw new Error("El respaldo v2 contiene una valoración no válida.");
    }
  }
  for (const event of input.metrics.events) {
    if (
      !event
      || typeof event.songId !== "string"
      || !event.songId
      || !Number.isFinite(event.listenTime)
      || !Number.isFinite(event.timestamp)
    ) {
      throw new Error("El respaldo v2 contiene un evento de reproducción no válido.");
    }
  }
  if (
    input.queue !== undefined
    && input.queue !== null
    && (
      typeof input.queue !== "object"
      || Array.isArray(input.queue)
      || ["queueIds", "historyIds", "activeQueueHistoryIds", "originalQueueIds"].some((key) =>
        input.queue[key] !== undefined
        && (!Array.isArray(input.queue[key]) || input.queue[key].some((id) => typeof id !== "string" || !id)),
      )
      || (input.queue.repeatMode !== undefined && !["off", "all", "one"].includes(input.queue.repeatMode))
    )
  ) {
    throw new Error("El estado de cola del respaldo v2 no es válido.");
  }

  return buildProfileArchive({
    profile: input.profile,
    playlists: input.playlists,
    history: input.history,
    stats: input.metrics,
    ratings: input.ratings,
    queue: input.queue,
  });
}

export async function collectProfileArchive(profileId) {
  const db = await openProfileDb();
  const profile = await db.get("profiles", profileId);
  if (!profile) throw new Error("No se encontró el perfil que se desea exportar.");
  const [allPlaylists, allHistory, allStats, allRatings] = await Promise.all([
    db.getAll("playlists"),
    db.getAll("history"),
    db.getAll("playback_stats"),
    db.getAll("song_ratings"),
  ]);
  const playlists = allPlaylists.filter((item) => item.profileId === profileId).map((item) => ({
    ...item,
    id: item.id === `favorites_${profileId}` ? "favorites" : item.id,
  }));
  const stats = allStats.filter((item) => item.profileId === profileId);
  const summary = stats.find((item) => item.id === `summary_${profileId}`) || null;
  const events = stats.filter((item) => item.id !== `summary_${profileId}`);
  let queue = profile.queueState || null;
  if (typeof localStorage !== "undefined") {
    const rawQueue = localStorage.getItem(`calliope:queue_state:${profileId}`);
    if (rawQueue) {
      const localQueue = JSON.parse(rawQueue);
      if (!queue || Number(localQueue.savedAt || 0) >= Number(queue.savedAt || 0)) queue = localQueue;
    }
  }

  const archive = buildProfileArchive({
    profile,
    playlists,
    history: allHistory.filter((item) => item.profileId === profileId),
    stats: { summary, events },
    ratings: allRatings.filter((item) => item.profileId === profileId),
    queue,
  });
  return archive;
}

export async function serializeProfileArchive(profileId) {
  const archive = await collectProfileArchive(profileId);
  return JSON.stringify(archive);
}

function importIds(archive, profileId) {
  const playlistIds = new Map(archive.playlists
    .filter((playlist) => playlist.id !== "favorites")
    .map((playlist, index) => [playlist.id, `playlist_${profileId}_${index}`]));
  const playlists = archive.playlists.map((playlist) => ({
    ...playlist,
    id: playlist.id === "favorites"
      ? `favorites_${profileId}`
      : playlistIds.get(playlist.id),
    profileId,
  }));
  const history = archive.history.map((item, index) => ({
    ...item,
    id: `${profileId}:history:${index}`,
    profileId,
    ...(item.type === "playlist" && playlistIds.has(item.itemId)
      ? { itemId: playlistIds.get(item.itemId) }
      : {}),
  }));
  const summary = archive.metrics.summary
    ? { ...archive.metrics.summary, id: `summary_${profileId}`, profileId }
    : null;
  const events = archive.metrics.events.map((item, index) => ({
    ...item,
    id: `event_${profileId}_${index}`,
    profileId,
  }));
  const ratings = archive.ratings.map((item) => ({
    ...item,
    id: `${profileId}:${item.songId}`,
    profileId,
  }));
  return { playlists, history, summary, events, ratings };
}

export async function importProfileArchive(archive, {
  mode = "new",
  targetProfileId = null,
  preserveSourceId = false,
  currentSongs = [],
  currentAlbums = [],
} = {}) {
  const { archive: canonical } = validateProfileArchive(archive);
  const { archive: validated } = resolveProfileSongReferences(canonical, currentSongs, currentAlbums);
  if (mode !== "new" && mode !== "update") throw new Error("La opción de importación no es válida.");
  const db = await openProfileDb();
  const profileId = mode === "update"
  ? targetProfileId
  : preserveSourceId
    ? validated.profile.id
    : globalThis.crypto?.randomUUID?.() || `prof_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  if (!profileId) throw new Error("No se pudo determinar el perfil de destino.");

  const records = importIds(validated, profileId);
  const stores = ["profiles", "playlists", "history", "playback_stats", "song_ratings"];
  const tx = db.transaction(stores, "readwrite");
  const transactionDone = tx.done;
  let target = null;
  let profile = null;
  let queueState = null;

  try {
  const profileStore = tx.objectStore("profiles");
  const playlistStore = tx.objectStore("playlists");
  const historyStore = tx.objectStore("history");
  const statsStore = tx.objectStore("playback_stats");
  const ratingStore = tx.objectStore("song_ratings");
  const existingProfiles = await profileStore.getAll();
  target = mode === "update"
    ? existingProfiles.find((item) => item.id === targetProfileId) || null
    : null;

  if (mode === "update" && !target) {
    throw new Error("No se encontró el perfil que se desea actualizar.");
  }
  if (mode === "update" && target.id !== validated.profile.id) {
    throw new Error("El identificador del archivo no coincide con el perfil que se desea sobrescribir.");
  }

  if (mode === "new" && existingProfiles.some((item) => item.id === profileId)) {
    throw new Error("El ID del archivo ya pertenece a otro perfil.");
  }

  const usernameInput = validated.profile.username || (mode === "update" ? target.username : "");
  const usernameResult = validateUsername(usernameInput);
  if (!usernameResult.valid) {
    throw new Error(`El perfil importado necesita un nombre de usuario válido: ${usernameResult.reason}`);
  }
  const usernameOwner = existingProfiles.find((item) =>
    item.id !== profileId
    && validateUsername(item.username || "").valid
    && validateUsername(item.username || "").username === usernameResult.username,
  );
  if (usernameOwner) {
    throw new Error(`El nombre de usuario @${usernameResult.username} ya pertenece a otro perfil.`);
  }

  let latestQueueTimestamp = Date.now();
  const targetQueueTimestamp = Number(target?.queueState?.savedAt || 0);
  if (Number.isFinite(targetQueueTimestamp)) {
    latestQueueTimestamp = Math.max(latestQueueTimestamp, targetQueueTimestamp + 1);
  }
  if (typeof localStorage !== "undefined") {
    try {
      const currentQueue = JSON.parse(localStorage.getItem(`calliope:queue_state:${profileId}`) || "null");
      const currentQueueTimestamp = Number(currentQueue?.savedAt || 0);
      if (Number.isFinite(currentQueueTimestamp)) {
        latestQueueTimestamp = Math.max(latestQueueTimestamp, currentQueueTimestamp + 1);
      }
    } catch (error) {
      console.warn("[profileArchives] No se pudo leer la cola anterior antes de importar:", error);
    }
  }
  queueState = {
    ...(validated.queue || {
    playingSongId: null,
    queueIds: [],
    historyIds: [],
    activeQueueHistoryIds: [],
    isShuffleEnabled: false,
    originalQueueIds: [],
    autoplay: false,
    repeatMode: "off",
    }),
    savedAt: latestQueueTimestamp,
  };
  profile = mode === "update"
    ? {
      ...target,
      ...validated.profile.preferences,
      name: validated.profile.name.trim(),
      displayName: validated.profile.name.trim(),
      username: usernameResult.username,
      bio: validated.profile.bio || "",
      createdAt: validated.profile.createdAt,
      preferences: validated.profile.preferences,
        queueState,
        portableReferencesPending: archiveHasPortableReferences(validated),
        updatedAt: Date.now(),
      }
      : {
        ...validated.profile.preferences,
        id: profileId,
        name: validated.profile.name.trim(),
        displayName: validated.profile.name.trim(),
        username: usernameResult.username,
        bio: validated.profile.bio || "",
        createdAt: validated.profile.createdAt,
        updatedAt: Date.now(),
        isPrivate: false,
        private: false,
        credential: null,
        preferences: validated.profile.preferences,
        queueState,
        portableReferencesPending: archiveHasPortableReferences(validated),
        ...(profileId !== validated.profile.id ? { importedFromId: validated.profile.id } : {}),
      };

    if (mode === "update") {
      for (const store of [playlistStore, historyStore, statsStore, ratingStore]) {
        const existing = await store.getAll();
        for (const item of existing) {
          if (item.profileId === profileId) await store.delete(item.id);
        }
      }
    }

    const profileWrites = [
      mode === "new" ? profileStore.add(profile) : profileStore.put(profile),
      ...records.playlists.map((item) => playlistStore.put(item)),
      ...records.history.map((item) => historyStore.put(item)),
      ...records.events.map((item) => statsStore.put(item)),
      ...records.ratings.map((item) => ratingStore.put(item)),
    ];
    if (records.summary) profileWrites.push(statsStore.put(records.summary));
    await Promise.all(profileWrites);
    await transactionDone;
  } catch (error) {
    try { tx.abort(); } catch {}
    try { await transactionDone; } catch {}
    throw new Error(`No se pudo completar la importación; los datos anteriores se conservaron. ${error.message}`);
  }

  if (typeof localStorage !== "undefined") {
    try {
      const queueKey = `calliope:queue_state:${profileId}`;
      if (queueState) localStorage.setItem(queueKey, JSON.stringify(queueState));
      else localStorage.removeItem(queueKey);
    } catch (error) {
      console.warn("[profileArchives] No se pudo actualizar la copia local de la cola:", error);
    }
  }
  scheduleProfileSync(profileId);
  return { profileId, profile, mode };
}

function setSyncStatus(profileId, status, message = "") {
  profileSyncStatuses[profileId] = { status, message, updatedAt: Date.now() };
}

async function writeWebProfileArchive(profileId, profileName, serialized) {
  const db = await openProfileDb();
  const root = await db.get("settings", `music-folder-${profileId}`);
  if (!root?.getDirectoryHandle) {
    throw new Error("Esta plataforma no puede conservar acceso de escritura a la carpeta seleccionada.");
  }
  const permission = await root.queryPermission?.({ mode: "readwrite" });
  if (permission !== "granted") {
    throw new Error("Se necesita permiso de escritura. Pulsa «Reintentar sincronización» para volver a autorizarlo.");
  }

  const profileData = await root.getDirectoryHandle("profile_data", { create: true });
  const existingFolders = [];
  for await (const entry of profileData.values()) {
    if (entry.kind === "directory") existingFolders.push(entry.name);
  }
  const preferred = normalizeProfileDirectoryName(profileName, profileId);
  let targetName = preferred;
  const caseMatch = existingFolders.find((name) =>
    name.toLocaleLowerCase() === preferred.toLocaleLowerCase(),
  );
  if (caseMatch && caseMatch !== preferred) {
    targetName = normalizeProfileDirectoryName(profileName, profileId, existingFolders);
  }
  const targetHandle = await profileData.getDirectoryHandle(targetName, { create: false }).catch(() => null);
  if (targetHandle) {
    const existing = await targetHandle.getFileHandle("profile_data.json", { create: false }).catch(() => null);
    if (existing) {
      const stored = JSON.parse(await (await existing.getFile()).text());
      if (stored?.profile?.id !== profileId) {
        targetName = normalizeProfileDirectoryName(profileName, profileId, existingFolders);
      }
    } else if (existingFolders.some((name) => name.toLocaleLowerCase() === targetName.toLocaleLowerCase())) {
      targetName = normalizeProfileDirectoryName(profileName, profileId, existingFolders);
    }
  }

  let priorDirectory = null;
  let priorName = null;
  for (const directoryName of existingFolders) {
    const directory = await profileData.getDirectoryHandle(directoryName);
    const file = await directory.getFileHandle("profile_data.json", { create: false }).catch(() => null);
    if (!file) continue;
    try {
      const stored = JSON.parse(await (await file.getFile()).text());
      if (stored?.profile?.id === profileId) {
        priorDirectory = directory;
        priorName = directoryName;
        break;
      }
    } catch {
      continue;
    }
  }

  const destination = await profileData.getDirectoryHandle(targetName, { create: true });
  const fileHandle = await destination.getFileHandle("profile_data.json", { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(serialized);
    await writable.close();
  } catch (error) {
    try { await writable.abort(); } catch {}
    throw error;
  }
  const check = JSON.parse(await (await fileHandle.getFile()).text());
  if (check?.profile?.id !== profileId) throw new Error("No se pudo verificar el archivo sincronizado.");

  if (priorDirectory && priorName !== targetName) {
    const entries = [];
    for await (const entry of priorDirectory.values()) entries.push(entry.name);
    if (entries.length === 1 && entries[0] === "profile_data.json") {
      const oldFile = await priorDirectory.getFileHandle("profile_data.json", { create: false }).catch(() => null);
      if (oldFile) {
        const oldArchive = JSON.parse(await (await oldFile.getFile()).text());
        if (oldArchive?.profile?.id === profileId) {
          await profileData.removeEntry(priorName, { recursive: true });
        }
      }
    }
  }
}

async function writeNativeProfileArchive(profileId, profileName, serialized) {
  const result = await FolderPicker.getSavedFolder({ profileId });
  if (!result?.uri) throw new Error("No hay una carpeta asociada a este perfil.");
  const folderName = normalizeProfileDirectoryName(profileName, profileId);
  await FolderPicker.writeProfileData({
    uri: result.uri,
    profileId,
    profileName: folderName,
    content: serialized,
  });
}

async function performProfileSync(profileId) {
  try {
    const db = await openProfileDb();
    const profile = await db.get("profiles", profileId);
    if (!profile) throw new Error("El perfil ya no existe.");
    if (Capacitor.isNativePlatform()) {
      const savedFolder = await FolderPicker.getSavedFolder({ profileId });
      if (!savedFolder?.uri) {
        setSyncStatus(profileId, "unavailable", "No hay una carpeta asociada a este perfil; los datos siguen guardados internamente.");
        return;
      }
      if (savedFolder.canWrite !== true) {
        throw new Error("Android no conservó permiso de escritura para la carpeta. Vuelve a seleccionarla o exporta el JSON manualmente.");
      }
    } else {
      const root = await db.get("settings", `music-folder-${profileId}`);
      if (!root?.getDirectoryHandle) {
        setSyncStatus(profileId, "unavailable", "No hay una carpeta asociada a este perfil; los datos siguen guardados internamente.");
        return;
      }
    }
    setSyncStatus(profileId, "syncing");
    const serialized = await serializeProfileArchive(profileId);
    if (new TextEncoder().encode(serialized).byteLength > MAX_PROFILE_ARCHIVE_BYTES) {
      throw new Error("El respaldo supera el tamaño máximo permitido.");
    }
    if (Capacitor.isNativePlatform()) {
      await writeNativeProfileArchive(profileId, profile.displayName || profile.name, serialized);
    } else {
      await writeWebProfileArchive(profileId, profile.displayName || profile.name, serialized);
    }
    setSyncStatus(profileId, "synced", "Copia externa sincronizada.");
  } catch (error) {
    setSyncStatus(profileId, "error", error.message || "No se pudo sincronizar la copia externa.");
    throw error;
  }
}

export function scheduleProfileSync(profileId) {
  if (!profileId) return;
  syncRevisions.set(profileId, (syncRevisions.get(profileId) || 0) + 1);
  setSyncStatus(profileId, "pending", "Cambios guardados internamente; actualiza la copia externa manualmente.");
}

export async function flushProfileSync(profileId, { requestPermission = false } = {}) {
  if (!profileId) return;

  const existing = syncPromises.get(profileId);
  if (existing) {
    await existing;
    if (syncRevisions.get(profileId) > 0) return flushProfileSync(profileId, { requestPermission });
    return;
  }

  if (requestPermission && !Capacitor.isNativePlatform()) {
    const db = await openProfileDb();
    const root = await db.get("settings", `music-folder-${profileId}`);
    const permission = await root?.requestPermission?.({ mode: "readwrite" });
    if (permission !== "granted") {
      setSyncStatus(profileId, "error", "No se concedió permiso de escritura a la carpeta.");
      return;
    }
  }

  const revision = syncRevisions.get(profileId) || 0;
  const promise = performProfileSync(profileId);
  syncPromises.set(profileId, promise);
  try {
    await promise;
  } finally {
    syncPromises.delete(profileId);
  }
  if ((syncRevisions.get(profileId) || 0) !== revision) {
    return flushProfileSync(profileId, { requestPermission });
  }
  syncRevisions.set(profileId, 0);
}
