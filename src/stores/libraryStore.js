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

import {
  volumeToDb,
  dbToGain,
  volumeToGain,
  gainToDb,
  dbToVolume,
  gainToVolume,
  formatDb,
  getVolumeIconType,
} from "../lib/volume.js";

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
  const volume = ref(0.7);
  const isMuted = ref(false);

  const currentDb = computed(() => {
    if (isMuted.value) return -Infinity;
    return volumeToDb(volume.value);
  });

  const currentDbFormatted = computed(() => {
    return formatDb(currentDb.value, { isMuted: isMuted.value });
  });

  const effectiveGain = computed(() => {
    if (isMuted.value) return 0;
    return volumeToGain(volume.value);
  });

  const volumeIconType = computed(() => {
    return getVolumeIconType(volume.value, isMuted.value);
  });

  const currentPlaylistId = ref(null);

  const metadataCacheVersion = 4;

  const isNowPlayingOpen = ref(false);
  const isQueueOpen = ref(false);

  // =========================
  // SHUFFLE, AUTOPLAY & RATINGS STATE
  // =========================

  const isShuffleEnabled = ref(false);
  const originalQueueList = ref([]);
  const repeatMode = ref("off"); // 'off' | 'all' | 'one'
  const autoplay = ref(true);

  function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  const songRatings = ref({}); // { [songId]: 'like' | 'dislike' | 'neutral' }
  const playbackEvents = ref([]); // all playback events for current profile
  const currentStatsPeriod = ref("all"); // 'day' | 'week' | 'month' | 'all'

  function createEmptyStatsSummary(profileId = null) {
    return {
      id: `summary_${profileId || "default"}`,
      profileId,
      totalPlays: 0,
      totalListenTime: 0, // in seconds
      songStats: {},
      artistStats: {},
      albumStats: {},
      dayStats: {},
    };
  }

  const profileStatsSummary = ref(createEmptyStatsSummary());

  // Real listening time tracking variables (avoids scrubbing artifacts)
  let currentListeningSongId = null;
  let currentListeningAccumulatedSec = 0;
  let currentSongPlayCounted = false;
  let lastTimeUpdateTimestamp = null;
  let pendingSaveSummaryTimeout = null;

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

    // Al leer los metadatos los artistas SOLAMENTE están separados por comas
    return rawString
      .split(",")
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
  // PLAYBACK STATS & SONG RATINGS
  // =========================

  async function loadStats() {
    const user = useUserStore();
    if (user.isGuest) {
      playbackEvents.value = [];
      profileStatsSummary.value = createEmptyStatsSummary("guest");
      return;
    }

    const currentProfileId = user.currentSession?.profileId;
    if (!currentProfileId) {
      playbackEvents.value = [];
      profileStatsSummary.value = createEmptyStatsSummary(null);
      return;
    }

    try {
      const db = await dbPromise;
      if (db.objectStoreNames.contains("playback_stats")) {
        const allStats = await db.getAll("playback_stats");
        const profileEvents = [];
        let savedSummary = null;

        for (const item of allStats || []) {
          if (item.id === `summary_${currentProfileId}`) {
            savedSummary = item;
          } else if (
            item.profileId === currentProfileId &&
            typeof item.id === "string" &&
            item.id.startsWith("event_")
          ) {
            profileEvents.push(item);
          }
        }

        playbackEvents.value = profileEvents.sort(
          (a, b) => (b.timestamp || 0) - (a.timestamp || 0),
        );

        if (savedSummary) {
          profileStatsSummary.value = {
            ...createEmptyStatsSummary(currentProfileId),
            ...savedSummary,
          };
        } else {
          profileStatsSummary.value = createEmptyStatsSummary(currentProfileId);
        }
      }
    } catch (e) {
      console.warn("⚠️ Error loading stats from db:", e);
      profileStatsSummary.value = createEmptyStatsSummary(currentProfileId);
    }
  }

  async function saveProfileStatsSummary() {
    const user = useUserStore();
    const currentProfileId = user.currentSession?.profileId;
    if (user.isGuest || !currentProfileId || currentProfileId === "guest")
      return;

    try {
      const db = await dbPromise;
      if (db.objectStoreNames.contains("playback_stats")) {
        const summaryToSave = {
          ...toRaw(profileStatsSummary.value),
          id: `summary_${currentProfileId}`,
          profileId: currentProfileId,
          updatedAt: Date.now(),
        };
        await db.put("playback_stats", summaryToSave);
      }
    } catch (err) {
      console.warn("⚠️ Could not save profile stats summary:", err);
    }
  }

  async function loadSongRatings() {
    const user = useUserStore();
    const currentProfileId =
      user.currentSession?.profileId || (user.isGuest ? "guest" : "default");

    const ratingsMap = {};

    if (!user.isGuest && currentProfileId && currentProfileId !== "guest") {
      try {
        const db = await dbPromise;
        if (db.objectStoreNames.contains("song_ratings")) {
          const allRatings = await db.getAll("song_ratings");
          for (const item of allRatings || []) {
            if (item.profileId === currentProfileId && item.songId) {
              ratingsMap[item.songId] = item.rating;
            }
          }
        }
      } catch (err) {
        console.warn("⚠️ Error loading song ratings:", err);
      }
    }

    for (const song of songs.value) {
      song.rating = ratingsMap[song.id] || "neutral";
    }

    songRatings.value = ratingsMap;
  }

  function getSongRating(songId) {
    if (!songId) return "neutral";
    return songRatings.value[songId] || "neutral";
  }

  function isSongLiked(song) {
    if (!song || !song.id) return false;
    return Boolean(song.favorite) || getSongRating(song.id) === "like";
  }

  async function setSongRating(songId, rating) {
    if (!songId) return;
    const normalizedRating =
      rating === "like" || rating === "dislike" ? rating : "neutral";

    songRatings.value = {
      ...songRatings.value,
      [songId]: normalizedRating,
    };

    const song = songs.value.find((s) => s.id === songId);
    if (song) {
      song.rating = normalizedRating;
    }

    if (playingSong.value && playingSong.value.id === songId) {
      playingSong.value.rating = normalizedRating;
    }

    if (normalizedRating === "dislike") {
      playQueue.value = playQueue.value.filter((s) => s.id !== songId);
    }

    const user = useUserStore();
    const currentProfileId = user.currentSession?.profileId;
    if (!user.isGuest && currentProfileId && currentProfileId !== "guest") {
      try {
        const db = await dbPromise;
        if (db.objectStoreNames.contains("song_ratings")) {
          await db.put("song_ratings", {
            id: `${currentProfileId}:${songId}`,
            profileId: currentProfileId,
            songId,
            rating: normalizedRating,
            updatedAt: Date.now(),
          });
        }
      } catch (err) {
        console.warn("⚠️ Could not persist song rating:", err);
      }
    }
  }

  async function toggleLike(song) {
    if (!song?.id) return;
    const current = getSongRating(song.id);
    const next = current === "like" ? "neutral" : "like";
    await setSongRating(song.id, next);
  }

  async function toggleDislike(song) {
    if (!song?.id) return;
    const current = getSongRating(song.id);
    const next = current === "dislike" ? "neutral" : "dislike";
    await setSongRating(song.id, next);
  }

  function getSongStats(songId) {
    if (!songId) return null;
    const sStat = profileStatsSummary.value?.songStats?.[songId];
    return {
      playCount: sStat?.playCount || 0,
      totalListenTime: sStat?.totalListenTime || 0,
      firstPlayedAt: sStat?.firstPlayedAt || null,
      lastPlayedAt: sStat?.lastPlayedAt || null,
    };
  }

  async function recordSongPlay(song, initialListenedSec = 0) {
    if (!song || !song.id) return;
    const user = useUserStore();
    const currentProfileId =
      user.currentSession?.profileId || (user.isGuest ? "guest" : "default");

    const now = Date.now();
    const dateStr = new Date(now).toISOString().slice(0, 10);
    const songId = song.id;
    const title = song.title || song.name || "Sin título";
    const artist = song.artist || "Artista desconocido";
    const album = song.album || "Álbum desconocido";
    const albumId =
      song.albumId ||
      (album
        ? album.toLowerCase().replace(/[^a-z0-9]+/g, "-")
        : `standalone-${songId}`);
    const cover = song.cover || null;

    const summary = profileStatsSummary.value;
    summary.totalPlays = (summary.totalPlays || 0) + 1;

    if (!summary.songStats[songId]) {
      summary.songStats[songId] = {
        songId,
        title,
        artist,
        album,
        albumId,
        cover: sanitizeCoverForStorage(cover),
        playCount: 0,
        totalListenTime: 0,
        firstPlayedAt: now,
        lastPlayedAt: now,
      };
    }
    const sStat = summary.songStats[songId];
    sStat.playCount = (sStat.playCount || 0) + 1;
    sStat.lastPlayedAt = now;
    sStat.title = title;
    sStat.artist = artist;
    sStat.album = album;
    if (!sStat.cover && cover) sStat.cover = sanitizeCoverForStorage(cover);

    const artistNames = parseArtistNames(artist);
    const primaryArtist = artistNames[0] || artist;
    for (const aName of artistNames.length ? artistNames : [primaryArtist]) {
      if (!summary.artistStats[aName]) {
        summary.artistStats[aName] = {
          name: aName,
          playCount: 0,
          totalListenTime: 0,
          lastPlayedAt: now,
        };
      }
      summary.artistStats[aName].playCount =
        (summary.artistStats[aName].playCount || 0) + 1;
      summary.artistStats[aName].lastPlayedAt = now;
    }

    const albumKey = albumId || album;
    if (!summary.albumStats[albumKey]) {
      summary.albumStats[albumKey] = {
        id: albumKey,
        name: album,
        artist: primaryArtist,
        cover: sanitizeCoverForStorage(cover),
        playCount: 0,
        totalListenTime: 0,
        lastPlayedAt: now,
      };
    }
    summary.albumStats[albumKey].playCount =
      (summary.albumStats[albumKey].playCount || 0) + 1;
    summary.albumStats[albumKey].lastPlayedAt = now;
    if (!summary.albumStats[albumKey].cover && cover) {
      summary.albumStats[albumKey].cover = sanitizeCoverForStorage(cover);
    }

    if (!summary.dayStats[dateStr]) {
      summary.dayStats[dateStr] = { date: dateStr, plays: 0, listenTime: 0 };
    }
    summary.dayStats[dateStr].plays =
      (summary.dayStats[dateStr].plays || 0) + 1;

    const event = {
      id: `event_${currentProfileId}_${now}_${Math.random().toString(36).substr(2, 5)}`,
      profileId: currentProfileId,
      songId,
      title,
      artist: primaryArtist,
      artists: artistNames,
      album,
      albumId,
      duration: song.duration || 0,
      listenTime: Math.round(initialListenedSec),
      timestamp: now,
      dateStr,
    };

    playbackEvents.value.unshift(event);
    if (playbackEvents.value.length > 2000) {
      playbackEvents.value = playbackEvents.value.slice(0, 2000);
    }

    addToListeningHistory({
      type: "song",
      itemId: songId,
      title,
      subtitle: artist,
      cover,
      duration: song.duration,
    });

    if (!user.isGuest && currentProfileId && currentProfileId !== "guest") {
      try {
        const db = await dbPromise;
        if (db.objectStoreNames.contains("playback_stats")) {
          await db.put("playback_stats", toRaw(event));
          await saveProfileStatsSummary();
        }
      } catch (err) {
        console.warn("⚠️ Could not save playback event:", err);
      }
    }
  }

  function formatListenTime(seconds) {
    if (!seconds || seconds <= 0) return "0 min";
    const totalMins = Math.round(seconds / 60);
    if (totalMins < 60) {
      return `${totalMins} min`;
    }
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  // `now` es una Date opcional que ancla el periodo a una referencia concreta.
  // Se usa para poder navegar a periodos históricos (día/semana/mes/año
  // anteriores o posteriores) manteniendo la misma lógica de agrupación.
  // Si no se pasa, se usa "ahora" (comportamiento original).
  function generateChartData(events, period, now = new Date()) {
    const buckets = [];
    // Fecha en formato YYYY-MM-DD usando los componentes LOCALES.
    // toISOString() convierte a UTC, lo que desplazaba los días en
    // zonas horarias por delante de UTC (p. ej. España) y hacía que
    // los minutos de "hoy" aparecieran en el día siguiente.
    function toLocalDateStr(d) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    function isSameDay(d1, d2) {
      return (
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate()
      );
    }
    // "Hoy" siempre se refiere a la fecha REAL actual, no al periodo navegado.
    const realNow = new Date();

    if (period === "day") {
      // 1. Todas las 24 horas del día (00h a 23h), resaltando la hora actual
      //    (solo se resalta si el día anclado ES hoy; en días históricos no hay
      //    hora "actual").
      const currentHour = now.getHours();
      const anchoringToday = isSameDay(now, realNow);
      for (let h = 0; h < 24; h++) {
        buckets.push({
          hour: h,
          label: `${String(h).padStart(2, "0")}h`,
          plays: 0,
          minutes: 0,
          isCurrent: anchoringToday && h === currentHour,
        });
      }
      for (const ev of events) {
        const evDate = new Date(ev.timestamp);
        if (isSameDay(evDate, now)) {
          const h = evDate.getHours();
          if (buckets[h]) {
            buckets[h].plays++;
            buckets[h].minutes += Math.round((ev.listenTime || 0) / 60);
          }
        }
      }
    } else if (period === "week") {
      // 2. Semana en orden de Lunes primero a Domingo último; el día actual dice "Hoy"
      const dayNames = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
      const currentDayOfWeek = now.getDay(); // 0 es Domingo, 1 es Lunes
      const mondayOffset = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
      const monday = new Date(now);
      monday.setDate(now.getDate() + mondayOffset);
      monday.setHours(0, 0, 0, 0);
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const isToday = isSameDay(d, realNow);
        const dayStr = toLocalDateStr(d);
        buckets.push({
          label: isToday ? "Hoy" : dayNames[i],
          date: dayStr,
          dayOfMonth: d.getDate(),
          month: d.getMonth(),
          year: d.getFullYear(),
          plays: 0,
          minutes: 0,
          isCurrent: isToday,
        });
      }
      for (const ev of events) {
        const evDate = toLocalDateStr(new Date(ev.timestamp));
        const b = buckets.find((item) => item.date === evDate);
        if (b) {
          b.plays++;
          b.minutes += Math.round((ev.listenTime || 0) / 60);
        }
      }
    } else if (period === "month") {
      // 3. Mes: todos los 28, 29, 30 o 31 días que tenga el mes actual
      const year = now.getFullYear();
      const month = now.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);
        const isToday = isSameDay(d, realNow);
        const dayStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        buckets.push({
          label: isToday ? "Hoy" : String(day),
          date: dayStr,
          dayNumber: day,
          month,
          year,
          plays: 0,
          minutes: 0,
          isCurrent: isToday,
        });
      }
      for (const ev of events) {
        const evDate = new Date(ev.timestamp);
        if (evDate.getFullYear() === year && evDate.getMonth() === month) {
          const day = evDate.getDate();
          if (buckets[day - 1]) {
            buckets[day - 1].plays++;
            buckets[day - 1].minutes += Math.round((ev.listenTime || 0) / 60);
          }
        }
      }
    } else {
      // 4. Año: los 12 meses de Enero a Diciembre, resaltando el mes actual.
      //    Nota: el periodo en la UI es "all"; lo tratamos como año completo.
      const year = now.getFullYear();
      const monthNames = [
        "Ene",
        "Feb",
        "Mar",
        "Abr",
        "May",
        "Jun",
        "Jul",
        "Ago",
        "Sep",
        "Oct",
        "Nov",
        "Dic",
      ];
      for (let m = 0; m < 12; m++) {
        const isCurrent = m === now.getMonth() && isSameDay(now, realNow);
        buckets.push({
          label: monthNames[m],
          monthIndex: m,
          year,
          plays: 0,
          minutes: 0,
          isCurrent,
        });
      }
      for (const ev of events) {
        const evDate = new Date(ev.timestamp);
        if (evDate.getFullYear() === year) {
          const b = buckets[evDate.getMonth()];
          if (b) {
            b.plays++;
            b.minutes += Math.round((ev.listenTime || 0) / 60);
          }
        }
      }
    }

    return buckets;
  }

  // Calcula el rango [start, end) de un periodo concreto anclado a una fecha
  // de referencia. `period` puede ser 'day' | 'week' | 'month' | 'all' (año).
  // Devuelve { start, end, anchor } donde anchor es el inicio del periodo (Date).
  function getPeriodRange(period, reference = new Date()) {
    const anchor = new Date(reference);
    anchor.setHours(0, 0, 0, 0);
    if (period === "day") {
      const start = new Date(anchor);
      const end = new Date(anchor);
      end.setDate(end.getDate() + 1);
      return { start, end, anchor };
    }
    if (period === "week") {
      // Semana de lunes a domingo.
      const dow = anchor.getDay(); // 0 = domingo
      const mondayOffset = dow === 0 ? -6 : 1 - dow;
      const start = new Date(anchor);
      start.setDate(anchor.getDate() + mondayOffset);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      return { start, end, anchor: start };
    }
    if (period === "month") {
      const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
      return { start, end, anchor: start };
    }
    // "all" representa el Año completo.
    const start = new Date(anchor.getFullYear(), 0, 1);
    const end = new Date(anchor.getFullYear() + 1, 0, 1);
    return { start, end, anchor: start };
  }
  // Desplaza la referencia al periodo anterior o siguiente del mismo tipo.
  function shiftPeriod(period, reference, direction) {
    const r = new Date(reference);
    if (direction === -1) {
      if (period === "day") r.setDate(r.getDate() - 1);
      else if (period === "week") r.setDate(r.getDate() - 7);
      else if (period === "month") r.setMonth(r.getMonth() - 1);
      else r.setFullYear(r.getFullYear() - 1);
    } else {
      if (period === "day") r.setDate(r.getDate() + 1);
      else if (period === "week") r.setDate(r.getDate() + 7);
      else if (period === "month") r.setMonth(r.getMonth() + 1);
      else r.setFullYear(r.getFullYear() + 1);
    }
    return r;
  }
  function getProfileStats(period = "all", anchorDate = null) {
    // `anchorDate` es una Date opcional que ancla el periodo (permite navegar
    // a periodos históricos). Si no se pasa, se usa la fecha actual.
    const reference = anchorDate instanceof Date ? new Date(anchorDate) : new Date();
    const { start, end } = getPeriodRange(period, reference);
    const events = playbackEvents.value.filter((e) => {
      const t = e.timestamp || 0;
      return t >= start.getTime() && t < end.getTime();
    });

    let totalPlays = events.length;
    let totalListenTime = 0;

    const songAgg = new Map();
    const artistAgg = new Map();
    const albumAgg = new Map();

    for (const ev of events) {
      const listenTime = Number(ev.listenTime) || 0;
      totalListenTime += listenTime;

      const sId = ev.songId;
      if (sId) {
        if (!songAgg.has(sId)) {
          songAgg.set(sId, {
            id: sId,
            title: ev.title || "Canción",
            artist: ev.artist || "Artista",
            album: ev.album || "",
            cover: null,
            plays: 0,
            listenTime: 0,
            lastPlayedAt: ev.timestamp,
          });
        }
        const item = songAgg.get(sId);
        item.plays++;
        item.listenTime += listenTime;
        if (ev.timestamp > item.lastPlayedAt) item.lastPlayedAt = ev.timestamp;
      }

      const artistNames =
        Array.isArray(ev.artists) && ev.artists.length
          ? ev.artists
          : [ev.artist || "Desconocido"];
      for (const aName of artistNames) {
        if (!aName) continue;
        if (!artistAgg.has(aName)) {
          artistAgg.set(aName, {
            name: aName,
            plays: 0,
            listenTime: 0,
            lastPlayedAt: ev.timestamp,
          });
        }
        const aItem = artistAgg.get(aName);
        aItem.plays++;
        aItem.listenTime += listenTime;
        if (ev.timestamp > aItem.lastPlayedAt)
          aItem.lastPlayedAt = ev.timestamp;
      }

      const albKey = ev.albumId || ev.album;
      if (albKey) {
        if (!albumAgg.has(albKey)) {
          albumAgg.set(albKey, {
            id: albKey,
            name: ev.album || "Álbum",
            artist: ev.artist || "",
            cover: null,
            plays: 0,
            listenTime: 0,
            lastPlayedAt: ev.timestamp,
          });
        }
        const albItem = albumAgg.get(albKey);
        albItem.plays++;
        albItem.listenTime += listenTime;
        if (ev.timestamp > albItem.lastPlayedAt)
          albItem.lastPlayedAt = ev.timestamp;
      }
    }

    if (period === "all" && profileStatsSummary.value && reference.getFullYear() === new Date().getFullYear()) {
      const sum = profileStatsSummary.value;
      if ((sum.totalPlays || 0) > totalPlays) totalPlays = sum.totalPlays;
      if ((sum.totalListenTime || 0) > totalListenTime)
        totalListenTime = sum.totalListenTime;

      if (sum.songStats) {
        for (const [sId, sData] of Object.entries(sum.songStats)) {
          if (!songAgg.has(sId)) {
            songAgg.set(sId, {
              id: sId,
              title: sData.title || "Canción",
              artist: sData.artist || "Artista",
              album: sData.album || "",
              cover: sData.cover || null,
              plays: sData.playCount || 0,
              listenTime: sData.totalListenTime || 0,
              lastPlayedAt: sData.lastPlayedAt || 0,
            });
          } else {
            const item = songAgg.get(sId);
            if ((sData.playCount || 0) > item.plays)
              item.plays = sData.playCount;
            if ((sData.totalListenTime || 0) > item.listenTime)
              item.listenTime = sData.totalListenTime;
          }
        }
      }

      if (sum.artistStats) {
        for (const [aName, aData] of Object.entries(sum.artistStats)) {
          if (!artistAgg.has(aName)) {
            artistAgg.set(aName, {
              name: aName,
              plays: aData.playCount || 0,
              listenTime: aData.totalListenTime || 0,
              lastPlayedAt: aData.lastPlayedAt || 0,
            });
          } else {
            const item = artistAgg.get(aName);
            if ((aData.playCount || 0) > item.plays)
              item.plays = aData.playCount;
            if ((aData.totalListenTime || 0) > item.listenTime)
              item.listenTime = aData.totalListenTime;
          }
        }
      }

      if (sum.albumStats) {
        for (const [albKey, albData] of Object.entries(sum.albumStats)) {
          if (!albumAgg.has(albKey)) {
            albumAgg.set(albKey, {
              id: albKey,
              name: albData.name || "Álbum",
              artist: albData.artist || "",
              cover: albData.cover || null,
              plays: albData.playCount || 0,
              listenTime: albData.totalListenTime || 0,
              lastPlayedAt: albData.lastPlayedAt || 0,
            });
          } else {
            const item = albumAgg.get(albKey);
            if ((albData.playCount || 0) > item.plays)
              item.plays = albData.playCount;
            if ((albData.totalListenTime || 0) > item.listenTime)
              item.listenTime = albData.totalListenTime;
          }
        }
      }
    }

    for (const songItem of songAgg.values()) {
      if (!songItem.cover) {
        const found = songs.value.find((s) => s.id === songItem.id);
        if (found?.cover) songItem.cover = found.cover;
      }
    }
    for (const albItem of albumAgg.values()) {
      if (!albItem.cover) {
        const found = albums.value.find(
          (a) => a.id === albItem.id || a.name === albItem.name,
        );
        if (found?.cover) albItem.cover = found.cover;
      }
    }
    for (const aItem of artistAgg.values()) {
      if (!aItem.cover) {
        let cover = getArtistCover(aItem.name);
        if (!cover) {
          const art = getArtistByName(aItem.name);
          cover = art?.customCover || null;
        }
        if (!cover) {
          const targetKey = normalizeArtistKey(aItem.name);
          const songWithCover = songs.value.find((s) => {
            if (!s.cover) return false;
            const names = parseArtistNames(s.artist);
            return names.some((n) => normalizeArtistKey(n) === targetKey);
          });
          if (songWithCover) cover = songWithCover.cover;
        }
        if (!cover) {
          const targetKey = normalizeArtistKey(aItem.name);
          const albumWithCover = albums.value.find((alb) => {
            if (!alb.cover) return false;
            const names = parseArtistNames(alb.artist);
            return names.some((n) => normalizeArtistKey(n) === targetKey);
          });
          if (albumWithCover) cover = albumWithCover.cover;
        }
        aItem.cover = cover || null;
      }
    }

    const topSongs = Array.from(songAgg.values())
      .sort((a, b) => b.plays - a.plays || b.listenTime - a.listenTime)
      .slice(0, 10)
      .map((s, idx) => ({
        ...s,
        rank: idx + 1,
        listenTimeFormatted: formatListenTime(s.listenTime),
      }));

    const topArtists = Array.from(artistAgg.values())
      .sort((a, b) => b.plays - a.plays || b.listenTime - a.listenTime)
      .slice(0, 10)
      .map((a, idx) => ({
        ...a,
        rank: idx + 1,
        listenTimeFormatted: formatListenTime(a.listenTime),
      }));

    const topAlbums = Array.from(albumAgg.values())
      .sort((a, b) => b.plays - a.plays || b.listenTime - a.listenTime)
      .slice(0, 10)
      .map((alb, idx) => ({
        ...alb,
        rank: idx + 1,
        listenTimeFormatted: formatListenTime(alb.listenTime),
      }));

    const topSong = topSongs[0] || null;
    const topArtist = topArtists[0] || null;
    const topAlbum = topAlbums[0] || null;

    const likedSongsCount = songs.value.filter((s) => isSongLiked(s)).length;

    const recentActivity = events.slice(0, 15).map((ev) => {
      const s = songs.value.find((item) => item.id === ev.songId);
      return {
        id: ev.id,
        songId: ev.songId,
        title: ev.title || s?.title || s?.name || "Canción",
        artist: ev.artist || s?.artist || "Artista desconocido",
        album: ev.album || s?.album || "",
        cover: s?.cover || null,
        timestamp: ev.timestamp,
        listenTime: ev.listenTime,
        listenTimeFormatted: formatListenTime(ev.listenTime),
        duration: ev.duration,
      };
    });

      const chartData = generateChartData(events, period, start);
      return {
        period,
        totalPlays,
        totalListenTime,
        totalListenTimeFormatted: formatListenTime(totalListenTime),
        uniqueSongsCount: songAgg.size,
        uniqueArtistsCount: artistAgg.size,
        uniqueAlbumsCount: albumAgg.size,
        likedSongsCount,
        topSong,
        topArtist,
        topAlbum,
        topSongs,
        topArtists,
        topAlbums,
        recentActivity,
        chartData,
        // Rango del periodo consultado (útil para la navegación histórica).
        periodStart: start.getTime(),
        periodEnd: end.getTime(),
      };
    }

  // =========================
  // SHUFFLE & AUTOPLAY LOGIC
  // =========================

  const AUTOPLAY_MIN_QUEUE_SIZE = 5;

  function fillAutoplayQueue() {
    if (!autoplay.value || !playingSong.value) return;
    if (!songs.value || songs.value.length === 0) return;

    const currentId = playingSong.value?.id;
    const eligibleCount = songs.value.filter(
      (s) => s.id !== currentId && getSongRating(s.id) !== "dislike",
    ).length;

    if (eligibleCount === 0) return;

    const targetSize = Math.min(AUTOPLAY_MIN_QUEUE_SIZE, eligibleCount);

    let safetyAttempts = 0;
    while (playQueue.value.length < targetSize && safetyAttempts < 15) {
      safetyAttempts++;
      const lastSong =
        playQueue.value[playQueue.value.length - 1] || playingSong.value;
      const nextSong = getSmartNextSong(lastSong);
      if (!nextSong) break;

      if (playQueue.value.some((s) => s.id === nextSong.id)) {
        break;
      }

      playQueue.value.push(nextSong);

      if (isShuffleEnabled.value) {
        if (!originalQueueList.value.some((s) => s.id === nextSong.id)) {
          originalQueueList.value.push(nextSong);
        }
      }
    }
  }

  function toggleShuffle() {
    if (isShuffleEnabled.value) {
      // Deactivate shuffle: restore original order of remaining pending songs
      isShuffleEnabled.value = false;
      if (originalQueueList.value.length > 0) {
        const currentPendingIds = new Set(playQueue.value.map((s) => s.id));
        const restored = originalQueueList.value.filter((s) =>
          currentPendingIds.has(s.id),
        );
        const addedWhileShuffled = playQueue.value.filter(
          (s) => !originalQueueList.value.some((o) => o.id === s.id),
        );
        playQueue.value = [...restored, ...addedWhileShuffled];
        originalQueueList.value = [];
      }
    } else {
      // Activate shuffle: snapshot current queue order and shuffle pending tracks
      isShuffleEnabled.value = true;
      if (playQueue.value.length > 1) {
        originalQueueList.value = [...playQueue.value];
        playQueue.value = shuffleArray(playQueue.value);
      }
    }
  }

  function toggleRepeat() {
    if (repeatMode.value === "off") {
      repeatMode.value = "all";
    } else if (repeatMode.value === "all") {
      repeatMode.value = "one";
    } else {
      repeatMode.value = "off";
    }
  }

  function toggleAutoplay() {
    autoplay.value = !autoplay.value;
    try {
      const user = useUserStore();
      if (user.loaded && !user.isGuest) {
        user.updateProfile({ autoplay: autoplay.value });
      }
    } catch {}

    if (autoplay.value) {
      fillAutoplayQueue();
    }
  }

  function getSmartNextSong(referenceSong = playingSong.value) {
    if (!songs.value || songs.value.length === 0) return null;

    const queueIds = new Set((playQueue.value || []).map((s) => s.id));
    const currentPlayingId = playingSong.value?.id;

    // 1. Strictly exclude disliked songs
    // 2. Exclude currently playing song and songs already in upcoming queue
    let candidates = songs.value.filter((s) => {
      if (getSongRating(s.id) === "dislike") return false;
      if (currentPlayingId && s.id === currentPlayingId) return false;
      if (queueIds.has(s.id)) return false;
      return true;
    });

    if (candidates.length === 0) {
      candidates = songs.value.filter((s) => {
        if (getSongRating(s.id) === "dislike") return false;
        if (currentPlayingId && s.id === currentPlayingId) return false;
        return true;
      });
    }

    if (candidates.length === 0) return null;

    // ----------------------------------------------------
    // User Likes Data: songs with Heart (favorite) or Thumbs Up (like)
    // ----------------------------------------------------
    const allLikedSongs = songs.value.filter(
      (s) => isSongLiked(s) && getSongRating(s.id) !== "dislike",
    );

    const likedArtistSet = new Set(
      allLikedSongs
        .flatMap((s) => parseArtistNames(s.artist).map(normalizeArtistKey))
        .filter(Boolean),
    );

    const likedAlbumSet = new Set(
      allLikedSongs
        .map((s) => (s.albumId || s.album || "").toLowerCase())
        .filter(Boolean),
    );

    // ----------------------------------------------------
    // Context: Last song and queued songs to enforce variety & prevent consecutive tracks
    // ----------------------------------------------------
    const activeQueue = playQueue.value || [];
    const lastTrack =
      referenceSong || activeQueue[activeQueue.length - 1] || playingSong.value;

    const lastAlbumKey = (
      lastTrack?.albumId ||
      lastTrack?.album ||
      ""
    ).toLowerCase();
    const lastArtistKeys = parseArtistNames(lastTrack?.artist).map(
      normalizeArtistKey,
    );
    const lastTrackNumber = Number(lastTrack?.track) || null;

    const lastSongIndex = lastTrack?.id
      ? songs.value.findIndex((s) => s.id === lastTrack.id)
      : -1;

    // Count how many times each album or artist appears in the queue
    const queueAlbumsCount = new Map();
    const queueArtistsCount = new Map();
    for (const qSong of activeQueue) {
      const alb = (qSong.albumId || qSong.album || "").toLowerCase();
      if (alb) {
        queueAlbumsCount.set(alb, (queueAlbumsCount.get(alb) || 0) + 1);
      }
      for (const aName of parseArtistNames(qSong.artist).map(
        normalizeArtistKey,
      )) {
        queueArtistsCount.set(aName, (queueArtistsCount.get(aName) || 0) + 1);
      }
    }

    // ----------------------------------------------------
    // Listening History: avoid repeating recently heard tracks
    // ----------------------------------------------------
    const recentHistoryIds = (listeningHistory.value || [])
      .slice(0, 30)
      .map((h) => h.itemId);
    const recentQueueHistoryIds = (historyQueue.value || [])
      .slice(-15)
      .map((s) => s.id);
    const recentPlayedList = [
      ...recentQueueHistoryIds.reverse(),
      ...recentHistoryIds,
    ];

    // ----------------------------------------------------
    // Calculate Weights (Higher weight = higher random probability based on likes)
    // ----------------------------------------------------
    const weightedCandidates = candidates.map((song) => {
      let weight = 15; // Base neutral discovery weight

      const songLiked = isSongLiked(song);
      const songArtistKeys = parseArtistNames(song.artist).map(
        normalizeArtistKey,
      );
      const songAlbumKey = (song.albumId || song.album || "").toLowerCase();
      const songTrackNumber = Number(song.track) || null;

      // 1. MASSIVE PRIORITY TO USER LIKES
      if (songLiked) {
        weight += 140; // Direct like (Heart or Thumbs Up)
      } else if (songArtistKeys.some((a) => likedArtistSet.has(a))) {
        weight += 45; // Artist of a liked song
      } else if (songAlbumKey && likedAlbumSet.has(songAlbumKey)) {
        weight += 25; // Album that contains liked songs
      }

      // 2. PLAY COUNT & ENGAGEMENT BONUS
      const sStat = profileStatsSummary.value?.songStats?.[song.id];
      if (sStat?.playCount) {
        weight += Math.min(30, sStat.playCount * 6);
      }

      // 3. RECENCY PENALTY (don't repeat tracks played recently)
      const recentIndex = recentPlayedList.indexOf(song.id);
      if (recentIndex !== -1) {
        if (recentIndex < 3) {
          weight *= 0.05;
        } else if (recentIndex < 10) {
          weight *= 0.25;
        } else {
          weight *= 0.6;
        }
      }

      // 4. ANTI-CONSECUTIVE & ANTI-CLUSTERING PENALTIES
      // Never pick consecutive tracks from the same album!
      if (lastAlbumKey && songAlbumKey && lastAlbumKey === songAlbumKey) {
        let isConsecutive = false;

        // Check track numbers (e.g. track 2 following track 1)
        if (
          lastTrackNumber !== null &&
          songTrackNumber !== null &&
          Math.abs(songTrackNumber - lastTrackNumber) === 1
        ) {
          isConsecutive = true;
        }

        // Check adjacent position in the scanned songs list
        if (!isConsecutive && lastSongIndex !== -1) {
          const candidateIndex = songs.value.findIndex((s) => s.id === song.id);
          if (
            candidateIndex !== -1 &&
            Math.abs(candidateIndex - lastSongIndex) === 1
          ) {
            isConsecutive = true;
          }
        }

        if (isConsecutive) {
          weight *= 0.01; // 99% penalty: virtually eliminates consecutive track order
        } else {
          weight *= 0.12; // Same album penalty: strongly prefer different albums
        }
      }

      // Same artist penalty as the preceding track
      if (
        songArtistKeys.length &&
        lastArtistKeys.some((la) => songArtistKeys.includes(la))
      ) {
        weight *= 0.25; // Prefer alternating artists
      }

      // Queue diversity penalty: avoid clustering multiple tracks from same album/artist
      if (songAlbumKey && (queueAlbumsCount.get(songAlbumKey) || 0) >= 1) {
        weight *= 0.35;
      }
      for (const aKey of songArtistKeys) {
        if ((queueArtistsCount.get(aKey) || 0) >= 1) {
          weight *= 0.45;
          break;
        }
      }

      // Subtle random jitter
      weight = Math.max(0.1, weight + Math.random() * 5);

      return { song, weight };
    });

    // ----------------------------------------------------
    // Weighted Random Roulette Selection (Pure randomness based on likes)
    // ----------------------------------------------------
    const totalWeight = weightedCandidates.reduce(
      (sum, item) => sum + item.weight,
      0,
    );

    if (totalWeight <= 0) {
      const idx = Math.floor(Math.random() * candidates.length);
      return candidates[idx];
    }

    const randomVal = Math.random() * totalWeight;
    let runningSum = 0;
    for (const item of weightedCandidates) {
      runningSum += item.weight;
      if (runningSum >= randomVal) {
        return item.song;
      }
    }

    return (
      weightedCandidates[weightedCandidates.length - 1]?.song ||
      candidates[0] ||
      null
    );
  }

  function smartShuffle(songsList) {
    const source = Array.isArray(songsList) ? songsList : songs.value || [];
    const eligible = source.filter((s) => getSongRating(s.id) !== "dislike");
    if (eligible.length <= 1) return [...eligible];

    const scored = eligible.map((song) => ({
      song,
      weight: isSongLiked(song) ? 3 : 1,
      random: Math.random(),
    }));

    scored.sort((a, b) => b.weight * b.random - a.weight * a.random);

    const pool = scored.map((item) => item.song);
    const result = [];

    while (pool.length > 0) {
      const lastArtist = result[result.length - 1]?.artist?.toLowerCase();
      let bestIndex = 0;
      if (lastArtist && pool.length > 1) {
        const diffIndex = pool.findIndex(
          (s) => (s.artist || "").toLowerCase() !== lastArtist,
        );
        if (diffIndex !== -1) {
          bestIndex = diffIndex;
        }
      }
      result.push(pool.splice(bestIndex, 1)[0]);
    }

    return result;
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
      const [removed] = playQueue.value.splice(index, 1);
      if (removed && isShuffleEnabled.value) {
        originalQueueList.value = originalQueueList.value.filter(
          (s) => s.id !== removed.id,
        );
      }
    }
  }

  function removeSongFromQueue(songId) {
    if (!songId) return;
    playQueue.value = playQueue.value.filter((song) => song.id !== songId);
    if (isShuffleEnabled.value) {
      originalQueueList.value = originalQueueList.value.filter(
        (song) => song.id !== songId,
      );
    }
  }

  function clearQueue() {
    playQueue.value = [];
    originalQueueList.value = [];
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
    if (isShuffleEnabled.value) {
      if (!originalQueueList.value.some((item) => item.id === song.id)) {
        originalQueueList.value.push(song);
      }
    }
  }

  function playNext(song) {
    if (!song || !song.id) return;
    playQueue.value = [
      song,
      ...playQueue.value.filter((item) => item.id !== song.id),
    ];
    if (isShuffleEnabled.value) {
      originalQueueList.value = [
        song,
        ...originalQueueList.value.filter((item) => item.id !== song.id),
      ];
    }
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
      if (isShuffleEnabled.value) {
        originalQueueList.value.push(...toAdd);
        playQueue.value.push(...shuffleArray(toAdd));
      } else {
        playQueue.value.push(...toAdd);
      }
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
    const cleanList = dedupeById(songsList).filter(
      (s) => getSongRating(s.id) !== "dislike",
    );
    if (isShuffleEnabled.value) {
      originalQueueList.value = [...cleanList];
      playQueue.value = shuffleArray(cleanList);
    } else {
      playQueue.value = cleanList;
      originalQueueList.value = [];
    }
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

    const [targetSong] = playQueue.value.splice(index, 1);

    if (isShuffleEnabled.value && targetSong) {
      originalQueueList.value = originalQueueList.value.filter(
        (s) => !targetSong.id || s.id !== targetSong.id,
      );
    }

    if (targetSong) {
      playSong(targetSong, false);
    }
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
        isShuffleEnabled: Boolean(isShuffleEnabled.value),
        originalQueueIds: (originalQueueList.value || [])
          .map((s) => s.id)
          .filter(Boolean),
        autoplay: Boolean(autoplay.value),
        repeatMode: String(repeatMode.value || "off"),
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

      if (typeof state.isShuffleEnabled === "boolean") {
        isShuffleEnabled.value = state.isShuffleEnabled;
      }

      if (
        Array.isArray(state.originalQueueIds) &&
        state.originalQueueIds.length
      ) {
        originalQueueList.value = state.originalQueueIds
          .map((id) => songs.value.find((s) => s.id === id))
          .filter(Boolean);
      }

      if (typeof state.autoplay === "boolean") {
        autoplay.value = state.autoplay;
      }

      if (typeof state.repeatMode === "string") {
        repeatMode.value = state.repeatMode;
      }

      if (autoplay.value && playingSong.value) {
        fillAutoplayQueue();
      }
    } catch (e) {
      console.warn("Could not restore queue state:", e);
    }
  }

  watch(
    [
      playingSong,
      playQueue,
      historyQueue,
      isShuffleEnabled,
      originalQueueList,
      autoplay,
      repeatMode,
    ],
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

      await loadSongRatings();
      await loadStats();
      await loadHistory();
      await loadCustomArtistCovers();
      await loadArtistProfiles();

      const user = useUserStore();
      if (user.loaded && user.profile.autoplay !== undefined) {
        autoplay.value = Boolean(user.profile.autoplay);
      }

      restoreQueueState();
    } catch (e) {
      console.warn("⚠️ Error during init:", e);
    } finally {
      initialized.value = true;
    }
  }

  async function switchProfile() {
    flushCurrentListeningSession();
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
    songRatings.value = {};
    playbackEvents.value = [];
    profileStatsSummary.value = createEmptyStatsSummary(null);
    customArtistCovers.value = {};
    artistProfiles.value = {};

    currentListeningSongId = null;
    currentListeningAccumulatedSec = 0;
    currentSongPlayCounted = false;
    lastTimeUpdateTimestamp = null;
    isShuffleEnabled.value = false;
    originalQueueList.value = [];

    const user = useUserStore();
    if (user.hasSession) {
      if (user.loaded && user.profile.autoplay !== undefined) {
        autoplay.value = Boolean(user.profile.autoplay);
      }
      await loadPlaylists();
      await loadHistory();
      await loadCustomArtistCovers();
      await loadArtistProfiles();
      await loadSavedFolder(false);

      if (folderHandle.value) {
        await loadAlbums();
        await scanFolder();
      }

      await loadSongRatings();
      await loadStats();
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
  // AUDIO ENGINE & WEB AUDIO GRAPH
  // Audio element -> MediaElementSource -> GainNode -> AnalyserNode -> AudioContext Destination
  // =========================

  const audio = new Audio();

  let audioContext = null;
  let audioAnalyser = null;
  let audioSource = null;
  let audioGainNode = null;

  function initAudioEngine() {
    if (audioContext) {
      return audioAnalyser;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }

    try {
      audioContext = new AudioContextClass();
      audioSource = audioContext.createMediaElementSource(audio);
      audioGainNode = audioContext.createGain();
      audioAnalyser = audioContext.createAnalyser();

      audioAnalyser.fftSize = 256;
      audioAnalyser.smoothingTimeConstant = 0.78;

      // Audio element -> MediaElementSource -> GainNode -> AnalyserNode -> Destination
      audioSource.connect(audioGainNode);
      audioGainNode.connect(audioAnalyser);
      audioAnalyser.connect(audioContext.destination);

      applyAudioGain();
    } catch (e) {
      console.warn("⚠️ Web Audio init error:", e);
    }

    return audioAnalyser;
  }

  function getAudioAnalyser() {
    if (audioAnalyser) {
      return audioAnalyser;
    }
    return initAudioEngine();
  }

  function resumeAudioAnalyser() {
    if (!audioContext) {
      initAudioEngine();
    }
    return audioContext?.state === "suspended"
      ? audioContext.resume()
      : Promise.resolve();
  }

  // =========================
  // AUDIO EVENTS & PLAYBACK TRACKING
  // =========================

  function addRealListeningTime(deltaSec) {
    if (deltaSec <= 0) return;
    const summary = profileStatsSummary.value;
    summary.totalListenTime = (summary.totalListenTime || 0) + deltaSec;

    if (playingSong.value?.id) {
      const sId = playingSong.value.id;
      if (summary.songStats[sId]) {
        summary.songStats[sId].totalListenTime =
          (summary.songStats[sId].totalListenTime || 0) + deltaSec;
      }
      const artistNames = parseArtistNames(playingSong.value.artist);
      const primaryArtist = artistNames[0] || playingSong.value.artist;
      for (const aName of artistNames.length ? artistNames : [primaryArtist]) {
        if (summary.artistStats[aName]) {
          summary.artistStats[aName].totalListenTime =
            (summary.artistStats[aName].totalListenTime || 0) + deltaSec;
        }
      }
      const albumKey = playingSong.value.albumId || playingSong.value.album;
      if (albumKey && summary.albumStats[albumKey]) {
        summary.albumStats[albumKey].totalListenTime =
          (summary.albumStats[albumKey].totalListenTime || 0) + deltaSec;
      }
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    if (!summary.dayStats[dateStr]) {
      summary.dayStats[dateStr] = { date: dateStr, plays: 0, listenTime: 0 };
    }
    summary.dayStats[dateStr].listenTime =
      (summary.dayStats[dateStr].listenTime || 0) + deltaSec;

    scheduleSaveStatsSummary();
  }

  function scheduleSaveStatsSummary() {
    if (pendingSaveSummaryTimeout) return;
    pendingSaveSummaryTimeout = setTimeout(() => {
      pendingSaveSummaryTimeout = null;
      saveProfileStatsSummary();
    }, 8000);
  }

  function checkPlayCountThreshold() {
    if (currentSongPlayCounted || !playingSong.value) return;
    const dur = duration.value || playingSong.value.duration || 0;
    // Count play if at least 30 seconds or 50% for shorter tracks (minimum 8 seconds)
    const threshold = dur > 0 ? Math.min(30, Math.max(8, dur * 0.5)) : 30;

    if (currentListeningAccumulatedSec >= threshold) {
      currentSongPlayCounted = true;
      recordSongPlay(playingSong.value, currentListeningAccumulatedSec);
    }
  }

  function flushCurrentListeningSession() {
    if (lastTimeUpdateTimestamp !== null) {
      const delta = (performance.now() - lastTimeUpdateTimestamp) / 1000;
      if (delta > 0 && delta < 10) {
        currentListeningAccumulatedSec += delta;
        addRealListeningTime(delta);
      }
      lastTimeUpdateTimestamp = null;
    }

    if (
      !currentSongPlayCounted &&
      playingSong.value &&
      currentListeningAccumulatedSec >= 25
    ) {
      currentSongPlayCounted = true;
      recordSongPlay(playingSong.value, currentListeningAccumulatedSec);
    }
  }

  audio.addEventListener("play", () => {
    isPlaying.value = true;
    lastTimeUpdateTimestamp = performance.now();
    if (!audioContext) {
      initAudioEngine();
    }
    resumeAudioAnalyser();
    applyAudioGain();
  });

  audio.addEventListener("pause", () => {
    isPlaying.value = false;
    if (lastTimeUpdateTimestamp !== null) {
      const delta = (performance.now() - lastTimeUpdateTimestamp) / 1000;
      if (delta > 0 && delta < 10) {
        currentListeningAccumulatedSec += delta;
        addRealListeningTime(delta);
      }
      lastTimeUpdateTimestamp = null;
    }
  });

  audio.addEventListener("timeupdate", () => {
    currentTime.value = audio.currentTime;
    if (!audio.paused && isPlaying.value) {
      const now = performance.now();
      if (lastTimeUpdateTimestamp !== null) {
        const delta = (now - lastTimeUpdateTimestamp) / 1000;
        // Cap delta at 1.5s to filter scrubbing and tab backgrounding spikes
        if (delta > 0 && delta < 1.5) {
          currentListeningAccumulatedSec += delta;
          addRealListeningTime(delta);
        }
      }
      lastTimeUpdateTimestamp = now;
      checkPlayCountThreshold();
    }
  });

  audio.addEventListener("loadedmetadata", () => {
    duration.value = audio.duration;
  });

  audio.addEventListener("ended", () => {
    if (
      !currentSongPlayCounted &&
      playingSong.value &&
      currentListeningAccumulatedSec >= 5
    ) {
      currentSongPlayCounted = true;
      recordSongPlay(playingSong.value, currentListeningAccumulatedSec);
    }
    flushCurrentListeningSession();

    if (repeatMode.value === "one") {
      audio.currentTime = 0;
      audio.play().catch(console.error);
      return;
    }

    playNextSong();
  });

  // =========================
  // VOLUME & MUTE
  // =========================

  const VOLUME_STORAGE_KEY = "calliope:volume";
  const VOLUME_MUTED_STORAGE_KEY = "calliope:volume_muted";

  function applyAudioGain() {
    const gain = isMuted.value ? 0 : volumeToGain(volume.value);

    // 1. Direct HTMLAudioElement volume & muted
    try {
      audio.volume = Math.max(0, Math.min(1, gain));
      audio.muted = isMuted.value;
    } catch (e) {
      console.warn("Could not set audio.volume:", e);
    }

    // 2. Web Audio API GainNode (with smooth 15ms linear ramp to eliminate clicks)
    if (audioGainNode && audioContext) {
      try {
        const now = audioContext.currentTime;
        audioGainNode.gain.cancelScheduledValues(now);
        audioGainNode.gain.setValueAtTime(audioGainNode.gain.value, now);
        audioGainNode.gain.linearRampToValueAtTime(gain, now + 0.015);
      } catch (e) {
        audioGainNode.gain.value = gain;
      }
    }
  }

  function loadSavedVolume() {
    try {
      const saved = localStorage.getItem(VOLUME_STORAGE_KEY);
      if (saved !== null) {
        const parsed = Number(saved);
        if (Number.isFinite(parsed)) {
          volume.value = Math.min(1, Math.max(0, parsed));
        }
      }

      const savedMuted = localStorage.getItem(VOLUME_MUTED_STORAGE_KEY);
      if (savedMuted !== null) {
        isMuted.value = savedMuted === "true";
      }

      applyAudioGain();
    } catch (error) {
      console.warn("⚠️ Could not load saved volume:", error);
    }
  }

  function saveVolume(value) {
    try {
      const normalized = Math.min(1, Math.max(0, Number(value) || 0));
      localStorage.setItem(VOLUME_STORAGE_KEY, String(normalized));
    } catch (error) {
      console.warn("⚠️ Could not save volume:", error);
    }
  }

  function saveMuted(muted) {
    try {
      localStorage.setItem(VOLUME_MUTED_STORAGE_KEY, String(muted));
    } catch (error) {
      console.warn("⚠️ Could not save volume mute state:", error);
    }
  }

  function setVolume(value) {
    const normalized = Math.min(1, Math.max(0, Number(value) || 0));
    volume.value = normalized;

    // Moving volume above 0 automatically unmutes
    if (isMuted.value && normalized > 0) {
      isMuted.value = false;
      saveMuted(false);
    }

    applyAudioGain();
    saveVolume(normalized);
  }

  function setVolumeDb(db) {
    const v = dbToVolume(db);
    setVolume(v);
  }

  function toggleMute() {
    isMuted.value = !isMuted.value;
    if (!isMuted.value && volume.value <= 0.005) {
      volume.value = 0.5;
      saveVolume(0.5);
    }
    applyAudioGain();
    saveMuted(isMuted.value);
  }

  function stepVolume(delta) {
    setVolume(volume.value + delta);
  }

  watch(volume, (value) => {
    saveVolume(value);
    applyAudioGain();
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

    if (playingSong.value && playingSong.value.id === song.id) {
      playingSong.value.favorite = nextFavorite;
    }

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

    const remaining = songsList
      .slice(currentIndex + 1)
      .filter((s) => getSongRating(s.id) !== "dislike");

    if (isShuffleEnabled.value) {
      originalQueueList.value = [...remaining];
      playQueue.value = shuffleArray(remaining);
    } else {
      playQueue.value = remaining;
      originalQueueList.value = [];
    }

    playSong(song, false);
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

    // Finalize listening tracker of previous track before switching
    flushCurrentListeningSession();

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

    // Remove any disliked tracks from the active queue
    playQueue.value = dedupeById(
      playQueue.value.filter((item) => getSongRating(item?.id) !== "dislike"),
    );

    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
    }

    currentUrl = URL.createObjectURL(song.file);

    audio.src = currentUrl;

    currentTime.value = 0;

    audio.play().catch((err) => {
      console.error(err);
    });

    if (song.rating === undefined) {
      song.rating = getSongRating(song.id);
    }

    playingSong.value = song;

    // Reset real-time listening trackers for this track
    currentListeningSongId = song.id;
    currentListeningAccumulatedSec = 0;
    currentSongPlayCounted = false;
    lastTimeUpdateTimestamp = performance.now();

    if (autoplay.value) {
      fillAutoplayQueue();
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
    // 1. Purge any disliked songs from queue
    playQueue.value = playQueue.value.filter(
      (s) => getSongRating(s.id) !== "dislike",
    );

    let nextSong = playQueue.value.shift();

    if (nextSong && isShuffleEnabled.value) {
      originalQueueList.value = originalQueueList.value.filter(
        (s) => s.id !== nextSong.id,
      );
    }

    // 2. If queue ended and autoplay active, select next song using smart queue
    if (!nextSong && autoplay.value) {
      fillAutoplayQueue();
      nextSong = playQueue.value.shift();
      if (nextSong && isShuffleEnabled.value) {
        originalQueueList.value = originalQueueList.value.filter(
          (s) => s.id !== nextSong.id,
        );
      }
    }

    if (!nextSong) {
      isPlaying.value = false;
      return;
    }

    playSong(nextSong, false);
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

    // -------------------------
    // SHUFFLE & REPEAT
    // -------------------------

    isShuffleEnabled,

    toggleShuffle,

    repeatMode,

    toggleRepeat,

    // -------------------------
    // AUTOPLAY, RATINGS & STATS
    // -------------------------

    autoplay,

    toggleAutoplay,

    fillAutoplayQueue,

    getSmartNextSong,

    smartShuffle,

    songRatings,

    getSongRating,

    isSongLiked,

    setSongRating,

    toggleLike,

    toggleDislike,

    playbackEvents,

    profileStatsSummary,

    currentStatsPeriod,

    loadStats,

    loadSongRatings,

    getSongStats,

    getProfileStats,
    getPeriodRange,
    shiftPeriod,
    formatListenTime,

    // -------------------------
    // VOLUME & MUTE
    // -------------------------

    volume,

    isMuted,

    currentDb,

    currentDbFormatted,

    effectiveGain,

    volumeIconType,

    setVolume,

    setVolumeDb,

    toggleMute,

    stepVolume,

    volumeToDb,

    dbToGain,

    formatDb,

    FAVORITES_PLAYLIST_ID,
  };
});
