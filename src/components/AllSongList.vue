<template>
  <section class="all-songs">
    <section class="title">

        <h2>Songs </h2>
        <input type="search" placeholder="Search your song..." v-model="query"/>
    </section>

    <ul class="song-list">
      <li
        v-for="song in filteredSongs"
        :key="song.id"
        class="song-item"
      >
            <SongItem :song="song"/>

      </li>
    </ul>
  </section>
</template>

<script setup>
import { ref, computed } from "vue";

import { useLibraryStore } from "../stores/libraryStore.js";
import SongItem from "./SongItem.vue";

const library = useLibraryStore();

const query = ref("");

const filteredSongs = computed(() => {
  if (!query.value.trim()) return library.songs;

  return library.songs.filter(song => {
    const q = query.value.toLowerCase();

    return (
      song.name.toLowerCase().includes(q) ||
      song.artist.toLowerCase().includes(q)
    );
  });
});
</script>