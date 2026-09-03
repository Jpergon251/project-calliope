<template>
  <main class="about-page">
    <section class="about-hero">
      <div class="about-icon">
        <Music />
      </div>

      <h1>Sobre Calliope</h1>

      <p>
        Calliope es un reproductor de música local diseñado para organizar y
        reproducir tu biblioteca musical directamente desde tu dispositivo.
      </p>

      <p>
        El proyecto busca ofrecer una experiencia moderna, sencilla y privada,
        sin depender de cuentas, servicios de streaming ni servidores externos.
      </p>
    </section>

    <section class="about-grid" aria-label="Características del proyecto">
      <article class="about-card">
        <FolderOpen />
        <h2>Tu biblioteca</h2>
        <p>
          Selecciona una carpeta y explora tus canciones, álbumes y listas de
          reproducción desde un único lugar.
        </p>
      </article>

      <article class="about-card">
        <ListMusic />
        <h2>Hecho para escuchar</h2>
        <p>
          Crea listas de reproducción, gestiona la cola y disfruta de tu música
          con todas las herramientas necesarias a mano.
        </p>
      </article>

      <article class="about-card">
        <ShieldCheck />
        <h2>Diseñado en local</h2>
        <p>
          Tu música permanece en tu dispositivo. Calliope no necesita cuentas ni
          subir tus archivos a servidores externos.
        </p>
      </article>
    </section>

    <!-- <section class="about-notice">

      <Tag />

      <h2>Metadatos de tu música</h2>

      <p>
        Calliope utiliza los metadatos incluidos en tus archivos de música
        para organizar la biblioteca y mostrar información como títulos,
        artistas, álbumes y portadas.
      </p>

      <p>
        Si un archivo no contiene estos datos, parte de la información puede
        aparecer incompleta o no agruparse correctamente.
      </p>

    </section> -->

    <section class="about-development">
      <Construction />

      <h2 class="about-title">Proyecto en desarrollo</h2>

      <p class="about-description">
        Calliope sigue evolucionando. El objetivo es crear un reproductor de
        música moderno, rápido y completamente local.
      </p>

      <a
        class="github-link"
        href="https://github.com/Jpergon251/project-calliope"
        target="_blank"
        rel="noopener noreferrer"
      >
        <Github class="icon" />
        Ver el proyecto en GitHub
      </a>

      <span class="last-update">
        Última actualización: 3 de agosto de 2026
      </span>
    </section>

    <section class="about-roadmap" aria-label="Hoja de ruta">
      <div class="roadmap-header">
        <Map />

        <div>
          <h2 class="about-title">Hoja de ruta</h2>

          <p class="about-description">
            Algunas de las mejoras y funciones previstas para futuras versiones.
          </p>
        </div>
      </div>

      <div class="roadmap-list">
        <article class="roadmap-item">
          <span class="status current">En progreso</span>

          <h3>Mejoras en la biblioteca</h3>

          <p>
            Mejorar el sistema de metadatos y optimizar la organización de la
            biblioteca.
          </p>
        </article>

        <article class="roadmap-item">
          <span class="status next">Próximo</span>

          <h3>Nueva página de inicio</h3>

          <p>
            Historial de reproducción, canciones recientes, álbumes, artistas y
            acceso rápido a tus playlists.
          </p>
        </article>

        <article class="roadmap-item">
          <span class="status next">Próximo</span>

          <h3>Mejoras del reproductor</h3>

          <p>
            Reproducción aleatoria, repetición, mejoras en la cola y nuevas
            opciones de control.
          </p>
        </article>

        <article class="roadmap-item">
          <span class="status future">Futuro</span>

          <h3>Importación de playlists</h3>

          <p>
            Explorar opciones para importar playlists de otros servicios
            musicales a tu biblioteca local.
          </p>
        </article>
      </div>
    </section>

    <footer class="about-footer">
      <span>© 2026 Calliope</span>

      <span class="developer">
        Desarrollado por

        <a
          href="https://github.com/Jpergon251"
          target="_blank"
          rel="noopener noreferrer"
        >
          José Antonio Pérez González
          <Github class="icon" />
        </a>
      </span>

      <span class="tech">
        Hecho con <strong>Vue.js</strong>
        <img
          src="https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Vue.js_Logo_2.svg/3840px-Vue.js_Logo_2.svg.png"
          alt="Vue.js Logo"
          class="vue-logo"
        />
      </span>
    </footer>
  </main>
</template>

<script setup>
import {
  Map,
  Music,
  Tag,
  Database,
  Home,
  Shuffle,
  User,
  Upload,
  Smartphone,
  Construction,
  FolderOpen,
  Github,
  ListMusic,
  Music2,
  ShieldCheck,
  FolderLock,
} from "lucide-vue-next";
</script>
