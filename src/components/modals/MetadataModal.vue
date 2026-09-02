<template>
  <div class="metadata-modal-backdrop" @click.self="closeModal">
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
              <strong>Metadatos necesarios:</strong> Título, Artista, Álbum y Portada.
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

            <!-- Álbum -->
            <div class="form-group">
              <label for="meta-album">
                Álbum <span class="required-tag">* Necesario</span>
              </label>
              <input
                id="meta-album"
                v-model="form.album"
                type="text"
                placeholder="Nombre del álbum"
                required
              />
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

            <!-- Portada (SOLO POR URL) -->
            <div class="form-group span-full cover-upload-group">
              <label for="meta-cover-url">
                Portada <span class="required-tag">* Necesario (URL de imagen)</span>
              </label>
              <div class="cover-editor">
                <div class="cover-preview-box">
                  <img
                    v-if="form.cover"
                    :src="form.cover"
                    alt="Previsualización de portada"
                    class="cover-img"
                    @error="handleCoverError"
                  />
                  <div v-else class="cover-placeholder">
                    <Image class="icon-placeholder" />
                    <span>Sin portada</span>
                  </div>
                </div>

                <div class="cover-actions">
                  <div class="url-input-wrapper">
                    <Link class="url-icon" />
                    <input
                      id="meta-cover-url"
                      v-model="form.cover"
                      type="url"
                      placeholder="https://ejemplo.com/portada.jpg"
                      class="cover-url-input"
                    />
                  </div>
                  <p class="cover-hint">
                    Introduce la URL directa de la imagen (JPG, PNG, WebP).
                  </p>

                  <button
                    v-if="form.cover"
                    type="button"
                    class="btn-remove-cover"
                    @click="removeCover"
                  >
                    <Trash2 class="icon-sm" />
                    Quitar portada
                  </button>
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
  CheckCheck
} from 'lucide-vue-next';
import SongIconCover from '../common/SongIconCover.vue';
import { useLibraryStore } from '../../stores/libraryStore.js';
import { identifyAudio } from '../../services/audioIdentification.js';
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

// Estado de Análisis de Audio
// 'idle' | 'analyzing' | 'identified' | 'no_match' | 'error'
const analysisState = ref('idle');
const analysisErrorMessage = ref('');
let analysisTimeout = null;

// Formulario reactivo
const form = reactive({
  title: '',
  artist: '',
  albumArtist: '',
  album: '',
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
  form.album = props.song.album && !props.song.album.startsWith('standalone-') ? props.song.album : '';
  
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

  analysisState.value = 'idle';
  analysisErrorMessage.value = '';
  saveSuccess.value = false;
  saveMessage.value = '';
}

watch(() => props.song, initFormData, { immediate: true });

const currentCoverPreview = computed(() => form.cover || props.song.cover);

// Determina el estado de metadatos entre las 3 posibilidades:
// 1. 'incomplete' (faltan Artista, Portada, Título o Álbum)
// 2. 'necessary' (tiene los 4 mínimos: Artista, Portada, Título y Álbum)
// 3. 'complete' (tiene los 4 mínimos + datos adicionales como Género, Año o Pista)
const songMetadataStatus = computed(() => {
  const hasTitle = Boolean(form.title?.trim());
  const hasArtist = Boolean(form.artist?.trim()) && form.artist !== 'Unknown';
  const hasAlbum = Boolean(form.album?.trim())
    && !form.album.startsWith('standalone-')
    && form.album !== 'Unknown';
  const hasCover = Boolean(form.cover?.trim());

  const meetsNecessary = hasTitle && hasArtist && hasAlbum && hasCover;

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

// -------------------------------------------------------------
// MANEJO DE PORTADA (SOLO URL)
// -------------------------------------------------------------
function removeCover() {
  form.cover = '';
}

function handleCoverError() {
  console.warn('No se pudo cargar la imagen desde la URL proporcionada');
}

// -------------------------------------------------------------
// FLUJO VISUAL DE ANÁLISIS DE AUDIO
// -------------------------------------------------------------
async function startAudioAnalysis() {
  analysisState.value = 'analyzing';
  analysisErrorMessage.value = '';

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

    if (!result) {
      analysisState.value = 'no_match';
      return;
    }

    console.log(
      '[Calliope] Canción identificada:',
      result
    );

    // ==========================================
    // RELLENAR FORMULARIO
    // ==========================================

    form.title =
      result.title || '';

    form.artist =
      result.artist || '';

    form.albumArtist =
      result.albumArtist || '';

    form.album =
      result.album || '';

    form.genre =
      Array.isArray(result.genre)
        ? result.genre.join(', ')
        : result.genre || '';

    form.year =
      result.year
        ? String(result.year)
        : '';

    form.track =
      result.track
        ? String(result.track)
        : '';

    form.trackTotal =
      result.trackTotal
        ? String(result.trackTotal)
        : '';

    form.disk =
      result.disk
        ? String(result.disk)
        : '';

    form.diskTotal =
      result.diskTotal
        ? String(result.diskTotal)
        : '';

    form.cover =
      result.cover || '';

    analysisState.value = 'identified';

  } catch (err) {
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
      album: form.album,
      genre: form.genre,
      year: form.year,
      track: form.track,
      trackTotal: form.trackTotal,
      disk: form.disk,
      diskTotal: form.diskTotal,
      cover: form.cover?.trim() || null
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
  emit('close');
}
</script>
