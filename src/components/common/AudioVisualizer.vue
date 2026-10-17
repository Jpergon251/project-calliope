<template>
  <div
    class="audio-visualizer"
    :class="{
      active: visualizerState === 'active',
      muted: visualizerState === 'dimmed',
      paused: visualizerState === 'off',
    }"
    aria-hidden="true"
  >
    <canvas ref="canvas"></canvas>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch, computed } from 'vue';
import { useLibraryStore } from '../../stores/libraryStore.js';
import {
  scaledVisualizerGain,
  smoothVisualizerValue,
  visualizerAmplitude,
  visualizerMode,
} from '../../lib/visualizerMath.js';

const library = useLibraryStore();
const canvas = ref(null);
let analyser = null;
let animationFrame = null;
let idlePhase = 0;
let energyLevel = 0;
let smoothedSpectrum = null;
let smoothedMotion = 0;
let previousFrameTime = 0;
const MIN_DB = -78;
const MAX_DB = -18;

function frequencyLevel(byteValue) {
  const db = (byteValue / 255) * (analyser?.maxDecibels ?? -20)
    + (1 - byteValue / 255) * (analyser?.minDecibels ?? -100);
  return Math.max(0, Math.min(1, (db - MIN_DB) / (MAX_DB - MIN_DB)));
}

const visualizerState = computed(() =>
  visualizerMode(library.isPlaying, library.isMuted, library.volume),
);

function initAnalyser() {
  analyser = library.getAudioAnalyser();
  if (analyser && library.isPlaying) {
    library.resumeAudioAnalyser();
  }
}

watch(
  () => library.isPlaying,
  (playing) => {
    if (playing) {
      if (!analyser) initAnalyser();
      library.resumeAudioAnalyser();
    }
  }
);

function draw() {
  const element = canvas.value;
  if (!element) {
    animationFrame = requestAnimationFrame(draw);
    return;
  }

  const context = element.getContext('2d');
  const styles = getComputedStyle(document.documentElement);
  const visualizerRgb =
    styles.getPropertyValue('--visualizer-rgb').trim() ||
    styles.getPropertyValue('--accent-rgb').trim() ||
    '37, 216, 102';
  const visualizerColor =
    styles.getPropertyValue('--visualizer-color').trim() ||
    styles.getPropertyValue('--accent-light').trim() ||
    '#8affae';
  const visualizerRgba = (alpha) => `rgba(${visualizerRgb}, ${alpha})`;
  const ratio = window.devicePixelRatio || 1;
  const width = element.clientWidth;
  const height = element.clientHeight;

  if (!width || !height) {
    animationFrame = requestAnimationFrame(draw);
    return;
  }

  if (element.width !== width * ratio || element.height !== height * ratio) {
    element.width = width * ratio;
    element.height = height * ratio;
  }

  context.save();
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const playing = Boolean(library.isPlaying);
  const gainScale = playing ? scaledVisualizerGain(library.volume) : 0;
  const now = performance.now();
  const deltaSeconds = previousFrameTime ? (now - previousFrameTime) / 1000 : 1 / 60;
  previousFrameTime = now;
  idlePhase += 0.025;

  const pointsCount = 64;
  const values = playing && analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
  if (values) analyser.getByteFrequencyData(values);
  if (values) {
    if (!smoothedSpectrum || smoothedSpectrum.length !== values.length) {
      smoothedSpectrum = new Float32Array(values.length);
    }
    let weightedLevel = 0;
    let weightsTotal = 0;
    for (let index = 0; index < values.length; index++) {
      const level = frequencyLevel(values[index]);
      smoothedSpectrum[index] = smoothVisualizerValue(
        smoothedSpectrum[index], level, 7, 3.4, deltaSeconds,
      );
      const normalized = index / Math.max(1, values.length - 1);
      const weight = normalized < 0.2 ? 1.35 : normalized < 0.68 ? 1 : 0.82;
      weightedLevel += smoothedSpectrum[index] * weight;
      weightsTotal += weight;
    }
    const musicalLevel = weightsTotal ? weightedLevel / weightsTotal : 0;
    const targetMotion = Math.pow(musicalLevel, 0.8);
    smoothedMotion = smoothVisualizerValue(smoothedMotion, targetMotion, 4.2, 1.7, deltaSeconds);
  } else {
    smoothedMotion = smoothVisualizerValue(smoothedMotion, 0, 4.2, 1.7, deltaSeconds);
    if (!playing) smoothedSpectrum?.fill(0);
  }
  energyLevel = smoothedMotion;

  const centerY = height * 0.58;
  const isMobile = width <= 768;
  const availableWidth = isMobile ? width : width * 0.96;
  const startX = (width - availableWidth) / 2;
  const step = availableWidth / (pointsCount - 1);

  const points = [];
  for (let i = 0; i < pointsCount; i++) {
    const x = startX + i * step;
    const progress = i / (pointsCount - 1); // 0 a 1
    // Ventana Hann / campana suave para que los extremos caigan suavemente a cero
    const windowFactor = Math.sin(progress * Math.PI);

    let amp = 0;
    if (values) {
      // Muestrear frecuencias distribuidas armónicamente
      const freqIndex = Math.min(
        Math.floor(Math.pow(progress, 1.3) * (values.length * 0.7)),
        values.length - 1
      );
      const bandLevel = smoothedSpectrum?.[freqIndex] || 0;
      amp = visualizerAmplitude(bandLevel, library.volume) * (height * 0.42);
    }

    // Ondulación sutil en reposo (idle) que mantiene presencia apagada pero viva
    const idleWave = values
      ? 0
      : Math.sin(idlePhase * 1.5 + progress * 5) * 2.2 +
        Math.cos(idlePhase * 0.8 + progress * 3) * 1.4;

    const totalAmp = gainScale === 0
      ? 0
      : (amp + idleWave * (1 - energyLevel * 0.6)) * windowFactor;
    const y = centerY - totalAmp;

    points.push({ x, y, totalAmp, windowFactor });
  }

  // 1. Relleno con gradiente bajo la onda (iluminación de campo de energía neon)
  if (gainScale > 0 && energyLevel > 0.05) {
    const fillGradient = context.createLinearGradient(0, centerY - height * 0.4, 0, centerY + 10);
    fillGradient.addColorStop(0, visualizerRgba(0.16 * energyLevel));
    fillGradient.addColorStop(0.7, visualizerRgba(0.04 * energyLevel));
    fillGradient.addColorStop(1, visualizerRgba(0));

    context.beginPath();
    context.moveTo(points[0].x, centerY);
    context.lineTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const xc = (p1.x + p2.x) / 2;
      const yc = (p1.y + p2.y) / 2;
      context.quadraticCurveTo(p1.x, p1.y, xc, yc);
    }
    const lastP = points[points.length - 1];
    context.lineTo(lastP.x, lastP.y);
    context.lineTo(lastP.x, centerY);
    context.closePath();
    context.fillStyle = fillGradient;
    context.fill();
  }

  // 2. Línea principal Neon (apagada en reposo, brillante al sonar)
  const strokeGradient = context.createLinearGradient(startX, 0, startX + availableWidth, 0);
  const visualAlpha = Math.max(0, Math.min(0.92, 0.72 + gainScale * 0.2));
  if (!playing) {
    strokeGradient.addColorStop(0, visualizerRgba(0));
    strokeGradient.addColorStop(0.2, visualizerRgba(0.2));
    strokeGradient.addColorStop(0.5, visualizerRgba(0.28));
    strokeGradient.addColorStop(0.8, visualizerRgba(0.2));
    strokeGradient.addColorStop(1, visualizerRgba(0));
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.lineWidth = 1.6;
  } else if (energyLevel > 0.15) {
    // Modo iluminado: verde neon vibrante con núcleo claro
    strokeGradient.addColorStop(0, visualizerRgba(0));
    strokeGradient.addColorStop(0.18, visualizerRgba(visualAlpha));
    strokeGradient.addColorStop(0.5, visualizerColor);
    strokeGradient.addColorStop(0.82, visualizerRgba(visualAlpha));
    strokeGradient.addColorStop(1, visualizerRgba(0));

    context.shadowColor = visualizerColor;
    context.shadowBlur = 12 + 16 * energyLevel;
    context.lineWidth = 2.2 + 0.6 * energyLevel;
  } else {
    // Modo reposo apagado: tono sutil, tenue, sin resplandor excesivo
    strokeGradient.addColorStop(0, visualizerRgba(0));
    strokeGradient.addColorStop(0.2, visualizerRgba(visualAlpha));
    strokeGradient.addColorStop(0.5, visualizerRgba(visualAlpha));
    strokeGradient.addColorStop(0.8, visualizerRgba(visualAlpha));
    strokeGradient.addColorStop(1, visualizerRgba(0));

    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.lineWidth = 1.6;
  }

  context.strokeStyle = strokeGradient;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const xc = (p1.x + p2.x) / 2;
    const yc = (p1.y + p2.y) / 2;
    context.quadraticCurveTo(p1.x, p1.y, xc, yc);
  }
  const lastPoint = points[points.length - 1];
  context.lineTo(lastPoint.x, lastPoint.y);
  context.stroke();

  // 3. Reflejo especular atenuado inferior
  if (gainScale > 0 && energyLevel > 0.2) {
    context.save();
    context.shadowBlur = 0;
    const mirrorGradient = context.createLinearGradient(startX, 0, startX + availableWidth, 0);
    mirrorGradient.addColorStop(0, visualizerRgba(0));
    mirrorGradient.addColorStop(0.5, visualizerRgba(0.2 * energyLevel));
    mirrorGradient.addColorStop(1, visualizerRgba(0));

    context.strokeStyle = mirrorGradient;
    context.lineWidth = 1.2;
    context.beginPath();
    context.moveTo(points[0].x, centerY + points[0].totalAmp * 0.3);

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const xc = (p1.x + p2.x) / 2;
      const yc = centerY + ((p1.totalAmp + p2.totalAmp) / 2) * 0.3;
      context.quadraticCurveTo(p1.x, centerY + p1.totalAmp * 0.3, xc, yc);
    }
    context.stroke();
    context.restore();
  }

  context.restore();
  animationFrame = requestAnimationFrame(draw);
}

onMounted(() => {
  initAnalyser();
  draw();
});

onBeforeUnmount(() => {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
  }
  smoothedSpectrum = null;
});
</script>
