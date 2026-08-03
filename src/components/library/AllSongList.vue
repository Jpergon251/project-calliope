<template>
  <section class="all-songs">

    <header class="title">
      <h2>Songs</h2>

      <RouterLink
        to="/songs"
        class="view-all"
      >
        View all →
      </RouterLink>
    </header>

    <input
      type="search"
      placeholder="Search your song..."
      v-model="query"
    />

    <SongList :songs="filteredSongs" />

  </section>
</template>

<script setup>
import { ref, computed } from "vue";

import { useLibraryStore } from "../../stores/libraryStore.js";
import SongItem from "./SongItem.vue";
import SongList from "../common/SongList.vue";

const library = useLibraryStore();

const query = ref("");

const MAX_SONGS = 20;

const filteredSongs = computed(() => {
  let songs = library.songs;

  if (query.value.trim()) {
    const q = query.value.toLowerCase();

    songs = songs.filter(song =>
      song.name.toLowerCase().includes(q) ||
      song.artist.toLowerCase().includes(q)
    );
  }

  return songs.slice(0, MAX_SONGS);
});
</script>