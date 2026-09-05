<template>
  <main class="how-to-use">
    <header class="page-header">
      <div class="header-badge">
        <Sparkles class="badge-icon" />
        <span>GUÍA DEL REPRODUCTOR</span>
      </div>

      <h1>Cómo usar Calliope</h1>

      <p class="header-desc">
        Descubre cómo sacar el máximo partido a tu reproductor de música local: desde la
        configuración inicial de tu biblioteca hasta la reproducción inteligente, estadísticas y modo móvil.
      </p>

      <nav class="guide-nav" aria-label="Navegación de secciones de la guía">
        <button
          type="button"
          class="nav-chip"
          @click="scrollToSection('primeros-pasos')"
        >
          <Rocket class="chip-icon" />
          <span>Primeros pasos</span>
        </button>
        <button
          type="button"
          class="nav-chip"
          @click="scrollToSection('biblioteca')"
        >
          <FolderOpen class="chip-icon" />
          <span>Biblioteca</span>
        </button>
        <button
          type="button"
          class="nav-chip"
          @click="scrollToSection('reproduccion')"
        >
          <Play class="chip-icon" />
          <span>Reproducción</span>
        </button>
        <button
          type="button"
          class="nav-chip"
          @click="scrollToSection('interaccion')"
        >
          <Heart class="chip-icon" />
          <span>Preferencias</span>
        </button>
        <button
          type="button"
          class="nav-chip"
          @click="scrollToSection('estadisticas')"
        >
          <BarChart3 class="chip-icon" />
          <span>Estadísticas</span>
        </button>
        <button
          type="button"
          class="nav-chip"
          @click="scrollToSection('movil')"
        >
          <Smartphone class="chip-icon" />
          <span>Móvil</span>
        </button>
        <button
          type="button"
          class="nav-chip"
          @click="scrollToSection('privacidad')"
        >
          <ShieldCheck class="chip-icon" />
          <span>Privacidad</span>
        </button>
      </nav>
    </header>

    <!-- 1. PRIMEROS PASOS -->
    <section id="primeros-pasos" class="guide-section" aria-labelledby="getting-started-title">
      <div class="section-heading">
        <div class="heading-icon-wrap">
          <Rocket />
        </div>
        <div>
          <span class="section-tag">CONFIGURACIÓN INICIAL</span>
          <h2 id="getting-started-title">Primeros pasos</h2>
          <p>
            Configura Calliope en segundos y empieza a escuchar tu música directamente desde tu dispositivo.
          </p>
        </div>
      </div>

      <div class="steps-list">
        <article class="guide-step">
          <span class="step-number">01</span>
          <div>
            <h3>Crea o selecciona tu perfil</h3>
            <p>
              Comienza creando tu perfil personalizado o entrando como Invitado. Cada perfil mantiene su
              propio historial, canciones favoritas, estadísticas de escucha y ajustes individuales.
            </p>
          </div>
        </article>

        <article class="guide-step">
          <span class="step-number">02</span>
          <div>
            <h3>Selecciona tu carpeta de música local</h3>
            <p>
              Elige la carpeta de tu ordenador o almacenamiento donde guardas tus archivos de audio. Calliope
              utiliza la API nativa del navegador para acceder a los ficheros con tu autorización.
            </p>
          </div>
        </article>

        <article class="guide-step">
          <span class="step-number">03</span>
          <div>
            <h3>Lectura local y extracción de metadatos</h3>
            <p>
              Calliope analiza tus archivos en tiempo real y extrae carátulas en alta calidad, artistas,
              álbumes, números de pista y formatos sin subir ni un solo byte a ningún servidor externo.
            </p>
          </div>
        </article>

        <article class="guide-step">
          <span class="step-number">04</span>
          <div>
            <h3>Reproduce al instante</h3>
            <p>
              Una vez indexada la carpeta, navega por tu música con fluidez instantánea, crea listas de
              reproducción y disfruta de una experiencia auditiva pura y sin interrupciones.
            </p>
          </div>
        </article>
      </div>
    </section>

    <!-- 2. BIBLIOTECA -->
    <section id="biblioteca" class="guide-section" aria-labelledby="library-title">
      <div class="section-heading">
        <div class="heading-icon-wrap">
          <FolderOpen />
        </div>
        <div>
          <span class="section-tag">CATÁLOGO Y NAVEGACIÓN</span>
          <h2 id="library-title">Tu biblioteca</h2>
          <p>Explora, organiza y filtra tu música local con herramientas ágiles y visuales.</p>
        </div>
      </div>

      <div class="guide-grid">
        <article class="guide-card">
          <Music class="card-icon" />
          <h3>Canciones</h3>
          <p>
            Accede a todas las pistas de tu biblioteca en una lista ordenada por título, duración o fecha.
            Filtra en segundos con el buscador instantáneo integrado.
          </p>
        </article>

        <article class="guide-card">
          <Disc3 class="card-icon" />
          <h3>Álbumes</h3>
          <p>
            Calliope agrupa automáticamente tus pistas en discos completos a partir de sus metadatos ID3/FLAC,
            mostrando sus portadas originales en alta resolución.
          </p>
        </article>

        <article class="guide-card">
          <Mic2 class="card-icon" />
          <h3>Artistas</h3>
          <p>
            Páginas individuales dedicadas para cada artista de tu colección, con desglose de sus álbumes,
            canciones más populares y total de reproducciones.
          </p>
        </article>

        <article class="guide-card">
          <ListPlus class="card-icon" />
          <h3>Playlists</h3>
          <p>
            Crea listas a medida, añade pistas desde cualquier menú contextual, cambia el orden de reproducción
            arrastrando y personaliza sus títulos sin modificar tus archivos de audio.
          </p>
        </article>

        <article class="guide-card">
          <Heart class="card-icon favorite-icon" />
          <h3>Favoritos</h3>
          <p>
            Guarda tus temas predilectos con un toque en el corazón para tenerlos reunidos en una lista
            permanente accesible desde la barra lateral.
          </p>
        </article>

        <article class="guide-card">
          <Search class="card-icon" />
          <h3>Búsqueda y navegación</h3>
          <p>
            Busca en tiempo real por nombre de canción, artista o álbum. El motor de búsqueda local ofrece
            coincidencias inmediatas sin demoras.
          </p>
        </article>
      </div>
    </section>

    <!-- 3. REPRODUCCIÓN -->
    <section id="reproduccion" class="guide-section" aria-labelledby="playback-title">
      <div class="section-heading">
        <div class="heading-icon-wrap">
          <Play />
        </div>
        <div>
          <span class="section-tag">MOTOR DE AUDIO</span>
          <h2 id="playback-title">Reproducción y controles</h2>
          <p>Control de audio de alta precisión con funciones pensadas para una escucha sin fricción.</p>
        </div>
      </div>

      <div class="guide-grid">
        <article class="guide-card">
          <PlayCircle class="card-icon" />
          <h3>Reproductor (Player)</h3>
          <p>
            Barra inferior persistente con carátula interactiva, información en tiempo real, scrubber de progreso
            con seek instantáneo y acceso directo al visualizador dinámico.
          </p>
        </article>

        <article class="guide-card">
          <ListMusic class="card-icon" />
          <h3>Cola dinámica</h3>
          <p>
            Consulta qué pistas sonarán a continuación, reordena canciones sobre la marcha, añade álbumes
            completos o vacía la cola sin afectar a tus listas fijas.
          </p>
        </article>

        <article class="guide-card">
          <Shuffle class="card-icon" />
          <h3>Aleatorio (Shuffle)</h3>
          <p>
            Mezcla inteligente que baraja tus canciones evitando repeticiones inmediatas y conservando la
            cola original en segundo plano.
          </p>
        </article>

        <article class="guide-card">
          <Repeat class="card-icon" />
          <h3>Modos de repetición</h3>
          <p>
            Alterna entre tres estados: desactivado, repetir toda la lista/cola en bucle, o repetir la canción
            actual de forma indefinida.
          </p>
        </article>

        <article class="guide-card highlight-card">
          <Infinity class="card-icon accent-icon" />
          <h3>Autoplay inteligente</h3>
          <p>
            Cuando tu lista o cola se agota, Calliope añade automáticamente nuevos temas afines de tu biblioteca
            basándose en tus gustos, manteniendo la música activa sin parar.
          </p>
        </article>

        <article class="guide-card">
          <Volume2 class="card-icon" />
          <h3>Volumen y navegación</h3>
          <p>
            Control milimétrico con slider no lineal, botón de silencio instantáneo y navegación rápida
            hacia adelante o atrás entre canciones.
          </p>
        </article>
      </div>
    </section>

    <!-- 4. INTERACCIÓN CON CANCIONES -->
    <section id="interaccion" class="guide-section" aria-labelledby="interaction-title">
      <div class="section-heading">
        <div class="heading-icon-wrap">
          <Heart />
        </div>
        <div>
          <span class="section-tag">PREFERENCIAS Y VALORACIONES</span>
          <h2 id="interaction-title">Interacción y preferencias</h2>
          <p>Enseña a Calliope tus gustos musicales para una experiencia personalizada y afinada.</p>
        </div>
      </div>

      <div class="guide-grid">
        <article class="guide-card">
          <ThumbsUp class="card-icon thumb-up" />
          <h3>Me gusta (Like)</h3>
          <p>
            Pulsa el pulgar hacia arriba en cualquier canción para marcar que te encanta. Calliope recordará
            tu preferencia y la asociará a tu perfil.
          </p>
        </article>

        <article class="guide-card">
          <ThumbsDown class="card-icon thumb-down" />
          <h3>No me gusta (Dislike)</h3>
          <p>
            Indica los temas que prefieres omitir. Esto evita que suenen por sorpresa o se sugieran automáticamente
            mientras escuchas música.
          </p>
        </article>

        <article class="guide-card">
          <Heart class="card-icon favorite-icon" />
          <h3>Favoritos</h3>
          <p>
            El corazón reúne tus temas esenciales en una categoría destacada y prioritaria de tu biblioteca,
            fácil de reproducir en un clic.
          </p>
        </article>

        <article class="guide-card">
          <History class="card-icon" />
          <h3>Historial de reproducción</h3>
          <p>
            Consulta cronológicamente cada una de las sesiones y temas que has escuchado, con fecha, hora exacta
            y acceso para volver a reproducirlos.
          </p>
        </article>
      </div>

      <div class="guide-notice recommendation-notice">
        <Sparkles class="notice-icon" />
        <div>
          <h3>¿Cómo influyen tus preferencias en el Autoplay?</h3>
          <p>
            El algoritmo inteligente de Calliope utiliza tus <strong>Likes</strong> y <strong>Favoritos</strong>
            para priorizar temas de los mismos artistas y álbumes en la cola continua cuando se acaban tus canciones.
          </p>
          <p>
            Por el contrario, cualquier pista marcada con <strong>Dislike</strong> es <em>estrictamente excluida</em>
            del generador automático de cola, asegurando que jamás suene de fondo sin tu consentimiento.
          </p>
        </div>
      </div>
    </section>

    <!-- 5. ESTADÍSTICAS -->
    <section id="estadisticas" class="guide-section" aria-labelledby="stats-title">
      <div class="section-heading">
        <div class="heading-icon-wrap">
          <BarChart3 />
        </div>
        <div>
          <span class="section-tag">MÉTRICAS Y ANÁLISIS</span>
          <h2 id="stats-title">Estadísticas de escucha</h2>
          <p>Conoce a fondo tus hábitos musicales mediante datos procesados exclusivamente en tu dispositivo.</p>
        </div>
      </div>

      <div class="guide-grid stats-grid">
        <article class="guide-card">
          <Clock class="card-icon" />
          <h3>Tiempo escuchado y reproducciones</h3>
          <p>
            Contabilización exacta de tus horas y minutos de reproducción real, así como el número total
            de pistas completadas.
          </p>
        </article>

        <article class="guide-card">
          <Disc3 class="card-icon" />
          <h3>Catálogo único explorado</h3>
          <p>
            Métricas de diversidad: cuántas canciones únicas, artistas distintos y álbumes completos has
            disfrutado en cada periodo.
          </p>
        </article>

        <article class="guide-card">
          <TrendingUp class="card-icon" />
          <h3>Rankings personalizados</h3>
          <p>
            Clasificaciones automáticas con tu Top Canciones, Top Artistas y Top Álbumes más escuchados según
            tu actividad real.
          </p>
        </article>

        <article class="guide-card">
          <Activity class="card-icon" />
          <h3>Gráficas de actividad</h3>
          <p>
            Visualiza barras interactivas con la distribución de tu escucha por horas del día, días de la
            semana o meses del año.
          </p>
        </article>

        <article class="guide-card highlight-card">
          <SlidersHorizontal class="card-icon accent-icon" />
          <h3>Periodos y comparativas</h3>
          <p>
            Filtra entre Hoy, Esta semana, Este mes o Histórico total. Compara tu volumen de escucha respecto al
            periodo anterior con indicadores porcentuales de tendencia.
          </p>
        </article>
      </div>
    </section>

    <!-- 6. EXPERIENCIA MÓVIL -->
    <section id="movil" class="guide-section" aria-labelledby="mobile-title">
      <div class="section-heading">
        <div class="heading-icon-wrap">
          <Smartphone />
        </div>
        <div>
          <span class="section-tag">DISEÑO RESPONSIVE</span>
          <h2 id="mobile-title">Experiencia móvil</h2>
          <p>Una interfaz concebida específicamente para pantallas táctiles y uso con una sola mano.</p>
        </div>
      </div>

      <div class="guide-grid">
        <article class="guide-card">
          <Smartphone class="card-icon" />
          <h3>Now Playing inmersivo</h3>
          <p>
            Al pulsar cualquier canción en dispositivos móviles, se despliega automáticamente la vista
            <strong>Now Playing</strong> a pantalla completa con gran carátula, controles táctiles y visualizador.
          </p>
        </article>

        <article class="guide-card">
          <Sliders class="card-icon" />
          <h3>Interfaz adaptada a tu mano</h3>
          <p>
            La navegación lateral se reorganiza en accesos rápidos optimizados para el pulgar, facilitando
            cambiar de sección o controlar el reproductor sin esfuerzo.
          </p>
        </article>

        <article class="guide-card">
          <Sparkles class="card-icon" />
          <h3>Fluidez y bajo consumo</h3>
          <p>
            Animaciones nativas a 60 FPS y renderizado ligero de carátulas para cuidar al máximo el rendimiento
            y la autonomía de la batería de tu teléfono.
          </p>
        </article>
      </div>
    </section>

    <!-- 7. PRIVACIDAD -->
    <section id="privacidad" class="guide-section" aria-labelledby="privacy-title">
      <div class="section-heading">
        <div class="heading-icon-wrap">
          <ShieldCheck />
        </div>
        <div>
          <span class="section-tag">SEGURIDAD Y CONTROL</span>
          <h2 id="privacy-title">Privacidad y modo local</h2>
          <p>Tus archivos, tus datos y tu música permanecen bajo tu exclusivo control en todo momento.</p>
        </div>
      </div>

      <div class="guide-grid">
        <article class="guide-card">
          <HardDrive class="card-icon" />
          <h3>Biblioteca 100% en tu dispositivo</h3>
          <p>
            Calliope opera como un reproductor local nativo. Tus pistas musicales jamás se transmiten por la red,
            ni se analizan en servidores externos, ni requieren una cuenta en la nube.
          </p>
        </article>

        <article class="guide-card">
          <WifiOff class="card-icon" />
          <h3>Funcionamiento offline real</h3>
          <p>
            Escucha toda tu música sin cobertura, en modo avión o sin gastar datos. Una vez cargada la carpeta,
            la aplicación funciona de forma completamente autónoma.
          </p>
        </article>

        <article class="guide-card">
          <User class="card-icon" />
          <h3>Perfiles y datos aislados</h3>
          <p>
            Tus listas de reproducción, valoraciones (Likes/Dislikes), historial y métricas se guardan
            únicamente en el almacenamiento seguro de tu navegador mediante IndexedDB.
          </p>
        </article>
      </div>
    </section>

    <!-- 8. SOLUCIÓN DE PROBLEMAS -->
    <section
      class="guide-section troubleshooting"
      aria-labelledby="troubleshooting-title"
    >
      <div class="section-heading">
        <div class="heading-icon-wrap">
          <Wrench />
        </div>
        <div>
          <span class="section-tag">PREGUNTAS FRECUENTES</span>
          <h2 id="troubleshooting-title">Solución de problemas</h2>
          <p>Respuestas a dudas habituales sobre la biblioteca, archivos y reproducción.</p>
        </div>
      </div>

      <div class="faq-list">
        <details class="faq-item">
          <summary>
            <span>No aparecen mis canciones</span>
            <ChevronDown />
          </summary>

          <div class="faq-content">
            <p>
              Comprueba que has seleccionado la carpeta correcta y que contiene
              archivos de música compatibles.
            </p>

            <p>
              Si acabas de añadir canciones, vuelve a escanear la biblioteca.
            </p>
          </div>
        </details>

        <details class="faq-item">
          <summary>
            <span>No aparecen las portadas</span>
            <ChevronDown />
          </summary>

          <div class="faq-content">
            <p>
              Calliope obtiene las portadas desde los metadatos de tus archivos.
              Si un archivo no contiene una portada incrustada, puede aparecer
              sin artwork.
            </p>
          </div>
        </details>

        <details class="faq-item">
          <summary>
            <span>Los datos de una canción son incorrectos</span>
            <ChevronDown />
          </summary>

          <div class="faq-content">
            <p>
              Comprueba los metadatos del archivo original. Calliope utiliza
              esta información para identificar canciones, álbumes y artistas.
            </p>
          </div>
        </details>

        <details class="faq-item">
          <summary>
            <span>Una canción no se puede reproducir</span>
            <ChevronDown />
          </summary>

          <div class="faq-content">
            <p>
              Comprueba que el archivo no esté dañado y que su formato sea
              compatible con el navegador.
            </p>
          </div>
        </details>

        <details class="faq-item">
          <summary>
            <span>Calliope no recuerda mi carpeta</span>
            <ChevronDown />
          </summary>

          <div class="faq-content">
            <p>
              Algunos navegadores pueden restringir el acceso persistente a
              archivos locales. Comprueba los permisos del sitio y vuelve a
              seleccionar la carpeta si es necesario.
            </p>
          </div>
        </details>

        <details class="faq-item">
          <summary>
            <span>La biblioteca contiene información incorrecta</span>
            <ChevronDown />
          </summary>

          <div class="faq-content">
            <p>
              Vuelve a analizar la biblioteca después de modificar los metadatos
              de tus archivos.
            </p>
          </div>
        </details>

        <details class="faq-item">
          <summary>
            <span>¿Cómo puedo empezar de nuevo?</span>
            <ChevronDown />
          </summary>

          <div class="faq-content">
            <p>
              Puedes limpiar los datos almacenados por Calliope desde las
              opciones de configuración y volver a seleccionar tu biblioteca.
            </p>
          </div>
        </details>
      </div>
    </section>

    <!-- NOTA FINAL -->

    <section class="guide-footer">
      <HelpCircle />

      <h2>¿Sigues teniendo problemas?</h2>

      <p>
        Si encuentras un error que no aparece aquí, puedes consultar el
        repositorio del proyecto o informar del problema.
      </p>

      <a
        href="https://github.com/Jpergon251/project-calliope/issues"
        target="_blank"
        rel="noopener noreferrer"
        class="github-link"
      >
        <Github class="icon" />
        Informar de un problema
      </a>
    </section>
  </main>
</template>

<script setup lang="ts">
import {
  Sparkles,
  Rocket,
  FolderOpen,
  Play,
  Heart,
  BarChart3,
  Smartphone,
  ShieldCheck,
  Music,
  Disc3,
  Mic2,
  ListPlus,
  Search,
  PlayCircle,
  ListMusic,
  Shuffle,
  Repeat,
  Infinity,
  Volume2,
  ThumbsUp,
  ThumbsDown,
  History,
  Clock,
  TrendingUp,
  Activity,
  SlidersHorizontal,
  Sliders,
  HardDrive,
  WifiOff,
  User,
  Wrench,
  ChevronDown,
  HelpCircle,
  Github
} from "lucide-vue-next";

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
</script>
