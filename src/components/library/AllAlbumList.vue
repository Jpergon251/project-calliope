<template>
  <section class="albums" aria-labelledby="albums-title">
    <header class="title">
      <div class="title-content">
        <div>
          <span v-if="preview" class="section-kicker">
            Descubre
          </span>

          <h2 id="albums-title">
            Álbumes
          </h2>
        </div>

        <span class="section-count">
          {{ filteredAlbums.length }}
          {{ filteredAlbums.length === 1 ? "álbum" : "álbumes" }}
        </span>
      </div>

      <div class="section-actions">
        <div
          v-if="preview && previewAlbums.length > 1"
          class="carousel-controls"
          aria-label="Controles de álbumes"
        >
          <button
            type="button"
            class="carousel-button"
            aria-label="Álbumes anteriores"
            @click="scrollCarousel(-1)"
          >
            <ChevronLeft :size="17" />
          </button>

          <button
            type="button"
            class="carousel-button"
            aria-label="Siguientes álbumes"
            @click="scrollCarousel(1)"
          >
            <ChevronRight :size="17" />
          </button>
        </div>

        <button
          v-if="preview && library.albums.length > 0"
          type="button"
          class="view-all"
          @click="openAllAlbums"
        >
          <span>Ver todos</span>
          <ChevronRight :size="16" />
        </button>
      </div>
    </header>

    <!-- PREVIEW -->
    <div
      v-if="preview && previewAlbums.length"
      ref="carouselRef"
      class="album-preview-grid"
    >
      <article
        v-for="album in previewAlbums"
        :key="album.id"
        class="album-preview-card"
        role="button"
        tabindex="0"
        :aria-label="`Abrir álbum ${album.name}`"
        @click="openAlbum(album)"
        @keyup.enter="openAlbum(album)"
        @keyup.space.prevent="openAlbum(album)"
      >
        <div class="album-preview-cover">
          <img
            v-if="album.cover"
            :src="album.cover"
            :alt="album.name"
            loading="lazy"
          />

          <div
            v-else
            class="album-preview-cover-fallback"
            aria-hidden="true"
          >
            <DiscAlbum :size="42" />
          </div>

          <div class="album-preview-overlay">
            <span class="album-open-icon">
              <ChevronRight :size="19" />
            </span>
          </div>
        </div>

        <div class="album-preview-info">
          <h3
            class="album-preview-name"
            :title="album.name"
          >
            {{ album.name }}
          </h3>

          <span class="album-preview-artist">
            {{ album.artist || "Artista desconocido" }}
          </span>
        </div>
      </article>
    </div>

    <!-- VISTA COMPLETA -->
    <div
      v-else-if="!preview && filteredAlbums.length"
      class="album-list-full"
    >
      <AlbumList :albums="filteredAlbums" />
    </div>

    <!-- SIN RESULTADOS -->
    <div
      v-else-if="hasSearch"
      class="no-albums"
    >
      <div class="empty-state-icon">
        <Search :size="28" />
      </div>

      <h3>No se encontraron álbumes</h3>

      <p>
        No hay ningún álbum que coincida con
        <strong>“{{ searchQuery }}”</strong>.
      </p>
    </div>

    <!-- BIBLIOTECA VACÍA -->
    <div
      v-else
      class="no-albums"
    >
      <div class="empty-state-icon">
        <DiscAlbum :size="28" />
      </div>

      <h3>No hay álbumes en tu biblioteca</h3>

      <p>
        Añade canciones a tu carpeta para que Calliope los detecte.
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
  DiscAlbum,
  Search,
} from "lucide-vue-next";

import AlbumList from "../common/AlbumList.vue";

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
const previewAlbums = ref([]);

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

const filteredAlbums = computed(() => {
  const albums = library.albums || [];

  if (!searchQuery.value) {
    return albums;
  }

  const query = searchQuery.value.toLocaleLowerCase();

  return albums.filter((album) => {
    const name = String(
      album.name || ""
    ).toLocaleLowerCase();

    const artist = String(
      album.artist || ""
    ).toLocaleLowerCase();

    return (
      name.includes(query) ||
      artist.includes(query)
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


function refreshPreviewAlbums() {
  const albums = filteredAlbums.value;

  if (!albums.length) {
    previewAlbums.value = [];
    return;
  }

  if (searchQuery.value) {
    previewAlbums.value = albums.slice(
      0,
      PREVIEW_LIMIT
    );

    return;
  }

  previewAlbums.value = shuffle(albums).slice(
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

function openAlbum(album) {
  if (!album?.id) {
    return;
  }

  router.push({
    name: "album",
    params: {
      id: album.id,
    },
  });
}

function openAllAlbums() {
  router.push({
    name: "library",
    query: {
      category: "albums",
    },
  });
}


/* =========================================================
   WATCHERS
   ========================================================= */

watch(
  () => library.albums.length,
  () => {
    refreshPreviewAlbums();
  },
  {
    immediate: true,
  }
);

watch(
  searchQuery,
  () => {
    if (props.preview) {
      refreshPreviewAlbums();

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
      refreshPreviewAlbums();
    }
  }
);

defineExpose({
  scrollCarousel,
});
</script>