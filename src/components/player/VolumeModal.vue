<template>
  <div
    class="calliope-volume-control"
    :class="[
      `layout-${layout}`,
      {
        'is-muted': isMuted,
        'is-dragging': isDragging,
        'is-hovered': isHovered,
      },
    ]"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @wheel.passive="handleWheel"
  >
    <!-- Mute / Unmute Button -->
    <button
      type="button"
      class="vol-btn"
      :class="{ muted: isMuted }"
      :aria-label="isMuted ? 'Activar sonido' : 'Silenciar'"
      :title="isMuted ? 'Activar sonido (M)' : 'Silenciar (M)'"
      @click="library.toggleMute()"
    >
      <VolumeX v-if="iconType === 'mute'" class="vol-icon mute-icon" />
      <Volume v-else-if="iconType === 'low'" class="vol-icon" />
      <Volume1 v-else-if="iconType === 'medium'" class="vol-icon" />
      <Volume2 v-else class="vol-icon" />
    </button>

    <!-- Slider Track Area -->
    <div
      class="vol-slider-wrap"
      ref="sliderRef"
      role="slider"
      aria-label="Control de volumen"
      :aria-valuenow="Math.round(displayVolume * 100)"
      :aria-valuemin="0"
      :aria-valuemax="100"
      :aria-valuetext="badgeText"
      tabindex="0"
      @keydown="handleKeydown"
      @focus="isFocused = true"
      @blur="isFocused = false"
      @mousedown="handleMouseDown"
      @touchstart="handleTouchStart"
    >
      <!-- Track Background -->
      <div class="vol-track">
        <!-- Progress Fill with Neon Gradient -->
        <div
          class="vol-fill"
          :style="{ width: `${progressPercent}%` }"
        ></div>

        <!-- Thumb with subtle neon halo -->
        <div
          class="vol-thumb"
          :style="{ left: `${progressPercent}%` }"
          :class="{ active: isDragging || isHovered || isFocused }"
        ></div>
      </div>

      <!-- Live Floating dB Badge / Tooltip -->
      <Transition name="badge-fade">
        <div
          v-if="shouldShowBadge"
          class="vol-badge"
          :style="{ left: `${badgePositionPercent}%` }"
          aria-hidden="true"
        >
          <span class="vol-badge-text">{{ badgeText }}</span>
        </div>
      </Transition>
    </div>

  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from "vue";
import {
  Volume,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-vue-next";

const props = defineProps({
  library: {
    type: Object,
    required: true,
  },
  layout: {
    type: String,
    default: "bar", // 'bar' | 'expanded'
  },
});

const sliderRef = ref(null);
const isHovered = ref(false);
const isDragging = ref(false);
const isFocused = ref(false);
const showBadgeTemporary = ref(false);
let hideBadgeTimeout = null;
let activeDragCleanup = null;

const isMuted = computed(() => Boolean(props.library.isMuted));
const displayVolume = computed(() => (isMuted.value ? 0 : props.library.volume));
const iconType = computed(() => props.library.volumeIconType || "medium");

const progressPercent = computed(() => {
  if (isMuted.value) return 0;
  return Math.min(100, Math.max(0, props.library.volume * 100));
});

const badgePositionPercent = computed(() => {
  return Math.min(94, Math.max(6, progressPercent.value));
});

const badgeText = computed(() => {
  if (isMuted.value) return "Silenciado";
  const pct = Math.round(displayVolume.value * 100);
  if (pct <= 0) return "Silenciado";
  return `${pct}%`;
});

const shouldShowBadge = computed(() => {
  return isDragging.value || isHovered.value || isFocused.value || showBadgeTemporary.value;
});

function flashBadge() {
  showBadgeTemporary.value = true;
  if (hideBadgeTimeout) clearTimeout(hideBadgeTimeout);
  hideBadgeTimeout = setTimeout(() => {
    showBadgeTemporary.value = false;
  }, 1600);
}

function handleMouseEnter() {
  isHovered.value = true;
}

function handleMouseLeave() {
  isHovered.value = false;
}

function calculateRatio(clientX) {
  if (!sliderRef.value) return 0;
  const rect = sliderRef.value.getBoundingClientRect();
  if (rect.width <= 0) return 0;
  const x = clientX - rect.left;
  const rawRatio = x / rect.width;
  if (rawRatio <= 0.005) return 0;
  if (rawRatio >= 0.995) return 1;
  return Math.max(0, Math.min(1, Math.round(rawRatio * 1000) / 1000));
}

function updateVolumeFromPosition(clientX) {
  const ratio = calculateRatio(clientX);
  props.library.setVolume(ratio);
  flashBadge();
}

function cleanupActiveDrag() {
  activeDragCleanup?.();
}

function handleMouseDown(e) {
  if (e.button !== 0) return;
  e.preventDefault();
  cleanupActiveDrag();
  isDragging.value = true;
  updateVolumeFromPosition(e.clientX);

  function onMouseMove(moveEvent) {
    updateVolumeFromPosition(moveEvent.clientX);
  }

  function onMouseUp() {
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    if (activeDragCleanup === onMouseUp) activeDragCleanup = null;
    isDragging.value = false;
  }

  activeDragCleanup = onMouseUp;
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
}

function handleTouchStart(e) {
  if (!e.touches.length) return;
  cleanupActiveDrag();
  isDragging.value = true;
  updateVolumeFromPosition(e.touches[0].clientX);

  function onTouchMove(moveEvent) {
    if (!moveEvent.touches.length) return;
    if (moveEvent.cancelable) moveEvent.preventDefault();
    updateVolumeFromPosition(moveEvent.touches[0].clientX);
  }

  function onTouchEnd() {
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onTouchEnd);
    window.removeEventListener("touchcancel", onTouchEnd);
    if (activeDragCleanup === onTouchEnd) activeDragCleanup = null;
    isDragging.value = false;
  }

  activeDragCleanup = onTouchEnd;
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("touchend", onTouchEnd);
  window.addEventListener("touchcancel", onTouchEnd);
}

function handleWheel(e) {
  const delta = e.deltaY < 0 ? 0.03 : -0.03;
  props.library.stepVolume(delta);
  flashBadge();
}

function handleKeydown(e) {
  if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
    e.preventDefault();
    props.library.stepVolume(-0.03);
    flashBadge();
  } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
    e.preventDefault();
    props.library.stepVolume(0.03);
    flashBadge();
  } else if (e.key === "PageDown") {
    e.preventDefault();
    props.library.stepVolume(-0.1);
    flashBadge();
  } else if (e.key === "PageUp") {
    e.preventDefault();
    props.library.stepVolume(0.1);
    flashBadge();
  } else if (e.key === "Home") {
    e.preventDefault();
    props.library.setVolume(0);
    flashBadge();
  } else if (e.key === "End") {
    e.preventDefault();
    props.library.setVolume(1);
    flashBadge();
  } else if (e.key === "m" || e.key === "M") {
    e.preventDefault();
    props.library.toggleMute();
    flashBadge();
  }
}

onBeforeUnmount(() => {
  if (hideBadgeTimeout) clearTimeout(hideBadgeTimeout);
  cleanupActiveDrag();
});
</script>