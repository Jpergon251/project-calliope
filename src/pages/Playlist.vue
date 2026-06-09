<template>
  <div class="playlist-page">

    <h1 class="playlist-title">
      {{ playlist?.name }}
    </h1>

    <SongList
      :songs="
        playlistSongs || []
      "
      :playlist="playlist"
    />

  </div>
</template>

<script setup>
import { computed }
from "vue";

import { useRoute }
from "vue-router";

import SongList
from "../components/SongList.vue";

import {
 useLibraryStore
}
from "../stores/libraryStore.js";

const route =
useRoute();

const library =
useLibraryStore();

const playlist =
computed(() =>
  library.playlists.find(
    p =>
      p.id ===
      route.params.playlistId
  )
);

const playlistSongs =
computed(() => {

  if (!playlist.value)
    return [];

  // Playlist especial
  if (
    playlist.value.id ===
    "all"
  ) {
    return library.songs;
  }

  return library.songs.filter(
    song =>
      playlist.value.songIds?.includes(
        song.id
      )
  );
});
</script>