export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])$/;

export function validateUsername(value) {
  if (typeof value !== "string") {
    return { valid: false, username: "", reason: "El nombre de usuario debe ser texto." };
  }

  let username = value.trim();
  if (username.startsWith("@")) username = username.slice(1);
  username = username.toLocaleLowerCase("en-US");

  if (!username) {
    return { valid: false, username: "", reason: "El nombre de usuario es obligatorio." };
  }
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
    return {
      valid: false,
      username,
      reason: `Usa entre ${USERNAME_MIN_LENGTH} y ${USERNAME_MAX_LENGTH} caracteres.`,
    };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      valid: false,
      username,
      reason: "Usa letras, números, puntos, guiones o guiones bajos; empieza y termina con letra o número.",
    };
  }

  return { valid: true, username, reason: "" };
}

export function normalizeUsername(value) {
  const result = validateUsername(value);
  return result.valid ? result.username : "";
}

export function findUsernameOwner(username, profiles = [], exceptProfileId = null) {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;

  return profiles.find((profile) =>
    profile?.id !== exceptProfileId
    && normalizeUsername(profile?.username) === normalized,
  ) || null;
}

export function inspectProfileIdentity(importedProfile, profiles = []) {
  const idOwner = profiles.find((profile) => profile?.id === importedProfile?.id) || null;
  const usernameValidation = importedProfile?.username
    ? validateUsername(importedProfile.username)
    : { valid: false, username: "", reason: "El archivo no contiene un nombre de usuario." };
  const usernameOwner = usernameValidation.valid
    ? findUsernameOwner(usernameValidation.username, profiles)
    : null;

  if (idOwner && usernameOwner && idOwner.id !== usernameOwner.id) {
    return { type: "split-identity", idOwner, usernameOwner, usernameValidation };
  }
  if (idOwner) {
    return { type: "id-match", idOwner, usernameOwner, usernameValidation };
  }
  if (usernameOwner) {
    return { type: "username-match", idOwner: null, usernameOwner, usernameValidation };
  }
  if (!usernameValidation.valid) {
    return { type: "username-required", idOwner: null, usernameOwner: null, usernameValidation };
  }
  return { type: "new", idOwner: null, usernameOwner: null, usernameValidation };
}

export function withProfileUsername(profile, username) {
  const validation = validateUsername(username);
  if (!validation.valid) throw new Error(validation.reason);
  return {
    ...profile,
    username: validation.username,
  };
}
