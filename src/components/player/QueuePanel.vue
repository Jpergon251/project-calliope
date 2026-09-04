<template>
  <QueueOverlay @close="$emit('close')" />
</template>

<script setup>
import QueueOverlay from "./QueueOverlay.vue";

defineEmits(["close"]);
</script>

