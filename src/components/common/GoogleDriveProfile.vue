<template>
  <section v-if="profile?.id && profile.id !== 'guest'" class="google-drive-panel" aria-labelledby="google-drive-title">
    <header class="google-drive-header">
      <div>
        <h3 id="google-drive-title">Google Drive</h3>
      </div>
      <Cloud :size="21" aria-hidden="true" />
    </header>

    <p v-if="locked" class="google-drive-message is-error" role="status">
      Este perfil está protegido. Inicia sesión para gestionar la cuenta de Google.
    </p>
    <p v-else-if="isNative" class="google-drive-message is-error" role="status">
      Google Drive no está disponible en esta versión. Usa Calliope en un navegador web.
    </p>
    <p v-else-if="!isConfigured" class="google-drive-message is-error" role="status">
      Google Drive no está disponible ahora.
    </p>
    <p v-else-if="!isNative && !authReady" class="google-drive-message" role="status">
      {{ authError ? "No se pudo conectar con Google." : "Conectando con Google…" }}
    </p>
    <button
      v-if="authError && !locked"
      type="button"
      class="google-drive-button google-drive-button-muted"
      @click="initialize"
    >
      Intentar de nuevo
    </button>

    <div v-if="!locked && driveLink?.accountId" class="google-drive-account">
      <div class="google-drive-account-copy">
        <strong>{{ driveLink.email || driveLink.displayName || "Cuenta de Google vinculada" }}</strong>
        <small>Esta cuenta solo se usa en este perfil.</small>
      </div>
      <button
        type="button"
        class="google-drive-button google-drive-button-muted"
        :disabled="busy !== '' || !isConfigured || isNative || !authReady"
        @click="connect"
      >
        {{ busy === "connect" ? "Conectando…" : "Reconectar Google" }}
      </button>
    </div>
    <p v-else-if="!locked" class="google-drive-message">
      Conecta una cuenta para guardar una copia de tu perfil en Drive.
    </p>
    <p v-if="!locked && driveLink?.fileName && expectedFileName && driveLink.fileName !== expectedFileName" class="google-drive-message">
    La copia de Drive tiene un nombre distinto. Se actualizará al guardar el perfil.
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
        {{ busy === "connect" ? "Conectando…" : "Conectar Google" }}
      </button>
      <template v-else>
        <button
          type="button"
          class="google-drive-button google-drive-button-primary"
          :disabled="busy !== '' || !isConfigured || isNative || !authReady"
          @click="saveToDrive()"
        >
          <LoaderCircle v-if="busy === 'save'" :size="16" class="google-drive-spinner" />
          <CloudUpload v-else :size="16" />
          {{ busy === "save" ? "Guardando…" : "Guardar en Drive" }}
        </button>
        <button
          type="button"
          class="google-drive-button google-drive-button-muted"
          :disabled="busy !== '' || !isConfigured || isNative || !authReady || driveLink.initializationPending"
          @click="loadFromDrive"
        >
          <LoaderCircle v-if="busy === 'download'" :size="16" class="google-drive-spinner" />
          <CloudDownload v-else :size="16" />
          {{ busy === "download" ? "Restaurando…" : "Restaurar desde Drive" }}
        </button>
        <button
          type="button"
          class="google-drive-button google-drive-button-danger"
          :disabled="busy !== ''"
          title="Desconecta esta cuenta sin borrar tu copia de Drive"
          @click="disconnect"
        >
          Desconectar
        </button>
      </template>
    </div>

    <div v-if="!locked && driveLink?.profileFolderName && driveLink.profileFolderName !== visibleName" class="google-drive-rename">
      <p>
        La carpeta del perfil en Drive se llama <strong>{{ driveLink.profileFolderName }}</strong>.
      </p>
      <button
        type="button"
        class="google-drive-button google-drive-button-muted"
        :disabled="busy !== '' || !isConfigured || isNative || !authReady"
        @click="renameRemoteFolder"
      >
        Cambiar nombre de carpeta
      </button>
    </div>

    <p v-if="!locked && driveLink?.lastSavedAt && !syncState?.lastSyncedAt" class="google-drive-last-saved">
      Último guardado: {{ formatDate(driveLink.lastSavedAt) }}
    </p>
    <div
      v-if="!locked && driveLink?.accountId && syncState && syncState.status !== 'reauth'"
      class="google-drive-sync-state"
      role="status"
      aria-live="polite"
    >
      <strong>{{ syncStatusLabel }}</strong>
      <span v-if="syncState.status !== 'reauth'">{{ syncStatusMessage }}</span>
      <small v-if="syncState.lastSyncedAt">Último guardado: {{ formatDate(syncState.lastSyncedAt) }}</small>
      <button
        v-if="syncState.status === 'decision-required'"
        type="button"
        class="google-drive-button google-drive-button-muted"
        :disabled="busy !== '' || !authReady"
        @click="connect"
      >
        Revisar copia
      </button>
      <button
        v-if="syncState.status === 'conflict'"
        type="button"
        class="google-drive-button google-drive-button-danger"
        :disabled="busy !== ''"
        @click="conflictDialogOpen = true"
      >
        Resolver conflicto
      </button>
    </div>
    <p v-if="message" class="google-drive-message" :class="{ 'is-error': messageType === 'error' }" role="status" aria-live="polite">
      {{ message }}
    </p>

    <div v-if="initializationDialogOpen" class="google-drive-confirm-backdrop">
      <section class="google-drive-confirm" role="dialog" aria-modal="true" aria-labelledby="google-drive-initialize-title">
        <h3 id="google-drive-initialize-title">Elegir qué copia conservar</h3>
        <template v-if="initializationReview?.remoteExists">
          <p>
            Ya hay una copia de <strong>{{ visibleName }}</strong> en Drive. Elige cuál quieres conservar.
          </p>
          <dl v-if="initializationReview.remoteArchive">
            <div><dt>Perfil en Drive</dt><dd>{{ initializationReview.remoteArchive.profile.name }}</dd></div>
            <div><dt>Último cambio</dt><dd>{{ initializationReview.remoteModifiedTime ? formatDate(Date.parse(initializationReview.remoteModifiedTime)) : "No disponible" }}</dd></div>
            <div><dt>Listas</dt><dd>{{ initializationReview.remoteArchive.playlists.length }}</dd></div>
          </dl>
        </template>
        <p v-else>
          No encontramos una copia en Drive. Puedes subir ahora el perfil o cancelar.
        </p>
        <div class="google-drive-confirm-actions">
          <button type="button" class="google-drive-button google-drive-button-muted" :disabled="busy !== ''" @click="initializationDialogOpen = false">
            Cancelar
          </button>
          <template v-if="initializationReview?.remoteExists">
            <button type="button" class="google-drive-button google-drive-button-danger" :disabled="busy !== ''" @click="resolveInitialVersion('local')">
              Conservar copia de este dispositivo
            </button>
            <button type="button" class="google-drive-button google-drive-button-primary" :disabled="busy !== ''" @click="resolveInitialVersion('drive')">
              Conservar copia de Drive
            </button>
          </template>
          <button v-else type="button" class="google-drive-button google-drive-button-primary" :disabled="busy !== ''" @click="saveToDrive(false, true)">
            Subir perfil a Drive
          </button>
        </div>
      </section>
    </div>

    <div v-if="conflictDialogOpen && syncState?.status === 'conflict'" class="google-drive-confirm-backdrop">
      <section class="google-drive-confirm" role="dialog" aria-modal="true" aria-labelledby="google-drive-conflict-title">
        <h3 id="google-drive-conflict-title">Hay cambios diferentes</h3>
        <p>
          Hay cambios distintos en este dispositivo y en Drive para <strong>{{ visibleName }}</strong>.
          Elige cuál quieres conservar.
        </p>
        <p v-if="!syncState.conflict?.remoteJson" class="google-drive-message is-error">
          No se pudo leer la copia de Drive. Puedes conservar este dispositivo o cancelar.
        </p>
        <div class="google-drive-confirm-actions">
          <button type="button" class="google-drive-button google-drive-button-muted" :disabled="busy !== ''" @click="downloadConflictBackups">
            Descargar ambas copias
          </button>
          <button type="button" class="google-drive-button google-drive-button-muted" :disabled="busy !== ''" @click="conflictDialogOpen = false">
            Cancelar
          </button>
          <button type="button" class="google-drive-button google-drive-button-danger" :disabled="busy !== ''" @click="resolveConflict('local')">
            Conservar copia de este dispositivo
          </button>
          <button type="button" class="google-drive-button google-drive-button-primary" :disabled="busy !== '' || !syncState.conflict?.remoteJson" @click="resolveConflict('drive')">
            Conservar copia de Drive
          </button>
        </div>
      </section>
    </div>

    <div v-if="pendingArchive" class="google-drive-confirm-backdrop">
      <section class="google-drive-confirm" role="dialog" aria-modal="true" aria-labelledby="google-drive-confirm-title">
        <h3 id="google-drive-confirm-title">Restaurar perfil desde Drive</h3>
        <p>
          Se reemplazarán las preferencias, listas, favoritos, historial y valoraciones de
          <strong>{{ visibleName }}</strong>. La biblioteca y los demás perfiles no cambiarán.
        </p>
        <dl>
          <div><dt>Perfil en Drive</dt><dd>{{ pendingArchive.profile.name }}</dd></div>
          <div><dt>Nombre de usuario</dt><dd>@{{ pendingArchive.profile.username }}</dd></div>
          <div><dt>Listas</dt><dd>{{ pendingArchive.playlists.length }}</dd></div>
          <div><dt>Reproducciones recientes</dt><dd>{{ pendingArchive.history.length }}</dd></div>
        </dl>
        <div class="google-drive-confirm-actions">
          <button type="button" class="google-drive-button google-drive-button-muted" :disabled="busy !== ''" @click="pendingArchive = null">
            Cancelar
          </button>
          <button type="button" class="google-drive-button google-drive-button-danger" :disabled="busy !== ''" @click="confirmRestore">
            <LoaderCircle v-if="busy === 'restore'" :size="16" class="google-drive-spinner" />
            {{ busy === "restore" ? "Restaurando…" : "Restaurar perfil" }}
          </button>
        </div>
      </section>
    </div>
    <div v-if="pendingCreateConfirmation" class="google-drive-confirm-backdrop">
      <section class="google-drive-confirm" role="dialog" aria-modal="true" aria-labelledby="google-drive-create-title">
        <h3 id="google-drive-create-title">Crear carpeta en Drive</h3>
        <p>
          No encontramos la carpeta de Calliope. Comprueba en Drive que no exista ya antes de crearla para evitar copias duplicadas.
        </p>
        <div class="google-drive-confirm-actions">
          <button type="button" class="google-drive-button google-drive-button-muted" :disabled="busy !== ''" @click="pendingCreateConfirmation = false">
            Cancelar
          </button>
          <button type="button" class="google-drive-button google-drive-button-primary" :disabled="busy !== ''" @click="confirmCreateRoot">
            Crear carpeta
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
  driveSyncStatuses,
  downloadProfileArchiveFromDrive,
  getDriveProfileConflictBackups,
  getDriveProfileSyncState,
  getProfileDriveLink,
  isGoogleDriveConfigured,
  prepareGoogleDriveAuth,
  inspectDriveProfileInitialization,
  recordDriveProfileRestore,
  resolveDriveProfileInitialization,
  resolveDriveProfileConflict,
  resumeDriveProfileSync,
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
const pendingCreateInitialization = ref(false);
const conflictDialogOpen = ref(false);
const initializationDialogOpen = ref(false);
const initializationReview = ref(null);
const isNative = Capacitor.isNativePlatform();
const isConfigured = isGoogleDriveConfigured();
const visibleName = computed(() => props.profile.displayName || props.profile.name || "Perfil");
const syncState = computed(() => driveSyncStatuses[props.profile?.id] || null);
const syncStatusLabel = computed(() => ({
  pending: "Cambios pendientes",
  syncing: "Guardando en Drive",
  synced: "Guardado en Google Drive",
  offline: "Sin conexión",
  reauth: "Reconecta Google",
  conflict: "Conflicto pendiente",
  "decision-required": "Elige qué copia conservar",
  error: "No se pudo guardar en Drive",
  "local-only": "Sin copia en la nube",
}[syncState.value?.status] || "Preparando…"));
const syncStatusMessage = computed(() => ({
  pending: "Se guardarán tus cambios en breve.",
  syncing: "Guardando los cambios recientes.",
  synced: "Tu perfil está actualizado.",
  offline: "Conéctate a internet para guardar tus cambios en Drive.",
  reauth: "Hay que reconectar Google para guardar y recuperar tus cambios.",
  conflict: "Hay cambios diferentes en tu dispositivo y en Drive. Elige cuál quieres conservar.",
  "decision-required": "Revisa las copias para continuar.",
  error: "No se pudo guardar. Comprueba tu conexión e inténtalo de nuevo.",
  "local-only": "Puedes guardar una copia en tu dispositivo desde Ajustes.",
}[syncState.value?.status] || ""));
const expectedFileName = computed(() => {
  const username = normalizeUsername(props.profile.username);
  return username ? `${username}_profile_data.json` : "";
});

function showMessage(text, type = "success") {
  message.value = text;
  messageType.value = type;
}

function friendlyDriveError(error, fallback = "No se pudo completar. Inténtalo de nuevo.") {
  const detail = String(error?.message || "");
  if (/caducado|revocada|401/i.test(detail)) {
    return "Tu sesión de Google ha caducado. Reconecta tu cuenta para continuar.";
  }
  if (/conflicto|cambió durante|divergieron/i.test(detail)) {
    return "Hay cambios diferentes en tu dispositivo y en Drive. Elige cuál quieres conservar.";
  }
  if (/no corresponde|no pertenece|no coincide/i.test(detail)) {
    return "La copia no corresponde a este perfil. Revisa el perfil seleccionado.";
  }
  if (/sin conexión|network|fetch failed/i.test(detail)) {
    return "No se pudo conectar con Google Drive. Comprueba tu conexión e inténtalo de nuevo.";
  }
  if (/android|webview|VITE_GOOGLE_CLIENT_ID|no está configurado|no está disponible/i.test(detail)) {
    return "Google Drive no está disponible ahora.";
  }
  if (/varios archivos|varias carpetas|duplicad/i.test(detail)) {
    return "Hay varias copias del perfil en Drive. Revísalas antes de continuar.";
  }
  if (/archivo remoto no es un respaldo válido|archivo.*no es válido|no es una exportación/i.test(detail)) {
    return "No se pudo leer la copia de Drive. Tu perfil actual no se ha modificado.";
  }
  return fallback;
}

async function loadLink({ resume = true } = {}) {
  const profileId = props.profile?.id;
  if (!profileId || profileId === "guest") {
    driveLink.value = null;
    return;
  }
  try {
    const link = await getProfileDriveLink(profileId);
    if (props.profile.id === profileId) {
      driveLink.value = link;
      await getDriveProfileSyncState(profileId);
      if (resume && link?.accountId) {
        await resumeDriveProfileSync(profileId);
      }
    }
  } catch (error) {
    if (props.profile.id === profileId) {
      showMessage("No se pudo cargar la cuenta de Google. Inténtalo de nuevo.", "error");
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
    showMessage(friendlyDriveError(error, "No se pudo conectar con Google."), "error");
  }
}

async function connect() {
  if (busy.value) return;
  const wasLinked = Boolean(driveLink.value?.accountId);
  busy.value = "connect";
  message.value = "";
  try {
    driveLink.value = await connectGoogleDrive(props.profile.id);
    if (wasLinked) {
      if (driveLink.value.initializationPending) {
        await beginInitialReconciliation();
        return;
      }
      await resumeDriveProfileSync(props.profile.id);
      showMessage("Google está conectado. Se guardarán tus cambios automáticamente.");
    } else {
      showMessage("Google está conectado. Elige qué copia quieres conservar.");
      await getDriveProfileSyncState(props.profile.id);
      await beginInitialReconciliation();
    }
  } catch (error) {
    showMessage(friendlyDriveError(error, "No se pudo conectar con Google."), "error");
  } finally {
    busy.value = "";
  }
}

async function beginInitialReconciliation() {
  const targetProfile = props.profile;
  const review = await inspectDriveProfileInitialization(targetProfile);
  if (props.profile.id !== targetProfile.id || props.locked) return;
  initializationReview.value = review;
  initializationDialogOpen.value = true;
}

async function resolveInitialVersion(choice) {
  if (busy.value || !initializationReview.value) return;
  const targetProfile = props.profile;
  const profileId = targetProfile.id;
  busy.value = "initialize";
  message.value = "";
  try {
    await resolveDriveProfileInitialization(targetProfile, choice, initializationReview.value);
    if (props.profile.id !== profileId) return;
    initializationDialogOpen.value = false;
    initializationReview.value = null;
    await loadLink({ resume: false });
    if (choice === "drive") {
      await user.loadProfiles();
      await user.reloadActiveProfile(profileId);
      showMessage("Se conservó la copia de Drive.");
    } else {
      showMessage("El perfil se guardó en Drive.");
    }
  } catch (error) {
    showMessage(friendlyDriveError(error, "No se pudo completar. Revisa las copias e inténtalo de nuevo."), "error");
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
    showMessage("Google se desconectó. La copia de Drive no se borró.");
  } catch (error) {
    showMessage(friendlyDriveError(error, "No se pudo desconectar Google."), "error");
  } finally {
    busy.value = "";
  }
}

async function saveToDrive(confirmCreateRoot = false, initialize = false) {
  if (busy.value) return;
  const targetProfile = props.profile;
  const targetProfileId = targetProfile.id;
  busy.value = "save";
  message.value = "";
  pendingCreateConfirmation.value = false;
  try {
    await authorizeGoogleDriveProfile(targetProfileId);
    if (props.profile.id !== targetProfileId || props.locked) {
      throw new Error("El perfil seleccionado cambió.");
    }
    if (driveLink.value?.initializationPending && !initialize) {
      await beginInitialReconciliation();
      return;
    }
    if (user.currentSession?.profileId === targetProfileId) {
      const saved = await user.save();
      if (!saved) throw new Error("No se pudieron guardar los cambios del perfil.");
      await library.flushPendingProfileChanges(targetProfileId);
    }
    const result = await saveProfileArchiveToDrive(targetProfile, {
      confirmCreateStructure: confirmCreateRoot,
      initialize,
    });
    if (props.profile.id !== targetProfileId) return;
    await loadLink({ resume: false });
    initializationDialogOpen.value = false;
    initializationReview.value = null;
    showMessage(result.unchanged
      ? "Tu perfil ya está actualizado."
      : result.updated
      ? "Se guardó tu perfil en Drive."
      : "Se creó una copia de tu perfil en Drive.");
  } catch (error) {
    if (
      error.code === "drive-first-save-confirmation-required"
      || error.code === "drive-root-create-confirmation-required"
    ) {
      pendingCreateConfirmation.value = true;
      pendingCreateInitialization.value = initialize;
      if (initialize) initializationDialogOpen.value = false;
      return;
    }
    if (error.code === "drive-initialization-required") {
      await beginInitialReconciliation();
      return;
    }
    showMessage(friendlyDriveError(error, "No se pudo guardar. Comprueba tu conexión e inténtalo de nuevo."), "error");
  } finally {
    busy.value = "";
  }
}

function confirmCreateRoot() {
  if (busy.value) return;
  return saveToDrive(true, pendingCreateInitialization.value);
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
      throw new Error("La copia de Drive no corresponde a este perfil.");
    }
    if (normalizeUsername(archive.profile.username) !== normalizeUsername(targetProfile.username)) {
      throw new Error("La copia de Drive no corresponde al usuario de este perfil.");
    }
    pendingArchive.value = validateDriveProfileArchiveIdentity(archive, targetProfile);
  } catch (error) {
    showMessage(friendlyDriveError(error, "No se pudo leer el perfil de Drive. Tus datos actuales no se han modificado."), "error");
  } finally {
    busy.value = "";
  }
}

async function confirmRestore() {
  if (busy.value || !pendingArchive.value) return;
  const targetProfile = props.profile;
  const targetProfileId = targetProfile.id;
  busy.value = "restore";
  message.value = "";
  let restored = false;
  try {
    if (props.locked || targetProfileId === "guest") {
      throw new Error("No se puede restaurar este perfil ahora.");
    }
    if (user.currentSession?.profileId === targetProfileId) {
      const saved = await user.save();
      if (!saved) throw new Error("No se pudieron guardar los cambios del perfil.");
      await library.flushPendingProfileChanges(targetProfileId);
    }
    if (props.profile.id !== targetProfileId || props.locked) {
      throw new Error("El perfil seleccionado cambió.");
    }
    const result = await importProfileArchive(pendingArchive.value, {
      mode: "update",
      targetProfileId,
      currentSongs: library.songs,
      currentAlbums: library.albums,
      syncSource: "drive",
    });
    restored = true;
    await recordDriveProfileRestore(targetProfile, pendingArchive.value);
    pendingArchive.value = null;
    await user.loadProfiles();
    if (user.currentSession?.profileId === result.profileId) {
      await user.reloadActiveProfile(result.profileId);
    }
    showMessage("Se restauró el perfil desde Drive. La biblioteca y los demás perfiles no cambiaron.");
    await loadLink({ resume: false });
  } catch (error) {
    showMessage(
      restored
        ? "El perfil se restauró, pero no se pudo actualizar la pantalla."
        : friendlyDriveError(error, "No se pudo cargar tu perfil. Tus datos actuales no se han modificado."),
      "error",
    );
  } finally {
    busy.value = "";
  }
}

async function resolveConflict(choice) {
  if (busy.value) return;
  const description = choice === "local"
    ? "Se conservará la copia de este dispositivo y se reemplazará la de Drive. ¿Continuar?"
    : "Se conservará la copia de Drive y se reemplazará la de este dispositivo. ¿Continuar?";
  if (!globalThis.confirm?.(description)) return;
  const profileId = props.profile.id;
  busy.value = "resolve-conflict";
  message.value = "";
  try {
    await resolveDriveProfileConflict(profileId, choice);
    if (props.profile.id !== profileId) return;
    conflictDialogOpen.value = false;
    await getDriveProfileSyncState(profileId);
    if (choice === "drive") {
      await user.loadProfiles();
      await user.reloadActiveProfile(profileId);
    }
    await loadLink({ resume: false });
    showMessage(choice === "local"
      ? "Se conservó la copia de este dispositivo."
      : "Se conservó la copia de Drive.");
  } catch (error) {
    showMessage(friendlyDriveError(error, "No se pudo resolver el conflicto. Revisa las copias e inténtalo de nuevo."), "error");
  } finally {
    busy.value = "";
  }
}

async function downloadConflictBackups() {
  try {
    const backups = await getDriveProfileConflictBackups(props.profile.id);
    const username = normalizeUsername(props.profile.username) || "profile";
    for (const [source, content] of [["local", backups.localJson], ["drive", backups.remoteJson]]) {
      if (!content) continue;
      const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${username}_${source}_conflict_backup.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
    showMessage("Se descargaron las copias disponibles del conflicto.");
  } catch (error) {
    showMessage("No se pudieron descargar las copias. Inténtalo de nuevo.", "error");
  }
}

async function renameRemoteFolder() {
  if (busy.value) return;
  busy.value = "rename";
  message.value = "";
  try {
    await renameDriveProfileFolder(props.profile, visibleName.value);
    await loadLink({ resume: false });
    showMessage("Se cambió el nombre de la carpeta.");
  } catch (error) {
    showMessage(friendlyDriveError(error, "No se pudo cambiar el nombre de la carpeta."), "error");
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
      conflictDialogOpen.value = false;
      initializationDialogOpen.value = false;
      initializationReview.value = null;
    }
    initialize();
  },
);
watch(
  () => syncState.value?.status,
  (status) => {
    if (status === "conflict") conflictDialogOpen.value = true;
  },
);
onMounted(initialize);
</script>
