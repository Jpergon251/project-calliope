<template>
    <section class="all-playlist">
        <h2 class="playlist-title">Playlists</h2>
        <ul class="playlist-list">
            <li 
            v-for="playlist in library.playlists"
            :key="playlist.name"
            class="playlist-card"
            >
                <router-link :to="`/playlist/${playlist.id}`" class="playlist-link">
                    <img :src="playlist.cover" alt="Playlist Cover" class="playlist-cover" v-if="playlist.cover" />
                    <Music class="playlist-cover" v-else  />
                    <span class="playlist-name">
                        {{ playlist.name }}
                    </span>
                </router-link>
            </li>
        </ul>
    </section>
</template>

<script setup>
import { Music } from "lucide-vue-next";
import { useLibraryStore } from "../stores/libraryStore.js";

const library = useLibraryStore();
</script>