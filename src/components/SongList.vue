<template>
    <div class="song-list-container">
        <ul class="song-list">
            <li 
            v-for="(song, index) in songs" :key="index"
            @click="library.playSong(song)"
            class="song-item"
            >
                <span class="song-name">{{ song.name }}</span>
                <span class="song-duration">{{ formatDuration(song.duration) }}</span>
            </li>
        </ul>
    </div>
</template>

<script setup>
import { useLibraryStore }
from "../stores/libraryStore.js";

const library =
useLibraryStore();

const props =
defineProps({
  songs: Array
});
function formatDuration(
  seconds
) {

  const minutes =
    Math.floor(
      seconds / 60
    );

  const remainingSeconds =
    Math.floor(
      seconds % 60
    );

  return `${minutes}:${
    remainingSeconds
      .toString()
      .padStart(2, "0")
  }`;
}
</script>
