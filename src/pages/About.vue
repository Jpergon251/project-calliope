<template>
  <main class="about-page">
    <header class="page-header">
      <div class="header-badge">
        <Sparkles class="badge-icon" />
        <span>REPRODUCTOR DE MÚSICA LOCAL</span>
      </div>

      <h1>Acerca de Calliope</h1>

      <p class="header-desc">
        Calliope es un reproductor de música pensado para disfrutar de tu propia
        colección musical directamente desde tu dispositivo, manteniendo siempre
        el control total de tu biblioteca.
      </p>
    </header>

    <!-- OBJETIVO -->
    <section class="about-section" aria-labelledby="objective-title">
      <div class="section-heading">
        <div class="heading-icon-wrap">
          <Target />
        </div>
        <div>
          <span class="section-tag">PROPÓSITO</span>
          <h2 id="objective-title">El objetivo de Calliope</h2>
          <p>
            Calliope busca ofrecer una experiencia moderna para gestionar y
            reproducir una colección musical propia, sin depender de un servicio
            de streaming para acceder a ella. La idea es devolver todo el
            protagonismo a la biblioteca musical del usuario.
          </p>
        </div>
      </div>
    </section>

    <!-- MÚSICA LOCAL Y PRIVACIDAD -->
    <section class="about-section" aria-labelledby="privacy-title">
      <div class="section-heading">
        <div class="heading-icon-wrap">
          <HardDrive />
        </div>
        <div>
          <span class="section-tag">PRIVACIDAD Y CONTROL</span>
          <h2 id="privacy-title">Tu música, en local</h2>
          <p>
            La música se reproduce directamente desde las carpetas de tu
            dispositivo. No necesitas subir tus archivos a ningún servidor
            externo para utilizarlos ni crear cuentas en la nube.
          </p>
          <p>
            Tus datos relacionados con la biblioteca, listas de reproducción y
            perfiles se gestionan de forma local en tu navegador cuando
            corresponde.
          </p>
        </div>
      </div>
    </section>

    <!-- METADATOS Y ORGANIZACIÓN -->
    <section class="about-section" aria-labelledby="metadata-title">
      <div class="section-heading">
        <div class="heading-icon-wrap">
          <Tags />
        </div>
        <div>
          <span class="section-tag">BIBLIOTECA</span>
          <h2 id="metadata-title">Metadatos y organización</h2>
          <p>
            Calliope trabaja con los metadatos disponibles en tus archivos de
            audio (título, artista, álbum y carátula) para catalogar y presentar
            tu música de manera ordenada.
          </p>
          <p>
            Esta información permite organizar automáticamente canciones,
            álbumes completos y páginas de artistas dentro de la aplicación sin
            alterar tus archivos originales.
          </p>
        </div>
      </div>
    </section>

    <!-- CARACTERÍSTICAS PRINCIPALES -->
    <section class="about-section" aria-labelledby="features-title">
      <div class="section-heading">
        <div class="heading-icon-wrap">
          <Sparkles />
        </div>
        <div>
          <span class="section-tag">FUNCIONALIDADES</span>
          <h2 id="features-title">Características principales</h2>
          <p>
            Las funciones esenciales de Calliope diseñadas para una experiencia
            de escucha cómoda y completa.
          </p>
        </div>
      </div>

      <div class="features-grid">
        <article class="feature-card">
          <FolderOpen class="feature-icon" />
          <span>Biblioteca musical local</span>
        </article>

        <article class="feature-card">
          <Disc3 class="feature-icon" />
          <span>Canciones, álbumes y artistas</span>
        </article>

        <article class="feature-card">
          <ListPlus class="feature-icon" />
          <span>Playlists personalizadas</span>
        </article>

        <article class="feature-card">
          <Heart class="feature-icon favorite-icon" />
          <span>Favoritos</span>
        </article>

        <article class="feature-card">
          <ThumbsUp class="feature-icon thumb-icon" />
          <span>Likes y dislikes</span>
        </article>

        <article class="feature-card">
          <History class="feature-icon" />
          <span>Historial de reproducción</span>
        </article>

        <article class="feature-card">
          <ListMusic class="feature-icon" />
          <span>Cola de reproducción</span>
        </article>

        <article class="feature-card">
          <Shuffle class="feature-icon" />
          <span>Shuffle y repetición</span>
        </article>

        <article class="feature-card">
          <Infinity class="feature-icon accent-icon" />
          <span>Autoplay inteligente</span>
        </article>

        <article class="feature-card">
          <BarChart3 class="feature-icon" />
          <span>Estadísticas de escucha</span>
        </article>

        <article class="feature-card">
          <User class="feature-icon" />
          <span>Gestión de perfiles</span>
        </article>

        <article class="feature-card">
          <Smartphone class="feature-icon" />
          <span>Experiencia adaptada a móvil</span>
        </article>
      </div>
    </section>

    <!-- PROYECTO Y AUTOR -->
    <footer class="about-footer">
      <div class="footer-badge">
        <Music class="footer-badge-icon" />
      </div>

      <h2>Calliope</h2>
      <p class="footer-desc">
        Reproductor de música local enfocado en la privacidad, la autonomía y el
        disfrute de tu propia colección musical.
      </p>

      <div class="footer-meta">
        <span class="developer-info">
          Desarrollado por
          <a
            href="https://github.com/Jpergon251"
            target="_blank"
            rel="noopener noreferrer"
            class="dev-link"
          >
            José Antonio Pérez González
          </a>
        </span>
      </div>

      <a
        href="https://github.com/Jpergon251/project-calliope"
        target="_blank"
        rel="noopener noreferrer"
        class="github-link"
      >
        <Github class="icon" />
        <span>Ver proyecto en GitHub</span>
      </a>
    </footer>
  </main>
</template>

<script setup lang="ts">
import {
  Music,
  Target,
  HardDrive,
  Tags,
  Sparkles,
  FolderOpen,
  Disc3,
  ListPlus,
  Heart,
  ThumbsUp,
  History,
  ListMusic,
  Shuffle,
  Infinity,
  BarChart3,
  User,
  Smartphone,
  Github,
} from "lucide-vue-next";
</script>
