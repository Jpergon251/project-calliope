import { defineStore } from "pinia";
import { ref, watch } from "vue";

import { dbPromise } from "../lib/db";

export const useLibraryStore = defineStore("library", () => {

  // =========================
  // STATE
  // =========================
  const songs = ref([]);
  const playlists = ref([
    {
      id: "all",
      name: "All Songs",
      get songs() {
        return songs.value;
      }
    }
  ]);

  const folderHandle = ref(null);

  let currentUrl = null;

  const playingSong = ref(null);
  const isPlaying = ref(false);
  const currentTime = ref(0);
  const duration = ref(0);
  const volume = ref(1);

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

  // =========================
  // PLAYER ACTIONS
  // =========================
  function playSong(song) {

    if (currentUrl) {
      URL.revokeObjectURL(
        currentUrl
      );
    }

    currentUrl =
      URL.createObjectURL(
        song.file
      );

    audio.src =
      currentUrl;

    audio.play();

    playingSong.value =
      song;
  }

  function playPreviousSong() {

    if (!playingSong.value)
      return;

    const currentIndex =
      songs.value.findIndex(
        song =>
          song.id ===
          playingSong.value.id
      );

    const previousSong =
      songs.value[
        currentIndex - 1
      ];

    if (previousSong) {
      playSong(previousSong);
    }
  }
  
  function playNextSong() {

    if (!playingSong.value)
      return;

    const currentIndex =
      songs.value.findIndex(
        song =>
          song.id ===
          playingSong.value.id
      );

    const nextSong =
      songs.value[
        currentIndex + 1
      ];

    if (nextSong) {
      playSong(nextSong);
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

        const duration =
        await getAudioDuration(
          file
        );

        list.push({
          id:
            `${file.name}-${file.size}`,

          name: file.name,

          duration,

          file
        });
      }
    }


    songs.value = list;
  }

  async function selectFolder() {
    const handle = await window.showDirectoryPicker();

    folderHandle.value = handle;

    const db = await dbPromise;

    await db.put("settings", handle, "music-folder");

    await scanFolder();
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
    playSong,
    togglePlay,
    seek,
// FOLDER ACTIONS
    selectFolder,
    loadSavedFolder
  };
});