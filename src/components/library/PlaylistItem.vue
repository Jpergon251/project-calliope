<template>
    <router-link
        :to="`/playlist/${playlist.id}`"
        class="playlist-link"
        @click="recordClick"
    >
        <MediaCard class="playlist-item">

            <template #cover>

                <img
                    v-if="playlist.cover"
                    :src="playlist.cover"
                    class="playlist-image"
                />

            <IconCover
                v-else
                :type="playlist.id === library.FAVORITES_PLAYLIST_ID ? 'favorite' : 'playlist'"
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
import IconCover from "../common/IconCover.vue";

import { useLibraryStore } from "../../stores/libraryStore";

const library = useLibraryStore();

const props = defineProps({
    playlist: {
        type: Object,
        required: true
    }
});

function recordClick() {
    library.recordPlaylistPlayed(props.playlist, props.playlist?.songIds?.length);
}
</script>