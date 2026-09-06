<template>
  <div class="metadata-modal-backdrop" @click.self="closeModal">
    <div class="metadata-modal-shell" :class="{ 'drawer-open': selectionPanelOpen }">
    <div class="metadata-modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">

      <!-- Cabecera del modal -->
      <header class="modal-header">
        <div class="header-title-group">
          <Tags class="header-icon" />
          <h2 id="modal-title">Editar Metadatos</h2>
        </div>
        <button
          class="close-btn"
          @click="closeModal"
          aria-label="Cerrar modal"
          type="button"
        >
          <CircleX class="icon" />
        </button>
      </header>

      <div class="modal-body">

        <!-- Tarjeta de información actual del archivo -->
        <section class="current-song-summary">
          <div class="cover-container">
            <img
              v-if="currentCoverPreview"
              :src="currentCoverPreview"
              alt="Portada de la canción"
              class="cover-thumb"
            />
            <SongIconCover v-else class="cover-thumb fallback" />
          </div>

          <div class="summary-details">
            <span class="file-name" :title="song.file?.name || song.name">
              {{ song.file?.name || song.name }}
            </span>
            <div class="file-tags">
              <span class="badge" v-if="song.format?.codec || song.codec">
                {{ (song.format?.codec || song.codec).toUpperCase() }}
              </span>
              <span class="badge" v-if="song.duration">
                {{ formatDuration(song.duration) }}
              </span>
              <span class="badge" v-if="song.bitrate">
                {{ Math.round(song.bitrate / 1000) }} kbps
              </span>
              <!-- Indicador de 3 estados: Incompletos, Necesarios, Completos -->
              <span :class="['badge', `badge-${songMetadataStatus.status}`]">
                <component :is="songMetadataStatus.icon" class="badge-icon" />
                {{ songMetadataStatus.label }}
              </span>
            </div>
          </div>
        </section>

        <!-- Sección: Analizar Audio -->
        <section class="analysis-section">
          <div class="analysis-header">
            <div class="analysis-info">
              <h3>
                <Sparkles class="section-icon" />
                Identificación de Audio
              </h3>
              <p>Reconocimiento de pistas mediante fingerprinting acústico.</p>
            </div>

            <button
              type="button"
              class="btn-analyze"
              :disabled="analysisState === 'analyzing'"
              @click="startAudioAnalysis"
            >
              <template v-if="analysisState === 'analyzing'">
                <Loader2 class="icon-spin" />
                <span>Analizando...</span>
              </template>
              <template v-else>
                <Sparkles class="icon" />
                <span>Analizar audio</span>
              </template>
            </button>
          </div>

          <!-- Estados de análisis -->
          <div v-if="analysisState === 'analyzing'" class="analysis-feedback state-analyzing">
            <div class="wave-animation">
              <span></span><span></span><span></span><span></span><span></span>
            </div>
            <div class="feedback-text">
              <strong>Analizando huella de audio...</strong>
              <p>Escuchando el archivo y consultando el servicio de reconocimiento.</p>
            </div>
            <button type="button" class="btn-cancel-analysis" @click="cancelAudioAnalysis">
              Cancelar
            </button>
          </div>

          <div v-else-if="analysisState === 'identified'" class="analysis-feedback state-success">
            <CheckCircle2 class="feedback-icon" />
            <div class="feedback-text">
              <strong>¡Canción identificada!</strong>
              <p>Los metadatos encontrados se han rellenado automáticamente en el formulario.</p>
            </div>
            <button type="button" class="btn-subtle" @click="analysisState = 'idle'">
              <RotateCcw class="icon-sm" />
              Reanalizar
            </button>
          </div>

          <div v-else-if="analysisState === 'no_match'" class="analysis-feedback state-warning">
            <AlertCircle class="feedback-icon" />
            <div class="feedback-text">
              <strong>No se ha encontrado coincidencia</strong>
              <p>No se pudo identificar la pista con exactitud. Puedes editar los datos manualmente.</p>
            </div>
            <button type="button" class="btn-subtle" @click="analysisState = 'idle'">
              Entendido
            </button>
          </div>

          <div v-else-if="analysisState === 'ambiguous'" class="analysis-feedback state-warning">
            <AlertCircle class="feedback-icon" />
            <div class="feedback-text">
              <strong>No se pudo confirmar la canción</strong>
              <p>{{ analysisErrorMessage || 'Las fuentes devolvieron resultados diferentes. Puedes completar los datos manualmente.' }}</p>
            </div>
            <button type="button" class="btn-subtle" @click="analysisState = 'idle'">
              Entendido
            </button>
          </div>

          <div v-else-if="analysisState === 'error'" class="analysis-feedback state-error">
            <AlertTriangle class="feedback-icon" />
            <div class="feedback-text">
              <strong>Error al analizar</strong>
              <p>{{ analysisErrorMessage || 'No se pudo procesar el archivo de audio.' }}</p>
            </div>
            <button type="button" class="btn-subtle" @click="startAudioAnalysis">
              <RotateCcw class="icon-sm" />
              Reintentar
            </button>
          </div>
        </section>

        <!-- Formulario editable de metadatos -->
        <form class="metadata-form" @submit.prevent="saveMetadata">

          <div class="form-instructions">
            <span class="info-pill">
              <strong>Metadatos necesarios:</strong> Título, Artista, Lanzamiento y Portada.
            </span>
          </div>

          <div class="form-grid">

            <!-- Título -->
            <div class="form-group span-full">
              <label for="meta-title">
                Título de la canción <span class="required-tag">* Necesario</span>
              </label>
              <input
                id="meta-title"
                v-model="form.title"
                type="text"
                placeholder="Título de la canción"
                required
              />
            </div>

            <!-- Artista -->
            <div class="form-group">
              <label for="meta-artist">
                Artista principal <span class="required-tag">* Necesario</span>
              </label>
              <input
                id="meta-artist"
                v-model="form.artist"
                type="text"
                placeholder="Artista o banda"
                required
              />
            </div>

            <!-- Artista del álbum -->
            <div class="form-group">
              <label for="meta-album-artist">Artista del álbum <span class="label-hint">(Opcional)</span></label>
              <input
                id="meta-album-artist"
                v-model="form.albumArtist"
                type="text"
                placeholder="Artista del álbum"
              />
            </div>

            <!-- Lanzamientos -->
            <div class="form-group span-full release-selection-group">
              <label>Lanzamientos a los que pertenece <span class="required-tag">* Necesario</span></label>
              <p class="field-help">Selecciona los álbumes, sencillos y EPs a los que pertenece esta canción.</p>
              <div v-if="releaseChoices.length" class="release-choice-list">
                <label
                  v-for="release in releaseChoices"
                  :key="`form-release-${release.id}`"
                  class="release-choice"
                  :class="{ selected: selectedReleaseIds.includes(release.id) }"
                >
                  <input
                    v-model="selectedReleaseIds"
                    type="checkbox"
                    :value="release.id"
                    @change="handleReleaseToggle(release)"
                    :aria-label="`Pertenecer a ${release.title}`"
                  />
                  <div class="release-choice-cover">
                    <img
                      v-if="release.cover || release.coverUrl"
                      :src="release.cover || release.coverUrl"
                      :alt="release.title"
                      @error="handleReleaseThumbError"
                    />
                    <SongIconCover v-else class="thumb-fallback" />
                  </div>
                  <span class="release-choice-copy">
                    <strong class="release-title" :class="{ 'is-long': release.title.length > 28 }"><span class="release-title-text">{{ release.title }}</span></strong>
                    <small>
                      <span class="release-type-badge">{{ releaseTypeLabel(release.type) }}</span>
                      <template v-if="release.year"> · {{ release.year }}</template>
                      <template v-if="release.trackNumber"> · Pista {{ release.trackNumber }}<template v-if="release.trackTotal">/{{ release.trackTotal }}</template></template>
                    </small>
                  </span>
                </label>
              </div>
              <p v-else class="field-help">Analiza el audio para encontrar álbumes, sencillos y EPs relacionados.</p>
            </div>

            <!-- Género -->
            <div class="form-group">
              <label for="meta-genre">Género <span class="label-hint">(Separado por comas)</span></label>
              <input
                id="meta-genre"
                v-model="form.genre"
                type="text"
                placeholder="Rock, Pop, Indie..."
              />
            </div>

            <!-- Año -->
            <div class="form-group col-quarter">
              <label for="meta-year">Año</label>
              <input
                id="meta-year"
                v-model="form.year"
                type="number"
                min="1900"
                max="2100"
                placeholder="2024"
              />
            </div>

            <!-- Pista -->
            <div class="form-group col-quarter">
              <label for="meta-track">Nº Pista</label>
              <div class="split-inputs">
                <input
                  id="meta-track"
                  v-model="form.track"
                  type="number"
                  min="1"
                  placeholder="1"
                />
                <span class="split-divider">/</span>
                <input
                  v-model="form.trackTotal"
                  type="number"
                  min="1"
                  placeholder="12"
                  title="Total de pistas"
                />
              </div>
              <small class="track-help">La pista puede cambiar según el lanzamiento principal seleccionado.</small>
            </div>

            <!-- Disco -->
            <div class="form-group col-quarter">
              <label for="meta-disk">Nº Disco</label>
              <div class="split-inputs">
                <input
                  id="meta-disk"
                  v-model="form.disk"
                  type="number"
                  min="1"
                  placeholder="1"
                />
                <span class="split-divider">/</span>
                <input
                  v-model="form.diskTotal"
                  type="number"
                  min="1"
                  placeholder="1"
                  title="Total de discos"
                />
              </div>
            </div>

            <!-- Portada de la canción -->
            <div class="form-group span-full cover-upload-group">
              <label>
                Portada de la canción y playlists <span class="required-tag">* Necesario</span>
              </label>
              <p class="field-help">
                Esta portada se mostrará en playlists y en la canción individual. Elige una portada de sus lanzamientos o añade más fotos por enlace.
              </p>
              <div class="cover-editor">
                <!-- Preview destacada de la portada -->
                <div class="cover-preview-column">
                  <div class="cover-preview-box">
                    <img
                      v-if="form.cover && !coverPreviewFailed"
                      :src="form.cover"
                      alt="Previsualización de portada"
                      class="cover-img"
                      @error="handleCoverError"
                    />
                    <div v-else class="cover-placeholder">
                      <Image class="icon-placeholder" />
                      <span>Sin portada seleccionada</span>
                    </div>
                  </div>

                  <div class="cover-preview-footer" v-if="form.cover">
                    <button
                      type="button"
                      class="btn-remove-cover"
                      @click="removeCover"
                    >
                      <Trash2 class="icon-sm" />
                      Quitar portada
                    </button>
                  </div>
                </div>

                <!-- Selección de portadas y añadir por enlace -->
                <div class="cover-selection-column">
                  <!-- Añadir foto por enlace -->
                  <div class="cover-add-panel">
                    <span class="cover-panel-title">Añadir otra portada por enlace</span>
                    <div class="cover-add-form">
                      <div class="url-input-wrapper">
                        <Link class="url-icon" />
                        <input
                          v-model="newCoverInput"
                          type="url"
                          placeholder="https://ejemplo.com/portada.jpg"
                          class="cover-url-input"
                          @keyup.enter.prevent="addCoverFromUrl"
                        />
                      </div>
                      <button
                        type="button"
                        class="btn-add-cover"
                        :disabled="!newCoverInput.trim()"
                        @click="addCoverFromUrl"
                      >
                        <Plus class="icon-sm" />
                        <span>Añadir</span>
                      </button>
                    </div>
                  </div>

                  <!-- Galería de portadas para elegir -->
                  <div class="cover-gallery-panel">
                    <div class="gallery-header">
                      <span class="cover-panel-title">Portadas disponibles ({{ availableCovers.length }})</span>
                      <small class="gallery-hint">Haz clic en una para usarla</small>
                    </div>

                    <div v-if="availableCovers.length" class="cover-choices-grid">
                      <button
                        v-for="choice in availableCovers"
                        :key="choice.id"
                        type="button"
                        class="cover-choice-card"
                        :class="{ selected: form.cover === choice.url }"
                        @click="selectCover(choice)"
                      >
                        <div class="choice-img-wrapper">
                          <img :src="choice.url" :alt="choice.title" @error="handleCoverChoiceError" />
                          <div v-if="form.cover === choice.url" class="selected-badge">
                            <Check class="icon-xs" />
                          </div>
                          <button
                            v-if="choice.source === 'Personalizada'"
                            type="button"
                            class="btn-delete-custom-cover"
                            title="Eliminar portada añadida"
                            @click="removeCustomCover(choice.url, $event)"
                          >
                            <X class="icon-xs" />
                          </button>
                        </div>
                        <div class="choice-info">
                          <strong :title="choice.title">{{ choice.title }}</strong>
                          <small :title="choice.source">{{ choice.source }}</small>
                        </div>
                      </button>
                    </div>
                    <div v-else class="cover-choices-empty">
                      <p>No hay portadas disponibles todavía. Puedes añadir fotos pegando su enlace arriba o analizando el audio.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <!-- Pie del formulario con botón de acción -->
          <div class="form-footer">
            <div class="save-status" v-if="saveMessage">
              <span :class="saveSuccess ? 'text-success' : 'text-error'">
                <Check v-if="saveSuccess" class="icon-sm" />
                <AlertCircle v-else class="icon-sm" />
                {{ saveMessage }}
              </span>
            </div>

            <div class="modal-actions">
              <button
                type="button"
                class="btn-cancel"
                @click="closeModal"
                :disabled="isSaving"
              >
                Cancelar
              </button>

              <button
                type="submit"
                class="btn-save"
                :disabled="isSaving"
              >
                <Loader2 v-if="isSaving" class="icon-spin" />
                <Check v-else-if="saveSuccess" class="icon" />
                <span>{{ isSaving ? 'Guardando...' : (saveSuccess ? '¡Guardado!' : 'Aplicar cambios') }}</span>
              </button>
            </div>
          </div>

        </form>

      </div>

    </div>
    <aside class="metadata-selection-drawer" :aria-hidden="!selectionPanelOpen">
      <button type="button" class="drawer-toggle" :aria-expanded="selectionPanelOpen" aria-controls="metadata-selection-content" :aria-label="selectionPanelOpen ? 'Cerrar panel de selección' : 'Abrir panel de selección'" @click="selectionPanelOpen = !selectionPanelOpen">
        <ChevronRight v-if="!selectionPanelOpen" :size="18" />
        <ChevronLeft v-else :size="18" />
      </button>
      <div id="metadata-selection-content" class="drawer-content">
        <header class="drawer-header">
          <div>
            <span class="drawer-kicker">Calliope / metadata</span>
            <h2>Revisión de datos</h2>
          </div>
          <button type="button" class="drawer-close" aria-label="Cerrar panel de selección" @click="selectionPanelOpen = false"><X :size="18" /></button>
        </header>

        <section v-if="analysisState === 'analyzing'" class="drawer-progress">
          <div class="drawer-progress-title"><Loader2 class="icon-spin" :size="17" /><strong>Analizando archivo</strong></div>
          <ol>
            <li v-for="(step, index) in analysisSteps" :key="step.id" :class="stepState(index)"><span class="step-marker">{{ index + 1 }}</span><span>{{ step.label }}</span></li>
          </ol>
        </section>

        <template v-else>
          <section v-if="candidateChoices.length" class="drawer-section">
            <div class="drawer-section-heading"><div><span class="drawer-kicker">Identidad</span><h3>Coincidencias</h3></div><span class="drawer-count">{{ candidateChoices.length }}</span></div>
            <div class="drawer-candidates">
              <article v-for="candidate in candidateChoices" :key="candidate.identityKey" class="drawer-candidate" :class="{ selected: candidate.identityKey === selectedCandidateKey }">
                <div class="drawer-candidate-copy"><strong class="drawer-candidate-title"><span>{{ candidate.title || 'Sin título' }}</span></strong><span class="drawer-candidate-artist"><span>{{ candidate.artist || 'Artista desconocido' }}</span></span><small>{{ (candidate.providers || [candidate.provider || 'Fuente desconocida']).join(' + ') }} · {{ Math.round((candidate.similarity ?? candidate.confidence ?? 0) * 100) }}% coincidencia</small></div>
                <button type="button" class="drawer-action" @click="selectCandidate(candidate)">{{ candidate.identityKey === selectedCandidateKey ? 'Seleccionada' : 'Usar' }}</button>
              </article>
            </div>
          </section>

          <section v-if="releaseChoices.length" class="drawer-section">
            <div class="drawer-section-heading"><div><span class="drawer-kicker">Publicaciones</span><h3>Lanzamientos relacionados</h3></div><span class="drawer-count">{{ selectedReleaseIds.length }}/{{ releaseChoices.length }}</span></div>
            <p class="drawer-help">Marca todos los lanzamientos a los que pertenece esta canción.</p>
            <div class="drawer-releases">
              <label v-for="release in releaseChoices" :key="`drawer-${release.id}`" class="drawer-release" :class="{ selected: selectedReleaseIds.includes(release.id) }">
                <input v-model="selectedReleaseIds" type="checkbox" :value="release.id" @change="ensureAtLeastOneRelease(release)" />
                <img v-if="release.cover || release.coverUrl" :src="release.cover || release.coverUrl" :alt="release.title" @error="handleReleaseCoverError($event, release)" />
                <SongIconCover v-else />
                <span><strong class="release-title" :class="{ 'is-long': release.title.length > 28 }"><span class="release-title-text">{{ release.title }}</span></strong><small>{{ releaseTypeLabel(release.type) }}<template v-if="release.year"> · {{ release.year }}</template><template v-if="release.trackNumber"> · Pista {{ release.trackNumber }}<template v-if="release.trackTotal">/{{ release.trackTotal }}</template></template></small><em>{{ release.source || 'MusicBrainz' }}</em></span>
              </label>
            </div>
          </section>

          <section v-if="artistChoices.length || canSuggestArtistSplit" class="drawer-section"><div class="drawer-section-heading"><div><span class="drawer-kicker">Créditos</span><h3>Artistas</h3></div></div><div v-if="artistChoices.length" class="drawer-chips"><label v-for="artist in artistChoices" :key="`drawer-artist-${artist}`" :class="{ selected: selectedArtists.includes(artist) }"><input v-model="selectedArtists" type="checkbox" :value="artist" @change="applyArtistSelection" /><span>{{ artist }}</span></label></div><button v-if="canSuggestArtistSplit" type="button" class="drawer-artist-split" @click="suggestArtistSplit">Probar separar colaboración</button></section>

          <section v-if="genreChoices.length" class="drawer-section"><div class="drawer-section-heading"><div><span class="drawer-kicker">Clasificación</span><h3>Géneros</h3></div></div><div class="drawer-chips"><label v-for="genre in genreChoices" :key="`drawer-genre-${genre}`" :class="{ selected: selectedGenres.includes(genre) }"><input v-model="selectedGenres" type="checkbox" :value="genre" @change="applyGenreSelection" /><span>{{ genre }}</span></label></div></section>

          <section v-if="coverChoices.length" class="drawer-section"><div class="drawer-section-heading"><div><span class="drawer-kicker">Artwork</span><h3>Portadas</h3></div></div><div class="drawer-covers"><button v-for="choice in coverChoices" :key="`drawer-cover-${choice.id}`" type="button" :class="{ selected: form.cover === choice.url }" @click="selectCover(choice)"><img :src="choice.url" :alt="choice.releaseTitle" @error="handleDrawerCoverError" /><span>{{ choice.releaseTitle }}<small>{{ choice.source }}</small></span></button></div></section>

          <div v-if="identifiedResult" class="drawer-confirmation"><CheckCircle2 :size="16" /><span>La propuesta se refleja en el formulario. Revisa los campos y pulsa “Aplicar cambios”.</span></div>
          <div v-else class="drawer-empty"><Sparkles :size="20" /><p>Pulsa “Analizar audio” para consultar las fuentes y revisar sus propuestas aquí.</p></div>
        </template>
      </div>
    </aside>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue';
import {
  CircleX,
  Tags,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  Image,
  Trash2,
  Check,
  Link,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  X,
  Plus
} from 'lucide-vue-next';
import SongIconCover from '../common/SongIconCover.vue';
import { useLibraryStore } from '../../stores/libraryStore.js';
import { identifyAudio } from '../../services/audioIdentification.js';
import { deduplicateReleases } from '../../services/identificationRanking.js';
const props = defineProps({
  song: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['close', 'updated']);
const library = useLibraryStore();

const isSaving = ref(false);
const saveSuccess = ref(false);
const saveMessage = ref('');
const identifiedResult = ref(null);
const selectedReleaseIds = ref([]);
const selectedPrimaryReleaseId = ref('');
const selectedReleaseType = ref('album');
const selectedArtists = ref([]);
const selectedGenres = ref([]);
const selectedCandidateKey = ref('');
const coverPreviewFailed = ref(false);
const userCustomCovers = ref([]);
const newCoverInput = ref('');

// Estado de Análisis de Audio
// 'idle' | 'analyzing' | 'identified' | 'no_match' | 'ambiguous' | 'error'
const analysisState = ref('idle');
const analysisErrorMessage = ref('');
const selectionPanelOpen = ref(false);
const analysisStep = ref(0);
let analysisTimeout = null;
let analysisProgressTimer = null;

const analysisSteps = [
  { id: 'local', label: 'Leer metadata local' },
  { id: 'fingerprint', label: 'Generar huella acústica' },
  { id: 'providers', label: 'Consultar fuentes externas' },
  { id: 'identity', label: 'Comparar identidad y artista' },
  { id: 'releases', label: 'Resolver releases y portadas' },
];

// Formulario reactivo
const form = reactive({
  title: '',
  artist: '',
  albumArtist: '',
  genre: '',
  year: '',
  track: '',
  trackTotal: '',
  disk: '',
  diskTotal: '',
  cover: ''
});

// Inicializar datos del formulario a partir de la canción seleccionada
function initFormData() {
  form.title = props.song.title || props.song.name || '';
  form.artist = props.song.artist && props.song.artist !== 'Unknown' ? props.song.artist : '';
  form.albumArtist = props.song.albumArtist || '';
  if (Array.isArray(props.song.genre)) {
    form.genre = props.song.genre.join(', ');
  } else if (typeof props.song.genre === 'string') {
    form.genre = props.song.genre;
  } else {
    form.genre = '';
  }

  form.year = props.song.year ? String(props.song.year) : '';
  form.track = props.song.track ? String(props.song.track) : '';
  form.trackTotal = props.song.trackTotal ? String(props.song.trackTotal) : '';
  form.disk = props.song.disk ? String(props.song.disk) : '';
  form.diskTotal = props.song.diskTotal ? String(props.song.diskTotal) : '';
  form.cover = props.song.cover || '';
  coverPreviewFailed.value = false;
  userCustomCovers.value = [];
  newCoverInput.value = '';

  analysisState.value = 'idle';
  analysisErrorMessage.value = '';
  saveSuccess.value = false;
  saveMessage.value = '';
  identifiedResult.value = null;
  selectedReleaseIds.value = props.song.releaseIds ? [...props.song.releaseIds] : [];
  selectedPrimaryReleaseId.value = props.song.primaryReleaseId || '';
  selectedArtists.value = expandArtistNames(props.song.artists || (props.song.artist ? [props.song.artist] : []));
  selectedGenres.value = Array.isArray(props.song.genre) ? [...props.song.genre] : [];
  selectedReleaseType.value = props.song.primaryRelease?.type || 'album';
  selectedCandidateKey.value = '';
}

watch(() => props.song, initFormData, { immediate: true });

const relatedReleases = computed(() => {
  const sources = [
    ...(identifiedResult.value?.selectedRecording?.releases || []),
    ...(identifiedResult.value?.releases || []),
    ...(props.song.releases || []),
  ];
  const withArtwork = [...sources].sort((left, right) =>
    Number(Boolean(right?.cover || right?.coverUrl)) - Number(Boolean(left?.cover || left?.coverUrl)),
  );
  return deduplicateReleases(withArtwork).slice(0, 5);
});
const releaseChoices = computed(() => {
  const currentIds = new Set(props.song.releaseIds || []);
  const choices = identifiedResult.value
    ? [...relatedReleases.value]
    : [
        ...relatedReleases.value,
        ...library.releases.filter((release) => currentIds.has(release.id)),
      ];
  if (!choices.length && props.song.album && !props.song.album.startsWith('standalone-')) {
    choices.push({
      id: props.song.primaryReleaseId || props.song.albumId || `legacy:${props.song.id}`,
      title: props.song.album,
      type: props.song.releaseType || 'album',
      artist: props.song.artist,
      year: props.song.year,
      cover: props.song.cover,
      source: 'local',
    });
  }
  const artistKey = (props.song.artist || '').toLocaleLowerCase();
  const unique = new Map();

  for (const release of choices) {
    if (!release?.id) continue;
    if (!identifiedResult.value && !relatedReleases.value.some((item) => item.id === release.id)) {
      if (artistKey && !String(release.artist || '').toLocaleLowerCase().includes(artistKey)) continue;
    }

    if (!unique.has(release.id)) unique.set(release.id, release);
  }

  const ranked = [...unique.values()];
  const selected = ranked.filter((release) => currentIds.has(release.id));
  const remaining = ranked.filter((release) => !currentIds.has(release.id));
  return [...selected, ...remaining.slice(0, Math.max(0, 20 - selected.length))];
});
const candidateChoices = computed(() => (identifiedResult.value?.recordingCandidates
  || identifiedResult.value?.candidates
  || []).map((candidate) => ({
    ...candidate,
    identityKey: candidate.identityKey || candidate.id,
  })));
const coverCandidateChoices = computed(() => [
  ...candidateChoices.value,
  ...(identifiedResult.value?.allCandidates || []).filter((candidate) => {
    const selected = identifiedResult.value?.selectedRecording || identifiedResult.value?.recording;
    if (!selected) return true;
    const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
    const title = normalize(candidate.title);
    const selectedTitle = normalize(selected.title || identifiedResult.value?.metadata?.title);
    const artist = normalize(candidate.artist);
    const selectedArtist = normalize(selected.artist || identifiedResult.value?.metadata?.artist);
    const titleMatches = !title || !selectedTitle || title === selectedTitle || title.includes(selectedTitle) || selectedTitle.includes(title);
    const artistMatches = !artist || !selectedArtist || artist === selectedArtist || artist.includes(selectedArtist) || selectedArtist.includes(artist);
    return titleMatches && artistMatches;
  }),
]);
function expandArtistNames(values) {
  return [...new Set((values || []).map(artistName).filter(Boolean))];
}

const artistChoices = computed(() => {
  const structured = expandArtistNames(
    relatedReleases.value.flatMap((release) => release.artists || [])
      .concat(identifiedResult.value?.recording?.artists || []),
  );
  return selectedArtists.value.length > 1 ? selectedArtists.value : structured;
});
const canSuggestArtistSplit = computed(() => selectedArtists.value.length <= 1 && /\s*(?:&|\by\b|\b(?:feat\.?|ft\.?|featuring)\b)\s*/i.test(form.artist || ''));
const genreChoices = computed(() => [...new Set((identifiedResult.value?.recording?.genres || []).concat(relatedReleases.value.flatMap((release) => release.genres || [])))].filter(Boolean));
const coverChoices = computed(() => {
  const releaseChoicesWithCovers = relatedReleases.value.flatMap((release) => {
    const url = release.cover || release.coverUrl;
    const alternatives = Array.isArray(release.coverAlternatives) ? release.coverAlternatives : [];
    return [
      ...(url ? [{ url, source: release.source || 'release' }] : []),
      ...alternatives,
    ].filter((choice) => choice.url).map((choice) => ({
      id: `${release.id}:${choice.url}`,
      url: choice.url,
      releaseTitle: release.title,
      source: choice.source || release.source || 'release',
    }));
  });
  const candidateChoicesWithCovers = coverCandidateChoices.value.flatMap((candidate) => {
    const raw = candidate.raw || {};
    const urls = [candidate.cover, ...(candidate.coverAlternatives || []).map((choice) => choice.url), raw.artworkUrl100, raw.artworkUrl60, raw.cover, raw.coverUrl]
      .filter(Boolean)
      .map((url) => String(url).replace(/100x100bb/g, '600x600bb'));
    return [...new Set(urls)].map((url) => ({
      id: `candidate:${candidate.identityKey}:${url}`,
      url,
      releaseTitle: candidate.album || candidate.title,
      source: candidate.provider || 'candidate',
    }));
  });
  const choices = identifiedResult.value
    ? releaseChoicesWithCovers
    : [...releaseChoicesWithCovers, ...candidateChoicesWithCovers];
  const sourcePriority = {
    'musicbrainz-release': 5,
    'musicbrainz-release-group': 4,
    itunes: 3,
    acoustid: 2,
    candidate: 1,
    release: 1,
  };
  const unique = new Map();
  for (const choice of choices) {
    const isMusicBrainzCover = /coverartarchive\.org\/release(?:-group)?\//i.test(choice.url);
    const canonicalUrl = isMusicBrainzCover
      ? `musicbrainz:${String(choice.releaseTitle || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()}`
      : choice.url;
    const previous = unique.get(canonicalUrl);
    if (!previous || (sourcePriority[choice.source] || 0) > (sourcePriority[previous.source] || 0)) {
      unique.set(canonicalUrl, choice);
    }
  }
  return [...unique.values()];
});

const availableCovers = computed(() => {
  const list = [];
  const seen = new Set();

  function addCover(url, title, source, releaseId = null) {
    if (!url || typeof url !== 'string') return;
    const cleanUrl = url.trim();
    if (!cleanUrl || seen.has(cleanUrl)) return;
    seen.add(cleanUrl);
    list.push({
      id: `${releaseId || source}:${cleanUrl}`,
      url: cleanUrl,
      title: title || 'Lanzamiento',
      source: source || 'Lanzamiento',
      releaseId,
    });
  }

  // 1. Portada actual de la pista en la biblioteca
  if (props.song.cover) {
    addCover(props.song.cover, props.song.album || props.song.title || 'Actual', 'Biblioteca');
  }

  // 2. Portadas de los lanzamientos a los que pertenece (priorizando seleccionados)
  const prioritizedReleases = [...releaseChoices.value].sort((a, b) => {
    const aSel = selectedReleaseIds.value.includes(a.id) ? 1 : 0;
    const bSel = selectedReleaseIds.value.includes(b.id) ? 1 : 0;
    return bSel - aSel;
  });

  for (const rel of prioritizedReleases) {
    const coverUrl = rel.cover || rel.coverUrl;
    if (coverUrl) {
      addCover(coverUrl, rel.title, releaseTypeLabel(rel.type), rel.id);
    }
    if (Array.isArray(rel.coverAlternatives)) {
      for (const alt of rel.coverAlternatives) {
        if (alt?.url) {
          addCover(alt.url, rel.title, alt.source || 'Alternativa', rel.id);
        }
      }
    }
  }

  // 3. Portadas descubiertas del reconocimiento de audio
  for (const choice of coverChoices.value) {
    addCover(choice.url, choice.releaseTitle, choice.source);
  }

  // 4. Portadas añadidas manualmente por el usuario mediante enlace
  for (const url of userCustomCovers.value) {
    addCover(url, 'Enlace añadido', 'Personalizada');
  }

  // 5. Portada actualmente activa si no estaba en la lista
  if (form.cover) {
    addCover(form.cover, 'Portada elegida', 'URL');
  }

  return list;
});

const currentCoverPreview = computed(() => form.cover || props.song.cover);

function artistName(artist) {
  return typeof artist === 'string' ? artist : artist?.name || '';
}

// Determina el estado de metadatos entre las 3 posibilidades:
// 1. 'incomplete' (faltan Artista, Portada, Título o Lanzamiento)
// 2. 'necessary' (tiene los 4 mínimos: Artista, Portada, Título y Lanzamiento)
// 3. 'complete' (tiene los 4 mínimos + datos adicionales como Género, Año o Pista)
const songMetadataStatus = computed(() => {
  const hasTitle = Boolean(form.title?.trim());
  const hasArtist = Boolean(form.artist?.trim()) && form.artist !== 'Unknown';
  const hasRelease = selectedReleaseIds.value.length > 0;
  const hasCover = Boolean(form.cover?.trim());

  const meetsNecessary = hasTitle && hasArtist && hasRelease && hasCover;

  if (!meetsNecessary) {
    return {
      status: 'incomplete',
      label: 'Metadatos incompletos',
      icon: AlertCircle
    };
  }

  const hasGenre = Boolean(form.genre?.trim());
  const hasYear = Boolean(form.year);
  const hasTrack = Boolean(form.track);

  if (hasGenre && hasYear && hasTrack) {
    return {
      status: 'complete',
      label: 'Metadatos completos',
      icon: CheckCheck
    };
  }

  return {
    status: 'necessary',
    label: 'Metadatos necesarios',
    icon: Check
  };
});

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function stepState(index) {
  if (analysisState.value !== 'analyzing') return 'complete';
  if (index < analysisStep.value) return 'complete';
  if (index === analysisStep.value) return 'active';
  return 'pending';
}

function startAnalysisProgress() {
  analysisStep.value = 0;
  clearInterval(analysisProgressTimer);
  analysisProgressTimer = setInterval(() => {
    if (analysisStep.value < analysisSteps.length - 1) analysisStep.value += 1;
  }, 1600);
}

function stopAnalysisProgress() {
  clearInterval(analysisProgressTimer);
  analysisProgressTimer = null;
  analysisStep.value = analysisSteps.length;
}

function releaseTypeLabel(type) {
  return {
    album: 'Álbum',
    single: 'Sencillo',
    ep: 'EP',
    compilation: 'Compilación',
    soundtrack: 'Banda sonora',
    live: 'Directo',
    mixtape: 'Mixtape',
    other: 'Otro',
    unknown: 'Sin clasificar',
  }[type] || 'Sin clasificar';
}

function selectRelease(release) {
  if (!selectedReleaseIds.value.includes(release.id)) selectedReleaseIds.value.push(release.id);
  selectedPrimaryReleaseId.value = release.id;
  selectedReleaseType.value = release.type || 'other';
  form.albumArtist = release.albumArtist || release.artist || form.albumArtist;
  form.year = release.year || form.year;
  form.cover = release.cover || release.coverUrl || form.cover;
  if (release.trackNumber) form.track = release.trackNumber;
  if (release.trackTotal) form.trackTotal = release.trackTotal;
  if (release.discNumber) form.disk = release.discNumber;
  if (release.discTotal) form.diskTotal = release.discTotal;
}

function handleReleaseThumbError(event) {
  event.currentTarget.hidden = true;
  event.currentTarget.parentElement?.classList.add('no-image');
}

function handleReleaseToggle(release) {
  if (selectedReleaseIds.value.includes(release.id)) {
    if (!selectedPrimaryReleaseId.value || !selectedReleaseIds.value.includes(selectedPrimaryReleaseId.value)) {
      selectedPrimaryReleaseId.value = release.id;
      selectedReleaseType.value = release.type || 'album';
    }
    if (!form.year && release.year) {
      form.year = String(release.year);
    }
    if (!form.cover && (release.cover || release.coverUrl)) {
      form.cover = release.cover || release.coverUrl;
    }
  } else {
    if (selectedPrimaryReleaseId.value === release.id) {
      selectedPrimaryReleaseId.value = selectedReleaseIds.value[0] || '';
      const fallback = releaseChoices.value.find((r) => r.id === selectedPrimaryReleaseId.value);
      if (fallback) {
        selectedReleaseType.value = fallback.type || 'album';
      }
    }
  }
}

function selectPrimaryRelease(release) {
  selectRelease(release);
}

function ensureAtLeastOneRelease(release) {
  if (!selectedReleaseIds.value.length) {
    selectedReleaseIds.value = [release.id];
  }

  if (!selectedReleaseIds.value.includes(selectedPrimaryReleaseId.value)) {
    const fallback = releaseChoices.value.find((item) =>
      selectedReleaseIds.value.includes(item.id),
    );
    if (fallback) selectPrimaryRelease(fallback);
  }
}

function selectCandidate(candidate) {
  selectedCandidateKey.value = candidate.identityKey;
  form.title = candidate.title || form.title;
  form.artist = candidate.artist || form.artist;
  form.albumArtist = candidate.albumArtist || form.albumArtist;
  form.year = candidate.year || form.year;
  form.track = candidate.track || form.track;
  form.trackTotal = candidate.trackTotal || form.trackTotal;
  form.disk = candidate.disk || form.disk;
  form.diskTotal = candidate.diskTotal || form.diskTotal;
  form.cover = candidate.cover || form.cover;
  if (Array.isArray(candidate.releases) && candidate.releases.length) {
    selectedReleaseIds.value = candidate.releases.map((release) => release.id);
    selectedPrimaryReleaseId.value = candidate.releases.find((release) => release.type === 'album')?.id
      || candidate.releases[0].id;
  }
  selectedArtists.value = candidate.artists?.length
    ? expandArtistNames(candidate.artists)
    : candidate.artist
      ? candidate.artist.split(/\s*,\s*/).filter(Boolean)
      : selectedArtists.value;
}

function applyArtistSelection() {
  form.artist = selectedArtists.value.map(artistName).filter(Boolean).join(', ');
}

function suggestArtistSplit() {
  const parts = String(form.artist || '')
    .split(/\s*(?:&|\by\b|\b(?:feat\.?|ft\.?|featuring)\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return;
  selectedArtists.value = parts;
  applyArtistSelection();
}

function applyGenreSelection() {
  form.genre = selectedGenres.value.join(', ');
}

function applyReleaseType() {
  const release = relatedReleases.value.find((item) => item.id === selectedPrimaryReleaseId.value);
  if (release) release.type = selectedReleaseType.value;
}

function selectCover(choiceOrUrl) {
  const url = typeof choiceOrUrl === 'string' ? choiceOrUrl : choiceOrUrl?.url;
  form.cover = url || '';
  coverPreviewFailed.value = false;
}

function addCoverFromUrl() {
  const url = newCoverInput.value.trim();
  if (!url) return;
  if (!userCustomCovers.value.includes(url)) {
    userCustomCovers.value.push(url);
  }
  form.cover = url;
  coverPreviewFailed.value = false;
  newCoverInput.value = '';
}

function removeCustomCover(url, event) {
  event?.stopPropagation();
  userCustomCovers.value = userCustomCovers.value.filter((u) => u !== url);
  if (form.cover === url) {
    const next = availableCovers.value.find((c) => c.url !== url);
    form.cover = next?.url || '';
  }
}

function handleCoverChoiceError(event) {
  event.currentTarget.hidden = true;
  event.currentTarget.parentElement?.classList.add('image-unavailable');
}

function handleDrawerCoverError(event) {
  event.currentTarget.hidden = true;
  event.currentTarget.parentElement?.classList.add('image-unavailable');
}

function handleReleaseCoverError(event, release) {
  const fallback = coverChoices.value.find((choice) =>
    choice.releaseTitle === release.title && choice.url !== event.currentTarget.src,
  );
  if (fallback && !event.currentTarget.dataset.fallbackTried) {
    event.currentTarget.dataset.fallbackTried = 'true';
    event.currentTarget.src = fallback.url;
    return;
  }
  event.currentTarget.hidden = true;
  event.currentTarget.parentElement?.classList.add('image-unavailable');
}

// -------------------------------------------------------------
// MANEJO DE PORTADA (SOLO URL)
// -------------------------------------------------------------
function removeCover() {
  form.cover = '';
  coverPreviewFailed.value = false;
}

function handleCoverError() {
  coverPreviewFailed.value = true;
  form.cover = '';
  saveMessage.value = 'La portada seleccionada no está disponible.';
  saveSuccess.value = false;
}

// -------------------------------------------------------------
// FLUJO VISUAL DE ANÁLISIS DE AUDIO
// -------------------------------------------------------------
async function startAudioAnalysis() {
  analysisState.value = 'analyzing';
  selectionPanelOpen.value = true;
  analysisErrorMessage.value = '';
  startAnalysisProgress();

  try {
    const file = props.song?.file;

    if (!(file instanceof File)) {
      throw new Error(
        'No se ha podido acceder al archivo de audio.'
      );
    }

    console.log(
      '[Calliope] Iniciando identificación:',
      file.name
    );

    const result = await identifyAudio(file);
    stopAnalysisProgress();

    if (!result) {
      analysisState.value = 'no_match';
      return;
    }

    console.log('[Calliope] Resultado del análisis:', result);

    if (result.recordingCandidates?.length || result.candidates?.length) {
      identifiedResult.value = result;
      selectedCandidateKey.value = result.selectedRecording?.id
        || result.recordingCandidates?.[0]?.id
        || result.candidates?.[0]?.identityKey
        || '';
    }

    if (result.status === 'ambiguous') {
      analysisState.value = 'ambiguous';
      analysisErrorMessage.value =
        'Se encontraron varias coincidencias, pero ninguna tiene confianza suficiente.';
      return;
    }

    if (result.status !== 'match' || !result.metadata) {
      analysisState.value = 'no_match';
      analysisErrorMessage.value =
        result.recordingCandidates?.length
          ? 'No se confirmó una coincidencia final. Puedes revisar las alternativas disponibles.'
          : 'No se pudo encontrar una coincidencia fiable.';
      return;
    }

    // ==========================================
    // RELLENAR FORMULARIO
    // ==========================================

    const metadata = result.metadata || {};
    identifiedResult.value = result;
    selectedCandidateKey.value = result.selectedRecording?.id
      || result.recordingCandidates?.[0]?.id
      || result.candidates?.[0]?.identityKey
      || '';
    selectedReleaseIds.value = (result.releases || []).map((release) => release.id);
    selectedPrimaryReleaseId.value = result.releases?.find((release) => release.type === 'album')?.id
      || result.releases?.[0]?.id
      || '';
    selectedArtists.value = expandArtistNames(result.recording?.artists || metadata.artists || (metadata.artist ? [metadata.artist] : []));
    selectedGenres.value = [...new Set(result.recording?.genres || metadata.genre || [])];
    selectedReleaseType.value = result.releases?.find((release) => release.id === metadata.musicBrainzReleaseId)?.type
      || result.releases?.find((release) => release.type === 'album')?.type
      || metadata.releaseType
      || 'album';

    form.title = metadata.title || '';

    form.artist = metadata.artist || '';

    form.albumArtist = metadata.albumArtist || '';

    form.genre =
      Array.isArray(metadata.genre)
        ? metadata.genre.join(', ')
        : metadata.genre || '';

    form.year = metadata.year ? String(metadata.year) : '';

    form.track = metadata.track ? String(metadata.track) : '';

    form.trackTotal = metadata.trackTotal
      ? String(metadata.trackTotal)
      : '';

    form.disk = metadata.disk ? String(metadata.disk) : '';

    form.diskTotal = metadata.diskTotal
      ? String(metadata.diskTotal)
      : '';

    form.cover = metadata.cover || '';

    const primaryRelease = result.releases?.find((release) => release.id === selectedPrimaryReleaseId.value)
      || result.releases?.find((release) => release.type === 'album')
      || result.releases?.[0];
    if (primaryRelease) selectRelease(primaryRelease);

    analysisState.value = 'identified';

  } catch (err) {
    stopAnalysisProgress();
    console.error(
      '[Calliope] Error durante identificación:',
      err
    );

    analysisState.value = 'error';

    analysisErrorMessage.value =
      err?.message ||
      'No se pudo procesar el archivo de audio.';
  }
}

function cancelAudioAnalysis() {
  if (analysisTimeout) clearTimeout(analysisTimeout);
  stopAnalysisProgress();
  analysisState.value = 'idle';
}

// -------------------------------------------------------------
// GUARDAR METADATOS
// -------------------------------------------------------------
async function saveMetadata() {
  if (!form.title.trim()) {
    saveMessage.value = 'El título de la canción es obligatorio';
    saveSuccess.value = false;
    return;
  }

  isSaving.value = true;
  saveMessage.value = '';

  try {
    const updatedData = {
      title: form.title,
      artist: form.artist,
      albumArtist: form.albumArtist,
      genre: form.genre,
      year: form.year,
      track: form.track,
      trackTotal: form.trackTotal,
      disk: form.disk,
      diskTotal: form.diskTotal,
      cover: form.cover?.trim() || null,
      artists: selectedArtists.value,
      artistCredits: selectedArtists.value.map((artist) => typeof artist === 'string'
        ? { name: artist, role: 'main', joinphrase: '' }
        : artist),
      genres: selectedGenres.value,
      releaseIds: selectedReleaseIds.value,
      primaryReleaseId: selectedPrimaryReleaseId.value,
      releases: releaseChoices.value
        .filter((release) => selectedReleaseIds.value.includes(release.id))
        .map((release) => ({
          id: release.id,
          title: release.title,
          name: release.title,
          type: release.type || 'unknown',
          year: release.year || '',
        })),
      releaseType: selectedReleaseType.value,
      identifiedMetadata: identifiedResult.value
    };

    const success = await library.updateSongMetadata(props.song.id, updatedData);

    if (success) {
      saveSuccess.value = true;
      saveMessage.value = '¡Metadatos guardados correctamente!';
      emit('updated', props.song.id);

      setTimeout(() => {
        closeModal();
      }, 900);
    } else {
      throw new Error('No se pudo actualizar la canción en la biblioteca');
    }
  } catch (err) {
    console.error('Error guardando metadatos:', err);
    saveSuccess.value = false;
    saveMessage.value = 'Error al guardar los cambios: ' + err.message;
  } finally {
    isSaving.value = false;
  }
}

function closeModal() {
  if (analysisTimeout) clearTimeout(analysisTimeout);
  stopAnalysisProgress();
  emit('close');
}
</script>
