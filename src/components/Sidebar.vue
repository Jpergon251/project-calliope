<template>
    <nav class="navbar">
        <section class="logo">
            <svg class="app-image" fill="green" version="1.0" xmlns="http://www.w3.org/2000/svg" width="1365.333" height="1365.333" viewBox="0 0 1024 1024"><path d="M493 222.1c-49.6 4-96.4 20.4-138 48.1-49 32.8-85.5 80-103.9 134.5-10.5 30.9-13.5 50.5-13.6 88.3 0 31.3 1.1 41.1 7.5 66.5 4.9 19.5 9.3 31.3 19.1 51.2 36.8 74.7 106.7 129.3 189 147.7 23.7 5.3 38.6 6.9 63.9 7 25.4 0 39.4-1.1 59-5 36.5-7.2 72.8-22.3 104-43.5 33.5-22.6 62.9-54.9 81.4-89.1l4.7-8.7-27.8-14.1c-80-40.4-135.4-68-136.5-68-.7.1-2.9 2.6-4.8 5.7s-6.9 9.1-11 13.3c-12.1 12.3-25.7 20.5-42.7 25.7-7.9 2.4-10.4 2.7-24.8 2.7-13.9.1-17.1-.2-24-2.2-27.8-8-48.8-25.5-60.5-50.4-5.9-12.7-8.1-21.5-8.7-35.8-1.2-26.4 7.3-48.4 26.1-67.9 18.8-19.5 43.5-29.2 70.9-27.8 27.4 1.3 53.6 15.5 70.8 38.2 2.3 3 4.4 5.5 4.7 5.5.2 0 8-3.7 17.1-8.1 16.4-8 108.1-52.2 134-64.5 10.9-5.2 13.2-6.7 12.7-8.1-1.3-3.2-19.5-29.8-26.2-38.3-15.6-19.5-39.8-41.1-64.6-57.6-12.9-8.6-40.6-22.6-55.1-27.9-38.2-13.9-84.6-20.5-122.7-17.4zm21 67c-31.3 4.3-49.4 9.6-74.4 22.1-56 27.8-95.8 76.9-108.7 134.3-11.3 50.1-2.3 105.2 23.7 145.3 26.6 41 68.3 72.5 116 87.5 16.6 5.3 39.1 9.7 49.4 9.7 2.5 0 5.2.5 6 1.1 2.1 1.5-25.1.4-40.3-1.6-42.9-5.7-80.5-23.9-111.6-54-19.8-19.2-32.6-36.3-43.2-58-34.8-71.4-22.8-158.1 30.3-218.5 21.2-24 51.1-44.9 80.8-56.3 21.7-8.4 43.6-12.4 67-12.4 10.8-.1 11.1 0 5 .8zm25.9 70.5c30 4.2 62.3 22.2 82.2 45.8 3.2 3.8 5.9 7.2 5.9 7.6 0 .3-1.9 1.5-4.2 2.7l-4.3 2-8.4-8.9c-18.7-19.8-43.3-33.7-70.1-39.4-10.2-2.2-36-2.5-45.9-.5-25.6 5-47.7 16.4-65.7 33.8-18.6 17.9-30.3 39.3-36 65.3-2.7 12.2-2.5 36.9.3 50.1 7.6 35.5 30.5 65.5 63.8 83.9 49.7 27.4 114.4 17.2 154-24.1 3.9-4.1 8.1-8.7 9.2-10.2l2.2-2.9 4 2.4 4 2.4-5 6.7c-17.5 23.3-48.5 41.9-80.7 48.4-12.5 2.5-43.6 2.5-54.7 0-29.2-6.6-51.8-18.8-71.5-38.6-25.5-25.7-38.3-56.9-38.4-94.1 0-17.3 1.4-26.7 6.1-41.5 4.2-13.2 8.1-21.1 16.2-33.3 22.6-33.7 61-56.2 100.6-59.1 12.8-.9 21.9-.5 36.4 1.5z"/><path d="M505.6 461.7c-6.5 2.2-14.8 9.9-18.3 17.1-2.5 5-2.8 6.8-2.8 14.7.1 7.9.4 9.7 3 14.8 5.9 11.9 17.2 18.7 31 18.7 6.6 0 8.2-.4 14.6-3.8 12.6-6.4 18.6-17.2 17.7-31.7-1.2-18.3-15.5-31.6-33.6-31.4-3.7 0-8.9.8-11.6 1.6z"/></svg>
            <span class="app-name"> CALLIOPE</span>
        </section>

        <ul class="pages-list">
            <li class="page-item">
                <router-link to="/" class="page-link">
                    <house class="page-icon"/>
                    <span class="page-name">Home</span>
                </router-link>
                <router-link to="/library" class="page-link">
                    <library-icon class="page-icon"/>
                    <span class="page-name">Library</span>
                </router-link>
                <router-link to="/settings" class="page-link">
                    <settings class="page-icon"/>
                    <span class="page-name">Settings</span>
                </router-link>
            </li>
            

        </ul>

        <button @click="library.selectFolder()" v-if="!library.folderHandle" class="folder-button">
            Select Folder
        </button>
        <span class="advertisment" v-if="!library.folderHandle">There is no songs on list, select a folder to see all your songs.</span>
    </nav>  

</template>
<script setup>
import Home from "../pages/Home.vue"
import Library from "../pages/Library.vue";
import { House, LibraryIcon, Settings } from "lucide-vue-next"
import { useLibraryStore } from "../stores/libraryStore.js";

const library = useLibraryStore();

</script>