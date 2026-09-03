<template>
  <LoadingScreen v-if="library.loading" />

  <WelcomeScreen
    v-else-if="
      library.initialized &&
      !library.folderHandle
    "
  />

  <div
    v-else-if="
      library.initialized &&
      library.folderHandle
    "
    class="app-container"
  >
    <MainLayout />
  </div>
</template>

<script setup>
import { onMounted } from "vue";
import { useRouter } from "vue-router";

import { useLibraryStore } from "./stores/libraryStore";
import { useUserStore } from "./stores/userStore";

import MainLayout from "./components/screens/MainLayout.vue";
import WelcomeScreen from "./components/screens/WelcomeScreen.vue";
import LoadingScreen from "./components/screens/LoadingScreen.vue";

const library = useLibraryStore();
const user = useUserStore();
const router = useRouter();

if (typeof window !== "undefined") {
  window.__library__ = library;
  window.__router__ = router;
}

onMounted(async () => {
  await user.load();
  user.applyPreferences();


  await library.init();
});
</script>