<template>
    <div class="song-list-container">

        <section class="playlist-cover">
          <!-- <image class="playlist-cover" ></image> -->
          <Music2 class="icon-cover"/>
          <div class="playlist-actions">

            <button class="add" :disabled="playlist.id === 'all'">
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
        <ul class="song-list">
            <li 
            v-for="(song, index) in songs" :key="index"
            @click="library.playSong(song)"
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

                    <span class="song-name">{{ song.name }}</span>
                  </div>
                
                <span class="song-duration">{{ formatDuration(song.duration) }}</span>
                
            </li>
        </ul>
    </div>
</template>

<script setup>
import { DiscAlbum,  EllipsisVertical,  Menu,  Music2, Pencil, Plus } from "lucide-vue-next";
import { useLibraryStore }
from "../stores/libraryStore.js";
import Library from "../pages/Library.vue";

const library =
useLibraryStore();

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
