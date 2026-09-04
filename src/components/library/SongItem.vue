
<template>
  <MediaCard @click="handleCardClick">

    <template #cover>

      <img
        v-if="songCover"
        :src="songCover"
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
      <span v-if="artistNames.length">
        <span
          v-for="(artName, idx) in artistNames"
          :key="artName"
          class="song-item-artist-link"
          @click.stop="goToArtist(artName)"
          :title="`Ver artista: ${artName}`"
        >
          {{ artName }}<span v-if="idx < artistNames.length - 1">, </span>
        </span>
      </span>
      <span v-else>{{ song.artist || 'Artista desconocido' }}</span>
    </span>

  </MediaCard>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import MediaCard from "../common/MediaCard.vue";
import { useLibraryStore } from "../../stores/libraryStore.js";
import { useRouter } from "vue-router";
import { Play } from "lucide-vue-next";
import SongIconCover from "../common/SongIconCover.vue";
import { resolveSongCover } from "../../lib/covers.js";
const library = useLibraryStore();
const router = useRouter();

const props = defineProps({
  song: {
    type: Object,
    required: true
  }
});

const isMobile = ref(false);
const songCover = computed(() => resolveSongCover(library, props.song));

const artistNames = computed(() => {
  if (!props.song?.artist) return [];
  const parsed = library.parseArtistNames(props.song.artist);
  return parsed.length ? parsed : [props.song.artist];
});

function goToArtist(name) {
  if (!name || name === "Unknown" || name === "Artista desconocido") return;
  library.closeNowPlaying();
  library.closeQueue();
  router.push({ name: "artist", params: { name: encodeURIComponent(name.trim()) } });
}
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
