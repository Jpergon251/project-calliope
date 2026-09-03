<template>
  <LoadingScreen v-if="library.loading || !user.loaded" />

  <RouterView v-else-if="!user.hasSession || route.name === 'Welcome'" />

  <div v-else class="app-container">
    <MainLayout />
  </div>
</template>

<script setup>
import { onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";

import { useLibraryStore } from "./stores/libraryStore.js";
import { useUserStore } from "./stores/userStore.js";

import MainLayout from "./components/screens/MainLayout.vue";
import LoadingScreen from "./components/screens/LoadingScreen.vue";

const library = useLibraryStore();
const user = useUserStore();
const route = useRoute();
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