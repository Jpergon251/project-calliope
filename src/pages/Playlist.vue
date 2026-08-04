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

    <div v-if="showEditModal" class="playlist-edit-modal">
      <form class="modal-card" @submit.prevent="savePlaylist">
        <h2>Edit playlist</h2>

        <label for="playlist-name">Playlist name</label>
        <input
          id="playlist-name"
          v-model="editedName"
          required
          maxlength="100"
        />

        <label for="playlist-cover-url">Cover URL <span>(Optional)</span></label>
        <input
          id="playlist-cover-url"
          v-model="editedCover"
          type="url"
          placeholder="https://example.com/cover.jpg"
        />

        <div class="modal-actions">
          <button type="button" class="cancel" @click="showEditModal = false">Cancel</button>
          <button type="submit" class="save">Save changes</button>
        </div>
      </form>
    </div>

  </div>
</template>

<script setup>
import { computed, ref }
from "vue";

import { useRoute, useRouter } from "vue-router";

import PlayListSongs
from "../components//library/PlayListSongs.vue";

import {
 useLibraryStore
}
from "../stores/libraryStore.js";

const route = useRoute();
const router = useRouter();
const library = useLibraryStore();

const showEditModal = ref(false);
const editedName = ref("");
const editedCover = ref("");

const playlist =
computed(() =>
  library.playlists.find(
    p =>
      p.id ===
      route.params.playlistId
  )
);

const playlistSongs = computed(() => {
  if (!playlist.value) return [];

  if (playlist.value.id === "all") {
    return library.songs;
  }

  const orderedIds = playlist.value.id === library.FAVORITES_PLAYLIST_ID
    ? (playlist.value.songIds || []).length
      ? playlist.value.songIds || []
      : library.songs.filter((song) => song.favorite).map((song) => song.id)
    : playlist.value.songIds || [];

  const songsById = new Map(library.songs.map((song) => [song.id, song]));

  return orderedIds
    .map((id) => songsById.get(id))
    .filter(Boolean);
});

function openEditModal() {
  if (!playlist.value) return;

  editedName.value = playlist.value.name;
  editedCover.value = playlist.value.cover || "";
  showEditModal.value = true;
}

async function savePlaylist() {
  if (!playlist.value || !editedName.value.trim()) return;

  await library.updatePlaylist(playlist.value.id, {
    name: editedName.value,
    cover: editedCover.value
  });

  showEditModal.value = false;
}

async function deleteCurrentPlaylist() {
  if (!playlist.value) return;

  await library.deletePlaylist(playlist.value.id);

  if (route.params.playlistId) {
    router.push("/library");
  }
}
</script>
