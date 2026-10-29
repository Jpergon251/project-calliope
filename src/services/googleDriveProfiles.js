import { Capacitor } from "@capacitor/core";
import { reactive } from "vue";
import {
  MAX_PROFILE_ARCHIVE_BYTES,
  profileArchiveFileName,
  serializeProfileArchive,
  validateProfileArchive,
} from "./profileArchives.js";
import { normalizeUsername } from "../lib/profileIdentity.js";

export const GOOGLE_DRIVE_PROFILE_SCOPE = "https://www.googleapis.com/auth/drive.file openid email";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const GOOGLE_IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client";
const LEGACY_PROFILE_ARCHIVE_NAME = "profile_data.json";
const LINK_KEY_PREFIX = "google-drive-profile:";
const SYNC_KEY_PREFIX = "google-drive-sync:";
const DRIVE_SYNC_DEBOUNCE_MS = 3000;
const tokenCache = new Map();
const linkCache = new Map();
const syncTimers = new Map();
const syncPromises = new Map();
const syncRevisions = new Map();
const syncEpochs = new Map();
const syncControllers = new Map();
export const driveSyncStatuses = reactive({});
let googleIdentityPromise = null;
let syncLifecycleInitialized = false;

async function openProfileDb() {
  return (await import("../lib/db.js")).dbPromise;
}

function getClientId() {
  return import.meta.env?.VITE_GOOGLE_CLIENT_ID?.trim() || "";
}

export function isGoogleDriveConfigured() {
  return Boolean(getClientId());
}

export function getDriveProfileArchiveName(profile) {
  return profileArchiveFileName(profile);
}

export function validateDriveProfileArchiveIdentity(input, profile) {
  const { archive } = validateProfileArchive(input);
  if (archive.profile.id !== profile?.id) {
    throw new Error("Conflicto de identidad: el archivo de Drive no pertenece al ID interno de este perfil.");
  }
  if (archive.profile.username !== profile.username) {
    throw new Error("Conflicto de identidad: el nombre de usuario del archivo no coincide con el perfil local.");
  }
  return archive;
}

function assertWebOAuthAvailable() {
  if (Capacitor.isNativePlatform()) {
    throw new Error("Google Drive todavía no está disponible en la aplicación Android. Úsalo desde la versión web.");
  }
  if (!getClientId()) {
    throw new Error("Falta configurar VITE_GOOGLE_CLIENT_ID para conectar Google Drive.");
  }
}

function settingsKey(profileId) {
  return `${LINK_KEY_PREFIX}${profileId}`;
}

function syncSettingsKey(profileId) {
  return `${SYNC_KEY_PREFIX}${profileId}`;
}

async function getDriveSyncMetadata(profileId) {
  const db = await openProfileDb();
  return (await db.get("settings", syncSettingsKey(profileId))) || {};
}

async function storeDriveSyncMetadata(profileId, metadata) {
  const db = await openProfileDb();
  await db.put("settings", metadata, syncSettingsKey(profileId));
  driveSyncStatuses[profileId] = metadata;
  return metadata;
}

export async function getDriveProfileSyncState(profileId) {
  if (!profileId) return null;
  if (!driveSyncStatuses[profileId]) {
    driveSyncStatuses[profileId] = await getDriveSyncMetadata(profileId);
  }
  return driveSyncStatuses[profileId];
}

export function classifyDriveProfileVersions({
  localHash,
  remoteHash,
  baseHash = "",
  baseLocalHash = baseHash,
  baseRemoteHash = baseHash,
}) {
  if (!remoteHash) return baseHash ? "remote-missing" : "local-only";
  if (localHash === remoteHash) return "same";
  if (!baseLocalHash && !baseRemoteHash) return "conflict";
  const localChanged = Boolean(baseLocalHash) && localHash !== baseLocalHash;
  const remoteChanged = Boolean(baseRemoteHash) && remoteHash !== baseRemoteHash;
  if (localChanged && remoteChanged) return "conflict";
  if (localChanged) return "upload-local";
  if (remoteChanged) return "download-remote";
  if (!localChanged && !remoteChanged) return "same";
  return "same";
}

export function normalizeDriveArchiveForHash(serialized) {
  const archive = typeof serialized === "string" ? JSON.parse(serialized) : serialized;
  if (!archive || typeof archive !== "object" || Array.isArray(archive)) {
    throw new Error("No se puede calcular la huella de un perfil JSON no válido.");
  }
  const normalized = {
    ...archive,
    ...(archive.profile && typeof archive.profile === "object"
      ? { profile: { ...archive.profile } }
      : {}),
    ...(archive.queue && typeof archive.queue === "object"
      ? { queue: { ...archive.queue } }
      : {}),
  };
  delete normalized.exportedAt;
  if (normalized.profile) delete normalized.profile.updatedAt;
  if (normalized.queue) delete normalized.queue.savedAt;
  return JSON.stringify(normalized);
}

async function hashArchive(serialized) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Este entorno no ofrece SHA-256 seguro para comparar las versiones del perfil.");
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalizeDriveArchiveForHash(serialized)),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function updateDriveSyncStatus(profileId, status, values = {}) {
  const previous = await getDriveSyncMetadata(profileId);
  return storeDriveSyncMetadata(profileId, {
    ...previous,
    ...values,
    profileId,
    status,
    updatedAt: Date.now(),
  });
}

async function assertDriveSyncCurrent(profileId, accountId, accessToken, epoch) {
  if ((syncEpochs.get(profileId) || 0) !== epoch) {
    const error = new Error("La sincronización se canceló porque cambió la vinculación de Google de este perfil.");
    error.code = "drive-sync-cancelled";
    throw error;
  }
  const [link, token] = await Promise.all([
    getProfileDriveLink(profileId),
    Promise.resolve(tokenCache.get(profileId)),
  ]);
  if (
    link?.accountId !== accountId
    || !token?.accessToken
    || token.accessToken !== accessToken
  ) {
    const error = new Error("La vinculación de Google cambió durante la sincronización. No se aplicaron más cambios.");
    error.code = "drive-sync-cancelled";
    throw error;
  }
}

function isOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export async function getProfileDriveLink(profileId) {
  if (!profileId) return null;
  const db = await openProfileDb();
  const link = (await db.get("settings", settingsKey(profileId))) || null;
  linkCache.set(profileId, link);
  return link;
}

async function storeProfileDriveLink(profileId, link) {
  const db = await openProfileDb();
  await db.put("settings", link, settingsKey(profileId));
  linkCache.set(profileId, link);
}

function loadGoogleIdentityServices() {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve(globalThis.google);
  if (googleIdentityPromise) return googleIdentityPromise;
  googleIdentityPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`);
    const script = existing || document.createElement("script");
    const onLoad = () => {
      if (globalThis.google?.accounts?.oauth2) resolve(globalThis.google);
      else reject(new Error("Google Identity Services no pudo inicializarse."));
    };
    const onError = () => reject(new Error("No se pudo cargar Google Identity Services. Comprueba tu conexión."));
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existing) {
      script.src = GOOGLE_IDENTITY_SCRIPT;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }).catch((error) => {
    googleIdentityPromise = null;
    throw error;
  });
  return googleIdentityPromise;
}

export async function prepareGoogleDriveAuth() {
  assertWebOAuthAvailable();
  await loadGoogleIdentityServices();
}

function requestAccessToken({ prompt = "select_account consent" } = {}) {
  const google = globalThis.google;
  if (!google?.accounts?.oauth2) {
    return Promise.reject(new Error("La autorización de Google aún se está preparando. Inténtalo de nuevo en unos segundos."));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback(value);
    };
    const client = google.accounts.oauth2.initTokenClient({
      client_id: getClientId(),
      scope: GOOGLE_DRIVE_PROFILE_SCOPE,
      include_granted_scopes: true,
      prompt,
      callback: (response) => {
        if (response?.error || !response?.access_token) {
          finish(reject, new Error(response?.error_description || "No se concedió acceso a Google Drive."));
          return;
        }
        finish(resolve, {
          accessToken: response.access_token,
          expiresAt: Date.now() + Math.max(0, Number(response.expires_in) || 0) * 1000,
        });
      },
      error_callback: (error) => {
        finish(reject, new Error(error?.type === "popup_closed"
          ? "Se canceló la autorización de Google."
          : "No se pudo completar la autorización de Google."));
      },
    });
    timeout = setTimeout(
      () => finish(reject, new Error("La autorización de Google se cerró o tardó demasiado. Inténtalo de nuevo.")),
      120_000,
    );
    try {
      client.requestAccessToken();
    } catch (error) {
      finish(reject, error);
    }
  });
}

async function fetchAccount(accessToken) {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("Google no pudo verificar la cuenta autorizada.");
  const account = await response.json();
  if (typeof account.sub !== "string" || !account.sub) {
    throw new Error("Google no devolvió una identidad de cuenta válida.");
  }
  return {
    accountId: account.sub,
    email: typeof account.email === "string" ? account.email : "",
    displayName: typeof account.name === "string" ? account.name : "",
  };
}

async function authorizeProfile(profileId, { connect = false } = {}) {
  if (!profileId) throw new Error("Selecciona un perfil local antes de usar Google Drive.");
  const cachedLink = linkCache.get(profileId);
  if (!connect && !cachedLink?.accountId) {
    throw new Error("Conecta una cuenta de Google a este perfil antes de continuar.");
  }
  const cached = tokenCache.get(profileId);
  if (!connect && cached && cached.expiresAt > Date.now() + 60_000) {
    return { ...cached, link: cachedLink };
  }

  const tokenPromise = requestAccessToken({
    prompt: connect ? "select_account consent" : "",
  });
  const existingLink = linkCache.has(profileId)
    ? cachedLink
    : await getProfileDriveLink(profileId);
  if (!connect && !existingLink?.accountId) {
    throw new Error("Conecta una cuenta de Google a este perfil antes de continuar.");
  }
  const token = await tokenPromise;
  const account = await fetchAccount(token.accessToken);
  if (existingLink?.accountId && existingLink.accountId !== account.accountId) {
    tokenCache.delete(profileId);
    throw new Error("La cuenta seleccionada no coincide con la vinculada a este perfil. Desvincula la cuenta anterior antes de cambiarla.");
  }
  const link = {
    ...(existingLink || {}),
    profileId,
    accountId: account.accountId,
    email: account.email,
    displayName: account.displayName,
    initializationPending: existingLink?.accountId
      ? Boolean(existingLink.initializationPending)
      : true,
    connectedAt: existingLink?.connectedAt || Date.now(),
    updatedAt: Date.now(),
  };
  await storeProfileDriveLink(profileId, link);
  const authorized = { ...token, link };
  tokenCache.set(profileId, authorized);
  return authorized;
}

export async function connectGoogleDrive(profileId) {
  assertWebOAuthAvailable();
  const authorized = await authorizeProfile(profileId, { connect: true });
  if (authorized.link.initializationPending) {
    await updateDriveSyncStatus(profileId, "decision-required", {
      message: "Elige si restaurar la copia de Drive o inicializarla con este perfil.",
    });
  }
  return authorized.link;
}

export async function authorizeGoogleDriveProfile(profileId) {
  await authorizeProfile(profileId);
}

export async function disconnectGoogleDrive(profileId) {
  if (!profileId) return;
  clearGoogleDriveToken(profileId);
  const db = await openProfileDb();
  await db.delete("settings", settingsKey(profileId));
  await updateDriveSyncStatus(profileId, "local-only", {
    message: "Cuenta desvinculada. No hay respaldo en la nube; puedes exportar el perfil manualmente.",
    pendingLocalHash: "",
  });
}

export function clearGoogleDriveToken(profileId) {
  if (!profileId) return;
  syncEpochs.set(profileId, (syncEpochs.get(profileId) || 0) + 1);
  clearTimeout(syncTimers.get(profileId));
  syncTimers.delete(profileId);
  syncControllers.get(profileId)?.abort();
  syncControllers.delete(profileId);
  tokenCache.delete(profileId);
  linkCache.delete(profileId);
  delete driveSyncStatuses[profileId];
}

function escapeDriveQuery(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

export function createGoogleDriveApi(accessToken, { onUnauthorized = () => {}, signal } = {}) {
  async function getDriveErrorReason(response) {
    try {
      const body = await response.json();
      const errors = body?.error?.errors;
      if (Array.isArray(errors)) {
        const reason = errors.find((item) => typeof item?.reason === "string")?.reason;
        if (reason) return reason;
      }
      return typeof body?.error?.status === "string" ? body.error.status : "";
    } catch {
      return "";
    }
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      ...(signal ? { signal } : {}),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(typeof FormData !== "undefined" && options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...options.headers,
      },
    });
    if (!response.ok) {
      if (response.status === 401) {
        onUnauthorized();
        throw new Error("La autorización de Google Drive ha caducado o fue revocada. Vuelve a conectar la cuenta.");
      }
      if (response.status === 403) {
        const reason = await getDriveErrorReason(response);
        const messages = {
          accessNotConfigured: "Google Drive API no está habilitada en el proyecto de Google Cloud asociado al Client ID. Habilítala en Google Cloud Console y vuelve a intentarlo.",
          SERVICE_DISABLED: "Google Drive API está deshabilitada en el proyecto de Google Cloud asociado al Client ID. Habilítala en Google Cloud Console y vuelve a intentarlo.",
          insufficientPermissions: "La autorización no incluye los permisos necesarios para Drive. Desvincula este perfil y vuelve a conectarlo aceptando el permiso solicitado.",
          insufficientFilePermissions: "La cuenta no tiene permiso para acceder a este archivo o carpeta de Drive.",
          appNotAuthorizedToFile: "Google no ha autorizado esta aplicación para acceder a ese elemento. Usa una carpeta creada por Calliope o revisa los permisos del archivo.",
          rateLimitExceeded: "Google Drive está limitando temporalmente las solicitudes. Espera un momento y vuelve a intentarlo.",
          userRateLimitExceeded: "Se alcanzó temporalmente el límite de solicitudes de esta cuenta a Google Drive. Espera un momento y vuelve a intentarlo.",
          dailyLimitExceeded: "Se alcanzó la cuota diaria de la API de Google Drive para este proyecto.",
          quotaExceeded: "Se alcanzó la cuota disponible de Google Drive. Revisa las cuotas del proyecto o de la cuenta.",
          domainPolicy: "La política de la organización impide que esta cuenta use Google Drive con Calliope.",
        };
        throw new Error(messages[reason] || `Google Drive rechazó la operación (HTTP 403${reason ? `, ${reason}` : ""}). Revisa que Drive API esté habilitada, que la autorización incluya drive.file y que la cuenta tenga acceso al elemento.`);
      }
      if (response.status === 429) {
        const error = new Error("Google Drive está limitando temporalmente las solicitudes. Espera un momento y vuelve a intentarlo.");
        error.retryable = true;
        throw error;
      }
      if (response.status === 404) {
        const error = new Error("No se encontró un elemento de Drive guardado previamente; no se creará otro automáticamente.");
        error.code = "drive-not-found";
        throw error;
      }
      if (response.status === 412 || response.status === 409) {
        const error = new Error("El archivo de Drive cambió durante la sincronización. Se conservaron ambas versiones para resolver el conflicto.");
        error.code = "drive-precondition-failed";
        throw error;
      }
      const error = new Error(`Google Drive devolvió un error HTTP ${response.status}.`);
      error.retryable = response.status >= 500;
      throw error;
    }
    return response;
  }

  async function getFile(id) {
    const response = await request(`${DRIVE_API}/files/${encodeURIComponent(id)}?fields=id,name,mimeType,parents,modifiedTime,trashed`);
    const file = await response.json();
    if (file.trashed) {
      const error = new Error("El elemento de Drive vinculado está en la papelera; no se modificará ni recreará automáticamente.");
      error.code = "drive-not-found";
      throw error;
    }
    return { ...file, etag: response.headers?.get?.("ETag") || "" };
  }

  async function downloadFile(id) {
    const response = await request(`${DRIVE_API}/files/${encodeURIComponent(id)}?alt=media`);
    return response.text();
  }

  async function findChildren(parentId, name, mimeType = null) {
    const conditions = [
      `'${escapeDriveQuery(parentId)}' in parents`,
      `name = '${escapeDriveQuery(name)}'`,
      "trashed = false",
    ];
    if (mimeType) conditions.push(`mimeType = '${escapeDriveQuery(mimeType)}'`);
    const query = encodeURIComponent(conditions.join(" and "));
    return listFiles(query);
  }

  async function findRootFolders(name) {
    const query = encodeURIComponent([
      "'root' in parents",
      `name = '${escapeDriveQuery(name)}'`,
      "mimeType = 'application/vnd.google-apps.folder'",
      "trashed = false",
    ].join(" and "));
    return listFiles(query);
  }

  async function listFiles(query) {
    const files = [];
    let pageToken = "";
    do {
      const page = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
      const response = await request(`${DRIVE_API}/files?q=${query}&fields=nextPageToken,files(id,name,mimeType,parents,modifiedTime)&pageSize=100${page}`);
      const result = await response.json();
      files.push(...(result.files || []));
      pageToken = result.nextPageToken || "";
    } while (pageToken);
    return files;
  }

  async function createFolder(parentId, name) {
    const response = await request(`${DRIVE_API}/files?fields=id,name,mimeType,parents`, {
      method: "POST",
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    });
    return response.json();
  }

  async function findOrCreateFolder(name, parentId, knownId = null, isRoot = false, createIfMissing = true, requireConfirmation = false) {
    if (knownId) {
      const known = await getFile(knownId);
      let parentMatches;
      if (isRoot) {
        const rootMatches = await findRootFolders(name);
        if (rootMatches.length > 1) {
          throw new Error(`Hay varias carpetas «${name}» en la raíz de Drive. Resuelve el conflicto antes de continuar.`);
        }
        parentMatches = rootMatches[0]?.id === known.id;
      } else {
        parentMatches = known.parents?.includes(parentId);
      }
      if (known.mimeType !== "application/vnd.google-apps.folder" || !parentMatches || known.name !== name) {
        throw new Error(`La carpeta de Drive «${name}» cambió de nombre o ubicación. No se creará otra automáticamente.`);
      }
      return known;
    }
    const matches = isRoot ? await findRootFolders(name) : await findChildren(parentId, name, "application/vnd.google-apps.folder");
    if (matches.length > 1) {
      throw new Error(`Hay varias carpetas «${name}» en la ubicación de Drive esperada. Resuelve el conflicto desde Google Drive antes de continuar.`);
    }
    if (matches[0]) return matches[0];
    if (!createIfMissing) {
      const needsConfirmation = isRoot && requireConfirmation;
      const error = new Error(needsConfirmation
        ? "No se encontró una carpeta Calliope visible para esta aplicación. Revisa Drive; si no existe o aceptas crear otra, confirma la creación."
        : `No se encontró la carpeta «${name}» en la ubicación de Drive esperada.`);
      error.code = needsConfirmation ? "drive-root-create-confirmation-required" : "drive-folder-missing";
      throw error;
    }
    return createFolder(parentId, name);
  }

  async function uploadFile(folderId, fileId, serialized, fileName, { ifMatch = "" } = {}) {
    if (fileId) {
      const boundary = `calliope_${crypto.randomUUID()}`;
      const metadata = JSON.stringify({ name: fileName, mimeType: "application/json" });
      const body = [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        metadata,
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        serialized,
        `--${boundary}--`,
        "",
      ].join("\r\n");
      const response = await request(`${DRIVE_UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id,name,mimeType,parents,modifiedTime`, {
        method: "PATCH",
        headers: {
          "Content-Type": `multipart/related; boundary=${boundary}`,
          ...(ifMatch ? { "If-Match": ifMatch } : {}),
        },
        body,
      });
      const file = await response.json();
      return { ...file, etag: response.headers?.get?.("ETag") || "" };
    }

    const boundary = `calliope_${crypto.randomUUID()}`;
    const metadata = JSON.stringify({
      name: fileName,
      mimeType: "application/json",
      parents: [folderId],
    });
    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      metadata,
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      serialized,
      `--${boundary}--`,
      "",
    ].join("\r\n");
    const response = await request(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,parents,modifiedTime`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    const file = await response.json();
    return { ...file, etag: response.headers?.get?.("ETag") || "" };
  }

  return { createFolder, downloadFile, findChildren, findOrCreateFolder, getFile, findRootFolders, uploadFile };
}

export function selectDriveProfileArchiveFile(files) {
  const candidates = files.filter((file, index) => files.findIndex((item) => item.id === file.id) === index);
  if (candidates.length > 1) {
    throw new Error("Hay varios archivos candidatos para este perfil en Drive. No se eligió ni sobrescribió ninguno.");
  }
  return candidates[0] || null;
}

export async function findProfileArchiveFile(api, folderId, link, expectedName) {
  const names = [...new Set([expectedName, LEGACY_PROFILE_ARCHIVE_NAME, link.fileName].filter(Boolean))];
  const matches = (await Promise.all(names.map((name) => api.findChildren(folderId, name)))).flat();
  return selectDriveProfileArchiveFile(matches);
}

async function resolveProfileDrive(profile, link, api, { createMissing = true, allowCreateRoot = false } = {}) {
  const existingFolderId = link.profileFolderId || null;
  const canCreateRoot = createMissing && (Boolean(link.rootFolderId) || allowCreateRoot);
  const root = await api.findOrCreateFolder(
    "Calliope",
    null,
    link.rootFolderId || null,
    true,
    canCreateRoot,
    createMissing && !allowCreateRoot && !link.rootFolderId,
  );
  const profilesFolder = await api.findOrCreateFolder("profiles", root.id, link.profilesFolderId || null, false, createMissing);
  let profileFolder;

  if (existingFolderId) {
    profileFolder = await api.getFile(existingFolderId);
    if (
      profileFolder.mimeType !== "application/vnd.google-apps.folder"
      || !profileFolder.parents?.includes(profilesFolder.id)
    ) {
      throw new Error("La carpeta de Drive vinculada al perfil fue movida o dejó de ser accesible. No se creará otra carpeta.");
    }
    if (link.profileFolderName && profileFolder.name !== link.profileFolderName) {
      throw new Error("La carpeta del perfil cambió de nombre directamente en Drive. Revisa su ubicación antes de continuar.");
    }
  } else {
    profileFolder = await api.findOrCreateFolder(profile.displayName || profile.name, profilesFolder.id, null, false, createMissing);
  }

  const updatedLink = {
    ...link,
    rootFolderId: root.id,
    profilesFolderId: profilesFolder.id,
    profileFolderId: profileFolder.id,
    profileFolderName: profileFolder.name,
    updatedAt: Date.now(),
  };
  return { root, profilesFolder, profileFolder, link: updatedLink };
}

async function loadCurrentProfile(profileId) {
  const db = await openProfileDb();
  const profile = await db.get("profiles", profileId);
  if (!profile || profile.id !== profileId) {
    throw new Error("El perfil local ya no existe; no se sincronizó otro perfil.");
  }
  return profile;
}

async function readDriveSnapshot(profile, link, api, { confirmCreateStructure = false } = {}) {
  let resolved;
  try {
    resolved = await resolveProfileDrive(profile, link, api, {
      createMissing: false,
    });
  } catch (error) {
    if (!confirmCreateStructure) throw error;
    resolved = await resolveProfileDrive(profile, link, api, {
      createMissing: true,
      allowCreateRoot: true,
    });
  }

  const expectedName = getDriveProfileArchiveName(profile);
  const file = await findProfileArchiveFile(api, resolved.profileFolder.id, link, expectedName);
  if (!file) return { resolved, file: null, archive: null, serialized: "", hash: "" };

  const fileMetadata = await api.getFile(file.id);
  if (
    fileMetadata.mimeType !== "application/json"
    || !fileMetadata.parents?.includes(resolved.profileFolder.id)
  ) {
    throw new Error("El archivo candidato de Drive cambió de tipo o ubicación. No se modificó.");
  }
  const serialized = await api.downloadFile(file.id);
  if (new TextEncoder().encode(serialized).byteLength > MAX_PROFILE_ARCHIVE_BYTES) {
    throw new Error("El archivo remoto supera el límite permitido; no se modificó.");
  }

  let archive;
  try {
    archive = validateProfileArchive(JSON.parse(serialized)).archive;
  } catch (error) {
    throw new Error(`El archivo remoto no es un respaldo válido y no se reemplazó. ${error.message}`);
  }
  if (archive.profile.id !== profile.id) {
    throw new Error("Conflicto de identidad: el archivo de Drive no pertenece al ID interno de este perfil.");
  }
  const remoteUsername = normalizeUsername(archive.profile.username);
  if (
    remoteUsername !== normalizeUsername(profile.username)
    && (!link.fileUsername || remoteUsername !== normalizeUsername(link.fileUsername))
  ) {
    throw new Error("Conflicto de identidad: el archivo de Drive no coincide con el nombre de usuario actual o previamente vinculado.");
  }
  const canonicalJson = JSON.stringify(archive);
  return {
    resolved,
    file: { ...file, ...fileMetadata },
    archive,
    serialized: canonicalJson,
    hash: await hashArchive(canonicalJson),
  };
}

async function saveDriveBaseline(profile, resolved, file, localHash, { remoteHash = localHash } = {}) {
  const savedAt = file.modifiedTime && Number.isFinite(Date.parse(file.modifiedTime))
    ? Date.parse(file.modifiedTime)
    : Date.now();
  const nextLink = {
    ...resolved.link,
    initializationPending: false,
    fileId: file.id,
    fileName: file.name || getDriveProfileArchiveName(profile),
    fileUsername: normalizeUsername(profile.username),
    lastSavedAt: savedAt,
    updatedAt: Date.now(),
  };
  const db = await openProfileDb();
  const tx = db.transaction("settings", "readwrite");
  const transactionDone = tx.done;
  const currentLink = await tx.store.get(settingsKey(profile.id));
  if (!currentLink?.accountId || currentLink.accountId !== resolved.link.accountId) {
    try { tx.abort(); } catch {}
    try { await transactionDone; } catch {}
    const error = new Error("La vinculación de Google cambió antes de confirmar la sincronización.");
    error.code = "drive-sync-cancelled";
    throw error;
  }
  await tx.store.put(nextLink, settingsKey(profile.id));
  await transactionDone;
  linkCache.set(profile.id, nextLink);
  await updateDriveSyncStatus(profile.id, "synced", {
    baseHash: localHash === remoteHash ? localHash : "",
    baseLocalHash: localHash,
    baseRemoteHash: remoteHash,
    localHash,
    remoteHash,
    remoteFileId: file.id,
    remoteEtag: file.etag || "",
    remoteModifiedTime: file.modifiedTime || "",
    lastSyncedAt: savedAt,
    pendingLocalHash: "",
    localChangedAt: 0,
    attempts: 0,
    nextRetryAt: 0,
    conflict: null,
    message: "",
  });
  return savedAt;
}

async function persistDriveConflict(profileId, localSnapshot, remoteSnapshot, message) {
  await updateDriveSyncStatus(profileId, "conflict", {
    conflict: {
      createdAt: Date.now(),
      localJson: localSnapshot.serialized,
      localHash: localSnapshot.hash,
      remoteJson: remoteSnapshot?.serialized || "",
      remoteHash: remoteSnapshot?.hash || "",
      remoteFileId: remoteSnapshot?.file?.id || "",
      remoteEtag: remoteSnapshot?.file?.etag || "",
      remoteModifiedTime: remoteSnapshot?.file?.modifiedTime || "",
    },
    pendingLocalHash: localSnapshot.hash,
    message,
    nextRetryAt: 0,
  });
  return { status: "conflict", message };
}

async function importDriveSnapshot(profileId, archive) {
  const db = await openProfileDb();
  const [currentSongs, currentAlbums] = await Promise.all([
    db.getAll("songs"),
    db.getAll("albums"),
  ]);
  const { importProfileArchive } = await import("./profileArchives.js");
  await importProfileArchive(archive, {
    mode: "update",
    targetProfileId: profileId,
    currentSongs,
    currentAlbums,
    syncSource: "drive",
  });

  const [{ useUserStore }, { useLibraryStore }] = await Promise.all([
    import("../stores/userStore.js"),
    import("../stores/libraryStore.js"),
  ]);
  const user = useUserStore();
  if (user.currentSession?.profileId === profileId) {
    await user.reloadActiveProfile(profileId);
    await useLibraryStore().switchProfile();
  }
}

async function performDriveProfileSync(profileId, {
  confirmCreateStructure = false,
  allowInitialUpload = false,
  forceUpload = false,
  signal,
} = {}) {
  if (!profileId || profileId === "guest") {
    throw new Error("Solo se pueden sincronizar perfiles locales registrados.");
  }
  const startingRevision = syncRevisions.get(profileId) || 0;
  if (!isOnline()) {
    await updateDriveSyncStatus(profileId, "offline", {
      message: "Sin conexión. La versión operativa permanece en Calliope y el envío a Drive queda pendiente.",
    });
    return { status: "offline" };
  }

  const link = await getProfileDriveLink(profileId);
  if (!link?.accountId) {
    await updateDriveSyncStatus(profileId, "local-only", {
      message: "Perfil sin respaldo en la nube. Los datos operativos permanecen en Calliope y puedes exportarlos manualmente.",
    });
    return { status: "local-only" };
  }
  if (link.initializationPending && !allowInitialUpload) {
    const error = new Error("La primera vinculación requiere una decisión explícita antes de sincronizar.");
    error.code = "drive-initialization-required";
    throw error;
  }
  const token = tokenCache.get(profileId);
  if (!token?.accessToken || token.expiresAt <= Date.now() + 60_000) {
    await updateDriveSyncStatus(profileId, "reauth", {
      message: "Vuelve a autorizar Google para continuar la sincronización. Los cambios locales están conservados.",
    });
    return { status: "reauth" };
  }
  const syncEpoch = syncEpochs.get(profileId) || 0;
  const accessToken = token.accessToken;

  const profile = await loadCurrentProfile(profileId);
  const serialized = await serializeProfileArchive(profileId);
  if (new TextEncoder().encode(serialized).byteLength > MAX_PROFILE_ARCHIVE_BYTES) {
    throw new Error("El perfil supera el límite de tamaño permitido para el respaldo.");
  }
  const localArchive = JSON.parse(serialized);
  validateDriveProfileArchiveIdentity(localArchive, profile);
  const localSnapshot = {
    serialized,
    archive: localArchive,
    hash: await hashArchive(serialized),
  };
  const previous = await getDriveSyncMetadata(profileId);
  await updateDriveSyncStatus(profileId, "syncing", {
    localHash: localSnapshot.hash,
    pendingLocalHash: localSnapshot.hash,
    message: "Comparando la copia local con Google Drive.",
  });
  const api = createGoogleDriveApi(token.accessToken, {
    onUnauthorized: () => tokenCache.delete(profileId),
    signal,
  });
  const remoteSnapshot = await readDriveSnapshot(profile, link, api, { confirmCreateStructure });
  await assertDriveSyncCurrent(profileId, link.accountId, accessToken, syncEpoch);

  if (link.initializationPending && remoteSnapshot.file) {
    const error = new Error("Ya existe una copia remota. Revísala y elige qué versión conservar antes de escribir.");
    error.code = "drive-initialization-required";
    throw error;
  }
  if (!remoteSnapshot.file) {
    const hasPreviousBaseline = !link.initializationPending
      && Boolean(previous.baseHash || previous.baseLocalHash || previous.baseRemoteHash);
    const hasPreviouslyLinkedFile = Boolean(link.fileId);
    if (hasPreviousBaseline || hasPreviouslyLinkedFile) {
      return persistDriveConflict(
        profileId,
        localSnapshot,
        null,
        "La copia remota ya no está disponible. No se recreó automáticamente; conserva la versión local o cancela.",
      );
    }
    if (!confirmCreateStructure && !hasPreviousBaseline && !hasPreviouslyLinkedFile) {
      const error = new Error("Antes de crear la primera copia en Drive, confirma que la aplicación puede crear la estructura que no encuentre.");
      error.code = "drive-first-save-confirmation-required";
      await updateDriveSyncStatus(profileId, "pending", {
        message: "La copia local está pendiente de la confirmación inicial de Drive.",
      });
      throw error;
    }
    const latestRemote = await readDriveSnapshot(profile, link, api, { confirmCreateStructure });
    if (latestRemote.file) {
      if (link.initializationPending) {
        const error = new Error("Apareció una copia remota durante la inicialización. Revísala antes de continuar.");
        error.code = "drive-initialization-required";
        throw error;
      }
      return persistDriveConflict(
        profileId,
        localSnapshot,
        latestRemote,
        "Apareció una copia remota antes de crear el archivo. No se creó ningún duplicado.",
      );
    }
    await assertDriveSyncCurrent(profileId, link.accountId, accessToken, syncEpoch);
    const file = await api.uploadFile(
      latestRemote.resolved.profileFolder.id,
      null,
      serialized,
      getDriveProfileArchiveName(profile),
    );
    await assertDriveSyncCurrent(profileId, link.accountId, accessToken, syncEpoch);
    const confirmedRemote = await readDriveSnapshot(profile, link, api);
    if (confirmedRemote.file?.id !== file.id || confirmedRemote.hash !== localSnapshot.hash) {
      return persistDriveConflict(
        profileId,
        localSnapshot,
        confirmedRemote.file ? confirmedRemote : null,
        "No se pudo confirmar de forma exclusiva la primera copia remota. Revisa Drive antes de continuar.",
      );
    }
    await saveDriveBaseline(profile, confirmedRemote.resolved, confirmedRemote.file, localSnapshot.hash);
    return {
      status: "synced",
      fileId: file.id,
      fileName: file.name || getDriveProfileArchiveName(profile),
      savedAt: Date.now(),
      updated: false,
      renamed: false,
    };
  }

  const action = classifyDriveProfileVersions({
    localHash: localSnapshot.hash,
    remoteHash: remoteSnapshot.hash,
    baseHash: previous.baseHash || "",
    baseLocalHash: previous.baseLocalHash || previous.baseHash || "",
    baseRemoteHash: previous.baseRemoteHash || previous.baseHash || "",
  });
  if (action === "conflict") {
    return persistDriveConflict(
      profileId,
      localSnapshot,
      remoteSnapshot,
      "Ambas versiones cambiaron desde la última base común. Elige cuál conservar; no se reemplazó ninguna.",
    );
  }
  if (action === "download-remote") {
    const latestLocalJson = await serializeProfileArchive(profileId);
    const latestLocal = {
      serialized: latestLocalJson,
      hash: await hashArchive(latestLocalJson),
    };
    if (
      latestLocal.hash !== localSnapshot.hash
      || (syncRevisions.get(profileId) || 0) !== startingRevision
    ) {
      await updateDriveSyncStatus(profileId, "pending", {
        message: "El perfil local cambió durante la comparación; se repetirá la sincronización con la última copia local.",
      });
      await scheduleDriveProfileSync(profileId, 0);
      return { status: "pending" };
    }
    await assertDriveSyncCurrent(profileId, link.accountId, accessToken, syncEpoch);
    const latestRemote = await readDriveSnapshot(profile, link, api);
    if (latestRemote.file?.id !== remoteSnapshot.file.id || latestRemote.hash !== remoteSnapshot.hash) {
      return persistDriveConflict(
        profileId,
        localSnapshot,
        latestRemote.file ? latestRemote : null,
        "Google Drive cambió antes de aplicar la restauración. Se conservaron ambas versiones.",
      );
    }
    await importDriveSnapshot(profileId, remoteSnapshot.archive);
    try {
      await assertDriveSyncCurrent(profileId, link.accountId, accessToken, syncEpoch);
    } catch (error) {
      const currentJson = await serializeProfileArchive(profileId);
      const currentHash = await hashArchive(currentJson);
      if (currentHash === remoteSnapshot.hash) {
        await importDriveSnapshot(profileId, JSON.parse(localSnapshot.serialized));
      }
      throw error;
    }
    const restoredJson = await serializeProfileArchive(profileId);
    const restoredHash = await hashArchive(restoredJson);
    const remoteAfterImport = await readDriveSnapshot(profile, link, api);
    if (remoteAfterImport.file?.id !== remoteSnapshot.file.id || remoteAfterImport.hash !== remoteSnapshot.hash) {
      return persistDriveConflict(
        profileId,
        { serialized: restoredJson, hash: restoredHash },
        remoteAfterImport.file ? remoteAfterImport : null,
        "Google Drive cambió durante la restauración. Se conservaron la copia aplicada y la versión remota actual.",
      );
    }
    if ((syncRevisions.get(profileId) || 0) !== startingRevision) {
      await updateDriveSyncStatus(profileId, "pending", {
        message: "El perfil local volvió a cambiar durante la restauración; se comparará otra vez.",
      });
      await scheduleDriveProfileSync(profileId, 0);
      return { status: "pending" };
    }
    await saveDriveBaseline(profile, remoteSnapshot.resolved, remoteSnapshot.file, restoredHash, {
      remoteHash: remoteSnapshot.hash,
    });
    return { status: "synced", downloaded: true, savedAt: Date.now() };
  }
  if (action === "same" && !forceUpload) {
    await assertDriveSyncCurrent(profileId, link.accountId, accessToken, syncEpoch);
    await saveDriveBaseline(profile, remoteSnapshot.resolved, remoteSnapshot.file, localSnapshot.hash, {
      remoteHash: remoteSnapshot.hash,
    });
    return {
      status: "synced",
      fileId: remoteSnapshot.file.id,
      fileName: remoteSnapshot.file.name,
      savedAt: Date.now(),
      updated: false,
      renamed: false,
      unchanged: true,
    };
  }

  let etag = remoteSnapshot.file.etag || "";
  if (!etag) {
    const latestRemote = await readDriveSnapshot(profile, link, api);
    if (!latestRemote.file || latestRemote.hash !== remoteSnapshot.hash) {
      return persistDriveConflict(
        profileId,
        localSnapshot,
        latestRemote.file ? latestRemote : remoteSnapshot,
        "La copia de Drive cambió durante la comprobación. No se sobrescribió.",
      );
    }
    etag = latestRemote.file.etag || "";
  }

  let file;
  try {
    await assertDriveSyncCurrent(profileId, link.accountId, accessToken, syncEpoch);
    file = await api.uploadFile(
      remoteSnapshot.resolved.profileFolder.id,
      remoteSnapshot.file.id,
      serialized,
      getDriveProfileArchiveName(profile),
      { ifMatch: etag },
    );
    await assertDriveSyncCurrent(profileId, link.accountId, accessToken, syncEpoch);
  } catch (error) {
    if (error.code !== "drive-precondition-failed") throw error;
    const latestRemote = await readDriveSnapshot(profile, link, api);
    if (!latestRemote.file) {
      return persistDriveConflict(
        profileId,
        localSnapshot,
        null,
        "La copia de Drive desapareció durante la escritura. No se creó otra automáticamente.",
      );
    }
    if (!etag) {
      const latestRemote = await readDriveSnapshot(profile, link, api);
      if (latestRemote.file?.id !== remoteSnapshot.file.id || latestRemote.hash !== localSnapshot.hash) {
        return persistDriveConflict(
          profileId,
          localSnapshot,
          latestRemote.file ? latestRemote : null,
          "No se pudo garantizar una escritura condicional y Drive cambió durante la operación.",
        );
      }
    }
    return persistDriveConflict(
      profileId,
      localSnapshot,
      latestRemote.file ? latestRemote : null,
      "Google Drive cambió durante la escritura. No se sobrescribió la versión remota.",
    );
  }
  if (!etag) {
    const confirmedRemote = await readDriveSnapshot(profile, link, api);
    if (
      confirmedRemote.file?.id !== remoteSnapshot.file.id
      || confirmedRemote.hash !== localSnapshot.hash
    ) {
      return persistDriveConflict(
        profileId,
        localSnapshot,
        confirmedRemote.file ? confirmedRemote : null,
        "No se pudo confirmar la copia tras guardarla en Drive.",
      );
    }
    file = confirmedRemote.file;
  }
  const savedAt = await saveDriveBaseline(profile, remoteSnapshot.resolved, file, localSnapshot.hash);
  return {
    fileId: file.id,
    fileName: file.name || getDriveProfileArchiveName(profile),
    savedAt,
    updated: true,
    renamed: remoteSnapshot.file.name !== getDriveProfileArchiveName(profile),
  };
}

export async function syncDriveProfileNow(profile, {
  confirmCreateStructure = false,
  allowInitialUpload = false,
  forceUpload = false,
} = {}) {
  if (!profile?.id || profile.id === "guest") throw new Error("Solo se pueden sincronizar perfiles locales registrados.");
  clearTimeout(syncTimers.get(profile.id));
  syncTimers.delete(profile.id);
  const revision = syncRevisions.get(profile.id) || 0;
  const existing = syncPromises.get(profile.id);
  if (existing) {
    const result = await existing;
    if (forceUpload && result?.status === "synced" && !result.updated) {
      return syncDriveProfileNow(profile, {
        confirmCreateStructure,
        allowInitialUpload,
        forceUpload,
      });
    }
    if ((syncRevisions.get(profile.id) || 0) !== revision) {
      await scheduleDriveProfileSync(profile.id, 0);
    }
    return result;
  }
  const controller = new AbortController();
  syncControllers.set(profile.id, controller);
  const operation = performDriveProfileSync(profile.id, {
    confirmCreateStructure,
    allowInitialUpload,
    forceUpload,
    signal: controller.signal,
  });
  syncPromises.set(profile.id, operation);
  let result;
  try {
    result = await operation;
  } catch (error) {
    const previous = await getDriveSyncMetadata(profile.id);
    if (
      error.code === "drive-first-save-confirmation-required"
      || error.code === "drive-root-create-confirmation-required"
      || error.code === "drive-initialization-required"
      || error.code === "drive-sync-cancelled"
      || error.name === "AbortError"
    ) {
      if (error.code === "drive-sync-cancelled" || error.name === "AbortError") {
        await updateDriveSyncStatus(profile.id, "local-only", {
          message: "La vinculación cambió. La versión operativa permanece en Calliope; no se confirmó Drive.",
        });
      } else if (error.code === "drive-initialization-required") {
        await updateDriveSyncStatus(profile.id, "decision-required", {
          message: "Revisa de nuevo la copia remota antes de resolver la primera vinculación.",
        });
      }
      throw error;
    }
    if (error.message?.includes("caducado o fue revocada")) {
      await updateDriveSyncStatus(profile.id, "reauth", { message: error.message, nextRetryAt: 0 });
    } else if (!isOnline()) {
      await updateDriveSyncStatus(profile.id, "offline", {
        message: "Sin conexión. La versión operativa permanece en Calliope y el envío a Drive queda pendiente.",
      });
    } else {
      const retryable = error.retryable || error.name === "TypeError";
      const attempts = retryable ? (Number(previous.attempts) || 0) + 1 : 0;
      const delay = retryable
        ? Math.min(300_000, DRIVE_SYNC_DEBOUNCE_MS * (2 ** Math.min(attempts - 1, 7)))
        : 0;
      const nextRetryAt = delay ? Date.now() + delay : 0;
      await updateDriveSyncStatus(profile.id, "error", {
        attempts,
        nextRetryAt,
        message: error.message || "No se pudo sincronizar Google Drive.",
      });
      if (delay) scheduleDriveRetry(profile.id, delay);
    }
    throw error;
  } finally {
    syncPromises.delete(profile.id);
    if (syncControllers.get(profile.id) === controller) syncControllers.delete(profile.id);
  }
  if ((syncRevisions.get(profile.id) || 0) !== revision) {
    await scheduleDriveProfileSync(profile.id, 0);
  }
  return result;
}

function scheduleDriveRetry(profileId, delay) {
  clearTimeout(syncTimers.get(profileId));
  const timer = setTimeout(() => {
    syncTimers.delete(profileId);
    void resumeDriveProfileSync(profileId).catch((error) => {
      console.error("[googleDriveProfiles] No se pudo reanudar el reintento:", error);
    });
  }, delay);
  syncTimers.set(profileId, timer);
}

export async function scheduleDriveProfileSync(
  profileId,
  delay = DRIVE_SYNC_DEBOUNCE_MS,
  { localChange = true } = {},
) {
  if (!profileId || profileId === "guest") return;
  syncRevisions.set(profileId, (syncRevisions.get(profileId) || 0) + 1);
  try {
    const link = await getProfileDriveLink(profileId);
    if (!link?.accountId) {
      await updateDriveSyncStatus(profileId, "local-only", {
        message: "Perfil sin respaldo en la nube. Los datos operativos permanecen en Calliope; puedes exportarlos manualmente.",
        pendingLocalHash: "",
      });
      return;
    }
    if (link.initializationPending) {
      await updateDriveSyncStatus(profileId, "decision-required", {
        message: "Elige si quieres restaurar una copia de Drive o inicializarla con este perfil.",
        ...(localChange ? { localChangedAt: Date.now() } : {}),
      });
      return;
    }
    await updateDriveSyncStatus(profileId, "pending", {
      message: "La escritura operativa local terminó. Drive se actualizará tras el intervalo de agrupación.",
      ...(localChange ? { localChangedAt: Date.now() } : {}),
    });
  } catch (error) {
    driveSyncStatuses[profileId] = {
      profileId,
      status: "error",
      message: `No se pudo guardar la cola de sincronización en IndexedDB: ${error.message}`,
      updatedAt: Date.now(),
    };
    throw error;
  }
  clearTimeout(syncTimers.get(profileId));
  const timer = setTimeout(() => {
    syncTimers.delete(profileId);
    void syncDriveProfileNow({ id: profileId }).catch((error) => {
      console.error("[googleDriveProfiles] Falló la sincronización automática del perfil:", error);
    });
  }, Math.max(0, delay));
  syncTimers.set(profileId, timer);
}

export async function resumeDriveProfileSync(profileId) {
  if (!profileId || profileId === "guest") return;
  const link = await getProfileDriveLink(profileId);
  if (!link?.accountId) return;
  if (link.initializationPending) {
    await updateDriveSyncStatus(profileId, "decision-required", {
      message: "La primera vinculación requiere que elijas qué versión conservar.",
    });
    return;
  }
  const state = await getDriveSyncMetadata(profileId);
  if (state.nextRetryAt > Date.now()) {
    scheduleDriveRetry(profileId, state.nextRetryAt - Date.now());
    return;
  }
  if (!tokenCache.get(profileId)?.accessToken) {
    await updateDriveSyncStatus(profileId, "reauth", {
      message: "Vuelve a autorizar Google para comparar las versiones. Los datos locales siguen disponibles.",
    });
    return;
  }
  await scheduleDriveProfileSync(profileId, 0, { localChange: false });
}

export async function inspectDriveProfileInitialization(profile) {
  if (!profile?.id || profile.id === "guest") {
    throw new Error("Selecciona un perfil registrado para revisar su primera vinculación.");
  }
  const { accessToken, link } = await authorizeProfile(profile.id);
  if (!link?.accountId || !link.initializationPending) {
    throw new Error("Este perfil no está pendiente de inicializar su vinculación de Drive.");
  }
  const api = createGoogleDriveApi(accessToken, {
    onUnauthorized: () => tokenCache.delete(profile.id),
  });
  let remote;
  try {
    remote = await readDriveSnapshot(profile, link, api);
  } catch (error) {
    if (error.code !== "drive-folder-missing") throw error;
    remote = null;
  }
  await assertDriveSyncCurrent(
    profile.id,
    link.accountId,
    accessToken,
    syncEpochs.get(profile.id) || 0,
  );
  const currentProfile = await loadCurrentProfile(profile.id);
  if (normalizeUsername(currentProfile.username) !== normalizeUsername(profile.username)) {
    throw new Error("El perfil seleccionado cambió durante la revisión de Drive.");
  }
  const localJson = await serializeProfileArchive(profile.id);
  validateDriveProfileArchiveIdentity(JSON.parse(localJson), currentProfile);
  return {
    remoteExists: Boolean(remote?.file),
    remoteHash: remote?.hash || "",
    remoteFileId: remote?.file?.id || "",
    remoteModifiedTime: remote?.file?.modifiedTime || "",
    remoteArchive: remote?.archive || null,
    localHash: await hashArchive(localJson),
  };
}

export async function resolveDriveProfileInitialization(profile, choice, expectedRemote) {
  if (!profile?.id || profile.id === "guest") {
    throw new Error("Selecciona un perfil registrado para completar la vinculación.");
  }
  if (choice !== "local" && choice !== "drive") {
    throw new Error("La opción de inicialización no es válida.");
  }
  const { accessToken, link } = await authorizeProfile(profile.id);
  if (!link?.accountId || !link.initializationPending) {
    throw new Error("La primera vinculación ya no está pendiente.");
  }
  const api = createGoogleDriveApi(accessToken, {
    onUnauthorized: () => tokenCache.delete(profile.id),
  });
  const syncEpoch = syncEpochs.get(profile.id) || 0;
  const currentProfile = await loadCurrentProfile(profile.id);
  if (normalizeUsername(currentProfile.username) !== normalizeUsername(profile.username)) {
    throw new Error("El perfil cambió durante la inicialización. No se modificó ninguna copia.");
  }
  const localJson = await serializeProfileArchive(profile.id);
  validateDriveProfileArchiveIdentity(JSON.parse(localJson), currentProfile);
  const localHash = await hashArchive(localJson);
  const startingRevision = syncRevisions.get(profile.id) || 0;
  if (localHash !== expectedRemote?.localHash) {
    throw new Error("Los datos locales cambiaron desde la revisión. Revisa de nuevo ambas versiones.");
  }

  let remote;
  try {
    remote = await readDriveSnapshot(currentProfile, link, api);
  } catch (error) {
    if (error.code !== "drive-folder-missing") throw error;
    remote = null;
  }
  if (
    Boolean(remote?.file) !== Boolean(expectedRemote?.remoteExists)
    || (remote?.file?.id || "") !== (expectedRemote?.remoteFileId || "")
    || (remote?.hash || "") !== (expectedRemote?.remoteHash || "")
  ) {
    throw new Error("La copia de Drive cambió desde la revisión. Ninguna versión se reemplazó; vuelve a comprobarla.");
  }
  if (!remote?.file) {
    throw new Error("No hay una copia remota que restaurar o reemplazar. Para inicializar Drive, elige «Subir perfil local».");
  }

  await assertDriveSyncCurrent(profile.id, link.accountId, accessToken, syncEpoch);
  if (choice === "drive") {
    await importDriveSnapshot(profile.id, remote.archive);
    await assertDriveSyncCurrent(profile.id, link.accountId, accessToken, syncEpoch);
    const latestRemote = await readDriveSnapshot(currentProfile, link, api);
    if (latestRemote.hash !== remote.hash || latestRemote.file?.id !== remote.file.id) {
      const restoredJson = await serializeProfileArchive(profile.id);
      await persistDriveConflict(
        profile.id,
        { serialized: restoredJson, hash: await hashArchive(restoredJson) },
        latestRemote.file ? latestRemote : null,
        "Google Drive cambió mientras se restauraba. Se conservaron la copia local y la versión remota actual.",
      );
      throw new Error("Google Drive cambió durante la restauración. Se conservaron ambas versiones para resolverlo.");
    }
    const restoredJson = await serializeProfileArchive(profile.id);
    const restoredHash = await hashArchive(restoredJson);
    await saveDriveBaseline(currentProfile, remote.resolved, remote.file, restoredHash, {
      remoteHash: remote.hash,
    });
    return { choice, savedAt: Date.now() };
  }

  if (!remote.file.etag) {
    const latestRemote = await readDriveSnapshot(currentProfile, link, api);
    if (latestRemote.file?.id !== remote.file.id || latestRemote.hash !== remote.hash) {
      throw new Error("La copia de Drive cambió antes de escribir. No se reemplazó; revisa de nuevo el conflicto.");
    }
    remote = latestRemote;
  }
  await assertDriveSyncCurrent(profile.id, link.accountId, accessToken, syncEpoch);
  const latestLocalJson = await serializeProfileArchive(profile.id);
  if (
    await hashArchive(latestLocalJson) !== localHash
    || (syncRevisions.get(profile.id) || 0) !== startingRevision
  ) {
    throw new Error("Los datos locales cambiaron antes de escribir. No se reemplazó la copia de Drive.");
  }
  const updatedFile = await api.uploadFile(
    remote.resolved.profileFolder.id,
    remote.file.id,
    localJson,
    getDriveProfileArchiveName(currentProfile),
    { ifMatch: remote.file.etag || "" },
  );
  await assertDriveSyncCurrent(profile.id, link.accountId, accessToken, syncEpoch);
  if (!remote.file.etag) {
    const latestRemote = await readDriveSnapshot(currentProfile, link, api);
    if (latestRemote.file?.id !== remote.file.id || latestRemote.hash !== localHash) {
      await persistDriveConflict(
        profile.id,
        { serialized: localJson, hash: localHash },
        latestRemote.file ? latestRemote : null,
        "No se pudo confirmar una escritura condicional; Drive cambió durante la operación.",
      );
      throw new Error("Drive cambió durante la escritura. Se conservaron las versiones para resolver el conflicto.");
    }
  }
  await saveDriveBaseline(currentProfile, remote.resolved, updatedFile, localHash);
  const afterUpload = await serializeProfileArchive(profile.id);
  if (
    await hashArchive(afterUpload) !== localHash
    || (syncRevisions.get(profile.id) || 0) !== startingRevision
  ) {
    await scheduleDriveProfileSync(profile.id, DRIVE_SYNC_DEBOUNCE_MS);
  }
  return { choice, savedAt: Date.now(), updated: true };
}

async function performDriveProfileConflictResolution(profileId, choice, signal) {
  const state = await getDriveSyncMetadata(profileId);
  const conflict = state?.conflict;
  if (!conflict) throw new Error("No hay ningún conflicto pendiente para este perfil.");
  if (choice !== "local" && choice !== "drive") throw new Error("La resolución del conflicto no es válida.");
  const profile = await loadCurrentProfile(profileId);
  const currentLocal = await serializeProfileArchive(profileId);
  const currentLocalHash = await hashArchive(currentLocal);
  const startingRevision = syncRevisions.get(profileId) || 0;
  if (currentLocalHash !== conflict.localHash) {
    await scheduleDriveProfileSync(profileId, 0);
    throw new Error("El perfil local cambió después de detectar el conflicto. Se necesita comparar de nuevo antes de resolverlo.");
  }
  const link = await getProfileDriveLink(profileId);
  const token = tokenCache.get(profileId);
  if (!link?.accountId || !token?.accessToken || token.expiresAt <= Date.now() + 60_000) {
    await updateDriveSyncStatus(profileId, "reauth", {
      message: "Vuelve a autorizar Google para resolver el conflicto. Las dos versiones siguen conservadas.",
    });
    throw new Error("Vuelve a autorizar Google antes de resolver el conflicto.");
  }
  const syncEpoch = syncEpochs.get(profileId) || 0;
  const accessToken = token.accessToken;
  const api = createGoogleDriveApi(token.accessToken, {
    onUnauthorized: () => tokenCache.delete(profileId),
    signal,
  });
  await assertDriveSyncCurrent(profileId, link.accountId, accessToken, syncEpoch);
  const currentRemote = await readDriveSnapshot(profile, link, api);
  if (
    (currentRemote.hash || "") !== (conflict.remoteHash || "")
    || (currentRemote.file?.id || "") !== (conflict.remoteFileId || "")
  ) {
    const localSnapshot = { serialized: currentLocal, hash: currentLocalHash };
    await persistDriveConflict(profileId, localSnapshot, currentRemote.file ? currentRemote : null,
      "Google Drive volvió a cambiar desde que se mostró este conflicto. Revisa las versiones actualizadas.");
    throw new Error("La versión remota cambió. Se actualizó el conflicto sin reemplazar ninguna copia.");
  }

  if (choice === "local") {
    if (!currentRemote.file) {
      if (!currentRemote.resolved?.profileFolder) {
        throw new Error("No se pudo verificar la carpeta del perfil para guardar la versión local.");
      }
      await assertDriveSyncCurrent(profileId, link.accountId, accessToken, syncEpoch);
      const latestRemote = await readDriveSnapshot(profile, link, api);
      if (latestRemote.file) {
        await persistDriveConflict(
          profileId,
          { serialized: currentLocal, hash: currentLocalHash },
          latestRemote,
          "Apareció una copia remota antes de recrear el archivo. Revisa las versiones antes de continuar.",
        );
        throw new Error("Apareció una copia remota; no se creó otro archivo.");
      }
      const file = await api.uploadFile(
        latestRemote.resolved.profileFolder.id,
        null,
        currentLocal,
        getDriveProfileArchiveName(profile),
      );
      await assertDriveSyncCurrent(profileId, link.accountId, accessToken, syncEpoch);
      const confirmedRemote = await readDriveSnapshot(profile, link, api);
      if (confirmedRemote.file?.id !== file.id || confirmedRemote.hash !== currentLocalHash) {
        await persistDriveConflict(
          profileId,
          { serialized: currentLocal, hash: currentLocalHash },
          confirmedRemote.file ? confirmedRemote : null,
          "No se pudo confirmar de forma exclusiva el archivo recreado.",
        );
        throw new Error("No se pudo confirmar el archivo nuevo; revisa el conflicto antes de continuar.");
      }
      await saveDriveBaseline(profile, confirmedRemote.resolved, confirmedRemote.file, currentLocalHash);
      return { choice, savedAt: Date.now() };
    }
    let remoteForWrite = currentRemote;
    if (!remoteForWrite.file.etag) {
      const latestRemote = await readDriveSnapshot(profile, link, api);
      if (latestRemote.file?.id !== currentRemote.file.id || latestRemote.hash !== currentRemote.hash) {
        await persistDriveConflict(
          profileId,
          { serialized: currentLocal, hash: currentLocalHash },
          latestRemote.file ? latestRemote : null,
          "Google Drive cambió justo antes de conservar la versión local. Revisa las versiones actualizadas.",
        );
        throw new Error("Google Drive cambió antes de escribir. No se reemplazó la copia.");
      }
      remoteForWrite = latestRemote;
    }
    await assertDriveSyncCurrent(profileId, link.accountId, accessToken, syncEpoch);
    const file = await api.uploadFile(
      remoteForWrite.resolved.profileFolder.id,
      remoteForWrite.file.id,
      currentLocal,
      getDriveProfileArchiveName(profile),
      { ifMatch: remoteForWrite.file.etag || "" },
    );
    await assertDriveSyncCurrent(profileId, link.accountId, accessToken, syncEpoch);
    if (!remoteForWrite.file.etag) {
      const latestRemote = await readDriveSnapshot(profile, link, api);
      if (latestRemote.file?.id !== remoteForWrite.file.id || latestRemote.hash !== currentLocalHash) {
        await persistDriveConflict(
          profileId,
          { serialized: currentLocal, hash: currentLocalHash },
          latestRemote.file ? latestRemote : null,
          "Drive pudo cambiar durante la escritura, que no admite una condición verificable.",
        );
        throw new Error("No se pudo confirmar la escritura condicional. Se conservaron las versiones para resolver el conflicto.");
      }
    }
    const savedAt = await saveDriveBaseline(profile, remoteForWrite.resolved, file, currentLocalHash);
    return { choice, savedAt };
  }

  if (!conflict.remoteJson) throw new Error("No hay una copia remota disponible para conservar.");
  const remoteArchive = validateDriveProfileArchiveIdentity(JSON.parse(conflict.remoteJson), profile);
  await assertDriveSyncCurrent(profileId, link.accountId, accessToken, syncEpoch);
  await importDriveSnapshot(profileId, remoteArchive);
  try {
    await assertDriveSyncCurrent(profileId, link.accountId, accessToken, syncEpoch);
  } catch (error) {
    const latestJson = await serializeProfileArchive(profileId);
    if (await hashArchive(latestJson) === conflict.remoteHash) {
      await importDriveSnapshot(profileId, JSON.parse(currentLocal));
    }
    throw error;
  }
  const latestRemote = await readDriveSnapshot(profile, link, api);
  if (
    latestRemote.hash !== conflict.remoteHash
    || latestRemote.file?.id !== conflict.remoteFileId
  ) {
    const restoredJson = await serializeProfileArchive(profileId);
    await persistDriveConflict(
      profileId,
      { serialized: restoredJson, hash: await hashArchive(restoredJson) },
      latestRemote.file ? latestRemote : null,
      "Google Drive cambió durante la restauración. Se conservaron los datos locales y la versión remota actual.",
    );
    throw new Error("Google Drive cambió durante la restauración; revisa el conflicto actualizado.");
  }
  const importedJson = await serializeProfileArchive(profileId);
  const importedHash = await hashArchive(importedJson);
  if ((syncRevisions.get(profileId) || 0) !== startingRevision) {
    const latestLocal = { serialized: importedJson, hash: importedHash };
    await persistDriveConflict(profileId, latestLocal, currentRemote,
      "El perfil local cambió durante la resolución. Se conservaron ambas versiones.");
    throw new Error("El perfil local cambió durante la resolución; se conservaron ambas versiones.");
  }
  await saveDriveBaseline(profile, currentRemote.resolved, currentRemote.file, importedHash, {
    remoteHash: conflict.remoteHash,
  });
  return { choice, savedAt: Date.now() };
}

export async function resolveDriveProfileConflict(profileId, choice) {
  const existing = syncPromises.get(profileId);
  if (existing) {
    await existing;
    return resolveDriveProfileConflict(profileId, choice);
  }
  const controller = new AbortController();
  syncControllers.set(profileId, controller);
  const operation = performDriveProfileConflictResolution(profileId, choice, controller.signal);
  syncPromises.set(profileId, operation);
  try {
    return await operation;
  } finally {
    syncPromises.delete(profileId);
    if (syncControllers.get(profileId) === controller) syncControllers.delete(profileId);
  }
}

export async function getDriveProfileConflictBackups(profileId) {
  const state = await getDriveSyncMetadata(profileId);
  if (!state?.conflict) throw new Error("No hay copias de conflicto disponibles.");
  return {
    localJson: state.conflict.localJson,
    remoteJson: state.conflict.remoteJson,
  };
}

export async function recordDriveProfileRestore(profile, restoredArchive) {
  if (!profile?.id || profile.id === "guest") return;
  const token = tokenCache.get(profile.id);
  const link = await getProfileDriveLink(profile.id);
  if (!link?.accountId || !token?.accessToken || token.expiresAt <= Date.now() + 60_000) {
    await updateDriveSyncStatus(profile.id, "reauth", {
      message: "La restauración local se completó. Vuelve a autorizar Google para confirmar la base de sincronización.",
    });
    return;
  }
  const canonical = validateDriveProfileArchiveIdentity(restoredArchive, profile);
  const restoredHash = await hashArchive(JSON.stringify(canonical));
  const currentLocal = await serializeProfileArchive(profile.id);
  const currentLocalHash = await hashArchive(currentLocal);
  const api = createGoogleDriveApi(token.accessToken, {
    onUnauthorized: () => tokenCache.delete(profile.id),
  });
  const remote = await readDriveSnapshot(profile, link, api);
  if (!remote.file || remote.hash !== restoredHash) {
    return persistDriveConflict(
      profile.id,
      { serialized: currentLocal, hash: currentLocalHash },
      remote.file ? remote : null,
      "Google Drive cambió después de la restauración manual. Se conservaron los datos locales y la versión remota.",
    );
  }
  await saveDriveBaseline(profile, remote.resolved, remote.file, currentLocalHash, {
    remoteHash: restoredHash,
  });
}

async function resumeAllPendingDriveSyncs() {
  const db = await openProfileDb();
  const keys = await db.getAllKeys("settings");
  for (const key of keys) {
    if (typeof key !== "string" || !key.startsWith(SYNC_KEY_PREFIX)) continue;
    const profileId = key.slice(SYNC_KEY_PREFIX.length);
    const state = await getDriveSyncMetadata(profileId);
    if (state.status === "conflict") continue;
    if (
      state.status === "pending"
      || state.status === "error"
      || state.status === "offline"
      || (!state.status && state.profileId)
      || (state.status === "synced" && Date.now() - Number(state.lastSyncedAt || 0) >= 30_000)
    ) {
      void resumeDriveProfileSync(profileId).catch((error) => {
        console.error("[googleDriveProfiles] No se pudo reanudar la sincronización:", error);
      });
    }
  }
}

function initializeDriveSyncLifecycle() {
  if (syncLifecycleInitialized || typeof window === "undefined") return;
  syncLifecycleInitialized = true;
  const resume = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    void resumeAllPendingDriveSyncs().catch((error) => {
      console.error("[googleDriveProfiles] No se pudo revisar la cola de sincronización:", error);
    });
  };
  window.addEventListener("online", resume);
  window.addEventListener("focus", resume);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", resume);
}

export async function saveProfileArchiveToDrive(profile, {
  confirmCreateStructure = false,
  initialize = false,
} = {}) {
  const link = await getProfileDriveLink(profile?.id);
  const previousName = link?.fileName || "";
  if (link?.initializationPending && !initialize) {
    const error = new Error("Revisa la copia remota y elige explícitamente qué versión conservar antes de guardar.");
    error.code = "drive-initialization-required";
    throw error;
  }
  if (link?.accountId && !link.fileId && !confirmCreateStructure) {
    const error = new Error("Antes de crear la primera copia en Drive, confirma que la aplicación puede crear cualquier elemento de la estructura que no encuentre.");
    error.code = "drive-first-save-confirmation-required";
    throw error;
  }
  const result = await syncDriveProfileNow(profile, {
    confirmCreateStructure,
    allowInitialUpload: initialize,
    forceUpload: true,
  });
  if (result.status === "conflict") {
    const error = new Error(result.message || "Hay un conflicto de sincronización pendiente.");
    error.code = "drive-sync-conflict";
    throw error;
  }
  if (result.status === "reauth") {
    const error = new Error(result.message);
    error.code = "drive-reauth-required";
    throw error;
  }
  if (result.status === "offline") {
    const error = new Error("Sin conexión. La versión operativa permanece en Calliope y Google Drive se actualizará cuando vuelva la red.");
    error.code = "drive-offline";
    throw error;
  }
  return {
    ...result,
    renamed: Boolean(result.updated && previousName && previousName !== result.fileName),
  };
}

initializeDriveSyncLifecycle();

export async function downloadProfileArchiveFromDrive(profile) {
  if (!profile?.id || profile.id === "guest") throw new Error("Selecciona un perfil local registrado.");
  const { accessToken, link } = await authorizeProfile(profile.id);
  if (!link?.accountId) throw new Error("Vincula una cuenta de Google a este perfil antes de restaurar.");
  const api = createGoogleDriveApi(accessToken, { onUnauthorized: () => tokenCache.delete(profile.id) });
  const resolved = await resolveProfileDrive(profile, link, api, { createMissing: false });
  const { profileFolder } = resolved;
  const expectedName = getDriveProfileArchiveName(profile);
  const remoteFile = await findProfileArchiveFile(api, profileFolder.id, link, expectedName);
  if (!remoteFile) {
    throw new Error(`No se encontró ${expectedName} ni el archivo antiguo profile_data.json en la carpeta de este perfil.`);
  }
  const serialized = await api.downloadFile(remoteFile.id);
  if (new TextEncoder().encode(serialized).byteLength > MAX_PROFILE_ARCHIVE_BYTES) {
    throw new Error("El archivo remoto supera el límite de tamaño permitido.");
  }
  const archive = validateDriveProfileArchiveIdentity(JSON.parse(serialized), profile);
  await storeProfileDriveLink(profile.id, {
    ...resolved.link,
    fileId: remoteFile.id,
    fileName: remoteFile.name,
    fileUsername: normalizeUsername(archive.profile.username),
    updatedAt: Date.now(),
  });
  return archive;
}

export async function renameDriveProfileFolder(profile, nextName) {
  const name = String(nextName || "").trim();
  if (!profile?.id || !name) throw new Error("El perfil o su nombre no son válidos.");
  const { accessToken, link } = await authorizeProfile(profile.id);
  if (!link.profileFolderId || !link.profilesFolderId) throw new Error("Guarda el perfil en Drive antes de cambiar el nombre de su carpeta.");
  const api = createGoogleDriveApi(accessToken, { onUnauthorized: () => tokenCache.delete(profile.id) });
  const existing = await api.getFile(link.profileFolderId);
  if (
    existing.mimeType !== "application/vnd.google-apps.folder"
    || !existing.parents?.includes(link.profilesFolderId)
    || (link.profileFolderName && existing.name !== link.profileFolderName)
  ) {
    throw new Error("La carpeta del perfil cambió de tipo, nombre o ubicación. Revísala en Drive antes de continuar.");
  }
  const matches = await api.findChildren(link.profilesFolderId, name, "application/vnd.google-apps.folder");
  if (matches.some((folder) => folder.id !== existing.id)) {
    throw new Error(`Ya existe otra carpeta «${name}» dentro de Calliope/profiles.`);
  }
  const response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(existing.id)}?fields=id,name,mimeType,parents`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    if (response.status === 401) tokenCache.delete(profile.id);
    throw new Error(`No se pudo renombrar la carpeta de Drive (HTTP ${response.status}).`);
  }
  const renamed = await response.json();
  await storeProfileDriveLink(profile.id, {
    ...link,
    profileFolderName: renamed.name,
    updatedAt: Date.now(),
  });
  return renamed.name;
}
