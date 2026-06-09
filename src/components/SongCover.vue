<template>
  <div class="song-cover">

    <img
      v-if="song?.cover"
      :src="song.cover"
      :alt="song.title || song.name"
      class="cover-image"
    />

    <DiscAlbum
      v-else
      class="cover-placeholder"
    />

  </div>
</template>

<script setup>
import { DiscAlbum } from "lucide-vue-next";

defineProps({
  song: {
    type: Object,
    default: null
  }
})
</script>
