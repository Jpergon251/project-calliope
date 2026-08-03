<template>
    <router-link
        :to="`/playlist/${playlist.id}`"
        class="playlist-link"
    >
        <MediaCard class="playlist-item">

            <template #cover>

                <img
                    v-if="playlist.cover"
                    :src="playlist.cover"
                    class="playlist-image"
                />

                <Music
                    v-else
                    class="playlist-image"
                />

            </template>

            <span class="playlist-name">
                {{ playlist.name }}
            </span>

        </MediaCard>
    </router-link>
</template>

<script setup>
import MediaCard from "../common/MediaCard.vue";
import { Music } from "lucide-vue-next";

defineProps({
    playlist: {
        type: Object,
        required: true
    }
});
</script>