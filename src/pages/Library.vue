<template>

    <div class="library-page">
        <h1>Library</h1>
        <PLList />
        <AllSongList/>
        <AllAlbumList />
    </div>


</template>

<script setup>
import AllAlbumList from "../components/library/AllAlbumList.vue";
import AllSongList from "../components/library/AllSongList.vue";
import PLList from "../components/library/PLList.vue";
import { useLibraryStore } from "../stores/libraryStore.js";
const library = useLibraryStore();
const songs = library.songs
</script>