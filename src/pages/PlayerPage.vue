<template>
  <main
    class="player-page"
    :class="{ 'is-overlay': isOverlay }"
    :style="song?.cover ? { '--player-artwork-background': `url(${JSON.stringify(song.cover)})` } : undefined"
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
          <p class="song-artist-line">
            <span v-if="songArtists.length">
              <span
                v-for="(artName, idx) in songArtists"
                :key="artName"
                class="player-clickable-artist"
                @click.stop="goToArtist(artName)"
                :title="`Ver artista: ${artName}`"
              >
                {{ artName }}<span v-if="idx < songArtists.length - 1">, </span>
              </span>
            </span>
            <span v-else>{{ song.artist || 'Artista desconocido' }}</span>
          </p>
        </div>
        <div class="player-page-actions">
          <button
            type="button"
            class="favorite-button"
            :class="{ active: song.favorite }"
            :aria-label="song.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'"
            :title="song.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'"
            @click.stop="library.toggleFavorite(song)"
          >
            <Heart :fill="song.favorite ? 'currentColor' : 'none'" :size="20" />
          </button>
          <button
            type="button"
            class="rating-btn like-btn"
            :class="{ active: currentRating === 'like' }"
            :aria-label="currentRating === 'like' ? 'Quitar Me gusta' : 'Me gusta'"
            :title="currentRating === 'like' ? 'Quitar Me gusta' : 'Me gusta'"
            @click.stop="library.toggleLike(song)"
          >
            <ThumbsUp :fill="currentRating === 'like' ? 'currentColor' : 'none'" :size="19" />
          </button>
          <button
            type="button"
            class="rating-btn dislike-btn"
            :class="{ active: currentRating === 'dislike' }"
            :aria-label="currentRating === 'dislike' ? 'Quitar No me gusta' : 'No me gusta'"
            :title="currentRating === 'dislike' ? 'Quitar No me gusta' : 'No me gusta'"
            @click.stop="library.toggleDislike(song)"
          >
            <ThumbsDown :fill="currentRating === 'dislike' ? 'currentColor' : 'none'" :size="19" />
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
          :aria-valuetext="`${formatTime(displayCurrentTime)} de ${formatTime(library.duration)}`"
          aria-valuemin="0"
          :aria-valuemax="library.duration || 0"
          tabindex="0"
          @keydown="handleScrubberKeydown"
          @click="handleScrubberClick"
          @touchstart="handleScrubberTouchStart"
          @touchmove="handleScrubberTouchMove"
          @touchend="handleScrubberTouchEnd"
          @touchcancel="handleScrubberTouchEnd"
          @mousedown="handleScrubberMouseDown"
          @focus="handleScrubberFocus"
          @blur="handleScrubberBlur"
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
        <div class="player-page-control-group">
          <div class="player-page-transport">
            <button
              type="button"
              class="ctrl-btn shuffle-btn"
              :class="{ active: library.isShuffleEnabled }"
              :aria-label="library.isShuffleEnabled ? 'Reproducción aleatoria activada' : 'Reproducción aleatoria desactivada'"
              :title="library.isShuffleEnabled ? 'Reproducción aleatoria activada' : 'Reproducción aleatoria'"
              @click="library.toggleShuffle()"
            >
              <Shuffle :size="20" />
            </button>
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
            <button
              type="button"
              class="ctrl-btn autoplay-btn"
              :class="{ active: library.autoplay }"
              :aria-label="library.autoplay ? 'Desactivar reproducción automática' : 'Activar reproducción automática'"
              :title="library.autoplay ? 'Reproducción automática activada' : 'Reproducción automática desactivada'"
              @click="handleToggleAutoplay"
            >
              <Infinity :size="22" />
            </button>
          </div>
          <section class="player-page-volume" aria-label="Control de volumen">
            <VolumeModal :library="library" layout="bar" />
          </section>
        </div>
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
import {
  ChevronDown,
  Heart,
  Infinity,
  Music2,
  Pause,
  Play,
  Shuffle,
  SkipBack,
  SkipForward,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-vue-next';
import { useLibraryStore } from '../stores/libraryStore.js';
import AudioVisualizer from '../components/common/AudioVisualizer.vue';
import VolumeModal from '../components/player/VolumeModal.vue';
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

const songArtists = computed(() => {
  if (!song.value?.artist) return [];
  const parsed = library.parseArtistNames(song.value.artist);
  return parsed.length ? parsed : [song.value.artist];
});

const currentRating = computed(() => {
  if (!song.value?.id) return 'neutral';
  return library.getSongRating(song.value.id);
});

function goToArtist(name) {
  if (!name || name === 'Unknown' || name === 'Artista desconocido') return;
  emit('close');
  library.closeNowPlaying();
  library.closeQueue();
  router.push({ name: 'artist', params: { name: encodeURIComponent(name.trim()) } });
}

function handleToggleAutoplay() {
  library.toggleAutoplay();
}

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
const isScrubberFocused = ref(false);
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

function handleScrubberFocus() {
  isScrubberFocused.value = true;
}

function handleScrubberBlur() {
  isScrubberFocused.value = false;
}

function handleScrubberKeydown(e) {
  const offsets = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -10, PageUp: 10 };
  if (e.key === 'Home') {
    e.preventDefault();
    library.seek(0);
  } else if (e.key === 'End') {
    e.preventDefault();
    library.seek(library.duration);
  } else if (offsets[e.key]) {
    e.preventDefault();
    library.seek(Math.max(0, Math.min(library.duration, displayCurrentTime.value + offsets[e.key])));
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    const rect = scrubberRef.value?.getBoundingClientRect();
    if (rect) finishScrubbing(calculateTimeFromX(rect.left + rect.width * (displayCurrentTime.value / Math.max(1, library.duration))));
  }
}

function beginScrubbing(time) {
  isScrubbing.value = true;
  scrubTime.value = time;
  library.setProgressScrubbing(true);
}

function finishScrubbing(time = scrubTime.value) {
  library.currentTime = time;
  library.seek(time);
  library.setProgressScrubbing(false);
  isScrubbing.value = false;
}

function handleScrubberClick(e) {
  if (e.detail === 0 || isScrubbing.value) return;
  const time = calculateTimeFromX(e.clientX);
  library.seek(time);
}

function handleScrubberTouchStart(e) {
  beginScrubbing(calculateTimeFromX(e.touches[0].clientX));
}

function handleScrubberTouchMove(e) {
  if (!isScrubbing.value) return;
  scrubTime.value = calculateTimeFromX(e.touches[0].clientX);
  library.currentTime = scrubTime.value;
}

function handleScrubberTouchEnd() {
  if (isScrubbing.value) finishScrubbing();
}

function handleScrubberMouseDown(e) {
  if (e.button !== 0) return;
  beginScrubbing(calculateTimeFromX(e.clientX));

  function onMouseMove(moveEvent) {
    if (isScrubbing.value) {
      scrubTime.value = calculateTimeFromX(moveEvent.clientX);
      library.currentTime = scrubTime.value;
    }
  }

  function onMouseUp() {
    if (isScrubbing.value) finishScrubbing();
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
