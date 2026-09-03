<template>
  <section class="top-section" :class="{ 'player-mode': isPlayerRoute && !isMobile }">
    <Sidebar v-if="!isPlayerRoute || isMobile" class="sidebar" />
    <div v-if="!isPlayerRoute || isMobile" class="workspace">
      <AppHeader />
      <RouterView v-slot="{ Component }" class="main">
        <Transition name="page-fade" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </div>
    <RouterView v-else v-slot="{ Component }" class="main">
      <Transition name="page-fade" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </section>

  <section v-if="!isPlayerRoute || isMobile" class="bottom-section">
    <PlayerBar />
  </section>

  <!-- YouTube Music style Now Playing sheet overlay -->
  <Transition name="now-playing-sheet">
    <PlayerPage
      v-if="shouldShowNowPlayingSheet"
      class="now-playing-overlay"
      :is-overlay="true"
      @close="handleCloseNowPlaying"
    />
  </Transition>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useLibraryStore } from '../../stores/libraryStore.js';
import PlayerBar from '../layout/PlayerBar.vue';
import Sidebar from '../layout/Sidebar.vue';
import AppHeader from '../layout/AppHeader.vue';
import PlayerPage from '../../pages/PlayerPage.vue';

const route = useRoute();
const router = useRouter();
const library = useLibraryStore();

const isPlayerRoute = computed(() => route.name === 'player');
const isMobile = ref(false);

function checkIsMobile() {
  isMobile.value = typeof window !== 'undefined' && window.innerWidth <= 760;
}

onMounted(() => {
  checkIsMobile();
  window.addEventListener('resize', checkIsMobile);
  if (route.name === 'player' && isMobile.value) {
    library.openNowPlaying();
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', checkIsMobile);
});

watch(
  () => route.name,
  (name) => {
    if (name === 'player' && isMobile.value) {
      library.openNowPlaying();
    }
  }
);

const shouldShowNowPlayingSheet = computed(() => {
  if (isMobile.value) {
    return library.isNowPlayingOpen || isPlayerRoute.value;
  }
  return library.isNowPlayingOpen && !isPlayerRoute.value;
});

function handleCloseNowPlaying() {
  library.closeNowPlaying();
  if (route.name === 'player') {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  }
}
</script>
