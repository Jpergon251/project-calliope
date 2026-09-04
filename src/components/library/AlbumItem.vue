<template>
    <MediaCard class="album-item">


        <template #cover>
            <router-link
                :to="`/album/${album.id}`"
                class="album-link"
                @click="recordClick"
            >
                <img
                    v-if="album.cover"
                    :src="album.cover"
                    :alt="album.name"
                    class="album-image"
                />

                <Music
                    v-else
                    class="album-image"
                />
            </router-link>
        </template>

        <router-link
            :to="`/album/${album.id}`"
            class="album-link"
            @click="recordClick"
        >
            <span class="album-name">
                {{ album.name }}
            </span>
        </router-link>

        <span class="album-artist">
            {{ album.artist }}
        </span>

    </MediaCard>
</template>

<script setup>
import MediaCard from "../common/MediaCard.vue";
import { Music } from "lucide-vue-next";
import { useLibraryStore } from "../../stores/libraryStore.js";

const library = useLibraryStore();

const props = defineProps({
    album: {
        type: Object,
        required: true
    }
});

function recordClick() {
    library.recordAlbumPlayed(props.album);
}
</script>