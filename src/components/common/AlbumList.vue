<template>
  <ul class="album-list">
    <li
      v-for="album in albums"
      :key="album.id"
      class="album-card"
    >
      <AlbumItem :album="album" />
    </li>
  </ul>
</template>

<script setup>
import AlbumItem from "../library/AlbumItem.vue";

defineProps({
  albums: {
    type: Array,
    required: true
  }
});
</script>