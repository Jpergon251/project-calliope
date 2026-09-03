/**
 * =============================================================
 * Utilidades criptográficas locales con Web Crypto API.
 * 100% offline, sin dependencias externas.
 * PBKDF2 + SHA-256 para derivación segura de contraseñas con salt.
 * =============================================================
 */

function bufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function hexToBuffer(hex) {
  if (typeof hex !== "string" || hex.length % 2 !== 0) {
    throw new Error("Formato hexadecimal inválido");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Genera un identificador único local para un perfil.
 */
export function generateProfileId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `prof_${Date.now()}_${randomPart}`;
}

/**
 * Deriva una clave a partir de una contraseña utilizando PBKDF2 y un salt aleatorio (o existente).
 * @param {string} password - Contraseña en texto plano.
 * @param {string|null} existingSaltHex - Salt previo en formato hexadecimal (para verificación).
 * @param {number} iterations - Número de iteraciones PBKDF2 (100.000 por defecto).
 * @returns {Promise<{ hash: string, salt: string, iterations: number, algorithm: string }>}
 */
export async function hashPassword(
  password,
  existingSaltHex = null,
  iterations = 100000,
) {
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("La contraseña no puede estar vacía");
  }

  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  let saltBuffer;
  if (existingSaltHex) {
    saltBuffer = hexToBuffer(existingSaltHex);
  } else {
    saltBuffer = new Uint8Array(16);
    crypto.getRandomValues(saltBuffer);
  }

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256, // 256 bits = 32 bytes
  );

  return {
    hash: bufferToHex(derivedBits),
    salt: bufferToHex(saltBuffer),
    iterations,
    algorithm: "PBKDF2-SHA256",
  };
}

/**
 * Comprueba si una contraseña coincide con una credencial almacenada.
 * @param {string} password - Contraseña ingresada por el usuario.
 * @param {{ hash: string, salt: string, iterations?: number }|null} credential - Credencial almacenada.
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, credential) {
  if (!credential || !credential.hash || !credential.salt) {
    return false;
  }
  if (typeof password !== "string" || password.length === 0) {
    return false;
  }

  try {
    const iterations = credential.iterations || 100000;
    const derived = await hashPassword(password, credential.salt, iterations);
    return derived.hash === credential.hash;
  } catch (err) {
    console.error("[crypto] Error al verificar credencial:", err);
    return false;
  }
}
