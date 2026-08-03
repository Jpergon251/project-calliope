<template>
    <MediaCard class="album-item">


        <template #cover>
            <router-link
                :to="`/album/${album.id}`"
                class="album-link"
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

defineProps({
    album: {
        type: Object,
        required: true
    }
});
</script>