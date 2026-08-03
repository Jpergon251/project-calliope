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
            v-for="playlist in library.playlists"
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

                <h3 class="modal-title">Create playlist</h3>

                <div class="input-fields">
                    <label for="playlist-name">Playlist name</label>

                    <input
                    id="playlist-name"
                    v-model="newPlaylistName"
                    placeholder="Playlist name"
                    required
                    maxlength="100"
                    />

                    <label for="playlist-cover">Cover URL <span>(Optional)</span></label>

                    <input
                    id="playlist-cover"
                    v-model="newPlaylistCover"
                    type="url"
                    placeholder="https://example.com/cover.jpg"
                    />

                </div>
                

                <div class="actions">
                    <button type="button" @click="showCreatePlaylist = false" class="cancel-button">
                        Cancel
                    </button>
                    <button type="submit" class="check-button">
                        Create playlist
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
import { ref } from "vue";


const library = useLibraryStore();

const showCreatePlaylist = ref(false);

const newPlaylistName = ref("");
const newPlaylistCover = ref("");

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
