<template>
  <section class="top-section">
    <Sidebar class="sidebar" />
    <RouterView class="main" />
  </section>

  <section class="bottom-section">
    <PlayerBar />
  </section>
</template>

<script setup>
import PlayerBar from '../layout/PlayerBar.vue';
import Sidebar from '../layout/Sidebar.vue';

</script>