<template>
  <nav class="navbar" aria-label="Navegación principal">
    <Logo />

    <div class="pages-list">
      <!-- 1. Tu música -->
      <section class="nav-section primary-nav">
        <h2 class="nav-section-title">Tu música</h2>

        <router-link to="/" class="page-link mobile-nav-visible">
          <House class="page-icon" />
          <span class="page-name">Inicio</span>
        </router-link>

        <router-link to="/library" class="page-link mobile-nav-visible">
          <LibraryIcon class="page-icon" />
          <span class="page-name">Biblioteca</span>
        </router-link>

        <!-- Acceso directo a Historial en barra inferior móvil -->
        <router-link to="/history" class="page-link mobile-nav-visible mobile-only-link">
          <History class="page-icon" />
          <span class="page-name">Historial</span>
        </router-link>

        <router-link to="/profile" class="page-link mobile-nav-visible">
          <UserRound class="page-icon" />
          <span class="page-name">Perfil</span>
        </router-link>
      </section>

      <!-- 2. Más información -->
      <section class="nav-section secondary-nav">
        <h2 class="nav-section-title">Más información</h2>

        <router-link to="/how-to-use" class="page-link">
          <CircleHelp class="page-icon" />
          <span class="page-name">Cómo usar</span>
        </router-link>

        <router-link to="/about" class="page-link">
          <Info class="page-icon" />
          <span class="page-name">Acerca de</span>
        </router-link>
      </section>

      <!-- 3. Historial (Debajo de Más información, el último de la lista) -->
      <section class="nav-section history-nav">
        <h2 class="nav-section-title">
          <router-link to="/history" class="section-title-link" title="Ir al Historial completo">
            <History :size="13" />
            <span>Historial</span>
            <span class="history-count-badge" v-if="recentHistory.length">{{ recentHistory.length }}</span>
          </router-link>
        </h2>

        <!-- Scroll de los últimos 10-15 elementos del historial para volver rápido -->
        <div v-if="recentHistory.length" class="sidebar-history-scroll" role="list" aria-label="Historial reciente">
          <button
            v-for="item in recentHistory"
            :key="item.id"
            type="button"
            class="sidebar-history-item"
            :class="`type-${item.type}`"
            :title="`Reproducir: ${item.title}`"
            @click="playHistoryItem(item)"
          >
            <div class="item-thumb-box">
              <CoverArt
                :cover="historyItemCover(item)"
                :kind="item.type === 'song' ? 'song' : item.type === 'album' ? 'album' : 'playlist'"
                :alt="item.title"
                class="thumb-img"
              />
              <div class="thumb-hover-play">
                <Play :size="11" fill="currentColor" />
              </div>
            </div>
            <div class="item-info">
              <span class="item-title" :title="item.title">{{ item.title }}</span>
              <span class="item-sub" :title="item.subtitle">{{ item.subtitle || getTypeName(item.type) }}</span>
            </div>
          </button>
        </div>
        <p v-else class="sidebar-history-empty">Sin reproducciones aún</p>
      </section>
    </div>

    <button
      v-if="library.initialized && !library.folderHandle"
      @click="library.selectFolder()"
      class="folder-button"
    >
      Seleccionar carpeta
    </button>

    <span
      v-if="library.initialized && !library.folderHandle"
      class="advertisment"
    >
      Selecciona una carpeta para ver tu música.
    </span>

    <router-link to="/support" class="page-link support-link">
      <Heart class="page-icon" />
      <span class="page-name">Ayúdame</span>
    </router-link>
  </nav>
</template>

<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import {
  CircleHelp,
  Heart,
  History,
  House,
  Info,
  LibraryIcon,
  Play,
  UserRound,
} from "lucide-vue-next";
import { useLibraryStore } from "../../stores/libraryStore.js";
import { resolveHistoryCover } from "../../lib/covers.js";
import CoverArt from "../common/CoverArt.vue";
import Logo from "../common/Logo.vue";

const library = useLibraryStore();
const router = useRouter();

const recentHistory = computed(() => {
  return (library.listeningHistory || []).slice(0, 15);
});

function historyItemCover(item) {
  return resolveHistoryCover(library, item);
}

function getTypeName(type) {
  switch (type) {
    case "album":
      return "Álbum";
    case "playlist":
      return "Playlist";
    default:
      return "Canción";
  }
}

function playHistoryItem(item) {
  if (!item) return;
  if (item.type === "song") {
    const song = library.songs.find((s) => s.id === item.itemId);
    if (song) {
      library.playSong(song);
      if (typeof window !== "undefined" && window.innerWidth <= 760) {
        library.openNowPlaying();
      }
    }
  } else if (item.type === "album") {
    router.push({ name: "album", params: { id: item.itemId } });
  } else if (item.type === "playlist") {
    router.push({ name: "playlist", params: { playlistId: item.itemId } });
  }
}
</script>