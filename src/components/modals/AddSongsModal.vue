<template>
  <div
    class="modal-backdrop"
    @click.self="$emit('close')"
  >

    <div class="modal-card">

      <h2 class="modal-title">
        <p>Agregar canciones a <span class="playlist-name">{{ playlist.name }}</span></p>
        <button @click="$emit('close')" class="close-button"><CircleX class="icon"/></button>
      </h2>

      <input
        v-model="search"
        placeholder="Busca canciones o artistas..."
        class="search-input"
      />

      <ul class="song-picker-list">

        <li
          v-for="song in filteredSongs"
          :key="song.id"
          class="picker-song"
        >

          <div class="song-cover">
            <img v-if="song.cover" :src="song.cover" class="cover-image"></img>
            <DiscAlbum v-else class="cover-image"/>
          </div>
          <div class="song-meta">
            <span>
              {{ song.title || song.name }}
            </span>

            <small>
              {{ song.artist }}
            </small>
          </div>

          <button
            v-if="!library.isSongInPlaylist(
              playlist.id,
              song.id
            )"
            @click="addSong(song.id)"
            class="action-button"
          >
            <Plus/>
          </button>

          <button
            v-else
            class="action-button remove"
            @click="removeSong(song.id)"
          >
            <Check />
          </button>

        </li>

      </ul>

    </div>
  </div>
</template>

<script setup>
import { computed, ref }
from "vue";

import {
  Plus,
  Check,
  DiscAlbum,
  CircleX
} from "lucide-vue-next";

import {
  useLibraryStore
}
from "../../stores/libraryStore";

const library =
useLibraryStore();

const props =
defineProps({
  playlist: Object,
  songs: Array
});

defineEmits([
  "close"
]);

const search =
ref("");

const filteredSongs =
computed(() => {

  return props.songs.filter(
    song => {

      const query =
        search.value
          .toLowerCase();

      return (
        (song.title || song.name)
          .toLowerCase()
          .includes(query)

        ||

        song.artist
          .toLowerCase()
          .includes(query)
      );
    }
  );
});

async function addSong(songId) {
  await library.addSongToPlaylist(props.playlist.id, songId);
}

async function removeSong(songId) {
  await library.removeSongFromPlaylist(props.playlist.id, songId);
}
</script>
