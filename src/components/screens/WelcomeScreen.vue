<template>
  <section class="welcome-screen">
    <div class="welcome-background" aria-hidden="true">
      <div class="welcome-glow welcome-glow-primary"></div>
      <div class="welcome-glow welcome-glow-secondary"></div>
    </div>

    <div class="welcome-container">

      <!-- HEADER -->
      <header class="welcome-header">
        <Logo class="welcome-logo" />

        <div class="welcome-progress" aria-label="Progreso">
          <span
            v-for="step in steps"
            :key="step.id"
            :class="{
              active: currentStep >= step.id
            }"
          ></span>
        </div>
      </header>

      <!-- CONTENIDO -->
      <main class="welcome-content">

        <!-- ==================================================
             PASO 1 · PERFIL
             ================================================== -->

        <section
          v-if="currentStep === 1"
          class="welcome-step"
          :class="{ 'welcome-step-choice': viewMode === 'choice' }"
        >
          <template v-if="viewMode === 'choice'">
            <div class="welcome-heading">
              <span class="welcome-eyebrow">
                {{ user.profilesList.length ? "Perfiles locales" : "Tu música, tu espacio" }}
              </span>

              <h1>
                {{ user.profilesList.length ? "Elige tu perfil." : "¿Cómo quieres empezar?" }}
              </h1>

              <p>
                {{
                  user.profilesList.length
                    ? "Selecciona un perfil o elige cómo quieres continuar."
                    : "Crea un perfil local o entra como invitado. Podrás cambiarlo más adelante."
                }}
              </p>
            </div>

            <div class="welcome-profiles-list">
              <div
                v-for="p in user.profilesList"
                :key="p.id"
                class="welcome-profile-card welcome-profile-selectable"
                :class="{
                  'is-active': selectedProfileId === p.id,
                  'is-private': Boolean(p.private ?? p.isPrivate),
                }"
                role="button"
                tabindex="0"
                @click="onSelectProfile(p)"
                @keydown.enter="onSelectProfile(p)"
              >
                <div class="welcome-avatar">
                  <img
                    v-if="p.avatarUrl"
                    :src="p.avatarUrl"
                    alt=""
                  />
                  <span v-else>
                    {{ getProfileInitials(p) }}
                  </span>
                </div>

                <div class="welcome-profile-info">
                  <strong>
                    {{ p.displayName || p.name }}
                  </strong>

                  <span v-if="p.username">
                    @{{ p.username }}
                  </span>
                  <small v-else class="welcome-username-pending">
                    Nombre de usuario pendiente
                  </small>

                  <small v-if="p.private ?? p.isPrivate" class="welcome-private-badge">
                    🔒 Perfil privado
                  </small>
                  <small v-else>
                    Perfil público
                  </small>
                </div>

                <div class="welcome-profile-action-icon">
                  <Lock v-if="p.private ?? p.isPrivate" :size="16" />
                  <ArrowRight v-else :size="16" />
                </div>
              </div>
            </div>

            <!-- DESBLOQUEO DE PERFIL PRIVADO -->
            <div
              v-if="unlockingProfile"
              class="welcome-unlock-box"
            >
              <div class="welcome-unlock-header">
                <Lock :size="16" />
                <span>Perfil protegido: <strong>{{ unlockingProfile.displayName || unlockingProfile.name }}</strong></span>
              </div>

              <div class="welcome-unlock-input-row">
                <input
                  v-model="unlockPassword"
                  type="password"
                  placeholder="Introduce tu contraseña"
                  autocomplete="current-password"
                  @keyup.enter="confirmUnlock"
                />

                <button
                  type="button"
                  class="welcome-button welcome-button-primary"
                  :disabled="!unlockPassword || isUnlocking"
                  @click="confirmUnlock"
                >
                  <LoaderCircle
                    v-if="isUnlocking"
                    :size="16"
                    class="welcome-spinner"
                  />
                  <span v-else>Entrar</span>
                </button>
              </div>

              <p v-if="unlockError" class="welcome-error-msg">
                <AlertCircle :size="14" />
                {{ unlockError }}
              </p>
            </div>

            <div class="welcome-actions welcome-actions-column welcome-choice-actions">
              <div class="welcome-actions-row">
                <button
                  type="button"
                  class="welcome-button welcome-button-primary"
                  @click="startCreatingProfile"
                >
                  <UserPlus :size="17" />
                  Crear perfil
                </button>

                <button
                  type="button"
                  class="welcome-button welcome-button-primary"
                  @click="continueAsGuest"
                >
                  <User :size="17" />
                  Continuar como invitado
                </button>
              </div>
              <input
                ref="profileImportInput"
                class="welcome-profile-import-input"
                type="file"
                accept="application/json,.json"
                aria-label="Seleccionar archivo JSON de perfil"
                @change="importProfile"
              />
              <button
                ref="profileImportButton"
                type="button"
                class="welcome-button welcome-button-secondary"
                :disabled="!user.loaded || isImportingProfile || Boolean(pendingProfileImport)"
                @click="profileImportInput?.click()"
              >
                <LoaderCircle
                  v-if="isImportingProfile"
                  :size="17"
                  class="welcome-spinner"
                />
                <Database v-else :size="17" />
                {{ isImportingProfile ? "Importando perfil..." : "Importar perfil" }}
              </button>
              <div v-if="profileImportError" class="welcome-error-msg" role="alert">
                <AlertCircle :size="14" />
                {{ profileImportError }}
              </div>
              <p v-if="profileImportMessage" class="welcome-import-message" role="status">
                {{ profileImportMessage }}
              </p>
              <section class="welcome-drive-section" aria-label="Copias de perfil en Google Drive">
                <h2>Google Drive por perfil</h2>
                <p>Vincula cuentas diferentes a perfiles distintos. Conectar no sube ningún dato.</p>
                <label v-if="user.profilesList.length" class="welcome-drive-profile-select">
                  <span>Perfil que quieres gestionar</span>
                  <select v-model="driveProfileId">
                    <option v-for="profileOption in user.profilesList" :key="profileOption.id" :value="profileOption.id">
                      {{ profileOption.displayName || profileOption.name }}{{ profileOption.username ? ` (@${profileOption.username})` : ` · ${profileOption.id.slice(0, 8)}` }}
                    </option>
                  </select>
                </label>
                <p v-else class="welcome-drive-empty">
                  Crea un perfil local para poder vincularlo a Google Drive.
                </p>
                <GoogleDriveProfile
                  v-if="selectedDriveProfile"
                  :key="selectedDriveProfile.id"
                  :profile="selectedDriveProfile"
                  :locked="Boolean(selectedDriveProfile.private ?? selectedDriveProfile.isPrivate)"
                />
              </section>
            </div>
          </template>

          <!-- MODO: CREAR PERFIL LOCAL -->
          <template v-else-if="viewMode === 'create'">
            <button
              type="button"
              class="welcome-back"
              @click="cancelCreate"
            >
              <ArrowLeft :size="17" />
              Volver
            </button>

            <div class="welcome-heading">
              <span class="welcome-eyebrow">
                Nuevo perfil
              </span>

              <h1>
                Haz que Calliope sea tuyo.
              </h1>

              <p>
                Crea tu perfil local. Todo se almacena 100% de forma privada en tu dispositivo.
              </p>
            </div>

            <form
              class="welcome-form"
              @submit.prevent="submitNewProfile"
            >
              <div class="welcome-form-avatar">
                {{ draftInitials }}
              </div>

              <label>
                <span>Nombre *</span>
                <input
                  v-model="draft.displayName"
                  type="text"
                  maxlength="40"
                  autocomplete="name"
                  placeholder="Tu nombre"
                  required
                />
              </label>

              <label>
                <span>
                  Nombre de usuario *
                </span>
                <input
                  v-model="draft.username"
                  type="text"
                  maxlength="30"
                  autocomplete="username"
                  placeholder="@tu_usuario"
                  aria-describedby="welcome-username-help welcome-username-status"
                  required
                />
                <small id="welcome-username-help" class="welcome-field-help">
                  Debe ser único (3–30 caracteres). Puedes usar letras, números,
                  puntos, guiones y guiones bajos; @ inicial opcional.
                </small>
                <small
                  id="welcome-username-status"
                  class="welcome-username-status"
                  :class="`is-${draftUsernameStatus.state}`"
                  aria-live="polite"
                >
                  {{ draftUsernameStatus.message }}
                </small>
              </label>

              <label>
                <span>
                  Descripción
                  <em>opcional</em>
                </span>
                <textarea
                  v-model="draft.bio"
                  rows="3"
                  maxlength="240"
                  placeholder="Cuéntanos algo sobre tus gustos musicales..."
                ></textarea>
              </label>

              <!-- TOGGLE PERFIL PRIVADO -->
              <div class="welcome-checkbox-wrap">
                <label class="welcome-checkbox-label">
                  <input
                    v-model="draft.isPrivate"
                    type="checkbox"
                  />
                  <div class="welcome-checkbox-content">
                    <div class="welcome-checkbox-title">
                      <Lock :size="15" />
                      <strong>Hacer este perfil privado</strong>
                    </div>
                    <span>
                      Protegido con contraseña mediante PBKDF2 local. Se te pedirá al iniciar sesión.
                    </span>
                  </div>
                </label>
              </div>

              <!-- CAMPOS DE CONTRASEÑA SI ES PRIVADO -->
              <div
                v-if="draft.isPrivate"
                class="welcome-password-fields"
              >
                <label>
                  <span>Contraseña *</span>
                  <input
                    v-model="draft.password"
                    type="password"
                    autocomplete="new-password"
                    placeholder="Mínimo 4 caracteres"
                    required
                  />
                </label>

                <label>
                  <span>Confirmar contraseña *</span>
                  <input
                    v-model="draft.confirmPassword"
                    type="password"
                    autocomplete="new-password"
                    placeholder="Repite la contraseña"
                    required
                  />
                </label>

                <p v-if="createPasswordError" class="welcome-error-msg">
                  <AlertCircle :size="14" />
                  {{ createPasswordError }}
                </p>
              </div>

              <div class="welcome-actions">
                <button
                  type="submit"
                  class="welcome-button welcome-button-primary"
                  :disabled="isCreatingProfile || !draftUsernameStatus.available"
                >
                  <LoaderCircle
                    v-if="isCreatingProfile"
                    :size="18"
                    class="welcome-spinner"
                  />
                  <span v-else>Crear perfil</span>
                  <ArrowRight v-if="!isCreatingProfile" :size="18" />
                </button>

                <button
                  v-if="user.profilesList.length > 0"
                  type="button"
                  class="welcome-button welcome-button-secondary"
                  @click="cancelCreate"
                >
                  Cancelar
                </button>

              </div>
            </form>
          </template>
        </section>

        <!-- ==================================================
             PASO 2 · APARIENCIA
             ================================================== -->

        <section
          v-else-if="currentStep === 2"
          class="welcome-step"
        >
          <button
            type="button"
            class="welcome-back"
            @click="goToPreviousStep"
          >
            <ArrowLeft :size="17" />
            Atrás
          </button>

          <div class="welcome-heading">
            <span class="welcome-eyebrow">
              Tu estilo
            </span>

            <h1>
              Elige tu tema.
            </h1>

            <p>
              Personaliza los colores de Calliope.
              Podrás cambiar el tema más adelante desde tu perfil.
            </p>
          </div>

          <div class="welcome-accent-card">
            <div class="welcome-accent-header">
              <div>
                <strong>
                  Tema visual
                </strong>

                <span>
                  {{ selectedAccentLabel }}
                </span>
              </div>

              <span class="welcome-accent-current" aria-hidden="true">
                <span
                  v-for="color in selectedPalette.colors"
                  :key="color"
                  :style="{ backgroundColor: color }"
                ></span>
              </span>
            </div>

            <div class="welcome-accent-options">
              <button
                v-for="option in COLOR_PALETTES"
                :key="option.value"
                type="button"
                class="welcome-accent-option"
                :class="{
                  selected: isPaletteSelected(option.value)
                }"
                :style="{
                  '--option-color': option.tokens['--accent']
                }"
                :aria-label="`Usar tema ${option.label}`"
                :aria-pressed="isPaletteSelected(option.value)"
                @click="selectPalette(option.value)"
              >
                <span class="welcome-palette-swatches" aria-hidden="true">
                  <span
                    v-for="color in option.colors"
                    :key="color"
                    :style="{ backgroundColor: color }"
                  ></span>
                </span>

                <Check
                  v-if="isPaletteSelected(option.value)"
                  :size="16"
                />

                <small>
                  {{ option.label }}
                </small>
              </button>
            </div>
          </div>

          <div class="welcome-actions">
            <button
              type="button"
              class="welcome-button welcome-button-primary"
              @click="goToNextStep"
            >
              Continuar
              <ArrowRight :size="18" />
            </button>
          </div>
        </section>

        <!-- ==================================================
             PASO 3 · BIBLIOTECA
             ================================================== -->

        <section
          v-else
          class="welcome-step"
        >
          <button
            type="button"
            class="welcome-back"
            @click="goToPreviousStep"
          >
            <ArrowLeft :size="17" />
            Atrás
          </button>

          <div class="welcome-heading">
            <span class="welcome-eyebrow">
              Último paso
            </span>

            <h1>
              Añade tu música.
            </h1>

            <p>
              Selecciona la carpeta donde guardas tus canciones.
              Calliope leerá tu biblioteca directamente desde tu dispositivo.
            </p>
          </div>

          <template v-if="isSupported">
            <button
              type="button"
              class="welcome-folder"
              :disabled="selectingFolder"
              @click="selectFolder"
            >
              <div class="welcome-folder-icon">
                <LoaderCircle
                  v-if="selectingFolder"
                  :size="28"
                  class="welcome-spinner"
                />

                <FolderOpen
                  v-else
                  :size="28"
                />
              </div>

              <div class="welcome-folder-content">
                <strong>
                  {{
                    selectingFolder
                      ? "Preparando tu biblioteca..."
                      : "Seleccionar carpeta de música"
                  }}
                </strong>

                <span>
                  {{
                    selectingFolder
                      ? "Analizando tu biblioteca."
                      : "Calliope buscará tus canciones, álbumes y artistas."
                  }}
                </span>
              </div>

              <ArrowRight
                v-if="!selectingFolder"
                :size="19"
              />
            </button>

            <div class="welcome-privacy">
              <ShieldCheck :size="17" />

              <span>
                Tus canciones nunca se suben a un servidor.
              </span>
            </div>

            <div class="welcome-library-note">
              <Database :size="15" />

              <span>
                Podrás cambiar la carpeta posteriormente desde
                <strong>Perfil → Ajustes</strong>.
              </span>
            </div>

            <div class="welcome-actions">
              <button
                type="button"
                class="welcome-button welcome-button-secondary"
                @click="enterApp"
              >
                {{ library.folderHandle ? "Continuar a Calliope" : "Entrar sin carpeta" }}
                <ArrowRight :size="18" />
              </button>
            </div>
          </template>

          <!-- NAVEGADOR NO COMPATIBLE -->
          <div
            v-else
            class="welcome-unsupported"
          >
            <div class="welcome-unsupported-icon">
              <MonitorOff :size="24" />
            </div>

            <div>
              <strong>
                {{
                  isMobile
                    ? "Necesitas un ordenador"
                    : "Navegador no compatible"
                }}
              </strong>

              <p>
                Calliope necesita acceso a carpetas locales
                para poder leer tu biblioteca musical.
              </p>

              <span>
                Utiliza Chrome, Edge, Brave u otro navegador
                basado en Chromium.
              </span>
            </div>
          </div>
        </section>

      </main>

      <!-- FOOTER -->
      <footer class="welcome-footer">
        <div>
          <ShieldCheck :size="14" />
          <span>
            Todo permanece en tu dispositivo
          </span>
        </div>

        <span class="welcome-brand">
          CALLIOPE
        </span>
      </footer>

    </div>

    <Transition name="welcome-import-loading">
      <div
        v-if="isImportingProfile"
        class="welcome-import-loading"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div class="welcome-import-loading-card">
          <div class="welcome-import-loading-indicator" aria-hidden="true">
            <LoaderCircle :size="34" class="welcome-import-loading-spinner" />
          </div>
          <h2>Preparando tu perfil</h2>
          <p>{{ profileImportStage }}</p>
        </div>
      </div>
    </Transition>

    <div
      v-if="pendingProfileImport"
      class="welcome-import-dialog-backdrop"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="welcome-import-dialog-title"
      aria-describedby="welcome-import-dialog-description"
      @click.self="cancelProfileImport"
      @keydown.esc="cancelProfileImport"
    >
      <section class="welcome-import-dialog">
        <div class="welcome-import-dialog-icon" aria-hidden="true">
          <AlertCircle :size="22" />
        </div>
        <h2 id="welcome-import-dialog-title">
          {{
            pendingProfileImport.type === "overwrite" || pendingProfileImport.type === "overwrite-username-required"
              ? "Restaurar perfil existente"
              : pendingProfileImport.type === "username-conflict"
                ? "Nombre de usuario en uso"
                : pendingProfileImport.type === "username-required"
                  ? "Elige un nombre de usuario"
                  : "Conflicto de identidad"
          }}
        </h2>
        <p id="welcome-import-dialog-description">
          <template v-if="pendingProfileImport.type === 'overwrite' || pendingProfileImport.type === 'overwrite-username-required'">
            El perfil «{{ pendingProfileImport.profileName }}»
            <template v-if="pendingProfileImport.username">
              (@{{ pendingProfileImport.username }})
            </template>
            ya existe. Si continúas, sus datos personales actuales serán
            reemplazados por los del archivo importado. Esta acción no se puede
            deshacer desde la aplicación.
            <template v-if="pendingProfileImport.type === 'overwrite-username-required'">
              El archivo y el perfil no tienen username; elige uno único para completar la restauración.
            </template>
            <template v-else>¿Quieres continuar?</template>
          </template>
          <template v-else-if="pendingProfileImport.type === 'username-conflict'">
            El nombre de usuario @{{ pendingProfileImport.conflictingUsername }}
            ya pertenece a «{{ pendingProfileImport.conflictingProfileName }}».
            No se modificará ese perfil. Elige otro nombre de usuario para importar.
          </template>
          <template v-else-if="pendingProfileImport.type === 'username-required' || pendingProfileImport.type === 'overwrite-username-required'">
            Este archivo antiguo no contiene un nombre de usuario. Elige uno único
            para {{ pendingProfileImport.type === "overwrite-username-required" ? "restaurar el perfil existente" : "crear el perfil sin cambiar su ID" }}.
          </template>
          <template v-else>
            El ID y el nombre de usuario del archivo pertenecen a perfiles distintos.
            No es posible continuar de forma segura sin arriesgar la identidad de
            uno de ellos. No se modificará ningún perfil.
          </template>
        </p>
        <p
          v-if="pendingProfileImport.type === 'overwrite' || pendingProfileImport.type === 'overwrite-username-required'"
          class="welcome-import-folder-note"
        >
          La carpeta de música asociada a este perfil en este dispositivo se conservará. Las carpetas no se incluyen en el archivo de perfil.
        </p>
        <label
          v-if="pendingProfileImport.type === 'username-conflict' || pendingProfileImport.type === 'username-required' || pendingProfileImport.type === 'overwrite-username-required'"
          class="welcome-import-username"
        >
          <span>Nombre de usuario *</span>
          <input
            v-model="pendingProfileImport.usernameDraft"
            type="text"
            maxlength="30"
            autocomplete="username"
            placeholder="@tu_usuario"
            aria-describedby="welcome-import-username-status"
            :disabled="isImportingProfile"
          />
          <small
            id="welcome-import-username-status"
            class="welcome-username-status"
            :class="`is-${importUsernameStatus.state}`"
            aria-live="polite"
          >
            {{ importUsernameStatus.message }}
          </small>
        </label>
        <p v-if="profileImportError" class="welcome-error-msg" role="alert">
          <AlertCircle :size="14" />
          {{ profileImportError }}
        </p>
        <footer class="welcome-import-dialog-actions">
          <button
            ref="cancelProfileImportButton"
            type="button"
            class="welcome-button welcome-button-secondary"
            :disabled="isImportingProfile"
            @click="cancelProfileImport"
          >
            Cancelar
          </button>
          <button
            v-if="pendingProfileImport.type === 'overwrite'"
            type="button"
            class="welcome-button welcome-button-danger"
            :disabled="isImportingProfile"
            @click="confirmOverwriteProfile"
          >
            <LoaderCircle
              v-if="isImportingProfile"
              :size="17"
              class="welcome-spinner"
            />
            <span>{{ isImportingProfile ? "Restaurando..." : "Sobrescribir perfil" }}</span>
          </button>
          <button
            v-else-if="pendingProfileImport.type === 'username-conflict' || pendingProfileImport.type === 'username-required' || pendingProfileImport.type === 'overwrite-username-required'"
            type="button"
            class="welcome-button welcome-button-primary"
            :disabled="isImportingProfile || !importUsernameStatus.available"
            @click="confirmImportWithUsername"
          >
            <LoaderCircle v-if="isImportingProfile" :size="17" class="welcome-spinner" />
            <span>
              {{
                isImportingProfile
                  ? (pendingProfileImport.type === "overwrite-username-required" ? "Restaurando..." : "Importando...")
                  : (pendingProfileImport.type === "overwrite-username-required" ? "Sobrescribir perfil" : "Importar perfil")
              }}
            </span>
          </button>
        </footer>
      </section>
    </div>
  </section>
</template>

<script setup>
import {
  computed,
  nextTick,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { useRouter } from "vue-router";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Database,
  FolderOpen,
  LoaderCircle,
  Lock,
  MonitorOff,
  ShieldCheck,
  User,
  UserPlus,
} from "lucide-vue-next";

import { Capacitor } from "@capacitor/core";

import Logo from "../common/Logo.vue";
import GoogleDriveProfile from "../common/GoogleDriveProfile.vue";
import { useLibraryStore } from "../../stores/libraryStore";
import { useUserStore } from "../../stores/userStore";
import { COLOR_PALETTES, normalizePaletteId } from "../../lib/colorPalettes.js";
import {
  importProfileArchive,
  MAX_PROFILE_ARCHIVE_BYTES,
  validateProfileArchive,
} from "../../services/profileArchives.js";
import {
  findUsernameOwner,
  inspectProfileIdentity,
  validateUsername,
} from "../../lib/profileIdentity.js";

const library = useLibraryStore();
const user = useUserStore();
const router = useRouter();

const currentStep = ref(1);
const selectingFolder = ref(false);

const viewMode = ref("choice");
const selectedProfileId = ref(null);
const driveProfileId = ref("");
const unlockingProfile = ref(null);
const unlockPassword = ref("");
const unlockError = ref("");
const isUnlocking = ref(false);
const isCreatingProfile = ref(false);
const createPasswordError = ref("");
const profileImportInput = ref(null);
const profileImportButton = ref(null);
const cancelProfileImportButton = ref(null);
const isImportingProfile = ref(false);
const profileImportStage = ref("Leyendo y validando el archivo…");
const PROFILE_IMPORT_MIN_LOADING_MS = 1000;
const profileImportError = ref("");
const profileImportMessage = ref("");
const pendingProfileImport = ref(null);
const selectedDriveProfile = computed(() =>
  user.profilesList.find((item) => item.id === driveProfileId.value) || null,
);

const steps = [
  {
    id: 1,
    label: "Perfil",
  },
  {
    id: 2,
    label: "Apariencia",
  },
  {
    id: 3,
    label: "Biblioteca",
  },
];

const draft = reactive({
  username: "",
  displayName: "",
  bio: "",
  isPrivate: false,
  password: "",
  confirmPassword: "",
});

function getProfileInitials(p) {
  const source = p.displayName || p.name || p.username || "C";
  const parts = source.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "C";
}

function startCreatingProfile() {
  draft.displayName = "";
  draft.username = "";
  draft.bio = "";
  draft.isPrivate = false;
  draft.password = "";
  draft.confirmPassword = "";
  createPasswordError.value = "";
  unlockingProfile.value = null;
  viewMode.value = "create";
}

function cancelCreate() {
  viewMode.value = "choice";
  createPasswordError.value = "";
}

const isNativeApp = computed(() => {
  return Capacitor.isNativePlatform();
});

const isMobile = computed(() => {
  if (isNativeApp.value) {
    return false;
  }

  if (typeof navigator === "undefined") {
    return false;
  }

  return /Android|iPhone|iPad|iPod/i.test(
    navigator.userAgent
  );
});

const isSupported = computed(() => {
  if (isNativeApp.value) {
    return true;
  }

  return (
    typeof window !== "undefined" &&
    "showDirectoryPicker" in window
  );
});

const hasProfile = computed(() => {
  return Boolean(
    user.profile.displayName?.trim() ||
    user.profile.username?.trim()
  );
});

const welcomeName = computed(() => {
  return (
    user.profile.displayName?.trim() ||
    user.profile.username?.trim() ||
    ""
  );
});

const draftInitials = computed(() => {
  const name =
    draft.displayName.trim() ||
    draft.username.trim();

  if (!name) {
    return "C";
  }

  const parts = name
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    parts[0][0] +
    parts[parts.length - 1][0]
  ).toUpperCase();
});

const selectedPalette = computed(() => {
  const current =
    user.profile.id && user.profile.id !== "guest"
      ? user.profile.accentColor
      : user.pendingPreferences.accentColor;

  return (
    COLOR_PALETTES.find(
      palette => palette.value === normalizePaletteId(current)
    ) ||
    COLOR_PALETTES[0]
  );
});

const draftUsernameStatus = computed(() => {
  const validation = validateUsername(draft.username);
  if (!draft.username.trim()) {
    return { state: "invalid", message: "El nombre de usuario es obligatorio.", available: false };
  }
  if (!validation.valid) {
    return { state: "invalid", message: validation.reason, available: false };
  }
  const owner = findUsernameOwner(validation.username, user.profilesList);
  if (owner) {
    return { state: "used", message: `@${validation.username} ya está en uso.`, available: false };
  }
  return {
    state: "available",
    username: validation.username,
    message: `@${validation.username} está disponible.`,
    available: true,
  };
});

const importUsernameStatus = computed(() => {
  const pending = pendingProfileImport.value;
  const validation = validateUsername(pending?.usernameDraft || "");
  if (!pending?.usernameDraft?.trim()) {
    return { state: "invalid", message: "El nombre de usuario es obligatorio.", available: false };
  }
  if (!validation.valid) {
    return { state: "invalid", message: validation.reason, available: false };
  }
  const owner = findUsernameOwner(validation.username, user.profilesList);
  if (owner) {
    return { state: "used", message: `@${validation.username} ya está en uso.`, available: false };
  }
  return {
    state: "available",
    username: validation.username,
    message: `@${validation.username} está disponible.`,
    available: true,
  };
});

function isPaletteSelected(value) {
  if (user.profile.id && user.profile.id !== "guest") {
    return user.profile.accentColor === value;
  }

  return user.pendingPreferences.accentColor === value;
}

const selectedAccentLabel = computed(() => selectedPalette.value.label);

function goToNextStep() {
  if (currentStep.value < steps.length) {
    currentStep.value += 1;
  }
}

function goToPreviousStep() {
  if (currentStep.value > 1) {
    currentStep.value -= 1;
  }
}

async function onSelectProfile(p) {
  const isPrivate = Boolean(p.private !== undefined ? p.private : p.isPrivate);
  if (isPrivate) {
    unlockingProfile.value = p;
    selectedProfileId.value = p.id;
    unlockPassword.value = "";
    unlockError.value = "";
    return;
  }

  selectedProfileId.value = p.id;
  const res = await user.loginProfile(p.id);
  if (res.success) {
    router.push("/");
  }
}

async function confirmUnlock() {
  if (!unlockingProfile.value || !unlockPassword.value) return;
  isUnlocking.value = true;
  unlockError.value = "";
  try {
    const res = await user.loginProfile(
      unlockingProfile.value.id,
      unlockPassword.value
    );
    if (res.success) {
      router.push("/");
    } else {
      unlockError.value = res.error || "Contraseña incorrecta";
    }
  } catch (err) {
    unlockError.value = "Error al verificar la contraseña";
  } finally {
    isUnlocking.value = false;
  }
}

async function continueAsGuest() {
  user.clearPendingPreferences();
  await user.startGuestSession();
  router.push("/");
}

async function submitNewProfile() {
  createPasswordError.value = "";
  const displayName = draft.displayName.trim();
  if (!displayName) {
    createPasswordError.value = "El nombre es obligatorio";
    return;
  }
  if (!draftUsernameStatus.value.available) {
    createPasswordError.value = draftUsernameStatus.value.message;
    return;
  }

  if (draft.isPrivate) {
    if (!draft.password || draft.password.length < 4) {
      createPasswordError.value =
        "La contraseña debe tener al menos 4 caracteres";
      return;
    }
    if (draft.password !== draft.confirmPassword) {
      createPasswordError.value = "Las contraseñas no coinciden";
      return;
    }
  }

  isCreatingProfile.value = true;
  try {
    await user.createProfile({
      displayName,
      name: displayName,
      username: draftUsernameStatus.value.username || draft.username.trim(),
      bio: draft.bio.trim(),
      isPrivate: draft.isPrivate,
      password: draft.password,
    });

    if (!library.folderHandle) {
      goToNextStep();
    }
  } catch (err) {
    createPasswordError.value = err?.message || "No se pudo crear el perfil local";
  } finally {
    isCreatingProfile.value = false;
  }
}

async function selectPalette(value) {
  if (selectedPalette.value.value !== value) {
    document.documentElement.classList.add("theme-has-changed");
  }

  if (
    user.profile.id === "guest" ||
    !user.profile.id
  ) {
    // Aún no existe perfil: guardamos la elección para aplicarla
    // al crear el perfil o al entrar como invitado.
    user.setPendingPreferences({ accentColor: value });
    user.applyPreferences();
    return;
  }

  if (user.profile.accentColor === value) {
    return;
  }

  await user.updateProfile({ accentColor: value });
}

async function selectFolder() {
  if (selectingFolder.value) {
    return;
  }

  selectingFolder.value = true;

  try {
    await library.selectFolder();
    router.push("/");
  } catch (error) {
    console.error(
      "[WelcomeScreen] No se pudo seleccionar la carpeta:",
      error
    );
  } finally {
    selectingFolder.value = false;
  }
}

function enterApp() {
  router.push("/");
}

watch(pendingProfileImport, async (pending) => {
  if (pending) {
    await nextTick();
    cancelProfileImportButton.value?.focus();
  }
});

watch(
  () => user.profilesList.map((item) => item.id),
  (profileIds) => {
    if (!profileIds.includes(driveProfileId.value)) {
      driveProfileId.value = profileIds[0] || "";
    }
  },
);

function cancelProfileImport() {
  if (isImportingProfile.value) return;
  pendingProfileImport.value = null;
  nextTick(() => profileImportButton.value?.focus());
}

async function saveImportedProfile(archive, {
  mode,
  targetProfileId = null,
  preserveSourceId = false,
} = {}) {
  if (isImportingProfile.value) return;
  const loadingStartedAt = Date.now();
  isImportingProfile.value = true;
  profileImportStage.value = "Restaurando listas, historial y preferencias…";
  profileImportError.value = "";
  profileImportMessage.value = "";
  let saved = false;
  try {
    const result = await importProfileArchive(archive, {
      mode,
      targetProfileId,
      preserveSourceId,
      currentSongs: library.songs,
      currentAlbums: library.albums,
    });
    saved = true;
    profileImportStage.value = "Preparando el perfil restaurado…";
    pendingProfileImport.value = null;
    await user.loadProfiles();

    const importedProfile = user.profilesList.find((item) => item.id === result.profileId);
    if (user.currentSession?.profileId === result.profileId) {
      profileImportStage.value = "Activando el perfil…";
      await user.reloadActiveProfile(result.profileId);
      await holdImportLoadingScreen(loadingStartedAt);
      router.push("/");
      return;
    }
    if (importedProfile?.private ?? importedProfile?.isPrivate) {
      await holdImportLoadingScreen(loadingStartedAt);
      unlockingProfile.value = importedProfile;
      selectedProfileId.value = importedProfile.id;
      unlockPassword.value = "";
      unlockError.value = "";
      profileImportMessage.value = "Los datos se restauraron. Introduce la contraseña para activar el perfil.";
      return;
    }

    profileImportStage.value = "Activando el perfil…";
    const login = await user.loginProfile(result.profileId);
    if (!login.success) {
      throw new Error(login.error || "No se pudo activar el perfil restaurado.");
    }
    await holdImportLoadingScreen(loadingStartedAt);
    router.push("/");
  } catch (error) {
    profileImportError.value = saved
      ? `Los datos se guardaron, pero no se pudo activar el perfil: ${error?.message || "error desconocido"}`
      : error?.message || "No se pudo importar el perfil.";
  } finally {
    await holdImportLoadingScreen(loadingStartedAt);
    isImportingProfile.value = false;
  }
}

function holdImportLoadingScreen(startedAt) {
  const remaining = PROFILE_IMPORT_MIN_LOADING_MS - (Date.now() - startedAt);
  return remaining > 0
    ? new Promise((resolve) => setTimeout(resolve, remaining))
    : Promise.resolve();
}

function confirmOverwriteProfile() {
  const pending = pendingProfileImport.value;
  if (!pending || isImportingProfile.value) return;
  return saveImportedProfile(pending.archive, {
    mode: "update",
    targetProfileId: pending.profileId,
  });
}

function confirmImportWithUsername() {
  const pending = pendingProfileImport.value;
  if (!pending || isImportingProfile.value || !importUsernameStatus.value.available) return;
  const archive = {
    ...pending.archive,
    profile: {
      ...pending.archive.profile,
      username: importUsernameStatus.value.username,
    },
  };
  const isOverwrite = pending.type === "overwrite-username-required";
  return saveImportedProfile(archive, {
    mode: isOverwrite ? "update" : "new",
    targetProfileId: isOverwrite ? pending.profileId : null,
    preserveSourceId: !isOverwrite,
  });
}

async function importProfile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  profileImportError.value = "";
  profileImportMessage.value = "";
  if (!file) return;

  const loadingStartedAt = Date.now();
  isImportingProfile.value = true;
  profileImportStage.value = "Leyendo y validando el archivo…";
  try {
    if (file.size > MAX_PROFILE_ARCHIVE_BYTES) {
      throw new Error("El archivo supera el límite de 25 MiB.");
    }

    const parsed = JSON.parse(await file.text());
    const { archive } = validateProfileArchive(parsed);
    const identity = inspectProfileIdentity(archive.profile, user.profilesList);

    if (identity.type === "split-identity") {
      pendingProfileImport.value = {
        type: "split-identity",
        archive,
        profileId: identity.idOwner.id,
        profileName: identity.idOwner.displayName || identity.idOwner.name,
        conflictingProfileName: identity.usernameOwner.displayName || identity.usernameOwner.name,
        conflictingUsername: identity.usernameOwner.username,
      };
      return;
    }

    if (identity.type === "id-match") {
      const ownerUsername = identity.idOwner.username || "";
      if (!archive.profile.username && !ownerUsername) {
        pendingProfileImport.value = {
          type: "overwrite-username-required",
          archive,
          profileId: identity.idOwner.id,
          profileName: identity.idOwner.displayName || identity.idOwner.name || archive.profile.name,
          usernameDraft: "",
        };
        return;
      }
      const restoredArchive = {
        ...archive,
        profile: {
          ...archive.profile,
          username: archive.profile.username || ownerUsername,
        },
      };
      pendingProfileImport.value = {
        type: "overwrite",
        archive: restoredArchive,
        profileId: identity.idOwner.id,
        profileName: identity.idOwner.displayName || identity.idOwner.name || archive.profile.name,
        username: restoredArchive.profile.username,
      };
      return;
    }

    if (identity.type === "username-match" || identity.type === "username-required") {
      pendingProfileImport.value = {
        type: identity.type,
        archive,
        usernameDraft: "",
        conflictingUsername: identity.usernameOwner?.username || "",
        conflictingProfileName: identity.usernameOwner?.displayName || identity.usernameOwner?.name || "",
      };
      return;
    }

    isImportingProfile.value = false;
    await saveImportedProfile(archive, {
      mode: "new",
      preserveSourceId: true,
    });
  } catch (error) {
    profileImportError.value = error?.message || "No se pudo importar el perfil.";
  } finally {
    await holdImportLoadingScreen(loadingStartedAt);
    isImportingProfile.value = false;
    profileImportStage.value = "Leyendo y validando el archivo…";
  }
}

onMounted(async () => {
  try {
    await user.load();
    if (!driveProfileId.value) {
      driveProfileId.value = user.profilesList[0]?.id || "";
    }

    if (user.hasSession) {
      router.push("/");
      return;
    }

    viewMode.value = "choice";
  } catch (error) {
    console.error(
      "[WelcomeScreen] No se pudieron cargar los perfiles:",
      error
    );
  }
});
</script>