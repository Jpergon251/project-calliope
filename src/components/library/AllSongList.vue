<template>
  <section class="all-songs" aria-labelledby="songs-title">
    <header class="title">
      <div class="title-content">
        <div>
          <span v-if="preview" class="section-kicker">
            Descubre
          </span>

          <h2 id="songs-title">
            Canciones
          </h2>
        </div>

        <span class="section-count">
          {{ preview ? filteredSongs.length : filteredSongs.length }}
          {{ filteredSongs.length === 1 ? "canción" : "canciones" }}
        </span>
      </div>

      <div class="section-actions">
        <div
          v-if="preview && previewSongs.length > 1"
          class="carousel-controls"
          aria-label="Controles de canciones"
        >
          <button
            type="button"
            class="carousel-button"
            aria-label="Canciones anteriores"
            @click="scrollCarousel(-1)"
          >
            <ChevronLeft :size="17" />
          </button>

          <button
            type="button"
            class="carousel-button"
            aria-label="Siguientes canciones"
            @click="scrollCarousel(1)"
          >
            <ChevronRight :size="17" />
          </button>
        </div>

        <button
          v-if="preview && library.songs.length > 0"
          type="button"
          class="view-all"
          @click="openAllSongs"
        >
          <span>Ver todas</span>
          <ChevronRight :size="16" />
        </button>
      </div>
    </header>

    <!-- PREVIEW -->
    <div
      v-if="preview && previewSongs.length"
      ref="carouselRef"
      class="song-preview-list"
    >
      <SongList :songs="previewSongs" />
    </div>

    <!-- VISTA COMPLETA -->
    <div
      v-else-if="!preview && filteredSongs.length"
      class="song-list-full"
    >
      <SongList :songs="filteredSongs" />
    </div>

    <!-- SIN RESULTADOS DE BÚSQUEDA -->
    <div
      v-else-if="hasSearch"
      class="no-songs"
    >
      <div class="empty-state-icon">
        <Search :size="28" />
      </div>

      <h3>No se encontraron canciones</h3>

      <p>
        No hay ninguna canción que coincida con
        <strong>“{{ searchQuery }}”</strong>.
      </p>
    </div>

    <!-- BIBLIOTECA VACÍA -->
    <div
      v-else
      class="no-songs"
    >
      <div class="empty-state-icon">
        <Music2 :size="28" />
      </div>

      <h3>No hay canciones en tu biblioteca</h3>

      <p>
        Añade canciones a tu carpeta para que Calliope las detecte.
      </p>
    </div>
  </section>
</template>

<script setup>
import {
  computed,
  nextTick,
  ref,
  watch,
} from "vue";

import { useRouter } from "vue-router";

import {
  ChevronLeft,
  ChevronRight,
  Music2,
  Search,
} from "lucide-vue-next";

import SongList from "../common/SongList.vue";

import { useLibraryStore } from "../../stores/libraryStore.js";

const props = defineProps({
  searchQuery: {
    type: String,
    default: "",
  },

  preview: {
    type: Boolean,
    default: false,
  },
});

const library = useLibraryStore();
const router = useRouter();

const carouselRef = ref(null);
const previewSongs = ref([]);

const PREVIEW_LIMIT = 10;

const searchQuery = computed(() => {
  return props.searchQuery.trim();
});

const hasSearch = computed(() => {
  return searchQuery.value.length > 0;
});


/* =========================================================
   FILTRADO
   ========================================================= */

const filteredSongs = computed(() => {
  const songs = library.songs || [];

  if (!searchQuery.value) {
    return songs;
  }

  const query = searchQuery.value.toLocaleLowerCase();

  return songs.filter((song) => {
    const title = String(
      song.title || song.name || ""
    ).toLocaleLowerCase();

    const artist = String(
      song.artist || ""
    ).toLocaleLowerCase();

    const album = String(
      song.album || ""
    ).toLocaleLowerCase();

    return (
      title.includes(query) ||
      artist.includes(query) ||
      album.includes(query)
    );
  });
});


/* =========================================================
   ALEATORIO
   ========================================================= */

function shuffle(array) {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(
      Math.random() * (i + 1)
    );

    [result[i], result[j]] = [
      result[j],
      result[i],
    ];
  }

  return result;
}


function refreshPreviewSongs() {
  const songs = filteredSongs.value;

  if (!songs.length) {
    previewSongs.value = [];
    return;
  }

  /*
   * Si hay una búsqueda activa, mostramos los primeros
   * resultados relevantes en lugar de resultados aleatorios.
   */
  if (searchQuery.value) {
    previewSongs.value = songs.slice(
      0,
      PREVIEW_LIMIT
    );

    return;
  }

  previewSongs.value = library.smartShuffle(songs).slice(
    0,
    PREVIEW_LIMIT
  );
}


/* =========================================================
   CARRUSEL
   ========================================================= */

async function scrollCarousel(direction) {
  await nextTick();

  const container = carouselRef.value;

  if (!container) {
    return;
  }

  const amount =
    Math.max(
      container.clientWidth * 0.8,
      300
    ) * direction;

  container.scrollBy({
    left: amount,
    behavior: "smooth",
  });
}


/* =========================================================
   NAVEGACIÓN
   ========================================================= */

function openAllSongs() {
  router.push({
    path: "/library",
    query: {
      category: "songs",
    },
  });
}


/* =========================================================
   WATCHERS
   ========================================================= */

watch(
  () => library.songs.length,
  () => {
    refreshPreviewSongs();
  },
  {
    immediate: true,
  }
);

watch(
  searchQuery,
  () => {
    if (props.preview) {
      refreshPreviewSongs();

      nextTick(() => {
        if (carouselRef.value) {
          carouselRef.value.scrollTo({
            left: 0,
            behavior: "auto",
          });
        }
      });
    }
  }
);

watch(
  () => props.preview,
  (isPreview) => {
    if (isPreview) {
      refreshPreviewSongs();
    }
  }
);


/*
 * Permite que Library.vue u otro padre pueda controlar
 * el carrusel si lo necesita en el futuro.
 */
defineExpose({
  scrollCarousel,
});
</script>