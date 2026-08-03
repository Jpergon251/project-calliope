<template>
<div class="song-page" v-if="song">

  <div class="song-layout">

    <div class="cover-section">
      <img
        v-if="song.cover"
        :src="song.cover"
      />

      <DiscAlbum
        v-else
        class="fallback"
      />
    </div>

    <div class="info-section">

      <h1>{{ song.title }}</h1>

      <h2>{{ song.artist }}</h2>

      <span class="duration">
        {{ format(song.duration) }}
      </span>

      <div class="actions">

        <button
          class="primary"
          @click="library.playSong(song)"
        >
          <Play fill="currentColor"/>
        </button>

        <button class="secondary">
          <Heart/>
        </button>

        <button class="secondary">
          <Plus/>
        </button>

      </div>

      <div class="metadata">

        <div>
          <span>Album</span>
          <strong>{{ song.album || "Unknown" }}</strong>
        </div>

        <div>
          <span>Artist</span>
          <strong>{{ song.artist }}</strong>
        </div>

        <div>
          <span>Duration</span>
          <strong>{{ format(song.duration) }}</strong>
        </div>

      </div>

    </div>

  </div>

</div>
</template>

<script setup>
import { useRoute } from "vue-router";
import { useLibraryStore } from "../stores/libraryStore.js";
import { computed } from "vue";
import { DiscAlbum, Play, Heart, Plus } from "lucide-vue-next";

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