import { defineStore } from "pinia";
import { ref, watch, toRaw } from "vue";
import { parseBlob } from "music-metadata"; // ✅ CORREGIDO: Error sintáctico original - parseBlob ahora importado correctamente
import { dbPromise } from "../lib/db";
import { writeAudioMetadata } from "../services/audioTagWriter.js";
import { readFormat } from "taglib-wasm/simple";

export const useLibraryStore = defineStore("library", () => {

  const FAVORITES_PLAYLIST_ID = "favorites";

  // =========================
  // STATE
  // =========================
  const initialized = ref(false)
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

  function songIdForFile(file) {
    return file.name;
  }


  
  // =========================
  // INITIALIZATION
  // =========================

  async function init() {
    await loadAlbums();
    await loadPlaylists();
    await ensureFavoritesPlaylist();
    await loadSavedFolder();

    initialized.value = true

  }

  async function loadAlbums() {
    const db = await dbPromise;

    const data = await db.getAll("albums");

    albums.value = data.map(album => ({
      ...album,
      cover: toCoverUrl(album.cover),
      _urlCreated: isBinaryCover(album.cover) ? true : null
    }));

    sortAlbums();
  }

  function isBinaryCover(cover) {
    return cover instanceof Blob || cover instanceof File;
  }

  function toCoverUrl(cover) {
    if (!cover) return null;
    if (typeof cover === "string") return cover;
    return isBinaryCover(cover) ? URL.createObjectURL(cover) : null;
  }

  async function loadSavedFolder() {
    const db = await dbPromise;

    const savedHandle = await db.get("settings", "music-folder");

    if (!savedHandle) return;

    const permission = await savedHandle.queryPermission({ mode: "read" });

    if (permission !== "granted") {
      const newPermission = await savedHandle.requestPermission({ mode: "read" });
      if (newPermission !== "granted") return;
    }

    folderHandle.value = savedHandle;

    await scanFolder(); // 👈 aquí empieza todo lo pesado
  }

  async function loadPlaylists() {

    const db = await dbPromise;

    playlists.value =
      await db.getAll("playlists");

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
    if (audioAnalyser) return audioAnalyser;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

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

  // sincronizar estado real del audio
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

  audio.addEventListener(
    "ended",
    () => {
      playNextSong();
    }
  );
  // =========================
  // VOLUME PERSISTENCE
  // =========================
  const savedVolume = localStorage.getItem("volume");

  if (savedVolume !== null) {
    volume.value = parseFloat(savedVolume);
    audio.volume = volume.value;
  }

  watch(volume, (v) => {
    audio.volume = v;
    localStorage.setItem("volume", v);
  });


  //=========
  // Playlist management
  //=========



  async function ensureFavoritesPlaylist() {
    const existing = playlists.value.find((playlist) => playlist.id === FAVORITES_PLAYLIST_ID);

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
      songIds: []
    };

    playlists.value = [playlist, ...playlists.value.filter((item) => item.id !== FAVORITES_PLAYLIST_ID)];
    await savePlaylist(playlist);

    return playlist;
  }

  async function createPlaylist({ name, cover }) {

    const playlist = {
      id: crypto.randomUUID(),
      name: name.trim(),
      cover: cover?.trim() || null,
      songIds: []
    };

    playlists.value.push(playlist);

    await savePlaylist(playlist);

  }

  async function updatePlaylist(id, { name, cover }) {

    if (id === FAVORITES_PLAYLIST_ID) return;

    const playlist = playlists.value.find(
      item => item.id === id
    );

    if (!playlist || !name.trim()) return;

    playlist.name = name.trim();
    playlist.cover = cover?.trim() || null;

    await savePlaylist(playlist);
  }

  async function savePlaylist(playlist) {

    const db = await dbPromise;

    await db.put(
      "playlists",
      JSON.parse(JSON.stringify(toRaw(playlist)))
    );
  }

  async function addSongToPlaylist(
    playlistId,
    songId
  ) {

    const playlist =
      playlists.value.find(
        p => p.id === playlistId
      );

    if (!playlist) return;

    if (!playlist.songIds) {
      playlist.songIds = [];
    }

    if (
      playlist.songIds.includes(songId)
    ) return;

    playlist.songIds.push(songId);

    await savePlaylist(playlist);

  }

  async function removeSongFromPlaylist(playlistId, songId) {
    const playlist = playlists.value.find((p) => p.id === playlistId);

    if (!playlist || !Array.isArray(playlist.songIds)) return;

    playlist.songIds = playlist.songIds.filter((id) => id !== songId);

    await savePlaylist(playlist);
  }

  async function deletePlaylist(playlistId) {
    if (playlistId === FAVORITES_PLAYLIST_ID) return;

    const playlist = playlists.value.find((p) => p.id === playlistId);

    if (!playlist) return;

    playlists.value = playlists.value.filter((p) => p.id !== playlistId);

    const db = await dbPromise;
    await db.delete("playlists", playlistId);
  }

  async function reorderPlaylistSongs(playlistId, songIds) {
    if (playlistId === FAVORITES_PLAYLIST_ID) return;

    const playlist = playlists.value.find((p) => p.id === playlistId);

    if (!playlist) return;

    playlist.songIds = songIds;
    await savePlaylist(playlist);
  }

  async function syncFavoritesPlaylistFromSongs() {
    const favoritesPlaylist = playlists.value.find((playlist) => playlist.id === FAVORITES_PLAYLIST_ID);

    if (!favoritesPlaylist) return null;

    const favoriteSongIds = dedupeById(
      songs.value
        .filter((song) => song.favorite)
        .map((song) => song.id)
    );

    const existingIds = Array.isArray(favoritesPlaylist.songIds)
      ? favoritesPlaylist.songIds.filter((id) => favoriteSongIds.includes(id))
      : [];

    const nextSongIds = dedupeById([
      ...existingIds,
      ...favoriteSongIds.filter((id) => !existingIds.includes(id))
    ]);

    if (JSON.stringify(favoritesPlaylist.songIds || []) !== JSON.stringify(nextSongIds)) {
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
      favorite: nextFavorite
    });

    await ensureFavoritesPlaylist();
    await syncFavoritesPlaylistFromSongs();
  }

  function isSongInPlaylist(
    playlistId,
    songId
  ) {

    const playlist =
      playlists.value.find(
        p => p.id === playlistId
      );

    if (!playlist) return false;

    return (
      playlist.songIds ?? []
    ).includes(songId);
  }
  // =========================
  // PLAYER ACTIONS
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

  function playFromPlaylist(song, songsList) {

    const currentIndex =
      songsList.findIndex(
        s => s.id === song.id
      );

    playQueue.value =
      songsList.slice(currentIndex + 1);

    playSong(song);
  }

  function playSong(
    song,
    addToHistory = true,
    options = {}
  ) {
    const { removeFromQueue = false } = options;

    if (
      addToHistory &&
      playingSong.value &&
      playingSong.value.id !== song.id
    ) {
      historyQueue.value = dedupeById([
        ...historyQueue.value.filter(item => item?.id !== playingSong.value.id),
        playingSong.value,
      ]);
    }

    historyQueue.value = dedupeById(
      historyQueue.value.filter(item => item?.id !== song.id)
    );

    if (removeFromQueue) {
      playQueue.value = dedupeById(
        playQueue.value.filter(item => item?.id !== song.id)
      );
    }

    playQueue.value = dedupeById(playQueue.value);

    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
    }

    currentUrl =
      URL.createObjectURL(song.file);

    audio.src = currentUrl;

    currentTime.value = 0;

    audio.play().catch(err => {
      console.error(err);
    });

    playingSong.value = song;
  }

  function playPreviousSong() {

    const previousSong =
      historyQueue.value.pop();

    if (!previousSong) return;

    if (playingSong.value) {
      playQueue.value = dedupeById([
        playingSong.value,
        ...playQueue.value.filter(item => item?.id !== playingSong.value.id),
      ]);
    }

    playSong(previousSong, false, { removeFromQueue: true });
  }
  
  function playNextSong() {

    const nextSong =
      playQueue.value.shift();

    if (!nextSong) return;

    playSong(nextSong);
  }

  function togglePlay() {
    if (!audio.src) return;

    if (audio.paused) {
      audio.play().catch(err => {
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
  // LIBRARY (FILESYSTEM)
  // =========================


  function cleanFileName(name) {
    return name.replace(/\.[^/.]+$/, "");
  }

  function getAudioDuration(file) {

    return new Promise(
      (resolve) => {

        const audio =
          document.createElement(
            "audio"
          );

        audio.preload =
          "metadata";

        audio.onloadedmetadata =
          () => {

            URL.revokeObjectURL(
              audio.src
            );

            resolve(
              audio.duration
            );
          };

        audio.src =
          URL.createObjectURL(
            file
          );
      }
    );
  }

  function sortSongs(mode = sortMode.value) {

    switch (mode) {

      case "name":
        songs.value.sort((a, b) =>
          a.title.localeCompare(b.title)
        );
        break;

      case "artist":
        songs.value.sort((a, b) =>
          a.artist.localeCompare(b.artist)
        );
        break;

      case "duration":
        songs.value.sort((a, b) =>
          a.duration - b.duration
        );
        break;
    }
  }

  function sortAlbums() {

    albums.value.sort((a, b) =>
      a.name.localeCompare(
        b.name,
        undefined,
        { sensitivity: "base" }
      )
    );

  }

  async function scanFolder(forceMetadata = false) {

    if (!folderHandle.value) return;

    loading.value = true;

    try {

      const list = [];

      for await (const entry of folderHandle.value.values()) {

        if (entry.kind === "file") {

          const file = await entry.getFile();
          let format;
          try {
            format = await readFormat(file);
          } catch {
            continue;
          }
          if (!format || format === "unknown") continue;

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

            metadataLoaded: false
          });
        }
      }

      songs.value = list;

      sortSongs();

      await loadMetadataForSongs(forceMetadata);

    } finally {

      loading.value = false;

    }
  }

  async function rescanLibrary() {

    if (!folderHandle.value) return;

    loading.value = true;

    try {

      await scanFolder();

    } finally {

      loading.value = false;

    }
  }

  async function selectFolder() {
    const handle = await window.showDirectoryPicker();

    folderHandle.value = handle;

    const db = await dbPromise;

    await db.put("settings", handle, "music-folder");

    await scanFolder();
  }

  async function removeFolder() {
    // ✅ CORRECCIÓN: Limpiar colas de reproducción para evitar comportamientos inesperados

    const db = await dbPromise;

    await db.delete("settings", "music-folder");

    folderHandle.value = null;

    songs.value = [];

    playingSong.value = null;
    playQueue.value = [];   // ✅ CORREGIDO: Limpiar cola de siguientes canciones
    historyQueue.value = []; // ✅ CORREGIDO: Limpiar historial para evitar saltos erróneos

    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
      currentUrl = null;
    }

    
    audio.pause();
    audio.src = "";

    currentTime.value = 0;
    duration.value = 0;

    await db.clear("metadata");
    await db.clear("albums");

    songs.value = [];
    albums.value = [];
  }


  async function selectFiles(files) {

    const list = [];

    for (const file of files) {

        if (!/\.(mp3|flac|wav|ogg)$/i.test(file.name)) {
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

            metadataLoaded: false
        });
    }


    songs.value = list;

    sortSongs();

    await loadMetadataForSongs();
  }
async function loadMetadataForSongs(forceRescan= false) {

  const db = await dbPromise;

  for (const song of songs.value) {

    try {

      // ======================
      // Buscar metadata en caché
      // ======================

      const cached =
        await db.get("metadata", song.id);

      if (!forceRescan && cached?.cacheVersion === metadataCacheVersion) {

        Object.assign(song, cached);

        const albumData = cached.hasMetadata && cached.albumId
          ? albums.value.find(a => a.id === cached.albumId)
          : null;

        song.cover = albumData?.cover ?? null;

        song.metadataLoaded = true;

        continue;
      }

      // Las versiones anteriores podían asociar canciones sin etiquetas al
      // álbum "Unknown". Se descartan para recalcularlas de forma correcta.
      if (cached) {
        await db.delete("metadata", song.id);
      }

      // ======================
      // Leer metadatos del archivo
      // ======================

      const metadata =
        await parseBlob(song.file);

      const hasMetadata =
        Boolean(metadata.common.title) ||
        Boolean(metadata.common.artist) ||
        Boolean(metadata.common.album);

      const hasAlbumMetadata = Boolean(metadata.common.album);

      // Sin etiqueta de álbum, cada tema se representa como un álbum propio.
      // Así nunca se agrupan pistas ajenas bajo el nombre genérico "Unknown".
      const standaloneAlbumName = metadata.common.title || song.name;

      const album = hasAlbumMetadata
        ? metadata.common.album
        : standaloneAlbumName;

      const albumArtist = hasAlbumMetadata
        ? metadata.common.albumartist || null
        : null;

      const albumId = hasAlbumMetadata
        ? album
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
        : `standalone-${song.id}`;

      // ======================
      // Buscar portada del álbum
      // ======================

      let albumData =
        albumId && albums.value.find(
          a => a.id === albumId
        );

      let coverBlob = null;

      if (!albumData) {

        const picture =
          hasAlbumMetadata
            ? metadata.common.picture?.[0]
            : null;

        if (picture) {

          coverBlob =
            new Blob(
              [picture.data],
              {
                type: picture.format
              }
            );

        }

        const newAlbum = {
          id: albumId,
          name: album,
          artist:
            albumArtist ||
            metadata.common.artist ||
            "Unknown",
          cover: coverBlob
        };

        await db.put("albums", newAlbum);

        albumData = {
          ...newAlbum,
          cover: coverBlob ? URL.createObjectURL(coverBlob) : null
        };

        albums.value.push(albumData);
        sortAlbums();
      } 


      // ======================
      // Crear metadata
      // ======================

      const data = {

        id: song.id,
        cacheVersion: metadataCacheVersion,

        hasMetadata,

        title:
          metadata.common.title ||
          song.name,

        artist:
          metadata.common.artist ||
          "Unknown",

        album,

        albumArtist,

        albumId,

        genre:
          [...(
            metadata.common.genre ?? []
          )],

        year:
          metadata.common.year ??
          null,

        track:
          metadata.common.track?.no ??
          null,

        trackTotal:
          metadata.common.track?.of ??
          null,

        disk:
          metadata.common.disk?.no ??
          null,

        diskTotal:
          metadata.common.disk?.of ??
          null,

        composer:
          [...(
            metadata.common.composer ?? []
          )],

        comment:
          JSON.parse(
            JSON.stringify(
              metadata.common.comment ?? []
            )
          ),

        lyrics:
          JSON.parse(
            JSON.stringify(
              metadata.common.lyrics ?? []
            )
          ),

        favorite: song.favorite ?? false,

        duration:
          metadata.format.duration ?? 0,

        bitrate:
          metadata.format.bitrate ?? 0,

        sampleRate:
          metadata.format.sampleRate ?? 0,

        channels:
          metadata.format.numberOfChannels ?? 0,

        codec:
          metadata.format.codec ?? "",

        container:
          metadata.format.container ?? "",

        lossless:
          metadata.format.lossless ?? false

      };

      // ======================
      // Guardar metadata
      // ======================

      await db.put(
        "metadata",
        data
      );

      // ======================
      // Actualizar canción
      // ======================

      Object.assign(
        song,
        data
      );

      song.favorite = song.favorite ?? false;

      song.cover = hasAlbumMetadata ? albumData?.cover ?? null : null;
      song.metadataLoaded =
        true;

    } catch (e) {




      console.warn(
        "⚠️ Metadata error for song",
        song.name,
        ":",
        e.message
      );

      song.title =
        cleanFileName(song.file.name);

      song.artist =
        "Unknown";

      song.metadataLoaded =
        false;
      song.favorite = song.favorite ?? false;
    }
  }

  await syncFavoritesPlaylistFromSongs();
  await pruneOrphanedAlbums(db);
}

async function pruneOrphanedAlbums(db) {

  const activeAlbumIds = new Set(
    songs.value
      .map(song => song.albumId)
      .filter(Boolean)
  );

  const orphanedAlbums = albums.value.filter(
    album => !activeAlbumIds.has(album.id)
  );

  for (const album of orphanedAlbums) {
    await db.delete("albums", album.id);

    if (typeof album.cover === "string" && album.cover.startsWith("blob:")) {
      URL.revokeObjectURL(album.cover);
    }
  }

  if (orphanedAlbums.length) {
    albums.value = albums.value.filter(
      album => activeAlbumIds.has(album.id)
    );
  }
}

async function rebuildLibrary() {

  if (!folderHandle.value) return;

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
  async function updateSongMetadata(songId, updatedData) {
    const song = songs.value.find(s => s.id === songId);
    if (!song) return false;

    const db = await dbPromise;

    // Normalizar datos
    const title = updatedData.title?.trim() || song.name;
    const artist = updatedData.artist?.trim() || "Unknown";
    const albumName = updatedData.album?.trim() || "";
    const albumArtist = updatedData.albumArtist?.trim() || null;
    
    let genre = [];
    if (Array.isArray(updatedData.genre)) {
      genre = updatedData.genre;
    } else if (typeof updatedData.genre === "string" && updatedData.genre.trim()) {
      genre = updatedData.genre.split(",").map(g => g.trim()).filter(Boolean);
    }

    const year = updatedData.year !== "" && updatedData.year !== null && updatedData.year !== undefined
      ? parseInt(updatedData.year, 10) || null
      : null;
    const track = updatedData.track !== "" && updatedData.track !== null && updatedData.track !== undefined
      ? parseInt(updatedData.track, 10) || null
      : null;
    const trackTotal = updatedData.trackTotal !== "" && updatedData.trackTotal !== null && updatedData.trackTotal !== undefined
      ? parseInt(updatedData.trackTotal, 10) || null
      : null;
    const disk = updatedData.disk !== "" && updatedData.disk !== null && updatedData.disk !== undefined
      ? parseInt(updatedData.disk, 10) || null
      : null;
    const diskTotal = updatedData.diskTotal !== "" && updatedData.diskTotal !== null && updatedData.diskTotal !== undefined
      ? parseInt(updatedData.diskTotal, 10) || null
      : null;

    const hasAlbumMetadata = Boolean(albumName);
    const finalAlbum = hasAlbumMetadata ? albumName : (title || song.name);
    const albumId = hasAlbumMetadata
      ? finalAlbum.toLowerCase().replace(/[^a-z0-9]+/g, "-")
      : `standalone-${song.id}`;

    const hasMetadata = Boolean(updatedData.title?.trim()) ||
      (Boolean(updatedData.artist?.trim()) && updatedData.artist.trim() !== "Unknown") ||
      Boolean(updatedData.album?.trim());

    const previousSongId = song.id;
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
      cover: updatedData.cover || '',
      directoryHandle: song.directoryHandle
    });
    const nextSongId = updatedFile.name;

    // Manejo de portada
    let cover = song.cover;
    let coverBlob = null;
    if (updatedData.cover !== undefined) {
      cover = updatedData.cover;
      if (updatedData.coverBlob) {
        coverBlob = updatedData.coverBlob;
      }
    }

    // Gestionar álbum en store y db
    let albumData = albums.value.find(a => a.id === albumId);
    if (!albumData && hasAlbumMetadata) {
      const newAlbum = {
        id: albumId,
        name: finalAlbum,
        artist: albumArtist || artist || "Unknown",
        cover: coverBlob || (typeof cover === "string" && !cover.startsWith("blob:") ? cover : null)
      };
      await db.put("albums", newAlbum);
      albumData = {
        ...newAlbum,
        cover: cover || null
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
          cover: coverBlob
        });
      }
    }

    // Actualizar metadatos en IndexedDB
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
      lossless: song.lossless ?? false
    };

    await db.put("metadata", metadataToSave);
    if (nextSongId !== previousSongId) {
      await db.delete("metadata", previousSongId);
      for (const playlist of playlists.value) {
        if (!Array.isArray(playlist.songIds)) continue;
        playlist.songIds = playlist.songIds.map(id =>
          id === previousSongId ? nextSongId : id
        );
        await savePlaylist(playlist);
      }
    }

    // Actualizar objeto reactivo de la canción
    Object.assign(song, {
      id: nextSongId,
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
      metadataLoaded: true
    });

    if (playingSong.value && playingSong.value.id === song.id) {
      Object.assign(playingSong.value, {
        title,
        artist,
        album: finalAlbum,
        albumArtist,
        cover
      });
    }

    // =========================================================================
    // TODO (Aplicación de escritorio / Native Tag Writer):
    // Cuando se ejecute en entorno de escritorio (Tauri / Electron / Node),
    // invocar aquí el servicio nativo para escribir las etiquetas ID3 reales
    // en el archivo de audio físico (song.file).
    // Ejemplo:
    // await nativeAudioTagger.writeTags(song.file.path, {
    //   title, artist, album: finalAlbum, albumArtist, genre, year, track, disk
    // });
    // =========================================================================

    await pruneOrphanedAlbums(db);
    return true;
  }

  // =========================
  // RETURN
  // =========================
  return {
// LIBRARY STATE
    init,
    initialized,
    songs,
    playlists,
    folderHandle,
    historyQueue,
    albums,
    loading,
// PLAYER STATE
    playingSong,
    isPlaying,
    currentTime,
    duration,
    volume,
// PLAYER ACTIONS
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
// FOLDER ACTIONS
    selectFolder,
    removeFolder,
    selectFiles,
    rescanLibrary,
    rebuildLibrary,
    sortSongs,
    sortMode,
    updateSongMetadata,

// PLAYLIST
    createPlaylist,
    updatePlaylist,
    addSongToPlaylist,
    removeSongFromPlaylist,
    deletePlaylist,
    reorderPlaylistSongs,
    toggleFavorite,
    isSongInPlaylist,
    FAVORITES_PLAYLIST_ID
  };
});
