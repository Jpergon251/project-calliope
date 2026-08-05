<template>
  <main class="albums-page">

    <h1 class="page-title">Todos los álbumes</h1>

    <input
      v-model="query"
      type="search"
      placeholder="Busca álbumes..."
    />

    <AlbumList :albums="filteredAlbums" v-if="filteredAlbums.length > 0" />

    <section class="no-albums" v-else>
      <p>
        No se encontraron álbumes.
      </p>
      <p>
        Añade canciones a <strong>tu carpeta</strong> para que aparezcan aquí.
      </p>
    </section>
    
  </main>
</template>

<script setup>
import { ref, computed } from "vue";

import { useLibraryStore } from "../stores/libraryStore.js";
import AlbumList from "../components/common/AlbumList.vue";

const library = useLibraryStore();

const query = ref("");

const filteredAlbums = computed(() => {
  let albums = library.albums;

  if (query.value.trim()) {
    const q = query.value.toLowerCase();

    albums = albums.filter(album =>
      album.name.toLowerCase().includes(q) ||
      album.artist.toLowerCase().includes(q)
    );
  }

  return albums;
});
</script>