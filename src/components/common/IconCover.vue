<template>
    <div class="background">
        <BookHeart v-if="type === 'favorite'"/>
        <ListMusic v-else/>
    </div>
</template>

<script setup>
import { BookHeart, ListMusic } from "lucide-vue-next";

defineProps({
    type: {
        type: String,
        default: "playlist"
    }
});
</script>