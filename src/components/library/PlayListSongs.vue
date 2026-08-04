<template>
    <div class="song-list-container">

        <section class="playlist-cover">
          <img v-if="cover" class="playlist-cover-img" :src="cover" alt="Playlist Cover"/>
          <IconCover v-else class="icon-cover"/>

          <div v-if="playlist" class="playlist-actions">
            <button class="action-btn play" @click="playListNow" aria-label="Reproducir playlist">
              <Play fill="currentcolor"/>
            </button>

            <button class="action-btn queue" @click="addListToQueue" aria-label="Añadir playlist a la cola">
              <ListPlus />
            </button>

            <button class="action-btn shuffle" @click="addListToQueueRandom" aria-label="Añadir playlist a la cola aleatoria">
              <Shuffle />
            </button>

            <div class="action-menu-wrapper" v-if="!isFavoritesPlaylist">
              <button class="action-btn menu" @click="toggleMenu" aria-label="Más opciones">
                <MoreHorizontal />
              </button>

              <div v-if="showActionMenu" class="action-menu">
                <button v-if="!isFavoritesPlaylist" @click="openAddSongs">
                  <Plus /> Añadir canciones
                </button>
                <button v-if="!isFavoritesPlaylist" @click="$emit('edit')">
                  <Pencil /> Editar playlist
                </button>
                <button v-if="!isFavoritesPlaylist" @click="requestDeleteConfirmation">
                  <Trash2 /> Borrar playlist
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
            @click="library.playFromPlaylist(song, resolvedSongs)"
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
                      :alt="song.name"
                      class="cover-image"
                    />

                    <DiscAlbum
                      v-else
                      class="cover-image"
                    />

                    <div class="song-info">
                      <span class="song-name">{{ song.name }}</span>
                      <span class="song-artist">{{ song.artist }}</span>

                    </div>
                    
                  </div>
                
                <div class="song-actions">
                  <div v-if="props.isSortable" class="drag-handle" aria-label="Arrastra para ordenar">
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
import { computed, ref } from "vue";
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

const isFavoritesPlaylist = computed(() => props.playlist?.id === library.FAVORITES_PLAYLIST_ID);

const resolvedSongs = computed(() => {
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

function handleDragStart(event, index) {
  if (!props.isSortable) return;
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
}

function handleDrop(targetIndex) {
  if (!props.isSortable) return;

  if (draggedIndex.value === null || draggedIndex.value === targetIndex) {
    clearDrag();
    return;
  }

  const reordered = [...resolvedSongs.value];
  const [movedSong] = reordered.splice(draggedIndex.value, 1);

  let insertIndex = targetIndex;

  if (dropPosition.value === "before") {
    insertIndex = draggedIndex.value < targetIndex ? targetIndex - 1 : targetIndex;
  } else if (dropPosition.value === "after") {
    insertIndex = draggedIndex.value < targetIndex ? targetIndex : targetIndex + 1;
  }

  reordered.splice(insertIndex, 0, movedSong);

  emit("reorder", reordered.map((song) => song.id));
  library.reorderPlaylistSongs(props.playlist.id, reordered.map((song) => song.id));
  clearDrag();
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

function playListNow() {
  if (!resolvedSongs.value.length) return;
  const [firstSong, ...rest] = resolvedSongs.value;
  library.playQueue = rest;
  library.playFromPlaylist(firstSong, resolvedSongs.value);
}

function addListToQueue() {
  library.playQueue = [...(library.playQueue || []), ...resolvedSongs.value];
}

function addListToQueueRandom() {
  const queue = [...(library.playQueue || [])];
  const shuffledSongs = [...resolvedSongs.value].sort(() => Math.random() - 0.5);
  queue.push(...shuffledSongs);
  library.playQueue = queue;
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
