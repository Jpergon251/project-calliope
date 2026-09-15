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
              <div class="artist-label-row">
                <label for="meta-artist">
                  Artista principal <span class="required-tag">* Necesario</span>
                </label>
                <button
                  type="button"
                  class="btn-separate-artists"
                  @click="openArtistSeparator"
                >
                  <Users :size="13" />
                  <span>Separar artistas</span>
                </button>
              </div>
              <input
                id="meta-artist"
                v-model="form.artist"
                type="text"
                placeholder="Artista o banda"
                @input="syncManualArtist"
              />
            </div>

            <!-- Lanzamientos -->
            <div class="form-group span-full release-selection-group">
              <label>Lanzamientos a los que pertenece <span class="required-tag">* Necesario</span></label>
              <p class="field-help">Selecciona los álbumes, sencillos y EPs a los que pertenece esta canción.</p>
              <div v-if="selectedReleaseChoices.length" class="release-choice-list">
                <div
                  v-for="release in selectedReleaseChoices"
                  :key="`form-release-${release.id}`"
                  class="release-choice selected"
                >
                  <div class="release-choice-cover">
                    <img
                      v-if="getReleaseCover(release)"
                      :src="getReleaseCover(release)"
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
                  <button
                    type="button"
                    class="btn-remove-release"
                    :aria-label="`Eliminar lanzamiento ${release.title}`"
                    title="Eliminar lanzamiento"
                    @click.prevent="removeRelease(release)"
                  >
                    <Trash2 :size="14" />
                  </button>
                </div>
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
                Esta portada se mostrará en playlists y en la canción individual. Solo puedes elegir portadas de los lanzamientos seleccionados.
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

                <!-- Selección de portadas de los lanzamientos -->
                <div class="cover-selection-column">
                  <!-- Galería de portadas para elegir -->
                  <div class="cover-gallery-panel">
                    <div class="gallery-header">
                      <span class="cover-panel-title">Portadas de los lanzamientos ({{ availableCovers.length }})</span>
                      <small class="gallery-hint">Haz clic en una para usarla</small>
                    </div>

                    <div v-if="availableCovers.length" class="cover-choices-grid">
                      <div
                        v-for="choice in availableCovers"
                        :key="choice.id"
                        class="cover-choice-card"
                        :class="{ selected: form.cover === choice.url }"
                        role="button"
                        tabindex="0"
                        @click="selectCover(choice)"
                        @keydown.enter.prevent="selectCover(choice)"
                        @keydown.space.prevent="selectCover(choice)"
                      >
                        <div class="choice-img-wrapper">
                          <img :src="choice.url" :alt="choice.title" @error="handleCoverChoiceError" />
                          <div v-if="form.cover === choice.url" class="selected-badge">
                            <Check class="icon-xs" />
                          </div>
                        </div>
                        <div class="choice-info">
                          <strong :title="choice.title">{{ choice.title }}</strong>
                          <small :title="choice.source">{{ choice.source }}</small>
                        </div>
                      </div>
                    </div>
                    <div v-else class="cover-choices-empty">
                      <p>No hay portadas disponibles para los lanzamientos seleccionados.</p>
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
          <section v-if="fieldChoiceSections.length" class="drawer-section">
            <div class="drawer-section-heading"><div><span class="drawer-kicker">Propuesta comparada</span><h3>Elige cada dato</h3></div></div>
            <p class="drawer-help">AudD, AcoustID y las fuentes compatibles se comparan por campo. Selecciona solo los valores que quieras aplicar.</p>
            <div class="drawer-field-choices">
              <div v-for="field in fieldChoiceSections" :key="field.key" class="drawer-field-choice">
                <div class="drawer-field-choice-heading"><span>{{ field.label }}</span><small>{{ field.choices.length }} opciones</small></div>
                <div class="drawer-field-choice-list">
                  <button
                    v-for="choice in field.choices"
                    :key="`${field.key}-${choice.value}`"
                    type="button"
                    class="drawer-field-option"
                    :class="{ selected: field.isMulti ? field.current.includes(choice.value) : field.current === choice.value, 'is-cover': field.key === 'cover' }"
                    @click="selectFieldChoice(field.key, choice)"
                  >
                    <img v-if="field.key === 'cover' && choice.value" :src="choice.value" alt="" @error="handleDrawerCoverError" />
                    <span class="drawer-field-option-copy"><strong>{{ choice.value }}</strong><small>{{ choice.sources.join(' + ') }}</small></span>
                    <Check v-if="field.isMulti ? field.current.includes(choice.value) : field.current === choice.value" :size="15" />
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section v-if="selectedReleaseChoices.length" class="drawer-section">
            <div class="drawer-section-heading"><div><span class="drawer-kicker">Publicaciones</span><h3>Lanzamientos seleccionados</h3></div><span class="drawer-count">{{ selectedReleaseChoices.length }}</span></div>
            <p class="drawer-help">Elimina los lanzamientos que no correspondan a esta canción.</p>
            <div class="drawer-releases">
              <div v-for="release in selectedReleaseChoices" :key="`drawer-${release.id}`" class="drawer-release selected">
                <img v-if="release.cover || release.coverUrl" :src="release.cover || release.coverUrl" :alt="release.title" @error="handleReleaseCoverError($event, release)" />
                <SongIconCover v-else />
                <span><strong class="release-title" :class="{ 'is-long': release.title.length > 28 }"><span class="release-title-text">{{ release.title }}</span></strong><small>{{ releaseTypeLabel(release.type) }}<template v-if="release.year"> · {{ release.year }}</template><template v-if="release.trackNumber"> · Pista {{ release.trackNumber }}<template v-if="release.trackTotal">/{{ release.trackTotal }}</template></template></small><em>{{ release.source || 'MusicBrainz' }}</em></span>
                <button type="button" class="drawer-action" @click="removeRelease(release)"><Trash2 :size="14" /> Eliminar</button>
              </div>
            </div>
          </section>

          <section v-if="availableReleaseChoices.length" class="drawer-section">
            <div class="drawer-section-heading"><div><span class="drawer-kicker">Publicaciones</span><h3>Lanzamientos disponibles</h3></div><span class="drawer-count">{{ availableReleaseChoices.length }}</span></div>
            <p class="drawer-help">Añade todos los lanzamientos a los que pertenezca esta canción.</p>
            <div class="drawer-releases">
              <div v-for="release in availableReleaseChoices" :key="`available-drawer-${release.id}`" class="drawer-release">
                <img v-if="release.cover || release.coverUrl" :src="release.cover || release.coverUrl" :alt="release.title" @error="handleReleaseCoverError($event, release)" />
                <SongIconCover v-else />
                <span><strong class="release-title">{{ release.title }}</strong><small>{{ releaseTypeLabel(release.type) }}<template v-if="release.year"> · {{ release.year }}</template></small><em>{{ release.source || 'Fuente' }}</em></span>
                <button type="button" class="drawer-action" @click="addRelease(release)">Añadir</button>
              </div>
            </div>
          </section>

          <section class="drawer-section">
            <div class="drawer-section-heading">
              <div><span class="drawer-kicker">Créditos</span><h3>Artistas</h3></div>
            </div>
            <div v-if="artistChoices.length" class="drawer-chips">
              <label v-for="artist in artistChoices" :key="`drawer-artist-${artist}`" :class="{ selected: selectedArtists.includes(artist) }">
                <input v-model="selectedArtists" type="checkbox" :value="artist" @change="applyArtistSelection" />
                <span>{{ artist }}</span>
              </label>
            </div>
            <button type="button" class="drawer-artist-split" @click="openArtistSeparator">
              <Users :size="13" />
              <span>Separar artistas</span>
            </button>
          </section>

          <section v-if="genreChoices.length" class="drawer-section"><div class="drawer-section-heading"><div><span class="drawer-kicker">Clasificación</span><h3>Géneros</h3></div></div><div class="drawer-chips"><label v-for="genre in genreChoices" :key="`drawer-genre-${genre}`" :class="{ selected: selectedGenres.includes(genre) }"><input v-model="selectedGenres" type="checkbox" :value="genre" @change="applyGenreSelection" /><span>{{ genre }}</span></label></div></section>

          <section v-if="coverChoices.length" class="drawer-section"><div class="drawer-section-heading"><div><span class="drawer-kicker">Artwork</span><h3>Portadas</h3></div></div><div class="drawer-covers"><button v-for="choice in coverChoices" :key="`drawer-cover-${choice.id}`" type="button" :class="{ selected: form.cover === choice.url }" @click="selectCover(choice)"><img :src="choice.url" :alt="choice.releaseTitle" @error="handleDrawerCoverError" /><span>{{ choice.releaseTitle }}<small>{{ choice.source }}</small></span></button></div></section>

          <div v-if="identifiedResult" class="drawer-confirmation"><CheckCircle2 :size="16" /><span>La propuesta se refleja en el formulario. Revisa los campos y pulsa “Aplicar cambios”.</span></div>
          <div v-else class="drawer-empty"><Sparkles :size="20" /><p>Pulsa “Analizar audio” para consultar las fuentes y revisar sus propuestas aquí.</p></div>
        </template>
      </div>
    </aside>
    </div>

    <!-- Mini-interfaz modal para separar artistas manualmente -->
    <div v-if="isSeparatingArtists" class="artist-separator-backdrop" @click.self="cancelArtistSeparation">
      <div class="artist-separator-card">
        <div class="artist-separator-header">
          <div class="title-with-icon">
            <Users :size="18" />
            <h4>Separar artistas</h4>
          </div>
          <button type="button" class="btn-close-separator" @click="cancelArtistSeparation" aria-label="Cerrar">
            <X :size="16" />
          </button>
        </div>
        <p class="artist-separator-desc">
          Edita cada artista de forma individual. Cada uno se guardará como una entidad independiente.
        </p>
        <div class="artist-separator-list">
          <div v-for="(_, index) in editableArtists" :key="index" class="artist-separator-item">
            <input
              v-model="editableArtists[index]"
              type="text"
              placeholder="Nombre del artista"
              class="artist-separator-input"
            />
            <button
              type="button"
              class="btn-remove-separated-artist"
              :disabled="editableArtists.length <= 1"
              @click="removeArtistFromSeparation(index)"
              title="Eliminar artista"
            >
              <Trash2 :size="14" />
            </button>
          </div>
        </div>
        <button type="button" class="btn-add-separated-artist" @click="addArtistToSeparation">
          <Plus :size="14" />
          <span>Añadir artista</span>
        </button>
        <div class="artist-separator-footer">
          <button type="button" class="btn-cancel-separation" @click="cancelArtistSeparation">
            Cancelar
          </button>
          <button type="button" class="btn-confirm-separation" @click="confirmArtistSeparation">
            Guardar
          </button>
        </div>
      </div>
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
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  X,
  Plus,
  Users
} from 'lucide-vue-next';
import SongIconCover from '../common/SongIconCover.vue';
import { useLibraryStore } from '../../stores/libraryStore.js';
import { identifyAudio } from '../../services/audioIdentification.js';
import { deduplicateReleases } from '../../services/identificationRanking.js';
import { suggestArtistSplit } from '../../services/artistSeparation.js';
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
const selectedCoverReleaseId = ref('');
const selectedReleaseType = ref('album');
const selectedArtists = ref([]);
const selectedGenres = ref([]);
const selectedCandidateKey = ref('');
const coverPreviewFailed = ref(false);
const isSeparatingArtists = ref(false);
const editableArtists = ref([]);
const releaseCovers = reactive({});

function getReleaseCover(release) {
  if (!release?.id) return '';

  const stored = releaseCovers[release.id] || {};
  const artworkUrls = (stored.artworks || release.artworks || release.coverAlternatives || [])
    .map((artwork) => typeof artwork === 'string' ? artwork : artwork?.url)
    .map(normalizeCoverValue)
    .filter(Boolean);

  return normalizeCoverValue(stored.cover || release.cover || release.coverUrl) || artworkUrls[0] || '';
}

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
  genre: '',
  year: '',
  track: '',
  trackTotal: '',
  disk: '',
  diskTotal: '',
  cover: ''
});

// Las portadas pueden llegar desde IndexedDB como Blob/File. El formulario
// trabaja únicamente con URLs para no llamar a métodos de String sobre binarios.
function normalizeCoverValue(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

// Inicializar datos del formulario a partir de la canción seleccionada
function initFormData() {
  form.title = props.song.title || props.song.name || '';
  form.artist = props.song.artist && props.song.artist !== 'Unknown' ? props.song.artist : '';
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
  form.cover = normalizeCoverValue(props.song.cover);
  coverPreviewFailed.value = false;
  isSeparatingArtists.value = false;
  editableArtists.value = [];
  Object.keys(releaseCovers).forEach((k) => delete releaseCovers[k]);

  if (Array.isArray(props.song.releases)) {
    for (const rel of props.song.releases) {
      if (rel?.id) {
        const coverVal = rel.cover || rel.coverUrl || '';
        const alts = (rel.artworks || rel.coverAlternatives || [coverVal].filter(Boolean)).map((a) =>
          typeof a === 'string' ? { url: a, source: rel.source || 'release' } : { ...a }
        );
        releaseCovers[rel.id] = {
          cover: coverVal,
          artworks: alts,
        };
      }
    }
  }

  analysisState.value = 'idle';
  analysisErrorMessage.value = '';
  saveSuccess.value = false;
  saveMessage.value = '';
  identifiedResult.value = null;
  selectedReleaseIds.value = props.song.releaseIds ? [...props.song.releaseIds] : [];
  selectedPrimaryReleaseId.value = props.song.primaryReleaseId || props.song.releaseIds?.[0] || '';
  selectedCoverReleaseId.value = props.song.coverReleaseId && selectedReleaseIds.value.includes(props.song.coverReleaseId)
    ? props.song.coverReleaseId
    : selectedPrimaryReleaseId.value;
  const selectedCovers = selectedReleaseIds.value
    .map((releaseId) => releaseCovers[releaseId]?.cover)
    .filter(Boolean);
  if (!selectedCovers.includes(form.cover)) {
    form.cover = selectedCovers[0] || '';
  }
  selectedArtists.value = expandArtistNames(props.song.artists || (props.song.artist ? [props.song.artist] : []));
  selectedGenres.value = Array.isArray(props.song.genre) ? [...props.song.genre] : [];
  selectedReleaseType.value = props.song.primaryRelease?.type || 'album';
  selectedCandidateKey.value = '';
}

watch(() => props.song, initFormData, { immediate: true });

const relatedReleases = computed(() => {
  const analyzedCandidates = identifiedResult.value?.allCandidates || [];
  const metadataTitle = identifiedResult.value?.metadata?.title || props.song.title;
  const metadataArtist = identifiedResult.value?.metadata?.artist || props.song.artist;
  const candidateReleases = analyzedCandidates
    .filter((candidate) => {
      const raw = candidate.raw || {};
      const releaseTitle = raw.collectionName || raw.album?.title || candidate.album;
      const titleScore = Math.max(
        textSimilarityForModal(candidate.title, metadataTitle),
        textSimilarityForModal(releaseTitle, metadataTitle),
      );
      const artistScore = artistSimilarityForModal(candidate.artist, metadataArtist);
      return releaseTitle && titleScore >= 0.55 && artistScore >= 0.55;
    })
    .map((candidate) => {
      const raw = candidate.raw || {};
      const releaseTitle = raw.collectionName || raw.album?.title || candidate.album;
      const providerId = raw.collectionId || raw.album?.id || raw.albumId || releaseTitle;
      const typeText = String(releaseTitle || '').toLowerCase();
      const type = /single/.test(typeText) || textSimilarityForModal(releaseTitle, candidate.title) >= 0.92
        ? 'single'
        : /ep/.test(typeText) ? 'ep' : 'album';
      return {
        ...candidate,
        id: `${candidate.provider || 'candidate'}:${String(providerId)}`,
        title: releaseTitle,
        type,
        artist: candidate.artist,
        year: candidate.year || raw.releaseDate?.slice?.(0, 4) || '',
        trackNumber: candidate.track || raw.trackNumber || 0,
        trackTotal: candidate.trackTotal || raw.trackCount || 0,
        cover: candidate.cover || raw.artworkUrl100 || raw.album?.cover_xl || raw.album?.cover_big || '',
        source: candidate.provider,
      };
    });
  const sources = [
    ...(identifiedResult.value?.selectedRecording?.releases || []),
    ...(identifiedResult.value?.releases || []),
    ...(identifiedResult.value?.recordingCandidates || []).flatMap((candidate) => candidate.releases || []),
    ...(identifiedResult.value?.candidates || []).flatMap((candidate) => candidate.releases || []),
    ...candidateReleases,
    ...(props.song.releases || []),
  ];
  const withArtwork = [...sources].sort((left, right) =>
    Number(Boolean(right?.cover || right?.coverUrl)) - Number(Boolean(left?.cover || left?.coverUrl)),
  );
  const deduplicated = deduplicateReleases(withArtwork);
  const uniqueById = [...new Map(deduplicated.filter((release) => release?.id).map((release) => [release.id, release])).values()];
  const currentIds = new Set(props.song.releaseIds || []);
  const ordered = uniqueById.sort((left, right) =>
    Number(currentIds.has(right.id)) - Number(currentIds.has(left.id))
    || Number(Boolean(right.cover || right.coverUrl)) - Number(Boolean(left.cover || left.coverUrl)),
  );
  // El panel debe mostrar solo las mejores opciones, conservando siempre los
  // releases que ya pertenecen a la canción. No se inventan ni fusionan IDs.
  const maxAnalyzedReleases = 8;
  if (!identifiedResult.value || ordered.length <= maxAnalyzedReleases) return ordered;
  const selected = ordered.filter((release) => currentIds.has(release.id));
  const remaining = ordered.filter((release) => !currentIds.has(release.id));
  return [...selected, ...remaining].slice(0, Math.max(maxAnalyzedReleases, selected.length));
});

function textSimilarityForModal(left, right) {
  const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s*\([^)]*\)\s*$/g, '').trim();
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b || a.includes(b) || b.includes(a)) return 1;
  return 0;
}

function artistSimilarityForModal(left, right) {
  const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s*(?:,|&|\b(?:and|y|con|feat\.?)\b)\s*/g, ' ').trim();
  const a = normalize(left);
  const b = normalize(right);
  return a && b && (a === b || a.includes(b) || b.includes(a)) ? 1 : 0;
}
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
  return [...selected, ...remaining];
});
const selectedReleaseChoices = computed(() => releaseChoices.value.filter((release) => selectedReleaseIds.value.includes(release.id)));
const availableReleaseChoices = computed(() => releaseChoices.value.filter((release) => !selectedReleaseIds.value.includes(release.id)));
const candidateChoices = computed(() => (identifiedResult.value?.recordingCandidates
  || identifiedResult.value?.candidates
  || []).map((candidate, index) => ({
    ...candidate,
    identityKey: candidate.identityKey || candidate.id || `${candidate.provider || 'candidate'}:${candidate.title || 'unknown'}:${index}`,
  })));
const fieldChoiceSections = computed(() => {
  const choices = identifiedResult.value?.fieldChoices || {};
  const fields = [
    { key: 'title', label: 'Título', current: form.title },
    { key: 'artists', label: 'Artistas', current: selectedArtists.value, isMulti: true },
    { key: 'genres', label: 'Géneros', current: selectedGenres.value, isMulti: true },
    { key: 'cover', label: 'Portada', current: form.cover },
  ];
  return fields
    .map((field) => ({ ...field, choices: choices[field.key] || [] }))
    .filter((field) => field.choices.length);
});
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
const coverChoices = computed(() => selectedReleaseChoices.value
  .map((release) => {
    const url = getReleaseCover(release);
    return url
      ? {
          id: `${release.id}:${url}`,
          url,
          releaseId: release.id,
          releaseTitle: release.title,
          source: release.source || 'release',
        }
      : null;
  })
  .filter(Boolean));

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

  // Una canción solo puede usar portadas de sus lanzamientos seleccionados.
  for (const rel of selectedReleaseChoices.value) {
    const coverUrl = getReleaseCover(rel);
    if (coverUrl) {
      addCover(coverUrl, rel.title, releaseTypeLabel(rel.type), rel.id);
    }
  }

  return list;
});

const currentCoverPreview = computed(() => form.cover || normalizeCoverValue(props.song.cover));

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
  const hasCover = Boolean(normalizeCoverValue(form.cover).trim());

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
  form.year = release.year || form.year;
  const relCover = getReleaseCover(release);
  if (relCover) {
    form.cover = relCover;
  }
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
    const relCover = getReleaseCover(release);
    if (!form.cover && relCover) {
      form.cover = relCover;
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

function removeRelease(release) {
  selectedReleaseIds.value = selectedReleaseIds.value.filter((id) => id !== release.id);
  delete releaseCovers[release.id];

  if (selectedPrimaryReleaseId.value === release.id) {
    selectedPrimaryReleaseId.value = selectedReleaseIds.value[0] || '';
  }
  if (selectedCoverReleaseId.value === release.id || !selectedReleaseIds.value.includes(selectedCoverReleaseId.value)) {
    selectedCoverReleaseId.value = selectedReleaseIds.value[0] || '';
  }

  const nextCover = selectedReleaseChoices.value.find((item) => item.id === selectedCoverReleaseId.value);
  form.cover = getReleaseCover(nextCover) || '';
}

function addRelease(release) {
  selectRelease(release);
  if (!form.cover) {
    form.cover = getReleaseCover(release) || form.cover;
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
  form.year = candidate.year || form.year;
  form.track = candidate.track || form.track;
  form.trackTotal = candidate.trackTotal || form.trackTotal;
  form.disk = candidate.disk || form.disk;
  form.diskTotal = candidate.diskTotal || form.diskTotal;
  const candidateCover = normalizeCoverValue(candidate.cover);
  if (candidateCover) form.cover = candidateCover;
  selectedArtists.value = candidate.artists?.length
    ? expandArtistNames(candidate.artists)
    : candidate.artist
      ? [candidate.artist]
      : selectedArtists.value;
}

function selectFieldChoice(field, choice) {
  const value = choice?.value;
  if (!value) return;

  if (field === 'title') {
    form.title = value;
  } else if (field === 'artists') {
    const artists = selectedArtists.value.includes(value)
      ? selectedArtists.value.filter((artist) => artist !== value)
      : [...selectedArtists.value, value];
    selectedArtists.value = artists;
    form.artist = artists.join(', ');
  } else if (field === 'genres') {
    const genres = selectedGenres.value.includes(value)
      ? selectedGenres.value.filter((genre) => genre !== value)
      : [...selectedGenres.value, value];
    selectedGenres.value = genres;
    form.genre = genres.join(', ');
  } else if (field === 'cover') {
    form.cover = value;
    coverPreviewFailed.value = false;
  }
}

function openArtistSeparator() {
  if (selectedArtists.value.length > 1) {
    editableArtists.value = [...selectedArtists.value];
  } else {
    editableArtists.value = suggestArtistSplit(form.artist);
  }
  if (!editableArtists.value.length) {
    editableArtists.value = [form.artist || ''];
  }
  isSeparatingArtists.value = true;
}

function addArtistToSeparation() {
  editableArtists.value.push('');
}

function removeArtistFromSeparation(index) {
  if (editableArtists.value.length > 1) {
    editableArtists.value.splice(index, 1);
  }
}

function confirmArtistSeparation() {
  const cleaned = editableArtists.value.map((a) => a.trim()).filter(Boolean);
  if (cleaned.length) {
    selectedArtists.value = cleaned;
    form.artist = cleaned.join(', ');
  }
  isSeparatingArtists.value = false;
}

function cancelArtistSeparation() {
  isSeparatingArtists.value = false;
}

function applyArtistSelection() {
  form.artist = selectedArtists.value.map(artistName).filter(Boolean).join(', ');
}

function syncManualArtist() {
  // El texto del input es la fuente de verdad cuando el usuario lo edita.
  // selectedArtists puede contener todavía los artistas de la detección
  // anterior y no debe sobrescribir el cambio al guardar.
  selectedArtists.value = form.artist
    .split(/\s*,\s*/)
    .map((artist) => artist.trim())
    .filter(Boolean);
}

function suggestArtistSplitLegacy() {
  openArtistSeparator();
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
  if (!url) return;

  const choiceReleaseId = typeof choiceOrUrl === 'object' ? choiceOrUrl?.releaseId : null;
  const targetReleaseId = (choiceReleaseId && selectedReleaseIds.value.includes(choiceReleaseId))
    ? choiceReleaseId
    : (selectedPrimaryReleaseId.value || selectedReleaseIds.value[0]);

  if (targetReleaseId) {
    selectedCoverReleaseId.value = targetReleaseId;

    const selectedRelease = releaseChoices.value.find((release) => release.id === targetReleaseId) || null;
    selectedReleaseType.value = selectedRelease?.type || selectedReleaseType.value;
  }

  form.cover = url;
  coverPreviewFailed.value = false;
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
      form.title = '';
      form.artist = '';
      form.cover = '';
      selectedReleaseIds.value = [];
      selectedPrimaryReleaseId.value = '';
      selectedCoverReleaseId.value = '';
      analysisState.value = 'ambiguous';
      const auddMissing = result.diagnostics?.warnings?.includes('audd-token-missing');
      analysisErrorMessage.value = auddMissing
        ? 'AudD no está configurado. Añade VITE_AUDD_API_TOKEN al archivo .env y reinicia Vite para buscar por audio.'
        : result.recordingCandidates?.length
          ? 'Se encontraron varias coincidencias. Elige los datos que quieras aplicar en el panel de revisión.'
        : result.identificationSource === 'fingerprint' && !result.recordingCandidates?.length
          ? 'El fingerprint no encontró una coincidencia de audio. No se han aplicado datos del nombre del archivo.'
          : 'Se encontraron varias coincidencias de audio, pero ninguna tiene confianza suficiente.';
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
    const analyzedReleases = (result.releases || []).filter((release) => release?.id);
    const exactRecordingReleases = (result.selectedRecording?.releases || [])
      .filter((release) => release?.id);
    const releasePool = exactRecordingReleases.length
      ? exactRecordingReleases
      : analyzedReleases;
    const normalizeReleaseText = (value) => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    const metadataAlbumKey = normalizeReleaseText(metadata.album);
    const metadataTitleKey = normalizeReleaseText(metadata.title || form.title);
    const preferredAnalyzedRelease = releasePool.find((release) =>
      release.id === metadata.musicBrainzReleaseId,
    ) || releasePool.find((release) =>
      metadataAlbumKey && normalizeReleaseText(release.title) === metadataAlbumKey,
    ) || releasePool.find((release) =>
      release.type === 'single' && metadataTitleKey &&
      normalizeReleaseText(release.title) === metadataTitleKey,
    ) || releasePool.find((release) => release.type === 'album')
      || releasePool[0];
    const identifiedCover = normalizeCoverValue(metadata.cover);
    // No copiar aquí metadata.cover al release: puede ser artwork del álbum
    // padre. La portada del release debe venir asociada a su propio ID.
    // Una grabación puede pertenecer a varios releases, pero el análisis no
    // debe marcarlos todos como seleccionados: eso hacía que al guardar se
    // añadieran álbumes y recopilaciones que el usuario no había elegido.
    // Se propone únicamente el release más preciso; el resto queda disponible
    // para que el usuario lo añada manualmente.
    selectedReleaseIds.value = preferredAnalyzedRelease
      ? [preferredAnalyzedRelease.id]
      : [];
    selectedPrimaryReleaseId.value = preferredAnalyzedRelease?.id || '';
    selectedArtists.value = expandArtistNames(result.recording?.artists || metadata.artists || (metadata.artist ? [metadata.artist] : []));
    selectedGenres.value = [...new Set(result.recording?.genres || metadata.genre || [])];
    selectedReleaseType.value = preferredAnalyzedRelease?.type
      || metadata.releaseType
      || 'album';

    form.title = metadata.title || '';

    form.artist = metadata.artist || '';

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

    const primaryRelease = selectedReleaseChoices.value.find((release) => release.id === selectedPrimaryReleaseId.value)
      || selectedReleaseChoices.value[0];
    if (primaryRelease) selectRelease(primaryRelease);

    // Usar primero la portada del release principal. `metadata.cover` puede
    // proceder de iTunes/Deezer y ser la portada del álbum padre aunque la
    // grabación identificada sea el sencillo.
    const primaryCover = getReleaseCover(primaryRelease);
    const selectedCover = primaryCover
      ? primaryRelease
      : selectedReleaseChoices.value.find((release) => getReleaseCover(release));
    form.cover = primaryCover || identifiedCover || getReleaseCover(selectedCover) || '';
    selectedCoverReleaseId.value = selectedCover?.id || selectedPrimaryReleaseId.value || '';

    // La portada solo se asocia al release que está seleccionado como portada.
    // No copiarla a los demás releases disponibles o a los que se añadan
    // posteriormente sin una portada propia.
    if (selectedCover?.id && form.cover) {
      selectedCover.cover = form.cover;
      selectedCover.coverUrl = form.cover;
    }

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
    // El valor visible del campo debe prevalecer sobre la selección que
    // hubiera generado la identificación automática. Esto permite editar el
    // artista manualmente sin tocar la lógica de portadas ni de releases.
    const displayArtist = form.artist.trim() ||
      (props.song.artist && props.song.artist !== 'Unknown'
        ? props.song.artist.trim()
        : '');
    const savedArtists = displayArtist
      ? displayArtist.split(/\s*,\s*/).map((artist) => artist.trim()).filter(Boolean)
      : [];
    selectedArtists.value = savedArtists;
    const updatedData = {
      title: form.title,
      artist: displayArtist,
      genre: form.genre,
      year: form.year,
      track: form.track,
      trackTotal: form.trackTotal,
      disk: form.disk,
      diskTotal: form.diskTotal,
      // La portada de la canción siempre debe pertenecer a un release seleccionado.
      cover: normalizeCoverValue(form.cover).trim() || null,
      artists: savedArtists,
      artistCredits: savedArtists.map((artist) => ({
        name: artist,
        role: 'main',
        joinphrase: '',
      })),
      genres: selectedGenres.value,
      releaseIds: selectedReleaseIds.value,
      primaryReleaseId: selectedPrimaryReleaseId.value,
      coverReleaseId: selectedCoverReleaseId.value || selectedPrimaryReleaseId.value || null,
      releases: selectedReleaseChoices.value
        .filter((release) => selectedReleaseIds.value.includes(release.id))
        .map((release) => {
          // Solo la portada del release elegido se actualiza. Las demás
          // conservan su artwork y no heredan la portada principal de la canción.
          const releaseCover = release.id === selectedCoverReleaseId.value
            ? normalizeCoverValue(form.cover).trim()
            : getReleaseCover(release);
          const existingArtworks = (release.artworks || release.coverAlternatives || [])
            .map((artwork) => typeof artwork === 'string'
              ? { url: artwork, source: release.source || 'release' }
              : { ...artwork })
            .filter((artwork) => artwork?.url);
          const artworks = releaseCover
            ? [
                ...existingArtworks.filter((artwork) => artwork.url !== releaseCover),
                { url: releaseCover, source: release.source || 'manual' },
              ]
            : existingArtworks;
          return {
            ...release,
            id: release.id,
            title: release.title,
            name: release.title,
            type: release.type || 'unknown',
            year: release.year || '',
            cover: releaseCover || null,
            coverUrl: releaseCover || '',
            artworks,
            coverAlternatives: artworks.map((artwork) => ({ ...artwork })),
          };
        }),
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
