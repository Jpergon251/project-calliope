<template>
  <main class="metadata-page">
    
    <!-- Encabezado de la página -->
    <header class="metadata-header">
      <div class="header-titles">
        <div class="title-with-icon">
          <Tags class="title-icon" />
          <h1>Gestión de Metadatos</h1>
        </div>
        <p>
          Consulta y edita los metadatos de tus canciones, o analiza su audio para completar información faltante.
        </p>
      </div>

      <!-- Resumen estadístico: 3 estados -->
      <div class="metadata-stats-bar" v-if="library.songs.length > 0">
        <div class="stat-item">
          <span class="stat-label">Total</span>
          <strong class="stat-value">{{ totalSongsCount }}</strong>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item stat-complete">
          <span class="stat-label">Completos</span>
          <strong class="stat-value">{{ completeMetadataCount }}</strong>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item stat-necessary">
          <span class="stat-label">Necesarios</span>
          <strong class="stat-value">{{ necessaryMetadataCount }}</strong>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item stat-incomplete">
          <span class="stat-label">Incompletos</span>
          <strong class="stat-value">{{ incompleteMetadataCount }}</strong>
        </div>
      </div>
    </header>

    <!-- Barra de Búsqueda y Filtros -->
    <section class="metadata-controls" v-if="library.songs.length > 0">
      <div class="search-wrapper">
        <Search class="search-icon" />
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Buscar por título, artista, álbum o archivo..."
          class="metadata-search-input"
        />
        <button
          v-if="searchQuery"
          class="clear-search-btn"
          @click="searchQuery = ''"
          type="button"
          aria-label="Limpiar búsqueda"
        >
          <X class="icon-sm" />
        </button>
      </div>

      <!-- Pestañas de Filtro (Todas, Incompletos, Necesarios, Completos) -->
      <div class="filter-tabs">
        <button
          type="button"
          :class="['filter-tab', { active: currentFilter === 'all' }]"
          @click="currentFilter = 'all'"
        >
          Todas ({{ totalSongsCount }})
        </button>
        <button
          type="button"
          :class="['filter-tab', 'tab-incomplete', { active: currentFilter === 'incomplete' }]"
          @click="currentFilter = 'incomplete'"
        >
          Incompletos ({{ incompleteMetadataCount }})
        </button>
        <button
          type="button"
          :class="['filter-tab', 'tab-necessary', { active: currentFilter === 'necessary' }]"
          @click="currentFilter = 'necessary'"
        >
          Necesarios ({{ necessaryMetadataCount }})
        </button>
        <button
          type="button"
          :class="['filter-tab', 'tab-complete', { active: currentFilter === 'complete' }]"
          @click="currentFilter = 'complete'"
        >
          Completos ({{ completeMetadataCount }})
        </button>
      </div>
    </section>

    <!-- Lista / Tabla de Canciones -->
    <section class="metadata-content">
      
      <!-- Si no hay canciones cargadas -->
      <div class="empty-state" v-if="library.songs.length === 0">
        <Music2 class="empty-icon" />
        <h2>No hay canciones en la biblioteca</h2>
        <p>Selecciona una carpeta con música para consultar y gestionar sus metadatos.</p>
        <button
          v-if="!library.folderHandle"
          class="btn-select-folder"
          @click="library.selectFolder()"
        >
          Seleccionar carpeta
        </button>
      </div>

      <!-- Si la búsqueda / filtro no da resultados -->
      <div class="empty-state" v-else-if="filteredSongs.length === 0">
        <SearchX class="empty-icon" />
        <h2>No se han encontrado resultados</h2>
        <p>No hay canciones que coincidan con "{{ searchQuery }}" bajo el filtro seleccionado.</p>
        <button class="btn-subtle" @click="resetFilters">
          Restablecer filtros
        </button>
      </div>

      <!-- Cuadrícula / Lista de Canciones -->
      <div class="metadata-songs-grid" v-else>
        <article
          v-for="song in filteredSongs"
          :key="song.id"
          class="metadata-song-card"
          @click="openEditModal(song)"
          tabindex="0"
          role="button"
          @keyup.enter="openEditModal(song)"
          @keyup.space.prevent="openEditModal(song)"
        >
          <!-- Portada -->
          <div class="card-cover">
            <img
              v-if="song.cover"
              :src="song.cover"
              :alt="song.title || song.name"
              class="cover-image"
              loading="lazy"
            />
            <SongIconCover v-else class="cover-image fallback" />
          </div>

          <!-- Información de la pista -->
          <div class="card-body">
            <div class="card-titles">
              <h3 class="song-title" :title="song.title || song.name">
                {{ song.title || song.name }}
              </h3>
              <p class="song-artist" :title="song.artist || 'Artista desconocido'">
                {{ song.artist || 'Artista desconocido' }}
              </p>
            </div>

            <p class="song-album" :title="formatAlbum(song)">
              <Disc3 class="inline-icon" />
              <span>{{ formatAlbum(song) }}</span>
            </p>

            <div class="card-meta-bottom">
              <!-- Indicador visual de 3 estados de metadatos -->
              <span
                :class="[
                  'status-pill',
                  `pill-${getSongStatus(song).status}`
                ]"
              >
                <component :is="getSongStatus(song).icon" class="pill-icon" />
                {{ getSongStatus(song).label }}
              </span>

              <span class="edit-hint">
                <Pencil class="hint-icon" />
                Editar
              </span>
            </div>
          </div>
        </article>
      </div>

    </section>

    <!-- Modal de edición de metadatos -->
    <MetadataModal
      v-if="selectedSong"
      :song="selectedSong"
      @close="closeEditModal"
      @updated="handleSongUpdated"
    />

  </main>
</template>

<script setup>
import { ref, computed } from 'vue';
import {
  Tags,
  Search,
  SearchX,
  X,
  Music2,
  Disc3,
  CheckCircle2,
  CheckCheck,
  Check,
  AlertCircle,
  Pencil
} from 'lucide-vue-next';
import { useLibraryStore } from '../stores/libraryStore.js';
import SongIconCover from '../components/common/SongIconCover.vue';
import MetadataModal from '../components/modals/MetadataModal.vue';

const library = useLibraryStore();

const searchQuery = ref('');
const currentFilter = ref('all'); // 'all' | 'incomplete' | 'necessary' | 'complete'
const selectedSong = ref(null);

/**
 * Evalúa el estado de los metadatos de una canción en 3 niveles:
 * 1. 'incomplete': falta al menos uno de los campos necesarios (Artista, Portada, Título, Álbum).
 * 2. 'necessary': tiene los 4 campos mínimos necesarios.
 * 3. 'complete': tiene los 4 mínimos + campos adicionales (Género, Año, Pista).
 */
function getSongStatus(song) {
  if (!song) return { status: 'incomplete', label: 'Incompleto', icon: AlertCircle };

  const hasTitle = Boolean((song.title || song.name)?.trim());
  const hasArtist = Boolean(song.artist?.trim()) && song.artist !== 'Unknown';
  const hasAlbum = Boolean(song.album?.trim()) && !song.album.startsWith('standalone-') && song.album !== 'Unknown';
  const hasCover = Boolean(song.cover);

  const meetsNecessary = hasTitle && hasArtist && hasAlbum && hasCover;

  if (!meetsNecessary) {
    return {
      status: 'incomplete',
      label: 'Metadatos incompletos',
      icon: AlertCircle
    };
  }

  const hasGenre = Array.isArray(song.genre) ? song.genre.length > 0 : Boolean(song.genre?.trim());
  const hasYear = Boolean(song.year);
  const hasTrack = Boolean(song.track);

  if (hasGenre && hasYear && hasTrack) {
    return {
      status: 'complete',
      label: 'Metadatos completos',
      icon: CheckCheck
    };
  }

  return {
    status: 'necessary',
    label: 'Metadatos necesarios',
    icon: Check
  };
}

function formatAlbum(song) {
  if (!song.album || song.album.startsWith('standalone-')) {
    return 'Sin álbum';
  }
  return song.album;
}

// Contadores
const totalSongsCount = computed(() => library.songs.length);

const incompleteMetadataCount = computed(() =>
  library.songs.filter(s => getSongStatus(s).status === 'incomplete').length
);

const necessaryMetadataCount = computed(() =>
  library.songs.filter(s => getSongStatus(s).status === 'necessary').length
);

const completeMetadataCount = computed(() =>
  library.songs.filter(s => getSongStatus(s).status === 'complete').length
);

// Canciones filtradas por búsqueda y pestañas de estado
const filteredSongs = computed(() => {
  let list = library.songs;

  // Filtro por pestaña
  if (currentFilter.value === 'incomplete') {
    list = list.filter(s => getSongStatus(s).status === 'incomplete');
  } else if (currentFilter.value === 'necessary') {
    list = list.filter(s => getSongStatus(s).status === 'necessary');
  } else if (currentFilter.value === 'complete') {
    list = list.filter(s => getSongStatus(s).status === 'complete');
  }

  // Filtro por término de búsqueda
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    list = list.filter(song => {
      const title = (song.title || song.name || '').toLowerCase();
      const artist = (song.artist || '').toLowerCase();
      const album = (song.album || '').toLowerCase();
      const fileName = (song.file?.name || song.name || '').toLowerCase();

      return title.includes(q) || artist.includes(q) || album.includes(q) || fileName.includes(q);
    });
  }

  return list;
});

function openEditModal(song) {
  selectedSong.value = song;
}

function closeEditModal() {
  selectedSong.value = null;
}

function handleSongUpdated(songId) {
  if (selectedSong.value && selectedSong.value.id === songId) {
    const updated = library.songs.find(s => s.id === songId);
    if (updated) {
      selectedSong.value = updated;
    }
  }
}

function resetFilters() {
  searchQuery.value = '';
  currentFilter.value = 'all';
}
</script>
