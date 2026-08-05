<template>

  <div v-if="showModal" class="modal-backdrop">

    <form class="modal-card" @submit.prevent="createPlaylist">

      <h3 class="modal-title">
        Crear playlist
      </h3>


      <div class="input-fields">

        <label for="playlist-name">
          Nombre de la playlist
        </label>

        <input
          id="playlist-name"
          v-model="newPlaylistName"
          placeholder="Nombre de la playlist"
          required
          maxlength="100"
        />


        <label for="playlist-cover">
          URL de la portada <span>(Opcional)</span>
        </label>

        <input
          id="playlist-cover"
          v-model="newPlaylistCover"
          type="url"
          placeholder="https://example.com/cover.jpg"
        />

      </div>


      <div class="actions">

        <button
          type="button"
          @click="closeModal"
          class="cancel-button"
        >
          Cancelar
        </button>


        <button
          type="submit"
          class="check-button"
        >
          Crear playlist
        </button>

      </div>

    </form>

  </div>

</template>


<script setup>

import { ref } from "vue";
import { useLibraryStore } from "../../stores/libraryStore.js";


const library = useLibraryStore();


const showModal = ref(false);

const newPlaylistName = ref("");
const newPlaylistCover = ref("");



function openModal(){

  newPlaylistName.value = "";
  newPlaylistCover.value = "";

  showModal.value = true;

}



function closeModal(){

  showModal.value = false;

}



function createPlaylist(){

  if(!newPlaylistName.value.trim()) return;


  library.createPlaylist({
    name: newPlaylistName.value,
    cover: newPlaylistCover.value || null
  });


  closeModal();

}



// IMPORTANTE
defineExpose({
  openModal
});


</script>