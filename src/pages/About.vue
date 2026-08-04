<template>
  <main class="about-page">
    <section class="about-hero">
      <div class="about-mark" aria-hidden="true">
        <Music2 />
      </div>
      <p class="eyebrow">Sobre Calliope</p>
      <h1>Tu música, de forma sencilla.</h1>
      <p class="intro">
        Calliope es un reproductor de música privado diseñado para mantener tu biblioteca local
        organizada, accesible y completamente tuya.
      </p>
    </section>

    <section class="about-grid" aria-label="Características del proyecto">
      <article class="about-card">
        <FolderOpen />
        <h2>Tu biblioteca</h2>
        <p>
          Selecciona una carpeta y explora tus canciones, álbumes y listas de reproducción en un solo lugar.
        </p>
      </article>

      <article class="about-card">
        <ListMusic />
        <h2>Hecho para escuchar</h2>
        <p>
          Crea listas de reproducción, gestiona la cola y disfruta de tus canciones con todo lo necesario a mano.
        </p>
      </article>

      <article class="about-card">
        <ShieldCheck />
        <h2>Diseñado en local</h2>
        <p>
          Tu música permanece en tu dispositivo. Calliope no necesita cuentas ni subir tus archivos a ningún servidor.
        </p>
      </article>
    </section>

<!-- 
  añadir sección de "Aún en desarrollo" con un enlace a GitHub y un mensaje de invitación a contribuir, con fecha de actualización:
  3 agosto 2026
 -->
    <section class="about-notice">
      <Tag />
      
      <h2>Mejor con tus canciones etiquetadas</h2>

      <p>
        Calliope utiliza los metadatos incluidos en tus archivos de música
        para organizar tu biblioteca, mostrando información como títulos,
        artistas, álbumes y portadas.
      </p>

      <p>
        Si una canción no contiene esta información, puede aparecer con datos
        incompletos o no agruparse correctamente dentro de la biblioteca.
      </p>
    </section>
    <section class="about-development" aria-label="Estado del proyecto">
      <Construction />
      <h2 class="about-title">Proyecto en desarrollo</h2>

      <p class="about-description">
        Calliope sigue evolucionando y todavía hay muchas funciones por llegar. El objetivo es crear un reproductor de música moderno, rápido y completamente local, sin depender de servicios externos.
      </p>

      <p class="about-description">
        Si encuentras algún error, tienes una idea o simplemente quieres seguir el progreso del proyecto, puedes visitar el repositorio en GitHub.
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

    <section class="about-roadmap" aria-label="Hoja de ruta del proyecto">

      <div class="roadmap-header">
        <Map />
        <div>
          <h2 class="about-title">Hoja de ruta</h2>
          <p class="about-description">
            Estas son algunas de las mejoras y funciones previstas para futuras versiones de Calliope.
          </p>
        </div>
      </div>


      <div class="roadmap-list">

        <article class="roadmap-item">
          <span class="status current">En progreso</span>
          <h3>Mejoras en la biblioteca</h3>
          <p>
            Mejorar el sistema de metadatos, completar información de canciones
            y optimizar la organización de la biblioteca.
          </p>
        </article>


        <article class="roadmap-item">
          <span class="status next">Próximo</span>
          <h3>Nueva página de inicio</h3>
          <p>
            Añadir historial de reproducción, canciones recientes, álbumes,
            artistas y acceso rápido a tus playlists.
          </p>
        </article>


        <article class="roadmap-item">
          <span class="status next">Próximo</span>
          <h3>Mejoras del reproductor</h3>
          <p>
            Añadir reproducción aleatoria, repetición, mejoras en la cola
            y más opciones de control.
          </p>
        </article>


        <article class="roadmap-item ">
          <span class="status future">Futuro</span>
          <h3>Importación de playlists</h3>
          <p>
            Explorar opciones para importar playlists de otros servicios
            musicales y enlazarlas con tu biblioteca local.
          </p>
        </article>

      </div>

    </section>

    <section class="about-notice">
      <FolderLock/>
      <h2>Tu música, tus archivos</h2>

      <p>
        Calliope no proporciona contenido musical ni descarga canciones.
        La aplicación funciona leyendo los archivos locales que selecciones
        en tu dispositivo.
      </p>

      <p>
        Tú tienes el control de tu biblioteca y de dónde proceden tus archivos.
      </p>
    </section>
    <footer class="about-footer">
      <span>© 2026 Calliope</span>

      <span class="developer">
        Desarrollado por
        <strong>
          <a href="https://github.com/Jpergon251" target="_blank" rel="noopener noreferrer">
            José Antonio Pérez González
            <Github class="icon"/>
          </a>

        </strong>
      </span>

      <span class="tech">
        Un reproductor de música local y privado, hecho con <strong>Vue.js</strong> <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Vue.js_Logo_2.svg/3840px-Vue.js_Logo_2.svg.png" alt="Vue.js Logo" class="vue-logo"/>.
      </span>
    </footer>
  </main>
</template>

<script setup>
import {   Map, Tag,
  Database, Home, Shuffle, User, Upload, Smartphone, Construction, FolderOpen, Github, ListMusic, Music2, ShieldCheck, 
  FolderLock} from "lucide-vue-next";
</script>