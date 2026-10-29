import { Capacitor } from "@capacitor/core";
import {
  MAX_PROFILE_ARCHIVE_BYTES,
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
const tokenCache = new Map();
const linkCache = new Map();
let googleIdentityPromise = null;

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
  const username = normalizeUsername(profile?.username);
  if (!username) {
    throw new Error("El perfil necesita un nombre de usuario válido para generar el nombre del archivo de Drive.");
  }
  return `${username}_profile_data.json`;
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
    prompt: connect ? "select_account consent" : "select_account",
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
}

export function clearGoogleDriveToken(profileId) {
  if (!profileId) return;
  tokenCache.delete(profileId);
  linkCache.delete(profileId);
}

function escapeDriveQuery(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

export function createGoogleDriveApi(accessToken, { onUnauthorized = () => {} } = {}) {
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
        throw new Error("Google Drive está limitando temporalmente las solicitudes. Espera un momento y vuelve a intentarlo.");
      }
      if (response.status === 404) {
        const error = new Error("No se encontró un elemento de Drive guardado previamente; no se creará otro automáticamente.");
        error.code = "drive-not-found";
        throw error;
      }
      throw new Error(`Google Drive devolvió un error HTTP ${response.status}.`);
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
    return file;
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
      const parentMatches = isRoot
        ? known.parents?.includes("root")
        : known.parents?.includes(parentId);
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
      if (needsConfirmation) error.code = "drive-root-create-confirmation-required";
      throw error;
    }
    return createFolder(parentId, name);
  }

  async function uploadFile(folderId, fileId, serialized, fileName) {
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
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      });
      return response.json();
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
    return response.json();
  }

  return { createFolder, downloadFile, findChildren, findOrCreateFolder, getFile, findRootFolders, uploadFile };
}

export function selectDriveProfileArchiveFile(files, linkedFile, folderId, allowedNames) {
  const candidates = files.filter((file, index) => files.findIndex((item) => item.id === file.id) === index);
  if (linkedFile) {
    if (
      linkedFile.mimeType === "application/vnd.google-apps.folder"
      || !linkedFile.parents?.includes(folderId)
      || !allowedNames.includes(linkedFile.name)
    ) {
      throw new Error("El archivo vinculado fue movido o cambió de nombre de forma inesperada. No se modificará otro archivo.");
    }
    if (candidates.some((file) => file.id !== linkedFile.id)) {
      throw new Error("Hay varios archivos candidatos para este perfil en Drive. No se eligió ni sobrescribió ninguno.");
    }
    return linkedFile;
  }
  if (candidates.length > 1) {
    throw new Error("Hay varios archivos candidatos para este perfil en Drive. No se eligió ni sobrescribió ninguno.");
  }
  return candidates[0] || null;
}

async function findProfileArchiveFile(api, folderId, link, expectedName) {
  const names = [...new Set([expectedName, LEGACY_PROFILE_ARCHIVE_NAME, link.fileName].filter(Boolean))];
  const matches = (await Promise.all(names.map((name) => api.findChildren(folderId, name)))).flat();
  const linkedFile = link.fileId ? await api.getFile(link.fileId) : null;
  return selectDriveProfileArchiveFile(matches, linkedFile, folderId, names);
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

export async function saveProfileArchiveToDrive(profile, { confirmCreateStructure = false } = {}) {
  if (!profile?.id || profile.id === "guest") throw new Error("Solo se pueden guardar perfiles locales registrados.");
  const { accessToken, link } = await authorizeProfile(profile.id);
  const serialized = await serializeProfileArchive(profile.id);
  if (!link.fileId && !confirmCreateStructure) {
    const error = new Error("Antes de crear la primera copia en Drive, confirma que la aplicación puede crear cualquier elemento de la estructura que no encuentre.");
    error.code = "drive-first-save-confirmation-required";
    throw error;
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_PROFILE_ARCHIVE_BYTES) {
    throw new Error("El perfil supera el límite de tamaño permitido para el respaldo.");
  }
  const archive = validateDriveProfileArchiveIdentity(JSON.parse(serialized), profile);

  const api = createGoogleDriveApi(accessToken, { onUnauthorized: () => tokenCache.delete(profile.id) });
  const resolved = await resolveProfileDrive(profile, link, api, { allowCreateRoot: confirmCreateStructure });
  const fileName = getDriveProfileArchiveName(profile);
  const existingFile = await findProfileArchiveFile(
    api,
    resolved.profileFolder.id,
    link,
    fileName,
  );

  if (existingFile) {
    const remoteJson = await api.downloadFile(existingFile.id);
    if (new TextEncoder().encode(remoteJson).byteLength > MAX_PROFILE_ARCHIVE_BYTES) {
      throw new Error("El archivo remoto supera el límite permitido y no se sobrescribió.");
    }
    let remoteArchive;
    try {
      remoteArchive = validateProfileArchive(JSON.parse(remoteJson)).archive;
    } catch (error) {
      throw new Error(`El archivo remoto existente no es un respaldo válido; no se sobrescribió. ${error.message}`);
    }
    if (
      remoteArchive.profile.id !== profile.id
      || (
        normalizeUsername(remoteArchive.profile.username) !== normalizeUsername(profile.username)
        && (!link.fileId || normalizeUsername(remoteArchive.profile.username) !== normalizeUsername(link.fileUsername))
      )
    ) {
      throw new Error("Conflicto de identidad: el archivo de Drive no coincide con el ID y el nombre de usuario actual o previamente vinculado. No se sobrescribió.");
    }
  }

  const file = await api.uploadFile(resolved.profileFolder.id, existingFile?.id || null, serialized, fileName);
  const savedAt = file.modifiedTime && Number.isFinite(Date.parse(file.modifiedTime))
    ? Date.parse(file.modifiedTime)
    : Date.now();
  await storeProfileDriveLink(profile.id, {
    ...resolved.link,
    fileId: file.id,
    fileName,
    fileUsername: normalizeUsername(profile.username),
    lastSavedAt: savedAt,
    updatedAt: Date.now(),
  });
  return {
    fileId: file.id,
    fileName,
    savedAt,
    updated: Boolean(existingFile),
    renamed: Boolean(existingFile && existingFile.name !== fileName),
  };
}

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
