<template>
  <main class="profile-page">
    <!-- ============================================================
         PORTADA DEL PERFIL
         ============================================================ -->

    <section class="profile-hero" :class="{ 'is-editing': isEditing }">
      <div class="profile-banner"></div>

      <div class="profile-hero-body">
        <div class="profile-avatar-wrap">
          <img
            v-if="user.avatarUrl"
            :src="user.avatarUrl"
            alt="Tu avatar"
            class="profile-avatar-img"
          />

          <span v-else class="profile-avatar-initials">
            {{ user.initials }}
          </span>

          <button
            type="button"
            class="avatar-edit-btn"
            title="Cambiar avatar"
            aria-label="Cambiar avatar"
            @click="openAvatarModal"
          >
            <Camera :size="14" />
          </button>
        </div>

        <div class="profile-hero-info">
          <template v-if="!isEditing">
            <h1 class="profile-name">
              {{
                user.profile.displayName ||
                user.profile.username ||
                (user.isGuest ? "Invitado" : "Oyente de Calliope")
              }}
            </h1>

            <p v-if="user.profile.username" class="profile-username">
              @{{ user.profile.username }}
            </p>

            <!-- INDICADOR DE TIPO DE PERFIL / SESIÓN -->
            <div v-if="user.isGuest" class="profile-status-badge is-guest">
              <User :size="13" />
              <span>Sesión temporal de invitado</span>
            </div>
            <div
              v-else-if="user.profile.private ?? user.profile.isPrivate"
              class="profile-status-badge is-private"
            >
              🔒 Perfil privado
            </div>
            <div v-else class="profile-status-badge is-local">
              Perfil público
            </div>

            <p v-if="user.profile.bio" class="profile-bio">
              {{ user.profile.bio }}
            </p>

            <p v-else class="profile-bio profile-bio-empty">
              {{
                user.isGuest
                  ? "Esta sesión es temporal. Los datos y cambios no se conservarán al cerrar sesión."
                  : "Añade una descripción para personalizar tu perfil."
              }}
            </p>
          </template>

          <form
            v-else
            class="profile-edit-form"
            @submit.prevent="saveIdentity"
          >
            <div class="form-row">
              <label class="form-field">
                <span>Nombre de usuario</span>
                <input
                  v-model="draft.username"
                  type="text"
                  placeholder="p.ej. alex_music"
                  maxlength="30"
                  autocomplete="username"
                />
              </label>

              <label class="form-field">
                <span>Nombre visible</span>
                <input
                  v-model="draft.displayName"
                  type="text"
                  placeholder="p.ej. Alejandro"
                  maxlength="40"
                />
              </label>
            </div>

            <label class="form-field">
              <span>URL del avatar</span>
              <input
                v-model="draft.avatarUrl"
                type="url"
                placeholder="https://ejemplo.com/avatar.jpg"
              />
            </label>

            <label class="form-field">
              <span>Descripción</span>
              <textarea
                v-model="draft.bio"
                rows="3"
                placeholder="Cuenta algo sobre tu gusto musical…"
                maxlength="240"
              ></textarea>
            </label>

            <div class="form-actions">
              <button type="submit" class="btn btn-primary">
                Guardar
              </button>

              <button
                type="button"
                class="btn btn-ghost"
                @click="cancelEditing"
              >
                Cancelar
              </button>
            </div>
          </form>

          <div v-if="!isEditing" class="profile-hero-actions">
            <button
              v-if="!user.isGuest"
              type="button"
              class="btn btn-primary"
              @click="startEditing"
            >
              <Pencil :size="14" />
              Editar perfil
            </button>

            <button
              type="button"
              class="btn btn-ghost"
              @click="handleLogout"
            >
              <LogOut :size="14" />
              Cerrar sesión
            </button>

            <span v-if="savedFlash" class="saved-flash">
              <Check :size="13" />
              Guardado
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- ============================================================
         NAVEGACIÓN DE CATEGORÍAS
         ============================================================ -->

    <nav class="profile-categories" aria-label="Secciones de perfil">
      <button
        v-for="category in categories"
        :key="category.id"
        type="button"
        class="category-pill"
        :class="{ active: activeCategory === category.id }"
        @click="activeCategory = category.id"
      >
        <component :is="category.icon" :size="15" />
        <span>{{ category.label }}</span>
      </button>
    </nav>

    <!-- ============================================================
         APARIENCIA
         ============================================================ -->

    <section
      v-show="activeCategory === 'appearance'"
      class="profile-section"
    >
      <h2>
        <Palette :size="17" />
        Apariencia
      </h2>

      <div class="pref-card">
        <div class="pref-row">
          <div class="pref-text">
            <strong>Color de acento</strong>
            <p>
              Elige el tono neón que tiñe botones, progreso y detalles.
            </p>
          </div>

          <div class="accent-swatches">
            <button
              v-for="opt in ACCENT_OPTIONS"
              :key="opt.value"
              type="button"
              class="accent-swatch"
              :class="{
                selected: user.profile.accentColor === opt.value,
              }"
              :style="{ '--swatch': opt.color }"
              :aria-label="opt.label"
              :title="opt.label"
              @click="user.updateProfile({ accentColor: opt.value })"
            >
              <Check
                v-if="user.profile.accentColor === opt.value"
                :size="13"
              />
            </button>
          </div>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Menos animaciones</strong>
            <p>
              Reduce movimientos y transiciones en toda la aplicación.
            </p>
          </div>

          <ToggleSwitch
            v-model="user.profile.reducedMotion"
            @update:modelValue="user.save()"
          />
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Visualizador de audio</strong>
            <p>
              Muestra el visualizador durante la reproducción.
            </p>
          </div>

          <ToggleSwitch
            v-model="user.profile.showVisualizer"
            @update:modelValue="user.save()"
          />
        </div>
      </div>
    </section>

    <!-- ============================================================
         REPRODUCCIÓN
         ============================================================ -->

    <section
      v-show="activeCategory === 'playback'"
      class="profile-section"
    >
      <h2>
        <Play :size="17" />
        Reproducción
      </h2>

      <div class="pref-card">
        <div class="pref-row">
          <div class="pref-text">
            <strong>Recordar cola y canción</strong>
            <p>
              Al volver a abrir Calliope se recupera la última cola de
              reproducción.
            </p>
          </div>

          <ToggleSwitch
            v-model="user.profile.keepQueueWhenClosing"
            @update:modelValue="user.save()"
          />
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Intentar reanudar al abrir</strong>
            <p>
              Si el navegador lo permite, continúa la reproducción
              automáticamente.
            </p>
          </div>

          <ToggleSwitch
            v-model="user.profile.autoplayOnStart"
            @update:modelValue="user.save()"
          />
        </div>
      </div>
    </section>

    <!-- ============================================================
         BIBLIOTECA
         ============================================================ -->

    <section
      v-show="activeCategory === 'library'"
      class="profile-section"
    >
      <h2>
        <LibraryIcon :size="17" />
        Biblioteca e Inicio
      </h2>

      <div class="pref-card">
        <div class="pref-row">
          <div class="pref-text">
            <strong>Orden de la biblioteca</strong>
            <p>
              Cómo se ordenan tus canciones por defecto.
            </p>
          </div>

          <select
            v-model="user.profile.librarySortMode"
            class="pref-select"
            @change="user.save()"
          >
            <option value="name">Título</option>
            <option value="artist">Artista</option>
            <option value="duration">Duración</option>
          </select>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Mostrar "Vuelve a escucharlo"</strong>
            <p>
              Sección de contenido reciente en Inicio.
            </p>
          </div>

          <ToggleSwitch
            v-model="user.profile.homeShowHistory"
            @update:modelValue="user.save()"
          />
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Mostrar álbumes más escuchados</strong>
            <p>
              Ranking según tu actividad real de escucha.
            </p>
          </div>

          <ToggleSwitch
            v-model="user.profile.homeShowTopAlbums"
            @update:modelValue="user.save()"
          />
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Mostrar playlists más escuchadas</strong>
            <p>
              Tus listas favoritas según el historial.
            </p>
          </div>

          <ToggleSwitch
            v-model="user.profile.homeShowTopPlaylists"
            @update:modelValue="user.save()"
          />
        </div>
      </div>

      <!-- Biblioteca de música -->

      <div class="pref-card">
        <div class="pref-row">
          <div class="pref-text">
            <strong>Biblioteca de música</strong>
            <p>
              Administra la carpeta donde Calliope busca tus canciones.
            </p>
          </div>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Canciones cargadas</strong>
          </div>

          <span class="local-badge">
            {{ library.songs.length }}
          </span>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Cambiar carpeta de música</strong>
            <p>
              Selecciona una nueva carpeta donde se encuentran tus
              archivos de música.
            </p>
          </div>

          <button
            type="button"
            class="btn btn-primary"
            @click="library.selectFolder()"
          >
            Cambiar carpeta
          </button>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Eliminar carpeta de música</strong>
            <p>
              Desvincula la carpeta actual. Tus archivos originales
              no serán eliminados.
            </p>
          </div>

          <button
            type="button"
            class="btn btn-danger"
            :disabled="!library.folderHandle"
            @click="removeLibrary"
          >
            Eliminar carpeta
          </button>
        </div>
      </div>
    </section>

    <!-- ============================================================
         AJUSTES
         ============================================================ -->

    <section
      v-show="activeCategory === 'settings'"
      class="profile-section"
    >
      <h2>
        <SettingsIcon :size="17" />
        Ajustes
      </h2>

      <div class="pref-card">
        <div class="pref-row">
          <div class="pref-text">
            <strong>Biblioteca de Música</strong>
            <p>
              Administra la carpeta donde Calliope busca tus canciones.
            </p>
          </div>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Canciones cargadas</strong>
          </div>

          <span class="local-badge">
            {{ library.songs.length }}
          </span>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Cambiar carpeta de música</strong>
            <p>
              Selecciona una nueva carpeta donde se encuentran tus
              archivos de música.
            </p>
          </div>

          <button
            type="button"
            class="btn btn-primary"
            @click="library.selectFolder()"
          >
            Cambiar carpeta
          </button>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Eliminar carpeta de música</strong>
            <p>
              Desvincula la carpeta actual. Tus archivos originales
              no serán eliminados.
            </p>
          </div>

          <button
            type="button"
            class="btn btn-danger"
            :disabled="!library.folderHandle"
            @click="removeLibrary"
          >
            Eliminar carpeta
          </button>
        </div>
      </div>

      <div class="pref-card">
        <div class="pref-row">
          <div class="pref-text">
            <strong>Estado de la Biblioteca</strong>
            <p>
              Comprueba y mantiene organizada la información de tus
              canciones.
            </p>
          </div>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Canciones sin metadatos</strong>
          </div>

          <span class="local-badge">
            {{ songsWithoutMetadata }}
          </span>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Gestionar metadatos</strong>
            <p>
              Consulta, edita y analiza los metadatos de tus canciones.
            </p>
          </div>

          <button
            type="button"
            class="btn btn-primary"
            :disabled="!library.folderHandle"
            @click="router.push('/metadata')"
          >
            Metadatos
          </button>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Escanear de nuevo</strong>
            <p>
              Busca nuevos archivos añadidos a la carpeta seleccionada.
            </p>
          </div>

          <button
            type="button"
            class="btn btn-primary"
            :disabled="!library.folderHandle"
            @click="library.rescanLibrary()"
          >
            Escanear
          </button>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Reconstruir biblioteca</strong>
            <p>
              Elimina la información guardada y vuelve a analizar
              todos los archivos.
            </p>
          </div>

          <button
            type="button"
            class="btn btn-ghost"
            :disabled="!library.folderHandle"
            @click="rebuild"
          >
            Reconstruir
          </button>
        </div>
      </div>
    </section>

    <!-- ============================================================
         PRIVACIDAD Y DATOS
         ============================================================ -->

    <section
      v-show="activeCategory === 'privacy'"
      class="profile-section"
    >
      <h2>
        <ShieldCheck :size="17" />
        Privacidad y datos
      </h2>

      <div class="pref-card">
        <div v-if="!user.isGuest" class="pref-row">
          <div class="pref-text">
            <strong>Perfil privado</strong>
            <p>
              {{
                Boolean(user.profile.private ?? user.profile.isPrivate)
                  ? "Este perfil está protegido con contraseña en este dispositivo."
                  : "Este perfil es público en este dispositivo. No requiere contraseña para entrar."
              }}
            </p>
          </div>

          <ToggleSwitch
            :model-value="Boolean(user.profile.private ?? user.profile.isPrivate)"
            @update:model-value="handleTogglePrivacy"
          />
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Guardar historial de escucha</strong>
            <p>
              Registra lo que reproduces para potenciar las secciones
              de Inicio.
            </p>
          </div>

          <ToggleSwitch
            v-model="user.profile.saveListeningHistory"
            @update:modelValue="user.save()"
          />
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Almacenamiento local</strong>

            <p v-if="storageText">
              {{ storageText }}
            </p>

            <p v-else>
              Calliope es 100% local: nada sale de este dispositivo.
            </p>
          </div>

          <span class="local-badge">
            <HardDrive :size="14" />
            Local
          </span>
        </div>
      </div>

      <div class="pref-card danger-zone">
        <div class="pref-row">
          <div class="pref-text">
            <strong>Restablecer preferencias</strong>
            <p>
              Vuelve a los valores originales de apariencia,
              reproducción y biblioteca.
            </p>
          </div>

          <button
            type="button"
            class="btn btn-ghost"
            @click="resetPreferences"
          >
            Restablecer
          </button>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Cerrar sesión</strong>
            <p>
              {{
                user.isGuest
                  ? "Finaliza la sesión de invitado. Los datos temporales se borrarán."
                  : "Cierra la sesión activa y vuelve a la selección de perfil."
              }}
            </p>
          </div>

          <button
            type="button"
            class="btn btn-ghost"
            @click="handleLogout"
          >
            <LogOut :size="14" />
            Cerrar sesión
          </button>
        </div>

        <div v-if="!user.isGuest" class="pref-row">
          <div class="pref-text">
            <strong>Eliminar perfil</strong>
            <p>
              Borra este perfil local, identidad y preferencias de este dispositivo.
            </p>
          </div>

          <button
            type="button"
            class="btn btn-danger"
            @click="wipeProfile"
          >
            Eliminar perfil
          </button>
        </div>
      </div>
    </section>

    <!-- ============================================================
         MODAL CAMBIAR AVATAR
         ============================================================ -->

    <div
      v-if="isAvatarModalOpen"
      class="modal-backdrop"
      @click.self="isAvatarModalOpen = false"
    >
      <div class="modal-card avatar-dialog-card">
        <div class="modal-header-simple">
          <h3>Cambiar imagen de perfil</h3>

          <button
            type="button"
            class="close-btn"
            aria-label="Cerrar"
            @click="isAvatarModalOpen = false"
          >
            <X :size="16" />
          </button>
        </div>

        <p class="dialog-desc">
          Introduce una URL de imagen o selecciona un archivo local.
        </p>

        <label class="form-field">
          <span>URL de la imagen</span>

          <input
            v-model="avatarUrlDraft"
            type="url"
            placeholder="https://ejemplo.com/avatar.jpg"
            @keyup.enter="saveAvatarUrl"
          />
        </label>

        <div v-if="avatarUrlDraft" class="dialog-preview-wrap">
          <img
            :src="avatarUrlDraft"
            alt="Vista previa"
            class="dialog-preview-img"
          />
        </div>

        <div class="dialog-actions-row">
          <label
            class="btn btn-ghost file-picker-label"
            title="Seleccionar archivo del dispositivo"
          >
            <Camera :size="14" />
            <span>Subir archivo</span>

            <input
              type="file"
              accept="image/*"
              hidden
              @change="pickAvatarFile"
            />
          </label>

          <div class="action-buttons-group">
            <button
              v-if="user.avatarUrl"
              type="button"
              class="btn btn-danger"
              @click="removeAvatar"
            >
              Eliminar
            </button>

            <button
              type="button"
              class="btn btn-primary"
              @click="saveAvatarUrl"
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================================
         MODAL ESTABLECER CONTRASEÑA DE PERFIL PRIVADO
         ============================================================ -->

    <div
      v-if="isSetPasswordModalOpen"
      class="modal-backdrop"
      @click.self="cancelSetPassword"
    >
      <div class="modal-card password-dialog-card">
        <div class="modal-header-simple">
          <h3>Proteger perfil con contraseña</h3>

          <button
            type="button"
            class="close-btn"
            aria-label="Cerrar"
            @click="cancelSetPassword"
          >
            <X :size="16" />
          </button>
        </div>

        <p class="dialog-desc">
          Para hacer privado este perfil, establece una contraseña. Se te pedirá cada vez que inicies sesión en este dispositivo.
        </p>

        <form @submit.prevent="confirmSetPassword">
          <label class="form-field">
            <span>Nueva contraseña</span>
            <input
              v-model="passwordDraft.password"
              type="password"
              autocomplete="new-password"
              placeholder="Mínimo 4 caracteres"
              required
              autofocus
            />
          </label>

          <label class="form-field">
            <span>Confirmar contraseña</span>
            <input
              v-model="passwordDraft.confirmPassword"
              type="password"
              autocomplete="new-password"
              placeholder="Repite la contraseña"
              required
            />
          </label>

          <p v-if="passwordError" class="dialog-error-msg">
            <AlertCircle :size="14" />
            {{ passwordError }}
          </p>

          <div class="dialog-actions-row">
            <button
              type="button"
              class="btn btn-ghost"
              @click="cancelSetPassword"
            >
              Cancelar
            </button>

            <button
              type="submit"
              class="btn btn-primary"
              :disabled="isSettingPassword"
            >
              <span v-if="isSettingPassword">Guardando...</span>
              <span v-else>Establecer y activar</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import {
  AlertCircle,
  Camera,
  Check,
  HardDrive,
  LibraryIcon,
  Lock,
  LogOut,
  Palette,
  Pencil,
  Play,
  Settings as SettingsIcon,
  ShieldCheck,
  User,
  X,
} from "lucide-vue-next";
import { useRouter } from "vue-router";
import { useUserStore } from "../stores/userStore.js";
import { useLibraryStore } from "../stores/libraryStore.js";
import { downscaleImage } from "../lib/covers.js";
import ToggleSwitch from "../components/common/ToggleSwitch.vue";

const user = useUserStore();
const library = useLibraryStore();
const router = useRouter();

const ACCENT_OPTIONS = [
  { value: "neon", label: "Neón", color: "#25d866" },
  { value: "cyan", label: "Cian", color: "#22d3ee" },
  { value: "magenta", label: "Magenta", color: "#e14eca" },
  { value: "amber", label: "Ámbar", color: "#fbbf24" },
];

const categories = [
  { id: "appearance", label: "Apariencia", icon: Palette },
  { id: "playback", label: "Reproducción", icon: Play },
  { id: "library", label: "Biblioteca", icon: LibraryIcon },
  { id: "settings", label: "Ajustes", icon: SettingsIcon },
  { id: "privacy", label: "Privacidad", icon: ShieldCheck },
];

const activeCategory = ref("appearance");
const isEditing = ref(false);
const savedFlash = ref(false);
const storageText = ref("");
const isAvatarModalOpen = ref(false);
const isSetPasswordModalOpen = ref(false);
const isSettingPassword = ref(false);
const passwordError = ref("");
const passwordDraft = reactive({
  password: "",
  confirmPassword: "",
});
const avatarUrlDraft = ref("");

const draft = reactive({
  username: "",
  displayName: "",
  bio: "",
  avatarUrl: "",
});

const songsWithoutMetadata = computed(
  () => library.songs.filter((song) => !song.hasMetadata).length,
);

function flashSaved() {
  savedFlash.value = true;

  setTimeout(() => {
    savedFlash.value = false;
  }, 1800);
}

function startEditing() {
  draft.username = user.profile.username;
  draft.displayName = user.profile.displayName;
  draft.bio = user.profile.bio;
  draft.avatarUrl = user.profile.avatarUrl || "";

  isEditing.value = true;
}

function cancelEditing() {
  isEditing.value = false;
}

async function saveIdentity() {
  const avatarUrl = draft.avatarUrl.trim();

  await user.updateProfile({
    username: draft.username.trim(),
    displayName: draft.displayName.trim(),
    bio: draft.bio.trim(),
    avatarUrl,
  });

  if (avatarUrl) {
    await user.setAvatar(avatarUrl);
  }

  isEditing.value = false;
  flashSaved();
}

async function removeLibrary() {
  const confirmed = confirm(
    "¿Quieres eliminar la carpeta de música seleccionada?\n\n" +
      "Tus archivos originales no serán borrados.",
  );

  if (!confirmed) return;

  await library.removeFolder();
}

async function rebuild() {
  const confirmed = confirm(
    "Se reconstruirá la biblioteca desde cero.\n\n" +
      "Las playlists y configuraciones no se eliminarán.\n\n" +
      "¿Continuar?",
  );

  if (!confirmed) return;

  await library.rebuildLibrary();
}

function openAvatarModal() {
  avatarUrlDraft.value = user.profile.avatarUrl || "";
  isAvatarModalOpen.value = true;
}

async function saveAvatarUrl() {
  const url = avatarUrlDraft.value.trim();

  if (url) {
    await user.setAvatar(url);
  }

  isAvatarModalOpen.value = false;
  flashSaved();
}

async function removeAvatar() {
  await user.setAvatar(null);

  avatarUrlDraft.value = "";
  isAvatarModalOpen.value = false;

  flashSaved();
}

async function pickAvatarFile(event) {
  const file = event.target.files?.[0];

  if (!file || !file.type.startsWith("image/")) {
    event.target.value = "";
    return;
  }

  try {
    const blob = await downscaleImage(file, 360);

    await user.setAvatar(blob);

    isAvatarModalOpen.value = false;
    flashSaved();
  } catch (error) {
    console.error("Error al actualizar avatar:", error);
  } finally {
    event.target.value = "";
  }
}

async function resetPreferences() {
  const confirmed = confirm(
    "¿Restablecer todas las preferencias?\n\n" +
      "Tu identidad e imágenes se conservan.",
  );

  if (!confirmed) return;

  await user.resetPreferences();
  flashSaved();
}

async function handleLogout() {
  await user.logout();
  router.push("/welcome");
}

async function handleTogglePrivacy(newValue) {
  if (user.isGuest) return;

  if (!newValue) {
    await user.setProfilePrivacy(false);
    flashSaved();
    return;
  }

  if (user.hasPassword) {
    await user.setProfilePrivacy(true);
    flashSaved();
  } else {
    passwordDraft.password = "";
    passwordDraft.confirmPassword = "";
    passwordError.value = "";
    isSetPasswordModalOpen.value = true;
  }
}

async function confirmSetPassword() {
  passwordError.value = "";
  if (!passwordDraft.password || passwordDraft.password.length < 4) {
    passwordError.value = "La contraseña debe tener al menos 4 caracteres.";
    return;
  }
  if (passwordDraft.password !== passwordDraft.confirmPassword) {
    passwordError.value = "Las contraseñas no coinciden.";
    return;
  }

  isSettingPassword.value = true;
  try {
    const res = await user.setProfilePrivacy(true, passwordDraft.password);
    if (res.success) {
      isSetPasswordModalOpen.value = false;
      flashSaved();
    } else {
      passwordError.value = res.error || "Error al establecer la contraseña.";
    }
  } catch (err) {
    passwordError.value = "Error al guardar la contraseña.";
  } finally {
    isSettingPassword.value = false;
  }
}

function cancelSetPassword() {
  isSetPasswordModalOpen.value = false;
  passwordError.value = "";
}

async function wipeProfile() {
  const confirmed = confirm(
    "Se eliminará este perfil completo (identidad, imágenes y preferencias) de este dispositivo." +
      "\n\n¿Continuar?",
  );

  if (!confirmed) return;

  await user.wipeProfile();
  router.push("/welcome");
}

onMounted(async () => {
  await user.load();

  try {
    const estimate = await navigator.storage?.estimate?.();

    if (estimate?.usage != null) {
      storageText.value =
        `Calliope usa ${(estimate.usage / 1024 / 1024).toFixed(1)} MB ` +
        "de tu dispositivo. Nada se envía a ningún servidor.";
    }
  } catch {
    // La estimación de almacenamiento es opcional.
  }
});
</script>