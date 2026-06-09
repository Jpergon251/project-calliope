import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { parseBlob }
from "music-metadata";
import { dbPromise } from "../lib/db";

export const useLibraryStore = defineStore("library", () => {

  // =========================
  // STATE
  // =========================
  const songs = ref([]);

  const defaultPlaylist = {
    id: "all",
    name: "All Songs",
    get songs() {
      return songs.value;
    }
  };

  const savedPlaylists =
    JSON.parse(
      localStorage.getItem("playlists") || "[]"
    );

  const playlists = ref([
    defaultPlaylist,
    ...savedPlaylists
  ]);
  const folderHandle = ref(null);

  let currentUrl = null;
  const playQueue = ref([]);
  const playingSong = ref(null);
  const isPlaying = ref(false);
  const currentTime = ref(0);
  const duration = ref(0);
  const volume = ref(1);
  const currentPlaylistId = ref(null);
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
  function createPlaylist({ name, cover }) {

    const playlist = {
      id: crypto.randomUUID(),
      name,
      cover,
      songsIds: []
    };

    playlists.value.push(playlist);

    // console.log("PLAYLISTS:", playlists.value);

    savePlaylists();
  }

  function savePlaylists() {

    const playlistsToSave =
      playlists.value.filter(
        p => p.id !== "all"
      );

    console.log(
      "GUARDANDO:",
      playlistsToSave
    );

    localStorage.setItem(
      "playlists",
      JSON.stringify(playlistsToSave)
    );
  }

  function addSongToPlaylist(
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

    savePlaylists();
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

  function playFromPlaylist(song, playlist = null) {
    const queue = playlist?.songs
      ? playlist.songs
      : songs.value;

    currentPlaylistId.value = playlist?.id ?? null;

    playSong(song, queue);
  }

  function playSong(song, queue) {
    if (queue) {
      playQueue.value = queue;
    }

    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
    }

    currentUrl = URL.createObjectURL(song.file);
    audio.src = currentUrl;
    audio.play();

    playingSong.value = song;
  }

  function playPreviousSong() {

    if (!playingSong.value)
      return;

    const currentIndex =
      playQueue.value.findIndex(
        song =>
          song.id ===
          playingSong.value.id
      );

    const previousSong =
      playQueue.value[
        currentIndex - 1
      ];

    if (previousSong) {

      playSong(
        previousSong,
        playQueue.value
      );
    }
  }
  
  function playNextSong() {

    if (!playingSong.value)
      return;

    const currentIndex =
      playQueue.value.findIndex(
        song =>
          song.id ===
          playingSong.value.id
      );

    const nextSong =
      playQueue.value[
        currentIndex + 1
      ];

    if (nextSong) {
      playSong(
        nextSong,
        playQueue.value
      );
    }
  }

  function togglePlay() {
    if (!audio.src) return;

    if (audio.paused) {
      audio.play();
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


  async function scanFolder() {
    if (!folderHandle.value) return;

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

          // placeholder metadata
          title: cleanFileName(file.name),
          artist: "Unknown",
          cover: null,

          metadataLoaded: false
        });
      }
    }

    songs.value = list;
    loadMetadataForSongs();
    // console.log(songs.value)
  }

  async function selectFolder() {
    const handle = await window.showDirectoryPicker();

    folderHandle.value = handle;

    const db = await dbPromise;

    await db.put("settings", handle, "music-folder");

    await scanFolder();
  }

  async function removeFolder() {

    const db =
      await dbPromise;

    await db.delete(
      "settings",
      "music-folder"
    );

    folderHandle.value =
      null;

    songs.value = [];

    playingSong.value =
      null;

    audio.pause();
    audio.src = "";
  }
  async function loadSavedFolder() {
    const db = await dbPromise;

    const savedHandle = await db.get("settings", "music-folder");

    if (!savedHandle) return;

    const permission = await savedHandle.queryPermission({
      mode: "read"
    });

    if (permission !== "granted") {
      const newPermission = await savedHandle.requestPermission({
        mode: "read"
      });

      if (newPermission !== "granted") return;
    }

    folderHandle.value = savedHandle;

    await scanFolder();
  }

  async function loadMetadataForSongs() {

    for (const song of songs.value) {

      try {

        const metadata =
          await parseBlob(song.file);

        song.title =
          metadata.common.title || song.name;

        song.artist =
          metadata.common.artist || "Unknown";

        song.cover =
          metadata.common.picture?.[0]
            ? URL.createObjectURL(
                new Blob(
                  [metadata.common.picture[0].data],
                  { type: metadata.common.picture[0].format }
                )
              )
            : null;

        song.duration =
          metadata.format.duration;

        song.metadataLoaded = true;

      } catch (e) {
        console.warn("Metadata error", song.name);
      }
    }
  }



  // =========================
  // RETURN
  // =========================
  return {
// LIBRARY STATE
    songs,
    playlists,
    folderHandle,

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
    togglePlay,
    seek,
// FOLDER ACTIONS
    selectFolder,
    loadSavedFolder,
    removeFolder,

// PLAYLIST
    createPlaylist,
    addSongToPlaylist,
    isSongInPlaylist
  };
});