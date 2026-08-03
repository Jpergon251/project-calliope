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

    <section class="library-health">

      <h2>Library Health</h2>

      <p>
        Songs without metadata:
        <strong>{{ songsWithoutMetadata }}</strong>
      </p>

      <p class="health-description">
        Metadata helps organize your library, group albums, improve search and display the correct song information.
      </p>

      <button
        class="settings-button"
        disabled
      >
        Fix Metadata (Coming Soon)
      </button>

      <button
        @click="library.rescanLibrary()"
        :disabled="!library.folderHandle"
        class="settings-button"
      >
        Rescan Library
      </button>

      <button
        @click="rebuild"
        :disabled="!library.folderHandle"
        class="settings-button"
      >
        Rebuild Library
</button>
    </section>

  </div>
</template>

<script setup>
import { useLibraryStore } from "../stores/libraryStore.js";

import { computed } from "vue";

const songsWithoutMetadata = computed(() =>
  library.songs.filter(song => !song.hasMetadata).length
);

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

  router.push({ name: "home" });
}

async function rebuild() {

  const confirmRebuild = confirm(
    "This will rebuild your music library from scratch. Playlists and settings will not be affected.\n\nContinue?"
  );

  if (!confirmRebuild) return;

  await library.rebuildLibrary();
}
</script>