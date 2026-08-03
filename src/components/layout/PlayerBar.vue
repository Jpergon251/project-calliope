<template>
  <div class="player">
<!-- Progress Bar -->
    <section class="progress">

        <input
            type="range"
            min="0"
            :max="library.duration || 0"
            step="0.1"
            :value="library.currentTime"
            @input="handleSeek($event)"
            class="progress-bar"
        />
    
        <section class="time-info">
            <span class="time">
                {{ formatTime(library.currentTime) }}
            </span>
        
            <span class="time">
                {{ formatTime(library.duration) }}
            </span>
        </section>
    </section>
<!-- Song Info -->

    <section class="song-info">
      <div class="song-card">
        <SongCover class="song-cover" :song="library.playingSong"/>
        <section class="song-title">

          <h3 class="song-name" v-if="library.playingSong">{{ library.playingSong.name }}</h3>
          <p v-else class="song-name advertisment">No song is currently playing.</p>
          <span class="song-artist" v-if="library.playingSong">{{ library.playingSong.artist }}</span>
        </section>
      </div>
      
      <!-- Controls -->
      <section class="controls">
        <button @click="library.playPreviousSong()">
          <SkipBack class="control-icon" fill="white" />
        </button>

        <button @click="library.togglePlay()">
          <Pause v-if="library.isPlaying" class="control-icon" fill="white" />
          <Play v-else class="control-icon" fill="white"/>
        </button>
        
        <button @click="library.playNextSong()">
          <SkipForward class="control-icon" fill="white" />
        </button>

        <button class="queue-button" @click="showQueue = !showQueue">
          <ListMusic class="control-icon" fill="white" />
        </button>
      </section>

    <!-- Volume Control -->
      <VolumeModal :library="library"/>
    </section>
  </div>

  <QueuePanel
    v-if="showQueue"
    class="queue-panel"
    @close="showQueue = false"
  />
</template>

<script setup>
import { Play, Pause, SkipBack, SkipForward, ListMusic } from "lucide-vue-next";
import { useLibraryStore } from "../../stores/libraryStore.js";
import SongCover from "../library/SongCover.vue";
import QueuePanel from "../player/QueuePanel.vue"
const library =
useLibraryStore();
import { ref } from "vue";
import VolumeModal from "../player/VolumeModal.vue";


const showQueue = ref(false);

function handleSeek(event) {
  const nextTime = Number(event.target.value);
  library.currentTime = nextTime;
  library.seek(nextTime);
}

function formatTime(seconds) {

  if (
    !seconds ||
    isNaN(seconds)
  ) {
    return "0:00";
  }

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

