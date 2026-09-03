<template>
  <section class="no-folder-state" aria-label="Sin carpeta de música">
    <div class="no-folder-card">
      <div class="no-folder-icon-wrap" aria-hidden="true">
        <FolderPlus :size="32" class="no-folder-icon" />
      </div>

      <h2 class="no-folder-title">No has seleccionado una carpeta de música</h2>

      <p class="no-folder-desc">
        Selecciona una carpeta para que Calliope pueda cargar tus canciones.
      </p>

      <button
        type="button"
        class="no-folder-btn"
        :disabled="selecting"
        @click="chooseFolder"
      >
        <LoaderCircle v-if="selecting" :size="18" class="welcome-spinner" />
        <FolderOpen v-else :size="18" />
        <span>{{ selecting ? "Cargando carpeta..." : "Elegir carpeta" }}</span>
      </button>
    </div>
  </section>
</template>

<script setup>
import { ref } from "vue";
import { FolderOpen, FolderPlus, LoaderCircle } from "lucide-vue-next";
import { useLibraryStore } from "../../stores/libraryStore.js";

const library = useLibraryStore();
const selecting = ref(false);

async function chooseFolder() {
  if (selecting.value) return;
  selecting.value = true;
  try {
    await library.selectFolder();
  } catch (err) {
    console.warn("[NoFolderState] Error al elegir carpeta:", err);
  } finally {
    selecting.value = false;
  }
}
</script>
