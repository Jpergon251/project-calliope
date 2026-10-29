<template>
  <main class="settings-page">

    <section class="settings-header">
      <h1>Ajustes</h1>
      <p>
        Gestiona tu biblioteca, archivos y opciones de Calliope.
      </p>
    </section>

    <section class="settings-card profile-management">
      <div class="settings-card-header">
        <h2>Perfiles musicales</h2>
        <p>
          Cada perfil tiene sus propias preferencias, listas y favoritos. La biblioteca de canciones es compartida.
        </p>
      </div>

      <p v-if="user.isGuest" class="health-description">
        Crea un perfil para guardar tus preferencias y listas por separado.
      </p>

      <template v-else>
        <div class="profile-active">
          Perfil activo: <strong>{{ user.profile.displayName || user.profile.name }}</strong>
          <span>
            {{ !library.folderHandle
              ? "Sin carpeta musical"
              : library.folderHandle.canWrite === false
                ? "No se puede guardar en esta carpeta"
                : "Carpeta musical conectada" }}
          </span>
        </div>

        <div class="profile-actions">
          <button type="button" class="settings-button" @click="createProfile">
            Crear perfil
          </button>
          <button type="button" class="settings-button" @click="associateFolder">
            Asociar carpeta musical
          </button>
          <button type="button" class="settings-button" @click="exportProfile">
            Exportar perfil
          </button>
          <button type="button" class="settings-button" @click="importInput?.click()">
            Importar perfil
          </button>
          <input
            ref="importInput"
            class="profile-import-input"
            type="file"
            accept="application/json,.json"
            aria-label="Seleccionar archivo de perfil"
            @change="importProfile"
          />
        </div>

        <div class="profile-sync" aria-live="polite">
          <span>
            Copia en tu dispositivo:
            <strong>{{ syncStatusLabel }}</strong>
            <template v-if="syncStatusMessage"> — {{ syncStatusMessage }}</template>
          </span>
          <button
            v-if="syncStatus?.status === 'error' || syncStatus?.status === 'pending'"
            type="button"
            class="settings-button"
            @click="retrySync"
          >
            Guardar copia
          </button>
        </div>

        <ul class="profile-list" aria-label="Perfiles disponibles">
          <li v-for="item in user.profilesList" :key="item.id">
            <div class="profile-list-info">
              <strong>{{ item.displayName || item.name }}</strong>
              <span v-if="item.username">@{{ item.username }}</span>
              <span v-else class="profile-username-pending">Falta el nombre de usuario</span>
              <span v-if="item.id === activeProfileId">Activo</span>
              <span v-else>Disponible</span>
            </div>
            <div class="profile-list-actions">
              <button
                v-if="item.id !== activeProfileId"
                type="button"
                class="settings-button"
                @click="selectProfile(item)"
              >
                Activar
              </button>
              <button type="button" class="settings-button" @click="renameProfile(item)">
                Renombrar
              </button>
              <button type="button" class="settings-button danger" @click="deleteProfile(item)">
                Eliminar
              </button>
            </div>
          </li>
        </ul>
      </template>
    </section>

    <section class="settings-card">

      <div class="settings-card-header">
        <h2>Biblioteca de Música</h2>

        <p>
          Administra la carpeta donde Calliope busca tus canciones.
        </p>
      </div>


      <div class="library-info">
        <span>
          Canciones cargadas
        </span>

        <strong>
          {{ library.songs.length }}
        </strong>
      </div>


      <div class="settings-actions">

        <div class="setting-action">

          <button
            @click="associateFolder"
            class="settings-button"
          >
            Cambiar carpeta de música
          </button>

          <p>
            Selecciona una nueva carpeta donde se encuentran tus archivos de música.
          </p>

        </div>


        <div class="setting-action">

          <button
            @click="removeLibrary"
            :disabled="!library.folderHandle"
            class="settings-button danger"
          >
            Eliminar carpeta de música
          </button>

          <p>
            Desvincula la carpeta actual. Tus archivos originales no serán eliminados.
          </p>

        </div>

      </div>

    </section>



    <section class="settings-card">

      <div class="settings-card-header">

        <h2>Estado de la Biblioteca</h2>

        <p>
          Comprueba y mantiene organizada la información de tus canciones.
        </p>

      </div>


      <div class="metadata-status">

        <span>
          Canciones por completar
        </span>

        <strong>
          {{ songsWithoutMetadata }}
        </strong>

      </div>



      <p class="health-description">
        Puedes completar datos como el título, el artista, el álbum y la portada.
        Calliope usa esta información para organizar tu biblioteca.
      </p>



      <div class="settings-actions">


        <div class="setting-action">

          <button
            @click="router.push('/metadata')"
            :disabled="!library.folderHandle"
            class="settings-button"
          >
            Editar información de canciones
          </button>


          <p>
            Revisa y completa la información de tus canciones.
          </p>

        </div>



        <div class="setting-action">

          <button
            @click="library.rescanLibrary()"
            :disabled="!library.folderHandle"
            class="settings-button"
          >
            Escanear de nuevo
          </button>


          <p>
            Busca nuevos archivos añadidos a la carpeta seleccionada.
          </p>

        </div>



        <div class="setting-action">

          <button
            @click="rebuild"
            :disabled="!library.folderHandle"
            class="settings-button"
          >
            Reconstruir biblioteca
          </button>


          <p>
            Elimina la información guardada y vuelve a analizar todos los archivos desde cero.
          </p>

        </div>


      </div>


    </section>


  </main>
</template>


<script setup>

import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useLibraryStore } from "../stores/libraryStore.js";
import { useUserStore } from "../stores/userStore.js";
import { Capacitor } from "@capacitor/core";
import FolderPicker from "../plugins/folderPicker.js";
import {
  collectProfileArchive,
  flushProfileSync,
  MAX_PROFILE_ARCHIVE_BYTES,
  profileArchiveFileName,
  profileSyncStatuses,
  resolveProfileSongReferences,
  validateProfileArchive,
  importProfileArchive as saveImportedProfile,
} from "../services/profileArchives.js";
import { inspectProfileIdentity, validateUsername } from "../lib/profileIdentity.js";


const router = useRouter();
const library = useLibraryStore();
const user = useUserStore();
const importInput = ref(null);
const activeProfileId = computed(() => user.currentSession?.profileId || null);
const syncStatus = computed(() => profileSyncStatuses[activeProfileId.value] || null);
const syncStatusLabel = computed(() => ({
  syncing: "Guardando…",
  synced: "Guardada",
  pending: "Pendiente",
  error: "No se pudo guardar",
  unavailable: "Sin carpeta",
}[syncStatus.value?.status] || (library.folderHandle ? "Lista para guardar" : "Sin carpeta")));

const syncStatusMessage = computed(() => ({
  syncing: "Guardando una copia de tu perfil.",
  synced: "Tu copia está actualizada.",
  pending: "Hay cambios por guardar.",
  error: "Comprueba los permisos de la carpeta e inténtalo de nuevo.",
  unavailable: "Puedes guardar una copia en tu dispositivo.",
}[syncStatus.value?.status] || ""));


const songsWithoutMetadata = computed(() =>
  library.songs.filter(song => !song.hasMetadata).length
);

function reportError(error) {
  console.error("[Settings] No se pudo completar la acción:", error);
  const detail = String(error?.message || "");
  const message = /nombre de usuario.*(ya está en uso|pertenece)|ya está en uso/i.test(detail)
    ? "Ese nombre de usuario ya está en uso."
    : /entre 3 y 30|letras, números|nombre de usuario.*(válido|obligatorio)/i.test(detail)
      ? "El nombre de usuario no es válido. Usa entre 3 y 30 caracteres."
      : /contraseña|password/i.test(detail)
        ? "No se pudo abrir el perfil. Comprueba la contraseña e inténtalo de nuevo."
        : /permiso|escritura/i.test(detail)
          ? "No se pudo guardar. Revisa los permisos de la carpeta e inténtalo de nuevo."
          : /ID|identificador|identidad|archivo|JSON|respaldo|exportación|estructura|referencia|versión/i.test(detail)
            ? "No se pudo leer el archivo de perfil. Elige un archivo válido e inténtalo de nuevo."
            : "No se pudo completar. Inténtalo de nuevo.";
  window.alert(message);
}

async function createProfile() {
  const name = window.prompt("Nombre del nuevo perfil musical:");
  if (!name?.trim()) return;
  const username = window.prompt("Nombre de usuario único (3–30 caracteres):");
  if (username === null) return;
  try {
    const validation = validateUsername(username);
    if (!validation.valid) throw new Error(validation.reason);
    await user.createProfile({
      name: name.trim(),
      displayName: name.trim(),
      username: validation.username,
    });
    await user.loadProfiles();
  } catch (error) {
    reportError(error);
  }
}

async function selectProfile(item) {
  const password = item.credential?.hash
    ? window.prompt(`Contraseña del perfil «${item.displayName || item.name}»:`)
    : null;
  if (item.credential?.hash && password === null) return;
  try {
    const result = await user.loginProfile(item.id, password);
    if (!result.success) throw new Error(result.error || "No se pudo activar el perfil.");
  } catch (error) {
    reportError(error);
  }
}

async function renameProfile(item) {
  const name = window.prompt("Nuevo nombre del perfil:", item.displayName || item.name);
  if (!name?.trim() || name.trim() === (item.displayName || item.name)) return;
  try {
    await user.renameProfile(item.id, name);
  } catch (error) {
    reportError(error);
  }
}

async function deleteProfile(item) {
  const active = item.id === activeProfileId.value;
  const confirmed = window.confirm(
    `Se eliminará el perfil «${item.displayName || item.name}» y sus datos. No se borrarán las canciones ni las copias guardadas.`
    + (active ? "\n\nLa sesión actual se cerrará." : "")
    + "\n\n¿Continuar?",
  );
  if (!confirmed) return;
  try {
    await user.deleteProfile(item.id);
  } catch (error) {
    reportError(error);
  }
}

async function associateFolder() {
  try {
    await library.selectFolder();
  } catch (error) {
    reportError(error);
  }
}

async function exportProfile() {
  try {
    const archive = await collectProfileArchive(activeProfileId.value);
    const content = JSON.stringify(archive, null, 2);
    if (new TextEncoder().encode(content).byteLength > MAX_PROFILE_ARCHIVE_BYTES) {
      throw new Error("El perfil supera el tamaño máximo permitido para exportar.");
    }
    const fileName = profileArchiveFileName(user.profile);
    if (Capacitor.isNativePlatform()) {
      await FolderPicker.saveProfileExport({ fileName, content });
    } else {
      const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (error) {
    reportError(error);
  }
}

async function importProfile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    if (file.size > MAX_PROFILE_ARCHIVE_BYTES) {
      throw new Error("El archivo supera el límite de 25 MiB.");
    }
    const archive = JSON.parse(await file.text());
    const { archive: validated } = validateProfileArchive(archive);
    const resolution = resolveProfileSongReferences(validated, library.songs);
    const name = validated.profile.name.trim();
    const identity = inspectProfileIdentity(validated.profile, user.profilesList);
    let mode = "new";
    let targetProfileId = null;
    let importArchive = validated;
    if (identity.type === "split-identity") {
      throw new Error(
        `Los datos del archivo corresponden a perfiles distintos: «${identity.idOwner.displayName || identity.idOwner.name}» y «${identity.usernameOwner.displayName || identity.usernameOwner.name}». No se modificó ningún perfil.`,
      );
    }
    if (identity.type === "id-match") {
      const target = identity.idOwner;
      let username = validated.profile.username || target.username || "";
      if (!username) {
        const proposed = window.prompt(
          `El perfil «${target.displayName || target.name}» no tiene nombre de usuario. Elige uno para continuar:`,
        );
        if (proposed === null) return;
        const validation = validateUsername(proposed);
        if (!validation.valid) throw new Error(validation.reason);
        const owner = user.profilesList.find((item) =>
          item.id !== target.id
          && validateUsername(item.username || "").valid
          && validateUsername(item.username || "").username === validation.username,
        );
        if (owner) throw new Error(`El nombre de usuario @${validation.username} ya está en uso.`);
        username = validation.username;
      }
      if (!window.confirm(
        `El perfil «${target.displayName || target.name}» (@${username || "sin nombre de usuario"}) ya existe. Se reemplazarán sus datos por los del archivo. La biblioteca de canciones no cambiará. ¿Continuar?`,
      )) return;
      importArchive = {
        ...validated,
        profile: { ...validated.profile, username },
      };
      mode = "update";
      targetProfileId = target.id;
    } else if (identity.type === "username-match" || identity.type === "username-required") {
      const prompt = identity.type === "username-match"
        ? `@${identity.usernameOwner.username} ya pertenece a «${identity.usernameOwner.displayName || identity.usernameOwner.name}». Elige otro nombre de usuario:`
        : "Este archivo no tiene nombre de usuario. Elige uno para continuar:";
      const username = window.prompt(prompt);
      if (username === null) return;
      const validation = validateUsername(username);
      if (!validation.valid) throw new Error(validation.reason);
      if (user.profilesList.some((item) =>
        item.id !== validated.profile.id
        && validateUsername(item.username || "").username === validation.username
        && validateUsername(item.username || "").valid,
      )) {
        throw new Error(`El nombre de usuario @${validation.username} ya está en uso.`);
      }
      importArchive = {
        ...validated,
        profile: { ...validated.profile, username: validation.username },
      };
    } else if (!window.confirm(
      `¿Quieres importar «${name}» como perfil nuevo?\nIncluye ${validated.playlists.length} listas y ${validated.history.length} reproducciones recientes.\n`
      + `${resolution.unresolvedCount ? `${resolution.unresolvedCount} canciones no están disponibles en esta biblioteca.` : "Las canciones coinciden con la biblioteca actual."}`,
    )) {
      return;
    }

    const result = await saveImportedProfile(importArchive, {
      mode,
      targetProfileId,
      preserveSourceId: mode === "new",
      currentSongs: library.songs,
      currentAlbums: library.albums,
    });
    await user.loadProfiles();
    if (mode === "update" && targetProfileId === activeProfileId.value) {
      await user.reloadActiveProfile(targetProfileId);
    } else {
      const shouldActivate = window.confirm("Perfil importado. ¿Quieres activarlo ahora?");
      if (shouldActivate) {
        const login = await user.loginProfile(result.profileId);
        if (!login.success) throw new Error(login.error || "El perfil se importó, pero no se pudo activar.");
      }
    }
  } catch (error) {
    reportError(error);
  }
}

async function retrySync() {
  try {
    await flushProfileSync(activeProfileId.value, { requestPermission: true });
  } catch (error) {
    reportError(error);
  }
}

async function removeLibrary() {

  const confirmDelete = confirm(
    "¿Quieres eliminar la carpeta de música seleccionada?\n\nTus archivos originales no serán borrados."
  );


  if (!confirmDelete) return;


  await library.removeFolder();

}



async function rebuild() {

  const confirmRebuild = confirm(
    "Se reconstruirá la biblioteca desde cero.\n\nLas playlists y configuraciones no se eliminarán.\n\n¿Continuar?"
  );


  if (!confirmRebuild) return;


  await library.rebuildLibrary();

}

</script>