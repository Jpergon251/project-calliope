<template>
    <main class="album-page">

        <div class="album-atmosphere" aria-hidden="true">
            <AudioVisualizer />
        </div>

        
        <PlayListSongs
            :songs="albumSongs"
            :cover="albumCover"
            :is-sortable="false"
        />

    </main>
</template>

<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";

import { useLibraryStore } from "../stores/libraryStore";

import PlayListSongs from "../components/library/PlayListSongs.vue";
import AudioVisualizer from "../components/common/AudioVisualizer.vue";

import { watch } from "vue";




const route = useRoute();
const libraryStore = useLibraryStore();

const albumId = computed(() => route.params.id);

const albumCover = computed(() => {
    const album = libraryStore.albums.find(
        album => album.id === albumId.value
    );

    return album?.cover ?? null;
});


const albumSongs = computed(() =>
    libraryStore.songs.filter(
        song => song.albumId === albumId.value
    )
);
watch(albumSongs, (songs) => {
    console.log("Album songs:", songs);
});

</script>

