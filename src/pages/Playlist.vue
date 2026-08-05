<template>
  <div class="playlist-page">

    <h1 class="playlist-title">
      {{ playlist?.name }}
    </h1>

    <PlayListSongs
      :songs="playlistSongs || []"
      :playlist="playlist"
      :cover="playlist?.cover"
      :is-sortable="true"
      @edit="openEditModal"
      @delete="deleteCurrentPlaylist"
    />

    <EditPlaylist ref="editPlaylistModal"/>
    <!-- <div v-if="showEditModal" class="playlist-edit-modal">
      <form class="modal-card" @submit.prevent="savePlaylist">
        <h2>Edit playlist</h2>

        <label for="playlist-name">Nombre de la playlist</label>
        <input
          id="playlist-name"
          v-model="editedName"
          required
          maxlength="100"
        />

        <label for="playlist-cover-url">URL de la portada <span>(Opcional)</span></label>
        <input
          id="playlist-cover-url"
          v-model="editedCover"
          type="url"
          placeholder="https://example.com/cover.jpg"
        />

        <div class="modal-actions">
          <button type="button" class="cancel" @click="showEditModal = false">Cancel</button>
          <button type="submit" class="save">Guardar cambios</button>
        </div>
      </form>
    </div> -->

  </div>
</template>

<script setup>

import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import PlayListSongs from "../components/library/PlayListSongs.vue";
import EditPlaylist from "../components/modals/EditPlaylist.vue";

import { useLibraryStore } from "../stores/libraryStore.js";


const route = useRoute();
const router = useRouter();

const library = useLibraryStore();


const editPlaylistModal = ref(null);



const playlist = computed(() =>
  library.playlists.find(
    p => p.id === route.params.playlistId
  )
);



const playlistSongs = computed(() => {

  if (!playlist.value) return [];


  if (playlist.value.id === "all") {
    return library.songs;
  }


  const orderedIds =
    playlist.value.id === library.FAVORITES_PLAYLIST_ID
      ? (
          playlist.value.songIds || []
        ).length
          ? playlist.value.songIds
          : library.songs
              .filter(song => song.favorite)
              .map(song => song.id)

      : playlist.value.songIds || [];



  const songsById = new Map(
    library.songs.map(song => [
      song.id,
      song
    ])
  );


  return orderedIds
    .map(id => songsById.get(id))
    .filter(Boolean);

});



function openEditModal() {

  if (!playlist.value) return;


  editPlaylistModal.value.open(
    playlist.value
  );

}



async function deleteCurrentPlaylist() {

  if (!playlist.value) return;


  await library.deletePlaylist(
    playlist.value.id
  );


  router.push("/library");

}

</script>