<template>
    <section class="all-playlist">
        <h2 class="playlist-title">Playlists</h2>
        <ul class="playlist-list">
            <li 
            v-for="playlist in library.playlists"
            :key="playlist.name"
            class="playlist-card"
            >
                <router-link :to="`/playlist/${playlist.id}`" class="playlist-link">{{ playlist.name }}</router-link>
            </li>
        </ul>
    </section>
</template>

<script setup>
import { useLibraryStore } from "../stores/libraryStore.js";
const library = useLibraryStore();
</script>