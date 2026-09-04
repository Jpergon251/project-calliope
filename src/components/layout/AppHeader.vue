<template>
  <header class="app-header">
    <div class="header-copy">
      <BackButton v-if="showBack" />

      <div>
        <span class="header-eyebrow">
          CALLIOPE / {{ routeLabel }}
        </span>
        <h1>{{ pageTitle }}</h1>
      </div>
    </div>

    <div class="header-actions">
      <RouterLink
        to="/profile"
        class="header-action profile-action"
        :class="{ 'is-guest': user.isGuest }"
        :aria-label="user.isGuest ? 'Perfil (Invitado)' : 'Tu perfil'"
        :title="user.isGuest ? 'Perfil (Invitado temporal)' : 'Tu perfil'"
      >
        <img
          v-if="user.avatarUrl"
          :src="user.avatarUrl"
          alt="Tu avatar"
          class="profile-action-avatar"
        />

        <span v-else>
          {{ user.initials }}
        </span>
      </RouterLink>
    </div>
  </header>
</template>

<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useUserStore } from "../../stores/userStore.js";
import BackButton from "../common/BackButton.vue";

const route = useRoute();
const user = useUserStore();

const labels = {
  Home: ["Inicio", "Descubre"],
  Library: ["Biblioteca", "Tu colección"],
  Songs: ["Canciones", "Tu colección"],
  Albums: ["Álbumes", "Tu colección"],
  Artists: ["Artistas", "Tu colección"],
  artist: ["Artista", "Detalle"],
  History: ["Historial", "Recientes"],
  Playlists: ["Playlists", "Colección"],
  Favorites: ["Favoritos", "Colección"],
  Metadata: ["Metadatos", "Herramientas"],
  Settings: ["Ajustes", "Sistema"],
  Profile: ["Perfil", "Tu espacio"],
  About: ["Acerca de", "Calliope"],
  HowToUse: ["Cómo usar", "Guía"],
  Support: ["Ayúdame", "Calliope"],
};

const pageTitle = computed(
  () => labels[route.name]?.[0] || "Calliope",
);

const routeLabel = computed(
  () => labels[route.name]?.[1] || "Ahora",
);

const ROOT_ROUTES = new Set([
  "Home",
  "Library",
  "Songs",
  "Albums",
  "Artists",
  "Playlists",
  "Settings",
  "Profile",
]);

const showBack = computed(
  () => !ROOT_ROUTES.has(route.name),
);
</script>