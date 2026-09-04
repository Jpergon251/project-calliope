<template>
  <div
    class="queue-overlay-backdrop"
    role="dialog"
    aria-modal="true"
    aria-label="Cola de reproducción"
    @click.self="handleClose"
  >
    <div
      class="queue-overlay-panel"
      ref="panelRef"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
    >
      <!-- Mobile drag handle pill -->
      <div
        class="queue-drag-pill"
        aria-hidden="true"
        @click="handleClose"
        title="Desliza o haz clic para cerrar"
      ></div>

      <!-- Header -->
      <header class="queue-panel-header">
        <div class="header-main-info">
          <div class="queue-icon-badge">
            <ListMusic class="badge-icon" />
          </div>
          <div class="header-text-group">
            <h2 class="queue-title">Cola de reproducción</h2>
            <p class="queue-subtitle">
              <span>{{ upcomingSubtitle }}</span>
              <span v-if="totalQueueDurationFormatted" class="dot-separator"
                >•</span
              >
              <span
                v-if="totalQueueDurationFormatted"
                class="duration-highlight"
              >
                {{ totalQueueDurationFormatted }}
              </span>
            </p>
          </div>
        </div>

        <div class="header-controls">
          <button
            v-if="queue.length > 0"
            type="button"
            class="action-pill-btn clear-btn"
            @click="handleClearQueue"
            title="Vaciar canciones en espera"
            aria-label="Vaciar cola de reproducción"
          >
            <Trash2 class="btn-icon" />
            <span>Vaciar</span>
          </button>

          <button
            type="button"
            class="close-round-btn"
            @click="handleClose"
            title="Cerrar cola (Esc)"
            aria-label="Cerrar cola de reproducción"
          >
            <X class="btn-icon" />
          </button>
        </div>
      </header>

      <!-- View Selector Tabs & Mode Toggles Toolbar -->
      <div class="queue-toolbar-row">
        <nav class="queue-view-tabs" aria-label="Secciones de la cola">
          <button
            type="button"
            class="queue-tab-btn"
            :class="{ active: activeTab === 'all' }"
            @click="activeTab = 'all'"
          >
            <span>Todos</span>
          </button>

          <button
            type="button"
            class="queue-tab-btn"
            :class="{ active: activeTab === 'upcoming' }"
            @click="activeTab = 'upcoming'"
          >
            <span>A continuación</span>
            <span class="tab-badge" v-if="queue.length">{{ queue.length }}</span>
          </button>

          <button
            type="button"
            class="queue-tab-btn"
            :class="{ active: activeTab === 'history' }"
            @click="activeTab = 'history'"
          >
            <span>Ya escuchados</span>
            <span class="tab-badge muted" v-if="historyQueue.length">{{
              historyQueue.length
            }}</span>
          </button>
        </nav>

        <div class="queue-mode-toggles">
          <button
            type="button"
            class="action-pill-btn shuffle-toggle-btn"
            :class="{ active: library.isShuffleEnabled }"
            @click="library.toggleShuffle()"
            :title="library.isShuffleEnabled ? 'Reproducción aleatoria activada' : 'Reproducción aleatoria'"
            :aria-label="library.isShuffleEnabled ? 'Reproducción aleatoria activada' : 'Reproducción aleatoria desactivada'"
          >
            <Shuffle class="btn-icon" />
            <span class="mode-label">Aleatorio</span>
          </button>

          <button
            type="button"
            class="action-pill-btn autoplay-toggle-btn"
            :class="{ active: library.autoplay }"
            @click="library.toggleAutoplay()"
            :title="library.autoplay ? 'Reproducción automática activada' : 'Activar reproducción automática'"
            aria-label="Alternar reproducción automática"
          >
            <Infinity class="btn-icon" />
            <span class="mode-label">Autoplay</span>
          </button>
        </div>
      </div>

      <!-- Main Scrollable Body -->
      <div class="queue-scroll-body" ref="scrollBodyRef">
        <!-- 1. CURRENTLY PLAYING CARD (OLED NEON HERO) -->
        <section
          v-if="activeTab !== 'history'"
          class="queue-now-playing-card"
          aria-label="Canción en reproducción actual"
        >
          <div class="card-status-strip">
            <div class="pulse-indicator">
              <span class="pulse-dot"></span>
              <span class="status-label">SONANDO AHORA</span>
            </div>

            <!-- Animated Soundwave Equalizer -->
            <div
              v-if="library.isPlaying"
              class="mini-equalizer"
              aria-hidden="true"
            >
              <span class="eq-bar bar-1"></span>
              <span class="eq-bar bar-2"></span>
              <span class="eq-bar bar-3"></span>
              <span class="eq-bar bar-4"></span>
            </div>
          </div>

          <div v-if="currentSong || library.playingSong" class="hero-song-row">
            <div class="hero-cover-wrap" @click="handleOpenNowPlaying">
              <SongCover class="hero-cover" :song="currentSong || library.playingSong" />
              <div class="cover-hover-overlay" title="Ver en pantalla completa">
                <Maximize2 class="zoom-icon" />
              </div>
            </div>

            <div class="hero-info" @click="handleOpenNowPlaying">
              <h3
                class="hero-title"
                :title="(currentSong || library.playingSong).title || (currentSong || library.playingSong).name"
              >
                {{ (currentSong || library.playingSong).title || (currentSong || library.playingSong).name }}
              </h3>
              <p
                class="hero-artist"
                :title="(currentSong || library.playingSong).artist || 'Artista desconocido'"
              >
                <span v-if="currentSongArtists.length">
                  <span
                    v-for="(artName, idx) in currentSongArtists"
                    :key="artName"
                    class="queue-clickable-artist"
                    @click.stop="goToArtist(artName)"
                    :title="`Ver artista: ${artName}`"
                  >
                    {{ artName }}<span v-if="idx < currentSongArtists.length - 1">, </span>
                  </span>
                </span>
                <span v-else>{{ (currentSong || library.playingSong).artist || "Artista desconocido" }}</span>
              </p>
              <span
                v-if="(currentSong || library.playingSong).album"
                class="hero-album"
                :title="(currentSong || library.playingSong).album"
              >
                {{ (currentSong || library.playingSong).album }}
              </span>
            </div>

            <div class="hero-actions">
              <button
                type="button"
                class="hero-action-btn fav-btn"
                :class="{ active: (currentSong || library.playingSong).favorite }"
                :aria-label="
                  (currentSong || library.playingSong).favorite
                    ? 'Quitar de favoritos'
                    : 'Añadir a favoritos'
                "
                :title="
                  (currentSong || library.playingSong).favorite
                    ? 'Quitar de favoritos'
                    : 'Añadir a favoritos'
                "
                @click.stop="library.toggleFavorite(currentSong || library.playingSong)"
              >
                <Heart
                  :size="18"
                  :fill="(currentSong || library.playingSong).favorite ? 'currentColor' : 'none'"
                />
              </button>

              <button
                type="button"
                class="hero-action-btn like-btn"
                :class="{ active: currentSongRating === 'like' }"
                :aria-label="
                  currentSongRating === 'like'
                    ? 'Quitar Me gusta'
                    : 'Me gusta'
                "
                :title="currentSongRating === 'like' ? 'Quitar Me gusta' : 'Me gusta'"
                @click.stop="library.toggleLike(currentSong || library.playingSong)"
              >
                <ThumbsUp
                  :size="18"
                  :fill="currentSongRating === 'like' ? 'currentColor' : 'none'"
                />
              </button>

              <button
                type="button"
                class="hero-action-btn dislike-btn"
                :class="{ active: currentSongRating === 'dislike' }"
                :aria-label="
                  currentSongRating === 'dislike'
                    ? 'Quitar No me gusta'
                    : 'No me gusta'
                "
                :title="currentSongRating === 'dislike' ? 'Quitar No me gusta' : 'No me gusta'"
                @click.stop="library.toggleDislike(currentSong || library.playingSong)"
              >
                <ThumbsDown
                  :size="18"
                  :fill="currentSongRating === 'dislike' ? 'currentColor' : 'none'"
                />
              </button>

              <button
                type="button"
                class="hero-play-btn"
                :class="{ playing: library.isPlaying }"
                :aria-label="library.isPlaying ? 'Pausar' : 'Reproducir'"
                @click.stop="library.togglePlay()"
              >
                <Pause
                  v-if="library.isPlaying"
                  :size="20"
                  fill="currentColor"
                />
                <Play v-else :size="20" fill="currentColor" />
              </button>
            </div>
          </div>

          <div v-else class="hero-empty-state">
            <Music2 class="empty-hero-icon" />
            <div class="empty-hero-text">
              <p class="hero-empty-msg">
                No hay ninguna canción reproduciéndose
              </p>
              <span
                >Elige una pista de tu biblioteca o añade elementos a la
                cola</span
              >
            </div>
          </div>
        </section>

        <!-- 2. UPCOMING QUEUE SECTION -->
        <section
          v-if="activeTab === 'all' || activeTab === 'upcoming'"
          class="queue-section upcoming-section"
          aria-label="Canciones siguientes"
        >
          <div class="section-title-bar">
            <div class="title-left">
              <ListOrdered class="section-icon" />
              <h3 class="section-title">A continuación</h3>
              <span class="count-tag">{{ queue.length }}</span>
            </div>

            <div v-if="queue.length > 1" class="drag-hint">
              <GripVertical class="hint-icon" />
              <span>Arrastra para reordenar</span>
            </div>
          </div>

          <!-- Queue Track Items List -->
          <ul
            v-if="queue.length > 0"
            class="queue-track-list"
            @dragover.prevent="handleListDragOver"
            @drop="handleListDrop"
          >
            <li
              v-for="(song, index) in queue"
              :key="song.id"
              class="queue-track-row"
              :class="{
                'is-current': isSongCurrent(song),
                'is-playing': isSongPlaying(song),
                'is-dragging': draggedIndex === index,
                'drop-indicator-top':
                  hoverIndex === index && dropPosition === 'before',
                'drop-indicator-bottom':
                  hoverIndex === index && dropPosition === 'after',
              }"
              draggable="true"
              @click="handleTrackClick(index)"
              @dragstart="handleDragStart($event, index)"
              @dragover.prevent="handleDragOver($event, index)"
              @drop="handleDrop(index)"
              @dragend="handleDragEnd"
            >
              <!-- Drag Handle -->
              <div
                class="track-drag-handle"
                aria-label="Arrastrar canción para cambiar el orden"
                title="Arrastra para reordenar"
                @click.stop
                @touchstart.stop="handleTouchItemStart($event, index)"
                @touchmove.prevent="handleTouchItemMove($event)"
                @touchend="handleTouchItemEnd"
              >
                <GripVertical class="handle-icon" />
              </div>

              <!-- Track Number Index or Playing Indicator -->
              <div
                v-if="isSongPlaying(song)"
                class="track-playing-indicator"
                aria-label="Sonando ahora"
                title="Sonando ahora"
              >
                <span class="mini-eq-bar eq-1"></span>
                <span class="mini-eq-bar eq-2"></span>
                <span class="mini-eq-bar eq-3"></span>
              </div>
              <span v-else class="track-order-num">{{ index + 1 }}</span>

              <!-- Artwork Thumbnail -->
              <div class="track-cover-container">
                <SongCover class="track-cover" :song="song" />
                <button
                  type="button"
                  class="cover-play-badge"
                  :aria-label="isSongPlaying(song) ? 'Pausar' : 'Reproducir ahora'"
                  @click.stop="handleTrackPlayToggle(song, index)"
                >
                  <Pause v-if="isSongPlaying(song)" :size="13" fill="currentColor" />
                  <Play v-else :size="13" fill="currentColor" />
                </button>
              </div>

              <!-- Track Meta -->
              <div class="track-meta">
                <span class="track-title" :title="song.title || song.name">
                  {{ song.title || song.name }}
                </span>
                <span
                  class="track-artist"
                  :title="song.artist || 'Artista desconocido'"
                >
                  <span v-if="getSongArtists(song).length">
                    <span
                      v-for="(artName, idx) in getSongArtists(song)"
                      :key="artName"
                      class="queue-clickable-artist"
                      @click.stop="goToArtist(artName)"
                      :title="`Ver artista: ${artName}`"
                    >
                      {{ artName }}<span v-if="idx < getSongArtists(song).length - 1">, </span>
                    </span>
                  </span>
                  <span v-else>{{ song.artist || "Artista desconocido" }}</span>
                </span>
              </div>

              <!-- Duration -->
              <span class="track-duration">{{
                formatTime(song.duration)
              }}</span>

              <!-- Action: Remove -->
              <button
                type="button"
                class="track-action-btn remove-btn"
                title="Eliminar de la cola"
                :aria-label="`Quitar ${song.title || song.name} de la cola`"
                @click.stop="handleRemoveTrack(index)"
              >
                <Trash2 :size="16" />
              </button>
            </li>
          </ul>

          <!-- Empty Queue Placeholder -->
          <div v-else class="queue-empty-box">
            <div class="empty-icon-wrap">
              <Music2 class="empty-svg" />
            </div>
            <h4 class="empty-heading">No hay canciones a continuación</h4>
            <p class="empty-desc">
              Añade canciones desde cualquier playlist, álbum o canción para que
              sigan sonando automáticamente.
            </p>
          </div>
        </section>

        <!-- 3. PREVIOUSLY PLAYED / HISTORY QUEUE SECTION -->
        <section
          v-if="
            (activeTab === 'all' || activeTab === 'history') &&
            (historyQueue.length > 0 || activeTab === 'history')
          "
          class="queue-section history-section"
          aria-label="Canciones reproducidas recientemente"
        >
          <div class="section-title-bar">
            <div class="title-left">
              <History class="section-icon" />
              <h3 class="section-title">Ya escuchados</h3>
              <span class="count-tag muted">{{ historyQueue.length }}</span>
            </div>

            <button
              v-if="historyQueue.length > 0"
              type="button"
              class="clear-history-text-btn"
              @click="library.clearHistoryQueue()"
              title="Borrar historial de esta sesión"
            >
              Limpiar
            </button>
          </div>

          <ul
            v-if="historyQueue.length > 0"
            class="queue-track-list history-list"
          >
            <li
              v-for="song in reversedHistory"
              :key="`hist-${song.id}`"
              class="queue-track-row history-row"
              @click="handlePlayHistoryTrack(song)"
            >
              <div class="history-play-icon" aria-hidden="true">
                <RotateCcw :size="14" />
              </div>

              <div class="track-cover-container sm">
                <SongCover class="track-cover" :song="song" />
              </div>

              <div class="track-meta">
                <span class="track-title" :title="song.title || song.name">
                  {{ song.title || song.name }}
                </span>
                <span
                  class="track-artist"
                  :title="song.artist || 'Artista desconocido'"
                >
                  <span v-if="getSongArtists(song).length">
                    <span
                      v-for="(artName, idx) in getSongArtists(song)"
                      :key="artName"
                      class="queue-clickable-artist"
                      @click.stop="goToArtist(artName)"
                      :title="`Ver artista: ${artName}`"
                    >
                      {{ artName }}<span v-if="idx < getSongArtists(song).length - 1">, </span>
                    </span>
                  </span>
                  <span v-else>{{ song.artist || "Artista desconocido" }}</span>
                </span>
              </div>

              <span class="track-duration">{{
                formatTime(song.duration)
              }}</span>

              <div class="history-actions" @click.stop>
                <button
                  type="button"
                  class="track-action-btn add-back-btn"
                  title="Añadir a la cola siguiente"
                  aria-label="Añadir a la cola siguiente"
                  @click="library.addToQueue(song)"
                >
                  <ListPlus :size="16" />
                </button>

                <button
                  type="button"
                  class="track-action-btn play-again-btn"
                  title="Volver a reproducir"
                  aria-label="Volver a reproducir"
                  @click="handlePlayHistoryTrack(song)"
                >
                  <Play :size="15" fill="currentColor" />
                </button>
              </div>
            </li>
          </ul>

          <div v-else class="queue-empty-box compact">
            <History class="empty-svg-sm" />
            <p class="empty-desc">
              No hay canciones reproducidas aún en esta sesión.
            </p>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from "vue";
import { useRouter } from "vue-router";
import { useLibraryStore } from "../../stores/libraryStore.js";
import SongCover from "../library/SongCover.vue";
import {
  GripVertical,
  Heart,
  History,
  Infinity,
  ListMusic,
  ListOrdered,
  ListPlus,
  Maximize2,
  Music2,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-vue-next";

const emit = defineEmits(["close"]);
const router = useRouter();
const library = useLibraryStore();

const panelRef = ref(null);
const scrollBodyRef = ref(null);
const activeTab = ref("all"); // 'all' | 'upcoming' | 'history'

// ==========================================
// REACTIVE DATA
// ==========================================

const queue = computed(() => library.playQueue || []);
const historyQueue = computed(() => library.historyQueue || []);
const currentSong = computed(() => library.playingSong);

function getSongArtists(song) {
  if (!song?.artist) return [];
  const parsed = library.parseArtistNames(song.artist);
  return parsed.length ? parsed : [song.artist];
}

const currentSongArtists = computed(() => {
  const song = currentSong.value || library.playingSong;
  if (!song?.artist) return [];
  const parsed = library.parseArtistNames(song.artist);
  return parsed.length ? parsed : [song.artist];
});

const currentSongRating = computed(() => {
  const song = currentSong.value || library.playingSong;
  if (!song?.id) return "neutral";
  return library.getSongRating(song.id);
});

function isSongCurrent(song) {
  if (!song?.id) return false;
  const current = currentSong.value || library.playingSong;
  return song.id === current?.id;
}

function isSongPlaying(song) {
  return isSongCurrent(song) && library.isPlaying;
}

function handleTrackPlayToggle(song, index) {
  if (isSongCurrent(song)) {
    library.togglePlay();
  } else {
    handleTrackClick(index);
  }
}

function goToArtist(name) {
  if (!name || name === "Unknown" || name === "Artista desconocido") return;
  emit("close");
  library.closeQueue();
  library.closeNowPlaying();
  router.push({ name: "artist", params: { name: encodeURIComponent(name.trim()) } });
}

const reversedHistory = computed(() => {
  return [...(library.historyQueue || [])].reverse();
});

const totalQueueSeconds = computed(() => {
  return queue.value.reduce(
    (acc, song) => acc + (Number(song?.duration) || 0),
    0,
  );
});

const totalQueueDurationFormatted = computed(() => {
  const sec = totalQueueSeconds.value;
  if (!sec || Number.isNaN(sec) || sec <= 0) return "";
  const minutes = Math.floor(sec / 60);
  const remainingSec = Math.floor(sec % 60);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours} h ${mins} min`;
  }
  return `${minutes}:${remainingSec.toString().padStart(2, "0")}`;
});

const upcomingSubtitle = computed(() => {
  const count = queue.value.length;
  if (count === 0) return "Sin canciones en espera";
  if (count === 1) return "1 canción siguiente";
  return `${count} canciones siguientes`;
});

function formatTime(seconds) {
  if (!seconds || Number.isNaN(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remaining}`;
}

// ==========================================
// NAVIGATION & MODAL CONTROLS
// ==========================================

function handleClose() {
  emit("close");
  library.closeQueue();
}

function handleOpenNowPlaying() {
  const current = currentSong.value || library.playingSong;
  if (current) {
    library.openNowPlaying();
  }
}

function handleKeyDown(event) {
  if (event.key === "Escape") {
    handleClose();
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeyDown);
  document.body.style.overflow = "hidden";
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeyDown);
  document.body.style.overflow = "";
});

// ==========================================
// MOBILE TOUCH SWIPE TO DISMISS
// ==========================================

let touchStartY = 0;
let isSwipeActive = false;

function handleTouchStart(e) {
  const touch = e.touches[0];
  // If user touches near the top header or drag pill, activate swipe to close
  if (
    touch.clientY < window.innerHeight * 0.35 ||
    scrollBodyRef.value?.scrollTop === 0
  ) {
    touchStartY = touch.clientY;
    isSwipeActive = true;
  }
}

function handleTouchMove(e) {
  if (!isSwipeActive) return;
  const currentY = e.touches[0].clientY;
  const diff = currentY - touchStartY;
  if (diff > 90) {
    isSwipeActive = false;
    handleClose();
  }
}

function handleTouchEnd() {
  isSwipeActive = false;
}

// ==========================================
// TRACK ACTIONS
// ==========================================

const isInteractingWithItem = ref(false);

function handleTrackClick(index) {
  if (isInteractingWithItem.value) return;
  library.playQueueSong(index);
}

function handlePlayHistoryTrack(song) {
  if (isInteractingWithItem.value || !song) return;
  library.playHistorySong(song);
}

function handleRemoveTrack(index) {
  library.removeFromQueue(index);
}

function handleClearQueue() {
  library.clearQueue();
}

// ==========================================
// DRAG & DROP REORDER (DESKTOP + MOBILE)
// ==========================================

const draggedIndex = ref(null);
const hoverIndex = ref(null);
const dropPosition = ref(null); // 'before' | 'after'

function calculateDropPosition(cursorY, rect, index) {
  const relY = cursorY - rect.top;
  const ratio = Math.max(0, Math.min(1, relY / rect.height));

  // Generous margin based on drag direction:
  // Moving downwards: prefer 'after' unless pointer is in top 20%
  // Moving upwards: prefer 'before' unless pointer is in bottom 20%
  if (draggedIndex.value !== null && draggedIndex.value < index) {
    return ratio < 0.2 ? "before" : "after";
  } else if (draggedIndex.value !== null && draggedIndex.value > index) {
    return ratio > 0.8 ? "after" : "before";
  }
  return ratio < 0.5 ? "before" : "after";
}

function handleDragStart(event, index) {
  isInteractingWithItem.value = true;
  draggedIndex.value = index;
  hoverIndex.value = index;
  dropPosition.value = null;

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  }
}

function handleDragOver(event, index) {
  hoverIndex.value = index;
  const rect = event.currentTarget.getBoundingClientRect();
  dropPosition.value = calculateDropPosition(event.clientY, rect, index);
}

function handleListDragOver(event) {
  if (draggedIndex.value === null) return;
  const listItems = event.currentTarget.querySelectorAll(".queue-track-row");
  if (!listItems.length) return;
  const lastItem = listItems[listItems.length - 1];
  const lastRect = lastItem.getBoundingClientRect();
  if (event.clientY > lastRect.bottom) {
    hoverIndex.value = queue.value.length - 1;
    dropPosition.value = "after";
  }
}

function handleListDrop() {
  if (draggedIndex.value === null) return;
  if (hoverIndex.value !== null) {
    handleDrop(hoverIndex.value);
  }
}

function handleDrop(targetIndex) {
  if (
    draggedIndex.value === null ||
    targetIndex === null ||
    targetIndex === undefined
  ) {
    handleDragEnd();
    return;
  }

  const fromIndex = draggedIndex.value;
  const position = dropPosition.value || "after";

  const targetSong = queue.value[targetIndex];
  if (!targetSong) {
    handleDragEnd();
    return;
  }

  const queueCopy = [...queue.value];
  const [movedSong] = queueCopy.splice(fromIndex, 1);

  let targetPos = queueCopy.findIndex((s) => s.id === targetSong.id);
  if (targetPos === -1) {
    targetPos = targetIndex;
  }

  const insertIndex = position === "after" ? targetPos + 1 : targetPos;
  const clampedIndex = Math.max(0, Math.min(queueCopy.length, insertIndex));

  queueCopy.splice(clampedIndex, 0, movedSong);
  library.playQueue = queueCopy;

  handleDragEnd();

  setTimeout(() => {
    isInteractingWithItem.value = false;
  }, 150);
}

function handleDragEnd() {
  draggedIndex.value = null;
  hoverIndex.value = null;
  dropPosition.value = null;
  setTimeout(() => {
    isInteractingWithItem.value = false;
  }, 100);
}

// Mobile Touch Item Drag
function handleTouchItemStart(event, index) {
  isInteractingWithItem.value = true;
  draggedIndex.value = index;
  hoverIndex.value = index;
  dropPosition.value = null;
}

function handleTouchItemMove(event) {
  if (draggedIndex.value === null) return;
  const touch = event.touches[0];
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  const targetRow = el?.closest(".queue-track-row");

  if (targetRow && targetRow.parentElement) {
    const rows = Array.from(targetRow.parentElement.children);
    const targetIdx = rows.indexOf(targetRow);

    if (targetIdx !== -1) {
      hoverIndex.value = targetIdx;
      const rect = targetRow.getBoundingClientRect();
      dropPosition.value = calculateDropPosition(
        touch.clientY,
        rect,
        targetIdx,
      );
    }
  }
}

function handleTouchItemEnd() {
  if (draggedIndex.value !== null && hoverIndex.value !== null) {
    handleDrop(hoverIndex.value);
  } else {
    handleDragEnd();
  }
}
</script>
