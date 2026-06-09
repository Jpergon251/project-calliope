<template>
    <div class="song-list-container">

        <section class="playlist-cover">
          <!-- <image class="playlist-cover" ></image> -->
          <Music2 class="icon-cover"/>
          <div class="playlist-actions">

            <button class="add" :disabled="playlist.id === 'all'" @click="showAddSongsModal = true">
              <Plus/>
            </button>

            <button class="edit">
              <Pencil/>
            </button>

            <button class="menu">
              <EllipsisVertical/>
            </button>

          </div>
        </section>

        <AddSongsModal
          v-if="showAddSongsModal"
          :playlist="playlist"
          :songs="library.songs"
          @close="showAddSongsModal = false"
        />
        <ul class="song-list">
            <li 
            v-for="(song, index) in songs" :key="index"
            @click="library.playSong(song,songs)"
            class="song-item"
            >
                
                  <div class="song-cover">

                    <img
                      v-if="song.cover"
                      :src="song.cover"
                      :alt="song.name"
                      class="cover-image"
                    />

                    <DiscAlbum
                      v-else
                      class="cover-image"
                    />

                    <div class="song-info">
                      <span class="song-name">{{ song.name }}</span>
                      <span class="song-artist">{{ song.artist }}</span>

                    </div>
                    
                  </div>
                
                <span class="song-duration">{{ formatDuration(song.duration) }}</span>
                
            </li>
        </ul>
    </div>
</template>

<script setup>
import { DiscAlbum,  EllipsisVertical,  Import,  Menu,  Music2, Pencil, Plus } from "lucide-vue-next";
import { useLibraryStore }
from "../stores/libraryStore.js";
import Library from "../pages/Library.vue";
import { computed, ref } from "vue";
import AddSongsModal from "./AddSongsModal.vue";

const library =
useLibraryStore();

const showAddSongsModal =
  ref(false);

const props =
defineProps({
  songs: Array,
  playlist: Object
});
function formatDuration(
  seconds
) {

  const minutes =
    Math.floor(
      seconds / 60
    );

  const remainingSeconds =
    Math.floor(
      seconds % 60
    );

  return `${minutes}:${
    remainingSeconds
      .toString()
      .padStart(2, "0")
  }`;
}




</script>
