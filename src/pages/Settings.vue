<template>
  <div class="settings-page">
    <h1>Settings</h1>

    <section class="music-library">

      <h2>Music Library</h2>

      <p>
        Songs loaded: {{ library.songs.length }}
      </p>

      <div class="settings-actions">

        <button
          @click="library.selectFolder()"
          class="settings-button"
        >
          Change Folder
        </button>

        <button
          @click="removeLibrary"
          :disabled="!library.folderHandle"
          class="settings-button"
        >
          Remove Folder
        </button>
      </div>
    </section>

  </div>
</template>

<script setup>
import { useLibraryStore } from "../stores/libraryStore.js";

const library = useLibraryStore();

async function removeLibrary() {

  const confirmDelete =
    confirm(
      "Remove current music folder?"
    );

  if (
    !confirmDelete
  ) return;

  await library
    .removeFolder();
}
</script>