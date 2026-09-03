<template>
  <div class="playlist-page">
    <h1 class="playlist-title">
      {{ playlist?.name }}
    </h1>

    <PlayListSongs
      :songs="playlistSongs || []"
      :playlist="playlist"
      :cover="playlist?.cover"
      :is-sortable="isSortablePlaylist"
      @reorder="handleReorder"
      @edit="openEditModal"
      @delete="deleteCurrentPlaylist"
    />

    <div class="playlist-atmosphere" :class="{ active: library.isPlaying }" aria-label="Visualizador de audio">
      <AudioVisualizer />
    </div>

    <EditPlaylist ref="editPlaylistModal"/>


  </div>
</template>

<script setup>

import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import PlayListSongs from "../components/library/PlayListSongs.vue";
import EditPlaylist from "../components/modals/EditPlaylist.vue";
import AudioVisualizer from "../components/common/AudioVisualizer.vue";

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

const isSortablePlaylist = computed(() => playlist.value && playlist.value.id !== "all");

function handleReorder(songIds) {
  if (playlist.value?.id) {
    library.reorderPlaylistSongs(playlist.value.id, songIds);
  }
}

</script>