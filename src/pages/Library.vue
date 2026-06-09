<template>

    <div class="library-page">
        <h1>Library</h1>
        <PlaylistList />
        <AllSongList :songs="songs"/>
    </div>


</template>

<script setup>
import AllSongList from "../components/AllSongList.vue";
import PlaylistList from "../components/PlaylistList.vue";
import { useLibraryStore } from "../stores/libraryStore.js";
const library = useLibraryStore();
const songs = library.songs
</script>