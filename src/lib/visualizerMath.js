export function visualizerMode(isPlaying, isMuted, volume) {
  if (!isPlaying) return "off";
  if (isMuted || !(Number(volume) > 0.01)) return "dimmed";
  return "active";
}

export function scaledVisualizerGain(volume) {
  const clamped = Math.max(0, Math.min(1, Number(volume) || 0));
  return 0.16 + 0.84 * Math.pow(clamped, 0.65);
}

export function visualizerAmplitude(level, volume) {
  const clampedLevel = Math.max(0, Math.min(1, Number(level) || 0));
  const emphasizedLevel = clampedLevel + 0.16 * clampedLevel * (1 - clampedLevel);
  return emphasizedLevel * scaledVisualizerGain(volume);
}

export function smoothVisualizerValue(current, target, attack, release, deltaSeconds) {
  const coefficient = target > current ? attack : release;
  const blend = 1 - Math.exp(-coefficient * Math.min(deltaSeconds, 0.1));
  return current + (target - current) * blend;
}
