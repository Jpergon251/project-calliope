<template>
  <section
    class="library-artists-section"
    aria-labelledby="artists-title"
  >
    <header class="section-title-row">
      <div class="section-title-content">
        <div>
          <span
            v-if="preview"
            class="section-kicker"
          >
            Descubre
          </span>

          <h2 id="artists-title">
            Artistas
          </h2>
        </div>

        <span class="section-count">
          {{ filteredArtists.length }}
          {{
            filteredArtists.length === 1
              ? "artista"
              : "artistas"
          }}
        </span>
      </div>

      <div class="section-actions">
        <div
          v-if="preview && previewArtists.length > 1"
          class="carousel-controls"
          aria-label="Controles de artistas"
        >
          <button
            type="button"
            class="carousel-button"
            aria-label="Artistas anteriores"
            @click="scrollCarousel(-1)"
          >
            <ChevronLeft :size="17" />
          </button>

          <button
            type="button"
            class="carousel-button"
            aria-label="Siguientes artistas"
            @click="scrollCarousel(1)"
          >
            <ChevronRight :size="17" />
          </button>
        </div>

        <button
          v-if="preview && library.artists.length > 0"
          type="button"
          class="section-link"
          @click="openAllArtists"
        >
          <span>Ver todos</span>
          <ChevronRight :size="16" />
        </button>
      </div>
    </header>

    <!-- PREVIEW -->
    <div
      v-if="preview && previewArtists.length"
      ref="carouselRef"
      class="artists-grid artists-grid-preview"
    >
      <article
        v-for="artist in previewArtists"
        :key="artist.id"
        class="artist-card"
        role="button"
        tabindex="0"
        :aria-label="`Abrir artista ${artist.name}`"
        @click="openArtist(artist)"
        @keyup.enter="openArtist(artist)"
        @keyup.space.prevent="openArtist(artist)"
      >
      <div class="artist-cover">
        <img
          v-if="artist.customCover"
          :src="artist.customCover"
          :alt="`Foto de ${artist.name}`"
          loading="lazy"
        />
        <div
          v-else
          class="artist-cover-fallback"
          aria-hidden="true"
        >
          <User :size="42" />
        </div>

        <div class="artist-cover-overlay">
          <span class="artist-open-icon">
            <ChevronRight :size="19" />
          </span>
        </div>
      </div>

        <div class="artist-info">
          <h3
            class="artist-name"
            :title="artist.name"
          >
            {{ artist.name }}
          </h3>

          <span class="artist-count">
            {{ artist.songCount || 0 }}
            {{
              artist.songCount === 1
                ? "canción"
                : "canciones"
            }}

            <template
              v-if="artist.albumsCount > 0"
            >
              ·
              {{ artist.albumsCount }}
              {{
                artist.albumsCount === 1
                  ? "álbum"
                  : "álbumes"
              }}
            </template>
          </span>
        </div>
      </article>
    </div>

    <!-- VISTA COMPLETA -->
    <div
      v-else-if="!preview && filteredArtists.length"
      class="artists-grid artists-grid-full"
    >
      <article
        v-for="artist in filteredArtists"
        :key="artist.id"
        class="artist-card"
        role="button"
        tabindex="0"
        :aria-label="`Abrir artista ${artist.name}`"
        @click="openArtist(artist)"
        @keyup.enter="openArtist(artist)"
        @keyup.space.prevent="openArtist(artist)"
      >
        <div class="artist-cover">
          <img
            v-if="artist.customCover"
            :src="artist.customCover"
            :alt="`Foto de ${artist.name}`"
            loading="lazy"
          />

          <div
            v-else
            class="artist-cover-fallback"
            aria-hidden="true"
          >
            <User :size="42" />
          </div>

          <div class="artist-cover-overlay">
            <span class="artist-open-icon">
              <ChevronRight :size="19" />
            </span>
          </div>
        </div>

        <div class="artist-info">
          <h3
            class="artist-name"
            :title="artist.name"
          >
            {{ artist.name }}
          </h3>

          <span class="artist-count">
            {{ artist.songCount || 0 }}
            {{
              artist.songCount === 1
                ? "canción"
                : "canciones"
            }}

            <template
              v-if="artist.albumsCount > 0"
            >
              ·
              {{ artist.albumsCount }}
              {{
                artist.albumsCount === 1
                  ? "álbum"
                  : "álbumes"
              }}
            </template>
          </span>
        </div>
      </article>
    </div>

    <!-- SIN RESULTADOS -->
    <div
      v-else-if="hasSearch"
      class="empty-state"
    >
      <div class="empty-state-icon">
        <Search :size="28" />
      </div>

      <h3>No se encontraron artistas</h3>

      <p>
        No hay ningún artista que coincida con
        <strong>“{{ searchQuery }}”</strong>.
      </p>
    </div>

    <!-- BIBLIOTECA VACÍA -->
    <div
      v-else
      class="empty-state"
    >
      <div class="empty-state-icon">
        <Mic2 :size="28" />
      </div>

      <h3>No hay artistas en tu biblioteca</h3>

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
  Mic2,
  Search,
  User,
} from "lucide-vue-next";

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
const previewArtists = ref([]);

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

const filteredArtists = computed(() => {
  const artists = library.artists || [];

  if (!searchQuery.value) {
    return artists;
  }

  const query = searchQuery.value.toLocaleLowerCase();

  return artists.filter((artist) => {
    const name = String(
      artist.name || ""
    ).toLocaleLowerCase();

    return name.includes(query);
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


function refreshPreviewArtists() {
  const artists = filteredArtists.value;

  if (!artists.length) {
    previewArtists.value = [];
    return;
  }

  if (searchQuery.value) {
    previewArtists.value = artists.slice(
      0,
      PREVIEW_LIMIT
    );

    return;
  }

  previewArtists.value = shuffle(artists).slice(
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

function openArtist(artist) {
  if (!artist?.name) {
    return;
  }

  router.push({
    name: "artist",
    params: {
      name: encodeURIComponent(
        artist.name
      ),
    },
  });
}

function openAllArtists() {
  router.push({
    name: "library",
    query: {
      category: "artists",
    },
  });
}


/* =========================================================
   WATCHERS
   ========================================================= */

watch(
  () => library.artists.length,
  () => {
    refreshPreviewArtists();
  },
  {
    immediate: true,
  }
);

watch(
  searchQuery,
  () => {
    if (props.preview) {
      refreshPreviewArtists();

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
      refreshPreviewArtists();
    }
  }
);

defineExpose({
  scrollCarousel,
});
</script>