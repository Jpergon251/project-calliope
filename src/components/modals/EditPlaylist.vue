<template>
  <div
    v-if="showModal"
    class="modal-backdrop playlist-edit-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="edit-playlist-title"
    @click.self="close"
    @keydown.esc="close"
  >
    <div class="modal-card playlist-edit-card">
      <!-- Encabezado del modal -->
      <header class="modal-header">
        <div class="header-titles">
          <div class="title-badge" aria-hidden="true">
            <Pencil :size="20" />
          </div>
          <div>
            <h2 id="edit-playlist-title" class="title">Editar playlist</h2>
            <p class="subtitle">Modifica los detalles de tu lista de reproducción</p>
          </div>
        </div>

        <button
          type="button"
          class="close-button"
          aria-label="Cerrar modal"
          @click="close"
        >
          <X :size="18" />
        </button>
      </header>

      <!-- Formulario de edición -->
      <form class="playlist-edit-form" @submit.prevent="save">
        <div class="form-body">
          <div class="form-group">
            <label for="edit-playlist-name" class="form-label">
              <span>Nombre de la playlist</span>
              <span class="required-indicator" aria-hidden="true">*</span>
            </label>
            <div class="input-wrapper">
              <input
                id="edit-playlist-name"
                ref="nameInputRef"
                v-model="editedName"
                type="text"
                placeholder="Nombre de la playlist"
                required
                maxlength="100"
                class="form-input"
                autocomplete="off"
              />
            </div>
          </div>

          <div class="form-group">
            <label for="edit-playlist-cover" class="form-label">
              <span>URL de la portada</span>
              <span class="optional-label">(Opcional)</span>
            </label>
            <div class="input-wrapper">
              <input
                id="edit-playlist-cover"
                v-model="editedCover"
                type="url"
                placeholder="https://ejemplo.com/portada.jpg"
                class="form-input"
                autocomplete="off"
              />
            </div>

            <!-- Previsualización de la portada si se introduce URL -->
            <div v-if="editedCover && editedCover.trim()" class="cover-preview-wrapper">
              <span class="preview-label">Vista previa:</span>
              <div class="cover-preview">
                <img
                  :src="editedCover"
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
        <footer class="modal-footer modal-actions">
          <button
            type="button"
            class="btn-cancel cancel"
            @click="close"
          >
            Cancelar
          </button>

          <button
            type="submit"
            class="btn-confirm save"
            :disabled="!editedName.trim()"
          >
            <Check :size="16" />
            <span>Guardar cambios</span>
          </button>
        </footer>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from "vue";
import { Pencil, X, Check, ImageOff } from "lucide-vue-next";
import { useLibraryStore } from "../../stores/libraryStore.js";

const library = useLibraryStore();

const showModal = ref(false);
const playlist = ref(null);
const editedName = ref("");
const editedCover = ref("");
const coverLoadError = ref(false);
const nameInputRef = ref(null);

function open(targetPlaylist) {
  playlist.value = targetPlaylist;
  editedName.value = targetPlaylist.name;
  editedCover.value = targetPlaylist.cover || "";
  coverLoadError.value = false;
  showModal.value = true;

  nextTick(() => {
    nameInputRef.value?.focus();
  });
}

function close() {
  showModal.value = false;
}

async function save() {
  if (!playlist.value || !editedName.value.trim()) return;

  await library.updatePlaylist(
    playlist.value.id,
    {
      name: editedName.value.trim(),
      cover: editedCover.value?.trim() || null
    }
  );

  close();
}

defineExpose({
  open
});
</script>