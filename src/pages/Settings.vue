<template>
  <main class="settings-page">

    <section class="settings-header">
      <h1>Configuración</h1>
      <p>
        Gestiona tu biblioteca, archivos y opciones de Calliope.
      </p>
    </section>


    <section class="settings-card">

      <div class="settings-card-header">
        <h2>Biblioteca de Música</h2>

        <p>
          Administra la carpeta donde Calliope busca tus canciones.
        </p>
      </div>


      <div class="library-info">
        <span>
          Canciones cargadas
        </span>

        <strong>
          {{ library.songs.length }}
        </strong>
      </div>


      <div class="settings-actions">

        <div class="setting-action">

          <button
            @click="library.selectFolder()"
            class="settings-button"
          >
            Cambiar carpeta de música
          </button>

          <p>
            Selecciona una nueva carpeta donde se encuentran tus archivos de música.
          </p>

        </div>


        <div class="setting-action">

          <button
            @click="removeLibrary"
            :disabled="!library.folderHandle"
            class="settings-button danger"
          >
            Eliminar carpeta de música
          </button>

          <p>
            Desvincula la carpeta actual. Tus archivos originales no serán eliminados.
          </p>

        </div>

      </div>

    </section>



    <section class="settings-card">

      <div class="settings-card-header">

        <h2>Estado de la Biblioteca</h2>

        <p>
          Comprueba y mantiene organizada la información de tus canciones.
        </p>

      </div>


      <div class="metadata-status">

        <span>
          Canciones sin metadatos
        </span>

        <strong>
          {{ songsWithoutMetadata }}
        </strong>

      </div>



      <p class="health-description">
        Los metadatos contienen información como título, artista, álbum o portada.
        Calliope los utiliza para organizar tu biblioteca correctamente.
      </p>



      <div class="settings-actions">


        <div class="setting-action">

          <button
            @click="router.push('/metadata')"
            :disabled="!library.folderHandle"
            class="settings-button"
          >
            Gestionar metadatos
          </button>


          <p>
            Consulta, edita y analiza los metadatos de tus canciones para completar información faltante.
          </p>

        </div>



        <div class="setting-action">

          <button
            @click="library.rescanLibrary()"
            :disabled="!library.folderHandle"
            class="settings-button"
          >
            Escanear de nuevo
          </button>


          <p>
            Busca nuevos archivos añadidos a la carpeta seleccionada.
          </p>

        </div>



        <div class="setting-action">

          <button
            @click="rebuild"
            :disabled="!library.folderHandle"
            class="settings-button"
          >
            Reconstruir biblioteca
          </button>


          <p>
            Elimina la información guardada y vuelve a analizar todos los archivos desde cero.
          </p>

        </div>


      </div>


    </section>


  </main>
</template>


<script setup>

import { computed } from "vue";
import { useRouter } from "vue-router";
import { useLibraryStore } from "../stores/libraryStore.js";


const router = useRouter();
const library = useLibraryStore();



const songsWithoutMetadata = computed(() =>
  library.songs.filter(song => !song.hasMetadata).length
);



async function removeLibrary() {

  const confirmDelete = confirm(
    "¿Quieres eliminar la carpeta de música seleccionada?\n\nTus archivos originales no serán borrados."
  );


  if (!confirmDelete) return;


  await library.removeFolder();

}



async function rebuild() {

  const confirmRebuild = confirm(
    "Se reconstruirá la biblioteca desde cero.\n\nLas playlists y configuraciones no se eliminarán.\n\n¿Continuar?"
  );


  if (!confirmRebuild) return;


  await library.rebuildLibrary();

}

</script>