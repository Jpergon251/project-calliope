<template>
  <button v-if="visible" class="back-button" type="button" aria-label="Volver atrás" @click="goBack">
    <ArrowLeft :size="18" stroke-width="2.4" />
  </button>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()

// Rutas raíz donde el botón NO debe aparecer
const ROOT_ROUTES = new Set(['Home', 'Library', 'Songs', 'Albums', 'Artists', 'Playlists', 'Settings', 'Profile'])

const isMobile = ref(false)
function check() {
  isMobile.value = typeof window !== 'undefined' && window.innerWidth <= 760
}
onMounted(() => {
  check()
  window.addEventListener('resize', check)
})
onBeforeUnmount(() => window.removeEventListener('resize', check))

const visible = computed(() => isMobile.value && !ROOT_ROUTES.has(route.name))

/** Ruta de respaldo lógica por si no hay historial útil. */
const FALLBACK = {
  album: { name: 'Albums' },
  artist: { name: 'Artists' },
  song: { name: 'Songs' },
  playlist: { name: 'Playlists' },
  Favorites: { name: 'Playlists' }
}

function goBack() {
  // router.back() solo si hay una entrada anterior real dentro de la app;
  // vue-router expone el estado de historial a través de window.history.
  const fallback = FALLBACK[route.name] || { name: 'Home' }
  if (window.history.state && window.history.state.back != null) {
    router.back()
  } else {
    router.push(fallback)
  }
}
</script>
