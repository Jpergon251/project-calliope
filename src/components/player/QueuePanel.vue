<template>
  <div class="queue-overlay" @click.self="$emit('close')">
    <div class="queue-drawer">
      <header class="queue-header">
        <div class="header-title">
          <div class="header-icon">
            <ListMusic class="icon" />
          </div>
          <div>
            <h3>Cola de reproducción</h3>
            <p>{{ queue.length }} canciones</p>
          </div>
        </div>

        <button class="close-button" @click="$emit('close')" aria-label="Cerrar cola">
          <X class="icon" />
        </button>
      </header>

      <div class="queue-body">
        <section v-if="previousSong" class="status-card previous-card">
          <div class="section-label">
            <SkipBack class="icon" />
            <span>Anterior</span>
          </div>
          <div class="song-card" @click="playPreviousFromPanel" role="button" tabindex="0" @keyup.enter="playPreviousFromPanel" @keyup.space.prevent="playPreviousFromPanel">
            <span class="song-name">{{ previousSong.name }}</span>
          </div>
        </section>

        <section class="status-card current-card">
          <div class="section-label">
            <Play class="icon" />
            <span>Reproduciendo ahora</span>
          </div>
          <div class="song-card">
            <span v-if="library.playingSong" class="song-name">
              {{ library.playingSong.name }}
            </span>
            <span v-else class="empty-state">No hay reproducción activa</span>
          </div>
        </section>

        <section class="queue-list">
          <div class="section-heading">
            <div class="section-label">
              <Music2 class="icon" />
              <span>Siguiente</span>
            </div>
            <span class="queue-count">{{ queue.length }} canciones</span>
          </div>

          <ul v-if="queue.length">
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
              @click="playSong(song)"
              @dragstart="startDrag($event, index)"
              @dragover.prevent="setDropPosition(index, $event)"
              @drop="dropSong(index)"
              @dragend="clearDrag"
            >
              <div class="song-info">
                <span class="song-index">{{ index + 1 }}</span>
                <div class="song-text">
                  <span class="song-name">{{ song.name }}</span>
                  <span class="song-meta">Listo para reproducir</span>
                </div>
              </div>

              <div class="song-controls">
                <div class="drag-handle" aria-label="Arrastra para ordenar">
                  <GripVertical class="icon" />
                </div>
              </div>
            </li>
          </ul>

          <div v-else class="empty-state">La cola está vacía</div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useLibraryStore } from "../../stores/libraryStore";
import {
  GripVertical,
  ListMusic,
  Music2,
  Play,
  SkipBack,
  X,
} from "lucide-vue-next";

const library = useLibraryStore();

const queue = computed(() => library.playQueue || []);

const playSong = (song) => {
  library.playSong(song, true, { removeFromQueue: true });
};

const playPreviousFromPanel = () => {
  if (!previousSong.value) return;
  library.playPreviousSong();
};

const previousSong = computed(() => {
  const history = library.historyQueue;

  return history.length ? history[history.length - 1] : null;
});

const draggedIndex = ref(null);
const hoverIndex = ref(null);
const dropPosition = ref(null);

const startDrag = (event, index) => {
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
};

const dropSong = (targetIndex) => {
  if (draggedIndex.value === null || draggedIndex.value === targetIndex) {
    clearDrag();
    return;
  }

  const queueCopy = [...library.playQueue];
  const [movedSong] = queueCopy.splice(draggedIndex.value, 1);
  const isMovingDown = draggedIndex.value < targetIndex;
  const insertIndex = dropPosition.value === "after"
    ? (isMovingDown ? targetIndex : targetIndex + 1)
    : (isMovingDown ? targetIndex - 1 : targetIndex);

  queueCopy.splice(insertIndex, 0, movedSong);
  library.playQueue = queueCopy;
  clearDrag();
};
</script>
