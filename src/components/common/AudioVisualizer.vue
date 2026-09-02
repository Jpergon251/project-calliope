<template>
  <div class="audio-visualizer" :class="{ active: library.isPlaying }" aria-hidden="true">
    <canvas ref="canvas"></canvas>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useLibraryStore } from '../../stores/libraryStore.js';

const library = useLibraryStore();
const canvas = ref(null);
let analyser;
let animationFrame;

function draw() {
  const element = canvas.value;
  if (!element || !analyser) return;

  const context = element.getContext('2d');
  const ratio = window.devicePixelRatio || 1;
  const width = element.clientWidth;
  const height = element.clientHeight;
  if (!width || !height) {
    animationFrame = requestAnimationFrame(draw);
    return;
  }

  element.width = width * ratio;
  element.height = height * ratio;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  const values = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(values);
  context.clearRect(0, 0, width, height);

  const gradient = context.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, 'rgba(20, 184, 20, 0)');
  gradient.addColorStop(.5, 'rgba(78, 212, 78, .9)');
  gradient.addColorStop(1, 'rgba(20, 184, 20, 0)');
  context.strokeStyle = gradient;
  context.shadowColor = '#14B814';
  context.shadowBlur = 18;
  context.lineWidth = 2.5;
  context.beginPath();

  const centerX = width / 2;
  const centerY = height * .95;
  const maxDistance = Math.max(centerX - 12, 1);
  const step = maxDistance / (values.length - 1);
  const drawWave = direction => {
    values.forEach((value, index) => {
      const distance = index * step;
      const amplitude = (value / 255) * height * .42;
      const x = centerX + distance * direction;
      const y = centerY - amplitude;
      index ? context.lineTo(x, y) : context.moveTo(x, y);
    });
  };
  drawWave(1);
  drawWave(-1);
  context.stroke();
  context.shadowBlur = 0;
  animationFrame = requestAnimationFrame(draw);
}

onMounted(() => {
  analyser = library.getAudioAnalyser();
  if (!analyser) return;
  if (library.isPlaying) library.resumeAudioAnalyser();
  draw();
});

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame);
});
</script>
