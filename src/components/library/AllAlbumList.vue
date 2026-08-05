<template>
  <section class="albums">

    <header class="title">
      <h2>Álbumes</h2>

      <RouterLink
        to="/albums"
        class="view-all"
      >
        Ver todo
      </RouterLink>
    </header>

    <input
      v-model="query"
      type="search"
      placeholder="Busca tu álbum..."
    />

    <AlbumList 
      :albums="filteredAlbums"
      v-if="filteredAlbums.length > 0"
      />
    <span v-else class="no-albums">
      <p>No se encontraron álbumes.</p>
      <p>Añade canciones a tu carpeta para que Calliope los detecte.</p>
    </span>
  </section>
</template>

<script setup>
import AlbumItem from "./AlbumItem.vue";

import { ref, computed } from "vue";

import { useLibraryStore } from "../../stores/libraryStore.js";
import { Music } from "lucide-vue-next";

import { onMounted } from "vue";
import AlbumList from "../common/AlbumList.vue";


const library = useLibraryStore();
// window.library = library;

const query = ref("");

const MAX_ALBUMS = 20;

const filteredAlbums = computed(() => {

  let albums = library.albums;

  if (query.value.trim()) {

    const q = query.value.toLowerCase();

    albums = albums.filter(album =>
      album.name.toLowerCase().includes(q) ||
      album.artist.toLowerCase().includes(q)
    );

  }

  return albums.slice(0, MAX_ALBUMS);

});
</script>