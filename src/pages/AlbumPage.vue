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

function parseTrackNumber(val) {
    if (val == null || val === "" || val === false) return null;
    if (typeof val === "number") {
        return Number.isFinite(val) && val > 0 ? val : null;
    }
    if (typeof val === "string") {
        // Soporta formatos como "3", "3/12", "03", "3 of 12"
        const match = val.trim().match(/^(\d+)/);
        if (match) {
            const num = parseInt(match[1], 10);
            return Number.isFinite(num) && num > 0 ? num : null;
        }
    }
    return null;
}

const albumSongs = computed(() => {
    const matched = libraryStore.songs.filter(
        song => song.albumId === albumId.value || (album.value && song.album === album.value.name)
    );

    return [...matched].sort((a, b) => {
        const trackA = parseTrackNumber(a.track ?? a.trackNo ?? a.trackNumber);
        const trackB = parseTrackNumber(b.track ?? b.trackNo ?? b.trackNumber);

        const hasTrackA = trackA !== null;
        const hasTrackB = trackB !== null;

        if (hasTrackA && hasTrackB) {
            if (trackA !== trackB) {
                return trackA - trackB;
            }
            // Si tienen el mismo track number, desempatar por disco o título
            const discA = parseTrackNumber(a.disk ?? a.disc ?? a.diskNo);
            const discB = parseTrackNumber(b.disk ?? b.disc ?? b.diskNo);
            if (discA !== null && discB !== null && discA !== discB) {
                return discA - discB;
            }
            return (a.title || a.name || "").localeCompare(b.title || b.name || "");
        }

        if (hasTrackA && !hasTrackB) return -1;
        if (!hasTrackA && hasTrackB) return 1;

        // Si ninguna tiene número de pista, orden alfabético estable
        return (a.title || a.name || "").localeCompare(b.title || b.name || "");
    });
});

watch(album, (alb) => {
    if (alb) {
        libraryStore.recordAlbumPlayed(alb);
    }
}, { immediate: true });
</script>

