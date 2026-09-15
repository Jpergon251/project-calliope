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
          Consulta y edita los metadatos de tus canciones, o analiza su audio
          para completar información faltante.
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
          :class="[
            'filter-tab',
            'tab-incomplete',
            { active: currentFilter === 'incomplete' },
          ]"
          @click="currentFilter = 'incomplete'"
        >
          Incompletos ({{ incompleteMetadataCount }})
        </button>
        <button
          type="button"
          :class="[
            'filter-tab',
            'tab-necessary',
            { active: currentFilter === 'necessary' },
          ]"
          @click="currentFilter = 'necessary'"
        >
          Necesarios ({{ necessaryMetadataCount }})
        </button>
        <button
          type="button"
          :class="[
            'filter-tab',
            'tab-complete',
            { active: currentFilter === 'complete' },
          ]"
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
        <p>
          Selecciona una carpeta con música para consultar y gestionar sus
          metadatos.
        </p>
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
        <p>
          No hay canciones que coincidan con "{{ searchQuery }}" bajo el filtro
          seleccionado.
        </p>
        <button class="btn-subtle" @click="resetFilters">
          Restablecer filtros
        </button>
      </div>

      <!-- Cuadrícula / Lista de Canciones -->
      <div class="metadata-songs-grid metadata-songs-scroll" v-else>
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
          <input
            class="metadata-song-select"
            type="checkbox"
            :checked="autoSelectedIds.includes(song.id)"
            :disabled="autoRunning"
            :aria-label="`Seleccionar ${song.title || song.name} para análisis automático`"
            @click.stop
            @change="toggleAutoSong(song)"
          />
          <!-- Portada -->
          <div class="card-cover">
            <img
              v-if="song.cover"
              :src="song.cover"
              :alt="song.title || song.name"
              class="cover-image"
              loading="lazy"
              @error="handleCoverError($event, song)"
            />
            <SongIconCover v-else class="cover-image fallback" />
          </div>

          <!-- Información de la pista -->
          <div class="card-body">
            <div class="card-titles">
              <h3 class="song-title" :title="song.title || song.name">
                {{ song.title || song.name }}
              </h3>
              <p
                class="song-artist"
                :title="song.artist || 'Artista desconocido'"
              >
                {{ song.artist || "Artista desconocido" }}
              </p>
            </div>

            <p class="song-album" :title="formatReleases(song)">
              <Disc3 class="inline-icon" />
              <span>{{ formatReleases(song) }}</span>
            </p>

            <div class="card-meta-bottom">
              <!-- Indicador visual de 3 estados de metadatos -->
              <span
                :class="['status-pill', `pill-${getSongStatus(song).status}`]"
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

    <section v-if="library.songs.length" class="metadata-auto-panel">
      <div class="metadata-auto-copy">
        <span class="metadata-auto-kicker">Modo automático</span>
        <h2>Analizar y aplicar metadatos</h2>
        <p>
          Analiza las canciones seleccionadas una por una y aplica la mejor
          coincidencia encontrada. Puede haber errores: revisa los resultados
          manualmente después.
        </p>
      </div>
      <div class="metadata-auto-actions">
        <span>{{ autoSelectedIds.length }} seleccionadas</span>
        <span v-if="autoRunning" class="metadata-auto-timer"
          >{{ formatElapsed(autoProgress.elapsedMs) }} · queda
          {{ formatElapsed(autoProgress.etaMs) }}</span
        >
        <button
          type="button"
          class="btn-subtle"
          :disabled="autoRunning"
          @click="selectVisibleForAuto"
        >
          Seleccionar visibles
        </button>
        <button
          type="button"
          class="metadata-auto-clear"
          :disabled="autoRunning || !autoSelectedIds.length"
          @click="autoSelectedIds = []"
        >
          Deseleccionar todo
        </button>
        <button
          v-if="autoRunning"
          type="button"
          class="metadata-auto-stop"
          @click="stopAutomaticMetadata"
        >
          Parar
        </button>
        <button
          type="button"
          class="metadata-auto-button"
          :disabled="autoRunning || !autoSelectedIds.length"
          @click="runAutomaticMetadata"
        >
          {{
            autoRunning
              ? `Analizando ${autoProgress.current}/${autoProgress.total} · ${autoProgress.percent}%`
              : "Analizar y aplicar"
          }}
        </button>
      </div>
      <div
        v-if="autoRunning || autoResults.length"
        class="metadata-auto-results"
        aria-live="polite"
      >
        <div
          v-for="result in autoResults"
          :key="result.id"
          :class="['metadata-auto-result', `result-${result.status}`]"
        >
          <strong>{{ result.title }}</strong
          ><span>{{ result.message }}</span>
        </div>
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
import { ref, computed, onUnmounted } from "vue";
import {
  Tags,
  Search,
  SearchX,
  X,
  Music2,
  Disc3,
  CheckCheck,
  Check,
  AlertCircle,
  Pencil,
} from "lucide-vue-next";
import { useLibraryStore } from "../stores/libraryStore.js";
import SongIconCover from "../components/common/SongIconCover.vue";
import MetadataModal from "../components/modals/MetadataModal.vue";
import { identifyAudio } from "../services/audioIdentification.js";

const library = useLibraryStore();

const searchQuery = ref("");
const currentFilter = ref("all"); // 'all' | 'incomplete' | 'necessary' | 'complete'
const selectedSong = ref(null);
const autoSelectedIds = ref([]);
const autoRunning = ref(false);
const autoResults = ref([]);
const autoProgress = ref({
  current: 0,
  total: 0,
  percent: 0,
  elapsedMs: 0,
  etaMs: 0,
});
let autoStartedAt = 0;
let autoTimer = null;
let stopRequested = false;

function updateProgressTimer() {
  if (!autoRunning.value) return;
  const elapsed = performance.now() - autoStartedAt;
  autoProgress.value.elapsedMs = elapsed;
  if (autoProgress.value.current > 0) {
    const avgPerItem = elapsed / autoProgress.value.current;
    const remaining = Math.max(
      0,
      autoProgress.value.total - autoProgress.value.current,
    );
    autoProgress.value.etaMs = avgPerItem * remaining;
  } else {
    autoProgress.value.etaMs = 0;
  }
}

function stopAutomaticMetadata() {
  stopRequested = true;
}

/**
 * Evalúa el estado de los metadatos de una canción en 3 niveles:
 * 1. 'incomplete': falta al menos uno de los campos necesarios (Artista, Portada, Título, Álbum).
 * 2. 'necessary': tiene los 4 campos mínimos necesarios.
 * 3. 'complete': tiene los 4 mínimos + campos adicionales (Género, Año, Pista).
 */
function getSongStatus(song) {
  if (!song)
    return { status: "incomplete", label: "Incompleto", icon: AlertCircle };

  const hasTitle = Boolean((song.title || song.name)?.trim());
  const hasArtist = Boolean(song.artist?.trim()) && song.artist !== "Unknown";
  const hasRelease = Array.isArray(song.releaseIds)
    ? song.releaseIds.length > 0
    : Boolean(song.album?.trim());
  const hasCover = Boolean(song.cover);

  const meetsNecessary = hasTitle && hasArtist && hasRelease && hasCover;

  if (!meetsNecessary) {
    return {
      status: "incomplete",
      label: "Metadatos incompletos",
      icon: AlertCircle,
    };
  }

  const hasGenre = Array.isArray(song.genre)
    ? song.genre.length > 0
    : Boolean(song.genre?.trim());
  const hasYear = Boolean(song.year);
  const hasTrack = Boolean(song.track);

  if (hasGenre && hasYear && hasTrack) {
    return {
      status: "complete",
      label: "Metadatos completos",
      icon: CheckCheck,
    };
  }

  return {
    status: "necessary",
    label: "Metadatos necesarios",
    icon: Check,
  };
}

function formatReleases(song) {
  const names = (song.releases || [])
    .map((release) => release?.title)
    .filter(Boolean);
  return (
    [...new Set(names)].join(", ") ||
    (song.album && !song.album.startsWith("standalone-")
      ? song.album
      : "Sin lanzamientos")
  );
}

// Contadores
const totalSongsCount = computed(() => library.songs.length);

const incompleteMetadataCount = computed(
  () =>
    library.songs.filter((s) => getSongStatus(s).status === "incomplete")
      .length,
);

const necessaryMetadataCount = computed(
  () =>
    library.songs.filter((s) => getSongStatus(s).status === "necessary").length,
);

const completeMetadataCount = computed(
  () =>
    library.songs.filter((s) => getSongStatus(s).status === "complete").length,
);

// Canciones filtradas por búsqueda y pestañas de estado
const filteredSongs = computed(() => {
  let list = library.songs;

  // Filtro por pestaña
  if (currentFilter.value === "incomplete") {
    list = list.filter((s) => getSongStatus(s).status === "incomplete");
  } else if (currentFilter.value === "necessary") {
    list = list.filter((s) => getSongStatus(s).status === "necessary");
  } else if (currentFilter.value === "complete") {
    list = list.filter((s) => getSongStatus(s).status === "complete");
  }

  // Filtro por término de búsqueda
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    list = list.filter((song) => {
      const title = (song.title || song.name || "").toLowerCase();
      const artist = (song.artist || "").toLowerCase();
      const releases = formatReleases(song).toLowerCase();
      const fileName = (song.file?.name || song.name || "").toLowerCase();

      return (
        title.includes(q) ||
        artist.includes(q) ||
        releases.includes(q) ||
        fileName.includes(q)
      );
    });
  }

  return list;
});

function openEditModal(song) {
  selectedSong.value = song;
}

function handleCoverError(event, song) {
  event.currentTarget.hidden = true;
  if (song) song.cover = null;
}

function formatElapsed(milliseconds) {
  const seconds = Math.max(0, Math.round(Number(milliseconds || 0) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function toggleAutoSong(song) {
  autoSelectedIds.value = autoSelectedIds.value.includes(song.id)
    ? autoSelectedIds.value.filter((id) => id !== song.id)
    : [...autoSelectedIds.value, song.id];
}

function selectVisibleForAuto() {
  autoSelectedIds.value = [
    ...new Set([
      ...autoSelectedIds.value,
      ...filteredSongs.value.map((song) => song.id),
    ]),
  ];
}

async function runAutomaticMetadata() {
  if (autoRunning.value) return;
  const queue = autoSelectedIds.value
    .map((id) => library.songs.find((song) => song.id === id))
    .filter(Boolean);
  if (!queue.length) return;

  autoRunning.value = true;
  stopRequested = false;
  autoResults.value = [];
  autoStartedAt = performance.now();
  autoProgress.value = {
    current: 0,
    total: queue.length,
    percent: 0,
    elapsedMs: 0,
    etaMs: 0,
  };

  clearInterval(autoTimer);
  autoTimer = setInterval(updateProgressTimer, 1000);

  try {
    for (const song of queue) {
      if (stopRequested) break;

      autoProgress.value.current += 1;
      autoProgress.value.percent = Math.round(
        (autoProgress.value.current / queue.length) * 100,
      );
      updateProgressTimer();

      const title = song.title || song.name;
      try {
        const hasAudioFile = typeof Blob !== "undefined" && song.file instanceof Blob;
        if (!hasAudioFile) {
          autoResults.value.push({
            id: song.id,
            title,
            status: "skipped",
            message: "Archivo no disponible",
          });
          continue;
        }
        const result = await identifyAudio(song.file);
        if (stopRequested) break;

        const confidence = Number(
          result?.confidence || result?.metadata?.confidence || 0,
        );
        const warnings = result?.diagnostics?.warnings || [];
        const hasCompetingEvidence = warnings.includes(
          "competing-candidates-reviewable",
        );
        const hasStableIdentity = Boolean(
          result?.musicBrainzRecordingId ||
            result?.metadata?.musicBrainzRecordingId ||
            result?.diagnostics?.winner?.identityKey?.startsWith("mbid:"),
        );
        const hasAudioEvidence = ["acoustid", "optional"].some((provider) =>
          String(result?.identificationSource || "").split("+").includes(provider),
        );

        if (
          result?.status !== "match" ||
          !result.metadata ||
          confidence < 0.7 ||
          hasCompetingEvidence ||
          (!hasStableIdentity && !hasAudioEvidence)
        ) {
          autoResults.value.push({
            id: song.id,
            title,
            status: "skipped",
            message: hasCompetingEvidence
              ? "Evidencia competida: requiere revisión manual"
              : "Sin coincidencia suficientemente fiable",
          });
          continue;
        }
        const releases = (
          result.releases ||
          result.metadata.releases ||
          []
        ).filter(Boolean);
        const primaryReleaseId =
          result.metadata.musicBrainzReleaseId ||
          releases.find((release) => release.type === "album")?.id ||
          releases[0]?.id ||
          "";
        const primaryRelease = releases.find(
          (release) => release.id === primaryReleaseId,
        );
        await library.updateSongMetadata(song.id, {
          ...result.metadata,
          artists: result.recording?.artists || result.metadata.artists || [],
          artistCredits: result.recording?.artistCredits || [],
          genres: result.metadata.genre || result.recording?.genres || [],
          releases,
          releaseIds: releases.map((release) => release.id).filter(Boolean),
          primaryReleaseId,
          releaseType:
            primaryRelease?.type || result.metadata.releaseType || "album",
        });
        autoResults.value.push({
          id: song.id,
          title,
          status: "applied",
          message: `${Math.round(confidence * 100)}% · aplicado`,
        });
      } catch (error) {
        autoResults.value.push({
          id: song.id,
          title,
          status: "error",
          message: error?.message || "Error al aplicar",
        });
      }

      if (stopRequested) break;
    }
  } finally {
    clearInterval(autoTimer);
    autoTimer = null;
    updateProgressTimer();
    autoRunning.value = false;
    autoSelectedIds.value = autoSelectedIds.value.filter(
      (id) => !autoResults.value.some((r) => r.id === id),
    );
  }
}

onUnmounted(() => {
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
  stopRequested = true;
});

function closeEditModal() {
  selectedSong.value = null;
}

function handleSongUpdated(songId) {
  if (selectedSong.value && selectedSong.value.id === songId) {
    const updated = library.songs.find((s) => s.id === songId);
    if (updated) {
      selectedSong.value = updated;
    }
  }
}

function resetFilters() {
  searchQuery.value = "";
  currentFilter.value = "all";
}
</script>
