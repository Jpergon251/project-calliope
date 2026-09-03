<template>
  <div class="library-page">
    <header class="library-header">
      <div class="library-header-top">
        <div class="library-title-block">
          <span class="library-kicker">Tu colección</span>

          <div class="library-title-row">
            <h1>Biblioteca</h1>

            <span class="library-summary-stats">
              {{ library.songs.length }} canciones
              ·
              {{ library.albums.length }} álbumes
              ·
              {{ library.artists.length }} artistas
              ·
              {{ library.playlists.length }} playlists
            </span>
          </div>
        </div>

        <div class="library-search">
          <Search
            :size="19"
            class="library-search-icon"
          />

          <input
            v-model="searchQuery"
            type="search"
            placeholder="Buscar en tu biblioteca..."
            aria-label="Buscar en tu biblioteca"
          />

          <button
            v-if="searchQuery"
            type="button"
            class="library-search-clear"
            aria-label="Limpiar búsqueda"
            @click="searchQuery = ''"
          >
            <X :size="17" />
          </button>
        </div>
      </div>

      <nav
        class="library-category-pills"
        aria-label="Categorías de biblioteca"
      >
        <button
          type="button"
          class="category-pill"
          :class="{ active: activeCategory === 'all' }"
          @click="selectCategory('all')"
        >
          <Sparkles :size="16" />
          <span>Todo</span>
        </button>

        <button
          type="button"
          class="category-pill"
          :class="{ active: activeCategory === 'songs' }"
          @click="selectCategory('songs')"
        >
          <Music2 :size="16" />
          <span>Canciones</span>

          <span class="pill-count">
            {{ library.songs.length }}
          </span>
        </button>

        <button
          type="button"
          class="category-pill"
          :class="{ active: activeCategory === 'albums' }"
          @click="selectCategory('albums')"
        >
          <DiscAlbum :size="16" />
          <span>Álbumes</span>

          <span class="pill-count">
            {{ library.albums.length }}
          </span>
        </button>

        <button
          type="button"
          class="category-pill"
          :class="{ active: activeCategory === 'artists' }"
          @click="selectCategory('artists')"
        >
          <Mic2 :size="16" />
          <span>Artistas</span>

          <span class="pill-count">
            {{ library.artists.length }}
          </span>
        </button>

        <button
          type="button"
          class="category-pill"
          :class="{ active: activeCategory === 'playlists' }"
          @click="selectCategory('playlists')"
        >
          <ListMusic :size="16" />
          <span>Playlists</span>

          <span class="pill-count">
            {{ library.playlists.length }}
          </span>
        </button>
      </nav>
    </header>

    <main class="library-content-body">

      <!-- =================================================
           TODO
           ================================================= -->

      <section
        v-if="activeCategory === 'all'"
        class="library-all-grid"
      >
        <PLList
          :search-query="searchQuery"
          :preview="true"
        />

        <AllSongList
          :search-query="searchQuery"
          :preview="true"
        />

        <AllAlbumList
          :search-query="searchQuery"
          :preview="true"
        />

        <ArtistList
          :search-query="searchQuery"
          :preview="true"
        />
      </section>


      <!-- =================================================
           CANCIONES
           ================================================= -->

      <section
        v-else-if="activeCategory === 'songs'"
        class="library-full-view"
      >
        <AllSongList
          :search-query="searchQuery"
          :preview="false"
        />
      </section>


      <!-- =================================================
           ÁLBUMES
           ================================================= -->

      <section
        v-else-if="activeCategory === 'albums'"
        class="library-full-view"
      >
        <AllAlbumList
          :search-query="searchQuery"
          :preview="false"
        />
      </section>


      <!-- =================================================
           ARTISTAS
           ================================================= -->

      <section
        v-else-if="activeCategory === 'artists'"
        class="library-full-view"
      >
        <ArtistList
          :search-query="searchQuery"
          :preview="false"
        />
      </section>


      <!-- =================================================
           PLAYLISTS
           ================================================= -->

      <section
        v-else-if="activeCategory === 'playlists'"
        class="library-full-view"
      >
        <PLList
          :search-query="searchQuery"
          :preview="false"
        />
      </section>

    </main>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import AllAlbumList from "../components/library/AllAlbumList.vue";
import AllSongList from "../components/library/AllSongList.vue";
import ArtistList from "../components/library/ArtistList.vue";
import PLList from "../components/library/PLList.vue";

import { useLibraryStore } from "../stores/libraryStore.js";

import {
  DiscAlbum,
  ListMusic,
  Mic2,
  Music2,
  Search,
  Sparkles,
  X,
} from "lucide-vue-next";

const library = useLibraryStore();

const route = useRoute();
const router = useRouter();

const VALID_CATEGORIES = [
  "all",
  "songs",
  "albums",
  "artists",
  "playlists",
];

function getCategoryFromRoute() {
  const category = String(route.query.category || "all");

  return VALID_CATEGORIES.includes(category)
    ? category
    : "all";
}

const activeCategory = ref(getCategoryFromRoute());

const searchQuery = ref(
  typeof route.query.search === "string"
    ? route.query.search
    : ""
);


/* =========================================================
   CATEGORÍAS
   ========================================================= */

function selectCategory(category) {
  if (!VALID_CATEGORIES.includes(category)) {
    category = "all";
  }

  const query = {
    ...route.query,
  };

  if (category === "all") {
    delete query.category;
  } else {
    query.category = category;
  }

  router.replace({
    query,
  });
}


/* =========================================================
   SINCRONIZAR CATEGORÍA CON URL
   ========================================================= */

watch(
  () => route.query.category,
  () => {
    activeCategory.value = getCategoryFromRoute();
  }
);


/* =========================================================
   BÚSQUEDA
   ========================================================= */

watch(
  searchQuery,
  (value) => {
    const query = {
      ...route.query,
    };

    if (value.trim()) {
      query.search = value;
    } else {
      delete query.search;
    }

    if (String(route.query.search || "") !== value) {
      router.replace({
        query,
      });
    }
  }
);

watch(
  () => route.query.search,
  (value) => {
    const nextSearch =
      typeof value === "string"
        ? value
        : "";

    if (searchQuery.value !== nextSearch) {
      searchQuery.value = nextSearch;
    }
  }
);


/* =========================================================
   SCROLL
   ========================================================= */

watch(
  activeCategory,
  () => {
    if (typeof window === "undefined") {
      return;
    }

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }
);
</script>