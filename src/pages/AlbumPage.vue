<template>
    <main class="album-page">
        <h1 class="album-title" v-if="album">{{ album.name }}</h1>
        <p class="album-artist-name" v-if="album?.artist">{{ album.artist }}</p>

        <PlayListSongs
            :songs="albumSongs"
            :album="album"
            :cover="albumCover"
            :is-sortable="false"
        />

        <div class="album-atmosphere" :class="{ active: libraryStore.isPlaying }" aria-label="Visualizador de audio">
            <AudioVisualizer />
        </div>

    </main>
</template>

<script setup>
import { computed, watch } from "vue";
import { useRoute } from "vue-router";
import { useLibraryStore } from "../stores/libraryStore.js";
import PlayListSongs from "../components/library/PlayListSongs.vue";
import AudioVisualizer from "../components/common/AudioVisualizer.vue";

const route = useRoute();
const libraryStore = useLibraryStore();

const albumId = computed(() => route.params.id);

const album = computed(() => {
    return (
        libraryStore.albums.find(
            a => a.id === albumId.value || a.name === albumId.value
        ) || null
    );
});

const albumCover = computed(() => {
    return album.value?.cover ?? null;
});

const albumSongs = computed(() =>
    libraryStore.songs.filter(
        song => song.albumId === albumId.value || (album.value && song.album === album.value.name)
    )
);

watch(album, (alb) => {
    if (alb) {
        libraryStore.recordAlbumPlayed(alb);
    }
}, { immediate: true });
</script>

