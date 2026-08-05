<template>
    <section class="all-playlist">
        <div class="playlist-title">
            <h2>Playlists</h2>
            <button type="button" @click="createPlaylistModal.openModal" class="create-playlist-button">
                <PlusCircleIcon />
                Crear playlist
            </button>
        </div>
        <ul class="playlist-list">
            <li 
            v-for="playlist in playlistList"
            :key="playlist.id"
            class="playlist-card"
            >
                 <PlaylistItem
                    :playlist="playlist"
                />
            </li>
        </ul>


        <CreatePlaylist ref="createPlaylistModal"/>        

    </section>
</template>

<script setup>
import PlaylistItem from "./PlaylistItem.vue";
import { PlusCircleIcon } from "lucide-vue-next";
import { useLibraryStore } from "../../stores/libraryStore.js";
import { computed, ref } from "vue";
import CreatePlaylist from "../modals/CreatePlaylist.vue";

const createPlaylistModal = ref(null);
const library = useLibraryStore();

const playlistList = computed(() => {
  const favorites = library.playlists.find((item) => item.id === library.FAVORITES_PLAYLIST_ID);
  const others = library.playlists.filter((item) => item.id !== library.FAVORITES_PLAYLIST_ID);

  return favorites ? [favorites, ...others] : others;
});

function openModal() {
  newPlaylistName.value = "";
  newPlaylistCover.value = "";
  showCreatePlaylist.value = true;
}

function createPlaylist() {
  if (!newPlaylistName.value.trim()) return;

  library.createPlaylist({
    name: newPlaylistName.value,
    cover: newPlaylistCover.value || null,
  });

  newPlaylistName.value = "";
  newPlaylistCover.value = "";
  showCreatePlaylist.value = false;
}
</script>
