<template>
  <div class="home">
    <PlaylistList v-if="library.playlists.length > 0" :playlists="library.playlists" />
    <p v-else>
      No playlists found. Please add some music to your library to create playlists.
    </p>      



    
    
  </div>
</template>
<script setup>
import PlaylistList from "../components/PlaylistList.vue";
import { useLibraryStore } from "../stores/libraryStore.js";

const library = useLibraryStore();
</script>