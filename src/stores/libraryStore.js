import { defineStore } from "pinia";
import { ref, watch, toRaw, computed } from "vue";
import { parseBlob } from "music-metadata";

import { dbPromise } from "../lib/db.js";
import { writeAudioMetadata } from "../services/audioTagWriter.js";
import { readFormat } from "taglib-wasm/simple";
import { Capacitor } from "@capacitor/core";
import FolderPicker from "../plugins/folderPicker.js";

import {
  sanitizeCoverForStorage,
  isBlobUrl,
  isBinaryCover,
  toDisplayUrl,
} from "../lib/covers.js";

import { useUserStore } from "./userStore.js";

const isNative = Capacitor.isNativePlatform();

export const useLibraryStore = defineStore("library", () => {
  const FAVORITES_PLAYLIST_ID = "favorites";

  // =========================
  // STATE
  // =========================

  const initialized = ref(false);

  const songs = ref([]);
  const albums = ref([]);
  const playlists = ref([]);

  const folderHandle = ref(null);

  let currentUrl = null;

  const sortMode = ref("name");
  const loading = ref(false);

  const historyQueue = ref([]);
  const playQueue = ref([]);

  const playingSong = ref(null);
  const isPlaying = ref(false);

  const currentTime = ref(0);
  const duration = ref(0);
  const volume = ref(1);

  const currentPlaylistId = ref(null);

  const metadataCacheVersion = 4;

  const isNowPlayingOpen = ref(false);
  const isQueueOpen = ref(false);

  // =========================
  // NOW PLAYING & QUEUE OVERLAYS
  // =========================

  function openNowPlaying() {
    isNowPlayingOpen.value = true;
  }

  function closeNowPlaying() {
    isNowPlayingOpen.value = false;
  }

  function toggleNowPlaying() {
    isNowPlayingOpen.value = !isNowPlayingOpen.value;
  }

  function openQueue() {
    isQueueOpen.value = true;
  }

  function closeQueue() {
    isQueueOpen.value = false;
  }

  function toggleQueue() {
    isQueueOpen.value = !isQueueOpen.value;
  }

  // =========================
  // ARTISTS
  // =========================

  function parseArtistNames(rawString) {
    if (!rawString) return [];

    if (Array.isArray(rawString)) {
      return rawString.flatMap((s) => parseArtistNames(s));
    }

    if (typeof rawString !== "string") return [];

    return rawString
      .split(/[,;/]|\s+feat\.?\s+|\s+ft\.?\s+|\s+&\s+/i)
      .map((name) => name.trim())
      .filter((name) => {
        if (!name) return false;

        const lower = name.toLowerCase();

        return (
          lower !== "unknown" &&
          lower !== "varios artistas" &&
          lower !== "various artists"
        );
      });
  }

  function normalizeArtistKey(name) {
    return (name || "").trim().toLowerCase();
  }

  const customArtistCovers = ref({});
  const artistProfiles = ref({});

  const artists = computed(() => {
    const artistMap = new Map();

    function getOrCreateArtist(rawName) {
      const key = normalizeArtistKey(rawName);

      if (!key) return null;

      if (!artistMap.has(key)) {
        artistMap.set(key, {
          id: key.replace(/[^a-z0-9]+/g, "-") || "artist",
          name: rawName.trim(),

          songs: [],
          albums: [],

          albumIds: new Set(),
          songIds: new Set(),

          collaborators: new Set(),
          collaborations: [],
        });
      }

      const entry = artistMap.get(key);

      if (
        rawName.trim().length > entry.name.length ||
        (/[A-Z]/.test(rawName) && !/[A-Z]/.test(entry.name))
      ) {
        entry.name = rawName.trim();
      }

      return entry;
    }

    // =========================================================
    // 1. PROCESS ALL SONGS
    // =========================================================

    for (const song of songs.value) {
      const names = parseArtistNames(song.artist);

      // -------------------------------------------------------
      // Sin artista
      // -------------------------------------------------------

      if (names.length === 0) {
        const fallback = getOrCreateArtist("Artista desconocido");

        if (fallback && !fallback.songIds.has(song.id)) {
          fallback.songIds.add(song.id);
          fallback.songs.push(song);
        }

        continue;
      }

      // -------------------------------------------------------
      // Artistas de la canción
      // -------------------------------------------------------

      const songArtistEntries = names
        .map((name) => getOrCreateArtist(name))
        .filter(Boolean);

      for (const artistEntry of songArtistEntries) {
        if (!artistEntry.songIds.has(song.id)) {
          artistEntry.songIds.add(song.id);
          artistEntry.songs.push(song);
        }

        // IMPORTANTE:
        // NO asignamos song.cover al artista.
        //
        // Las portadas de canciones son artwork de álbum.
        // Los artistas solamente pueden tener una portada
        // personalizada almacenada en customArtistCovers.

        if (songArtistEntries.length > 1) {
          artistEntry.collaborations.push(song);

          for (const other of songArtistEntries) {
            if (other.name !== artistEntry.name) {
              artistEntry.collaborators.add(other.name);
            }
          }
        }
      }
    }

    // =========================================================
    // 2. PROCESS ALL ALBUMS
    // =========================================================

    for (const album of albums.value) {
      const albumArtistNames = parseArtistNames(album.artist);

      const matchedArtists = new Set();

      // -------------------------------------------------------
      // Artistas declarados en el álbum
      // -------------------------------------------------------

      for (const name of albumArtistNames) {
        const entry = getOrCreateArtist(name);

        if (entry) {
          matchedArtists.add(entry);
        }
      }

      // -------------------------------------------------------
      // Buscar artistas de las canciones pertenecientes
      // al álbum
      // -------------------------------------------------------

      for (const song of songs.value) {
        if (
          song.albumId === album.id ||
          (song.album && song.album === album.name)
        ) {
          for (const name of parseArtistNames(song.artist)) {
            const entry = getOrCreateArtist(name);

            if (entry) {
              matchedArtists.add(entry);
            }
          }
        }
      }

      // -------------------------------------------------------
      // Asociar álbum al artista
      // -------------------------------------------------------

      for (const artistEntry of matchedArtists) {
        if (!artistEntry.albumIds.has(album.id)) {
          artistEntry.albumIds.add(album.id);
          artistEntry.albums.push(album);
        }

        // IMPORTANTE:
        // NO asignamos album.cover al artista.
        //
        // album.cover pertenece exclusivamente al álbum.
      }
    }

    // =========================================================
    // 3. MERGE WITH ARTIST PROFILES
    // =========================================================

    return Array.from(artistMap.values())
      .map((artist) => {
        const key = normalizeArtistKey(artist.name);

        const customCover = customArtistCovers.value[key] || null;

        const profile = artistProfiles.value[key] || {};

        return {
          ...artist,

          // -------------------------
          // Perfil personalizado
          // -------------------------

          artisticName: profile.artisticName || artist.name,

          realName: profile.realName || "",

          description: profile.description || "",

          // -------------------------
          // Imagen EXCLUSIVA del artista
          // -------------------------

          customCover,

          hasCustomCover: !!customCover,

          // -------------------------
          // Estadísticas
          // -------------------------

          songCount: artist.songs.length,

          albumsCount: artist.albums.length,

          collaboratorNames: Array.from(artist.collaborators),
        };
      })
      .filter((artist) => artist.songCount > 0 || artist.albumsCount > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  // =========================
  // ARTIST PROFILES
  // =========================

  async function loadArtistProfiles() {
    try {
      const db = await dbPromise;

      if (!db.objectStoreNames.contains("settings")) {
        return;
      }

      const index = (await db.get("settings", "artist-profiles-index")) || [];

      const profiles = {};

      for (const key of index) {
        const stored = await db.get("settings", `artist-profile:${key}`);

        if (stored && typeof stored === "object") {
          profiles[key] = {
            artisticName: stored.artisticName || "",

            realName: stored.realName || "",

            description: stored.description || "",
          };
        }
      }

      artistProfiles.value = profiles;
    } catch (e) {
      console.warn("⚠️ Error loading artist profiles:", e);
    }
  }

  async function saveArtistProfile(artistName, data = {}) {
    const key = normalizeArtistKey(artistName);

    if (!key) return null;

    const profile = {
      artisticName: String(data.artisticName || "").trim(),

      realName: String(data.realName || "").trim(),

      description: String(data.description || "").trim(),
    };

    const db = await dbPromise;

    await db.put("settings", profile, `artist-profile:${key}`);

    const index = (await db.get("settings", "artist-profiles-index")) || [];

    if (!index.includes(key)) {
      index.push(key);

      await db.put("settings", index, "artist-profiles-index");
    }

    artistProfiles.value = {
      ...artistProfiles.value,
      [key]: profile,
    };

    return profile;
  }

  async function removeArtistProfile(artistName) {
    const key = normalizeArtistKey(artistName);

    if (!key) return;

    const db = await dbPromise;

    await db.delete("settings", `artist-profile:${key}`);

    const index = (await db.get("settings", "artist-profiles-index")) || [];

    await db.put(
      "settings",
      index.filter((item) => item !== key),
      "artist-profiles-index",
    );

    const updated = {
      ...artistProfiles.value,
    };

    delete updated[key];

    artistProfiles.value = updated;
  }

  function getArtistProfile(artistName) {
    const key = normalizeArtistKey(artistName);

    return (
      artistProfiles.value[key] || {
        artisticName: "",
        realName: "",
        description: "",
      }
    );
  }

  // =========================
  // ARTIST COVERS
  // =========================

  async function loadCustomArtistCovers() {
    try {
      const db = await dbPromise;

      if (!db.objectStoreNames.contains("settings")) {
        return;
      }

      const index = (await db.get("settings", "artist-covers-index")) || [];

      const map = {};

      for (const key of index) {
        const stored = await db.get("settings", `artist-cover:${key}`);

        if (!stored) continue;

        if (typeof stored === "string" && stored.trim().length > 0) {
          map[key] = stored.trim();
        } else {
          const displayUrl = toDisplayUrl(stored);

          if (displayUrl) {
            map[key] = displayUrl;
          }
        }
      }

      customArtistCovers.value = map;
    } catch (e) {
      console.warn("⚠️ Error loading custom artist covers:", e);
    }
  }

  async function setCustomArtistCover(artistName, data) {
    const key = normalizeArtistKey(artistName);

    if (!key || !data) return null;

    const db = await dbPromise;

    const storedValue = typeof data === "string" ? data.trim() : data;

    await db.put("settings", storedValue, `artist-cover:${key}`);

    const index = (await db.get("settings", "artist-covers-index")) || [];

    if (!index.includes(key)) {
      index.push(key);

      await db.put("settings", index, "artist-covers-index");
    }

    const displayUrl =
      typeof data === "string" ? data.trim() : toDisplayUrl(data);

    customArtistCovers.value = {
      ...customArtistCovers.value,
      [key]: displayUrl,
    };

    return displayUrl;
  }

  async function removeCustomArtistCover(artistName) {
    const key = normalizeArtistKey(artistName);

    if (!key) return;

    const db = await dbPromise;

    await db.delete("settings", `artist-cover:${key}`);

    const index = (await db.get("settings", "artist-covers-index")) || [];

    const nextIndex = index.filter((item) => item !== key);

    await db.put("settings", nextIndex, "artist-covers-index");

    const updated = {
      ...customArtistCovers.value,
    };

    delete updated[key];

    customArtistCovers.value = updated;
  }

  function getArtistCover(rawName) {
    const key = normalizeArtistKey(rawName);

    return customArtistCovers.value[key] || null;
  }

  function getArtistByName(rawName) {
    const key = normalizeArtistKey(rawName);

    return (
      artists.value.find((artist) => normalizeArtistKey(artist.name) === key) ||
      null
    );
  }

  // =========================
  // LISTENING HISTORY
  // =========================

  const listeningHistory = ref([]);

  async function loadHistory() {
    try {
      const db = await dbPromise;

      if (db.objectStoreNames.contains("history")) {
        const records = await db.getAll("history");

        let dirty = false;

        for (const record of records || []) {
          if (isBlobUrl(record.cover)) {
            record.cover = null;
            dirty = true;
          }
        }

        if (dirty) {
          try {
            await db.clear("history");

            await Promise.all(
              (records || []).map((record) => db.put("history", toRaw(record))),
            );
          } catch (e) {
            console.warn("Could not migrate history covers:", e);
          }
        }

        const user = useUserStore();
        if (user.isGuest) {
          listeningHistory.value = [];
          return;
        }

        const currentProfileId = user.currentSession?.profileId;
        if (!currentProfileId) {
          listeningHistory.value = [];
          return;
        }

        const profileRecords = [];
        for (const record of records || []) {
          if (record.profileId === currentProfileId) {
            profileRecords.push(record);
          } else if (!record.profileId) {
            record.profileId = currentProfileId;
            try {
              await db.put("history", toRaw(record));
            } catch {}
            profileRecords.push(record);
          }
        }

        listeningHistory.value = profileRecords.sort(
          (a, b) => (b.timestamp || 0) - (a.timestamp || 0),
        );
      }
    } catch (e) {
      console.warn("Could not load history from db:", e);
    }
  }

  async function addToListeningHistory(entry) {
    if (!entry || !entry.title) return;

    try {
      const user = useUserStore();

      if (user.loaded && user.profile.saveListeningHistory === false) {
        return;
      }
    } catch {}

    const now = Date.now();

    const last = listeningHistory.value[0];

    const user = useUserStore();
    const currentProfileId = user.currentSession?.profileId;

    if (
      last &&
      last.type === entry.type &&
      last.itemId === entry.itemId &&
      now - (last.timestamp || 0) < 60000
    ) {
      last.timestamp = now;

      if (!user.isGuest && currentProfileId) {
        try {
          const db = await dbPromise;

          if (db.objectStoreNames.contains("history")) {
            await db.put("history", toRaw(last));
          }
        } catch (e) {}
      }

      return;
    }

    const newRecord = {
      id: `${now}-${Math.random().toString(36).substr(2, 5)}`,

      type: entry.type || "song",

      itemId: entry.itemId || entry.id || String(now),

      title: entry.title,

      subtitle: entry.subtitle || "",

      cover: sanitizeCoverForStorage(entry.cover),

      duration: entry.duration || null,

      timestamp: now,

      profileId: user.isGuest ? null : currentProfileId,
    };

    listeningHistory.value.unshift(newRecord);

    if (listeningHistory.value.length > 200) {
      listeningHistory.value = listeningHistory.value.slice(0, 200);
    }

    if (!user.isGuest && currentProfileId) {
      try {
        const db = await dbPromise;

        if (db.objectStoreNames.contains("history")) {
          await db.put("history", toRaw(newRecord));
        }
      } catch (e) {
        console.warn("Could not save history to db:", e);
      }
    }
  }

  function recordAlbumPlayed(album) {
    if (!album) return;

    addToListeningHistory({
      type: "album",
      itemId: album.id,
      title: album.name,
      subtitle: album.artist || "Álbum",
      cover: album.cover || null,
    });
  }

  function recordPlaylistPlayed(playlist, count) {
    if (!playlist) return;

    addToListeningHistory({
      type: "playlist",
      itemId: playlist.id,
      title: playlist.name,
      subtitle: count ? `${count} canciones` : "Playlist",
      cover: playlist.cover || null,
    });
  }

  async function removeHistoryItem(id) {
    listeningHistory.value = listeningHistory.value.filter(
      (item) => item.id !== id,
    );

    try {
      const db = await dbPromise;

      if (db.objectStoreNames.contains("history")) {
        await db.delete("history", id);
      }
    } catch (e) {}
  }

  async function clearListeningHistory() {
    listeningHistory.value = [];
    historyQueue.value = [];

    try {
      const db = await dbPromise;

      if (db.objectStoreNames.contains("history")) {
        await db.clear("history");
      }
    } catch (e) {}
  }

  function clearHistory() {
    clearListeningHistory();
  }

  // =========================
  // QUEUE
  // =========================

  function removeFromQueue(index) {
    if (index >= 0 && index < playQueue.value.length) {
      playQueue.value.splice(index, 1);
    }
  }

  function removeSongFromQueue(songId) {
    if (!songId) return;
    playQueue.value = playQueue.value.filter((song) => song.id !== songId);
  }

  function clearQueue() {
    playQueue.value = [];
  }

  function clearHistoryQueue() {
    historyQueue.value = [];
  }

  function addToQueue(song) {
    if (!song || !song.id) return;
    if (playQueue.value.some((item) => item.id === song.id)) {
      return;
    }
    playQueue.value.push(song);
  }

  function playNext(song) {
    if (!song || !song.id) return;
    playQueue.value = [
      song,
      ...playQueue.value.filter((item) => item.id !== song.id),
    ];
  }

  function addSongsToQueue(songsList) {
    if (!Array.isArray(songsList) || !songsList.length) return;
    const existingIds = new Set(playQueue.value.map((s) => s.id));
    const toAdd = [];
    for (const song of songsList) {
      if (song && song.id && !existingIds.has(song.id)) {
        existingIds.add(song.id);
        toAdd.push(song);
      }
    }
    if (toAdd.length > 0) {
      playQueue.value.push(...toAdd);
    }
  }

  function addAlbumToQueue(album) {
    if (!album) return;
    const albumSongs = songs.value.filter(
      (song) =>
        song.albumId === album.id || (song.album && song.album === album.name),
    );
    addSongsToQueue(albumSongs);
  }

  function addPlaylistToQueue(playlist) {
    if (!playlist || !Array.isArray(playlist.songIds)) return;
    const playlistSongs = playlist.songIds
      .map((id) => songs.value.find((s) => s.id === id))
      .filter(Boolean);
    addSongsToQueue(playlistSongs);
  }

  function setPlayQueue(songsList) {
    if (!Array.isArray(songsList)) return;
    playQueue.value = dedupeById(songsList);
  }

  function moveQueueItem(fromIndex, toIndex) {
    if (
      fromIndex < 0 ||
      fromIndex >= playQueue.value.length ||
      toIndex < 0 ||
      toIndex >= playQueue.value.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const [movedSong] = playQueue.value.splice(fromIndex, 1);
    playQueue.value.splice(toIndex, 0, movedSong);
  }

  function playQueueSong(index) {
    if (index < 0 || index >= playQueue.value.length) return;

    if (playingSong.value) {
      historyQueue.value = dedupeById([
        ...historyQueue.value.filter((s) => s.id !== playingSong.value.id),
        playingSong.value,
      ]);
    }

    const skipped = playQueue.value.slice(0, index);
    for (const song of skipped) {
      historyQueue.value = dedupeById([
        ...historyQueue.value.filter((s) => s.id !== song.id),
        song,
      ]);
    }

    const targetSong = playQueue.value[index];
    playQueue.value = playQueue.value.slice(index + 1);
    playSong(targetSong, false);
  }

  function playHistorySong(song) {
    if (!song) return;

    if (playingSong.value) {
      playQueue.value = dedupeById([
        playingSong.value,
        ...playQueue.value.filter((item) => item.id !== playingSong.value.id),
      ]);
    }

    historyQueue.value = historyQueue.value.filter((s) => s.id !== song.id);
    playSong(song, false);
  }

  // =========================
  // QUEUE PERSISTENCE
  // =========================

  const QUEUE_STORAGE_KEY_PREFIX = "calliope:queue_state:";

  function getQueueStorageKey() {
    try {
      const user = useUserStore();
      const profileId = user.currentSession?.profileId || "guest";
      return `${QUEUE_STORAGE_KEY_PREFIX}${profileId}`;
    } catch {
      return `${QUEUE_STORAGE_KEY_PREFIX}default`;
    }
  }

  function saveQueueState() {
    try {
      const user = useUserStore();
      if (user?.loaded && user.profile?.keepQueueWhenClosing === false) {
        return;
      }

      const key = getQueueStorageKey();
      const state = {
        playingSongId: playingSong.value?.id || null,
        queueIds: (playQueue.value || []).map((s) => s.id).filter(Boolean),
        historyIds: (historyQueue.value || []).map((s) => s.id).filter(Boolean),
        savedPlayingSong: playingSong.value
          ? {
              id: playingSong.value.id,
              name: playingSong.value.name,
              title: playingSong.value.title || playingSong.value.name,
              artist: playingSong.value.artist,
              album: playingSong.value.album,
              cover: sanitizeCoverForStorage(playingSong.value.cover),
              duration: playingSong.value.duration,
            }
          : null,
      };
      localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
      console.warn("Could not save queue state to localStorage:", e);
    }
  }

  function restoreQueueState() {
    try {
      const user = useUserStore();
      if (user?.loaded && user.profile?.keepQueueWhenClosing === false) {
        return;
      }

      const key = getQueueStorageKey();
      const raw = localStorage.getItem(key);
      if (!raw) return;

      const state = JSON.parse(raw);
      if (!state || typeof state !== "object") return;

      if (!songs.value.length) {
        if (state.savedPlayingSong && !playingSong.value) {
          playingSong.value = state.savedPlayingSong;
        }
        return;
      }

      if (!playingSong.value && state.playingSongId) {
        const found = songs.value.find((s) => s.id === state.playingSongId);
        if (found) {
          playingSong.value = found;
        } else if (state.savedPlayingSong) {
          playingSong.value = state.savedPlayingSong;
        }
      }

      if (
        Array.isArray(state.queueIds) &&
        state.queueIds.length &&
        (!playQueue.value || playQueue.value.length === 0)
      ) {
        const restoredQueue = state.queueIds
          .map((id) => songs.value.find((s) => s.id === id))
          .filter(Boolean);
        if (restoredQueue.length) {
          playQueue.value = dedupeById(restoredQueue);
        }
      }

      if (
        Array.isArray(state.historyIds) &&
        state.historyIds.length &&
        (!historyQueue.value || historyQueue.value.length === 0)
      ) {
        const restoredHistory = state.historyIds
          .map((id) => songs.value.find((s) => s.id === id))
          .filter(Boolean);
        if (restoredHistory.length) {
          historyQueue.value = dedupeById(restoredHistory);
        }
      }
    } catch (e) {
      console.warn("Could not restore queue state:", e);
    }
  }

  watch(
    [playingSong, playQueue, historyQueue],
    () => {
      saveQueueState();
    },
    { deep: true },
  );

  // =========================
  // INITIALIZATION
  // =========================

  function songIdForFile(file) {
    return file.name;
  }

  async function init() {
    try {
      await loadPlaylists();

      // Primero recuperamos la carpeta, pero todavía NO escaneamos.
      await loadSavedFolder(false);

      if (folderHandle.value) {
        // Primero cargamos los álbumes y sus portadas.
        await loadAlbums();

        // Después escaneamos las canciones.
        // Así, cuando una canción busque la portada de su álbum,
        // albums.value ya está disponible.
        await scanFolder();
      } else {
        albums.value = [];
        artists.value = [];
        songs.value = [];
      }

      await loadHistory();
      await loadCustomArtistCovers();
      await loadArtistProfiles();
      restoreQueueState();
    } catch (e) {
      console.warn("⚠️ Error during init:", e);
    } finally {
      initialized.value = true;
    }
  }

  async function switchProfile() {
    audio.pause();
    audio.currentTime = 0;
    playingSong.value = null;
    isPlaying.value = false;
    playQueue.value = [];
    historyQueue.value = [];

    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
      currentUrl = null;
    }

    currentTime.value = 0;
    duration.value = 0;

    folderHandle.value = null;
    songs.value = [];
    albums.value = [];
    artists.value = [];
    playlists.value = [];
    listeningHistory.value = [];
    customArtistCovers.value = {};
    artistProfiles.value = {};

    const user = useUserStore();
    if (user.hasSession) {
      await loadPlaylists();
      await loadHistory();
      await loadCustomArtistCovers();
      await loadArtistProfiles();
      await loadSavedFolder(false);

      if (folderHandle.value) {
        await loadAlbums();
        await scanFolder();
      }
      restoreQueueState();
    }
  }

  // =========================
  // ALBUMS
  // =========================

  async function loadAlbums() {
    const db = await dbPromise;

    const data = await db.getAll("albums");

    albums.value = data.map((album) => ({
      ...album,

      cover: toDisplayUrl(album.cover),
    }));

    sortAlbums();
  }

  function isBinaryCoverInternal(cover) {
    return cover instanceof Blob || cover instanceof File;
  }

  function toCoverUrl(cover) {
    if (!cover) return null;

    if (typeof cover === "string") {
      return isBlobUrl(cover) ? null : cover;
    }

    return isBinaryCoverInternal(cover) ? URL.createObjectURL(cover) : null;
  }

  // =========================
  // FOLDER
  // =========================

  async function loadSavedFolder(shouldScan = true) {
    const user = useUserStore();

    if (user.isGuest) {
      folderHandle.value = null;
      songs.value = [];
      albums.value = [];
      artists.value = [];
      return;
    }

    const currentProfileId = user.currentSession?.profileId;
    if (!currentProfileId) {
      folderHandle.value = null;
      songs.value = [];
      albums.value = [];
      artists.value = [];
      return;
    }

    if (isNative) {
      try {
        const result = await FolderPicker.getSavedFolder();

        if (result && result.uri) {
          folderHandle.value = {
            nativeUri: result.uri,
          };

          if (shouldScan) {
            await scanFolderNative(result.uri);
          }
        }
      } catch (e) {
        console.warn("⚠️ Could not load saved native folder:", e);
      }

      return;
    }

    const db = await dbPromise;

    let savedHandle = await db.get(
      "settings",
      `music-folder-${currentProfileId}`,
    );

    // Migración segura de carpeta global antigua
    if (!savedHandle) {
      try {
        const globalHandle = await db.get("settings", "music-folder");
        if (globalHandle) {
          savedHandle = globalHandle;
          await db.put(
            "settings",
            globalHandle,
            `music-folder-${currentProfileId}`,
          );
        }
      } catch (e) {
        console.warn("No se pudo migrar la carpeta previa al perfil:", e);
      }
    }

    if (!savedHandle) {
      folderHandle.value = null;
      songs.value = [];
      albums.value = [];
      artists.value = [];
      return;
    }

    try {
      const permission = await savedHandle.queryPermission({
        mode: "read",
      });

      if (permission !== "granted") {
        const newPermission = await savedHandle.requestPermission({
          mode: "read",
        });

        if (newPermission !== "granted") {
          folderHandle.value = null;
          songs.value = [];
          albums.value = [];
          artists.value = [];
          return;
        }
      }

      folderHandle.value = savedHandle;

      if (shouldScan) {
        await scanFolder();
      }
    } catch (e) {
      console.warn("No se pudo cargar la carpeta guardada del perfil:", e);
      folderHandle.value = null;
      songs.value = [];
      albums.value = [];
      artists.value = [];
    }
  }

  async function loadPlaylists() {
    const user = useUserStore();
    const currentProfileId = user.currentSession?.profileId;

    if (user.isGuest || !currentProfileId) {
      playlists.value = [];
      await ensureFavoritesPlaylist();
      return;
    }

    const db = await dbPromise;
    const all = await db.getAll("playlists");

    const userPlaylists = [];
    for (const pl of all) {
      if (pl.profileId === currentProfileId) {
        userPlaylists.push({
          ...pl,
          id:
            pl.id === `favorites_${currentProfileId}`
              ? FAVORITES_PLAYLIST_ID
              : pl.id,
        });
      } else if (!pl.profileId) {
        const migrated = {
          ...pl,
          profileId: currentProfileId,
          id:
            pl.id === FAVORITES_PLAYLIST_ID
              ? `favorites_${currentProfileId}`
              : pl.id,
        };
        await db.put("playlists", migrated);
        if (pl.id !== migrated.id) {
          try {
            await db.delete("playlists", pl.id);
          } catch {}
        }
        userPlaylists.push({
          ...migrated,
          id: pl.id === FAVORITES_PLAYLIST_ID ? FAVORITES_PLAYLIST_ID : pl.id,
        });
      }
    }

    playlists.value = userPlaylists;
    await ensureFavoritesPlaylist();
  }

  // =========================
  // AUDIO ENGINE
  // =========================

  const audio = new Audio();

  let audioContext = null;
  let audioAnalyser = null;
  let audioSource = null;

  function getAudioAnalyser() {
    if (audioAnalyser) {
      return audioAnalyser;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      return null;
    }

    audioContext = new AudioContextClass();

    audioAnalyser = audioContext.createAnalyser();

    audioAnalyser.fftSize = 256;

    audioAnalyser.smoothingTimeConstant = 0.78;

    audioSource = audioContext.createMediaElementSource(audio);

    audioSource.connect(audioAnalyser);

    audioAnalyser.connect(audioContext.destination);

    return audioAnalyser;
  }

  function resumeAudioAnalyser() {
    return audioContext?.state === "suspended"
      ? audioContext.resume()
      : Promise.resolve();
  }

  // =========================
  // AUDIO EVENTS
  // =========================

  audio.addEventListener("play", () => {
    isPlaying.value = true;
  });

  audio.addEventListener("pause", () => {
    isPlaying.value = false;
  });

  audio.addEventListener("timeupdate", () => {
    currentTime.value = audio.currentTime;
  });

  audio.addEventListener("loadedmetadata", () => {
    duration.value = audio.duration;
  });

  audio.addEventListener("ended", () => {
    playNextSong();
  });

  // =========================
  // VOLUME
  // =========================

  const VOLUME_STORAGE_KEY = "calliope:volume";

  function loadSavedVolume() {
    try {
      const saved = localStorage.getItem(VOLUME_STORAGE_KEY);

      if (saved === null) {
        audio.volume = volume.value;
        return;
      }

      const parsed = Number(saved);

      if (!Number.isFinite(parsed)) {
        audio.volume = volume.value;
        return;
      }

      const normalized = Math.min(1, Math.max(0, parsed));

      volume.value = normalized;
      audio.volume = normalized;
    } catch (error) {
      console.warn("⚠️ Could not load saved volume:", error);

      audio.volume = volume.value;
    }
  }

  function saveVolume(value) {
    try {
      const normalized = Math.min(1, Math.max(0, Number(value) || 0));

      volume.value = normalized;
      audio.volume = normalized;

      localStorage.setItem(VOLUME_STORAGE_KEY, String(normalized));
    } catch (error) {
      console.warn("⚠️ Could not save volume:", error);
    }
  }

  watch(volume, (value) => {
    saveVolume(value);
  });

  loadSavedVolume();

  // =========================
  // PLAYLIST MANAGEMENT
  // =========================

  async function ensureFavoritesPlaylist() {
    const existing = playlists.value.find(
      (playlist) => playlist.id === FAVORITES_PLAYLIST_ID,
    );

    if (existing) {
      if (!Array.isArray(existing.songIds)) {
        existing.songIds = [];

        await savePlaylist(existing);
      }

      return existing;
    }

    const playlist = {
      id: FAVORITES_PLAYLIST_ID,
      name: "Favoritos",
      cover: null,
      songIds: [],
    };

    playlists.value = [
      playlist,
      ...playlists.value.filter((item) => item.id !== FAVORITES_PLAYLIST_ID),
    ];

    await savePlaylist(playlist);

    return playlist;
  }

  async function createPlaylist({ name, cover }) {
    const playlist = {
      id: crypto.randomUUID(),
      name: name.trim(),
      cover: cover?.trim() || null,
      songIds: [],
    };

    playlists.value.push(playlist);

    await savePlaylist(playlist);
  }

  async function updatePlaylist(id, { name, cover }) {
    if (id === FAVORITES_PLAYLIST_ID) {
      return;
    }

    const playlist = playlists.value.find((item) => item.id === id);

    if (!playlist || !name.trim()) {
      return;
    }

    playlist.name = name.trim();

    playlist.cover = cover?.trim() || null;

    await savePlaylist(playlist);
  }

  async function savePlaylist(playlist) {
    const user = useUserStore();
    if (user.isGuest) return;

    const currentProfileId = user.currentSession?.profileId;
    if (!currentProfileId) return;

    const db = await dbPromise;
    const data = JSON.parse(JSON.stringify(toRaw(playlist)));
    data.profileId = currentProfileId;
    if (data.id === FAVORITES_PLAYLIST_ID) {
      data.id = `favorites_${currentProfileId}`;
    }

    await db.put("playlists", data);
  }

  async function addSongToPlaylist(playlistId, songId) {
    const playlist = playlists.value.find(
      (playlist) => playlist.id === playlistId,
    );

    if (!playlist) return;

    if (!playlist.songIds) {
      playlist.songIds = [];
    }

    if (playlist.songIds.includes(songId)) {
      return;
    }

    playlist.songIds.push(songId);

    await savePlaylist(playlist);
  }

  async function removeSongFromPlaylist(playlistId, songId) {
    const playlist = playlists.value.find((item) => item.id === playlistId);

    if (!playlist || !Array.isArray(playlist.songIds)) {
      return;
    }

    playlist.songIds = playlist.songIds.filter((id) => id !== songId);

    await savePlaylist(playlist);
  }

  async function deletePlaylist(playlistId) {
    if (playlistId === FAVORITES_PLAYLIST_ID) {
      return;
    }

    const playlist = playlists.value.find((item) => item.id === playlistId);

    if (!playlist) return;

    playlists.value = playlists.value.filter((item) => item.id !== playlistId);

    const user = useUserStore();
    const currentProfileId = user.currentSession?.profileId;
    if (user.isGuest || !currentProfileId) return;

    const db = await dbPromise;

    await db.delete("playlists", playlistId);
  }

  async function reorderPlaylistSongs(playlistId, songIds) {
    const playlist = playlists.value.find((item) => item.id === playlistId);

    if (!playlist) return;

    playlist.songIds = [...songIds];

    await savePlaylist(playlist);
  }

  // =========================
  // FAVORITES
  // =========================

  function dedupeById(items) {
    const seen = new Set();

    return items.filter((item) => {
      const itemId = item?.id ?? item;

      if (!itemId || seen.has(itemId)) {
        return false;
      }

      seen.add(itemId);

      return true;
    });
  }

  async function syncFavoritesPlaylistFromSongs() {
    const favoritesPlaylist = playlists.value.find(
      (playlist) => playlist.id === FAVORITES_PLAYLIST_ID,
    );

    if (!favoritesPlaylist) {
      return null;
    }

    const favoriteSongIds = dedupeById(
      songs.value.filter((song) => song.favorite).map((song) => song.id),
    );

    const existingIds = Array.isArray(favoritesPlaylist.songIds)
      ? favoritesPlaylist.songIds.filter((id) => favoriteSongIds.includes(id))
      : [];

    const nextSongIds = dedupeById([
      ...existingIds,

      ...favoriteSongIds.filter((id) => !existingIds.includes(id)),
    ]);

    if (
      JSON.stringify(favoritesPlaylist.songIds || []) !==
      JSON.stringify(nextSongIds)
    ) {
      favoritesPlaylist.songIds = nextSongIds;

      await savePlaylist(favoritesPlaylist);
    }

    return favoritesPlaylist;
  }

  async function toggleFavorite(song) {
    if (!song) return;

    const nextFavorite = !song.favorite;

    song.favorite = nextFavorite;

    const db = await dbPromise;

    const existingMetadata = await db.get("metadata", song.id);

    await db.put("metadata", {
      ...(existingMetadata || {}),
      id: song.id,
      favorite: nextFavorite,
    });

    await ensureFavoritesPlaylist();
    await syncFavoritesPlaylistFromSongs();
  }

  function isSongInPlaylist(playlistId, songId) {
    const playlist = playlists.value.find((item) => item.id === playlistId);

    if (!playlist) return false;

    return (playlist.songIds ?? []).includes(songId);
  }

  // =========================
  // PLAYER ACTIONS
  // =========================

  function playFromPlaylist(song, songsList) {
    const currentIndex = songsList.findIndex((item) => item.id === song.id);

    playQueue.value = songsList.slice(currentIndex + 1);

    playSong(song);
  }

  async function ensureSongFile(song) {
    if (song.file) {
      return song.file;
    }

    if (song.nativeUri) {
      try {
        const res = await FolderPicker.readFileAsBase64({
          uri: song.nativeUri,
        });

        if (res && res.data) {
          const binaryString = atob(res.data);

          const bytes = new Uint8Array(binaryString.length);

          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          song.file = new Blob([bytes], {
            type: res.mimeType || "audio/mpeg",
          });

          return song.file;
        }
      } catch (e) {
        console.error("Error loading native audio file blob:", e);
      }
    }

    return null;
  }

  async function playSong(song, addToHistory = true, options = {}) {
    const { removeFromQueue = false } = options;

    await ensureSongFile(song);

    if (!song.file) {
      console.warn("Cannot play song: file not loaded", song);

      return;
    }

    if (addToHistory && playingSong.value && playingSong.value.id !== song.id) {
      historyQueue.value = dedupeById([
        ...historyQueue.value.filter(
          (item) => item?.id !== playingSong.value.id,
        ),

        playingSong.value,
      ]);
    }

    historyQueue.value = dedupeById(
      historyQueue.value.filter((item) => item?.id !== song.id),
    );

    if (removeFromQueue) {
      playQueue.value = dedupeById(
        playQueue.value.filter((item) => item?.id !== song.id),
      );
    }

    playQueue.value = dedupeById(playQueue.value);

    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
    }

    currentUrl = URL.createObjectURL(song.file);

    audio.src = currentUrl;

    currentTime.value = 0;

    audio.play().catch((err) => {
      console.error(err);
    });

    playingSong.value = song;

    if (addToHistory) {
      addToListeningHistory({
        type: "song",

        itemId: song.id,

        title: song.title || song.name,

        subtitle: song.artist || "Artista desconocido",

        cover: song.cover || null,

        duration: song.duration,
      });
    }
  }

  function playPreviousSong() {
    if (currentTime.value > 3) {
      seek(0);
      return;
    }

    const previousSong = historyQueue.value.pop();

    if (!previousSong) {
      seek(0);
      return;
    }

    if (playingSong.value) {
      playQueue.value = dedupeById([
        playingSong.value,

        ...playQueue.value.filter((item) => item?.id !== playingSong.value.id),
      ]);
    }

    playSong(previousSong, false, {
      removeFromQueue: true,
    });
  }

  function playNextSong() {
    const nextSong = playQueue.value.shift();

    if (!nextSong) return;

    playSong(nextSong);
  }

  function togglePlay() {
    if (!audio.src) {
      if (playingSong.value) {
        playSong(playingSong.value, false);
      }
      return;
    }

    if (audio.paused) {
      audio.play().catch((err) => {
        console.error(err);
      });
    } else {
      audio.pause();
    }
  }

  function seek(time) {
    audio.currentTime = time;
  }

  // =========================
  // LIBRARY / FILESYSTEM
  // =========================

  function cleanFileName(name) {
    if (!name || typeof name !== "string") {
      return "";
    }

    return name
      .replace(
        /\.(mp3|m4a|flac|wav|ogg|opus|aac|wma)(?:\s*[-_.].*|\s+.*)?$/i,
        "",
      )
      .replace(/\.[^/.]+$/, "")
      .replace(/\s+$/, "")
      .trim();
  }

  function getAudioDuration(file) {
    return new Promise((resolve) => {
      const audio = document.createElement("audio");

      audio.preload = "metadata";

      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(audio.src);

        resolve(audio.duration);
      };

      audio.src = URL.createObjectURL(file);
    });
  }

  function sortSongs(mode = sortMode.value) {
    switch (mode) {
      case "name":
        songs.value.sort((a, b) => a.title.localeCompare(b.title));
        break;

      case "artist":
        songs.value.sort((a, b) => a.artist.localeCompare(b.artist));
        break;

      case "duration":
        songs.value.sort((a, b) => a.duration - b.duration);
        break;
    }
  }

  function sortAlbums() {
    albums.value.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        sensitivity: "base",
      }),
    );
  }

  async function scanFolder(forceMetadata = false) {
    if (!folderHandle.value) {
      return;
    }

    loading.value = true;

    try {
      const list = [];

      for await (const entry of folderHandle.value.values()) {
        if (entry.kind !== "file") {
          continue;
        }

        const file = await entry.getFile();

        let format;

        try {
          format = await readFormat(file);
        } catch {
          continue;
        }

        if (!format || format === "unknown") {
          continue;
        }

        list.push({
          id: songIdForFile(file),

          file,

          fileHandle: entry,

          directoryHandle: folderHandle.value,

          name: cleanFileName(file.name),

          duration: null,

          title: cleanFileName(file.name),

          artist: "Unknown",

          cover: null,

          favorite: false,

          metadataLoaded: false,
        });
      }

      songs.value = list;

      sortSongs();

      await loadMetadataForSongs(forceMetadata);
      restoreQueueState();
    } finally {
      loading.value = false;
    }
  }

  async function scanFolderNative(uri) {
    loading.value = true;

    try {
      const res = await FolderPicker.listAudioFiles({
        uri,
      });

      const rawFiles = res?.files || [];

      const list = [];

      for (const file of rawFiles) {
        list.push({
          id: file.name,

          nativeUri: file.uri,

          mimeType: file.mimeType,

          file: null,

          name: cleanFileName(file.name),

          duration: null,

          title: cleanFileName(file.name),

          artist: "Unknown",

          cover: null,

          favorite: false,

          metadataLoaded: false,
        });
      }

      songs.value = list;

      sortSongs();

      await loadMetadataForSongs();
      restoreQueueState();
    } catch (e) {
      console.error("Error scanning native folder:", e);
    } finally {
      loading.value = false;
    }
  }

  async function rescanLibrary() {
    if (!folderHandle.value) {
      return;
    }

    loading.value = true;

    try {
      if (isNative && folderHandle.value.nativeUri) {
        await scanFolderNative(folderHandle.value.nativeUri);
      } else {
        await scanFolder();
      }
    } finally {
      loading.value = false;
    }
  }

  async function selectFolder() {
    if (isNative) {
      try {
        const result = await FolderPicker.pickFolder();

        if (!result || !result.uri) {
          return;
        }

        folderHandle.value = {
          nativeUri: result.uri,
        };

        await scanFolderNative(result.uri);
      } catch (e) {
        console.error("Error selecting native folder:", e);
      }

      return;
    }

    const handle = await window.showDirectoryPicker();

    folderHandle.value = handle;

    const user = useUserStore();
    // Guardar en IndexedDB SOLO para perfiles registrados permanentes
    if (user.isRegistered && user.currentSession?.profileId) {
      const db = await dbPromise;
      await db.put(
        "settings",
        handle,
        `music-folder-${user.currentSession.profileId}`,
      );
    }

    await scanFolder();
  }

  async function removeFolder() {
    if (isNative) {
      try {
        await FolderPicker.clearSavedFolder();
      } catch (e) {
        console.warn("Could not clear native folder:", e);
      }
    }

    const user = useUserStore();
    const currentProfileId = user.currentSession?.profileId;

    if (user.isRegistered && currentProfileId) {
      const db = await dbPromise;
      await db.delete("settings", `music-folder-${currentProfileId}`);
    }

    folderHandle.value = null;

    songs.value = [];
    albums.value = [];
    artists.value = [];

    playingSong.value = null;

    playQueue.value = [];

    historyQueue.value = [];

    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);

      currentUrl = null;
    }

    currentTime.value = 0;
    duration.value = 0;
  }

  async function selectFiles(files) {
    const list = [];

    for (const file of files) {
      if (!/\.(mp3|m4a|flac|wav|ogg|opus|aac|wma)$/i.test(file.name)) {
        continue;
      }

      list.push({
        id: songIdForFile(file),

        file,

        name: cleanFileName(file.name),

        duration: null,

        title: cleanFileName(file.name),

        artist: "Unknown",

        cover: null,

        favorite: false,

        metadataLoaded: false,
      });
    }

    songs.value = list;

    sortSongs();

    await loadMetadataForSongs();
  }

  // =========================
  // METADATA
  // =========================

  async function loadMetadataForSongs(forceRescan = false) {
    const db = await dbPromise;

    for (const song of songs.value) {
      try {
        // -------------------------
        // Metadata cache
        // -------------------------

        const cached = await db.get("metadata", song.id);

        if (!forceRescan && cached?.cacheVersion === metadataCacheVersion) {
          Object.assign(song, cached);

          const albumData =
            cached.hasMetadata && cached.albumId
              ? albums.value.find((album) => album.id === cached.albumId)
              : null;

          song.cover = albumData?.cover ?? null;

          song.metadataLoaded = true;

          continue;
        }

        if (cached) {
          await db.delete("metadata", song.id);
        }

        // -------------------------
        // Ensure file
        // -------------------------

        if (!song.file && song.nativeUri) {
          await ensureSongFile(song);
        }

        if (!song.file) {
          song.title = cleanFileName(song.name);

          song.artist = "Unknown";

          song.metadataLoaded = true;

          continue;
        }

        // -------------------------
        // Read metadata
        // -------------------------

        const metadata = await parseBlob(song.file);

        const hasMetadata =
          Boolean(metadata.common.title) ||
          Boolean(metadata.common.artist) ||
          Boolean(metadata.common.album);

        const hasAlbumMetadata = Boolean(metadata.common.album);

        // Sin álbum: canción independiente.
        const standaloneAlbumName = metadata.common.title || song.name;

        const album = hasAlbumMetadata
          ? metadata.common.album
          : standaloneAlbumName;

        const albumArtist = hasAlbumMetadata
          ? metadata.common.albumartist || null
          : null;

        const albumId = hasAlbumMetadata
          ? album.toLowerCase().replace(/[^a-z0-9]+/g, "-")
          : `standalone-${song.id}`;

        // -------------------------
        // Album cover
        // -------------------------

        let albumData =
          albumId && albums.value.find((item) => item.id === albumId);

        let coverBlob = null;

        if (!albumData) {
          const picture = hasAlbumMetadata
            ? metadata.common.picture?.[0]
            : null;

          if (picture) {
            coverBlob = new Blob([picture.data], {
              type: picture.format,
            });
          }

          const newAlbum = {
            id: albumId,

            name: album,

            artist: albumArtist || metadata.common.artist || "Unknown",

            cover: coverBlob,
          };

          await db.put("albums", newAlbum);

          albumData = {
            ...newAlbum,

            cover: coverBlob ? URL.createObjectURL(coverBlob) : null,
          };

          albums.value.push(albumData);

          sortAlbums();
        }

        // -------------------------
        // Metadata object
        // -------------------------

        const data = {
          id: song.id,

          cacheVersion: metadataCacheVersion,

          hasMetadata,

          title: metadata.common.title || song.name,

          artist: metadata.common.artist || "Unknown",

          album,

          albumArtist,

          albumId,

          genre: [...(metadata.common.genre ?? [])],

          year: metadata.common.year ?? null,

          track: metadata.common.track?.no ?? null,

          trackTotal: metadata.common.track?.of ?? null,

          disk: metadata.common.disk?.no ?? null,

          diskTotal: metadata.common.disk?.of ?? null,

          composer: [...(metadata.common.composer ?? [])],

          comment: JSON.parse(JSON.stringify(metadata.common.comment ?? [])),

          lyrics: JSON.parse(JSON.stringify(metadata.common.lyrics ?? [])),

          favorite: song.favorite ?? false,

          duration: metadata.format.duration ?? 0,

          bitrate: metadata.format.bitrate ?? 0,

          sampleRate: metadata.format.sampleRate ?? 0,

          channels: metadata.format.numberOfChannels ?? 0,

          codec: metadata.format.codec ?? "",

          container: metadata.format.container ?? "",

          lossless: metadata.format.lossless ?? false,
        };

        // -------------------------
        // Save metadata
        // -------------------------

        await db.put("metadata", data);

        // -------------------------
        // Update song
        // -------------------------

        Object.assign(song, data);

        song.favorite = song.favorite ?? false;

        song.cover = hasAlbumMetadata ? (albumData?.cover ?? null) : null;

        song.metadataLoaded = true;
      } catch (e) {
        console.warn("⚠️ Metadata error for song", song.name, ":", e.message);

        song.title = cleanFileName(song.file?.name || song.name);

        song.artist = "Unknown";

        song.metadataLoaded = false;

        song.favorite = song.favorite ?? false;
      }
    }

    await syncFavoritesPlaylistFromSongs();

    await pruneOrphanedAlbums(db);
  }

  async function pruneOrphanedAlbums(db) {
    const activeAlbumIds = new Set(
      songs.value.map((song) => song.albumId).filter(Boolean),
    );

    const orphanedAlbums = albums.value.filter(
      (album) => !activeAlbumIds.has(album.id),
    );

    for (const album of orphanedAlbums) {
      await db.delete("albums", album.id);

      if (typeof album.cover === "string" && album.cover.startsWith("blob:")) {
        URL.revokeObjectURL(album.cover);
      }
    }

    if (orphanedAlbums.length) {
      albums.value = albums.value.filter((album) =>
        activeAlbumIds.has(album.id),
      );
    }
  }

  async function rebuildLibrary() {
    if (!folderHandle.value) {
      return;
    }

    loading.value = true;

    try {
      for (const album of albums.value) {
        if (album.cover) {
          URL.revokeObjectURL(album.cover);
        }
      }

      songs.value = [];
      albums.value = [];

      await loadAlbums();

      await scanFolder(true);
    } finally {
      loading.value = false;
    }
  }

  // =========================
  // UPDATE SONG METADATA
  // =========================

  async function updateSongMetadata(songId, updatedData) {
    const song = songs.value.find((item) => item.id === songId);

    if (!song) return false;

    const db = await dbPromise;

    // -------------------------
    // Normalize
    // -------------------------

    const title = updatedData.title?.trim() || song.name;

    const artist = updatedData.artist?.trim() || "Unknown";

    const albumName = updatedData.album?.trim() || "";

    const albumArtist = updatedData.albumArtist?.trim() || null;

    let genre = [];

    if (Array.isArray(updatedData.genre)) {
      genre = updatedData.genre;
    } else if (
      typeof updatedData.genre === "string" &&
      updatedData.genre.trim()
    ) {
      genre = updatedData.genre
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }

    const year =
      updatedData.year !== "" &&
      updatedData.year !== null &&
      updatedData.year !== undefined
        ? parseInt(updatedData.year, 10) || null
        : null;

    const track =
      updatedData.track !== "" &&
      updatedData.track !== null &&
      updatedData.track !== undefined
        ? parseInt(updatedData.track, 10) || null
        : null;

    const trackTotal =
      updatedData.trackTotal !== "" &&
      updatedData.trackTotal !== null &&
      updatedData.trackTotal !== undefined
        ? parseInt(updatedData.trackTotal, 10) || null
        : null;

    const disk =
      updatedData.disk !== "" &&
      updatedData.disk !== null &&
      updatedData.disk !== undefined
        ? parseInt(updatedData.disk, 10) || null
        : null;

    const diskTotal =
      updatedData.diskTotal !== "" &&
      updatedData.diskTotal !== null &&
      updatedData.diskTotal !== undefined
        ? parseInt(updatedData.diskTotal, 10) || null
        : null;

    const hasAlbumMetadata = Boolean(albumName);

    const finalAlbum = hasAlbumMetadata ? albumName : title || song.name;

    const albumId = hasAlbumMetadata
      ? finalAlbum.toLowerCase().replace(/[^a-z0-9]+/g, "-")
      : `standalone-${song.id}`;

    const hasMetadata =
      Boolean(updatedData.title?.trim()) ||
      (Boolean(updatedData.artist?.trim()) &&
        updatedData.artist.trim() !== "Unknown") ||
      Boolean(updatedData.album?.trim());

    const previousSongId = song.id;

    // -------------------------
    // Write file metadata
    // -------------------------

    const updatedFile = await writeAudioMetadata(song.fileHandle, {
      ...updatedData,

      title,

      artist,

      albumArtist,

      album: finalAlbum,

      genre,

      year,

      track,

      trackTotal,

      disk,

      diskTotal,

      cover: updatedData.cover || "",

      directoryHandle: song.directoryHandle,
    });

    const nextSongId = updatedFile.name;

    // -------------------------
    // Cover
    // -------------------------

    let cover = song.cover;

    let coverBlob = null;

    if (updatedData.cover !== undefined) {
      cover = updatedData.cover;

      if (updatedData.coverBlob) {
        coverBlob = updatedData.coverBlob;
      }
    }

    // -------------------------
    // Album
    // -------------------------

    let albumData = albums.value.find((album) => album.id === albumId);

    if (!albumData && hasAlbumMetadata) {
      const newAlbum = {
        id: albumId,

        name: finalAlbum,

        artist: albumArtist || artist || "Unknown",

        cover:
          coverBlob ||
          (typeof cover === "string" && !cover.startsWith("blob:")
            ? cover
            : null),
      };

      await db.put("albums", newAlbum);

      albumData = {
        ...newAlbum,

        cover: cover || null,
      };

      albums.value.push(albumData);

      sortAlbums();
    } else if (albumData && cover) {
      if (coverBlob) {
        albumData.cover = cover;

        await db.put("albums", {
          id: albumData.id,

          name: albumData.name,

          artist: albumData.artist,

          cover: coverBlob,
        });
      }
    }

    // -------------------------
    // Metadata persistence
    // -------------------------

    const existingMetadata = await db.get("metadata", previousSongId);

    const metadataToSave = {
      ...(existingMetadata || {}),

      id: nextSongId,

      cacheVersion: metadataCacheVersion,

      hasMetadata,

      title,

      artist,

      album: finalAlbum,

      albumArtist,

      albumId,

      genre,

      year,

      track,

      trackTotal,

      disk,

      diskTotal,

      cover: cover || null,

      favorite: song.favorite ?? false,

      duration: song.duration ?? 0,

      bitrate: song.bitrate ?? 0,

      sampleRate: song.sampleRate ?? 0,

      channels: song.channels ?? 0,

      codec: song.codec ?? "",

      container: song.container ?? "",

      lossless: song.lossless ?? false,
    };

    metadataToSave.cover = sanitizeCoverForStorage(metadataToSave.cover);

    await db.put("metadata", metadataToSave);

    // -------------------------
    // Song ID changed
    // -------------------------

    if (nextSongId !== previousSongId) {
      await db.delete("metadata", previousSongId);

      for (const playlist of playlists.value) {
        if (!Array.isArray(playlist.songIds)) {
          continue;
        }

        playlist.songIds = playlist.songIds.map((id) =>
          id === previousSongId ? nextSongId : id,
        );

        await savePlaylist(playlist);
      }
    }

    // -------------------------
    // Update reactive song
    // -------------------------

    const newName = cleanFileName(nextSongId);

    Object.assign(song, {
      id: nextSongId,

      name: newName,

      file: updatedFile,

      fileHandle: updatedFile.fileHandle || song.fileHandle,

      title,

      artist,

      album: finalAlbum,

      albumArtist,

      albumId,

      genre,

      year,

      track,

      trackTotal,

      disk,

      diskTotal,

      cover,

      hasMetadata,

      metadataLoaded: true,
    });

    if (playingSong.value && playingSong.value.id === song.id) {
      Object.assign(playingSong.value, {
        name: newName,

        title,

        artist,

        album: finalAlbum,

        albumArtist,

        cover,
      });
    }

    await pruneOrphanedAlbums(db);

    return true;
  }

  // =========================
  // RETURN
  // =========================

  return {
    // -------------------------
    // LIBRARY STATE
    // -------------------------

    init,

    switchProfile,

    initialized,

    songs,

    playlists,

    folderHandle,

    historyQueue,

    albums,

    loading,

    // -------------------------
    // PLAYER STATE
    // -------------------------

    playingSong,

    isPlaying,

    currentTime,

    duration,

    volume,

    isNowPlayingOpen,

    openNowPlaying,

    closeNowPlaying,

    toggleNowPlaying,

    // -------------------------
    // ARTISTS
    // -------------------------

    artists,

    getArtistByName,

    parseArtistNames,

    customArtistCovers,

    loadCustomArtistCovers,

    setCustomArtistCover,

    removeCustomArtistCover,

    getArtistCover,

    artistProfiles,

    loadArtistProfiles,

    saveArtistProfile,

    removeArtistProfile,

    getArtistProfile,

    // -------------------------
    // HISTORY
    // -------------------------

    listeningHistory,

    loadHistory,

    addToListeningHistory,

    recordAlbumPlayed,

    recordPlaylistPlayed,

    removeHistoryItem,

    clearListeningHistory,

    clearHistory,

    // -------------------------
    // QUEUE
    // -------------------------

    isQueueOpen,

    openQueue,

    closeQueue,

    toggleQueue,

    removeFromQueue,

    removeSongFromQueue,

    clearQueue,

    clearHistoryQueue,

    addToQueue,

    playNext,

    addSongsToQueue,

    addAlbumToQueue,

    addPlaylistToQueue,

    setPlayQueue,

    moveQueueItem,

    playQueueSong,

    playHistorySong,

    // -------------------------
    // PLAYER ACTIONS
    // -------------------------

    playPreviousSong,

    playNextSong,

    playQueue,

    playSong,

    playFromPlaylist,

    togglePlay,

    getAudioElement: () => audio,

    getAudioAnalyser,

    resumeAudioAnalyser,

    seek,

    // -------------------------
    // FOLDER
    // -------------------------

    selectFolder,

    removeFolder,

    selectFiles,

    rescanLibrary,

    rebuildLibrary,

    sortSongs,

    sortMode,

    updateSongMetadata,

    // -------------------------
    // PLAYLISTS
    // -------------------------

    createPlaylist,

    updatePlaylist,

    addSongToPlaylist,

    removeSongFromPlaylist,

    deletePlaylist,

    reorderPlaylistSongs,

    toggleFavorite,

    isSongInPlaylist,

    FAVORITES_PLAYLIST_ID,
  };
});
