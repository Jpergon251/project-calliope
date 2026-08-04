<template>
  <div class="settings-page">
    <h1>Configuración</h1>

    <section class="music-library">

      <h2>Biblioteca de Música</h2>

      <p>
        Canciones cargadas: {{ library.songs.length }}
      </p>

      <div class="settings-actions">

        <button
          @click="library.selectFolder()"
          class="settings-button"
        >
          Cambiar carpeta de música
        </button>

        <button
          @click="removeLibrary"
          :disabled="!library.folderHandle"
          class="settings-button"
        >
          Eliminar carpeta de música
        </button>
      </div>
    </section>

    <section class="library-health">

      <h2>Salud de la Biblioteca</h2>

      <p>
        Canciónes sin metadatos: <strong>{{ songsWithoutMetadata }}</strong>
      </p>

      <p class="health-description">
        Los metadatos ayudan a organizar tu biblioteca, agrupar álbumes, mejorar la búsqueda y mostrar la información correcta de las canciones.
      </p>

      <section class="health-actions">
        <button
          class="settings-button"
          disabled
        >
          Escanear metadatos (Próximamente)
        </button>

        <button
          @click="library.rescanLibrary()"
          :disabled="!library.folderHandle"
          class="settings-button"
        >
          Escanear de nuevo
        </button>

        <button
          @click="rebuild"
          :disabled="!library.folderHandle"
          class="settings-button"
        >
          Reconstruir Biblioteca
        </button>
      </section>
      
    </section>

  </div>
</template>

<script setup>
import { useLibraryStore } from "../stores/libraryStore.js";

import { computed } from "vue";

const songsWithoutMetadata = computed(() =>
  library.songs.filter(song => !song.hasMetadata).length
);

const library = useLibraryStore();

async function removeLibrary() {

  const confirmDelete =
    confirm(
      "Remove current music folder?"
    );

  if (
    !confirmDelete
  ) return;

  await library
    .removeFolder();

  router.push({ name: "home" });
}

async function rebuild() {

  const confirmRebuild = confirm(
    "This will rebuild your music library from scratch. Playlists and settings will not be affected.\n\nContinue?"
  );

  if (!confirmRebuild) return;

  await library.rebuildLibrary();
}
</script>