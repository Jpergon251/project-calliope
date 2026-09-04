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
        <p class="artist-line">
          <span v-if="songArtists.length">
            <span
              v-for="(artName, idx) in songArtists"
              :key="artName"
              class="artist-clickable-link"
              @click="goToArtist(artName)"
              :title="`Ver artista: ${artName}`"
            >
              {{ artName }}<span v-if="idx < songArtists.length - 1">, </span>
            </span>
          </span>
          <span v-else>{{ song.artist || 'Artista desconocido' }}</span>
        </p>
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
            class="secondary favorite-btn"
            type="button"
            :class="{ active: song.favorite }"
            :aria-label="song.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'"
            :title="song.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'"
            @click="library.toggleFavorite(song)"
          >
            <Heart :fill="song.favorite ? 'currentColor' : 'none'" :size="19" />
          </button>
          <button
            class="secondary like-btn"
            type="button"
            :class="{ active: currentRating === 'like' }"
            :aria-label="currentRating === 'like' ? 'Quitar Me gusta' : 'Me gusta'"
            :title="currentRating === 'like' ? 'Quitar Me gusta' : 'Me gusta'"
            @click="library.toggleLike(song)"
          >
            <ThumbsUp :fill="currentRating === 'like' ? 'currentColor' : 'none'" :size="19" />
          </button>
          <button
            class="secondary dislike-btn"
            type="button"
            :class="{ active: currentRating === 'dislike' }"
            :aria-label="currentRating === 'dislike' ? 'Quitar No me gusta' : 'No me gusta'"
            :title="currentRating === 'dislike' ? 'Quitar No me gusta' : 'No me gusta'"
            @click="library.toggleDislike(song)"
          >
            <ThumbsDown :fill="currentRating === 'dislike' ? 'currentColor' : 'none'" :size="19" />
          </button>
        </div>

        <!-- Song listening stats -->
        <div class="song-stats-card" v-if="songStats.playCount > 0">
          <div class="stats-item">
            <span class="stats-label">Reproducciones</span>
            <strong class="stats-value">{{ songStats.playCount }}</strong>
          </div>
          <div class="stats-item">
            <span class="stats-label">Tiempo escuchado</span>
            <strong class="stats-value">{{ library.formatListenTime(songStats.totalListenTime) }}</strong>
          </div>
          <div class="stats-item">
            <span class="stats-label">Primera vez</span>
            <strong class="stats-value">{{ formatDate(songStats.firstPlayedAt) }}</strong>
          </div>
          <div class="stats-item">
            <span class="stats-label">Última vez</span>
            <strong class="stats-value">{{ formatDate(songStats.lastPlayedAt) }}</strong>
          </div>
        </div>

        <dl class="metadata">
          <div><dt>Album</dt><dd>{{ song.album || 'Unknown' }}</dd></div>
          <div>
            <dt>Artista</dt>
            <dd>
              <span v-if="songArtists.length">
                <span
                  v-for="(artName, idx) in songArtists"
                  :key="artName"
                  class="artist-clickable-link"
                  @click="goToArtist(artName)"
                >
                  {{ artName }}<span v-if="idx < songArtists.length - 1">, </span>
                </span>
              </span>
              <span v-else>{{ song.artist || 'Unknown' }}</span>
            </dd>
          </div>
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
import { useRoute, useRouter } from "vue-router";
import { useLibraryStore } from "../stores/libraryStore.js";
import { computed } from "vue";
import { DiscAlbum, Heart, Pause, Play, ThumbsDown, ThumbsUp } from "lucide-vue-next";
import SongIconCover from "../components/common/SongIconCover.vue";
import AudioVisualizer from "../components/common/AudioVisualizer.vue";

const route = useRoute();
const router = useRouter();
const library = useLibraryStore();

const song = computed(() =>
  library.songs.find(s => s.id === route.params.id)
);

const isCurrentSong = computed(() => library.playingSong?.id === song.value?.id);

const songArtists = computed(() => {
  if (!song.value?.artist) return [];
  const parsed = library.parseArtistNames(song.value.artist);
  return parsed.length ? parsed : [song.value.artist];
});

const currentRating = computed(() => {
  if (!song.value?.id) return "neutral";
  return library.getSongRating(song.value.id);
});

const songStats = computed(() => {
  if (!song.value?.id) {
    return { playCount: 0, totalListenTime: 0, firstPlayedAt: null, lastPlayedAt: null };
  }
  return library.getSongStats(song.value.id);
});

function goToArtist(name) {
  if (!name || name === "Unknown" || name === "Artista desconocido") return;
  library.closeNowPlaying();
  library.closeQueue();
  router.push({ name: "artist", params: { name: encodeURIComponent(name.trim()) } });
}

function formatDate(timestamp) {
  if (!timestamp) return "Aún no";
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

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