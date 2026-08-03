<template>
 
  <LoadingScreen
      v-if="library.loading"
  />

  <WelcomeScreen
    v-else-if="!library.folderHandle && library.initialized && !library.loading"
  />
  <MainLayout
      v-if="library.folderHandle && library.initialized && !library.loading"
  />

</template>

<script setup>

import { onMounted } from "vue";
/* Test comment from AI agent */
import { useLibraryStore } from "./stores/libraryStore";
import MainLayout from "./components/screens/MainLayout.vue";
import WelcomeScreen from "./components/screens/WelcomeScreen.vue";
import LoadingScreen from "./components/screens/LoadingScreen.vue";


const library = useLibraryStore();

onMounted(async () => {
  await library.init();
});


</script>