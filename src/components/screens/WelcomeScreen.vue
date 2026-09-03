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
          <div class="welcome-heading">
            <span class="welcome-eyebrow">
              {{ hasProfile ? "Bienvenido de nuevo" : "Bienvenido" }}
            </span>

            <h1>
              {{
                hasProfile
                  ? `Hola${welcomeName ? `, ${welcomeName}` : ""}.`
                  : "Haz que Calliope sea tuyo."
              }}
            </h1>

            <p>
              {{
                hasProfile
                  ? "Hemos encontrado tu perfil en este dispositivo."
                  : "Personaliza tu experiencia antes de añadir tu biblioteca musical."
              }}
            </p>
          </div>

          <!-- PERFIL EXISTENTE -->
          <div
            v-if="hasProfile"
            class="welcome-profile-card"
          >
            <div class="welcome-avatar">
              <img
                v-if="user.avatarUrl"
                :src="user.avatarUrl"
                alt=""
              />

              <span v-else>
                {{ user.initials }}
              </span>
            </div>

            <div class="welcome-profile-info">
              <strong>
                {{
                  user.profile.displayName ||
                  user.profile.username
                }}
              </strong>

              <span v-if="user.profile.username">
                @{{ user.profile.username }}
              </span>

              <small>
                Perfil guardado en este dispositivo
              </small>
            </div>

            <Check
              class="welcome-profile-check"
              :size="18"
            />
          </div>

          <!-- CREAR PERFIL -->
          <form
            v-else
            class="welcome-form"
            @submit.prevent="continueFromProfile"
          >
            <div class="welcome-form-avatar">
              {{ draftInitials }}
            </div>

            <label>
              <span>Nombre</span>

              <input
                v-model="draft.displayName"
                type="text"
                maxlength="40"
                autocomplete="name"
                placeholder="Tu nombre"
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
          </form>

          <div class="welcome-actions">
            <button
              type="button"
              class="welcome-button welcome-button-primary"
              @click="continueFromProfile"
            >
              {{ hasProfile ? "Continuar" : "Crear perfil" }}

              <ArrowRight :size="18" />
            </button>

            <button
              type="button"
              class="welcome-button welcome-button-secondary"
              @click="skipProfile"
            >
              {{ hasProfile ? "Continuar sin cambios" : "Ahora no" }}
            </button>
          </div>
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

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Database,
  FolderOpen,
  LoaderCircle,
  MonitorOff,
  ShieldCheck,
} from "lucide-vue-next";

import { Capacitor } from "@capacitor/core";

import Logo from "../common/Logo.vue";
import { useLibraryStore } from "../../stores/libraryStore";
import { useUserStore } from "../../stores/userStore";

const library = useLibraryStore();
const user = useUserStore();

const currentStep = ref(1);
const selectingFolder = ref(false);

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
});

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

async function continueFromProfile() {
  if (!hasProfile.value) {
    const username =
      draft.username.trim();

    const displayName =
      draft.displayName.trim();

    const bio =
      draft.bio.trim();

    if (username || displayName) {
      await user.updateProfile({
        username,
        displayName,
        bio,
      });
    }
  }

  goToNextStep();
}

function skipProfile() {
  goToNextStep();
}

async function selectAccent(value) {
  if (
    user.profile.accentColor === value
  ) {
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
  } catch (error) {
    console.error(
      "[WelcomeScreen] No se pudo seleccionar la carpeta:",
      error
    );
  } finally {
    selectingFolder.value = false;
  }
}

onMounted(async () => {
  try {
    await user.load();

    draft.username =
      user.profile.username || "";

    draft.displayName =
      user.profile.displayName || "";

    draft.bio =
      user.profile.bio || "";
  } catch (error) {
    console.error(
      "[WelcomeScreen] No se pudo cargar el perfil:",
      error
    );
  }
});
</script>