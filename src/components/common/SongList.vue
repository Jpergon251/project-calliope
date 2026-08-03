<template>
  <ul class="song-list">
    <li
      v-for="song in songs"
      :key="song.id"
      class="song-item"
    >
      <SongItem :song="song" />
    </li>
  </ul>
</template>

<script setup>
import SongItem from '../library/SongItem.vue';

defineProps({
  songs: {
    type: Array,
    required: true
  }
});
</script>