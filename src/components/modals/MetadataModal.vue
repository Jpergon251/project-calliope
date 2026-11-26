<template>
  <Teleport to="body">
    <Transition name="metadata-modal">
      <div class="metadata-modal-backdrop" @click.self="closeModal">
        <section
          class="metadata-modal-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <header class="modal-header">
            <div class="header-title-group">
              <Tags class="header-icon" />
              <div>
                <span class="metadata-modal-kicker">Biblioteca musical</span>
                <h2 id="modal-title">Editar metadatos</h2>
              </div>
            </div>
            <button
              class="close-btn"
              type="button"
              aria-label="Cerrar"
              @click="closeModal"
            >
              <CircleX />
            </button>
          </header>

          <form class="metadata-redesign-form" @submit.prevent="saveMetadata">
            <div class="metadata-modal-content">
              <section
                class="metadata-cover-column"
                aria-label="Portada"
              >
                <div class="metadata-cover-preview">
                  <img
                    v-if="form.cover && !coverPreviewFailed"
                    :src="form.cover"
                    alt="Portada seleccionada"
                    @error="handleCoverPreviewError"
                  />
                  <div v-else class="metadata-cover-empty" :class="{ 'has-error': coverPreviewFailed }">
                    <Image />
                    <span>{{ coverPreviewFailed ? 'No se pudo cargar la portada' : 'Sin portada' }}</span>
                  </div>
                </div>
                <div class="metadata-cover-actions">
                  <span class="metadata-column-title">Portada</span>
                  <div class="metadata-cover-buttons">
                    <label class="metadata-text-button metadata-cover-upload">
                      <Image :size="14" /> Archivo
                      <input type="file" accept="image/*" @change="selectCoverFile" />
                    </label>
                    <button
                      v-if="form.cover"
                      type="button"
                      class="metadata-text-button"
                      @click="removeCover"
                    >
                      <Trash2 :size="14" /> Quitar
                    </button>
                  </div>
                </div>
                <div class="metadata-cover-url">
                  <label for="metadata-cover-url-input">O usar una URL</label>
                  <div class="metadata-cover-url-control">
                    <input
                      id="metadata-cover-url-input"
                      v-model="coverUrlInput"
                      type="url"
                      inputmode="url"
                      placeholder="https://…"
                      @keydown.enter.prevent="loadCoverFromUrl"
                    />
                    <button type="button" :disabled="isLoadingCoverUrl || !coverUrlInput.trim()" @click="loadCoverFromUrl">
                      <Loader2 v-if="isLoadingCoverUrl" class="icon-spin" :size="14" />
                      {{ isLoadingCoverUrl ? 'Cargando…' : 'Cargar' }}
                    </button>
                  </div>
                  <p v-if="coverUrlMessage" :class="['metadata-cover-url-message', `state-${coverUrlState}`]" role="status">{{ coverUrlMessage }}</p>
                </div>
                <div
                  v-if="coverChoices.length"
                  class="metadata-cover-gallery"
                  aria-label="Portadas alternativas"
                >
                  <span class="metadata-cover-gallery-title">Portadas encontradas</span>
                  <div class="metadata-cover-gallery-items">
                    <button
                      v-for="cover in coverChoices"
                      :key="cover.value"
                      type="button"
                      class="metadata-cover-choice"
                      :class="{ selected: form.cover === cover.value }"
                      :title="cover.label"
                      :aria-label="`Usar portada: ${cover.label}`"
                      :aria-pressed="form.cover === cover.value"
                      @click="selectCoverChoice(cover)"
                    >
                      <img
                        v-if="!cover.unavailable"
                        :src="cover.displayUrl"
                        :alt="cover.label"
                        @error="markCoverUnavailable(cover)"
                      />
                      <span v-else class="metadata-cover-unavailable">—</span>
                    </button>
                  </div>
                </div>
              </section>

              <section
                class="metadata-fields-column"
                aria-label="Datos de la canción"
              >
                <div class="metadata-fields-heading">
                  <span>Información</span
                  ><small
                    >Los cambios se escriben también en las etiquetas del
                    archivo.</small
                  >
                </div>
                <div class="metadata-field">
                  <label for="meta-title">Título</label
                  ><input id="meta-title" v-model="form.title" required />
                </div>
                <div class="metadata-field">
                  <label for="meta-artist">Artista</label
                  ><input id="meta-artist" v-model="form.artist" />
                </div>
                <div class="metadata-field">
                  <label for="meta-album">Álbum</label
                  ><input id="meta-album" v-model="form.album" />
                </div>
                <div class="metadata-field">
                  <label for="meta-genre">Género</label
                  ><input id="meta-genre" v-model="form.genre" />
                </div>
                <div class="metadata-field">
                  <label for="meta-year">Año</label
                  ><input
                    id="meta-year"
                    v-model="form.year"
                    type="number"
                    min="1900"
                    max="2100"
                  />
                </div>
                <div class="metadata-field">
                  <label for="meta-track"
                    >Nº pista <small>(número / total)</small></label
                  >
                  <div class="metadata-split-inputs">
                    <input
                      id="meta-track"
                      v-model="form.track"
                      type="number"
                      min="1"
                      aria-label="Número de pista"
                    /><span>/</span
                    ><input
                      v-model="form.trackTotal"
                      type="number"
                      min="1"
                      aria-label="Total de pistas"
                    />
                  </div>
                </div>
                <div class="metadata-field">
                  <label for="meta-disk"
                    >Nº disco <small>(número / total)</small></label
                  >
                  <div class="metadata-split-inputs">
                    <input
                      id="meta-disk"
                      v-model="form.disk"
                      type="number"
                      min="1"
                      aria-label="Número de disco"
                    /><span>/</span
                    ><input
                      v-model="form.diskTotal"
                      type="number"
                      min="1"
                      aria-label="Total de discos"
                    />
                  </div>
                </div>
              </section>

              <aside class="metadata-analysis-panel" aria-label="Análisis y propuestas de identificación">
                <div class="metadata-analysis-panel-heading">
                  <div>
                    <span>Análisis y propuestas</span>
                    <small>Elige qué datos quieres incorporar al formulario.</small>
                  </div>
                  <button
                    class="metadata-identify-button"
                    type="button"
                    :disabled="isAnalyzing"
                    @click="startAudioAnalysis"
                  >
                    <Loader2 v-if="isAnalyzing" class="icon-spin" :size="17" />
                    <Sparkles v-else :size="17" />
                    {{ isAnalyzing ? "Identificando…" : "Identificar canción" }}
                  </button>
                </div>

                <div
                  v-if="isAnalyzing"
                  class="metadata-analysis-progress"
                  role="status"
                  aria-live="polite"
                >
                  <span>{{ progressTitle }}</span><i></i>
                </div>
                <p
                  v-else-if="analysisMessage"
                  :class="['metadata-analysis-message', `state-${analysisState}`]"
                  role="status"
                >
                  {{ analysisMessage }}
                </p>
                <div v-if="analysisDetails.length" class="metadata-analysis-details" role="status">
                  <span v-for="detail in analysisDetails" :key="detail">{{ detail }}</span>
                </div>

                <TransitionGroup
                  v-if="recordingCandidates.length"
                  name="metadata-candidate"
                  tag="div"
                  class="metadata-candidates"
                  aria-label="Resultados de identificación"
                >
                  <button
                    v-for="candidate in candidatesWithDisplayId"
                    :key="candidate.id"
                    type="button"
                    class="metadata-candidate-card"
                    :class="{ selected: selectedCandidateId === candidate.id }"
                    :aria-pressed="selectedCandidateId === candidate.id"
                    @click="selectCandidate(candidate)"
                  >
                    <span>
                      <strong>{{ candidate.title || candidate.metadata?.title || "Canción identificada" }}</strong>
                      <small>{{ candidate.artist || candidate.metadata?.artist || "Artista desconocido" }}<template v-if="candidate.album || candidate.metadata?.album"> · {{ candidate.album || candidate.metadata?.album }}</template></small>
                      <small class="metadata-candidate-hint">Pulsa para revisar esta propuesta</small>
                    </span>
                    <Check v-if="selectedCandidateId === candidate.id" :size="16" />
                  </button>
                </TransitionGroup>
                <button v-if="selectedCandidate" type="button" class="metadata-apply-candidate" @click="applySelectedCandidate">
                  Aplicar propuesta al formulario
                </button>
                <div v-if="selectedCandidate" class="metadata-candidate-fields" aria-label="Datos de la propuesta seleccionada">
                  <span class="metadata-candidate-fields-title">Aplicar campos por separado</span>
                  <button v-if="candidateValue(selectedCandidate, 'title')" type="button" @click="form.title = candidateValue(selectedCandidate, 'title')">Usar título: {{ candidateValue(selectedCandidate, 'title') }}</button>
                  <button v-if="candidateArtist(selectedCandidate)" type="button" @click="form.artist = candidateArtist(selectedCandidate)">Usar artista: {{ candidateArtist(selectedCandidate) }}</button>
                  <button v-if="candidateValue(selectedCandidate, 'album')" type="button" @click="form.album = candidateValue(selectedCandidate, 'album')">Usar álbum: {{ candidateValue(selectedCandidate, 'album') }}</button>
                  <button v-if="candidateValue(selectedCandidate, 'year')" type="button" @click="form.year = String(candidateValue(selectedCandidate, 'year'))">Usar año: {{ candidateValue(selectedCandidate, 'year') }}</button>
                  <button v-if="candidateValue(selectedCandidate, 'track')" type="button" @click="form.track = String(candidateValue(selectedCandidate, 'track'))">Usar pista: {{ candidateValue(selectedCandidate, 'track') }}</button>
                  <button v-if="candidateValue(selectedCandidate, 'disk')" type="button" @click="form.disk = String(candidateValue(selectedCandidate, 'disk'))">Usar disco: {{ candidateValue(selectedCandidate, 'disk') }}</button>
                </div>

                <div v-if="candidateFieldChoices" class="metadata-field-choices" aria-label="Otras opciones encontradas">
                  <div v-if="titleChoices.length" class="metadata-choice-group">
                    <span>Títulos encontrados</span>
                    <button v-for="choice in titleChoices" :key="choice.value" type="button" :class="{ selected: form.title === choice.value }" @click="form.title = choice.value">{{ choice.value }}<small>{{ providerLabel(choice.providers) }}</small></button>
                  </div>
                  <div v-if="artistChoices.length" class="metadata-choice-group">
                    <span>Artista encontrado</span>
                    <button v-for="choice in artistChoices" :key="choice.value" type="button" :class="{ selected: form.artist === choice.value }" @click="form.artist = choice.value">{{ choice.value }}<small>{{ providerLabel(choice.providers) }}</small></button>
                  </div>
                  <div v-if="albumArtistChoices.length" class="metadata-choice-group">
                    <span>Artista del álbum</span>
                    <button v-for="choice in albumArtistChoices" :key="choice.value" type="button" :class="{ selected: selectedAlbumArtist === choice.value }" @click="selectedAlbumArtist = choice.value">{{ choice.value }}<small>{{ providerLabel(choice.providers) }}</small></button>
                  </div>
                  <div v-if="albumChoices.length" class="metadata-choice-group">
                    <span>Álbum encontrado</span>
                    <button v-for="choice in albumChoices" :key="choice.value" type="button" :class="{ selected: form.album === choice.value }" @click="form.album = choice.value">{{ choice.value }}<small>{{ providerLabel(choice.providers) }}</small></button>
                  </div>
                  <div v-if="genreChoices.length" class="metadata-choice-group">
                    <span>Géneros encontrados</span>
                    <button class="metadata-add-genres" type="button" @click="applySuggestedGenres">Añadir todos los géneros sin borrar los actuales</button>
                    <div class="metadata-genre-choices">
                      <label v-for="choice in genreChoices" :key="choice.value" :class="{ selected: isGenreSelected(choice.value) }">
                        <input type="checkbox" :checked="isGenreSelected(choice.value)" @change="toggleGenre(choice.value)" />{{ choice.value }}
                      </label>
                    </div>
                  </div>
                </div>
              </aside>
            </div>

            <footer class="metadata-redesign-footer">
              <p
                v-if="saveMessage"
                :class="saveSuccess ? 'text-success' : 'text-error'"
                role="status"
              >
                {{ saveMessage }}
              </p>
              <div class="metadata-redesign-actions">
                <button class="btn-cancel" type="button" @click="closeModal">
                  Cancelar
                </button>
                <button class="btn-save" type="submit" :disabled="isSaving">
                  <Loader2 v-if="isSaving" class="icon-spin" /><Check
                    v-else
                  />{{ isSaving ? "Guardando…" : "Guardar cambios" }}
                </button>
              </div>
            </footer>
          </form>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, reactive, ref, watch } from "vue";
import {
  Check,
  CircleX,
  Image,
  Loader2,
  Sparkles,
  Tags,
  Trash2,
} from "lucide-vue-next";
import {IDENTIFICATION_STEPS, identifyAudio} from "../../services/audioIdentification.js";
import { useLibraryStore } from "../../stores/libraryStore.js";
import {resolveArtistEntities, artistsToDisplayString} from "../../models/musicEntities.js";

const props = defineProps({ song: { type: Object, required: true } });
const emit = defineEmits(["close", "updated"]);
const library = useLibraryStore();
const analysisState = ref("idle");
const analysisMessage = ref("");
const identifiedResult = ref(null);
const recordingCandidates = ref([]);
const selectedCandidateId = ref("");
const coverUrlInput = ref("");
const coverUrlMessage = ref("");
const coverUrlState = ref("idle");
const isLoadingCoverUrl = ref(false);
const coverPreviewFailed = ref(false);
const analysisDetails = ref([]);
const appliedMetadata = ref(null);
const selectedAlbumArtist = ref("");
const isSaving = ref(false);
const saveSuccess = ref(false);
const saveMessage = ref("");
const steps = ref(
  IDENTIFICATION_STEPS.map((step, index) => ({ ...step, index })),
);
const stepStatus = ref({});
const unavailableCovers = ref(new Set());
const form = reactive({
  title: "",
  artist: "",
  album: "",
  genre: "",
  year: "",
  track: "",
  trackTotal: "",
  disk: "",
  diskTotal: "",
  cover: "",
});
const isAnalyzing = computed(() => analysisState.value === "analyzing");
const progressTitle = computed(() => {
  const step = steps.value.find(
    (item) => stepStatus.value[item.id] === "active",
  )?.id;
  const labels = {
    local: "Leyendo etiquetas del archivo…",
    fingerprint: "Analizando huella acústica…",
    acoustid: "Buscando coincidencias en AcoustID…",
    providers: "Consultando fuentes musicales…",
    grouping: "Comparando resultados…",
    enrichment: "Completando datos en MusicBrainz…",
    genres: "Identificando géneros…",
    cover: "Buscando portadas…",
  };
  return labels[step] || "Analizando huella acústica…";
});
const fieldChoices = computed(() => identifiedResult.value?.fieldChoices || {});
const candidatesWithDisplayId = computed(() => recordingCandidates.value.map((candidate, index) => ({
  ...candidate,
  id: candidate.id || candidate.recordingId || `candidate-${index}`,
})));
const selectedCandidate = computed(() => candidatesWithDisplayId.value.find((candidate) => candidate.id === selectedCandidateId.value) || null);
const artistChoices = computed(() =>
  (fieldChoices.value.artists || []).map((choice) => ({...choice, providers: choice.providers || []})),
);
const albumChoices = computed(() => {
  const choices = [
    ...(fieldChoices.value.albums || []),
    ...recordingCandidates.value.map((candidate) => ({
      value: candidate.album || candidate.metadata?.album || "",
      providers: candidate.providers || [candidate.provider].filter(Boolean),
    })),
  ];
  return choices.filter((choice) => choice.value).filter((choice, index, list) => list.findIndex((item) => item.value === choice.value) === index);
});
const titleChoices = computed(() => (fieldChoices.value.title || []).map((choice) => ({ ...choice, providers: choice.providers || [] })));
const albumArtistChoices = computed(() => (fieldChoices.value.albumArtists || []).map((choice) => ({ ...choice, providers: choice.providers || [] })));
const candidateFieldChoices = computed(() => Boolean(selectedCandidate.value || titleChoices.value.length || artistChoices.value.length || albumChoices.value.length || albumArtistChoices.value.length || genreChoices.value.length));
const genreChoices = computed(() =>
  (fieldChoices.value.genres || []).map((choice) => ({...choice, providers: choice.providers || []})),
);
const coverChoices = computed(() => {
  const found = [];
  const add = (url, label, providers = []) => {
    const clean = asCover(url);
    if (!clean || found.some((item) => item.value === clean)) return;
    found.push({
      value: clean,
      displayUrl: clean,
      label: label || "Portada",
      providers,
      unavailable: unavailableCovers.value.has(clean),
    });
  };
  for (const choice of fieldChoices.value.cover || [])
    add(choice.value, choice.value, choice.providers || []);
  for (const candidate of recordingCandidates.value) {
    const label = candidate.title || "Resultado";
    add(candidate.cover, label, candidate.providers || []);
    for (const cover of candidate.coverAlternatives || candidate.covers || []) {
      add(
        typeof cover === "string" ? cover : cover?.url,
        typeof cover === "string" ? label : cover?.source || label,
        candidate.providers || [],
      );
    }
  }
  add(form.cover, "Portada actual");
  return found;
});
const selectedGenres = computed(() =>
  String(form.genre || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean),
);
const asCover = (value) => (typeof value === "string" ? value.trim() : "");

function providerLabel(providers = []) {
  const names = [...new Set(providers.filter(Boolean))];
  return names.length ? names.join(" · ") : "Fuente desconocida";
}
function isGenreSelected(value) {
  return selectedGenres.value.includes(String(value).trim().toLowerCase());
}
function markCoverUnavailable(choice) {
  const next = new Set(unavailableCovers.value);
  next.add(choice.value);
  unavailableCovers.value = next;
}
function selectCoverChoice(choice) {
  if (choice.unavailable) return;
  form.cover = choice.value;
  coverPreviewFailed.value = false;
  coverUrlMessage.value = "Portada seleccionada.";
  coverUrlState.value = "success";
}
function selectCandidate(candidate) {
  selectedCandidateId.value = candidate.id;
  appliedMetadata.value = null;
}
function handleCoverPreviewError() {
  coverPreviewFailed.value = true;
  if (coverUrlInput.value && form.cover === coverUrlInput.value.trim()) {
    coverUrlMessage.value = "La URL no se pudo cargar. Comprueba que sea una imagen accesible.";
    coverUrlState.value = "error";
  }
}
function removeCover() {
  form.cover = "";
  coverPreviewFailed.value = false;
  coverUrlInput.value = "";
  coverUrlMessage.value = "Portada quitada. El cambio se guardará al guardar la canción.";
  coverUrlState.value = "success";
}
function selectCoverFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    coverUrlMessage.value = "El archivo seleccionado no es una imagen válida.";
    coverUrlState.value = "error";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === "string") {
      form.cover = reader.result;
      coverPreviewFailed.value = false;
      coverUrlInput.value = "";
      coverUrlMessage.value = "Portada local lista; se guardará con los cambios.";
      coverUrlState.value = "success";
    }
  };
  reader.onerror = () => {
    coverUrlMessage.value = "No se pudo leer el archivo de imagen.";
    coverUrlState.value = "error";
  };
  reader.readAsDataURL(file);
}
async function loadCoverFromUrl() {
  const value = coverUrlInput.value.trim();
  if (!value || isLoadingCoverUrl.value) return;
  let parsed;
  try {parsed = new URL(value);} catch {
    coverUrlMessage.value = "Introduce una URL de imagen válida.";
    coverUrlState.value = "error";
    return;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    coverUrlMessage.value = "La URL debe comenzar por http:// o https://.";
    coverUrlState.value = "error";
    return;
  }
  isLoadingCoverUrl.value = true;
  coverUrlState.value = "loading";
  coverUrlMessage.value = "Comprobando que la imagen esté disponible…";
  try {
    await new Promise((resolve, reject) => {
      const image = new window.Image();
      image.onload = resolve;
      image.onerror = () => reject(new Error("La dirección no devolvió una imagen accesible."));
      image.src = parsed.href;
    });
    form.cover = parsed.href;
    coverPreviewFailed.value = false;
    coverUrlMessage.value = "Portada cargada y previsualizada; guarda los cambios para aplicarla.";
    coverUrlState.value = "success";
  } catch (error) {
    coverUrlMessage.value = error?.message || "No se pudo cargar la imagen desde esa URL.";
    coverUrlState.value = "error";
  } finally {isLoadingCoverUrl.value = false;}
}
async function startAudioAnalysis() {
  if (!props.song.file) {
    analysisState.value = "error";
    analysisMessage.value = "El archivo no está disponible para analizar.";
    analysisDetails.value = ["No hay un archivo de audio para generar la huella acústica."];
    return;
  }
  analysisState.value = "analyzing";
  analysisMessage.value = "Analizando el audio. Los datos no se aplicarán al formulario hasta que elijas una propuesta.";
  clearAnalysisState();
  stepStatus.value = {};
  selectedCandidateId.value = "";
  try {
    const result = await identifyAudio(props.song.file, {
      onProgress: ({ step, status }) => {stepStatus.value = { ...stepStatus.value, [step]: status };},
    });
    identifiedResult.value = result;
    recordingCandidates.value = result?.recordingCandidates || result?.candidates || [];
    analysisDetails.value = describeAnalysisOutcome(result);
    if (result?.status !== "match") {
      analysisState.value = result?.status === "ambiguous" ? "ambiguous" : "no_match";
      analysisMessage.value = result?.status === "ambiguous"
        ? "La identificación necesita revisión manual."
        : parseNoMatchReason(result);
      return;
    }
    analysisState.value = "identified";
    analysisMessage.value = recordingCandidates.value.length
      ? "Se encontraron propuestas. Selecciona una para revisar sus datos y aplicarlos al formulario."
      : "Se encontró una propuesta. Pulsa «Aplicar propuesta al formulario» para revisar sus datos.";
    const selected = result.selectedRecording || recordingCandidates.value[0];
    if (selected?.id) selectedCandidateId.value = selected.id;
  } catch (error) {
    analysisState.value = "error";
    analysisMessage.value = localErrorMessage(error);
    analysisDetails.value = [String(error?.message || "Error desconocido durante la identificación.")];
  }
}
function addGenres(values) {
  const additions = (Array.isArray(values) ? values : [values])
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  const current = String(form.genre || "").split(",").map((item) => item.trim()).filter(Boolean);
  const seen = new Set(current.map((item) => item.toLowerCase()));
  for (const value of additions) {
    if (!seen.has(value.toLowerCase())) {current.push(value); seen.add(value.toLowerCase());}
  }
  form.genre = current.join(", ");
}
function toggleGenre(value) {
  const key = String(value).trim().toLowerCase();
  const current = String(form.genre || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (current.some((item) => item.toLowerCase() === key)) {
    form.genre = current.filter((item) => item.toLowerCase() !== key).join(", ");
  } else {addGenres([value]);}
}
function applySelectedCandidate() {
  if (!selectedCandidate.value) return;
  const metadata = selectedCandidate.value.metadata || selectedCandidate.value;
  applyMetadata(metadata, selectedCandidate.value);
  appliedMetadata.value = metadata;
  analysisMessage.value = "Propuesta aplicada al formulario. Revisa los campos antes de guardar.";
  analysisState.value = "identified";
}
function candidateArtist(candidate) {
  const source = candidate?.metadata || candidate || {};
  const credits = source.artists || candidate?.artists || source.artistCredits || candidate?.artistCredits;
  if (credits?.length) return artistsToDisplayString(resolveArtistEntities(credits, { artistCredits: credits }));
  return source.artist || candidate?.artist || "";
}
function candidateValue(candidate, field) {
  const source = candidate?.metadata || candidate || {};
  const value = source[field] ?? candidate?.[field] ?? "";
  return Array.isArray(value) ? value.join(", ") : value;
}
function applyMetadata(metadata = {}, candidate = null) {
  const source = metadata || candidate || {};
  if (source.title || candidate?.title) form.title = source.title || candidate.title;
  const credits = source.artists || candidate?.artists || source.artistCredits || candidate?.artistCredits;
  if (credits?.length) {
    form.artist = artistsToDisplayString(resolveArtistEntities(credits, { artistCredits: credits }));
  } else if (source.artist || candidate?.artist) {form.artist = source.artist || candidate.artist;}
  for (const key of ["album", "year", "track", "trackTotal", "disk", "diskTotal"]) {
    const value = source[key] ?? candidate?.[key];
    if (value !== undefined && value !== null && value !== "") form[key] = String(value);
  }
  if (source.genre || candidate?.genre) addGenres(source.genre || candidate.genre);
  const cover = asCover(source.cover || candidate?.cover);
  if (cover) {form.cover = cover; coverPreviewFailed.value = false;}
}
function init() {
  const song = props.song;
  form.title = song.title || song.name || "";
  form.artist = song.artist || "";
  form.album = song.album || "";
  form.genre = Array.isArray(song.genre) ? song.genre.join(", ") : song.genre || "";
  for (const key of ["year", "track", "trackTotal", "disk", "diskTotal"]) form[key] = song[key] ? String(song[key]) : "";
  form.cover = asCover(song.cover);
  recordingCandidates.value = [];
  selectedCandidateId.value = "";
  identifiedResult.value = null;
  analysisState.value = "idle";
  analysisMessage.value = "";
  stepStatus.value = {};
  unavailableCovers.value = new Set();
  coverUrlInput.value = "";
  coverUrlMessage.value = "";
  coverUrlState.value = "idle";
  coverPreviewFailed.value = false;
  analysisDetails.value = [];
  appliedMetadata.value = null;
  selectedAlbumArtist.value = "";
  saveMessage.value = "";
  saveSuccess.value = false;
}
watch(() => props.song, init, { immediate: true });
async function saveMetadata() {
  isSaving.value = true;
  saveSuccess.value = false;
  saveMessage.value = "";
  try {
    const artists = resolveArtistEntities(form.artist).map((artist) => ({ ...artist }));
    const metadata = appliedMetadata.value || {};
    const ok = await library.updateSongMetadata(props.song.id, {
      title: form.title,
      artist: artistsToDisplayString(artists) || form.artist,
      artists,
      artistCredits: artists,
      album: form.album,
      albumArtist: selectedAlbumArtist.value || metadata.albumArtist || props.song.albumArtist || "",
      genre: form.genre,
      year: form.year,
      track: form.track,
      trackTotal: form.trackTotal,
      disk: form.disk,
      diskTotal: form.diskTotal,
      duration: metadata.duration || props.song.duration,
      cover: form.cover || null,
      musicBrainzRecordingId: metadata.musicBrainzRecordingId || props.song.musicBrainzRecordingId || "",
      acoustid: metadata.acoustid || props.song.acoustid || "",
      isrc: metadata.isrc || props.song.isrc || "",
      identification: metadata.identification || props.song.identification || {},
      identifiedMetadata: metadata,
    });
    if (!ok) throw new Error("No se pudo guardar la canción.");
    saveSuccess.value = true;
    saveMessage.value = "Cambios guardados.";
    emit("updated");
  } catch (error) {
    saveMessage.value = error?.message || "No se pudieron guardar los cambios.";
  } finally {isSaving.value = false;}
}
function closeModal() {emit("close");}

function clearAnalysisState() {analysisDetails.value = []; appliedMetadata.value = null;}
function describeAnalysisOutcome(result) {
  const attempts = result?.diagnostics?.attempts || [];
  const fingerprintFailed = attempts.some((attempt) =>
    ["chromaprint", "fingerprint"].includes(attempt.provider) && attempt.status !== "success",
  );
  if (fingerprintFailed) {
    return ["No se pudo generar una huella acústica; la búsqueda por huella se omitió."];
  }
  const failedProviders = attempts.filter((attempt) => attempt.status === "error");
  if (failedProviders.length) {
    const providers = [...new Set(failedProviders.map((attempt) => {
      const provider = String(attempt.provider || "un servicio externo");
      if (provider.includes("acoustid")) return "AcoustID";
      if (provider.includes("musicbrainz")) return "MusicBrainz";
      return provider;
    }))];
    const hasNetworkFailure = failedProviders.some((attempt) =>
      /network|fetch|timeout|offline|connection|conexión/i.test(attempt.error || ""),
    );
    return [hasNetworkFailure
      ? `No se pudo conectar con ${providers.join(" y ")}. Comprueba tu conexión.`
      : `Error al consultar ${providers.join(" y ")}: ${failedProviders[0].error || "servicio no disponible"}.`];
  }
  if (result?.status === "ambiguous") {
    return ["Se encontraron propuestas, pero la evidencia no permite confirmar una coincidencia única. Puedes revisarlas manualmente."];
  }
  if (result?.status === "no_match") {
    return ["No se encontraron coincidencias suficientemente fiables para este audio."];
  }
  return [];
}
function parseNoMatchReason(result) {
  const attempts = result?.diagnostics?.attempts || [];
  const fingerprintFailure = attempts.find((attempt) =>
    ["chromaprint", "fingerprint"].includes(attempt.provider) && attempt.status !== "success",
  );
  if (fingerprintFailure) {
    return "No se pudo generar una huella acústica; no se pudo buscar una coincidencia por audio.";
  }
  const errors = attempts.filter((attempt) => attempt.status === "error");
  if (errors.length) {
    const networkFailure = errors.some((attempt) =>
      /network|fetch|timeout|offline|connection|conexión/i.test(attempt.error || ""),
    );
    return networkFailure
      ? "No se pudo conectar con los servicios de identificación. Comprueba tu conexión."
      : errors[0].error || "Error al consultar el servicio de identificación.";
  }
  return "No se encontró una coincidencia acústica suficientemente fiable.";
}
function localErrorMessage(error) {
  const message = String(error?.message || "");
  if (/network|fetch|timeout|offline|connection|conexión/i.test(message)) {
    return "No se pudo conectar con los servicios de identificación. Comprueba tu conexión.";
  }
  return message || "No se pudo analizar el audio.";
}
function applySuggestedGenres() {
  addGenres(genreChoices.value.map((choice) => choice.value));
}
</script>
