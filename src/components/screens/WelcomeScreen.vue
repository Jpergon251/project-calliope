<template>
    <section class="welcome-screen">

        <div class="welcome-card">

            <Logo class="logo" />

            <p class="subtitle">
                Tu biblioteca de música personal.
            </p>

            <p class="description">
                Calliope nunca sube tu música. Selecciona la carpeta donde se guardan tus canciones y comienza a escuchar de inmediato.
            </p>


            <template v-if="isSupported">

                <button
                    class="folder-button"
                    @click="library.selectFolder()"
                >
                    Seleccionar carpeta de música
                </button>

                <span class="note">
                    Puedes cambiar la carpeta más tarde desde Configuración.
                </span>

            </template>


<template v-else>

    <div class="browser-warning">

        <template v-if="isMobile">

                    <h3>
                        Dispositivo no compatible
                    </h3>

                    <p>
                        Calliope actualmente está disponible únicamente para ordenadores.
                    </p>

                    <p>
                        Los navegadores móviles no permiten acceder a carpetas locales de música de forma segura.
                    </p>

                    <p class="unsupported-note">
                        Puedes acceder desde un PC usando un navegador basado en <strong>Chromium</strong>.
                    </p>

                </template>


                <template v-else>

                    <h3>
                        Navegador no compatible
                    </h3>

                    <p>
                        Calliope necesita acceso a carpetas locales para leer tu biblioteca de música.
                    </p>

                    <p>
                        Puedes utilizar cualquiera de estos navegadores:
                    </p>


                    <div class="browser-grid">

                        <div class="browser-card">

                            <img 
                                src="https://images.icon-icons.com/836/PNG/512/Google_Chrome_icon-icons.com_66794.png"
                                alt="Chrome"
                            >

                            <a 
                                href="https://www.google.com/intl/es_es/chrome/"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Chrome
                            </a>

                        </div>


                        <div class="browser-card">

                            <img 
                                src="https://upload.wikimedia.org/wikipedia/commons/7/7e/Microsoft_Edge_logo_%282019%29.png"
                                alt="Edge"
                            >

                            <a 
                                href="https://explore.microsoft.com/es-es/edge/download?form=MA13FJ"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Edge
                            </a>

                        </div>


                        <div class="browser-card">

                            <img 
                                src="https://img.icons8.com/color/512/brave-web-browser.png"
                                alt="Brave"
                            >

                            <a 
                                href="https://brave.com/es/download/"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Brave
                            </a>

                        </div>

                    </div>


                    <p class="chromium-note">
                        También funciona con otros navegadores basados en <strong>Chromium</strong>.
                    </p>


                    <p class="unsupported-note">
                        Firefox y Safari todavía no soportan esta función.
                    </p>

                </template>

            </div>

        </template>

            
        </div>

    </section>
</template>

<script setup>

import { computed } from "vue";
import Logo from "../common/Logo.vue";
import { useLibraryStore } from "../../stores/libraryStore";

const library = useLibraryStore();

const isMobile = computed(() => {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
});

const isSupported = computed(() => {
  return !isMobile.value && "showDirectoryPicker" in window;
});

</script>