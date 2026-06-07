
<template>
  <div class="playlist-page">

    <h2>
      {{ playlist?.name }}
    </h2>

    <SongList
      :songs="
        playlist?.songs || []
      "
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
</script>