<template>
  <Teleport to="body">
    <Transition name="settings-drawer">
      <div
        v-if="open"
        class="settings-backdrop"
        @click.self="close"
        @keydown.esc.stop="close"
      >
        <aside
          class="settings-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
        >
          <header class="drawer-header">
            <div>
              <span class="section-tag">CALLIOPE</span>
              <h2 id="settings-title">Opciones</h2>
            </div>
            <button
              class="drawer-close"
              type="button"
              aria-label="Cerrar opciones"
              @click="close"
            >
              <X :size="19" />
            </button>
          </header>

          <nav class="drawer-tabs" aria-label="Categorías de opciones">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              type="button"
              :class="{ active: activeTab === tab.id }"
              @click="activeTab = tab.id"
            >
              {{ tab.label }}
            </button>
          </nav>

          <div class="drawer-content">
            <section v-if="activeTab === 'appearance'" class="drawer-section">
              <h3>Apariencia</h3>
              <div class="drawer-card">
                <div class="setting-row setting-column">
                  <div>
                    <strong>Temas</strong>
                    <p>Elige el aspecto de Calliope.</p>
                  </div>
                  <div
                    class="theme-options"
                    role="group"
                    aria-label="Temas disponibles"
                  >
                    <button
                      v-for="palette in COLOR_PALETTES"
                      :key="palette.value"
                      type="button"
                      class="theme-option"
                      :class="{
                        selected: user.profile.accentColor === palette.value,
                      }"
                      :aria-pressed="user.profile.accentColor === palette.value"
                      @click="
                        user.updateProfile({ accentColor: palette.value })
                      "
                    >
                      <span
                        class="theme-preview"
                        :style="{
                          '--theme-preview-bg': palette.tokens['--bg-primary'],
                          '--theme-preview-surface': palette.tokens['--bg-secondary'],
                          '--theme-preview-accent': palette.tokens['--accent'],
                        }"
                        aria-hidden="true"
                      >
                        <span class="theme-preview-sidebar"></span>
                        <span class="theme-preview-content">
                          <span class="theme-preview-card"></span>
                          <span class="theme-preview-accent-bar"></span>
                        </span>
                      </span>
                      <span class="theme-option-footer">
                        <span class="theme-option-name">{{ palette.label }}</span>
                        <Check
                          v-if="user.profile.accentColor === palette.value"
                          :size="14"
                          aria-hidden="true"
                        />
                      </span>
                    </button>
                  </div>
                </div>
                <div class="setting-row">
                  <div>
                    <strong>Visualizador de audio</strong>
                    <p>Mostrar animación durante la reproducción.</p>
                  </div>
                  <ToggleSwitch
                    :model-value="user.profile.showVisualizer"
                    @update:model-value="
                      updatePreference('showVisualizer', $event)
                    "
                  />
                </div>
                <div class="setting-row setting-column">
                  <div><strong>Estilo del visualizador</strong></div>
                  <div
                    class="style-options"
                    role="group"
                    aria-label="Estilo del visualizador"
                  >
                    <button
                      v-for="style in VISUALIZER_STYLES"
                      :key="style.value"
                      type="button"
                      :class="{
                        selected: selectedVisualizerStyle === style.value,
                      }"
                      :aria-pressed="selectedVisualizerStyle === style.value"
                      @click="updatePreference('visualizerStyle', style.value)"
                    >
                      {{ style.label }}
                    </button>
                  </div>
                </div>
                <div class="setting-row setting-column visualizer-amplitude-setting">
                  <div class="visualizer-amplitude-heading">
                    <div>
                      <strong>Amplitud del visualizador</strong>
                      <p>Controla cuánto se mueven las ondas, barras y puntos.</p>
                    </div>
                    <output for="visualizer-amplitude">{{ visualizerAmplitude.toFixed(1) }}x</output>
                  </div>
                  <div class="visualizer-amplitude-control">
                    <input
                      id="visualizer-amplitude"
                      :value="visualizerAmplitude"
                      type="range"
                      min="0.5"
                      max="2.5"
                      step="0.1"
                      aria-label="Amplitud del visualizador"
                      @input="setVisualizerAmplitude"
                    />
                    <button
                      type="button"
                      class="visualizer-amplitude-reset"
                      :disabled="visualizerAmplitude === 1"
                      @click="updatePreference('visualizerAmplitude', 1)"
                    >
                      Restablecer
                    </button>
                  </div>
                </div>
                <div class="setting-row">
                  <div>
                    <strong>Menos animaciones</strong>
                    <p>Reduce movimientos y transiciones.</p>
                  </div>
                  <ToggleSwitch
                    :model-value="user.profile.reducedMotion"
                    @update:model-value="
                      updatePreference('reducedMotion', $event)
                    "
                  />
                </div>
              </div>
            </section>

            <section
              v-else-if="activeTab === 'playback'"
              class="drawer-section"
            >
              <h3>Reproducción e Inicio</h3>
              <div class="drawer-card">
                <div class="setting-row">
                  <div>
                    <strong>Recordar cola y canción</strong>
                    <p>Recuperar la última cola al abrir Calliope.</p>
                  </div>
                  <ToggleSwitch
                    :model-value="user.profile.keepQueueWhenClosing"
                    @update:model-value="
                      updatePreference('keepQueueWhenClosing', $event)
                    "
                  />
                </div>
                <div class="setting-row">
                  <div>
                    <strong>Intentar reanudar al abrir</strong>
                    <p>Continuar la reproducción automáticamente.</p>
                  </div>
                  <ToggleSwitch
                    :model-value="user.profile.autoplayOnStart"
                    @update:model-value="
                      updatePreference('autoplayOnStart', $event)
                    "
                  />
                </div>
                <label class="setting-row"
                  ><span
                    ><strong>Orden de la biblioteca</strong
                    ><small>Orden predeterminado de las canciones.</small></span
                  ><select
                    class="drawer-select"
                    :value="user.profile.librarySortMode"
                    @change="
                      updatePreference('librarySortMode', $event.target.value)
                    "
                  >
                    <option value="name">Título</option>
                    <option value="artist">Artista</option>
                    <option value="album">Álbum</option>
                    <option value="duration">Duración</option>
                    <option value="date">Fecha</option>
                  </select></label
                >
                <div class="setting-row">
                  <div>
                    <strong>Mostrar «Vuelve a escucharlo»</strong>
                    <p>Actividad reciente en Inicio.</p>
                  </div>
                  <ToggleSwitch
                    :model-value="user.profile.homeShowHistory"
                    @update:model-value="
                      updatePreference('homeShowHistory', $event)
                    "
                  />
                </div>
                <div class="setting-row">
                  <div>
                    <strong>Mostrar playlists más escuchadas</strong>
                    <p>Playlists destacadas en Inicio.</p>
                  </div>
                  <ToggleSwitch
                    :model-value="user.profile.homeShowTopPlaylists"
                    @update:model-value="
                      updatePreference('homeShowTopPlaylists', $event)
                    "
                  />
                </div>
              </div>
            </section>

            <section v-else-if="activeTab === 'library'" class="drawer-section">
              <h3>Biblioteca y Backup</h3>
              <div class="drawer-card">
                <div class="setting-row">
                  <div>
                    <strong>Biblioteca de música</strong>
                    <p>{{ library.songs.length }} canciones cargadas</p>
                  </div>
                  <span class="local-badge">{{ library.songs.length }}</span>
                </div>
                <div class="setting-row">
                  <div><strong>Cambiar carpeta de música</strong></div>
                  <button
                    class="drawer-button primary"
                    type="button"
                    @click="library.selectFolder()"
                  >
                    Cambiar carpeta
                  </button>
                </div>
                <div class="setting-row">
                  <div>
                    <strong>Eliminar carpeta de música</strong
                    ><small>Los archivos originales no se borrarán.</small>
                  </div>
                  <button
                    class="drawer-button danger"
                    type="button"
                    :disabled="!library.folderHandle"
                    @click="removeLibrary"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
              <div class="drawer-card">
                <div class="setting-row">
                  <div>
                    <strong>Copia local</strong
                    ><small>Exporta o importa un perfil JSON.</small>
                  </div>
                  <div class="button-stack">
                    <button
                      class="drawer-button primary"
                      type="button"
                      :disabled="user.isGuest || archiveBusy"
                      @click="exportProfile"
                    >
                      {{
                        archiveBusy ? "Procesando…" : "Exportar perfil"
                      }}</button
                    ><button
                      class="drawer-button"
                      type="button"
                      :disabled="archiveBusy"
                      @click="importInput?.click()"
                    >
                      Importar perfil</button
                    ><input
                      ref="importInput"
                      hidden
                      type="file"
                      accept="application/json,.json"
                      @change="importProfile"
                    />
                  </div>
                </div>
                <p v-if="archiveMessage" class="drawer-message" role="status">
                  {{ archiveMessage }}
                </p>
              </div>
              <GoogleDriveProfile :profile="user.profile" />
            </section>

            <section v-else class="drawer-section">
              <h3>Privacidad y Datos</h3>
              <div class="drawer-card">
                <div v-if="!user.isGuest" class="setting-row">
                  <div>
                    <strong>Perfil privado</strong>
                    <p>Protege el acceso a este perfil con contraseña.</p>
                  </div>
                  <ToggleSwitch
                    :model-value="isPrivate"
                    @update:model-value="togglePrivacy"
                  />
                </div>
                <div class="setting-row">
                  <div>
                    <strong>Guardar historial de escucha</strong>
                    <p>Registra reproducciones en este perfil.</p>
                  </div>
                  <ToggleSwitch
                    :model-value="user.profile.saveListeningHistory"
                    @update:model-value="
                      updatePreference('saveListeningHistory', $event)
                    "
                  />
                </div>
                <div class="setting-row">
                  <div>
                    <strong>Almacenamiento local</strong
                    ><small>{{ storageLabel }}</small>
                  </div>
                  <span class="local-badge">Local</span>
                </div>
              </div>
              <div class="drawer-card danger-card">
                <div class="setting-row">
                  <div>
                    <strong>Restablecer preferencias</strong
                    ><small>Conserva tu identidad y tus imágenes.</small>
                  </div>
                  <button
                    class="drawer-button danger"
                    type="button"
                    @click="resetPreferences"
                  >
                    Restablecer
                  </button>
                </div>
              </div>
            </section>
          </div>

          <div
            v-if="passwordDialog"
            class="password-backdrop"
            @click.self="passwordDialog = false"
          >
            <form class="password-dialog" @submit.prevent="confirmPassword">
              <header>
                <h3>Proteger perfil</h3>
                <button
                  type="button"
                  aria-label="Cerrar"
                  @click="passwordDialog = false"
                >
                  <X :size="17" />
                </button>
              </header>
              <label
                >Nueva contraseña<input
                  v-model="password"
                  type="password"
                  minlength="4"
                  autocomplete="new-password"
                  required
              /></label>
              <label
                >Confirmar contraseña<input
                  v-model="passwordConfirm"
                  type="password"
                  minlength="4"
                  autocomplete="new-password"
                  required
              /></label>
              <p v-if="passwordError" class="drawer-message error">
                {{ passwordError }}
              </p>
              <div class="dialog-actions">
                <button
                  class="drawer-button"
                  type="button"
                  @click="passwordDialog = false"
                >
                  Cancelar</button
                ><button
                  class="drawer-button primary"
                  type="submit"
                  :disabled="passwordBusy"
                >
                  Activar perfil privado
                </button>
              </div>
            </form>
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Check, X } from "lucide-vue-next";
import ToggleSwitch from "./common/ToggleSwitch.vue";
import GoogleDriveProfile from "./common/GoogleDriveProfile.vue";
import { useUserStore } from "../stores/userStore.js";
import { useLibraryStore } from "../stores/libraryStore.js";
import { COLOR_PALETTES } from "../lib/colorPalettes.js";
import { normalizeVisualizerAmplitude, normalizeVisualizerStyle, VISUALIZER_STYLES } from "../lib/visualizer.js";
import { collectProfileArchive, MAX_PROFILE_ARCHIVE_BYTES, profileArchiveFileName, validateProfileArchive, resolveProfileSongReferences, importProfileArchive as saveImportedProfile } from "../services/profileArchives.js";
import { inspectProfileIdentity, validateUsername } from "../lib/profileIdentity.js";

const props = defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits(["close"]);
const user = useUserStore();
const library = useLibraryStore();
const tabs = [
  { id: "appearance", label: "Apariencia" },
  { id: "playback", label: "Reproducción" },
  { id: "library", label: "Biblioteca" },
  { id: "privacy", label: "Privacidad" },
];
const activeTab = ref("appearance");
const importInput = ref(null);
const archiveBusy = ref(false);
const archiveMessage = ref("");
const storageLabel = ref("Calculando espacio utilizado…");
const passwordDialog = ref(false);
const passwordBusy = ref(false);
const password = ref("");
const passwordConfirm = ref("");
const passwordError = ref("");
const selectedVisualizerStyle = computed(() => normalizeVisualizerStyle(user.profile.visualizerStyle));
const visualizerAmplitude = computed(() => normalizeVisualizerAmplitude(user.profile.visualizerAmplitude));
const isPrivate = computed(() => Boolean(user.profile.private ?? user.profile.isPrivate));

function close() { emit("close"); }
function onKeydown(event) { if (event.key === "Escape" && props.open) close(); }
function updatePreference(key, value) { user.updateProfile({ [key]: value }); }
function setVisualizerAmplitude(event) {
  updatePreference("visualizerAmplitude", normalizeVisualizerAmplitude(event.target.value));
}

async function removeLibrary() {
  if (!window.confirm("¿Eliminar la carpeta seleccionada? Tus archivos originales no se borrarán.")) return;
  await library.removeFolder();
}

async function resetPreferences() {
  if (!window.confirm("¿Restablecer las preferencias de apariencia, reproducción y biblioteca?")) return;
  await user.resetPreferences();
}

async function togglePrivacy(value) {if (!value) { await user.setProfilePrivacy(false); return;}
  if (user.hasPassword) {await user.setProfilePrivacy(true); return;}
  password.value = "";
  passwordConfirm.value = "";
  passwordError.value = "";
  passwordDialog.value = true;
}

async function confirmPassword() {
  passwordError.value = "";
  if (password.value.length < 4) {
    passwordError.value = "La contraseña debe tener al menos 4 caracteres.";
    return;
  }
  if (password.value !== passwordConfirm.value) {
    passwordError.value = "Las contraseñas no coinciden.";
    return;
  }
  passwordBusy.value = true;
  try {
    const result = await user.setProfilePrivacy(true, password.value);
    if (!result.success) throw new Error(result.error || "No se pudo proteger el perfil.");
    passwordDialog.value = false;
  } catch (error) {passwordError.value = error.message || "No se pudo proteger el perfil.";} finally {
    passwordBusy.value = false;
  }
}

async function exportProfile() {
  const profileId = user.currentSession?.profileId;
  if (!profileId || user.isGuest || archiveBusy.value) return;
  archiveBusy.value = true;
  archiveMessage.value = "";
  try {
    const archive = await collectProfileArchive(profileId);
    const content = JSON.stringify(archive, null, 2);
    if (new TextEncoder().encode(content).byteLength > MAX_PROFILE_ARCHIVE_BYTES) throw new Error("El perfil supera el tamaño máximo permitido.");
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = profileArchiveFileName(user.profile);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    archiveMessage.value = "Perfil exportado correctamente.";
  } catch (error) {archiveMessage.value = error.message || "No se pudo exportar el perfil.";} finally {
    archiveBusy.value = false;
  }
}

async function importProfile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file || archiveBusy.value) return;
  archiveBusy.value = true;
  archiveMessage.value = "";
  try {
    if (file.size > MAX_PROFILE_ARCHIVE_BYTES) throw new Error("El archivo supera el límite permitido.");
    const { archive } = validateProfileArchive(JSON.parse(await file.text()));
    const identity = inspectProfileIdentity(archive.profile, user.profilesList);
    if (identity.type === "split-identity") throw new Error("Los datos del archivo corresponden a perfiles distintos.");
    let importArchive = archive;
    let mode = "new";
    let targetProfileId = null;
    if (identity.type === "id-match") {
      const target = identity.idOwner;
      if (!window.confirm(`Se reemplazarán los datos de «${target.displayName || target.name}». La biblioteca no cambiará. ¿Continuar?`)) return;
      mode = "update";
      targetProfileId = target.id;
    } else if (identity.type === "username-match" || identity.type === "username-required") {
      const proposed = window.prompt("Elige un nombre de usuario para el perfil importado:", archive.profile.username || "");
      if (proposed === null) return;
      const checked = validateUsername(proposed);
      if (!checked.valid) throw new Error(checked.reason);
      importArchive = { ...archive, profile: { ...archive.profile, username: checked.username } };
    } else if (!window.confirm(`¿Importar «${archive.profile.name}» como perfil nuevo?`)) return;
    const { archive: resolvedArchive } = resolveProfileSongReferences(importArchive, library.songs, library.albums);
    await saveImportedProfile(resolvedArchive, {
      mode,
      targetProfileId,
      preserveSourceId: mode === "new",
      currentSongs: library.songs,
      currentAlbums: library.albums,
    });
    await user.loadProfiles();
    if (mode === "update" && targetProfileId === user.currentSession?.profileId) await user.reloadActiveProfile(targetProfileId);
    archiveMessage.value = "Perfil importado correctamente.";
  } catch (error) {archiveMessage.value = error.message || "No se pudo importar el perfil.";} finally {
    archiveBusy.value = false;
  }
}

async function updateStorageEstimate() {
  try {
    const estimate = await navigator.storage?.estimate?.();
    storageLabel.value = estimate?.usage == null
      ? "Calliope guarda tus datos en este dispositivo."
      : `${(estimate.usage / 1024 / 1024).toFixed(1)} MB usados en el dispositivo.`;
  } catch {storageLabel.value = "Calliope guarda tus datos en este dispositivo.";}
}

watch(() => props.open, (open) => {if (open) updateStorageEstimate();});
onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<style lang="scss">
.settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  justify-content: flex-end;
  background: color-mix(in srgb, var(--bg-primary) 72%, transparent);
  backdrop-filter: blur(5px);
}

.settings-drawer {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 420px;
  max-width: 92vw;
  height: 100vh;
  height: 100dvh;
  border-left: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-secondary) 92%, transparent);
  color: var(--text-primary);
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(24px);
}

.drawer-header,
.drawer-header > div,
.setting-row,
.drawer-tabs,
.style-options,
.dialog-actions {
  display: flex;
  align-items: center;
}
.drawer-header {
  justify-content: space-between;
  padding: 22px 22px 14px;
}
.drawer-header h2 {
  margin: 3px 0 0;
  font-size: 1.45rem;
}
.section-tag {
  color: var(--accent);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.12em;
}
.drawer-close,
.password-dialog header button {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-secondary);
  cursor: pointer;
}
.drawer-tabs {
  gap: 6px;
  padding: 0 18px 15px;
  overflow-x: auto;
}
.drawer-tabs button,
.style-options button {
  flex: 0 0 auto;
  padding: 8px 11px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.76rem;
  cursor: pointer;
}
.drawer-tabs button.active,
.style-options button.selected {
  border-color: var(--accent-border);
  background: var(--accent-surface);
  color: var(--accent-light);
}
.drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 18px 24px;
}
.drawer-section h3 {
  margin: 7px 4px 12px;
  font-size: 1.05rem;
}
.drawer-card {
  margin-bottom: 12px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--card-bg);
}
.setting-row {
  justify-content: space-between;
  gap: 12px;
  padding: 14px 15px;
}
.setting-row + .setting-row {
  border-top: 1px solid var(--border-color);
}
.setting-row strong,
.setting-row small {
  display: block;
}
.setting-row strong {
  color: var(--text-primary);
  font-size: 0.86rem;
}
.setting-row p,
.setting-row small {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 0.76rem;
  line-height: 1.4;
}
.setting-column {
  align-items: stretch;
  flex-direction: column;
}
.theme-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.theme-option {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-secondary);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--transition-fast), background var(--transition-fast), color var(--transition-fast);
}
.theme-option.selected {
  border-color: var(--accent);
  background: var(--accent-surface);
  color: var(--accent-light);
}
.theme-preview {
  display: flex;
  width: 100%;
  height: 44px;
  gap: 5px;
  padding: 5px;
  overflow: hidden;
  box-sizing: border-box;
  border-radius: 8px;
  background: var(--theme-preview-bg);
}
.theme-preview-sidebar {
  width: 18%;
  flex: 0 0 18%;
  border-radius: 3px;
  background: var(--theme-preview-surface);
}
.theme-preview-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: space-between;
  padding: 2px 0;
}
.theme-preview-card {
  width: 72%;
  height: 16px;
  border-radius: 3px;
  background: var(--theme-preview-surface);
}
.theme-preview-accent-bar {
  width: 52%;
  height: 5px;
  border-radius: 999px;
  background: var(--theme-preview-accent);
}
.theme-option-footer {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
}
.theme-option-name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: 0.85rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.theme-option-footer > svg {
  flex: 0 0 auto;
  margin-left: auto;
  color: var(--accent-light);
}
.style-options {
  flex-wrap: wrap;
  gap: 6px;
}
.visualizer-amplitude-heading,
.visualizer-amplitude-control {
  display: flex;
  align-items: center;
  gap: 12px;
}
.visualizer-amplitude-heading { justify-content: space-between; }
.visualizer-amplitude-heading > div { min-width: 0; }
.visualizer-amplitude-heading output {
  flex: 0 0 auto;
  padding: 4px 8px;
  border: 1px solid var(--accent-border);
  border-radius: 999px;
  background: var(--accent-surface);
  color: var(--accent-light);
  font-size: 0.8rem;
  font-weight: 700;
}
.visualizer-amplitude-control input[type="range"] {
  width: 100%;
  min-width: 0;
  accent-color: var(--accent);
}
.visualizer-amplitude-reset {
  flex: 0 0 auto;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.74rem;
  cursor: pointer;
}
.visualizer-amplitude-reset:disabled { cursor: default; opacity: 0.45; }
.drawer-select {
  max-width: 48%;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-primary);
}
.drawer-button {
  min-height: 34px;
  padding: 7px 11px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-primary);
  font: inherit;
  font-size: 0.76rem;
  font-weight: 650;
  cursor: pointer;
}
.drawer-button.primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
}
.drawer-button.danger {
  border-color: color-mix(in srgb, var(--warning-danger) 45%, transparent);
  color: var(--warning-danger);
}
.drawer-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.button-stack {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}
.local-badge {
  padding: 6px 10px;
  border: 1px solid var(--accent-border);
  border-radius: 999px;
  background: var(--accent-surface);
  color: var(--accent-light);
  font-size: 0.75rem;
}
.drawer-message {
  margin: 0;
  padding: 0 15px 13px;
  color: var(--accent-light);
  font-size: 0.78rem;
}
.drawer-message.error {
  color: var(--warning-danger);
  padding: 0;
}
.danger-card {
  border-color: color-mix(
    in srgb,
    var(--warning-danger) 35%,
    var(--border-color)
  );
}
.settings-drawer-enter-active,
.settings-drawer-leave-active {
  transition: opacity var(--transition-normal);
}
.settings-drawer-enter-active .settings-drawer,
.settings-drawer-leave-active .settings-drawer {
  transition: transform var(--transition-normal);
}
.settings-drawer-enter-from,
.settings-drawer-leave-to {
  opacity: 0;
}
.settings-drawer-enter-from .settings-drawer,
.settings-drawer-leave-to .settings-drawer {
  transform: translateX(100%);
}
.password-backdrop {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  place-items: center;
  padding: 18px;
  background: color-mix(in srgb, var(--bg-primary) 78%, transparent);
}
.password-dialog {
  width: min(100%, 360px);
  padding: 18px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
  box-shadow: var(--shadow-md);
}
.password-dialog header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.password-dialog h3 {
  margin: 0;
}
.password-dialog label {
  display: grid;
  gap: 6px;
  margin: 12px 0;
  color: var(--text-secondary);
  font-size: 0.8rem;
}
.password-dialog input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-primary);
}
.dialog-actions {
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
@media (max-width: 520px) {
  .drawer-tabs {
    padding-inline: 12px;
  }
  .drawer-tabs button {
    padding-inline: 9px;
  }
  .drawer-content {
    padding-inline: 12px;
  }
  .theme-options {
    grid-template-columns: 1fr;
  }
  .setting-row {
    padding-inline: 12px;
  }
}
</style>
