<template>
    <div class="song-list-container">

        <section class="playlist-cover">
          <img v-if="cover" class="playlist-cover-img" :src="cover" alt="Playlist Cover"/>
          <IconCover
              v-else
              :type="playlist?.id === library.FAVORITES_PLAYLIST_ID ? 'favorite' : 'playlist'"
              class="playlist-image"
          />
          <div v-if="playlist || album" class="playlist-actions">
            <button
              class="action-btn play"
              @click="playListNow"
              :aria-label="album ? 'Reproducir álbum' : 'Reproducir playlist'"
              :title="album ? 'Reproducir álbum' : 'Reproducir playlist'"
            >
              <Play fill="currentcolor"/>
            </button>

            <button
              class="action-btn queue"
              @click="addListToQueue"
              :aria-label="album ? 'Añadir álbum a la cola' : 'Añadir playlist a la cola'"
              :title="album ? 'Añadir a la cola' : 'Añadir a la cola'"
            >
              <ListPlus />
            </button>

            <button
              class="action-btn shuffle"
              @click="playRandomNow"
              :aria-label="album ? 'Reproducir aleatoriamente' : 'Reproducir playlist aleatoriamente'"
              :title="album ? 'Reproducir aleatoriamente' : 'Reproducir aleatoriamente'"
            >
              <Shuffle />
            </button>

            <div class="action-menu-wrapper" v-if="playlist && !isFavoritesPlaylist">
              <button
                class="action-btn menu"
                :class="{ active: showActionMenu }"
                @click.stop="toggleMenu"
                aria-label="Más opciones"
              >
                <MoreHorizontal />
              </button>

              <div v-if="showActionMenu" class="action-menu" @click.stop>
                <button v-if="!isFavoritesPlaylist" class="action-menu-item" @click="openAddSongs">
                  <Plus :size="15" />
                  <span>Añadir canciones</span>
                </button>
                <button v-if="!isFavoritesPlaylist" class="action-menu-item" @click="$emit('edit')">
                  <Pencil :size="15" />
                  <span>Editar playlist</span>
                </button>
                <button
                  v-if="!isFavoritesPlaylist"
                  class="action-menu-item delete"
                  @click="requestDeleteConfirmation"
                >
                  <Trash2 :size="15" />
                  <span>Borrar playlist</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <AddSongsModal
          v-if="showAddSongsModal"
          :playlist="playlist"
          :songs="library.songs"
          @close="showAddSongsModal = false"
        />
        <div v-if="!resolvedSongs.length" class="empty-playlist-state">
          <p v-if="isFavoritesPlaylist">Añade canciones a tus <strong>favoritos</strong> para que se muestren aqui</p>
          <p v-else>Esta playlist aún no tiene canciones.</p>
        </div>

        <ul v-else class="song-list">
            <li
            v-for="(song, index) in resolvedSongs" :key="song.id"
            @click="handleSongClick(song)"
            class="song-item"
            :class="{ 'dragging': props.isSortable && draggedIndex === index, 'drop-before': props.isSortable && draggedIndex !== null && hoverIndex === index && dropPosition === 'before', 'drop-after': props.isSortable && draggedIndex !== null && hoverIndex === index && dropPosition === 'after' }"
            :draggable="props.isSortable"
            @dragstart="handleDragStart($event, index)"
            @dragover.prevent="handleDragOver(index, $event)"
            @drop="handleDrop(index)"
            @dragend="handleDragEnd"
            >

                  <div class="song-cover">

                    <img
                      v-if="song.cover"
                      :src="song.cover"
                      :alt="song.title || song.name"
                      class="cover-image"
                    />

                    <DiscAlbum
                      v-else
                      class="cover-image"
                    />

                    <div class="song-info">
                      <span class="song-name">{{ song.title || song.name }}</span>
                      <span class="song-artist">{{ song.artist }}</span>

                    </div>

                  </div>

                <div class="song-actions">
                  <div
                    v-if="props.isSortable"
                    class="drag-handle"
                    aria-label="Arrastra para ordenar"
                    @click.stop
                    @touchstart.stop="handleTouchDragStart($event, index)"
                    @touchmove.prevent="handleTouchDragMove($event, index)"
                    @touchend="handleTouchDragEnd"
                  >
                    <GripVertical />
                  </div>

                  <button
                    class="favorite-toggle"
                    :class="{ active: song.favorite }"
                    @click.stop="library.toggleFavorite(song)"
                    :aria-label="song.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'"
                  >
                    <Heart v-if="!song.favorite"/>
                    <Heart fill="currentcolor" v-if=" song.favorite "/>
                  </button>

                  <span class="song-duration">{{ formatDuration(song.duration) }}</span>
                </div>

            </li>
        </ul>

        <div v-if="showDeleteConfirmModal" class="delete-confirm-modal" @click.self="cancelDeletePlaylist">
          <div class="delete-confirm-card">
            <h3>¿Eliminar esta playlist?</h3>
            <p>Esta acción no se puede deshacer.</p>
            <div class="delete-confirm-actions">
              <button class="cancel" @click="cancelDeletePlaylist">Cancelar</button>
              <button class="confirm" @click="confirmDeletePlaylist">Eliminar</button>
            </div>
          </div>
        </div>
    </div>
</template>

<script setup>
import { BookHeart, DiscAlbum, GripVertical, Heart, ListPlus, MoreHorizontal, Music2, Pencil, Play, Plus, Shuffle, Trash2 } from "lucide-vue-next";
import { useLibraryStore }
from "../../stores/libraryStore.js";
import Library from "../../pages/Library.vue";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import AddSongsModal from "../modals/AddSongsModal.vue"
import IconCover from "../common/IconCover.vue";

const library =
useLibraryStore();

const showAddSongsModal =
  ref(false);
const showActionMenu = ref(false);
const showDeleteConfirmModal = ref(false);

const props = defineProps({
    songs: Array,
    playlist: Object,
    album: Object,
    cover: String,
    isSortable: {
      type: Boolean,
      default: false
    }
});

const emit = defineEmits(["edit", "delete", "reorder"]);

const draggedIndex = ref(null);
const hoverIndex = ref(null);
const dropPosition = ref(null);
const isDragging = ref(false);
const justDropped = ref(false);

const isFavoritesPlaylist = computed(() => props.playlist?.id === library.FAVORITES_PLAYLIST_ID);

const resolvedSongs = computed(() => {
  if (props.album) return props.songs || [];
  if (!props.playlist) return props.songs || [];

  if (props.playlist.id === "all") {
    return props.songs || [];
  }

  const orderedIds = props.playlist.id === library.FAVORITES_PLAYLIST_ID
    ? (props.playlist.songIds || []).length
      ? props.playlist.songIds || []
      : (props.songs || []).filter((song) => song.favorite).map((song) => song.id)
    : props.playlist.songIds || [];

  const songsById = new Map((props.songs || []).map((song) => [song.id, song]));

  return orderedIds
    .map((id) => songsById.get(id))
    .filter(Boolean);
});

function startDrag(event, index) {
  draggedIndex.value = index;
  hoverIndex.value = index;
  dropPosition.value = null;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", String(index));
}

function handleSongClick(song) {
  if (isDragging.value || justDropped.value) return;
  library.playFromPlaylist(song, resolvedSongs.value);
  if (typeof window !== "undefined" && window.innerWidth <= 760) {
    library.openNowPlaying();
  }
}

function handleDragStart(event, index) {
  if (!props.isSortable) return;
  isDragging.value = true;
  draggedIndex.value = index;
  hoverIndex.value = index;
  dropPosition.value = null;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", String(index));
}

function handleDragOver(index, event) {
  if (!props.isSortable) return;

  const target = event.currentTarget;
  const rect = target.getBoundingClientRect();
  const midpoint = rect.top + rect.height / 2;

  hoverIndex.value = index;
  dropPosition.value = event.clientY < midpoint ? "before" : "after";
}

function handleDragEnd() {
  if (!props.isSortable) return;
  clearDrag();
}

function clearDrag() {
  draggedIndex.value = null;
  hoverIndex.value = null;
  dropPosition.value = null;
  isDragging.value = false;
}

function handleDrop(targetIndex) {
  if (!props.isSortable) return;

  if (draggedIndex.value === null || draggedIndex.value === targetIndex) {
    clearDrag();
    return;
  }

  const reordered = [...resolvedSongs.value];
  const targetSong = reordered[targetIndex];
  const [movedSong] = reordered.splice(draggedIndex.value, 1);
  const newTargetIndex = reordered.indexOf(targetSong);
  const insertIndex = dropPosition.value === "after" ? newTargetIndex + 1 : newTargetIndex;

  reordered.splice(insertIndex, 0, movedSong);

  const newSongIds = reordered.map((song) => song.id);
  emit("reorder", newSongIds);
  if (props.playlist?.id) {
    library.reorderPlaylistSongs(props.playlist.id, newSongIds);
  }

  clearDrag();
  justDropped.value = true;
  setTimeout(() => {
    justDropped.value = false;
  }, 200);
}

// Touch drag support for mobile devices
let touchStartY = 0;

function handleTouchDragStart(event, index) {
  if (!props.isSortable) return;
  isDragging.value = true;
  draggedIndex.value = index;
  hoverIndex.value = index;
  touchStartY = event.touches[0].clientY;
}

function handleTouchDragMove(event) {
  if (!isDragging.value || draggedIndex.value === null) return;
  const touch = event.touches[0];
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  const targetLi = el?.closest(".song-item");

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

function handleTouchDragEnd() {
  if (!isDragging.value || draggedIndex.value === null) return;
  if (hoverIndex.value !== null) {
    handleDrop(hoverIndex.value);
  } else {
    clearDrag();
  }
}

function dropSong(targetIndex) {
  handleDrop(targetIndex);
}

function toggleMenu() {
  showActionMenu.value = !showActionMenu.value;
}

function openAddSongs() {
  showActionMenu.value = false;
  showAddSongsModal.value = true;
}

function requestDeleteConfirmation() {
  showActionMenu.value = false;
  showDeleteConfirmModal.value = true;
}

function confirmDeletePlaylist() {
  if (!props.playlist) return;
  showDeleteConfirmModal.value = false;
  emit("delete", props.playlist.id);
}

function cancelDeletePlaylist() {
  showDeleteConfirmModal.value = false;
}

function handleOutsideClick() {
  if (showActionMenu.value) {
    showActionMenu.value = false;
  }
}

onMounted(() => {
  if (typeof window !== "undefined") {
    window.addEventListener("click", handleOutsideClick);
  }
});

onBeforeUnmount(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("click", handleOutsideClick);
  }
});

function playListNow() {
  if (!resolvedSongs.value.length) return;
  if (props.album) {
    library.recordAlbumPlayed(props.album);
  } else if (props.playlist) {
    library.recordPlaylistPlayed(props.playlist, resolvedSongs.value.length);
  }
  const [firstSong, ...rest] = resolvedSongs.value;
  library.playQueue = rest;
  library.playFromPlaylist(firstSong, resolvedSongs.value);
}

function addListToQueue() {
  if (!resolvedSongs.value.length) return;
  if (props.album) {
    library.recordAlbumPlayed(props.album);
  } else if (props.playlist) {
    library.recordPlaylistPlayed(props.playlist, resolvedSongs.value.length);
  }
  library.addSongsToQueue(resolvedSongs.value);
}

function playRandomNow() {
  if (!resolvedSongs.value.length) return;
  if (props.album) {
    library.recordAlbumPlayed(props.album);
  } else if (props.playlist) {
    library.recordPlaylistPlayed(props.playlist, resolvedSongs.value.length);
  }
  const shuffledSongs = library.smartShuffle(resolvedSongs.value);
  const [firstSong, ...rest] = shuffledSongs;
  library.playQueue = rest;
  library.playFromPlaylist(firstSong, shuffledSongs);
}

function addListToQueueRandom() {
  playRandomNow();
}

function deletePlaylist() {
  requestDeleteConfirmation();
}

function formatDuration(
  seconds
) {

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
