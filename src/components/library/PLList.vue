<template>
    <section class="all-playlist">
        <div class="playlist-title">
            <h2>Playlists</h2>
            <button type="button" @click="openModal" class="create-playlist-button">
                <PlusCircleIcon />
                Create playlist
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

        <div v-if="showCreatePlaylist" class="modal-backdrop">
            <form class="modal-card" @submit.prevent="createPlaylist">

                <h3 class="modal-title">Crear playlist</h3>

                <div class="input-fields">
                    <label for="playlist-name">Nombre de la playlist</label>

                    <input
                    id="playlist-name"
                    v-model="newPlaylistName"
                    placeholder="Nombre de la playlist"
                    required
                    maxlength="100"
                    />

                    <label for="playlist-cover">URL de la portada <span>(Opcional)</span></label>

                    <input
                    id="playlist-cover"
                    v-model="newPlaylistCover"
                    type="url"
                    placeholder="https://example.com/cover.jpg"
                    />

                </div>
                

                <div class="actions">
                    <button type="button" @click="showCreatePlaylist = false" class="cancel-button">
                        Cancelar
                    </button>
                    <button type="submit" class="check-button">
                        Crear playlist
                    </button>

                    
                </div>

            </form>
        </div>
    </section>
</template>

<script setup>
import PlaylistItem from "./PlaylistItem.vue";
import { PlusCircleIcon } from "lucide-vue-next";
import { useLibraryStore } from "../../stores/libraryStore.js";
import { computed, ref } from "vue";


const library = useLibraryStore();

const showCreatePlaylist = ref(false);

const newPlaylistName = ref("");
const newPlaylistCover = ref("");

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
