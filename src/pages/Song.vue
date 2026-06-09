<template>
  <div class="song-page" v-if="song">

    <div class="song-layout">

      <!-- LEFT: COVER -->
      <div class="cover-section">
        <img v-if="song.cover" :src="song.cover" />
        <DiscAlbum v-else class="fallback" />
      </div>

      <!-- RIGHT: INFO -->
      <div class="info-section">

        <h1 class="title">{{ song.name }}</h1>
        <p class="artist">{{ song.artist }}</p>

        <p class="duration">
          {{ format(song.duration) }}
        </p>

        <div class="actions">

          <button class="play-btn" @click="library.playSong(song)">
            <Play fill="white"/>
          </button>

          <button class="secondary">
            Add to playlist
          </button>

        </div>

      </div>

    </div>

  </div>
</template>

<script setup>
import { useRoute } from "vue-router";
import { useLibraryStore } from "../stores/libraryStore.js";
import { computed } from "vue";
import { DiscAlbum, Play } from "lucide-vue-next";

const route = useRoute();
const library = useLibraryStore();

const song = computed(() =>
  library.songs.find(s => s.id === route.params.id)
);

function format(seconds) {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
</script>