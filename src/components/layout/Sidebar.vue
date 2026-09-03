<template>
  <nav class="navbar" aria-label="Navegación principal">
    <Logo />

    <div class="pages-list">
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

        <router-link to="/profile" class="page-link">
          <UserRound class="page-icon" />
          <span class="page-name">Perfil</span>
        </router-link>
      </section>

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
import {
  CircleHelp,
  Heart,
  House,
  Info,
  LibraryIcon,
  UserRound,
} from "lucide-vue-next";
import { useLibraryStore } from "../../stores/libraryStore.js";
import Logo from "../common/Logo.vue";

const library = useLibraryStore();
</script>