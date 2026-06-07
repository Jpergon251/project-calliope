<template>
    <nav class="navbar">
        <ul class="pages-list">
            <li class="page-item"
                v-for="(page, index) in pages"
                :key="index"
                @click="$emit('navigate', page.component)"
            >
                <router-link :to="page.path">{{ page.name }}</router-link>
            </li>
            

        </ul>

        <button @click="library.selectFolder()" v-if="library.songs.length === 0">
            Select Folder
        </button>
    </nav>  

</template>
<script setup>
import Home from "../pages/Home.vue"
import Library from "../pages/Library.vue";

import { useLibraryStore } from "../stores/libraryStore.js";

const library = useLibraryStore();

const pages = [
    {path: "/", name: "Home", component: Home },
    { path: "/library", name: "Library", component: Library }
]

</script>