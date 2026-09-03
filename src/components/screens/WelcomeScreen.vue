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
        >
          <!-- MODO: LISTA DE PERFILES EXISTENTES -->
          <template v-if="viewMode === 'list'">
            <div class="welcome-heading">
              <span class="welcome-eyebrow">
                Perfiles locales
              </span>

              <h1>
                Elige tu perfil.
              </h1>

              <p>
                Selecciona tu perfil para cargar tu música y preferencias en este dispositivo.
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

            <div class="welcome-actions welcome-actions-column">
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
                  class="welcome-button welcome-button-ghost"
                  @click="continueAsGuest"
                >
                  <User :size="17" />
                  Continuar como invitado
                </button>
              </div>
            </div>
          </template>

          <!-- MODO: CREAR PERFIL LOCAL -->
          <template v-else>
            <button
              v-if="user.profilesList.length > 0"
              type="button"
              class="welcome-back"
              @click="cancelCreate"
            >
              <ArrowLeft :size="17" />
              Volver a perfiles
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
                  Usuario
                  <em>opcional</em>
                </span>
                <input
                  v-model="draft.username"
                  type="text"
                  maxlength="30"
                  autocomplete="username"
                  placeholder="tu_usuario"
                />
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
                  :disabled="isCreatingProfile"
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

                <button
                  type="button"
                  class="welcome-button welcome-button-ghost"
                  @click="continueAsGuest"
                >
                  <User :size="17" />
                  Continuar como invitado
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
              Elige tu color.
            </h1>

            <p>
              Personaliza el color de Calliope.
              Podrás cambiarlo más adelante desde tu perfil.
            </p>
          </div>

          <div class="welcome-accent-card">
            <div class="welcome-accent-header">
              <div>
                <strong>
                  Color de acento
                </strong>

                <span>
                  {{ selectedAccentLabel }}
                </span>
              </div>

              <span
                class="welcome-accent-current"
                :style="{
                  backgroundColor: selectedAccentColor
                }"
              ></span>
            </div>

            <div class="welcome-accent-options">
              <button
                v-for="option in ACCENT_OPTIONS"
                :key="option.value"
                type="button"
                class="welcome-accent-option"
                :class="{
                  selected:
                    user.profile.accentColor === option.value
                }"
                :style="{
                  '--option-color': option.color
                }"
                :aria-label="`Usar color ${option.label}`"
                :aria-pressed="
                  user.profile.accentColor === option.value
                "
                @click="selectAccent(option.value)"
              >
                <span class="welcome-accent-dot"></span>

                <Check
                  v-if="
                    user.profile.accentColor === option.value
                  "
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
  </section>
</template>

<script setup>
import {
  computed,
  onMounted,
  reactive,
  ref,
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
import { useLibraryStore } from "../../stores/libraryStore";
import { useUserStore } from "../../stores/userStore";

const library = useLibraryStore();
const user = useUserStore();
const router = useRouter();

const currentStep = ref(1);
const selectingFolder = ref(false);

const viewMode = ref("list"); // 'list' | 'create'
const selectedProfileId = ref(null);
const unlockingProfile = ref(null);
const unlockPassword = ref("");
const unlockError = ref("");
const isUnlocking = ref(false);
const isCreatingProfile = ref(false);
const createPasswordError = ref("");

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

const ACCENT_OPTIONS = [
  {
    value: "neon",
    label: "Neón",
    color: "#25d866",
  },
  {
    value: "cyan",
    label: "Cian",
    color: "#22d3ee",
  },
  {
    value: "magenta",
    label: "Magenta",
    color: "#e14eca",
  },
  {
    value: "amber",
    label: "Ámbar",
    color: "#fbbf24",
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
  if (user.profilesList.length > 0) {
    viewMode.value = "list";
    createPasswordError.value = "";
  }
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

const selectedAccent = computed(() => {
  return (
    ACCENT_OPTIONS.find(
      option =>
        option.value === user.profile.accentColor
    ) ||
    ACCENT_OPTIONS[0]
  );
});

const selectedAccentLabel = computed(() => {
  return selectedAccent.value.label;
});

const selectedAccentColor = computed(() => {
  return selectedAccent.value.color;
});

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
      username: draft.username.trim(),
      bio: draft.bio.trim(),
      isPrivate: draft.isPrivate,
      password: draft.password,
    });

    if (!library.folderHandle) {
      goToNextStep();
    }
  } catch (err) {
    createPasswordError.value = "No se pudo crear el perfil local";
  } finally {
    isCreatingProfile.value = false;
  }
}

async function selectAccent(value) {
  if (user.profile.accentColor === value) {
    return;
  }

  await user.updateProfile({
    accentColor: value,
  });
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

onMounted(async () => {
  try {
    await user.load();

    if (user.hasSession) {
      router.push("/");
      return;
    }

    if (user.profilesList.length === 0) {
      viewMode.value = "create";
    } else {
      viewMode.value = "list";
    }
  } catch (error) {
    console.error(
      "[WelcomeScreen] No se pudieron cargar los perfiles:",
      error
    );
  }
});
</script>