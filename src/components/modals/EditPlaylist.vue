<template>
  <div v-if="showModal" class="playlist-edit-modal">

    <form 
      class="modal-card" 
      @submit.prevent="save"
    >

      <h2>Editar playlist</h2>


      <label>
        Nombre de la playlist
      </label>

      <input
        v-model="editedName"
        required
        maxlength="100"
      />


      <label>
        URL de la portada 
        <span>(Opcional)</span>
      </label>

      <input
        v-model="editedCover"
        type="url"
        placeholder="https://example.com/cover.jpg"
      />


      <div class="modal-actions">

        <button
          type="button"
          class="cancel"
          @click="close"
        >
          Cancelar
        </button>


        <button
          type="submit"
          class="save"
        >
          Guardar cambios
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

const playlist = ref(null);

const editedName = ref("");
const editedCover = ref("");



function open(targetPlaylist){

  playlist.value = targetPlaylist;

  editedName.value = targetPlaylist.name;
  editedCover.value = targetPlaylist.cover || "";

  showModal.value = true;

}


function close(){

  showModal.value = false;

}



async function save(){

  if(!playlist.value) return;


  await library.updatePlaylist(
    playlist.value.id,
    {
      name: editedName.value,
      cover: editedCover.value
    }
  );


  close();

}



defineExpose({
  open
});


</script>