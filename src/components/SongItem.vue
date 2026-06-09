<template>
    <div class="song-cover">
        <img v-if="song.cover" :src="song.cover" class="song-image"/>
        <DiscAlbum v-else class="song-image"/>
        <button class="play-btn" @click.stop="library.playSong(song)">
            <Play class="icon" fill="white"/>
        </button>
    </div>

    <div class="song-info">
        <router-link :to="`/song/${song.id}`" class="song-info">
        <span class="song-name">{{ song.name }}</span>
        </router-link>
        
        <span class="song-duration">
            {{ format(song.duration) }}
        </span>
    </div>

    
    <span class="song-artist">{{ song.artist }}</span>

</template>

<script setup>
import { DiscAlbum, Play } from "lucide-vue-next";
import { useLibraryStore } from "../stores/libraryStore";

const library = useLibraryStore()
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