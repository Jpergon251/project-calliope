<template>
    <nav class="navbar">

        <Logo/>

        <ul class="pages-list">
            <li class="page-item">

                <router-link to="/" class="page-link">
                    <House class="page-icon"/>
                    <span class="page-name">Home</span>
                </router-link>
                <router-link to="/library" class="page-link">
                    <LibraryIcon class="page-icon"/>
                    <span class="page-name">Library</span>
                </router-link>
                <router-link to="/settings" class="page-link">
                    <Settings class="page-icon"/>
                    <span class="page-name">Settings</span>
                </router-link>
                <router-link to="/about" class="page-link">
                    <CircleHelp class="page-icon"/>
                    <span class="page-name">About</span>
                </router-link>
            </li>
            

        </ul>

        <button @click="library.selectFolder()" v-if="library.initialized && !library.folderHandle " class="folder-button">
            Select Folder
        </button>
        <span class="advertisment" v-if="library.initialized && !library.folderHandle ">There is no songs on list, select a folder to see all your songs.</span>
    </nav>  

</template>
<script setup>
import { CircleHelp, House, LibraryIcon, Settings } from "lucide-vue-next"
import { useLibraryStore } from "../../stores/libraryStore.js";
import Logo from "../common/Logo.vue";

const library = useLibraryStore();

</script>
