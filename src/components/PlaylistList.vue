<template>
    <section class="all-playlist">
        <h2 class="playlist-title">Playlists <button @click="openModal" class="create-playlist-button"><PlusCircleIcon/></button></h2>
        <ul class="playlist-list">
            <li 
            v-for="playlist in library.playlists"
            :key="playlist.name"
            class="playlist-card"
            >
                <router-link :to="`/playlist/${playlist.id}`" class="playlist-link">
                    <img :src="playlist.cover" alt="Playlist Cover" class="playlist-cover" v-if="playlist.cover" />
                    <Music class="playlist-cover" v-else  />
                    <span class="playlist-name">
                        {{ playlist.name }}
                    </span>
                </router-link>
            </li>
        </ul>

        <div v-if="showCreatePlaylist" class="modal-backdrop">
            <div class="modal-card">

                <h3 class="modal-title">Create a playlist</h3>

                <section class="input-fields">
                    <label for="name">Playlist name</label>

                    <input
                    v-model="newPlaylistName"
                    placeholder="Playlist name"
                    />

                    <label for="cover">Cover <span>(URL has priority)</span></label>

                    <input
                    v-model="newPlaylistCover"
                    placeholder="image URL(Optional)"
                    />
                    <span class="divisor">OR</span>
                    <input
                    type="file"
                    accept="image/*"
                    @change="handleFile"
                    />

                </section>
                

                <div class="actions">
                    <button @click="showCreatePlaylist = false" class="cancel-button">
                        <CircleX/>
                    </button>
                    <button @click="createPlaylist" class="check-button">
                        <CircleCheck/>
                    </button>

                    
                </div>

            </div>
        </div>
    </section>
</template>

<script setup>
import { CircleCheck, CircleX, Music, PlusCircle, PlusCircleIcon } from "lucide-vue-next";
import { useLibraryStore } from "../stores/libraryStore.js";
import { ref } from "vue";


const library = useLibraryStore();

const showCreatePlaylist = ref(false);

const newPlaylistName = ref("");
const newPlaylistCover = ref("");
const coverFile = ref(null);

function openModal() {
  newPlaylistName.value = "";
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
  coverFile.value = null;
  showCreatePlaylist.value = false;
}
function handleFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  coverFile.value = file;

  const reader = new FileReader();
  reader.onload = () => {
    newPlaylistCover.value = reader.result; // base64
  };
  reader.readAsDataURL(file);
}
</script>