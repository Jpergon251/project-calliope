// =============================================================
// Perfil y preferencias del usuario (100% local).
// Perfiles locales almacenados en IndexedDB ("profiles").
// Soporte para perfiles privados con contraseñas derivadas con PBKDF2 + salt.
// Modo invitado temporal sin persistencia de datos.
// =============================================================
import { defineStore } from "pinia";
import { computed, ref, toRaw, watch } from "vue";
import { dbPromise } from "../lib/db.js";
import { toDisplayUrl } from "../lib/covers.js";
import {
  generateProfileId,
  hashPassword,
  verifyPassword,
} from "../lib/crypto.js";
import { useLibraryStore } from "./libraryStore.js";

const LS_LEGACY_KEY = "calliope-user-profile";
const LS_SESSION_KEY = "calliope-active-session";
const SS_GUEST_KEY = "calliope-guest-session";
const SS_PENDING_PREFS_KEY = "calliope-pending-preferences";
const LS_GUEST_PREFS_KEY = "calliope-guest-preferences";

export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 horas

export const DEFAULT_PREFERENCES = {
  accentColor: "neon", // neon | cyan | magenta | amber
  reducedMotion: false,
  showVisualizer: true,
  autoplayOnStart: false,
  keepQueueWhenClosing: true,
  homeShowHistory: true,
  homeShowTopAlbums: true,
  homeShowTopPlaylists: true,
  librarySortMode: "name",
  saveListeningHistory: true,
  localDataOnly: true,
  autoplay: true,
};

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
  preferences: { ...DEFAULT_PREFERENCES },
  ...DEFAULT_PREFERENCES,
};

export const useUserStore = defineStore("user", () => {
  const profile = ref({ ...DEFAULT_PROFILE });
  const avatarBlob = ref(null);
  const bannerBlob = ref(null);
  const loaded = ref(false);
  const profilesList = ref([]);
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
      username: raw.username || "",
      bio: raw.bio || "",
      avatarUrl: raw.avatarUrl || "",
      avatarBlob: raw.avatarBlob || null,
      createdAt: raw.createdAt || Date.now(),
      updatedAt: raw.updatedAt || Date.now(),
      isPrivate: isPriv,
      private: isPriv,
      credential: raw.credential || null,
      preferences,
      ...preferences,
    };
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

            profile.value = normalizeProfile({
              id: "guest",
              name: "Invitado",
              displayName: "Invitado",
              username: "invitado",
              bio: "",
              avatarUrl: "",
              avatarBlob: null,
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

            avatarBlob.value = null;
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
      username: (username || "").trim(),
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

    const db = await dbPromise;
    await db.put("profiles", newProfile);
    await loadProfiles();
    await loginProfile(id);

    return newProfile;
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

    const normalized = normalizeProfile({
      ...target,
      ...(target.preferences || {}),
      preferences: {
        ...(target.preferences || {}),
        ...toRaw(pendingPreferences.value || {}),
      },
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
      return;
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
      return;
    }

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

        const toSave = normalizeProfile({
          ...serialized,
          private: isPriv,
          isPrivate: isPriv,
          avatarBlob: currentAvatarBlob instanceof Blob ? currentAvatarBlob : null,
          bannerBlob: currentBannerBlob instanceof Blob ? currentBannerBlob : null,
          updatedAt: Date.now(),
        });
        await db.put("profiles", toSave);

        const idx = profilesList.value.findIndex((p) => p.id === toSave.id);
        if (idx >= 0) {
          profilesList.value[idx] = { ...toSave };
        }
      }
    } catch (e) {
      console.warn("[userStore] Error al guardar perfil:", e);
    }
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

    profile.value = {
      ...profile.value,
      ...partial,
      preferences: nextPreferences,
    };

    // Los invitados también deben conservar sus ajustes entre recargas,
    // aunque su perfil no viva en IndexedDB.
    await save();
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

    try {
      const db = await dbPromise;
      if (db.objectStoreNames.contains("profiles")) {
        await db.delete("profiles", targetId);
      }
    } catch (e) {
      console.warn("[userStore] Error al eliminar perfil:", e);
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
  const ACCENTS = {
    neon: {
      base: "#25d866",
      hover: "#55ed8a",
      active: "#18ae4f",
      light: "#8affae",
      dark: "#128f4a",
      darker: "#0b4d28",
      rgb: "37, 216, 102",
      borderHover: "rgba(138, 255, 174, 0.4)",
      glow: "0 0 14px rgba(37, 216, 102, 0.35)",
      glowSoft: "0 0 26px rgba(37, 216, 102, 0.18)",
    },
    cyan: {
      base: "#22d3ee",
      hover: "#67e8f9",
      active: "#0891b2",
      light: "#a5f3fc",
      dark: "#0e7490",
      darker: "#155e75",
      rgb: "34, 211, 238",
      borderHover: "rgba(165, 243, 252, 0.4)",
      glow: "0 0 14px rgba(34, 211, 238, 0.35)",
      glowSoft: "0 0 26px rgba(34, 211, 238, 0.18)",
    },
    magenta: {
      base: "#e14eca",
      hover: "#f472b6",
      active: "#c026d3",
      light: "#fbcfe8",
      dark: "#a21caf",
      darker: "#701a75",
      rgb: "225, 78, 202",
      borderHover: "rgba(251, 207, 232, 0.4)",
      glow: "0 0 14px rgba(225, 78, 202, 0.35)",
      glowSoft: "0 0 26px rgba(225, 78, 202, 0.18)",
    },
    amber: {
      base: "#fbbf24",
      hover: "#fcd34d",
      active: "#d97706",
      light: "#fef3c7",
      dark: "#b45309",
      darker: "#78350f",
      rgb: "251, 191, 36",
      borderHover: "rgba(254, 243, 199, 0.4)",
      glow: "0 0 14px rgba(251, 191, 36, 0.35)",
      glowSoft: "0 0 26px rgba(251, 191, 36, 0.18)",
    },
  };

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
    const accent = ACCENTS[p.accentColor] || ACCENTS.neon;
    const root = document.documentElement;
    root.style.setProperty("--accent", accent.base);
    root.style.setProperty("--accent-hover", accent.hover);
    root.style.setProperty("--accent-active", accent.active);
    root.style.setProperty("--accent-light", accent.light);
    root.style.setProperty("--accent-dark", accent.dark);
    root.style.setProperty("--accent-darker", accent.darker);
    root.style.setProperty("--accent-rgb", accent.rgb);
    root.style.setProperty("--accent-muted", `rgba(${accent.rgb}, .14)`);
    root.style.setProperty("--accent-surface", `rgba(${accent.rgb}, .045)`);
    root.style.setProperty(
      "--accent-surface-strong",
      `rgba(${accent.rgb}, .13)`,
    );
    root.style.setProperty("--accent-border", `rgba(${accent.rgb}, .34)`);
    root.style.setProperty("--accent-shadow", `rgba(${accent.rgb}, .12)`);
    root.style.setProperty(
      "--accent-contrast",
      accent.darker === "#0b4d28" ? "#effff4" : accent.light,
    );
    root.style.setProperty("--border-hover", accent.borderHover);
    root.style.setProperty("--neon-glow", accent.glow);
    root.style.setProperty("--neon-glow-soft", accent.glowSoft);
    root.style.setProperty("--status-current", accent.base);
    root.classList.toggle("reduced-motion", Boolean(p.reducedMotion));
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
    setAvatar,
    setBanner,
    resetPreferences,
    wipeProfile,
    deleteProfile,
    applyPreferences,
  };
});
