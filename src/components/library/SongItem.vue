
<template>
  <MediaCard @click="handleCardClick">

    <template #cover>

      <img
        v-if="song.cover"
        :src="song.cover"
        :alt="`Portada de ${song.title || song.name}`"
        class="song-image"
      />

      <SongIconCover v-else class="song-image"/>

      <button
        class="play-btn"
        type="button"
        :aria-label="`Reproducir ${song.title || song.name}`"
        @click.stop="handlePlayBtnClick"
      >
        <Play class="icon" fill="currentColor"/>
      </button>

    </template>

    <div class="song-info">

      <router-link
        v-if="!isMobile"
        :to="`/song/${song.id}`"
        class="song-title-link"
        @click.stop
      >
        {{ song.title || song.name }}
      </router-link>
      <span v-else class="song-title-text">
        {{ song.title || song.name }}
      </span>

      <span>
        {{ format(song.duration) }}
      </span>

    </div>

    <span class="song-artist">
      {{ song.artist }}
    </span>

  </MediaCard>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref } from "vue";
import MediaCard from "../common/MediaCard.vue";
import { useLibraryStore } from "../../stores/libraryStore.js";
import { useRouter } from "vue-router";
import { Play } from "lucide-vue-next";
import SongIconCover from "../common/SongIconCover.vue";

const library = useLibraryStore();
const router = useRouter();

const props = defineProps({
  song: {
    type: Object,
    required: true
  }
});

const isMobile = ref(false);

function updateIsMobile() {
  isMobile.value = typeof window !== 'undefined' && window.innerWidth <= 760;
}

onMounted(() => {
  updateIsMobile();
  window.addEventListener('resize', updateIsMobile);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateIsMobile);
});

function format(seconds) {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function handleCardClick() {
  if (isMobile.value) {
    // In MOBILE: Tap on a song plays the song and opens Now Playing. NEVER navigates to /song/:id!
    library.playSong(props.song);
    library.openNowPlaying();
  } else {
    // In DESKTOP: Navigates to Song detail page
    router.push({ name: 'song', params: { id: props.song.id } });
  }
}

function handlePlayBtnClick() {
  library.playSong(props.song);
  if (isMobile.value) {
    library.openNowPlaying();
  }
}
</script>
