<template>
  <section class="volume">
    <button
      class="volume-button"
      @click="showVolume = !showVolume"
    >
      <Volume
        v-if="library.volume <= 0.2 && library.volume > 0"
        class="icon"
        fill="currentColor"

        />

      <Volume1
        v-else-if="library.volume <= 0.8 && library.volume > 0.2"
        class="icon"
        fill="currentColor"

      />

      <Volume2
        v-else-if="library.volume > 0.8"
        class="icon"
        fill="currentColor"

      />

      <VolumeOff
        v-else
        class="icon"
        fill="currentColor"
      />
    </button>

    <div
      v-if="showVolume"
      class="volume-slider-container"
    >
      <input
        v-model="library.volume"
        type="range"
        min="0"
        max="1"
        step="0.01"
        class="volume-slider"
      />
    </div>
  </section>
</template>

<script setup>
import { ref } from "vue";

import {
  Volume,
  Volume1,
  Volume2,
  VolumeOff
} from "lucide-vue-next";

const showVolume = ref(false);

defineProps({
  library: {
    type: Object,
    required: true
  }
});
</script>