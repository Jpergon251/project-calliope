// =============================================================
// Perfil y preferencias del usuario (100% local).
// Perfiles locales almacenados en IndexedDB ("profiles").
// Soporte para perfiles privados con contraseñas derivadas con PBKDF2 + salt.
// Modo invitado temporal sin persistencia de datos.
// =============================================================
import { defineStore } from "pinia";
import { computed, ref, toRaw, watch } from "vue";
import { dbPromise } from "../lib/db.js";
import { Capacitor } from "@capacitor/core";
import { toDisplayUrl } from "../lib/covers.js";
import FolderPicker from "../plugins/folderPicker.js";
import {
  generateProfileId,
  hashPassword,
  verifyPassword,
} from "../lib/crypto.js";
import {
  getColorPalette,
  normalizePaletteId,
} from "../lib/colorPalettes.js";
import { normalizeVisualizerStyle } from "../lib/visualizerStyles.js";
import { DEFAULT_PREFERENCES } from "../lib/profilePreferences.js";
import {
  findUsernameOwner,
  normalizeUsername,
  validateUsername,
} from "../lib/profileIdentity.js";
import { useLibraryStore } from "./libraryStore.js";
import { scheduleProfileSync } from "../services/profileArchives.js";
import { clearGoogleDriveToken } from "../services/googleDriveProfiles.js";

const LS_LEGACY_KEY = "calliope-user-profile";
const LS_SESSION_KEY = "calliope-active-session";
const SS_GUEST_KEY = "calliope-guest-session";
const SS_PENDING_PREFS_KEY = "calliope-pending-preferences";
const LS_GUEST_PREFS_KEY = "calliope-guest-preferences";
// La sesión de invitado no vive en IndexedDB ("profiles"), pero su avatar
// sí necesita persistir entre recargas: lo guardamos en la tienda
// "settings", igual que hace la migración del perfil legado.
const AVATAR_SETTING_KEY = "guest-avatar";

export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 horas

export { DEFAULT_PREFERENCES };

export const DEFAULT_PROFILE = {
  id: "",
  name: "",
  displayName: "",
  username: "",
  bio: "",
  avatarUrl: "",
  createdAt: null,
  updatedAt: null,
  isPrivate: false,
  private: false,
  credential: null, // { hash, salt, iterations, algorithm }
  queueState: null,
  preferences: { ...DEFAULT_PREFERENCES },
  ...DEFAULT_PREFERENCES,
};

export const useUserStore = defineStore("user", () => {
  const profile = ref({ ...DEFAULT_PROFILE });
  const avatarBlob = ref(null);
  const bannerBlob = ref(null);
  const loaded = ref(false);
  const profilesList = ref([]);
  let themeTransitionTimeout = null;
  const currentSession = ref(null); // { type: 'registered' | 'guest', profileId: string | null, isGuest: boolean, startedAt: number }
  // Preferencias elegidas antes de que exista un perfil (onboarding).
  const pendingPreferences = ref({ ...DEFAULT_PREFERENCES });

  const hasSession = computed(() => Boolean(currentSession.value));
  const isGuest = computed(() => Boolean(currentSession.value?.isGuest));
  const isRegistered = computed(
    () => Boolean(currentSession.value && !currentSession.value.isGuest)
  );
  const sessionType = computed(() => currentSession.value?.type || null);
  const hasPassword = computed(() =>
    Boolean(profile.value.credential?.hash && profile.value.credential?.salt)
  );

  const avatarUrl = computed(() => {
    if (
      profile.value.avatarUrl &&
      typeof profile.value.avatarUrl === "string" &&
      profile.value.avatarUrl.trim().length > 0
    ) {
      return profile.value.avatarUrl.trim();
    }
    return toDisplayUrl(avatarBlob.value);
  });
  const bannerUrl = computed(() => toDisplayUrl(bannerBlob.value));

  const initials = computed(() => {
    const source =
      profile.value.displayName ||
      profile.value.name ||
      profile.value.username ||
      (isGuest.value ? "Invitado" : "C");
    const parts = source.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "C";
  });

  const hasCustomProfile = computed(() =>
    Boolean(
      profile.value.username ||
      profile.value.displayName ||
      profile.value.name ||
      profile.value.bio ||
      avatarBlob.value
    )
  );

  function normalizeProfile(raw = {}) {
    const preferences = {
      ...DEFAULT_PREFERENCES,
      ...(raw.preferences || {}),
    };
    if (
      raw.preferences?.accentColor === undefined &&
      raw.accentColor !== undefined
    ) {
      preferences.accentColor = raw.accentColor;
    }
    preferences.accentColor = normalizePaletteId(preferences.accentColor);
    preferences.visualizerStyle = normalizeVisualizerStyle(
      preferences.visualizerStyle,
    );
    // Una preferencia guardada como undefined no debe pisar el valor por defecto.
    for (const key of Object.keys(preferences)) {
      if (preferences[key] === undefined) {
        preferences[key] = DEFAULT_PREFERENCES[key];
      }
    }
    for (const key of Object.keys(DEFAULT_PREFERENCES)) {
      // Una clave plana sólo aporta valor si la preferencia no viene ya en
      // `preferences`; de lo contrario el valor guardado se perdería.
      if (
        raw[key] !== undefined &&
        raw.preferences?.[key] === undefined &&
        preferences[key] === undefined
      ) {
        preferences[key] = raw[key];
      }
    }
    // Mantener sincronizadas las claves planas con `preferences`. La interfaz
    // escribe en las claves planas (profile.accentColor) mientras que el
    // almacenamiento vive en `preferences`; sin esta copia se persistía el
    // valor antiguo y los ajustes se revertían al recargar.
    for (const key of Object.keys(DEFAULT_PREFERENCES)) {
      if (preferences[key] !== undefined) {
        raw[key] = preferences[key];
      }
    }

    const name = (raw.displayName || raw.name || raw.username || "").trim();
    const isPriv = Boolean(
      raw.private !== undefined ? raw.private : raw.isPrivate
    );

    return {
      id: raw.id || generateProfileId(),
      name: name || "Oyente",
      displayName: raw.displayName || name || "Oyente",
      username: normalizeUsername(raw.username || ""),
      bio: raw.bio || "",
      avatarUrl: raw.avatarUrl || "",
      avatarBlob: raw.avatarBlob || null,
      createdAt: raw.createdAt || Date.now(),
      updatedAt: raw.updatedAt || Date.now(),
      isPrivate: isPriv,
      private: isPriv,
      credential: raw.credential || null,
      queueState: raw.queueState || null,
      preferences,
      ...preferences,
    };
  }

  async function persistProfileWithUniqueUsername(profileRecord, { create = false } = {}) {
    const usernameResult = validateUsername(profileRecord.username || "");
    if (profileRecord.username && !usernameResult.valid) {
      throw new Error(usernameResult.reason);
    }
    if (create && !usernameResult.valid) {
      throw new Error(usernameResult.reason || "El nombre de usuario es obligatorio.");
    }

    const db = await dbPromise;
    const tx = db.transaction("profiles", "readwrite");
    const done = tx.done;
    try {
      const store = tx.objectStore("profiles");
      const profiles = await store.getAll();
      const owner = usernameResult.valid
        ? findUsernameOwner(usernameResult.username, profiles, create ? null : profileRecord.id)
        : null;
      if (owner) {
        throw new Error(`El nombre de usuario @${usernameResult.username} ya está en uso.`);
      }

      // Las preferencias pendientes solo se consumen al crear un perfil. Al
      // volver a iniciar sesión, los valores por defecto pendientes no deben
      // pisar las preferencias que ya están guardadas para este perfil.
      const normalized = normalizeProfile({
        ...profileRecord,
        username: usernameResult.valid ? usernameResult.username : "",
      });
      if (create) await store.add(normalized);
      else await store.put(normalized);
      await done;
      return normalized;
    } catch (error) {
      try { tx.abort(); } catch {}
      try { await done; } catch {}
      throw error;
    }
  }
  async function loadProfiles() {
    try {
      const db = await dbPromise;
      if (!db.objectStoreNames.contains("profiles")) {
        return [];
      }
      let list = await db.getAll("profiles");
      if (!list || list.length === 0) {
        list = await migrateLegacyProfileIfNeeded();
      }
      profilesList.value = (list || [])
        .map(normalizeProfile)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return profilesList.value;
    } catch (err) {
      console.warn("[userStore] Error al cargar perfiles locales:", err);
      return [];
    }
  }

  async function migrateLegacyProfileIfNeeded() {
    try {
      const raw = localStorage.getItem(LS_LEGACY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!parsed.displayName && !parsed.username) return [];

      const db = await dbPromise;
      let avatar = null;
      try {
        avatar = await db.get("settings", "profile-avatar");
      } catch {}

      const migrated = normalizeProfile({
        ...parsed,
        avatarBlob: avatar instanceof Blob ? avatar : null,
        avatarUrl: typeof avatar === "string" ? avatar : parsed.avatarUrl || "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isPrivate: false,
        credential: null,
      });

      await db.put("profiles", migrated);
      localStorage.removeItem(LS_LEGACY_KEY);
      return [migrated];
    } catch (e) {
      console.warn("[userStore] Error al migrar perfil legado:", e);
      return [];
    }
  }

  function createSession(profileId) {
    const now = Date.now();
    const session = {
      profileId,
      createdAt: now,
      lastActivity: now,
      expiresAt: now + SESSION_DURATION_MS,
      type: "registered",
      isGuest: false,
    };

    currentSession.value = session;

    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LS_SESSION_KEY, JSON.stringify(session));
    }
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(SS_GUEST_KEY);
    }

    return session;
  }

  function getActiveSession() {
    return currentSession.value;
  }

  function isSessionValid(session = currentSession.value) {
    if (!session || typeof session !== "object") return false;
    if (!session.createdAt || !session.expiresAt) return false;

    const now = Date.now();

    // 1. Comprobar si la sesión ha expirado
    if (now >= session.expiresAt) {
      return false;
    }

    // 2. Comprobar que no supere la duración máxima permitida de 24 horas
    if (session.expiresAt - session.createdAt > SESSION_DURATION_MS + 2000) {
      return false;
    }

    return true;
  }

  function clearPendingPreferences() {
    pendingPreferences.value = { ...DEFAULT_PREFERENCES };
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(SS_PENDING_PREFS_KEY);
    }
  }

  function updateSessionActivity() {
    if (!currentSession.value) return;

    const now = Date.now();

    if (!isSessionValid(currentSession.value)) {
      logout();
      return;
    }

    currentSession.value.lastActivity = now;

    if (currentSession.value.isGuest) {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(
          SS_GUEST_KEY,
          JSON.stringify(currentSession.value)
        );
      }
    } else {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(
          LS_SESSION_KEY,
          JSON.stringify(currentSession.value)
        );
      }
    }
  }

  async function restoreSession() {
    // 1. Comprobar si existe sesión temporal de invitado en sessionStorage
    if (typeof sessionStorage !== "undefined") {
      const guestRaw = sessionStorage.getItem(SS_GUEST_KEY);
      if (guestRaw) {
        try {
          const guestSession = JSON.parse(guestRaw);
          if (isSessionValid(guestSession)) {
            currentSession.value = guestSession;
            updateSessionActivity();

            // El invitado no tiene perfil en IndexedDB, así que su avatar
            // se recupera de la tienda "settings" para que no se pierda
            // al recargar.
            const guestAvatar = await readGuestAvatar();

            profile.value = normalizeProfile({
              id: "guest",
              name: "Invitado",
              displayName: "Invitado",
              username: "invitado",
              bio: "",
              avatarUrl:
                typeof guestAvatar === "string" ? guestAvatar : "",
              avatarBlob: guestAvatar instanceof Blob ? guestAvatar : null,
              createdAt: guestSession.createdAt,
              updatedAt: guestSession.lastActivity,
              isPrivate: false,
              credential: null,
              preferences: {
                ...DEFAULT_PREFERENCES,
                ...toRaw(pendingPreferences.value || {}),
                ...readGuestPreferences(),
              },
            });

            avatarBlob.value =
              guestAvatar instanceof Blob ? guestAvatar : null;
            bannerBlob.value = null;
            applyPreferences();
            return true;
          } else {
            sessionStorage.removeItem(SS_GUEST_KEY);
          }
        } catch {
          sessionStorage.removeItem(SS_GUEST_KEY);
        }
      }
    }

    // 2. Comprobar si existe sesión de perfil registrado en localStorage
    if (typeof localStorage !== "undefined") {
      const activeRaw = localStorage.getItem(LS_SESSION_KEY);
      if (activeRaw) {
        try {
          const session = JSON.parse(activeRaw);

          // 3. Comprobar si no ha expirado
          if (isSessionValid(session) && session.profileId) {
            // 2. Comprobar si pertenece a un perfil existente
            const list =
              profilesList.value.length > 0
                ? profilesList.value
                : await loadProfiles();
            const found = list.find((p) => p.id === session.profileId);

            if (found) {
              // 4. Si es válida, restaurar automáticamente ese perfil
              profile.value = { ...found };
              avatarBlob.value = found.avatarBlob || null;
              currentSession.value = session;
              updateSessionActivity();
              applyPreferences();
              return true;
            }
          }

          // 5. Si ha expirado o el perfil no existe, eliminar la sesión
          localStorage.removeItem(LS_SESSION_KEY);
        } catch {
          localStorage.removeItem(LS_SESSION_KEY);
        }
      }
    }

    // 6. Si no existe sesión, dejamos sin sesión activa (WelcomeScreen)
    currentSession.value = null;
    profile.value = { ...DEFAULT_PROFILE };
    avatarBlob.value = null;
    bannerBlob.value = null;
    applyPreferences();
    return false;
  }

  async function load() {
    try {
      pendingPreferences.value = {
        ...DEFAULT_PREFERENCES,
        ...readPendingPreferences(),
      };
      pendingPreferences.value.accentColor = normalizePaletteId(
        pendingPreferences.value.accentColor
      );
      pendingPreferences.value.visualizerStyle = normalizeVisualizerStyle(
        pendingPreferences.value.visualizerStyle,
      );

      // `load()` se invoca desde el router, App.vue y varias páginas.
      // Volver a restaurar la sesión ya restaurada descartaba el perfil
      // en memoria (con las preferencias aún no guardadas) y lo sustituía
      // por la copia de IndexedDB, revirtiendo el color de acento y los
      // ajustes recién cambiados.
      if (loaded.value && currentSession.value) {
        return;
      }

      await loadProfiles();
      await restoreSession();
    } catch (err) {
      console.warn("[userStore] Error en load():", err);
    } finally {
      loaded.value = true;
    }
  }

  async function createProfile({
    name = "",
    displayName = "",
    username = "",
    bio = "",
    avatarUrl = "",
    avatarBlob: customAvatarBlob = null,
    isPrivate = false,
    password = "",
    preferences = {},
  }) {
    const usernameResult = validateUsername(username);
    if (!usernameResult.valid) throw new Error(usernameResult.reason);

    // Recoge lo elegido durante el onboarding (p. ej. el color de acento).
    preferences = {
      ...toRaw(pendingPreferences.value || {}),
      ...preferences,
    };
    const id = generateProfileId();
    let credential = null;

    if (isPrivate && password) {
      credential = await hashPassword(password);
    }

    const newProfile = normalizeProfile({
      id,
      name: (displayName || name || username || "").trim(),
      displayName: (displayName || name || username || "").trim(),
      username: usernameResult.username,
      bio: (bio || "").trim(),
      avatarUrl: (avatarUrl || "").trim(),
      avatarBlob: customAvatarBlob || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPrivate: Boolean(isPrivate),
      credential,
      preferences: {
        ...DEFAULT_PREFERENCES,
        ...preferences,
      },
    });

    const persistedProfile = await persistProfileWithUniqueUsername(newProfile, { create: true });
    scheduleProfileSync(id);
    await loadProfiles();
    await loginProfile(id);

    return persistedProfile;
  }

  async function loginProfile(profileId, password = null) {
    // Este login no es un inicio de sesión: el perfil ya está activo y sólo
    // se está re-sincronizando la copia en memoria. No debe consumir las
    // preferencias pendientes del onboarding ni reemplazar el perfil actual.
    if (loaded.value && currentSession.value?.profileId === profileId) {
      return { success: true, alreadyActive: true };
    }

    const db = await dbPromise;
    const target = await db.get("profiles", profileId);

    if (!target) {
      return { success: false, error: "Perfil no encontrado" };
    }

    const isTargetPrivate = Boolean(
      target.private !== undefined ? target.private : target.isPrivate
    );

    if (isTargetPrivate) {
      if (!password) {
        return {
          success: false,
          requiresPassword: true,
          error: "Contraseña requerida",
        };
      }
      const valid = await verifyPassword(password, target.credential);
      if (!valid) {
        return {
          success: false,
          requiresPassword: true,
          error: "Contraseña incorrecta",
        };
      }
    }

    const previousProfileId = currentSession.value?.profileId;
    if (previousProfileId && previousProfileId !== profileId) {
      try {
        await useLibraryStore().flushPendingProfileChanges(previousProfileId);
      } catch (error) {
        console.error("[userStore] No se pudieron guardar los ajustes antes del cambio:", error);
        return { success: false, error: "No se pudieron guardar los cambios pendientes del perfil actual." };
      }
    }

    const normalized = normalizeProfile({
      ...target,
      ...(target.preferences || {}),
      preferences: target.preferences || {},
    });
    profile.value = normalized;
    avatarBlob.value = normalized.avatarBlob || null;

    // Las preferencias pendientes ya forman parte del perfil activo.
    clearPendingPreferences();

    // Crear sesión local con expiración de 24 horas
    createSession(normalized.id);

    applyPreferences();

    try {
      const library = useLibraryStore();
      await library.switchProfile();
    } catch {}

    return { success: true };
  }

  async function startGuestSession() {
    const now = Date.now();
    const session = {
      profileId: null,
      createdAt: now,
      lastActivity: now,
      expiresAt: now + SESSION_DURATION_MS,
      type: "guest",
      isGuest: true,
    };

    const guestProfile = normalizeProfile({
      id: "guest",
      name: "Invitado",
      displayName: "Invitado",
      username: "invitado",
      bio: "",
      avatarUrl: "",
      avatarBlob: null,
      createdAt: now,
      updatedAt: now,
      isPrivate: false,
      credential: null,
      preferences: {
        ...DEFAULT_PREFERENCES,
        ...readGuestPreferences(),
        ...toRaw(pendingPreferences.value || {}),
      },
    });

    profile.value = guestProfile;
    avatarBlob.value = null;
    bannerBlob.value = null;
    currentSession.value = session;

    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(SS_GUEST_KEY, JSON.stringify(session));
    }
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(LS_SESSION_KEY);
    }

    applyPreferences();

    try {
      const library = useLibraryStore();
      await library.switchProfile();
    } catch {}

    return session;
  }

  async function loginAsGuest() {
    startGuestSession();
    return { success: true };
  }

  function isGuestSession() {
    return Boolean(currentSession.value?.isGuest);
  }

  async function logout() {
    // Al cerrar sesión:
    // - eliminar únicamente la sesión activa.
    // - conservar completamente el perfil y sus datos en IndexedDB.
    // - volver a mostrar la WelcomeScreen.
    const previousProfileId = currentSession.value?.profileId;
    if (previousProfileId) {
      try {
        await useLibraryStore().flushPendingProfileChanges(previousProfileId);
      } catch (error) {
        console.error("[userStore] No se pudieron guardar los ajustes al cerrar sesión:", error);
        return { success: false, error: "No se pudieron guardar los cambios pendientes del perfil." };
      }
    }

    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(SS_GUEST_KEY);
    }
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(LS_GUEST_PREFS_KEY);
    }
    clearPendingPreferences();
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(LS_SESSION_KEY);
    }

    currentSession.value = null;
    profile.value = { ...DEFAULT_PROFILE };
    avatarBlob.value = null;
    bannerBlob.value = null;

    applyPreferences();
    await loadProfiles();

    try {
      const library = useLibraryStore();
      await library.switchProfile();
    } catch {}

    return { success: true };
  }

  async function setProfilePrivacy(isPrivate, newPassword = null) {
    if (isGuest.value || !profile.value.id) {
      return { success: false, error: "No aplicable a invitados" };
    }

    const shouldBePrivate = Boolean(isPrivate);

    if (shouldBePrivate) {
      if (newPassword) {
        const cred = await hashPassword(newPassword);
        profile.value.credential = cred;
      } else if (!profile.value.credential) {
        return {
          success: false,
          requiresPassword: true,
          error: "Se requiere establecer una contraseña",
        };
      }
    }

    profile.value.private = shouldBePrivate;
    profile.value.isPrivate = shouldBePrivate;

    await save();
    return { success: true };
  }

  function readGuestPreferences() {
    if (typeof localStorage === "undefined") return {};
    try {
      const raw = localStorage.getItem(LS_GUEST_PREFS_KEY);
      return raw ? JSON.parse(raw) || {} : {};
    } catch {
      return {};
    }
  }

  function readPendingPreferences() {
    if (typeof sessionStorage === "undefined") return {};
    try {
      const raw = sessionStorage.getItem(SS_PENDING_PREFS_KEY);
      return raw ? JSON.parse(raw) || {} : {};
    } catch {
      return {};
    }
  }

  function setPendingPreferences(partial = {}) {
    pendingPreferences.value = {
      ...pendingPreferences.value,
      ...partial,
    };
    pendingPreferences.value.accentColor = normalizePaletteId(
      pendingPreferences.value.accentColor
    );

    if (typeof sessionStorage !== "undefined") {
      try {
        sessionStorage.setItem(
          SS_PENDING_PREFS_KEY,
          JSON.stringify(pendingPreferences.value)
        );
      } catch {
        // sessionStorage puede no estar disponible; no es crítico.
      }
    }
  }

  async function save() {
    if (!profile.value.id) {
      return false;
    }

    // La interfaz edita las claves planas (profile.showVisualizer,
    // profile.accentColor...), mientras que el almacenamiento vive en
    // `preferences`. Sincronizamos aquí para que cualquier cambio se
    // persista, venga de `updateProfile` o de un `v-model` directo.
    const syncedPreferences = { ...toRaw(profile.value.preferences || {}) };
    for (const key of Object.keys(DEFAULT_PREFERENCES)) {
      if (profile.value[key] !== undefined) {
        syncedPreferences[key] = toRaw(profile.value[key]);
      }
    }
    profile.value.preferences = syncedPreferences;

    // Los invitados no tienen perfil persistente, pero sus preferencias
    // deben sobrevivir a la navegación y a las recargas de la página.
    if (isGuest.value) {
      if (typeof localStorage !== "undefined") {
        try {
          localStorage.setItem(
            LS_GUEST_PREFS_KEY,
            JSON.stringify(toRaw(profile.value.preferences || {}))
          );
        } catch {
          // Almacenamiento no disponible; las preferencias siguen en memoria.
        }
      }
      return true;
    }

    let saved = false;
    try {
      updateSessionActivity();

      const db = await dbPromise;
      if (db.objectStoreNames.contains("profiles")) {
        const isPriv = Boolean(
          profile.value.private !== undefined
            ? profile.value.private
            : profile.value.isPrivate
        );
        const rawProfile = toRaw(profile.value);
        const rawPreferences = toRaw(rawProfile.preferences || {});
        const currentAvatarBlob = avatarBlob.value || rawProfile.avatarBlob || null;
        const currentBannerBlob = bannerBlob.value || null;

        // Extraer un clon limpio sin Proxies de Vue que puedan causar DataCloneError
        const cloneClean = {
          ...rawProfile,
          preferences: { ...rawPreferences },
        };
        delete cloneClean.avatarBlob;
        delete cloneClean.bannerBlob;

        const serialized = JSON.parse(JSON.stringify(cloneClean));

        // El Blob del avatar/banner NO sobrevive a JSON.stringify (se
        // convierte en {}). Lo reinyectamos explícitamente después de
        // serializar para que quede realmente persistido en IndexedDB.
        const toSave = normalizeProfile({
          ...serialized,
          private: isPriv,
          isPrivate: isPriv,
          avatarBlob: currentAvatarBlob instanceof Blob ? currentAvatarBlob : null,
          bannerBlob: currentBannerBlob instanceof Blob ? currentBannerBlob : null,
          updatedAt: Date.now(),
        });

        const persisted = await persistProfileWithUniqueUsername(toSave);
        saved = true;
        scheduleProfileSync(persisted.id);

        // Mantenemos el perfil en memoria coherente con lo persistido: sin
        // esto, `avatarBlob.value` seguía vivo sólo en esta sesión y el
        // avatar desaparecía tras recargar.
        profile.value.avatarBlob = persisted.avatarBlob;

        const idx = profilesList.value.findIndex((p) => p.id === persisted.id);
        if (idx >= 0) {
          profilesList.value[idx] = { ...persisted };
        }
      }
    } catch (e) {
      console.warn("[userStore] Error al guardar perfil:", e);
    }
    return saved;
  }

  async function updateProfile(partial) {
    // La interfaz escribe claves planas (p. ej. `accentColor`), pero el
    // almacenamiento vive en `preferences`. Sincronizamos ambas para que
    // `save()` no persista el valor antiguo.
    const nextPreferences = { ...(profile.value.preferences || {}) };
    for (const key of Object.keys(DEFAULT_PREFERENCES)) {
      if (partial[key] !== undefined) {
        nextPreferences[key] = partial[key];
      }
    }

    const previousProfile = { ...profile.value };
    const nextProfile = {
      ...profile.value,
      ...partial,
      preferences: nextPreferences,
    };
    if (Object.prototype.hasOwnProperty.call(partial, "username")) {
      const usernameResult = validateUsername(partial.username);
      if (!usernameResult.valid) throw new Error(usernameResult.reason);
      const owner = findUsernameOwner(usernameResult.username, profilesList.value, profile.value.id);
      if (owner) throw new Error(`El nombre de usuario @${usernameResult.username} ya está en uso.`);
      nextProfile.username = usernameResult.username;
    }

    profile.value = nextProfile;

    // Los invitados también deben conservar sus ajustes entre recargas,
    // aunque su perfil no viva en IndexedDB.
    const saved = await save();
    if (!saved) {
      profile.value = previousProfile;
      throw new Error("No se pudieron guardar los cambios del perfil.");
    }
  }

  async function updateProfilePreferences(profileId, partial = {}) {
    const db = await dbPromise;
    const stored = await db.get("profiles", profileId);
    if (!stored) throw new Error("No se encontró el perfil para guardar sus preferencias.");
    const preferences = { ...(stored.preferences || {}) };
    for (const key of Object.keys(DEFAULT_PREFERENCES)) {
      if (partial[key] !== undefined) preferences[key] = partial[key];
    }
    const updated = normalizeProfile({
      ...stored,
      ...partial,
      preferences,
      updatedAt: Date.now(),
    });
    await db.put("profiles", updated);
    const index = profilesList.value.findIndex((item) => item.id === profileId);
    if (index >= 0) profilesList.value[index] = updated;
    if (currentSession.value?.profileId === profileId) {
      profile.value = updated;
      applyPreferences();
    }
    scheduleProfileSync(profileId);
  }

  async function updateProfileQueueState(profileId, queueState) {
    const db = await dbPromise;
    const stored = await db.get("profiles", profileId);
    if (!stored) throw new Error("No se encontró el perfil para guardar la cola.");
    const updated = {
      ...stored,
      queueState: queueState || null,
      updatedAt: Date.now(),
    };
    await db.put("profiles", updated);
    const index = profilesList.value.findIndex((item) => item.id === profileId);
    if (index >= 0) profilesList.value[index] = updated;
    if (currentSession.value?.profileId === profileId) profile.value.queueState = updated.queueState;
    scheduleProfileSync(profileId);
  }

  async function renameProfile(profileId, name) {
    const nextName = String(name || "").trim();
    if (!profileId || !nextName) {
      throw new Error("El nombre del perfil no puede estar vacío.");
    }
    const db = await dbPromise;
    const stored = await db.get("profiles", profileId);
    if (!stored) throw new Error("No se encontró el perfil que se desea renombrar.");

    const renamed = {
      ...stored,
      name: nextName,
      displayName: nextName,
      updatedAt: Date.now(),
    };
    await db.put("profiles", renamed);
    const index = profilesList.value.findIndex((item) => item.id === profileId);
    if (index >= 0) profilesList.value[index] = normalizeProfile(renamed);
    scheduleProfileSync(profileId);

    if (profile.value.id === profileId) {
      profile.value = normalizeProfile(renamed);
      avatarBlob.value = profile.value.avatarBlob || null;
      applyPreferences();
    }
  }

  async function reloadActiveProfile(profileId) {
    if (currentSession.value?.profileId !== profileId) return;
    const db = await dbPromise;
    const stored = await db.get("profiles", profileId);
    if (!stored) throw new Error("No se encontró el perfil activo.");
    profile.value = normalizeProfile(stored);
    avatarBlob.value = profile.value.avatarBlob || null;
    applyPreferences();
    await useLibraryStore().switchProfile();
  }

  async function setAvatar(data) {
    if (typeof data === "string" && data.trim()) {
      profile.value.avatarUrl = data.trim();
      avatarBlob.value = null;
    } else if (data instanceof Blob) {
      profile.value.avatarUrl = "";
      avatarBlob.value = data;
    } else {
      profile.value.avatarUrl = "";
      avatarBlob.value = null;
    }

    if (!isGuest.value) {
      await save();
      return;
    }

    // Los invitados no tienen perfil en IndexedDB, así que persistimos el
    // avatar por separado para que sobreviva a una recarga.
    await saveGuestAvatar();
  }

  /** Persiste (o borra) el avatar del invitado en IndexedDB. */
  async function saveGuestAvatar() {
    try {
      const db = await dbPromise;
      if (!db.objectStoreNames.contains("settings")) return;

      const value =
        avatarBlob.value instanceof Blob
          ? avatarBlob.value
          : profile.value.avatarUrl || null;

      if (value) {
        await db.put("settings", value, AVATAR_SETTING_KEY);
      } else {
        await db.delete("settings", AVATAR_SETTING_KEY);
      }
    } catch (err) {
      console.warn("[userStore] No se pudo guardar el avatar del invitado:", err);
    }
  }

  /** Recupera el avatar del invitado guardado (URL o Blob). */
  async function readGuestAvatar() {
    try {
      const db = await dbPromise;
      if (!db.objectStoreNames.contains("settings")) return null;
      return (await db.get("settings", AVATAR_SETTING_KEY)) || null;
    } catch {
      return null;
    }
  }

  async function setBanner(blob) {
    bannerBlob.value = blob || null;
    if (!isGuest.value) {
      await save();
    }
  }

  async function resetPreferences({ keepIdentity = true } = {}) {
    const identity = keepIdentity
      ? {
          id: profile.value.id,
          username: profile.value.username,
          displayName: profile.value.displayName,
          name: profile.value.name,
          bio: profile.value.bio,
          avatarUrl: profile.value.avatarUrl,
          createdAt: profile.value.createdAt,
          isPrivate: profile.value.isPrivate,
          credential: profile.value.credential,
        }
      : {};
    profile.value = normalizeProfile({
      ...DEFAULT_PROFILE,
      ...identity,
    });
    if (!isGuest.value) {
      await save();
    }
  }

  async function wipeProfile(profileId = null) {
    const targetId = profileId || profile.value.id;
    if (!targetId || targetId === "guest") {
      await logout();
      return;
    }

    const wasActive = currentSession.value?.profileId === targetId;

    if (wasActive) {
      try {
        await useLibraryStore().flushPendingProfileChanges(targetId);
      } catch (error) {
        console.error("[userStore] No se pudieron guardar los ajustes antes de eliminar el perfil:", error);
        throw new Error("No se pudo guardar el último cambio del perfil; no se eliminó.");
      }
    }

    const db = await dbPromise;
    const stores = ["profiles", "playlists", "history", "playback_stats", "song_ratings", "settings"];
    const tx = db.transaction(stores, "readwrite");
    try {
      for (const storeName of stores.filter((name) => name !== "settings")) {
        const store = tx.objectStore(storeName);
        const records = await store.getAll();
        for (const record of records) {
          if (
            (storeName === "profiles" && record.id === targetId)
            || (storeName !== "profiles" && record.profileId === targetId)
          ) {
            await store.delete(record.id);
          }
        }
      }
      tx.objectStore("settings").delete(`music-folder-${targetId}`);
      tx.objectStore("settings").delete(`google-drive-profile:${targetId}`);
      await tx.done;
      clearGoogleDriveToken(targetId);
      if (Capacitor.isNativePlatform()) {
        try {
          await FolderPicker.clearSavedFolder({ profileId: targetId });
        } catch (error) {
          console.warn("[userStore] No se pudo desvincular la carpeta Android:", error);
        }
        if (typeof localStorage !== "undefined") {
          try {
            localStorage.removeItem(`calliope:queue_state:${targetId}`);
          } catch (error) {
            console.warn("[userStore] No se pudo eliminar la cola local del perfil:", error);
          }
        }
      }
    } catch (error) {
      try { tx.abort(); } catch {}
      console.error("[userStore] Error al eliminar el perfil:", error);
      throw new Error("No se pudo eliminar el perfil. Los datos no confirmados se conservaron.");
    }

    if (wasActive) {
      await logout();
    } else {
      await loadProfiles();
    }
  }

  async function deleteProfile(profileId) {
    await wipeProfile(profileId);
  }

  // ---------- Aplicación de preferencias al documento ----------
  function applyPreferences() {
    const isPersistentProfile =
      Boolean(profile.value.id) && profile.value.id !== "guest";

    // Para invitados, las preferencias guardadas viven en localStorage y se
    // cargan en `profile.preferences`; las claves planas del perfil sólo
    // aportan el valor por defecto y no deben pisarlas.
    const savedPreferences = isPersistentProfile
      ? profile.value.preferences || {}
      : {
          // Lo guardado en disco gana sobre los valores por defecto, y las
          // preferencias del perfil en memoria ganan sobre ambos.
          ...toRaw(pendingPreferences.value || {}),
          ...readGuestPreferences(),
          ...(profile.value.preferences || {}),
        };

    const p = {
      ...DEFAULT_PREFERENCES,
      ...savedPreferences,
      ...(isPersistentProfile ? profile.value : {}),
    };
    const palette = getColorPalette(p.accentColor);
    const root = document.documentElement;
    const isThemeChange =
      Boolean(root.dataset.theme) && root.dataset.theme !== palette.value;
    const shouldTransitionTheme =
      isThemeChange &&
      !p.reducedMotion &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    clearTimeout(themeTransitionTimeout);
    if (isThemeChange) root.classList.add("theme-has-changed");
    root.classList.toggle("theme-transitioning", shouldTransitionTheme);
    root.dataset.theme = palette.value;
    for (const [token, value] of Object.entries(palette.tokens)) {
      root.style.setProperty(token, value);
    }
    root.classList.toggle("reduced-motion", Boolean(p.reducedMotion));

    if (shouldTransitionTheme) {
      themeTransitionTimeout = setTimeout(() => {
        root.classList.remove("theme-transitioning");
        themeTransitionTimeout = null;
      }, 420);
    }
  }

  watch(profile, applyPreferences, { deep: true });

  return {
    profile,
    avatarBlob,
    bannerBlob,
    avatarUrl,
    bannerUrl,
    initials,
    hasCustomProfile,
    loaded,
    profilesList,
    currentSession,
    hasSession,
    isGuest,
    isRegistered,
    sessionType,
    hasPassword,
    SESSION_DURATION_MS,
    createSession,
    getActiveSession,
    isSessionValid,
    restoreSession,
    updateSessionActivity,
    pendingPreferences,
    setPendingPreferences,
    clearPendingPreferences,
    startGuestSession,
    isGuestSession,
    setProfilePrivacy,
    load,
    loadProfiles,
    createProfile,
    loginProfile,
    loginAsGuest,
    logout,
    save,
    updateProfile,
    updateProfilePreferences,
    updateProfileQueueState,
    renameProfile,
    reloadActiveProfile,
    setAvatar,
    setBanner,
    resetPreferences,
    wipeProfile,
    deleteProfile,
    applyPreferences,
  };
});
