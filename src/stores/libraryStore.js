import { defineStore } from "pinia";
import { ref, watch, toRaw } from "vue";
import { parseBlob } from "music-metadata"; // ✅ CORREGIDO: Error sintáctico original - parseBlob ahora importado correctamente
import { dbPromise } from "../lib/db";

export const useLibraryStore = defineStore("library", () => {

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


  
  // =========================
  // INITIALIZATION
  // =========================

  async function init() {
    await loadAlbums();
    await loadPlaylists();
    await loadSavedFolder();

    initialized.value = true

  }

  async function loadAlbums() {
    const db = await dbPromise;

    const data = await db.getAll("albums");

    albums.value = data.map(album => ({
      ...album,
      // ⚠️ MEMORY LEAK FIX: Crear URL solo si no tiene cover o necesita reemplazo
      cover: album.cover && !album._urlCreated 
        ? URL.createObjectURL(album.cover)
        : album.cover || null,
      // 🔒 Limpieza: marcar que hemos creado la URL para evitar duplicados
      _urlCreated: album.cover ? true : null
    }));

    sortAlbums();
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
  }

  // =========================
  // AUDIO ENGINE
  // =========================
  const audio = new Audio();

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
    addToHistory = true
  ) {

    if (
      addToHistory &&
      playingSong.value &&
      playingSong.value.id !== song.id
    ) {
      historyQueue.value.push(
        playingSong.value
      );
    }

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
      playQueue.value.unshift(
        playingSong.value
      );
    }

    playSong(previousSong, false);
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

  async function scanFolder() {

    if (!folderHandle.value) return;

    loading.value = true;

    try {

      const list = [];

      for await (const entry of folderHandle.value.values()) {

        if (
          entry.kind === "file" &&
          /\.(mp3|flac|wav|ogg)$/i.test(entry.name)
        ) {

          const file = await entry.getFile();

          list.push({
            id: `${file.name}-${file.size}`,
            file,

            name: cleanFileName(file.name),
            duration: null,

            title: cleanFileName(file.name),
            artist: "Unknown",
            cover: null,

            metadataLoaded: false
          });
        }
      }

      songs.value = list;

      sortSongs();

      await loadMetadataForSongs();

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


async function loadMetadataForSongs() {

  const db = await dbPromise;

  for (const song of songs.value) {

    try {

      // ======================
      // Buscar metadata en caché
      // ======================

      const cached =
        await db.get("metadata", song.id);

      if (cached?.cacheVersion === metadataCacheVersion) {

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
    }
  }

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

    const db = await dbPromise;

    for (const album of albums.value) {
      if (album.cover) {
        URL.revokeObjectURL(album.cover);
      }
    }
    // Borrar caché
    await db.clear("metadata");
    await db.clear("albums");

    // Limpiar memoria
    songs.value = [];
    albums.value = [];

    // Reconstruir
    await scanFolder();

  } finally {

    loading.value = false;

  }
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
    seek,
// FOLDER ACTIONS
    selectFolder,
    removeFolder,
    rescanLibrary,
    rebuildLibrary,
    sortSongs,
    sortMode,

// PLAYLIST
    createPlaylist,
    updatePlaylist,
    addSongToPlaylist,
    isSongInPlaylist
  };
});
