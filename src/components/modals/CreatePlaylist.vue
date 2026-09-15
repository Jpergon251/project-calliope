<template>
  <div
    v-if="showModal"
    class="modal-backdrop create-playlist-backdrop"
    role="dialog"
    aria-modal="true"
    aria-labelledby="create-playlist-title"
    @click.self="closeModal"
    @keydown.esc="closeModal"
  >
    <div class="modal-card create-playlist-card">
      <!-- Encabezado del modal -->
      <header class="modal-header">
        <div class="header-titles">
          <div class="title-badge" aria-hidden="true">
            <ListPlus :size="20" />
          </div>
          <div>
            <h2 id="create-playlist-title" class="title">Crear playlist</h2>
            <p class="subtitle">Organiza tus canciones en una lista personalizada</p>
          </div>
        </div>

        <button
          type="button"
          class="close-button"
          aria-label="Cerrar modal"
          @click="closeModal"
        >
          <X :size="18" />
        </button>
      </header>

      <!-- Formulario de creación -->
      <form class="create-playlist-form" @submit.prevent="createPlaylist">
        <div class="form-body">
          <div class="form-group">
            <label for="playlist-name" class="form-label">
              <span>Nombre de la playlist</span>
              <span class="required-indicator" aria-hidden="true">*</span>
            </label>
            <div class="input-wrapper">
              <input
                id="playlist-name"
                ref="nameInputRef"
                v-model="newPlaylistName"
                type="text"
                placeholder="Mi lista favorita..."
                required
                maxlength="100"
                class="form-input"
                autocomplete="off"
              />
            </div>
          </div>

          <div class="form-group">
            <label for="playlist-cover" class="form-label">
              <span>URL de la portada</span>
              <span class="optional-label">(Opcional)</span>
            </label>
            <div class="input-wrapper">
              <input
                id="playlist-cover"
                v-model="newPlaylistCover"
                type="url"
                placeholder="https://ejemplo.com/portada.jpg"
                class="form-input"
                autocomplete="off"
              />
            </div>

            <!-- Previsualización opcional de la portada -->
            <div v-if="newPlaylistCover && newPlaylistCover.trim()" class="cover-preview-wrapper">
              <span class="preview-label">Vista previa:</span>
              <div class="cover-preview">
                <img
                  :src="newPlaylistCover"
                  alt="Vista previa de portada"
                  @error="coverLoadError = true"
                  @load="coverLoadError = false"
                  v-show="!coverLoadError"
                />
                <div v-if="coverLoadError" class="preview-fallback">
                  <ImageOff :size="18" />
                  <span>No disponible</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Acciones del pie -->
        <footer class="modal-footer">
          <button
            type="button"
            class="btn-cancel cancel-button"
            @click="closeModal"
          >
            Cancelar
          </button>

          <button
            type="submit"
            class="btn-confirm check-button"
            :disabled="!newPlaylistName.trim()"
          >
            <Plus :size="16" />
            <span>Crear playlist</span>
          </button>
        </footer>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from "vue";
import { ListPlus, X, Plus, ImageOff } from "lucide-vue-next";
import { useLibraryStore } from "../../stores/libraryStore.js";

const library = useLibraryStore();

const showModal = ref(false);
const newPlaylistName = ref("");
const newPlaylistCover = ref("");
const coverLoadError = ref(false);
const nameInputRef = ref(null);

function openModal() {
  newPlaylistName.value = "";
  newPlaylistCover.value = "";
  coverLoadError.value = false;
  showModal.value = true;

  nextTick(() => {
    nameInputRef.value?.focus();
  });
}

function closeModal() {
  showModal.value = false;
}

function createPlaylist() {
  if (!newPlaylistName.value.trim()) return;

  library.createPlaylist({
    name: newPlaylistName.value.trim(),
    cover: newPlaylistCover.value?.trim() || null
  });

  closeModal();
}

// Expone el método openModal para uso mediante ref
defineExpose({
  openModal
});
</script>