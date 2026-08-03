<template>
  <main class="about-page">
    <section class="about-hero">
      <div class="about-mark" aria-hidden="true">
        <Music2 />
      </div>
      <p class="eyebrow">About Calliope</p>
      <h1>Your music, kept simple.</h1>
      <p class="intro">
        Calliope is a private music player designed to keep your local library
        organized, accessible and entirely yours.
      </p>
    </section>

    <section class="about-grid" aria-label="Project features">
      <article class="about-card">
        <FolderOpen />
        <h2>Your library</h2>
        <p>Choose a folder and browse your songs, albums and playlists in one place.</p>
      </article>
      <article class="about-card">
        <ListMusic />
        <h2>Made for listening</h2>
        <p>Build playlists, manage the queue and keep playback controls close at hand.</p>
      </article>
      <article class="about-card">
        <ShieldCheck />
        <h2>Local by design</h2>
        <p>Your music stays in your chosen folder. Calliope does not require an account.</p>
      </article>
    </section>

    <footer class="about-footer">Built for a calmer way to enjoy your collection.</footer>
  </main>
</template>

<script setup>
import { FolderOpen, ListMusic, Music2, ShieldCheck } from "lucide-vue-next";
</script>
