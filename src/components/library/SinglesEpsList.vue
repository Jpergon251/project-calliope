<template>
  <section class="albums singles-eps-section" aria-labelledby="singles-eps-title">
    <header class="title">
      <div class="title-content">
        <div>
          <span v-if="preview" class="section-kicker">Descubre</span>
          <h2 id="singles-eps-title">Sencillos y EP</h2>
        </div>
        <span class="section-count">
          {{ filteredReleases.length }} {{ filteredReleases.length === 1 ? 'publicación' : 'publicaciones' }}
        </span>
      </div>

      <div class="section-actions">
        <div v-if="preview && previewReleases.length > 1" class="carousel-controls" aria-label="Controles de sencillos y EP">
          <button type="button" class="carousel-button" aria-label="Publicaciones anteriores" @click="scrollCarousel(-1)">
            <ChevronLeft :size="17" />
          </button>
          <button type="button" class="carousel-button" aria-label="Siguientes publicaciones" @click="scrollCarousel(1)">
            <ChevronRight :size="17" />
          </button>
        </div>
        <button v-if="preview && filteredReleases.length" type="button" class="view-all" @click="openAll">
          <span>Ver todos</span><ChevronRight :size="16" />
        </button>
      </div>
    </header>

    <div v-if="preview && previewReleases.length" ref="carouselRef" class="album-preview-grid">
      <article
        v-for="release in previewReleases"
        :key="release.id"
        class="album-preview-card"
        role="button"
        tabindex="0"
        :aria-label="`Abrir ${releaseTypeLabel(release.type)} ${release.title}`"
        @click="openRelease(release)"
        @keyup.enter="openRelease(release)"
        @keyup.space.prevent="openRelease(release)"
      >
        <div class="album-preview-cover">
          <CoverArt
            :cover="release.cover || release.coverUrl"
            :fallback-cover="releaseFallbackCover(release)"
            :alt="release.title"
            kind="album"
            class="release-preview-cover"
          />
          <div class="album-preview-overlay"><span class="album-open-icon"><ChevronRight :size="19" /></span></div>
        </div>
        <div class="album-preview-info">
          <h3 class="album-preview-name" :title="release.title">{{ release.title }}</h3>
          <span class="album-preview-artist">{{ release.artist || 'Artista desconocido' }}</span>
          <span class="release-type-label">{{ releaseTypeLabel(release.type) }}<template v-if="release.year"> · {{ release.year }}</template></span>
        </div>
      </article>
    </div>

    <div v-else-if="!preview && filteredReleases.length" class="album-list-full">
      <AlbumList :albums="releaseCards" />
    </div>

    <div v-else class="no-albums">
      <div class="empty-state-icon"><DiscAlbum :size="28" /></div>
      <h3>{{ hasSearch ? 'No se encontraron sencillos ni EP' : 'No hay sencillos ni EP en tu biblioteca' }}</h3>
      <p>{{ hasSearch ? `No hay publicaciones que coincidan con “${searchQuery}”.` : 'Analiza tus canciones para detectar sus publicaciones.' }}</p>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronLeft, ChevronRight, DiscAlbum } from 'lucide-vue-next';
import AlbumList from '../common/AlbumList.vue';
import CoverArt from '../common/CoverArt.vue';

const props = defineProps({
  releases: { type: Array, default: () => [] },
  searchQuery: { type: String, default: '' },
  preview: { type: Boolean, default: false },
});

const router = useRouter();
const carouselRef = ref(null);
const PREVIEW_LIMIT = 10;

const hasSearch = computed(() => props.searchQuery.trim().length > 0);
const filteredReleases = computed(() => {
  const query = props.searchQuery.trim().toLocaleLowerCase();
  return props.releases.filter((release) => !query || [release.title, release.artist, release.type].some((value) => String(value || '').toLocaleLowerCase().includes(query)));
});
const previewReleases = computed(() => filteredReleases.value.slice(0, PREVIEW_LIMIT));
const releaseCards = computed(() => filteredReleases.value.map((release) => ({ ...release, name: release.title })));

function releaseTypeLabel(type) {
  return { single: 'Sencillo', ep: 'EP' }[type] || 'Publicación';
}

function releaseFallbackCover(release) {
  const currentCover = release.cover || release.coverUrl;
  const title = String(release.title || '').trim().toLocaleLowerCase();
  const artist = String(release.artist || release.albumArtist || '').trim().toLocaleLowerCase();
  return props.releases
    .filter((item) =>
      String(item.title || '').trim().toLocaleLowerCase() === title
      && String(item.artist || item.albumArtist || '').trim().toLocaleLowerCase() === artist,
    )
    .map((item) => item.cover || item.coverUrl)
    .find((cover) => cover && cover !== currentCover) || null;
}

function openRelease(release) {
  router.push({ name: 'album', params: { id: release.id } });
}

function openAll() {
  router.push({ path: '/library', query: { category: 'singles-eps' } });
}

async function scrollCarousel(direction) {
  await nextTick();
  carouselRef.value?.scrollBy({ left: Math.max(carouselRef.value.clientWidth * 0.8, 300) * direction, behavior: 'smooth' });
}
</script>