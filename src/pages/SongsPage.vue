<template>
  <main class="songs-page">

    <h1>All songs</h1>

    <input
      v-model="query"
      type="search"
      placeholder="Search..."
    />

    <SongList :songs="filteredSongs" />

  </main>
</template>

<script setup>
import { ref, computed } from "vue";
import { useLibraryStore } from "../stores/libraryStore";
import SongList from "../components/common/SongList.vue";

const library = useLibraryStore();

const query = ref("");

const filteredSongs = computed(() => {
  let songs = library.songs;

  if (query.value.trim()) {
    const q = query.value.toLowerCase();

    songs = songs.filter(song =>
      song.title.toLowerCase().includes(q) ||
      song.artist.toLowerCase().includes(q)
    );
  }

  return songs;
});
</script>