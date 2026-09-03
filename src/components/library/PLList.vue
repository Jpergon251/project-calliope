<template>
  <section class="all-playlist">
    <!-- =====================================================
         HEADER
    ====================================================== -->

    <div class="playlist-section-header">
      <div class="playlist-title-block">
        <span class="playlist-kicker">Tu colección</span>

        <div class="playlist-title-row">
          <div class="playlist-title">
            <h2>Playlists</h2>

            <span class="playlist-count">
              {{ filteredPlaylists.length }}
            </span>
          </div>

          <span v-if="preview && library.playlists.length" class="playlist-subtitle">
            Tus playlists, siempre a mano.
          </span>
        </div>
      </div>

      <div class="playlist-section-actions">
        <!-- Create -->
        <button
          type="button"
          class="create-playlist-button"
          @click="createPlaylistModal?.openModal?.()"
        >
          <PlusCircleIcon :size="17" />
          <span>Crear playlist</span>
        </button>

        <!-- Carousel controls -->
        <template v-if="showCarouselControls">
          <button
            type="button"
            class="playlist-carousel-button"
            aria-label="Playlists anteriores"
            @click="scrollPlaylists(-1)"
          >
            <ChevronLeft :size="18" />
          </button>

          <button
            type="button"
            class="playlist-carousel-button"
            aria-label="Siguientes playlists"
            @click="scrollPlaylists(1)"
          >
            <ChevronRight :size="18" />
          </button>
        </template>

        <!-- View all -->
        <button
          v-if="preview && filteredPlaylists.length > PREVIEW_LIMIT"
          type="button"
          class="playlist-view-all-button"
          @click="openAllPlaylists"
        >
          Ver todas
        </button>
      </div>
    </div>

    <!-- =====================================================
         PREVIEW / CAROUSEL
    ====================================================== -->

    <div
      v-if="preview"
      ref="playlistsCarousel"
      class="playlist-carousel"
    >
      <div
        v-for="playlist in previewPlaylists"
        :key="playlist.id"
        class="playlist-carousel-item"
      >
        <PlaylistItem :playlist="playlist" />
      </div>

      <!-- Empty -->
      <div
        v-if="!previewPlaylists.length"
        class="playlist-empty-state"
      >
        <div class="playlist-empty-icon">
          <ListMusic :size="23" />
        </div>

        <div>
          <strong>
            {{
              searchQuery?.trim()
                ? "No se encontraron playlists"
                : "Todavía no tienes playlists"
            }}
          </strong>

          <span>
            {{
              searchQuery?.trim()
                ? "Prueba con otro término de búsqueda."
                : "Crea una playlist para empezar a organizar tu música."
            }}
          </span>
        </div>
      </div>
    </div>

    <!-- =====================================================
         FULL VIEW
    ====================================================== -->

    <div
      v-else
      ref="playlistsCarousel"
      class="playlist-carousel playlist-carousel-full"
    >
      <div
        v-for="playlist in filteredPlaylists"
        :key="playlist.id"
        class="playlist-carousel-item"
      >
        <PlaylistItem :playlist="playlist" />
      </div>

      <!-- Empty -->
      <div
        v-if="!filteredPlaylists.length"
        class="playlist-empty-state"
      >
        <div class="playlist-empty-icon">
          <ListMusic :size="23" />
        </div>

        <div>
          <strong>
            {{
              searchQuery?.trim()
                ? "No se encontraron playlists"
                : "Todavía no tienes playlists"
            }}
          </strong>

          <span>
            {{
              searchQuery?.trim()
                ? "Prueba con otro término de búsqueda."
                : "Crea una playlist para empezar a organizar tu música."
            }}
          </span>
        </div>
      </div>
    </div>

    <!-- =====================================================
         CREATE PLAYLIST
    ====================================================== -->

    <CreatePlaylist ref="createPlaylistModal" />
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  ChevronLeft,
  ChevronRight,
  ListMusic,
  PlusCircleIcon,
} from "lucide-vue-next";

import PlaylistItem from "./PlaylistItem.vue";
import CreatePlaylist from "../modals/CreatePlaylist.vue";
import { useLibraryStore } from "../../stores/libraryStore.js";

/* ============================================================
   PROPS
============================================================ */

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

/* ============================================================
   STORES / ROUTER
============================================================ */

const library = useLibraryStore();
const router = useRouter();

/* ============================================================
   CONSTANTS
============================================================ */

const PREVIEW_LIMIT = 10;

/* ============================================================
   REFS
============================================================ */

const createPlaylistModal = ref(null);
const playlistsCarousel = ref(null);

/* ============================================================
   PLAYLISTS
============================================================ */

/*
 * Favorites is always first.
 *
 * The rest remain in the exact order provided by the library.
 * We deliberately do NOT shuffle playlists.
 */
const orderedPlaylists = computed(() => {
  const favorites = library.playlists.find(
    (playlist) => playlist.id === library.FAVORITES_PLAYLIST_ID,
  );

  const others = library.playlists.filter(
    (playlist) => playlist.id !== library.FAVORITES_PLAYLIST_ID,
  );

  return favorites ? [favorites, ...others] : others;
});

/* ============================================================
   SEARCH
============================================================ */

const filteredPlaylists = computed(() => {
  const query = String(props.searchQuery || "").trim().toLowerCase();

  if (!query) {
    return orderedPlaylists.value;
  }

  return orderedPlaylists.value.filter((playlist) => {
    const name = String(playlist.name || "").toLowerCase();

    return name.includes(query);
  });
});

/* ============================================================
   PREVIEW
============================================================ */

const previewPlaylists = computed(() => {
  return filteredPlaylists.value.slice(0, PREVIEW_LIMIT);
});

/* ============================================================
   CAROUSEL CONTROLS
============================================================ */

const visiblePlaylists = computed(() => {
  return props.preview
    ? previewPlaylists.value
    : filteredPlaylists.value;
});

const showCarouselControls = computed(() => {
  return visiblePlaylists.value.length > 1;
});

/* ============================================================
   SCROLL
============================================================ */

function scrollPlaylists(direction) {
  const container = playlistsCarousel.value;

  if (!container) return;

  const amount = Math.max(
    container.clientWidth * 0.78,
    280,
  );

  container.scrollBy({
    left: amount * direction,
    behavior: "smooth",
  });
}

/* ============================================================
   NAVIGATION
============================================================ */

function openAllPlaylists() {
  router.push({
    path: "/library",
    query: {
      category: "playlists",
    },
  });
}

/* ============================================================
   REFRESH CAROUSEL
============================================================ */

watch(
  () => [
    library.playlists.length,
    props.searchQuery,
    props.preview,
  ],
  async () => {
    await nextTick();

    const container = playlistsCarousel.value;

    if (!container) return;

    /*
     * When the search changes or the list changes,
     * return to the beginning instead of leaving the user
     * somewhere in the middle of the previous result set.
     */
    container.scrollTo({
      left: 0,
      behavior: "auto",
    });
  },
);
</script>