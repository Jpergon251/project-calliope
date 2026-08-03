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

            <button
                class="folder-button"
                @click="chooseMusic"
            >
                Seleccionar carpeta de música
            </button>
            <input
                ref="fileInput"
                type="file"
                multiple
                accept="audio/*"
                hidden
                @change="handleFiles"
            />
            <span class="note">
                Puedes cambiar la carpeta más tarde desde Configuración.
            </span>
        </div>

    </section>
</template>

<script setup>
import Logo from "../common/Logo.vue";
import { useLibraryStore } from "../../stores/libraryStore";
import { ref } from "vue";

const fileInput = ref(null);
const library = useLibraryStore();

function chooseMusic(){

    if ("showDirectoryPicker" in window) {

        library.selectFolder();

    } else {

        fileInput.value.click();

    }
}


async function handleFiles(event){

    const files = [...event.target.files];

    await library.selectFiles(files);

}

</script>