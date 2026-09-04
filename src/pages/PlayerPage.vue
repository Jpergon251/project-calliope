<template>
  <main
    class="player-page"
    :class="{ 'is-overlay': isOverlay }"
    aria-label="Reproductor de música"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    <!-- Drag indicator handle for sheet -->
    <div class="sheet-pill" aria-hidden="true" @click="handleMinimize"></div>

    <header class="player-page-header">
      <button type="button" class="back-button" aria-label="Minimizar reproductor" @click="handleMinimize">
        <ChevronDown />
      </button>
      <span>REPRODUCIENDO</span>
      <div class="header-spacer" aria-hidden="true"></div>
    </header>

    <template v-if="song">
      <section class="player-page-artwork">
        <Transition name="artwork-fade" mode="out-in">
          <div :key="song.id" class="artwork-inner">
            <img v-if="song.cover" :src="song.cover" :alt="`Portada de ${song.title || song.name}`" />
            <SongIconCover v-else class="artwork-fallback" />
          </div>
        </Transition>
      </section>

      <section class="player-page-details" aria-live="polite">
        <div class="song-meta">
          <h1 :title="song.title || song.name">{{ song.title || song.name }}</h1>
          <p>{{ song.artist || 'Artista desconocido' }}</p>
        </div>
        <div class="player-page-actions">
          <button
            type="button"
            class="favorite-button"
            :class="{ active: song.favorite }"
            :aria-label="song.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'"
            @click="library.toggleFavorite(song)"
          >
            <Heart :fill="song.favorite ? 'currentColor' : 'none'" />
          </button>
        </div>
      </section>

      <!-- Tactical, generous touch scrubber (Requirement 4) -->
      <section class="player-page-timeline" aria-label="Progreso de reproducción">
        <div
          class="custom-scrubber"
          ref="scrubberRef"
          role="slider"
          :aria-valuenow="displayCurrentTime"
          aria-valuemin="0"
          :aria-valuemax="library.duration || 0"
          tabindex="0"
          @click="handleScrubberClick"
          @touchstart="handleScrubberTouchStart"
          @touchmove="handleScrubberTouchMove"
          @touchend="handleScrubberTouchEnd"
          @mousedown="handleScrubberMouseDown"
        >
          <div class="scrubber-track">
            <div class="scrubber-fill" :style="{ width: `${progressPercent}%` }"></div>
            <div class="scrubber-thumb" :style="{ left: `${progressPercent}%` }" :class="{ active: isScrubbing }"></div>
          </div>
        </div>
        <div class="time-row">
          <span class="time-current">{{ formatTime(displayCurrentTime) }}</span>
          <span class="time-duration">{{ formatTime(library.duration) }}</span>
        </div>
      </section>

      <section class="player-page-controls" aria-label="Controles de reproducción">
        <button type="button" class="ctrl-btn" aria-label="Canción anterior" @click="library.playPreviousSong">
          <SkipBack fill="currentColor" />
        </button>
        <button
          type="button"
          class="main-control"
          :class="{ 'is-playing': library.isPlaying }"
          :aria-label="library.isPlaying ? 'Pausar' : 'Reproducir'"
          @click="library.togglePlay"
        >
          <Pause v-if="library.isPlaying" fill="currentColor" />
          <Play v-else fill="currentColor" />
        </button>
        <button type="button" class="ctrl-btn" aria-label="Siguiente canción" @click="library.playNextSong">
          <SkipForward fill="currentColor" />
        </button>
      </section>

      <section class="player-page-visualizer" aria-label="Visualizador de audio">
        <AudioVisualizer />
      </section>
    </template>

    <section v-else class="player-empty">
      <Music2 />
      <h1>No hay ninguna canción sonando</h1>
      <button type="button" @click="handleMinimize">Volver a la biblioteca</button>
    </section>
  </main>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ChevronDown, Heart, Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-vue-next';
import { useLibraryStore } from '../stores/libraryStore.js';
import AudioVisualizer from '../components/common/AudioVisualizer.vue';
import SongIconCover from '../components/common/SongIconCover.vue';

defineProps({
  isOverlay: {
    type: Boolean,
    default: false
  }
});
const emit = defineEmits(['close']);

const router = useRouter();
const route = useRoute();
const library = useLibraryStore();
const song = computed(() => library.playingSong);

// Minimize logic
function handleMinimize() {
  emit('close');
  library.closeNowPlaying();
  if (route.name === 'player') {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  }
}

// Touch swipe down to minimize
let touchStartY = 0;
let isSwipeActive = false;

function handleTouchStart(e) {
  const touch = e.touches[0];
  if (touch.clientY < window.innerHeight * 0.4) {
    touchStartY = touch.clientY;
    isSwipeActive = true;
  }
}

function handleTouchMove(e) {
  if (!isSwipeActive) return;
  const currentY = e.touches[0].clientY;
  const diff = currentY - touchStartY;
  if (diff > 80) {
    isSwipeActive = false;
    handleMinimize();
  }
}

function handleTouchEnd() {
  isSwipeActive = false;
}

// Timeline scrubber logic
const scrubberRef = ref(null);
const isScrubbing = ref(false);
const scrubTime = ref(0);

const displayCurrentTime = computed(() => {
  return isScrubbing.value ? scrubTime.value : library.currentTime;
});

const progressPercent = computed(() => {
  const d = library.duration;
  if (!d || Number.isNaN(d) || d <= 0) return 0;
  return Math.min(100, Math.max(0, (displayCurrentTime.value / d) * 100));
});

function calculateTimeFromX(clientX) {
  if (!scrubberRef.value || !library.duration) return 0;
  const rect = scrubberRef.value.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  return ratio * library.duration;
}

function handleScrubberClick(e) {
  const time = calculateTimeFromX(e.clientX);
  library.currentTime = time;
  library.seek(time);
}

function handleScrubberTouchStart(e) {
  isScrubbing.value = true;
  scrubTime.value = calculateTimeFromX(e.touches[0].clientX);
}

function handleScrubberTouchMove(e) {
  if (!isScrubbing.value) return;
  scrubTime.value = calculateTimeFromX(e.touches[0].clientX);
}

function handleScrubberTouchEnd() {
  if (isScrubbing.value) {
    library.currentTime = scrubTime.value;
    library.seek(scrubTime.value);
    isScrubbing.value = false;
  }
}

function handleScrubberMouseDown(e) {
  isScrubbing.value = true;
  scrubTime.value = calculateTimeFromX(e.clientX);

  function onMouseMove(moveEvent) {
    if (isScrubbing.value) {
      scrubTime.value = calculateTimeFromX(moveEvent.clientX);
    }
  }

  function onMouseUp() {
    if (isScrubbing.value) {
      library.currentTime = scrubTime.value;
      library.seek(scrubTime.value);
      isScrubbing.value = false;
    }
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

function formatTime(seconds) {
  if (!seconds || Number.isNaN(seconds)) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remaining}`;
}
</script>
