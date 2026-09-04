<template>
  <main class="history-page" aria-label="Historial de reproducción">
    <header class="history-header">
      <div class="header-titles">
        <div class="title-with-icon">
          <History class="title-icon" />
          <h1>Historial de reproducción</h1>
        </div>
        <p>Registro cronológico de las canciones, álbumes y playlists que has escuchado.</p>
      </div>

      <div class="history-actions" v-if="library.listeningHistory.length > 0">
        <button
          type="button"
          class="clear-history-btn"
          @click="confirmClearHistory"
          title="Borrar todo el historial"
        >
          <Trash2 :size="15" />
          <span>Borrar historial</span>
        </button>
      </div>
    </header>

    <!-- Grouped Chronological History List -->
    <section v-if="groupedHistory.length" class="history-content">
      <div
        v-for="group in groupedHistory"
        :key="group.dateLabel"
        class="history-day-group"
      >
        <div class="day-header">
          <span class="day-badge">{{ group.dateLabel }}</span>
          <span class="day-count">{{ group.items.length }} {{ group.items.length === 1 ? 'reproducción' : 'reproducciones' }}</span>
        </div>

        <ul class="history-items-list">
          <li
            v-for="item in group.items"
            :key="item.id"
            class="history-item"
            :class="`type-${item.type}`"
            @click="playHistoryItem(item)"
          >
            <!-- Timestamp -->
            <span class="item-time">{{ formatTimeOfDay(item.timestamp) }}</span>

            <!-- Type badge -->
            <span class="item-type-badge" :class="item.type">
              <Music2 v-if="item.type === 'song'" :size="12" />
              <DiscAlbum v-else-if="item.type === 'album'" :size="12" />
              <ListMusic v-else :size="12" />
              <span>{{ getTypeName(item.type) }}</span>
            </span>

            <!-- Cover Thumbnail -->
            <div class="item-cover-frame">
              <CoverArt :cover="historyItemCover(item)" :kind="item.type === 'song' ? 'song' : item.type === 'album' ? 'album' : 'playlist'" :alt="item.title" class="cover-img" />
            </div>

            <!-- Details -->
            <div class="item-details">
              <span class="item-title" :title="item.title">{{ item.title }}</span>
              <span
                class="item-subtitle"
                :class="{ 'clickable-artist': item.type === 'song' }"
                @click.stop="item.type === 'song' ? goToArtist(item.subtitle) : null"
                :title="item.type === 'song' ? `Ver artista: ${item.subtitle}` : ''"
              >
                {{ item.subtitle }}
              </span>
            </div>

            <!-- Duration if song -->
            <span v-if="item.duration" class="item-duration">{{ formatDuration(item.duration) }}</span>

            <!-- Actions -->
            <div class="item-actions" @click.stop>
              <button
                type="button"
                class="replay-btn"
                :title="`Volver a escuchar ${item.title}`"
                @click="playHistoryItem(item)"
              >
                <Play fill="currentColor" :size="14" />
              </button>

              <button
                type="button"
                class="remove-btn"
                title="Quitar del historial"
                @click="library.removeHistoryItem(item.id)"
              >
                <X :size="15" />
              </button>
            </div>
          </li>
        </ul>
      </div>
    </section>

    <!-- Empty state -->
    <div v-else class="empty-state">
      <History class="empty-icon" />
      <p>Aún no has reproducido ninguna música</p>
      <span>El contenido que escuches se registrará aquí cronológicamente para que puedas consultar tu actividad y volver a escucharla.</span>
    </div>
  </main>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useLibraryStore } from '../stores/libraryStore.js';
import { resolveHistoryCover } from '../lib/covers.js';
import CoverArt from '../components/common/CoverArt.vue';
import { DiscAlbum, History, ListMusic, Music2, Play, Trash2, X } from 'lucide-vue-next';

const library = useLibraryStore();
const router = useRouter();

function historyItemCover(item) {
  return resolveHistoryCover(library, item);
}

function formatTimeOfDay(timestamp) {
  if (!timestamp) return '--:--';
  const date = new Date(timestamp);
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function formatDayLabel(timestamp) {
  if (!timestamp) return 'Anterior';
  const date = new Date(timestamp);
  const now = new Date();

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isToday) return 'Hoy';
  if (isYesterday) return 'Ayer';

  const day = date.getDate();
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  if (year === now.getFullYear()) {
    return `${day} de ${month}`;
  }
  return `${day} de ${month} de ${year}`;
}

function formatDuration(seconds) {
  if (!seconds || Number.isNaN(seconds)) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function getTypeName(type) {
  switch (type) {
    case 'album': return 'Álbum';
    case 'playlist': return 'Playlist';
    default: return 'Canción';
  }
}

// Group history chronologically by day
const groupedHistory = computed(() => {
  const groups = [];
  let currentGroup = null;

  for (const item of library.listeningHistory) {
    const day = formatDayLabel(item.timestamp);
    if (!currentGroup || currentGroup.dateLabel !== day) {
      currentGroup = {
        dateLabel: day,
        items: []
      };
      groups.push(currentGroup);
    }
    currentGroup.items.push(item);
  }

  return groups;
});

function confirmClearHistory() {
  if (confirm('¿Deseas vaciar todo tu historial de reproducción?')) {
    library.clearListeningHistory();
  }
}

function goToArtist(name) {
  if (!name || name === 'Unknown' || name === 'Artista desconocido') return;
  router.push({ name: 'artist', params: { name: encodeURIComponent(name.trim()) } });
}

function playHistoryItem(item) {
  if (item.type === 'song') {
    const song = library.songs.find(s => s.id === item.itemId);
    if (song) {
      library.playSong(song);
      if (typeof window !== 'undefined' && window.innerWidth <= 760) {
        library.openNowPlaying();
      }
    }
  } else if (item.type === 'album') {
    router.push({ name: 'album', params: { id: item.itemId } });
  } else if (item.type === 'playlist') {
    router.push({ name: 'playlist', params: { playlistId: item.itemId } });
  }
}
</script>
