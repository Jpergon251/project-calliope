<template>
    <main class="album-page">
        <h1 class="album-title" v-if="album">{{ album.title || album.name }}</h1>
        <p class="album-artist-name" v-if="releaseArtistLabel">{{ releaseArtistLabel }}</p>

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
        libraryStore.releases.find((release) => release.id === albumId.value) ||
        libraryStore.albums.find((item) => item.id === albumId.value) ||
        null
    );
});

const albumCover = computed(() => {
    return album.value?.cover || album.value?.coverUrl || null;
});

const releaseArtistLabel = computed(() => {
    const artists = album.value?.involvedArtists?.length
        ? album.value.involvedArtists
        : album.value?.primaryArtists?.length
            ? album.value.primaryArtists
            : album.value?.artists || album.value?.artist || [];
    const names = (Array.isArray(artists) ? artists : [artists])
        .map((artist) => typeof artist === "string" ? artist : artist?.name)
        .filter(Boolean);
    return [...new Map(names.map((name) => [name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(), name])).values()].join(", ");
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

function comparableAlbumName(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase()
        .replace(/[()[\]{}]/g, " ")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

const albumSongs = computed(() => {
    const releaseId = album.value?.id;
    const albumName = comparableAlbumName(album.value?.title || album.value?.name);
    if (!releaseId && !albumName) return [];

    const matched = libraryStore.songs.filter((song) => {
        const songReleaseIds = [
            ...(Array.isArray(song.releaseIds) ? song.releaseIds : []),
            ...(Array.isArray(song.releases) ? song.releases.map((release) => release?.id) : []),
        ].filter(Boolean);
        const songAlbumNames = [
            song.album,
            ...(Array.isArray(song.releases) ? song.releases.map((release) => release?.title) : []),
        ].map(comparableAlbumName).filter(Boolean);

        // Las canciones antiguas pueden conservar el álbum por nombre sin
        // tener todavía la relación releaseIds/albumId reconstruida.
        return (
            songReleaseIds.includes(releaseId) ||
            song.albumId === releaseId ||
            (albumName && songAlbumNames.includes(albumName))
        );
    });

    return [...matched].sort((a, b) => {
        const trackFor = (song) => {
            const recordingId = song.recordingId || song.id;
            return libraryStore.releaseTracks.find((track) =>
                track.recordingId === recordingId && track.releaseId === releaseId
            );
        };
        const trackAData = trackFor(a);
        const trackBData = trackFor(b);
        const trackA = parseTrackNumber(trackAData?.trackNumber ?? a.track ?? a.trackNo ?? a.trackNumber);
        const trackB = parseTrackNumber(trackBData?.trackNumber ?? b.track ?? b.trackNo ?? b.trackNumber);

        const hasTrackA = trackA !== null;
        const hasTrackB = trackB !== null;

        if (hasTrackA && hasTrackB) {
            if (trackA !== trackB) {
                return trackA - trackB;
            }
            // Si tienen el mismo track number, desempatar por disco o título
            const discA = parseTrackNumber(trackAData?.discNumber ?? a.disk ?? a.disc ?? a.diskNo);
            const discB = parseTrackNumber(trackBData?.discNumber ?? b.disk ?? b.disc ?? b.diskNo);
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

