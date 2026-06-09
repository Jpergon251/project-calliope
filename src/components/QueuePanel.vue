<template>
  <div class="queue-overlay" @click.self="$emit('close')">
    <div class="queue-drawer">
      
      <header class="queue-header">
        <h3>Queue</h3>
        <button @click="$emit('close')">✕</button>
      </header>

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
            {{ index + 1 }}. {{ song.name }}
          </li>
        </ul>
      </section>

    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useLibraryStore } from "../stores/libraryStore";

const library = useLibraryStore();

const queue = computed(() => library.playQueue || []);
</script>