<template>
  <main class="playlists-page" aria-label="Todas las playlists">
    <PLList />
  </main>
</template>

<script setup>
import PLList from '../components/library/PLList.vue';
import { useLibraryStore } from '../stores/libraryStore.js';

const library = useLibraryStore();
</script>
