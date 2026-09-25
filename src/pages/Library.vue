<template>
  <div class="library-page">
    <header class="library-header">
      <div class="library-header-top">
        <div class="library-title-block">
          <span class="library-kicker">Tu colección</span>
          <div class="library-title-row">
            <h1>Biblioteca</h1>
            <span class="library-summary-stats">
              {{ library.songs.length }} canciones
              ·
              {{ library.artists.length }} artistas
            </span>
          </div>
        </div>

        <div class="library-search">
          <Search :size="19" class="library-search-icon" />
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Buscar en tu biblioteca..."
            aria-label="Buscar en tu biblioteca"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="library-search-clear"
            aria-label="Limpiar búsqueda"
            @click="searchQuery = ''"
          >
            <X :size="17" />
          </button>
        </div>
      </div>
    </header>

    <main class="library-content-body">
      <NoFolderState v-if="!library.folderHandle" />
      <div v-else class="library-carousels">
        <AllSongList
          :search-query="searchQuery"
          :preview="true"
          :preview-limit="20"
        />
        <ArtistList
          :search-query="searchQuery"
          :preview="true"
          :preview-limit="15"
        />
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Search, X } from 'lucide-vue-next';
import AllSongList from '../components/library/AllSongList.vue';
import ArtistList from '../components/library/ArtistList.vue';
import NoFolderState from '../components/common/NoFolderState.vue';
import { useLibraryStore } from '../stores/libraryStore.js';

const library = useLibraryStore();
const route = useRoute();
const router = useRouter();

const searchQuery = ref(typeof route.query.search === 'string' ? route.query.search : '');

watch(searchQuery, (search) => {
  const query = { ...route.query };
  if (search) {
    query.search = search;
  } else {
    delete query.search;
  }
  if (String(route.query.search || '') !== (search || '')) {
    router.replace({ query });
  }
});

watch(
  () => route.query.search,
  (val) => {
    const next = typeof val === 'string' ? val : '';
    if (searchQuery.value !== next) {
      searchQuery.value = next;
    }
  }
);
</script>
