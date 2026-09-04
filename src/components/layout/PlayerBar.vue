<template>
  <section class="player" aria-label="Reproductor">
    <!-- Slim progress line for mobile mini-player -->
    <div class="mini-progress-track" aria-hidden="true">
      <div class="mini-progress-bar" :style="{ width: `${progressPercent}%` }"></div>
    </div>

    <!-- Progress Bar for Desktop -->
    <section class="progress">

        <input
            type="range"
            min="0"
            :max="library.duration || 0"
            step="0.1"
            :value="library.currentTime"
            @input="handleSeek($event)"
            class="progress-bar"
            aria-label="Progreso de la canción"
        />

        <section class="time-info">
            <span class="time">
                {{ formatTime(library.currentTime) }}
            </span>

            <span class="time">
                {{ formatTime(library.duration) }}
            </span>
        </section>
    </section>
<!-- Song Info -->

    <section class="song-info">
      <div class="song-card" @click="openCurrentSong" :class="{ 'is-clickable': !!library.playingSong }">
        <SongCover class="song-cover" :song="library.playingSong"/>
        <section class="song-title">
          <h3 class="song-name" v-if="library.playingSong">{{ library.playingSong.name }}</h3>
          <p v-else class="song-name advertisment">No hay canción reproduciéndose</p>
          <span class="song-artist" v-if="library.playingSong">
            <span v-if="playingSongArtists.length">
              <span
                v-for="(artName, idx) in playingSongArtists"
                :key="artName"
                class="player-bar-artist-link"
                @click.stop="goToArtist(artName)"
                :title="`Ver artista: ${artName}`"
              >
                {{ artName }}<span v-if="idx < playingSongArtists.length - 1">, </span>
              </span>
            </span>
            <span v-else>{{ library.playingSong.artist }}</span>
          </span>
        </section>
      </div>

      <!-- Controls -->
      <section class="controls">
        <button
          class="mode-btn shuffle-control-btn"
          :class="{ active: library.isShuffleEnabled }"
          type="button"
          @click.stop="library.toggleShuffle()"
          :aria-label="library.isShuffleEnabled ? 'Reproducción aleatoria activada' : 'Reproducción aleatoria desactivada'"
          :title="library.isShuffleEnabled ? 'Reproducción aleatoria activada' : 'Reproducción aleatoria'"
        >
          <Shuffle class="control-icon" />
        </button>

        <button
          type="button"
          class="skip-btn prev-btn"
          @click.stop="library.playPreviousSong()"
          aria-label="Canción anterior"
          title="Canción anterior"
        >
          <SkipBack class="control-icon" fill="white" />
        </button>

        <button
          type="button"
          class="play-pause-btn"
          @click.stop="library.togglePlay()"
          :aria-label="library.isPlaying ? 'Pausar' : 'Reproducir'"
          :title="library.isPlaying ? 'Pausar' : 'Reproducir'"
        >
          <Pause v-if="library.isPlaying" class="control-icon" fill="white" />
          <Play v-else class="control-icon" fill="white"/>
        </button>

        <button
          type="button"
          class="skip-btn next-btn"
          @click.stop="library.playNextSong()"
          aria-label="Siguiente canción"
          title="Siguiente canción"
        >
          <SkipForward class="control-icon" fill="white" />
        </button>

        <button
          class="mode-btn autoplay-control-btn"
          :class="{ active: library.autoplay }"
          type="button"
          @click.stop="library.toggleAutoplay()"
          :aria-label="library.autoplay ? 'Desactivar reproducción automática' : 'Activar reproducción automática'"
          :title="library.autoplay ? 'Reproducción automática activada' : 'Reproducción automática desactivada'"
        >
          <Infinity class="control-icon" />
        </button>

        <button
          class="queue-button"
          :class="{ active: library.isQueueOpen }"
          type="button"
          @click.stop="library.toggleQueue()"
          aria-label="Abrir cola de reproducción"
          title="Cola de reproducción"
        >
          <ListMusic class="control-icon" fill="white" />
        </button>
      </section>

      <!-- Volume Control (Right) -->
      <VolumeModal :library="library" layout="bar" />
    </section>
  </section>
</template>

<script setup>
import {
  Infinity,
  ListMusic,
  Pause,
  Play,
  Shuffle,
  SkipBack,
  SkipForward,
} from "lucide-vue-next";
import { useLibraryStore } from "../../stores/libraryStore.js";
import { useRouter } from "vue-router";
import SongCover from "../library/SongCover.vue";
import VolumeModal from "../player/VolumeModal.vue";
import { computed } from "vue";

const library = useLibraryStore();
const router = useRouter();

const playingSongArtists = computed(() => {
  if (!library.playingSong?.artist) return [];
  const parsed = library.parseArtistNames(library.playingSong.artist);
  return parsed.length ? parsed : [library.playingSong.artist];
});

function goToArtist(name) {
  if (!name || name === "Unknown" || name === "Artista desconocido") return;
  library.closeNowPlaying();
  library.closeQueue();
  router.push({ name: "artist", params: { name: encodeURIComponent(name.trim()) } });
}

const progressPercent = computed(() => {
  const d = library.duration;
  if (!d || Number.isNaN(d) || d <= 0) return 0;
  return Math.min(100, Math.max(0, (library.currentTime / d) * 100));
});

function openCurrentSong() {
  if (library.playingSong) {
    library.openNowPlaying();
  }
}

function handleSeek(event) {
  const nextTime = Number(event.target.value);
  library.currentTime = nextTime;
  library.seek(nextTime);
}

function formatTime(seconds) {

  if (
    !seconds ||
    isNaN(seconds)
  ) {
    return "0:00";
  }

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
