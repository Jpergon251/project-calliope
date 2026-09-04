/**
 * Calliope Audio Volume Engine
 *
 * Single source of truth for volume conversions:
 * UI Volume (0.0 to 1.0) <-> Decibels (dB) <-> Linear Audio Gain (0.0 to 1.0)
 *
 * Perceptual curve based on human auditory perception (power curve with exponent 2.2):
 * - 0% (v = 0.00)  -> -Infinity dB (Gain: 0.0, Silence)
 * - 5% (v = 0.05)  -> ~ -57 dB     (Gain: ~0.0014, Ultra-low / night listening)
 * - 15% (v = 0.15) -> ~ -36 dB     (Gain: ~0.015, Low volume)
 * - 30% (v = 0.30) -> ~ -23 dB     (Gain: ~0.07, Medium-low volume)
 * - 50% (v = 0.50) -> ~ -13 dB     (Gain: ~0.22, Normal listening volume)
 * - 75% (v = 0.75) -> ~ -5.5 dB    (Gain: ~0.53, Loud)
 * - 100% (v = 1.00) -> 0.0 dB      (Gain: 1.0, Unity gain, Max, No clipping)
 */

export const MIN_DB = -60;
export const MAX_DB = 0;
export const PERCEPTUAL_EXPONENT = 2.2;

/**
 * Converts a UI slider volume (0.0 to 1.0) to decibels (dB).
 * @param {number} v
 * @returns {number} Decibels from -Infinity to 0.0
 */
export function volumeToDb(v) {
  const clamped = Math.max(0, Math.min(1, Number(v) || 0));
  if (clamped <= 0) return -Infinity;
  if (clamped >= 1) return 0;

  // gain = v ^ PERCEPTUAL_EXPONENT
  // dB = 20 * log10(gain) = 20 * PERCEPTUAL_EXPONENT * log10(v)
  const db = 20 * PERCEPTUAL_EXPONENT * Math.log10(clamped);
  return Math.round(db * 10) / 10;
}

/**
 * Converts decibels (dB) to linear audio gain (0.0 to 1.0).
 * @param {number} db
 * @returns {number} Gain factor 0.0 to 1.0
 */
export function dbToGain(db) {
  if (db === -Infinity || !Number.isFinite(db) || db <= -70) {
    return 0;
  }
  if (db >= 0) return 1.0;
  return Math.min(1.0, Math.max(0, Math.pow(10, db / 20)));
}

/**
 * Converts a UI slider volume (0.0 to 1.0) directly to linear audio gain (0.0 to 1.0).
 * @param {number} v
 * @returns {number} Linear gain for HTMLAudioElement or Web Audio GainNode
 */
export function volumeToGain(v) {
  const clamped = Math.max(0, Math.min(1, Number(v) || 0));
  if (clamped <= 0) return 0;
  if (clamped >= 1) return 1.0;
  return Math.pow(clamped, PERCEPTUAL_EXPONENT);
}

/**
 * Converts linear audio gain (0.0 to 1.0) back to decibels (dB).
 * @param {number} gain
 * @returns {number} Decibels
 */
export function gainToDb(gain) {
  const clamped = Math.max(0, Math.min(1, Number(gain) || 0));
  if (clamped <= 0.00001) return -Infinity;
  if (clamped >= 1.0) return 0;
  const db = 20 * Math.log10(clamped);
  return Math.round(db * 10) / 10;
}

/**
 * Converts decibels (dB) back to UI volume slider (0.0 to 1.0).
 * @param {number} db
 * @returns {number} UI volume from 0.0 to 1.0
 */
export function dbToVolume(db) {
  if (db === -Infinity || !Number.isFinite(db) || db <= -70) return 0;
  if (db >= 0) return 1.0;
  const gain = Math.pow(10, db / 20);
  const v = Math.pow(gain, 1 / PERCEPTUAL_EXPONENT);
  return Math.max(0, Math.min(1, Math.round(v * 1000) / 1000));
}

/**
 * Converts linear gain back to UI volume slider (0.0 to 1.0).
 * @param {number} gain
 * @returns {number} UI volume from 0.0 to 1.0
 */
export function gainToVolume(gain) {
  const clamped = Math.max(0, Math.min(1, Number(gain) || 0));
  if (clamped <= 0) return 0;
  if (clamped >= 1) return 1.0;
  return Math.pow(clamped, 1 / PERCEPTUAL_EXPONENT);
}

/**
 * Formats a dB level or volume status for clean UI presentation.
 * @param {number} db
 * @param {Object} [options]
 * @param {boolean} [options.isMuted]
 * @returns {string} e.g. "-18 dB", "0 dB", "Silenciado", "-∞ dB"
 */
export function formatDb(db, { isMuted = false } = {}) {
  if (isMuted) return "Silenciado";
  if (db === -Infinity || !Number.isFinite(db) || db <= -65) {
    return "-∞ dB";
  }
  const rounded = Math.round(db);
  return rounded === 0 ? "0 dB" : `${rounded} dB`;
}

/**
 * Returns volume icon category for UI icons:
 * 'mute' | 'low' | 'medium' | 'high'
 * @param {number} volume (0.0 to 1.0)
 * @param {boolean} isMuted
 * @returns {'mute' | 'low' | 'medium' | 'high'}
 */
export function getVolumeIconType(volume, isMuted = false) {
  if (isMuted || volume <= 0.005) return "mute";
  if (volume < 0.3) return "low";
  if (volume < 0.7) return "medium";
  return "high";
}
