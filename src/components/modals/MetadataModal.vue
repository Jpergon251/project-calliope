<template>
  <!-- Teleport a <body>: si el modal se monta dentro de la página (por ejemplo
       `main.song-page`, que tiene `isolation: isolate`), queda atrapado en ese
       stacking context y el sidebar y la barra de reproducción se pintan
       encima. Sacándolo al body, su z-index compite en el nivel raíz. -->
  <Teleport to="body">
  <div class="metadata-modal-backdrop" @click.self="closeModal">
    <div class="metadata-modal-shell" :class="{ 'drawer-open': drawerOpen }">
    <div class="metadata-modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header class="modal-header"><div class="header-title-group"><Tags class="header-icon" /><h2 id="modal-title">Editar metadatos</h2></div><button class="close-btn" type="button" aria-label="Cerrar" @click="closeModal"><CircleX /></button></header>
      <div class="modal-body">
        <section class="analysis-section"><div class="analysis-header"><div class="analysis-info"><h3><Sparkles class="section-icon" />Identificación de audio</h3><p>La identificación se basa en la huella acústica del archivo.</p></div><button class="btn-analyze" type="button" :disabled="analysisState === 'analyzing'" @click="startAudioAnalysis"><Loader2 v-if="analysisState === 'analyzing'" class="icon-spin" /><Sparkles v-else class="icon" />{{ analysisState === 'analyzing' ? 'Analizando...' : 'Analizar audio' }}</button></div><p v-if="analysisMessage" :class="['analysis-feedback', `state-${analysisState}`]">{{ analysisMessage }}</p></section>
        <form class="metadata-form" @submit.prevent="saveMetadata"><div class="form-instructions"><span class="info-pill"><strong>Metadatos necesarios:</strong> título y artista. El álbum es sólo texto opcional.</span></div><div class="form-grid"><div class="form-group span-full"><label for="meta-title">Título de la canción</label><input id="meta-title" v-model="form.title" required /></div><div class="form-group"><label for="meta-artist">Artista</label><input id="meta-artist" v-model="form.artist" /></div><div class="form-group"><label for="meta-album">Álbum <span class="label-hint">(opcional)</span></label><input id="meta-album" v-model="form.album" /></div><div class="form-group"><label for="meta-genre">Género <span class="label-hint">(separado por comas)</span></label><input id="meta-genre" v-model="form.genre" /></div><div class="form-group col-quarter"><label for="meta-year">Año</label><input id="meta-year" v-model="form.year" type="number" min="1900" max="2100" /></div><div class="form-group col-quarter"><label for="meta-track">Nº pista</label><div class="split-inputs"><input id="meta-track" v-model="form.track" type="number" min="1" /><span class="split-divider">/</span><input v-model="form.trackTotal" type="number" min="1" /></div></div><div class="form-group col-quarter"><label for="meta-disk">Nº disco</label><div class="split-inputs"><input id="meta-disk" v-model="form.disk" type="number" min="1" /><span class="split-divider">/</span><input v-model="form.diskTotal" type="number" min="1" /></div></div><div class="form-group span-full cover-upload-group"><label>Portada</label><p class="field-help">Una portada independiente para esta canción.</p><div class="cover-editor"><div class="cover-preview-column"><div class="cover-preview-box"><img v-if="form.cover" :src="form.cover" class="cover-img" alt="Portada seleccionada" @error="form.cover = ''" /><div v-else class="cover-placeholder"><Image /><span>Sin portada</span></div></div><button v-if="form.cover" type="button" class="btn-remove-cover" @click="form.cover = ''"><Trash2 />Quitar portada</button></div><div class="cover-selection-column"><div class="cover-gallery-panel"><div class="gallery-header"><span class="cover-panel-title">Portadas encontradas ({{ coverChoices.length }})</span><span class="gallery-hint">Elige una para esta canción</span></div><div v-if="coverChoices.length" class="cover-choices-grid"><button v-for="cover in coverChoices" :key="cover.value" type="button" class="cover-choice-card" :class="{ selected: form.cover === cover.value }" @click="form.cover = cover.value"><div class="choice-img-wrapper"><img v-if="!cover.unavailable" :src="cover.displayUrl" :alt="cover.label" @error="markCoverUnavailable(cover)" /><span v-else class="choice-unavailable">Sin vista previa</span><span v-if="form.cover === cover.value" class="selected-badge"><Check class="icon-xs" /></span></div><div class="choice-info"><strong>{{ cover.label }}</strong><small>{{ providerLabel(cover.providers) }}</small></div></button></div><p v-else class="cover-choices-empty">No se encontraron portadas para esta canción.</p></div></div></div></div></div><div class="form-footer"><span v-if="saveMessage" :class="saveSuccess ? 'text-success' : 'text-error'"><Check v-if="saveSuccess" class="icon-sm" /><CircleX v-else class="icon-sm" />{{ saveMessage }}</span><div class="modal-actions"><button class="btn-cancel" type="button" @click="closeModal">Cancelar</button><button class="btn-save" type="submit" :disabled="isSaving"><Loader2 v-if="isSaving" class="icon-spin" /><Check v-else />{{ isSaving ? 'Guardando...' : 'Aplicar cambios' }}</button></div></div></form>
      </div>
    </div>

      <!-- Panel deslizable: pasos del análisis + datos elegibles -->
      <aside class="metadata-selection-drawer" :aria-hidden="!drawerOpen">
        <button
          class="drawer-toggle"
          type="button"
          :aria-label="drawerOpen ? 'Ocultar panel de análisis' : 'Mostrar panel de análisis'"
          :aria-expanded="drawerOpen"
          @click="drawerOpen = !drawerOpen"
        >
          <ChevronLeft v-if="drawerOpen" />
          <ChevronRight v-else />
        </button>

        <div class="drawer-content">
          <header class="drawer-header">
            <div>
              <span class="drawer-kicker">Análisis de audio</span>
              <h2>Identificación</h2>
            </div>
            <button class="drawer-close" type="button" aria-label="Ocultar panel" @click="drawerOpen = false">
              <CircleX class="icon-sm" />
            </button>
          </header>

          <!-- 1. Pasos que sigue el análisis -->
          <section class="drawer-section">
            <div class="drawer-progress">
              <div class="drawer-progress-title">
                <Loader2 v-if="isAnalyzing" class="icon-sm icon-spin" />
                <CheckCircle2 v-else class="icon-sm" />
                <strong>{{ progressTitle }}</strong>
              </div>
              <ol>
                <li v-for="step in steps" :key="step.id" :class="stepState(step.id)">
                  <span class="step-marker">
                    <Check v-if="stepState(step.id) === 'complete'" class="icon-xs" />
                    <Loader2 v-else-if="stepState(step.id) === 'active'" class="icon-xs icon-spin" />
                    <CircleX v-else-if="stepState(step.id) === 'failed'" class="icon-xs" />
                    <span v-else>{{ step.index + 1 }}</span>
                  </span>
                  <span>{{ step.label }}</span>
                </li>
              </ol>
            </div>
          </section>

          <!-- 2. Datos elegibles -->
          <section v-if="hasChoices" class="drawer-section">
            <div class="drawer-section-heading">
              <div>
                <span class="drawer-kicker">Datos encontrados</span>
                <h3>Elige qué aplicar</h3>
              </div>
              <span class="drawer-count">{{ totalChoices }} opciones</span>
            </div>
            <p class="drawer-help">Pulsa una opción para aplicarla al formulario del modal.</p>

            <div v-if="artistChoices.length" class="drawer-field-choice">
              <div class="drawer-field-choice-heading">
                <span>Artista</span>
                <small>{{ artistChoices.length }}</small>
              </div>
              <div class="drawer-field-choice-list">
                <button
                  v-for="choice in artistChoices"
                  :key="choice.value"
                  type="button"
                  class="drawer-field-option"
                  :class="{ selected: form.artist === choice.value }"
                  @click="form.artist = choice.value"
                >
                  <span class="drawer-field-option-copy">
                    <strong>{{ choice.value }}</strong>
                    <small>{{ providerLabel(choice.providers) }}</small>
                  </span>
                  <Check v-if="form.artist === choice.value" class="icon-sm" />
                </button>
              </div>
            </div>

            <div v-if="albumChoices.length" class="drawer-field-choice">
              <div class="drawer-field-choice-heading">
                <span>Álbum</span>
                <small>{{ albumChoices.length }}</small>
              </div>
              <div class="drawer-field-choice-list">
                <button
                  v-for="choice in albumChoices"
                  :key="choice.value"
                  type="button"
                  class="drawer-field-option"
                  :class="{ selected: form.album === choice.value }"
                  @click="form.album = choice.value"
                >
                  <span class="drawer-field-option-copy">
                    <strong>{{ choice.value }}</strong>
                    <small>{{ providerLabel(choice.providers) }}</small>
                  </span>
                  <Check v-if="form.album === choice.value" class="icon-sm" />
                </button>
              </div>
            </div>

            <div v-if="genreChoices.length" class="drawer-field-choice">
              <div class="drawer-field-choice-heading">
                <span>Géneros</span>
                <small>{{ selectedGenres.length }} de {{ genreChoices.length }}</small>
              </div>
              <div class="drawer-chips">
                <label
                  v-for="choice in genreChoices"
                  :key="choice.value"
                  :class="{ selected: isGenreSelected(choice.value) }"
                >
                  <input type="checkbox" :checked="isGenreSelected(choice.value)" @change="toggleGenre(choice.value)" />
                  <span>{{ choice.value }}</span>
                </label>
              </div>
            </div>

            <div v-if="coverChoices.length" class="drawer-field-choice">
              <div class="drawer-field-choice-heading">
                <span>Portada</span>
                <small>{{ coverChoices.length }}</small>
              </div>
              <div class="drawer-covers">
                <button
                  v-for="choice in coverChoices"
                  :key="choice.value"
                  type="button"
                  class="drawer-field-option is-cover"
                  :class="{ selected: selectedCoverKey === choice.value }"
                  @click="form.cover = choice.value"
                >
                  <img v-if="!choice.unavailable" :src="choice.displayUrl" :alt="choice.label" @error="markCoverUnavailable(choice)" />
                  <span v-else class="choice-unavailable">Sin vista previa</span>
                  <span class="drawer-field-option-copy">
                    <strong>{{ choice.label }}</strong>
                    <small>{{ providerLabel(choice.providers) }}</small>
                  </span>
                </button>
              </div>
            </div>
          </section>

          <section v-else-if="!isAnalyzing && analysisState !== 'idle'" class="drawer-section">
            <div class="drawer-empty">
              <SearchX class="icon-sm" />
              <p>No hay datos alternativos que elegir. Puedes editar el formulario manualmente.</p>
            </div>
          </section>
        </div>
      </aside>
    </div>
  </div>
  </Teleport>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import {
  CheckCircle2,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Image,
  Loader2,
  SearchX,
  Sparkles,
  Tags,
  Trash2,
} from 'lucide-vue-next';
import { IDENTIFICATION_STEPS, identifyAudio } from '../../services/audioIdentification.js';
import { useLibraryStore } from '../../stores/libraryStore.js';
import { resolveArtistEntities, artistsToDisplayString } from '../../models/musicEntities.js';
const props = defineProps({ song: { type: Object, required: true } });
const emit = defineEmits(['close', 'updated']); const library = useLibraryStore();
const analysisState = ref('idle'), analysisMessage = ref(''), identifiedResult = ref(null), recordingCandidates = ref([]), selectedCandidateId = ref(''), isSaving = ref(false), saveSuccess = ref(false), saveMessage = ref('');
// Panel deslizable: pasos reales del análisis y opciones elegibles encontradas.
const drawerOpen = ref(false);
const steps = ref(IDENTIFICATION_STEPS.map((step, index) => ({ ...step, index })));
const stepStatus = ref({});
const unavailableCovers = ref(new Set());
const isAnalyzing = computed(() => analysisState.value === 'analyzing');
const progressTitle = computed(() => {
  if (isAnalyzing.value) return steps.value.find((step) => stepStatus.value[step.id] === 'active')?.label || 'Analizando audio...';
  if (analysisState.value === 'identified') return 'Análisis completado';
  if (analysisState.value === 'idle') return 'Listo para analizar';
  return 'Análisis finalizado con avisos';
});
const stepState = (id) => stepStatus.value[id] || 'pending';
const fieldChoices = computed(() => identifiedResult.value?.fieldChoices || {});
const artistChoices = computed(() => (fieldChoices.value.artists || []).map((choice) => ({ ...choice, providers: choice.providers || [] })));
const albumChoices = computed(() => recordingCandidates.value
  .map((candidate) => ({ value: candidate.album || '', providers: candidate.providers || [candidate.provider].filter(Boolean) }))
  .filter((choice, index, list) => choice.value && list.findIndex((item) => item.value === choice.value) === index));
const genreChoices = computed(() => (fieldChoices.value.genres || []).map((choice) => ({ ...choice, providers: choice.providers || [] })));
const coverChoices = computed(() => {
  const found = [];
  const add = (url, label, providers = []) => {
    const clean = asCover(url);
    if (!clean || found.some((item) => item.value === clean)) return;
    found.push({
      value: clean,
      displayUrl: clean,
      label: label || 'Portada',
      providers,
      unavailable: unavailableCovers.value.has(clean),
    });
  };
  for (const choice of fieldChoices.value.cover || []) add(choice.value, choice.value, choice.providers || []);
  for (const candidate of recordingCandidates.value) {
    const label = candidate.title || 'Resultado';
    add(candidate.cover, label, candidate.providers || []);
    for (const cover of candidate.coverAlternatives || candidate.covers || []) {
      add(typeof cover === 'string' ? cover : cover?.url, typeof cover === 'string' ? label : (cover?.source || label), candidate.providers || []);
    }
  }
  // La portada ya elegida en el formulario, para poder volver a ella.
  add(form.cover, 'Portada actual');
  return found;
});
const selectedCoverKey = computed(() => asCover(form.cover));
const hasChoices = computed(() => Boolean(artistChoices.value.length || albumChoices.value.length || genreChoices.value.length || coverChoices.value.length));
const totalChoices = computed(() => artistChoices.value.length + albumChoices.value.length + genreChoices.value.length + coverChoices.value.length);
function providerLabel(providers = []) { const names = [...new Set(providers.filter(Boolean))]; return names.length ? names.join(' · ') : 'Fuente desconocida'; }
function isGenreSelected(value) { return selectedGenres.value.includes(String(value).trim().toLowerCase()); }
function toggleGenre(value) {
  const key = String(value).trim().toLowerCase();
  const current = String(form.genre || '').split(',').map((item) => item.trim()).filter(Boolean);
  const next = current.some((item) => item.toLowerCase() === key)
    ? current.filter((item) => item.toLowerCase() !== key)
    : [...current, String(value).trim()];
  form.genre = next.join(', ');
}
function markCoverUnavailable(choice) { const next = new Set(unavailableCovers.value); next.add(choice.value); unavailableCovers.value = next; }
const selectedGenres = computed(() => String(form.genre || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean));
const form = reactive({ title: '', artist: '', album: '', genre: '', year: '', track: '', trackTotal: '', disk: '', diskTotal: '', cover: '' });
const asCover = (value) => typeof value === 'string' ? value.trim() : '';
function init() { const song = props.song; form.title = song.title || song.name || ''; form.artist = song.artist || ''; form.album = song.album || ''; form.genre = Array.isArray(song.genre) ? song.genre.join(', ') : (song.genre || ''); for (const key of ['year', 'track', 'trackTotal', 'disk', 'diskTotal']) form[key] = song[key] ? String(song[key]) : ''; form.cover = asCover(song.cover); recordingCandidates.value = []; selectedCandidateId.value = ''; identifiedResult.value = null; analysisState.value = 'idle'; analysisMessage.value = ''; stepStatus.value = {}; drawerOpen.value = false; }
watch(() => props.song, init, { immediate: true });
function applyMetadata(metadata = {}, candidate = null) { form.title = metadata.title || candidate?.title || form.title; const credits = metadata.artists || candidate?.artists || metadata.artistCredits || candidate?.artistCredits; form.artist = credits?.length ? artistsToDisplayString(resolveArtistEntities(credits, { artistCredits: credits })) : (metadata.artist || candidate?.artist || form.artist); for (const key of ['album', 'year', 'track', 'trackTotal', 'disk', 'diskTotal']) if (metadata[key] !== undefined && metadata[key] !== null && metadata[key] !== '') form[key] = String(metadata[key]); if (metadata.genre) form.genre = Array.isArray(metadata.genre) ? metadata.genre.join(', ') : metadata.genre; if (asCover(metadata.cover)) form.cover = asCover(metadata.cover); }
function selectCandidate(candidate) { selectedCandidateId.value = candidate.id; applyMetadata(candidate.metadata || candidate, candidate); }
async function startAudioAnalysis() { if (!props.song.file) { analysisState.value = 'error'; analysisMessage.value = 'El archivo no está disponible para analizar.'; drawerOpen.value = true; return; } analysisState.value = 'analyzing'; analysisMessage.value = ''; stepStatus.value = {}; drawerOpen.value = true; try { const result = await identifyAudio(props.song.file, { onProgress: ({ step, status }) => { stepStatus.value = { ...stepStatus.value, [step]: status }; } }); identifiedResult.value = result; recordingCandidates.value = result.recordingCandidates || result.candidates || []; if (result.status !== 'match') { analysisState.value = result.status === 'ambiguous' ? 'ambiguous' : 'no_match'; analysisMessage.value = result.status === 'ambiguous' ? 'No hay suficiente evidencia acústica para confirmar una canción.' : 'No se encontró una coincidencia acústica fiable.'; return; } analysisState.value = 'identified'; analysisMessage.value = 'Canción identificada. Revisa los datos y elige una portada.'; if (recordingCandidates.value.length) selectCandidate(result.selectedRecording || recordingCandidates.value[0]); applyMetadata(result.metadata, result.selectedRecording); } catch (error) { analysisState.value = 'error'; analysisMessage.value = error?.message || 'No se pudo analizar el audio.'; } }
async function saveMetadata() { isSaving.value = true; saveSuccess.value = false; saveMessage.value = ''; try { const artists = resolveArtistEntities(form.artist).map((artist) => ({ ...artist })); const metadata = identifiedResult.value?.metadata || {}; const ok = await library.updateSongMetadata(props.song.id, { title: form.title, artist: artistsToDisplayString(artists) || form.artist, artists, artistCredits: artists, album: form.album, albumArtist: metadata.albumArtist || '', genre: form.genre, year: form.year, track: form.track, trackTotal: form.trackTotal, disk: form.disk, diskTotal: form.diskTotal, duration: metadata.duration || props.song.duration, cover: form.cover || null, musicBrainzRecordingId: metadata.musicBrainzRecordingId || props.song.musicBrainzRecordingId || '', acoustid: metadata.acoustid || props.song.acoustid || '', isrc: metadata.isrc || props.song.isrc || '', identification: metadata.identification || props.song.identification || {}, identifiedMetadata: metadata }); if (!ok) throw new Error('No se pudo guardar la canción.'); saveSuccess.value = true; saveMessage.value = 'Cambios guardados.'; emit('updated'); } catch (error) { saveMessage.value = error?.message || 'No se pudieron guardar los cambios.'; } finally { isSaving.value = false; } }
function closeModal() { emit('close'); }
</script>
