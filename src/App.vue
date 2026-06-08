<template>
  <section class="top-section">
    <Sidebar class="sidebar"/>
    <RouterView class="main"/>
  </section>
  <section class="bottom-section">
    <PlayerBar />
  </section>
</template>

<script setup>
import Sidebar from "./components/Sidebar.vue"
import PlayerBar from "./components/PlayerBar.vue"

import { onMounted } from "vue";
import { useLibraryStore } from "./stores/libraryStore";
import { Section } from "lucide-vue-next";

const library = useLibraryStore();

onMounted(() => {
  library.loadSavedFolder();
});


</script>