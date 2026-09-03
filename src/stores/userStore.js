// =============================================================
// Perfil y preferencias del usuario (100% local).
// Persistencia en capas, igual que el resto de la app:
//  - Preferencias ligeras -> localStorage (sincrónico, siempre disponible)
//  - Imágenes (avatar/banner como Blob) -> IndexedDB "settings"
// =============================================================
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { dbPromise } from "../lib/db";
import { toDisplayUrl } from "../lib/covers.js";

const LS_KEY = "calliope-user-profile";

const DEFAULT_PROFILE = {
  username: "",
  displayName: "",
  bio: "",
  avatarUrl: "",
  // Preferencias de interfaz
  accentColor: "neon", // neon | cyan | magenta | amber
  reducedMotion: false,
  showVisualizer: true,
  // Preferencias de reproducción
  autoplayOnStart: false,
  keepQueueWhenClosing: true,
  // Biblioteca / Home
  homeShowHistory: true,
  homeShowTopAlbums: true,
  homeShowTopPlaylists: true,
  librarySortMode: "name",
  // Privacidad / datos
  saveListeningHistory: true,
  localDataOnly: true,
};

export const useUserStore = defineStore("user", () => {
  const profile = ref({ ...DEFAULT_PROFILE });
  const avatarBlob = ref(null);
  const bannerBlob = ref(null);
  const loaded = ref(false);

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
    const source = profile.value.displayName || profile.value.username || "C";
    const parts = source.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "C";
  });

  const hasCustomProfile = computed(() =>
    Boolean(
      profile.value.username ||
      profile.value.displayName ||
      profile.value.bio ||
      avatarBlob.value,
    ),
  );

  function loadFromLocalStorage() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        profile.value = { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn("Perfil: datos locales corruptos, se restablecen.", e);
      profile.value = { ...DEFAULT_PROFILE };
    }
  }

  async function load() {
    loadFromLocalStorage();
    try {
      const db = await dbPromise;
      const avatar = await db.get("settings", "profile-avatar");
      const banner = await db.get("settings", "profile-banner");
      if (avatar instanceof Blob) {
        avatarBlob.value = avatar;
      } else if (typeof avatar === "string" && avatar.trim()) {
        profile.value.avatarUrl = avatar.trim();
      }
      if (banner instanceof Blob) bannerBlob.value = banner;
    } catch (e) {
      console.warn("Perfil: no se pudieron cargar las imágenes.", e);
    } finally {
      loaded.value = true;
    }
  }

  async function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(profile.value));
  }

  /** Edita campos de texto/preferencias y persiste. */
  async function updateProfile(partial) {
    profile.value = { ...profile.value, ...partial };
    await save();
  }

  async function setAvatar(data) {
    const db = await dbPromise;
    if (typeof data === "string" && data.trim()) {
      profile.value.avatarUrl = data.trim();
      avatarBlob.value = null;
      await save();
      await db.put("settings", data.trim(), "profile-avatar");
    } else if (data instanceof Blob) {
      profile.value.avatarUrl = "";
      avatarBlob.value = data;
      await save();
      await db.put("settings", data, "profile-avatar");
    } else {
      profile.value.avatarUrl = "";
      avatarBlob.value = null;
      await save();
      await db.delete("settings", "profile-avatar");
    }
  }

  async function setBanner(blob) {
    bannerBlob.value = blob || null;
    const db = await dbPromise;
    if (blob) await db.put("settings", blob, "profile-banner");
    else await db.delete("settings", "profile-banner");
  }

  /** Restablece preferencias a los valores por defecto (conserva identidad opcionalmente). */
  async function resetPreferences({ keepIdentity = true } = {}) {
    const identity = keepIdentity
      ? {
          username: profile.value.username,
          displayName: profile.value.displayName,
          bio: profile.value.bio,
        }
      : {};
    profile.value = { ...DEFAULT_PROFILE, ...identity };
    await save();
  }

  async function wipeProfile() {
    profile.value = { ...DEFAULT_PROFILE };
    await setAvatar(null);
    await setBanner(null);
    await save();
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
    const p = profile.value;
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
    load,
    save,
    updateProfile,
    setAvatar,
    setBanner,
    resetPreferences,
    wipeProfile,
    applyPreferences,
  };
});
