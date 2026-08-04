
<template>
  <MediaCard>

    <template #cover>

      <img
        v-if="song.cover"
        :src="song.cover"
        class="song-image"
      />

      <SongIconCover v-else class="song-image"/>

      <button
        class="play-btn"
        @click.stop="library.playSong(song)"
      >
        <Play class="icon" fill="currentcolor"/>
      </button>

    </template>

    <div class="song-info">

      <router-link
        :to="`/song/${song.id}`"
      >
        {{ song.name }}
      </router-link>

      <span>
        {{ format(song.duration) }}
      </span>

    </div>

    <span class="song-artist">
      {{ song.artist }}
    </span>

  </MediaCard>
</template>

<script setup>
import MediaCard from "../common/MediaCard.vue";
import { useLibraryStore } from "../../stores/libraryStore.js";
import { DiscAlbum, Play } from "lucide-vue-next";
import SongIconCover from "../common/SongIconCover.vue";


const library = useLibraryStore();

const props = defineProps({
  song: {
    type: Object,
    required: true
  }
});

function format(seconds) {
  if (!seconds) return "0:00";

  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);

  return `${m}:${s.toString().padStart(2, "0")}`;
}
</script>