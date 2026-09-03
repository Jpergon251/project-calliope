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
          <span class="song-artist" v-if="library.playingSong">{{ library.playingSong.artist }}</span>
        </section>
      </div>

      <!-- Controls -->
      <section class="controls">
        <button type="button" @click.stop="library.playPreviousSong()" aria-label="Canción anterior" title="Canción anterior">
          <SkipBack class="control-icon" fill="white" />
        </button>

        <button type="button" class="play-pause-btn" @click.stop="library.togglePlay()" :aria-label="library.isPlaying ? 'Pausar' : 'Reproducir'" :title="library.isPlaying ? 'Pausar' : 'Reproducir'">
          <Pause v-if="library.isPlaying" class="control-icon" fill="white" />
          <Play v-else class="control-icon" fill="white"/>
        </button>

        <button type="button" @click.stop="library.playNextSong()" aria-label="Siguiente canción" title="Siguiente canción">
          <SkipForward class="control-icon" fill="white" />
        </button>

        <button class="queue-button" type="button" @click.stop="showQueue = !showQueue" aria-label="Abrir cola de reproducción" title="Cola de reproducción">
          <ListMusic class="control-icon" fill="white" />
        </button>
      </section>

    <!-- Volume Control -->
      <VolumeModal :library="library"/>
    </section>
  </section>

  <QueuePanel
    v-if="showQueue"
    class="queue-panel"
    @close="showQueue = false"
  />
</template>

<script setup>
import { Play, Pause, SkipBack, SkipForward, ListMusic } from "lucide-vue-next";
import { useLibraryStore } from "../../stores/libraryStore.js";
import { useRouter } from "vue-router";
import SongCover from "../library/SongCover.vue";
import QueuePanel from "../player/QueuePanel.vue"
const library = useLibraryStore();
const router = useRouter();
import { ref, computed } from "vue";
import VolumeModal from "../player/VolumeModal.vue";

const showQueue = ref(false);

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
