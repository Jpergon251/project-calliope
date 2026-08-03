<template>
  <article class="media-card">

    <div class="media-cover">
      <slot name="cover" />
    </div>

    <div class="media-content">
      <slot />
    </div>

    <div class="media-actions">
      <slot name="actions" />
    </div>

  </article>
</template>