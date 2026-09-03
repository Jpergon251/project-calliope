<template>
  <div class="queue-overlay" @click.self="$emit('close')">
    <div
      class="queue-drawer"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
    >
      <!-- Pull handle for mobile bottom sheet -->
      <div class="queue-pill" aria-hidden="true" @click="$emit('close')"></div>

      <header class="queue-header">
        <div class="header-title">
          <div class="header-icon">
            <ListMusic class="icon" />
          </div>
          <div>
            <h3>Cola de reproducción</h3>
            <p>{{ queue.length }} canciones en espera</p>
          </div>
        </div>

        <div class="header-actions">
          <button
            v-if="queue.length > 0"
            class="clear-queue-btn"
            type="button"
            @click="library.clearQueue()"
            title="Vaciar cola"
          >
            Vaciar
          </button>
          <button class="close-button" @click="$emit('close')" aria-label="Cerrar cola">
            <X class="icon" />
          </button>
        </div>
      </header>

      <div class="queue-body">
        <!-- Currently Playing Song (Prominent Neon Card) -->
        <section class="status-card current-card">
          <div class="section-label">
            <span class="pulse-dot"></span>
            <span>Sonando ahora</span>
          </div>

          <div v-if="library.playingSong" class="now-playing-item">
            <SongCover class="queue-item-cover" :song="library.playingSong" />
            <div class="song-details">
              <span class="song-title">{{ library.playingSong.title || library.playingSong.name }}</span>
              <span class="song-artist">{{ library.playingSong.artist || 'Artista desconocido' }}</span>
            </div>
            <button
              class="quick-play-btn"
              type="button"
              :aria-label="library.isPlaying ? 'Pausar' : 'Reproducir'"
              @click.stop="library.togglePlay()"
            >
              <Pause v-if="library.isPlaying" :size="18" fill="currentColor" />
              <Play v-else :size="18" fill="currentColor" />
            </button>
          </div>

          <div v-else class="empty-state">No hay reproducción activa</div>
        </section>

        <!-- Previous Song Card (if exists) -->
        <section v-if="previousSong" class="status-card previous-card">
          <div class="section-label">
            <SkipBack class="icon-sm" />
            <span>Anterior</span>
          </div>
          <div
            class="previous-item"
            role="button"
            tabindex="0"
            @click="playPreviousFromPanel"
            @keyup.enter="playPreviousFromPanel"
          >
            <SongCover class="queue-item-cover sm" :song="previousSong" />
            <div class="song-details">
              <span class="song-title">{{ previousSong.title || previousSong.name }}</span>
              <span class="song-artist">{{ previousSong.artist || 'Artista desconocido' }}</span>
            </div>
            <span class="replay-label">Volver a sonar</span>
          </div>
        </section>

        <!-- Next in Queue List -->
        <section class="queue-list-section">
          <div class="section-heading">
            <div class="section-label">
              <Music2 class="icon-sm" />
              <span>A continuación</span>
            </div>
            <span class="queue-count">{{ queue.length }} canciones</span>
          </div>

          <ul v-if="queue.length" class="queue-items">
            <li
              v-for="(song, index) in queue"
              :key="song.id"
              :class="{
                active: song.id === library.playingSong?.id,
                dragging: draggedIndex === index,
                'drop-before': draggedIndex !== null && hoverIndex === index && dropPosition === 'before',
                'drop-after': draggedIndex !== null && hoverIndex === index && dropPosition === 'after',
              }"
              draggable="true"
              @click="handleItemClick(song)"
              @dragstart="startDrag($event, index)"
              @dragover.prevent="setDropPosition(index, $event)"
              @drop="dropSong(index)"
              @dragend="clearDrag"
            >
              <div
                class="drag-handle"
                aria-label="Arrastra para ordenar"
                @click.stop
                @touchstart.stop="handleTouchQueueStart($event, index)"
                @touchmove.prevent="handleTouchQueueMove($event)"
                @touchend="handleTouchQueueEnd"
              >
                <GripVertical class="icon" />
              </div>

              <span class="song-index">{{ index + 1 }}</span>

              <SongCover class="queue-item-cover" :song="song" />

              <div class="song-info">
                <span class="song-name">{{ song.title || song.name }}</span>
                <span class="song-artist">{{ song.artist || 'Artista desconocido' }}</span>
              </div>

              <span v-if="song.duration" class="song-duration">{{ formatTime(song.duration) }}</span>

              <button
                class="remove-queue-btn"
                type="button"
                aria-label="Quitar de la cola"
                title="Quitar de la cola"
                @click.stop="library.removeFromQueue(index)"
              >
                <Trash2 :size="15" />
              </button>
            </li>
          </ul>

          <div v-else class="empty-queue-box">
            <Music2 class="empty-icon" />
            <p>La cola está vacía</p>
            <span>Reproduce una playlist o añade canciones para verlas aquí</span>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useLibraryStore } from "../../stores/libraryStore";
import SongCover from "../library/SongCover.vue";
import {
  GripVertical,
  ListMusic,
  Music2,
  Pause,
  Play,
  SkipBack,
  Trash2,
  X,
} from "lucide-vue-next";

const emit = defineEmits(["close"]);
const library = useLibraryStore();

const queue = computed(() => library.playQueue || []);

const previousSong = computed(() => {
  const history = library.historyQueue;
  return history.length ? history[history.length - 1] : null;
});

const playSong = (song) => {
  library.playSong(song, true, { removeFromQueue: true });
};

const playPreviousFromPanel = () => {
  if (!previousSong.value) return;
  library.playPreviousSong();
};

function formatTime(seconds) {
  if (!seconds || Number.isNaN(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}

// Mobile touch swipe to dismiss
let touchStartY = 0;
let isDraggingDown = false;

function handleTouchStart(e) {
  if (e.touches[0].clientY < window.innerHeight * 0.45) {
    touchStartY = e.touches[0].clientY;
    isDraggingDown = true;
  }
}

function handleTouchMove(e) {
  if (!isDraggingDown) return;
  const currentY = e.touches[0].clientY;
  if (currentY - touchStartY > 80) {
    isDraggingDown = false;
    emit("close");
  }
}

function handleTouchEnd() {
  isDraggingDown = false;
}

// Drag & drop reorder logic
const draggedIndex = ref(null);
const hoverIndex = ref(null);
const dropPosition = ref(null);
const isDraggingItem = ref(false);
const justDroppedItem = ref(false);

function handleItemClick(song) {
  if (isDraggingItem.value || justDroppedItem.value) return;
  playSong(song);
}

const startDrag = (event, index) => {
  isDraggingItem.value = true;
  draggedIndex.value = index;
  hoverIndex.value = index;
  dropPosition.value = null;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", String(index));
};

const setDropPosition = (index, event) => {
  const rect = event.currentTarget.getBoundingClientRect();
  hoverIndex.value = index;
  dropPosition.value = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
};

const clearDrag = () => {
  draggedIndex.value = null;
  hoverIndex.value = null;
  dropPosition.value = null;
  isDraggingItem.value = false;
};

const dropSong = (targetIndex) => {
  if (draggedIndex.value === null || draggedIndex.value === targetIndex) {
    clearDrag();
    return;
  }

  const queueCopy = [...library.playQueue];
  const targetSong = queueCopy[targetIndex];
  const [movedSong] = queueCopy.splice(draggedIndex.value, 1);
  const newTargetIndex = queueCopy.indexOf(targetSong);
  const insertIndex = dropPosition.value === "after" ? newTargetIndex + 1 : newTargetIndex;

  queueCopy.splice(insertIndex, 0, movedSong);
  library.playQueue = queueCopy;

  clearDrag();
  justDroppedItem.value = true;
  setTimeout(() => {
    justDroppedItem.value = false;
  }, 200);
};

// Touch drag on mobile
function handleTouchQueueStart(e, index) {
  isDraggingItem.value = true;
  draggedIndex.value = index;
  hoverIndex.value = index;
}

function handleTouchQueueMove(e) {
  if (!isDraggingItem.value || draggedIndex.value === null) return;
  const touch = e.touches[0];
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  const targetLi = el?.closest(".queue-items li");

  if (targetLi && targetLi.parentElement) {
    const listItems = Array.from(targetLi.parentElement.children);
    const targetIdx = listItems.indexOf(targetLi);

    if (targetIdx !== -1) {
      hoverIndex.value = targetIdx;
      const rect = targetLi.getBoundingClientRect();
      dropPosition.value = touch.clientY < rect.top + rect.height / 2 ? "before" : "after";
    }
  }
}

function handleTouchQueueEnd() {
  if (!isDraggingItem.value || draggedIndex.value === null) return;
  if (hoverIndex.value !== null) {
    dropSong(hoverIndex.value);
  } else {
    clearDrag();
  }
}
</script>
