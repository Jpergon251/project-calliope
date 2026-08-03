<template>
  <div class="queue-overlay" @click.self="$emit('close')">
    <div class="queue-drawer">
      
      <header class="queue-header">
        <h3>Queue</h3>
        <button @click="$emit('close')">✕</button>
      </header>


      <section
        v-if="previousSong"
        class="previous-song"
      >
        <h4>Previous Song</h4>

        <div>
          {{ previousSong.name }}
        </div>
      </section>
      
      <section class="now-playing">
        <h4>Now playing</h4>
        <div v-if="library.playingSong">
          {{ library.playingSong.name }}
        </div>
      </section>

      <section class="queue-list">
        <h4>Next up</h4>

        <ul>
          <li
            v-for="(song, index) in queue"
            :key="song.id"
            :class="{ active: song.id === library.playingSong?.id }"
          >
            <div class="song-info">
              <span class="song-index">{{ index + 1 }}. </span>
              <span class="song-name">{{ song.name }}</span>
            </div>
            <div class="song-controls">
              <button class="order-button"
              @click="moveDown(index)"
              v-if="!(index === queue.length - 1)"
              
              >
                <ArrowBigDown class="icon" fill="currentColor"/>
              </button>
              <button class="order-button"
              v-if="!(index === 0)"
              @click="moveUp(index)"
              >
                <ArrowBigUp class="icon" fill="currentColor" />
              </button>
            </div>
          </li>
        </ul>
      </section>

    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useLibraryStore } from "../../stores/libraryStore";
import { ArrowBigDown, ArrowBigUp } from "lucide-vue-next";

const library = useLibraryStore();

const queue = computed(() => library.playQueue || []);

const playSong = (song) => {
  library.playSong(song);
};

const previousSong = computed(() => {
  const history = library.historyQueue;

  return history.length
    ? history[history.length - 1]
    : null;
});

const moveUp = (index) => {
  if (index === 0) return;

  const queueCopy = [...library.playQueue];

  [queueCopy[index - 1], queueCopy[index]] = [
    queueCopy[index],
    queueCopy[index - 1]
  ];

  library.playQueue = queueCopy;
};

const moveDown = (index) => {
  if (index === queue.value.length - 1) return;

  const queueCopy = [...library.playQueue];

  [queueCopy[index], queueCopy[index + 1]] = [
    queueCopy[index + 1],
    queueCopy[index]
  ];

  library.playQueue = queueCopy;
};
</script>