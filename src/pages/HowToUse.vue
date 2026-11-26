<template>
  <main class="how-to-use">
    <header class="page-header">
      <h1>Cómo usar Calliope</h1>
      <p class="header-desc">
        Configura tu biblioteca local y saca el máximo partido a tu música en segundos.
      </p>
    </header>

    <section class="guide-section" aria-labelledby="steps-title">
      <div class="section-heading">
        <div>
          <span class="section-tag">EMPIEZA A ESCUCHAR</span>
          <h2 id="steps-title">Primeros pasos</h2>
        </div>
      </div>
      <div class="steps-list">
        <article v-for="step in steps" :key="step.number" class="guide-step">
          <span class="step-number">{{ step.number }}</span>
          <div>
            <h3>{{ step.title }}</h3>
            <p>{{ step.description }}</p>
          </div>
        </article>
      </div>
    </section>

    <section class="guide-section" aria-labelledby="features-title">
      <div class="section-heading">
        <div>
          <span class="section-tag">MÚSICA A TU MANERA</span>
          <h2 id="features-title">Funciones clave y privacidad</h2>
        </div>
      </div>
      <div class="guide-grid">
        <article v-for="feature in features" :key="feature.title" class="guide-card">
          <h3>{{ feature.title }}</h3>
          <p>{{ feature.description }}</p>
        </article>
      </div>
    </section>

    <section class="guide-section troubleshooting" aria-labelledby="faq-title">
      <div class="section-heading">
        <div>
          <span class="section-tag">RESPUESTAS RÁPIDAS</span>
          <h2 id="faq-title">Preguntas frecuentes</h2>
        </div>
      </div>
      <div class="faq-list">
        <details v-for="item in faqs" :key="item.question" class="faq-item">
          <summary>
            <span>{{ item.question }}</span>
            <ChevronDown aria-hidden="true" />
          </summary>
          <div class="faq-content"><p>{{ item.answer }}</p></div>
        </details>
      </div>
    </section>
  </main>
</template>

<script setup>
import { ChevronDown } from "lucide-vue-next";

const steps = [
  {
    number: "01",
    title: "Elige tu perfil",
    description: "Crea un perfil o entra como Invitado. Cada perfil guarda su historial, favoritos y ajustes.",
  },
  {
    number: "02",
    title: "Carga tu música",
    description: "Selecciona una carpeta local. Tus archivos nunca se suben a internet.",
  },
  {
    number: "03",
    title: "Organización automática",
    description: "Calliope lee etiquetas y portadas de archivos MP3, FLAC, WAV y OGG.",
  },
  {
    number: "04",
    title: "Dale al Play",
    description: "Explora tu catálogo, crea listas y disfruta de tu música sin conexión.",
  },
];

const features = [
  {
    title: "Autoplay inteligente",
    description: "Tus Likes y Favoritos ayudan a priorizar artistas; los Dislikes excluyen canciones de la reproducción automática.",
  },
  {
    title: "Identificación de audio",
    description: "Chromaprint y MusicBrainz pueden ayudar a completar títulos, artistas y álbumes.",
  },
  {
    title: "100% local y offline",
    description: "Tu biblioteca vive en tu dispositivo y puedes escucharla sin internet ni gastar datos.",
  },
  {
    title: "Copias de seguridad",
    description: "Exporta tu perfil en JSON o sincronízalo con tu cuenta de Google Drive.",
  },
];

const faqs = [
  {question: "¿Qué formatos de audio son compatibles?", answer: "MP3, FLAC, WAV y OGG."},
  {
    question: "¿Mis canciones se suben a algún servidor?",
    answer: "No. La música se procesa y reproduce localmente en tu dispositivo.",
  },
  {
    question: "¿Cómo cambio el aspecto de la app o hago backup?",
    answer: "Desde tu Perfil puedes cambiar de tema y exportar tus datos o guardarlos en Google Drive.",
  },
];
</script>
