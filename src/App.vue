<template>
  <Sidebar class="sidebar"/>
  <RouterView class="main"/>
  <PlayerBar class="playerbar"/>
</template>

<script setup>
import Sidebar from "./components/Sidebar.vue"
import PlayerBar from "./components/PlayerBar.vue"

import { onMounted } from "vue";
import { useLibraryStore } from "./stores/libraryStore";

const library = useLibraryStore();

onMounted(() => {
  library.loadSavedFolder();
});


</script>