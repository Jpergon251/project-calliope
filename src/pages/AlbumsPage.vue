<template>
  <main class="albums-page">

    <h1>All Albums</h1>

    <input
      v-model="query"
      type="search"
      placeholder="Search albums..."
    />

    <AlbumList :albums="filteredAlbums" />

  </main>
</template>

<script setup>
import { ref, computed } from "vue";

import { useLibraryStore } from "../stores/libraryStore.js";
import AlbumList from "../components/common/AlbumList.vue";

const library = useLibraryStore();

const query = ref("");

const filteredAlbums = computed(() => {
  let albums = library.albums;

  if (query.value.trim()) {
    const q = query.value.toLowerCase();

    albums = albums.filter(album =>
      album.name.toLowerCase().includes(q) ||
      album.artist.toLowerCase().includes(q)
    );
  }

  return albums;
});
</script>