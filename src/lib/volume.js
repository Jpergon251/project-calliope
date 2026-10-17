/**
 * Calliope Audio Volume Engine
 *
 * Single source of truth for volume conversions:
 * UI Volume (0.0 to 1.0) <-> Decibels (dB) <-> Linear Audio Gain (0.0 to 1.0)
 *
 * Perceptual curve based on human auditory perception (cubic power curve with exponent 3.0):
 * - 0% (v = 0.00)  -> -Infinity dB (Gain: 0.000, Silence)
 * - 10% (v = 0.10) -> -60.0 dB     (Gain: 0.001, Ultra-low / quiet background)
 * - 20% (v = 0.20) -> -41.9 dB     (Gain: 0.008, Low volume)
 * - 30% (v = 0.30) -> -31.4 dB     (Gain: 0.027, Medium-low volume)
 * - 40% (v = 0.40) -> -23.9 dB     (Gain: 0.064, Moderate listening)
 * - 50% (v = 0.50) -> -18.1 dB     (Gain: 0.125, Comfortable / moderate volume)
 * - 60% (v = 0.60) -> -13.3 dB     (Gain: 0.216, Lively listening volume)
 * - 70% (v = 0.70) -> -9.3 dB      (Gain: 0.343, Loud)
 * - 80% (v = 0.80) -> -5.8 dB      (Gain: 0.512, Very loud)
 * - 90% (v = 0.90) -> -2.7 dB      (Gain: 0.729, Near maximum)
 * - 100% (v = 1.00) -> 0.0 dB      (Gain: 1.000, Unity gain, Max, No clipping)
 */

export const MIN_DB = -60;
export const MAX_DB = 0;
export const PERCEPTUAL_EXPONENT = 3.0;

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
