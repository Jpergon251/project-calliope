<template>
  <main v-if="song" class="song-page">
    <section class="song-hero" aria-labelledby="song-title">
      <div class="cover-section">
        <div class="cover-frame">
          <img v-if="song.cover" :src="song.cover" :alt="`Portada de ${song.title}`" />
          <SongIconCover v-else class="fallback" />
        </div>
        <span class="cover-caption">Reproduciendo desde tu biblioteca</span>
      </div>

      <div class="info-section">
        <p class="eyebrow">Cancion</p>
        <h1 id="song-title">{{ song.title }}</h1>
        <p class="artist-line">{{ song.artist || 'Artista desconocido' }}</p>
        <p class="album-line">
          <DiscAlbum class="inline-icon" />
          {{ song.album || 'Album desconocido' }}
        </p>

        <div class="actions">
          <button class="primary" type="button" @click="playSong">
            <Pause v-if="isCurrentSong && library.isPlaying" fill="currentColor" />
            <Play v-else fill="currentColor" />
            <span>{{ isCurrentSong && library.isPlaying ? 'Pausar' : 'Reproducir' }}</span>
          </button>
          <button
            class="secondary"
            type="button"
            :class="{ active: song.favorite }"
            :aria-label="song.favorite ? 'Quitar de favoritos' : 'Anadir a favoritos'"
            @click="library.toggleFavorite(song)"
          >
            <Heart :fill="song.favorite ? 'currentColor' : 'none'" />
          </button>
        </div>

        <dl class="metadata">
          <div><dt>Album</dt><dd>{{ song.album || 'Unknown' }}</dd></div>
          <div><dt>Artista</dt><dd>{{ song.artist || 'Unknown' }}</dd></div>
          <div><dt>Duracion</dt><dd>{{ format(song.duration) }}</dd></div>
          <div><dt>Formato</dt><dd>{{ song.codec || song.container || 'Audio' }}</dd></div>
        </dl>
      </div>
    </section>

    <div class="song-atmosphere" :class="{ active: library.isPlaying }" aria-label="Visualizador de audio">
      <AudioVisualizer />
    </div>
  </main>
</template>

<script setup>
import { useRoute } from "vue-router";
import { useLibraryStore } from "../stores/libraryStore.js";
import { computed } from "vue";
import { DiscAlbum, Heart, Pause, Play } from "lucide-vue-next";
import SongIconCover from "../components/common/SongIconCover.vue";
import AudioVisualizer from "../components/common/AudioVisualizer.vue";

const route = useRoute();
const library = useLibraryStore();

const song = computed(() =>
  library.songs.find(s => s.id === route.params.id)
);

const isCurrentSong = computed(() => library.playingSong?.id === song.value?.id);

function playSong() {
  if (isCurrentSong.value && library.isPlaying) {
    library.togglePlay();
    return;
  }
  library.playSong(song.value);
}

function format(seconds) {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
</script>