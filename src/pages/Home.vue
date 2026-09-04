<template>
  <main class="home" aria-label="Inicio">
    <!-- 1. Header con Saludo Personalizado -->
    <header class="home-greeting-header">
      <div class="greeting-text">
        <span class="greeting-kicker">{{ formattedCurrentDate }}</span>
        <h1 class="greeting-title">{{ greetingMessage }}</h1>
        <p class="greeting-subtitle">Tu música local, organizada para disfrutarla sin interrupciones.</p>
      </div>

      <div class="library-quick-status" v-if="library.songs.length > 0">
        <div class="status-pill">
          <Music2 :size="15" class="status-icon" />
          <span>{{ library.songs.length }} canciones</span>
        </div>
      </div>
    </header>

    <!-- 2. "Vuelve a escucharlo" (Contenido escuchado recientemente) -->
    <section v-if="user.profile.homeShowHistory && jumpBackInItems.length > 0" class="home-section" aria-labelledby="jump-back-title">
      <div class="section-title-row">
        <div>
          <h2 id="jump-back-title" class="section-heading">Vuelve a escucharlo</h2>
          <p class="section-subheading">Continuar donde lo dejaste</p>
        </div>
      </div>

      <div class="jump-back-grid">
        <div
          v-for="item in jumpBackInItems"
          :key="item.id"
          class="jump-card"
          role="button"
          tabindex="0"
          @click="playHistoryItem(item)"
          @keyup.enter="playHistoryItem(item)"
        >
          <div class="jump-card-cover">
            <CoverArt :cover="historyItemCover(item)" :kind="item.type === 'song' ? 'song' : item.type === 'album' ? 'album' : 'playlist'" :alt="item.title" />
            <button class="jump-play-btn" type="button" aria-label="Reproducir">
              <Play fill="currentColor" :size="20" />
            </button>
          </div>

          <div class="jump-card-info">
            <span class="jump-type-tag">{{ getTypeName(item.type) }}</span>
            <strong class="jump-title" :title="item.title">{{ item.title }}</strong>
            <span class="jump-subtitle">{{ item.subtitle }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 3. "Selecciones rápidas" (DEBEN SER CANCIONES) -->
    <section v-if="quickPickSongs.length > 0" class="home-section" aria-labelledby="quick-picks-title">
      <div class="section-title-row">
        <div>
          <h2 id="quick-picks-title" class="section-heading">Selecciones rápidas</h2>
          <p class="section-subheading">Canciones recomendadas de tu colección</p>
        </div>
        <RouterLink to="/songs" class="section-link">Ver todas</RouterLink>
      </div>

      <div class="quick-picks-grid">
        <div
          v-for="song in quickPickSongs"
          :key="song.id"
          class="quick-pick-song-card"
          role="button"
          tabindex="0"
          @click="playSong(song)"
          @keyup.enter="playSong(song)"
        >
          <div class="song-thumbnail">
            <CoverArt :cover="resolveSongCover(library, song)" kind="song" :alt="song.title || song.name" />
            <div class="hover-play-icon">
              <Play fill="currentColor" :size="16" />
            </div>
          </div>

          <div class="song-meta">
            <strong class="song-title" :title="song.title || song.name">{{ song.title || song.name }}</strong>
            <span class="song-artist">{{ song.artist || 'Artista desconocido' }}</span>
          </div>

          <span v-if="song.duration" class="song-duration">{{ formatDuration(song.duration) }}</span>
        </div>
      </div>
    </section>

    <!-- 4. "Álbumes más escuchados" (ordenados según historial) -->
    <section v-if="user.profile.homeShowTopAlbums && topAlbums.length > 0" class="home-section" aria-labelledby="top-albums-title">
      <div class="section-title-row">
        <div>
          <h2 id="top-albums-title" class="section-heading">Álbumes más escuchados</h2>
          <p class="section-subheading">Tus álbumes favoritos según tu actividad</p>
        </div>
        <RouterLink to="/albums" class="section-link">Ver álbumes</RouterLink>
      </div>

      <div class="albums-fluid-grid">
        <div
          v-for="album in topAlbums"
          :key="album.id"
          class="home-album-card"
          role="button"
          tabindex="0"
          @click="goToAlbum(album.id)"
          @keyup.enter="goToAlbum(album.id)"
        >
          <div class="album-cover-frame">
            <CoverArt :cover="album.cover" kind="album" :alt="album.name" />
            <button class="album-play-overlay-btn" type="button" aria-label="Ver álbum">
              <Play fill="currentColor" :size="20" />
            </button>
          </div>

          <div class="album-meta-info">
            <strong class="album-name" :title="album.name">{{ album.name }}</strong>
            <span class="album-artist">{{ album.artist || 'Varios artistas' }}</span>
            <span class="album-plays-tag">{{ album.playCount }} {{ album.playCount === 1 ? 'reproducción' : 'reproducciones' }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 5. "Playlists más escuchadas" (ordenadas según historial) -->
    <section v-if="user.profile.homeShowTopPlaylists && topPlaylists.length > 0" class="home-section" aria-labelledby="top-playlists-title">
      <div class="section-title-row">
        <div>
          <h2 id="top-playlists-title" class="section-heading">Playlists más escuchadas</h2>
          <p class="section-subheading">Las listas que más disfrutas</p>
        </div>
        <RouterLink to="/playlists" class="section-link">Ver playlists</RouterLink>
      </div>

      <div class="playlists-fluid-grid">
        <div
          v-for="pl in topPlaylists"
          :key="pl.id"
          class="home-playlist-card"
          role="button"
          tabindex="0"
          @click="goToPlaylist(pl.id)"
          @keyup.enter="goToPlaylist(pl.id)"
        >
          <div class="pl-cover-frame">
            <CoverArt :cover="pl.cover" kind="playlist" :alt="pl.name" />
            <button class="pl-play-overlay-btn" type="button" aria-label="Ver playlist">
              <Play fill="currentColor" :size="20" />
            </button>
          </div>

          <div class="pl-meta-info">
            <strong class="pl-name" :title="pl.name">{{ pl.name }}</strong>
            <span class="pl-count">{{ (pl.songIds || []).length }} canciones</span>
            <span class="pl-plays-tag">{{ pl.playCount }} {{ pl.playCount === 1 ? 'escucha' : 'escuchas' }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 6. "Historial reciente" (Últimos elementos escuchados) -->
    <section v-if="recentHistoryItems.length > 0" class="home-section" aria-labelledby="recent-history-title">
      <div class="section-title-row">
        <div>
          <h2 id="recent-history-title" class="section-heading">Historial</h2>
          <p class="section-subheading">Últimas canciones y reproducciones</p>
        </div>
        <RouterLink to="/history" class="section-link">Ver todo el historial</RouterLink>
      </div>

      <div class="recent-history-list">
        <div
          v-for="item in recentHistoryItems"
          :key="item.id"
          class="history-mini-item"
          role="button"
          tabindex="0"
          @click="playHistoryItem(item)"
          @keyup.enter="playHistoryItem(item)"
        >
          <span class="history-item-time">{{ formatTime(item.timestamp) }}</span>

          <div class="history-item-cover">
            <CoverArt :cover="historyItemCover(item)" :kind="item.type === 'song' ? 'song' : item.type === 'album' ? 'album' : 'playlist'" :alt="item.title" />
          </div>

          <div class="history-item-details">
            <strong class="history-title" :title="item.title">{{ item.title }}</strong>
            <span class="history-subtitle">{{ item.subtitle }}</span>
          </div>

          <span class="history-type-badge" :class="item.type">{{ getTypeName(item.type) }}</span>

          <button class="history-play-icon-btn" type="button" aria-label="Volver a escuchar">
            <Play fill="currentColor" :size="14" />
          </button>
        </div>
      </div>
    </section>

    <!-- Estado si aún no hay canciones escaneadas -->
    <NoFolderState v-if="!library.folderHandle" />
    <section v-else-if="library.songs.length === 0" class="home-empty-library">
      <Music2 class="empty-hero-icon" />
      <h2>Empieza a escuchar tu música</h2>
      <p>Selecciona tu carpeta local de canciones para desbloquear tus selecciones personalizadas, historial y álbumes.</p>
      <button type="button" class="select-folder-btn" @click="library.selectFolder()">
        Seleccionar carpeta de música
      </button>
    </section>
  </main>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useLibraryStore } from '../stores/libraryStore.js';
import { resolveHistoryCover, resolveSongCover } from '../lib/covers.js';
import { useUserStore } from '../stores/userStore.js';
import CoverArt from '../components/common/CoverArt.vue';
import NoFolderState from '../components/common/NoFolderState.vue';
import { Music2, Play } from 'lucide-vue-next';

const library = useLibraryStore();
const user = useUserStore();
const router = useRouter();

const isMobile = ref(false);
function updateIsMobile() {
  isMobile.value = typeof window !== 'undefined' && window.innerWidth <= 760;
}
onMounted(() => {
  updateIsMobile();
  window.addEventListener('resize', updateIsMobile);

  refreshQuickPicks();
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', updateIsMobile);
});

// Dynamic Greeting based on real time
const greetingMessage = computed(() => {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 13) return 'Buenos días';
  if (hour >= 13 && hour < 21) return 'Buenas tardes';
  return 'Buenas noches';
});

const formattedCurrentDate = computed(() => {
  const now = new Date();
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${days[now.getDay()]}, ${now.getDate()} de ${months[now.getMonth()]}`;
});

// 1. "Vuelve a escucharlo": unique recent items from real listening history
const jumpBackInItems = computed(() => {
  const history = library.listeningHistory || [];
  const seen = new Set();
  const items = [];

  for (const entry of history) {
    if (!seen.has(entry.itemId)) {
      seen.add(entry.itemId);
      items.push(entry);
    }
    if (items.length >= 6) break;
  }
  return items;
});

// 2. "Selecciones rápidas": DEBEN SER CANCIONES
const quickPickSongs = ref([]);

function refreshQuickPicks() {
  const all = library.songs || [];

  if (all.length === 0) {
    quickPickSongs.value = [];
    return;
  }

  quickPickSongs.value = library.smartShuffle(all).slice(0, 6);
}

// 3. "Álbumes más escuchados": real counts from listening history
const topAlbums = computed(() => {
  const history = library.listeningHistory || [];
  if (history.length === 0) return [];

  const counts = new Map();
  for (const item of history) {
    if (item.type === 'album') {
      counts.set(item.itemId, (counts.get(item.itemId) || 0) + 1);
    } else if (item.type === 'song') {
      const song = library.songs.find(s => s.id === item.itemId);
      if (song && song.albumId) {
        counts.set(song.albumId, (counts.get(song.albumId) || 0) + 1);
      }
    }
  }

  if (counts.size === 0) return [];

  return Array.from(counts.entries())
    .map(([albumId, count]) => {
      const album = library.albums.find(a => a.id === albumId);
      return album ? { ...album, playCount: count } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.playCount - a.playCount)
    .slice(0, 6);
});

// 4. "Playlists más escuchadas": real counts from listening history
const topPlaylists = computed(() => {
  const history = library.listeningHistory || [];
  if (history.length === 0) return [];

  const counts = new Map();
  for (const item of history) {
    if (item.type === 'playlist') {
      counts.set(item.itemId, (counts.get(item.itemId) || 0) + 1);
    }
  }

  if (counts.size === 0) return [];

  return Array.from(counts.entries())
    .map(([playlistId, count]) => {
      const pl = library.playlists.find(p => p.id === playlistId);
      return pl ? { ...pl, playCount: count } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.playCount - a.playCount)
    .slice(0, 6);
});

// 5. "Historial": recent items with timestamps
const recentHistoryItems = computed(() => {
  const history = library.listeningHistory || [];
  return history.slice(0, 6);
});

function getTypeName(type) {
  switch (type) {
    case 'album': return 'Álbum';
    case 'playlist': return 'Playlist';
    default: return 'Canción';
  }
}

// Portada en vivo: resuelta desde la biblioteca actual, nunca desde la
// URL (posiblemente muerta) persistida en el registro del historial.
function historyItemCover(item) {
  return resolveHistoryCover(library, item);
}

function formatDuration(seconds) {
  if (!seconds || Number.isNaN(seconds)) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function playSong(song) {
  library.playSong(song);
  if (isMobile.value) {
    library.openNowPlaying();
  }
}

function playHistoryItem(item) {
  if (item.type === 'song') {
    const song = library.songs.find(s => s.id === item.itemId);
    if (song) playSong(song);
  } else if (item.type === 'album') {
    goToAlbum(item.itemId);
  } else if (item.type === 'playlist') {
    goToPlaylist(item.itemId);
  }
}

function goToAlbum(albumId) {
  router.push({ name: 'album', params: { id: albumId } });
}

function goToPlaylist(playlistId) {
  router.push({ name: 'playlist', params: { playlistId } });
}


</script>
