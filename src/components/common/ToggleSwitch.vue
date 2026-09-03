<template>
  <button
    type="button"
    class="toggle-switch"
    role="switch"
    :aria-checked="modelValue"
    :class="{ on: modelValue }"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span class="toggle-thumb"></span>
  </button>
</template>

<script setup>
defineProps({
  modelValue: { type: Boolean, default: false }
})
defineEmits(['update:modelValue'])
</script>
