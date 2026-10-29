<template>
  <section v-if="profile?.id && profile.id !== 'guest'" class="google-drive-panel" aria-labelledby="google-drive-title">
    <header class="google-drive-header">
      <div>
        <h3 id="google-drive-title">Google Drive</h3>
        <p>Vinculación independiente para {{ profile.displayName || profile.name }}.</p>
      </div>
      <Cloud :size="21" aria-hidden="true" />
    </header>

    <p v-if="locked" class="google-drive-message is-error" role="status">
      Este perfil está protegido. Inicia sesión con su contraseña y administra Google Drive desde Perfil → Ajustes.
    </p>
    <p v-else-if="isNative" class="google-drive-message is-error" role="status">
      Google Identity Services no permite autorizar esta integración dentro de la WebView de Android. Usa Calliope en un navegador web.
    </p>
    <p v-else-if="!isConfigured" class="google-drive-message is-error" role="status">
      Google Drive no está configurado. Define VITE_GOOGLE_CLIENT_ID y vuelve a compilar.
    </p>
    <p v-else-if="!isNative && !authReady" class="google-drive-message" role="status">
      {{ authError ? "No se pudo preparar la autorización de Google." : "Preparando la autorización segura de Google…" }}
    </p>
    <button
      v-if="authError && !locked"
      type="button"
      class="google-drive-button google-drive-button-muted"
      @click="initialize"
    >
      Reintentar preparación
    </button>

    <div v-if="!locked && driveLink?.accountId" class="google-drive-account">
      <div class="google-drive-account-copy">
        <strong>{{ driveLink.email || driveLink.displayName || "Cuenta de Google vinculada" }}</strong>
        <small>Solo este perfil utiliza esta vinculación. Los tokens no se guardan; Google puede solicitar autorización de nuevo.</small>
      </div>
      <button
        type="button"
        class="google-drive-button google-drive-button-muted"
        :disabled="busy !== '' || !isConfigured || isNative || !authReady"
        @click="connect"
      >
        {{ busy === "connect" ? "Autorizando…" : "Reautorizar" }}
      </button>
    </div>
    <p v-else-if="!locked" class="google-drive-message">
      Conecta una cuenta para guardar y restaurar manualmente {{ expectedFileName || "el archivo de perfil" }} en Drive. No se subirá nada al conectar.
    </p>
    <p v-if="!locked && driveLink?.fileName && expectedFileName && driveLink.fileName !== expectedFileName" class="google-drive-message">
      El archivo remoto se llama {{ driveLink.fileName }}. Al guardar manualmente, Calliope actualizará ese mismo archivo por su ID y lo renombrará a {{ expectedFileName }} tras validar la identidad.
    </p>

    <div v-if="!locked" class="google-drive-actions">
      <button
        v-if="!driveLink?.accountId"
        type="button"
        class="google-drive-button google-drive-button-primary"
        :disabled="busy !== '' || !isConfigured || isNative || !authReady"
        @click="connect"
      >
        <LoaderCircle v-if="busy === 'connect'" :size="16" class="google-drive-spinner" />
        <Cloud v-else :size="16" />
        {{ busy === "connect" ? "Conectando…" : "Conectar Google Drive" }}
      </button>
      <template v-else>
        <button
          type="button"
          class="google-drive-button google-drive-button-primary"
          :disabled="busy !== '' || !isConfigured || isNative || !authReady"
          @click="saveToDrive"
        >
          <LoaderCircle v-if="busy === 'save'" :size="16" class="google-drive-spinner" />
          <CloudUpload v-else :size="16" />
          {{ busy === "save" ? "Guardando en Drive…" : "Guardar perfil en Drive" }}
        </button>
        <button
          type="button"
          class="google-drive-button google-drive-button-muted"
          :disabled="busy !== '' || !isConfigured || isNative || !authReady"
          @click="loadFromDrive"
        >
          <LoaderCircle v-if="busy === 'download'" :size="16" class="google-drive-spinner" />
          <CloudDownload v-else :size="16" />
          {{ busy === "download" ? "Descargando…" : "Restaurar desde Drive" }}
        </button>
        <button
          type="button"
          class="google-drive-button google-drive-button-danger"
          :disabled="busy !== ''"
          title="Desvincula este perfil sin borrar el archivo de Drive"
          @click="disconnect"
        >
          Desvincular
        </button>
      </template>
    </div>

    <div v-if="!locked && driveLink?.profileFolderName && driveLink.profileFolderName !== visibleName" class="google-drive-rename">
      <p>
        La carpeta remota sigue llamándose <strong>{{ driveLink.profileFolderName }}</strong>.
        No se renombra automáticamente.
      </p>
      <button
        type="button"
        class="google-drive-button google-drive-button-muted"
        :disabled="busy !== '' || !isConfigured || isNative || !authReady"
        @click="renameRemoteFolder"
      >
        Cambiar nombre de carpeta remota
      </button>
    </div>

    <p v-if="!locked && driveLink?.lastSavedAt" class="google-drive-last-saved">
      Último guardado confirmado: {{ formatDate(driveLink.lastSavedAt) }}
    </p>
    <p v-if="message" class="google-drive-message" :class="{ 'is-error': messageType === 'error' }" role="status" aria-live="polite">
      {{ message }}
    </p>

    <div v-if="pendingArchive" class="google-drive-confirm-backdrop">
      <section class="google-drive-confirm" role="dialog" aria-modal="true" aria-labelledby="google-drive-confirm-title">
        <h3 id="google-drive-confirm-title">Restaurar perfil desde Google Drive</h3>
        <p>
          Se reemplazarán las preferencias, listas, favoritos, historial, métricas y valoraciones locales de
          <strong>{{ visibleName }}</strong>. La biblioteca de música compartida y otros perfiles no cambiarán.
        </p>
        <dl>
          <div><dt>Perfil remoto</dt><dd>{{ pendingArchive.profile.name }}</dd></div>
          <div><dt>Nombre de usuario</dt><dd>@{{ pendingArchive.profile.username }}</dd></div>
          <div><dt>Playlists</dt><dd>{{ pendingArchive.playlists.length }}</dd></div>
          <div><dt>Entradas de historial</dt><dd>{{ pendingArchive.history.length }}</dd></div>
          <div><dt>Formato</dt><dd>{{ pendingArchive.format }} v{{ pendingArchive.formatVersion }}</dd></div>
        </dl>
        <div class="google-drive-confirm-actions">
          <button type="button" class="google-drive-button google-drive-button-muted" :disabled="busy !== ''" @click="pendingArchive = null">
            Cancelar
          </button>
          <button type="button" class="google-drive-button google-drive-button-danger" :disabled="busy !== ''" @click="confirmRestore">
            <LoaderCircle v-if="busy === 'restore'" :size="16" class="google-drive-spinner" />
            {{ busy === "restore" ? "Restaurando…" : "Reemplazar datos locales" }}
          </button>
        </div>
      </section>
    </div>
    <div v-if="pendingCreateConfirmation" class="google-drive-confirm-backdrop">
      <section class="google-drive-confirm" role="dialog" aria-modal="true" aria-labelledby="google-drive-create-title">
        <h3 id="google-drive-create-title">Confirmar primera copia en Drive</h3>
        <p>
          El permiso limitado drive.file no permite descubrir elementos creados manualmente que nunca se hayan compartido con Calliope.
          Revisa <strong>Calliope/profiles/{{ visibleName }}/{{ expectedFileName || "profile_data.json" }}</strong> en Drive. Si algún elemento de esa ruta existe pero no es visible,
          continuar puede crear otro con el mismo nombre.
        </p>
        <div class="google-drive-confirm-actions">
          <button type="button" class="google-drive-button google-drive-button-muted" :disabled="busy !== ''" @click="pendingCreateConfirmation = false">
            Cancelar
          </button>
          <button type="button" class="google-drive-button google-drive-button-primary" :disabled="busy !== ''" @click="confirmCreateRoot">
            Confirmar y continuar
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { Cloud, CloudDownload, CloudUpload, LoaderCircle } from "lucide-vue-next";
import { Capacitor } from "@capacitor/core";
import { useUserStore } from "../../stores/userStore.js";
import { useLibraryStore } from "../../stores/libraryStore.js";
import { inspectProfileIdentity, normalizeUsername } from "../../lib/profileIdentity.js";
import {
  importProfileArchive,
  validateProfileArchive,
} from "../../services/profileArchives.js";
import {
  connectGoogleDrive,
  authorizeGoogleDriveProfile,
  disconnectGoogleDrive,
  downloadProfileArchiveFromDrive,
  getProfileDriveLink,
  isGoogleDriveConfigured,
  prepareGoogleDriveAuth,
  renameDriveProfileFolder,
  saveProfileArchiveToDrive,
  validateDriveProfileArchiveIdentity,
} from "../../services/googleDriveProfiles.js";

const props = defineProps({
  profile: { type: Object, required: true },
  locked: { type: Boolean, default: false },
});

const user = useUserStore();
const library = useLibraryStore();
const driveLink = ref(null);
const busy = ref("");
const authReady = ref(false);
const authError = ref(false);
const message = ref("");
const messageType = ref("");
const pendingArchive = ref(null);
const pendingCreateConfirmation = ref(false);
const isNative = Capacitor.isNativePlatform();
const isConfigured = isGoogleDriveConfigured();
const visibleName = computed(() => props.profile.displayName || props.profile.name || "Perfil");
const expectedFileName = computed(() => {
  const username = normalizeUsername(props.profile.username);
  return username ? `${username}_profile_data.json` : "";
});

function showMessage(text, type = "success") {
  message.value = text;
  messageType.value = type;
}

async function loadLink() {
  const profileId = props.profile?.id;
  if (!profileId || profileId === "guest") {
    driveLink.value = null;
    return;
  }
  try {
    const link = await getProfileDriveLink(profileId);
    if (props.profile.id === profileId) driveLink.value = link;
  } catch (error) {
    if (props.profile.id === profileId) {
      showMessage(`No se pudo leer la vinculación local de Drive: ${error.message}`, "error");
    }
  }
}

async function initialize() {
  const profileId = props.profile.id;
  authReady.value = false;
  authError.value = false;
  driveLink.value = null;
  message.value = "";
  if (props.locked) return;
  await loadLink();
  if (props.profile.id !== profileId) return;
  if (!isConfigured || isNative) return;
  try {
    await prepareGoogleDriveAuth();
    if (props.profile.id === profileId) authReady.value = true;
  } catch (error) {
    authError.value = true;
    showMessage(error.message || "No se pudo preparar la autorización de Google.", "error");
  }
}

async function connect() {
  if (busy.value) return;
  busy.value = "connect";
  message.value = "";
  try {
    driveLink.value = await connectGoogleDrive(props.profile.id);
    showMessage(`Cuenta vinculada: ${driveLink.value.email || driveLink.value.displayName || "Google Drive"}. No se ha subido ningún archivo.`);
  } catch (error) {
    showMessage(error.message || "No se pudo conectar Google Drive.", "error");
  } finally {
    busy.value = "";
  }
}

async function disconnect() {
  if (busy.value) return;
  busy.value = "disconnect";
  message.value = "";
  try {
    await disconnectGoogleDrive(props.profile.id);
    driveLink.value = null;
    showMessage("Cuenta desvinculada de este perfil. No se borraron archivos ni datos; el permiso de Google puede revocarse desde los ajustes de tu cuenta.");
  } catch (error) {
    showMessage(error.message || "No se pudo desvincular la cuenta.", "error");
  } finally {
    busy.value = "";
  }
}

async function saveToDrive(confirmCreateRoot = false) {
  if (busy.value) return;
  busy.value = "save";
  message.value = "";
  pendingCreateConfirmation.value = false;
  try {
    await authorizeGoogleDriveProfile(props.profile.id);
    if (user.currentSession?.profileId === props.profile.id) {
      const saved = await user.save();
      if (!saved) throw new Error("No se pudieron guardar primero los cambios locales pendientes.");
      await library.flushPendingProfileChanges(props.profile.id);
    }
    const result = await saveProfileArchiveToDrive(props.profile, { confirmCreateStructure: confirmCreateRoot });
    await loadLink();
    showMessage(result.updated
      ? `El archivo ${result.fileName} existente se actualizó correctamente${result.renamed ? " y se renombró" : ""} en Google Drive.`
      : `${result.fileName} se creó correctamente en Google Drive.`);
  } catch (error) {
    if (
      error.code === "drive-first-save-confirmation-required"
      || error.code === "drive-root-create-confirmation-required"
    ) {
      pendingCreateConfirmation.value = true;
      return;
    }
    showMessage(error.message || "No se pudo guardar el perfil en Google Drive.", "error");
  } finally {
    busy.value = "";
  }
}

function confirmCreateRoot() {
  if (busy.value) return;
  return saveToDrive(true);
}

async function loadFromDrive() {
  if (busy.value) return;
  const targetProfile = props.profile;
  busy.value = "download";
  message.value = "";
  try {
    const archive = validateProfileArchive(await downloadProfileArchiveFromDrive(targetProfile)).archive;
    if (props.profile.id !== targetProfile.id || props.locked) return;
    const identity = inspectProfileIdentity(archive.profile, user.profilesList);
    if (identity.type !== "id-match" || identity.idOwner?.id !== targetProfile.id) {
      throw new Error("Conflicto de identidad: el archivo de Drive no pertenece al ID interno de este perfil.");
    }
    if (normalizeUsername(archive.profile.username) !== normalizeUsername(targetProfile.username)) {
      throw new Error("Conflicto de identidad: el nombre de usuario del archivo remoto no coincide con el perfil local.");
    }
    pendingArchive.value = validateDriveProfileArchiveIdentity(archive, targetProfile);
  } catch (error) {
    showMessage(error.message || "No se pudo validar el perfil remoto. Los datos locales siguen intactos.", "error");
  } finally {
    busy.value = "";
  }
}

async function confirmRestore() {
  if (busy.value || !pendingArchive.value) return;
  const targetProfileId = props.profile.id;
  busy.value = "restore";
  message.value = "";
  let restored = false;
  try {
    if (props.locked || targetProfileId === "guest") {
      throw new Error("El perfil actual no está disponible para restaurar.");
    }
    if (user.currentSession?.profileId === targetProfileId) {
      const saved = await user.save();
      if (!saved) throw new Error("No se pudieron guardar primero los cambios locales pendientes.");
      await library.flushPendingProfileChanges(targetProfileId);
    }
    if (props.profile.id !== targetProfileId || props.locked) {
      throw new Error("El perfil seleccionado cambió; no se modificaron sus datos.");
    }
    const result = await importProfileArchive(pendingArchive.value, {
      mode: "update",
      targetProfileId,
      currentSongs: library.songs,
      currentAlbums: library.albums,
    });
    restored = true;
    pendingArchive.value = null;
    await user.loadProfiles();
    if (user.currentSession?.profileId === result.profileId) {
      await user.reloadActiveProfile(result.profileId);
    }
    showMessage("El perfil se restauró desde Google Drive. La biblioteca y los demás perfiles no se modificaron.");
    await loadLink();
  } catch (error) {
    showMessage(
      restored
        ? `El perfil se restauró, pero no se pudo actualizar su vista: ${error.message}`
        : error.message || "No se pudo restaurar el perfil. Los datos locales anteriores se conservaron.",
      "error",
    );
  } finally {
    busy.value = "";
  }
}

async function renameRemoteFolder() {
  if (busy.value) return;
  busy.value = "rename";
  message.value = "";
  try {
    await renameDriveProfileFolder(props.profile, visibleName.value);
    await loadLink();
    showMessage("La carpeta remota se renombró correctamente.");
  } catch (error) {
    showMessage(error.message || "No se pudo renombrar la carpeta remota.", "error");
  } finally {
    busy.value = "";
  }
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}

watch(
  () => [props.profile.id, props.locked],
  ([profileId], [previousProfileId]) => {
    if (profileId !== previousProfileId) {
      pendingArchive.value = null;
      pendingCreateConfirmation.value = false;
    }
    initialize();
  },
);
onMounted(initialize);
</script>
