<template>
  <main class="songs-page">

    <h1>Todas las canciones</h1>

    <NoFolderState v-if="!library.folderHandle" />

    <template v-else>
      <input
        v-model="query"
        type="search"
        placeholder="Buscar canciones..."
        aria-label="Buscar canciones"
      />

      <SongList :songs="filteredSongs" v-if="filteredSongs.length > 0" />

      <section class="no-songs" v-else>
        <p>
          No se encontraron canciones.
        </p>
        <p>
          Añade canciones a <strong>tu carpeta</strong> para que aparezcan aquí.
        </p>

      </section>
    </template>

  </main>
</template>

<script setup>
import { ref, computed } from "vue";
import { useLibraryStore } from "../stores/libraryStore";
import SongList from "../components/common/SongList.vue";
import NoFolderState from "../components/common/NoFolderState.vue";

const library = useLibraryStore();

const query = ref("");

const filteredSongs = computed(() => {
  let songs = library.songs;

  if (query.value.trim()) {
    const q = query.value.toLowerCase();

    songs = songs.filter(song =>
      song.title.toLowerCase().includes(q) ||
      song.artist.toLowerCase().includes(q)
    );
  }

  return songs;
});
</script>
