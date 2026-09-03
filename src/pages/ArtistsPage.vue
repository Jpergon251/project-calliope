<template>
  <main class="artists-page" aria-label="Artistas">
    <header class="artists-header">
      <div class="header-titles">
        <div class="title-with-icon">
          <Mic2 class="title-icon" />
          <h1>Artistas</h1>
        </div>
        <p>Explora tu biblioteca musical organizada por intérprete.</p>
      </div>

      <div class="artists-stats">
        <span>{{ filteredArtists.length }} {{ filteredArtists.length === 1 ? 'artista' : 'artistas' }}</span>
      </div>
    </header>

    <!-- Search filter -->
    <div class="artists-search" v-if="library.artists.length > 0">
      <div class="search-box">
        <Search class="search-icon" />
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Buscar artista..."
          aria-label="Buscar artista"
        />
        <button
          v-if="searchQuery"
          type="button"
          class="clear-search"
          aria-label="Limpiar búsqueda"
          @click="searchQuery = ''"
        >
          <X :size="16" />
        </button>
      </div>
    </div>

    <!-- Artists Grid -->
    <section v-if="filteredArtists.length" class="artists-grid">
      <div
        v-for="artist in filteredArtists"
        :key="artist.id"
        class="artist-card"
        role="button"
        tabindex="0"
        @click="goToArtist(artist.name)"
        @keyup.enter="goToArtist(artist.name)"
      >
        <div class="artist-avatar">
          <img v-if="artist.cover" :src="artist.cover" :alt="artist.name" />
          <div v-else class="artist-avatar-fallback">
            <User :size="38" />
          </div>
        </div>

        <div class="artist-info">
          <h2 class="artist-name" :title="artist.name">{{ artist.name }}</h2>
          <span class="artist-count">
            {{ artist.songCount }} {{ artist.songCount === 1 ? 'canción' : 'canciones' }}
            <template v-if="artist.albumsCount > 0"> · {{ artist.albumsCount }} {{ artist.albumsCount === 1 ? 'álbum' : 'álbumes' }}</template>
          </span>
        </div>
      </div>
    </section>

    <!-- Empty state -->
    <div v-else class="empty-state">
      <Mic2 class="empty-icon" />
      <p v-if="searchQuery">No se encontraron artistas para "{{ searchQuery }}"</p>
      <p v-else>No hay canciones con artistas identificados en tu biblioteca</p>
    </div>
  </main>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useLibraryStore } from '../stores/libraryStore.js';
import { Mic2, Search, User, X } from 'lucide-vue-next';

const router = useRouter();
const library = useLibraryStore();
const searchQuery = ref('');

const filteredArtists = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return library.artists;
  return library.artists.filter((a) => a.name.toLowerCase().includes(query));
});

function goToArtist(name) {
  router.push({ name: 'artist', params: { name: encodeURIComponent(name) } });
}
</script>
