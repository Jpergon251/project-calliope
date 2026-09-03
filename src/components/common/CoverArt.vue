<template>
  <div class="cover-art" :class="[`cover-kind-${kind}`, { 'cover-loaded': isLoaded && src }]">
    <transition name="cover-fade">
      <img
        v-if="src && !failed"
        :src="src"
        :alt="alt"
        loading="lazy"
        decoding="async"
        @load="isLoaded = true"
        @error="onError"
      />
    </transition>

    <div v-if="!src || failed" class="cover-fallback" aria-hidden="true">
      <component :is="fallbackIcon" :size="iconSize" :stroke-width="1.5" />
      <span v-if="label" class="cover-fallback-label">{{ label }}</span>
    </div>

    <div v-if="src && !failed && !isLoaded" class="cover-skeleton" aria-hidden="true"></div>
  </div>
</template>

<script setup>
import { computed, ref, watch, h } from 'vue'
import { Music2, DiscAlbum, ListMusic, User, Heart } from 'lucide-vue-next'
import { toDisplayUrl } from '../../lib/covers.js'

const props = defineProps({
  /** Portada en cualquier formato: Blob, URL válida o string blob: muerto */
  cover: { type: [String, Object], default: null },
  alt: { type: String, default: '' },
  /** song | album | playlist | artist | favorite */
  kind: { type: String, default: 'song' },
  /** Texto opcional bajo el icono del fallback (p.ej. iniciales) */
  label: { type: String, default: '' }
})

const ICONS = { song: Music2, album: DiscAlbum, playlist: ListMusic, artist: User, favorite: Heart }

const iconSize = computed(() => (props.kind === 'playlist' || props.kind === 'album' ? 30 : 24))
const fallbackIcon = computed(() => h(ICONS[props.kind] || Music2))

const isLoaded = ref(false)
const failed = ref(false)
const src = computed(() => toDisplayUrl(props.cover))

watch(src, () => {
  isLoaded.value = false
  failed.value = false
})

function onError() {
  failed.value = true
}
</script>
