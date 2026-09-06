<template>
  <div
    class="modal-backdrop add-songs-backdrop"
    role="dialog"
    aria-modal="true"
    aria-labelledby="add-songs-title"
    @click.self="$emit('close')"
    @keydown.esc="$emit('close')"
  >
    <div class="modal-card add-songs-card">
      <!-- Encabezado fijo -->
      <header class="modal-header">
        <div class="header-titles">
          <h2 id="add-songs-title" class="title">Añadir canciones</h2>
          <p class="subtitle">
            Añadir a <span class="playlist-name">{{ playlist?.name || 'la playlist' }}</span>
          </p>
        </div>

        <button
          type="button"
          class="close-button"
          aria-label="Cerrar modal"
          @click="$emit('close')"
        >
          <X class="icon" />
        </button>
      </header>

      <!-- Barra de búsqueda y selección masiva -->
      <section class="modal-controls">
        <div class="search-box">
          <Search class="search-icon" :size="18" />
          <input
            ref="searchInputRef"
            v-model="search"
            type="search"
            placeholder="Buscar por título, artista o álbum..."
            class="search-input"
            aria-label="Buscar canciones"
          />
          <button
            v-if="search"
            type="button"
            class="search-clear-btn"
            aria-label="Borrar búsqueda"
            @click="clearSearch"
          >
            <X :size="14" />
          </button>
        </div>

        <!-- Barra de selección y conteo (visible solo si hay canciones en la biblioteca) -->
        <div v-if="songs && songs.length > 0" class="selection-toolbar">
          <span class="selection-status">
            {{ selectedCountLabel }}
          </span>

          <div class="bulk-actions" v-if="selectableFilteredSongs.length > 0">
            <button
              v-if="!areAllSelectableSelected"
              type="button"
              class="bulk-action-btn"
              @click="selectAllFiltered"
            >
              <CheckCheck :size="15" />
              <span>Seleccionar todas</span>
            </button>
            <button
              v-else
              type="button"
              class="bulk-action-btn"
              @click="deselectAllFiltered"
            >
              <Square :size="14" />
              <span>Deseleccionar todas</span>
            </button>
          </div>
        </div>
      </section>

      <!-- Lista scrolleable de canciones -->
      <div class="modal-body-scroll">
        <!-- Estado vacío: biblioteca sin canciones -->
        <div v-if="!songs || songs.length === 0" class="empty-state">
          <Music2 class="empty-icon" :size="42" />
          <p class="empty-title">Tu biblioteca no contiene canciones.</p>
        </div>

        <!-- Estado vacío: búsqueda sin resultados -->
        <div v-else-if="filteredSongs.length === 0" class="empty-state">
          <SearchX class="empty-icon" :size="42" />
          <p class="empty-title">No se encontraron canciones</p>
          <p class="empty-subtitle">Intenta buscar con otros términos o limpia el filtro.</p>
        </div>

        <!-- Lista de canciones -->
        <ul v-else class="song-picker-list" role="list">
          <li
            v-for="song in filteredSongs"
            :key="song.id"
            class="picker-song-row"
            :class="{
              'is-already-added': isAlreadyAdded(song.id),
              'is-selected': isSelected(song.id) && !isAlreadyAdded(song.id)
            }"
            @click="handleRowClick(song)"
          >
            <!-- Checkbox o estado de añadido -->
            <div class="song-selector">
              <span
                v-if="isAlreadyAdded(song.id)"
                class="status-pill already-added-badge"
                title="Ya forma parte de esta playlist"
              >
                <Check :size="12" class="badge-icon" />
                <span class="badge-text">Ya añadida</span>
              </span>

              <button
                v-else
                type="button"
                class="custom-checkbox"
                :class="{ checked: isSelected(song.id) }"
                :aria-checked="isSelected(song.id)"
                :aria-label="isSelected(song.id) ? `Deseleccionar ${song.title || song.name}` : `Seleccionar ${song.title || song.name}`"
                role="checkbox"
                @click.stop="toggleSelection(song.id)"
              >
                <Check v-if="isSelected(song.id)" :size="14" class="checkbox-icon" />
              </button>
            </div>

            <!-- Carátula -->
            <div class="song-cover">
              <img
                v-if="song.cover"
                :src="song.cover"
                :alt="song.title || song.name"
                class="cover-image"
                loading="lazy"
              />
              <div v-else class="cover-image fallback">
                <DiscAlbum :size="20" />
              </div>
            </div>

            <!-- Metadatos: Título, Artista, Lanzamientos -->
            <div class="song-meta">
              <span class="song-title" :title="song.title || song.name">
                {{ song.title || song.name }}
              </span>

              <div class="song-subtext">
                <span class="song-artist" :title="song.artist || 'Artista desconocido'">
                  {{ song.artist || 'Artista desconocido' }}
                </span>
                <span v-if="releaseNames(song)" class="bullet-separator">·</span>
                <span v-if="releaseNames(song)" class="song-album" :title="releaseNames(song)">
                  {{ releaseNames(song) }}
                </span>
              </div>
            </div>

            <!-- Duración -->
            <div v-if="song.duration" class="song-duration">
              {{ formatDuration(song.duration) }}
            </div>
          </li>
        </ul>
      </div>

      <!-- Pie del modal fijo -->
      <footer class="modal-footer">
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="isSubmitting"
          @click="$emit('close')"
        >
          Cancelar
        </button>

        <button
          type="button"
          class="btn btn-primary"
          :disabled="selectedIds.size === 0 || isSubmitting"
          @click="confirmAddSongs"
        >
          <span v-if="isSubmitting" class="spinner"></span>
          <span>{{ confirmButtonLabel }}</span>
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from "vue";
import {
  X,
  Check,
  CheckCheck,
  Square,
  Search,
  SearchX,
  DiscAlbum,
  Music2
} from "lucide-vue-next";
import { useLibraryStore } from "../../stores/libraryStore";

const library = useLibraryStore();

const props = defineProps({
  playlist: {
    type: Object,
    required: true
  },
  songs: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(["close"]);

const search = ref("");
const searchInputRef = ref(null);
const selectedIds = ref(new Set());
const isSubmitting = ref(false);

onMounted(() => {
  searchInputRef.value?.focus();
});

function isAlreadyAdded(songId) {
  if (!props.playlist) return false;
  return library.isSongInPlaylist(props.playlist.id, songId);
}

function isSelected(songId) {
  return selectedIds.value.has(songId);
}

function toggleSelection(songId) {
  if (isAlreadyAdded(songId) || isSubmitting.value) return;

  const next = new Set(selectedIds.value);
  if (next.has(songId)) {
    next.delete(songId);
  } else {
    next.add(songId);
  }
  selectedIds.value = next;
}

function handleRowClick(song) {
  if (isAlreadyAdded(song.id) || isSubmitting.value) return;
  toggleSelection(song.id);
}

function clearSearch() {
  search.value = "";
  searchInputRef.value?.focus();
}

function releaseNames(song) {
  const names = (song.releases || [])
    .map((release) => release?.title)
    .filter(Boolean);
  return [...new Set(names)].join(', ') || song.album || '';
}

const filteredSongs = computed(() => {
  const allSongs = props.songs || [];
  const query = search.value.trim().toLowerCase();

  if (!query) return allSongs;

  return allSongs.filter((song) => {
    const title = (song.title || song.name || "").toLowerCase();
    const artist = (song.artist || "").toLowerCase();
    const releases = releaseNames(song).toLowerCase();

    return title.includes(query) || artist.includes(query) || releases.includes(query);
  });
});

// Canciones de la lista filtrada que NO están ya en la playlist (candidatas seleccionables)
const selectableFilteredSongs = computed(() => {
  return filteredSongs.value.filter((song) => !isAlreadyAdded(song.id));
});

const areAllSelectableSelected = computed(() => {
  const selectable = selectableFilteredSongs.value;
  if (selectable.length === 0) return false;
  return selectable.every((song) => selectedIds.value.has(song.id));
});

function selectAllFiltered() {
  const next = new Set(selectedIds.value);
  selectableFilteredSongs.value.forEach((song) => {
    next.add(song.id);
  });
  selectedIds.value = next;
}

function deselectAllFiltered() {
  const next = new Set(selectedIds.value);
  selectableFilteredSongs.value.forEach((song) => {
    next.delete(song.id);
  });
  selectedIds.value = next;
}

const selectedCountLabel = computed(() => {
  const count = selectedIds.value.size;
  if (count === 0) return "Ninguna canción seleccionada";
  if (count === 1) return "1 canción seleccionada";
  return `${count} canciones seleccionadas`;
});

const confirmButtonLabel = computed(() => {
  const count = selectedIds.value.size;
  if (count === 0) return "Añadir canciones";
  if (count === 1) return "Añadir 1 canción";
  return `Añadir ${count} canciones`;
});

function formatDuration(seconds) {
  if (!seconds || Number.isNaN(seconds)) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

async function confirmAddSongs() {
  if (selectedIds.value.size === 0 || isSubmitting.value) return;

  isSubmitting.value = true;
  try {
    for (const songId of selectedIds.value) {
      if (!isAlreadyAdded(songId)) {
        await library.addSongToPlaylist(props.playlist.id, songId);
      }
    }
    emit("close");
  } catch (error) {
    console.error("Error al añadir canciones a la playlist:", error);
  } finally {
    isSubmitting.value = false;
  }
}
</script>
