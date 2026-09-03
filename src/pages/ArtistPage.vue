<template>
  <main class="artist-detail-page" aria-label="Detalle del artista">
    <!-- =====================================================
         ARTIST
    ====================================================== -->

    <template v-if="artistData">
      <!-- ===================================================
           HERO / BANNER
      ==================================================== -->

      <section class="artist-banner">
        <!-- Artist backdrop -->
        <div
          v-if="artistCover"
          class="banner-backdrop"
          :style="{ backgroundImage: `url(${artistCover})` }"
          aria-hidden="true"
        ></div>

        <div
          v-else
          class="banner-neon-mesh"
          aria-hidden="true"
        ></div>

        <div
          class="banner-gradient-overlay"
          aria-hidden="true"
        ></div>

        <!-- Back -->
        <button
          type="button"
          class="banner-back-btn"
          aria-label="Volver a artistas"
          @click="router.back()"
        >
          <ChevronLeft :size="20" />
          <span>Artistas</span>
        </button>

        <!-- Edit -->
        <button
          type="button"
          class="banner-edit-btn"
          aria-label="Editar artista"
          @click="openArtistModal"
        >
          <Pencil :size="17" />
          <span>Editar artista</span>
        </button>

        <!-- Hero content -->
        <div class="banner-content">
          <!-- Artist image -->
          <div class="banner-image-wrapper">
            <img
              v-if="artistCover"
              :src="artistCover"
              :alt="artistDisplayName"
              class="banner-avatar"
            />

            <div
              v-else
              class="banner-avatar-fallback"
              aria-hidden="true"
            >
              <UserRound :size="68" stroke-width="1.5" />
            </div>

            <button
              type="button"
              class="avatar-change-overlay"
              :title="
                hasCustomCover
                  ? 'Cambiar imagen del artista'
                  : 'Elegir imagen del artista'
              "
              @click="openArtistModal"
            >
              <Camera :size="20" />
              <span>Cambiar</span>
            </button>
          </div>

          <!-- Artist info -->
          <div class="banner-info">
            <div class="verified-badge">
              <Sparkles :size="14" class="badge-icon" />
              <span>ARTISTA</span>
            </div>

            <h1 class="artist-title">
              {{ artistDisplayName }}
            </h1>

            <p
              v-if="artistRealName"
              class="artist-real-name"
            >
              {{ artistRealName }}
            </p>

            <div class="artist-metadata-line">
              <span>
                {{ artistSongs.length }}
                {{ artistSongs.length === 1 ? "canción" : "canciones" }}
              </span>

              <span
                v-if="artistAlbums.length"
                class="dot-sep"
              >
                •
              </span>

              <span v-if="artistAlbums.length">
                {{ artistAlbums.length }}
                {{ artistAlbums.length === 1 ? "álbum" : "álbumes" }}
              </span>

              <span
                v-if="collaboratorNames.length"
                class="dot-sep"
              >
                •
              </span>

              <span v-if="collaboratorNames.length">
                {{ collaboratorNames.length }}
                {{
                  collaboratorNames.length === 1
                    ? "colaborador"
                    : "colaboradores"
                }}
              </span>
            </div>

            <!-- Actions -->
            <div class="banner-actions">
              <button
                type="button"
                class="artist-play-btn"
                :disabled="!artistSongs.length"
                @click="playArtist"
              >
                <Play
                  :size="18"
                  fill="currentColor"
                />
                <span>Reproducir</span>
              </button>

              <button
                type="button"
                class="artist-queue-btn"
                :disabled="!artistSongs.length"
                @click="addArtistToQueue"
              >
                <ListPlus :size="18" />
                <span>Añadir a cola</span>
              </button>

              <button
                type="button"
                class="artist-image-btn"
                @click="openArtistModal"
              >
                <Camera :size="17" />
                <span>Editar perfil</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- =====================================================
           CONTENT
      ====================================================== -->

      <div class="artist-content-body">
        <!-- ===================================================
             ABOUT
        ==================================================== -->

        <section
          v-if="artistDescription"
          class="artist-section artist-about-section"
        >
          <div class="section-heading">
            <span class="section-kicker">
              Sobre el artista
            </span>

            <h2 class="section-title">
              Acerca de
            </h2>
          </div>

          <p class="artist-description">
            {{ artistDescription }}
          </p>
        </section>

        <!-- ===================================================
             ALBUMS
        ==================================================== -->

        <section
          v-if="artistAlbums.length"
          class="artist-section artist-albums-section"
        >
          <div class="section-header-row">
            <div>
              <span class="section-kicker">
                Discografía
              </span>

              <h2 class="section-title">
                Álbumes
              </h2>
            </div>

            <span class="section-count">
              {{ artistAlbums.length }}
            </span>
          </div>

          <div class="albums-grid">
            <article
              v-for="album in artistAlbums"
              :key="album.id || album.name"
              class="album-mini-card"
              tabindex="0"
              role="button"
              :aria-label="`Abrir álbum ${album.name}`"
              @click="openAlbum(album)"
              @keydown.enter="openAlbum(album)"
              @keydown.space.prevent="openAlbum(album)"
            >
              <div class="album-cover">
                <img
                  v-if="album.cover"
                  :src="album.cover"
                  :alt="`Portada de ${album.name}`"
                />

                <div
                  v-else
                  class="album-cover-fallback"
                >
                  <DiscAlbum :size="42" />
                </div>

                <div class="album-play-overlay">
                  <Play
                    :size="18"
                    fill="currentColor"
                  />
                </div>
              </div>

              <div class="album-card-info">
                <span class="album-name">
                  {{ album.name }}
                </span>

                <span class="album-meta">
                  {{ album.songCount || album.songs?.length || 0 }}
                  {{
                    (album.songCount || album.songs?.length || 0) === 1
                      ? "canción"
                      : "canciones"
                  }}
                </span>
              </div>
            </article>
          </div>
        </section>

        <!-- ===================================================
             COLLABORATORS
        ==================================================== -->

        <section
          v-if="collaboratorNames.length"
          class="artist-section artist-collaborators-section"
        >
          <div class="section-header-row">
            <div>
              <span class="section-kicker">
                Conexiones
              </span>

              <h2 class="section-title">
                Colaboradores
              </h2>
            </div>

            <span class="section-count">
              {{ collaboratorNames.length }}
            </span>
          </div>

          <div class="collaborators-pills">
            <button
              v-for="collaborator in collaboratorNames"
              :key="collaborator"
              type="button"
              class="collab-pill"
              @click="openCollaborator(collaborator)"
            >
              <span class="collab-avatar">
                <UserRound :size="15" />
              </span>

              <span class="collab-name">
                {{ collaboratorDisplayName(collaborator) }}
              </span>

              <ChevronRight :size="15" />
            </button>
          </div>
        </section>

        <!-- ===================================================
             SONGS
        ==================================================== -->

        <section class="artist-section artist-songs-section">
          <div class="section-header-row">
            <div>
              <span class="section-kicker">
                Discografía
              </span>

              <h2 class="section-title">
                Canciones
              </h2>
            </div>

            <div
              v-if="artistSongs.length"
              class="songs-section-actions"
            >
              <span class="songs-count-tag">
                {{ artistSongs.length }}
                {{
                  artistSongs.length === 1
                    ? "canción"
                    : "canciones"
                }}
              </span>

              <button
                v-if="artistSongs.length > 1"
                type="button"
                class="songs-carousel-btn"
                aria-label="Canciones anteriores"
                @click="scrollArtistSongs(-1)"
              >
                <ChevronLeft :size="18" />
              </button>

              <button
                v-if="artistSongs.length > 1"
                type="button"
                class="songs-carousel-btn"
                aria-label="Siguientes canciones"
                @click="scrollArtistSongs(1)"
              >
                <ChevronRight :size="18" />
              </button>

              <button
                v-if="artistSongs.length > 1"
                type="button"
                class="songs-view-all-btn"
                @click="openAllArtistSongs"
              >
                Ver todas
              </button>
            </div>
          </div>

          <!-- Song carousel -->
          <div
            v-if="artistSongs.length"
            ref="artistSongsCarousel"
            class="songs-carousel"
          >
            <div
              v-for="song in artistSongs"
              :key="song.id"
              class="songs-carousel-item"
            >
              <SongItem :song="song" />
            </div>
          </div>

          <!-- Empty -->
          <div
            v-else
            class="artist-empty-state"
          >
            <Music2 :size="24" />

            <div>
              <strong>No hay canciones</strong>
              <span>
                Este artista todavía no tiene canciones asociadas.
              </span>
            </div>
          </div>
        </section>
      </div>
    </template>

    <!-- =====================================================
         ARTIST NOT FOUND
    ====================================================== -->

    <section
      v-else
      class="artist-not-found"
    >
      <div class="artist-not-found-icon">
        <UserRound :size="34" />
      </div>

      <h1>Artista no encontrado</h1>

      <p>
        No se ha encontrado este artista en tu biblioteca.
      </p>

      <button
        type="button"
        @click="router.back()"
      >
        <ChevronLeft :size="17" />
        Volver
      </button>
    </section>

    <!-- =====================================================
         ARTIST EDITOR MODAL
    ====================================================== -->

    <div
      v-if="isArtistModalOpen"
      class="artist-modal-backdrop"
      @click.self="closeArtistModal"
    >
      <div
        class="artist-editor-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="`Editar artista ${artistDisplayName}`"
      >
        <!-- Modal header -->
        <header class="artist-editor-header">
          <div>
            <span class="modal-kicker">
              Perfil del artista
            </span>

            <h2>Editar artista</h2>

            <p>
              Personaliza cómo aparece este artista en tu biblioteca.
            </p>
          </div>

          <button
            type="button"
            class="modal-close-btn"
            aria-label="Cerrar"
            :disabled="isSavingArtist"
            @click="closeArtistModal"
          >
            <X :size="18" />
          </button>
        </header>

        <!-- Modal content -->
        <div class="artist-editor-content">
          <!-- Image -->
          <section class="editor-image-section">
            <div class="editor-cover-preview">
              <img
                v-if="editorImagePreview"
                :src="editorImagePreview"
                :alt="artistDisplayName"
              />

              <div
                v-else
                class="editor-cover-placeholder"
              >
                <UserRound :size="40" />
                <span>Sin imagen</span>
              </div>

              <div class="editor-cover-gradient"></div>

              <div class="editor-cover-actions">
                <label class="editor-image-action">
                  <Upload :size="15" />
                  <span>Subir</span>

                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    @change="pickArtistImageFile"
                  />
                </label>

                <button
                  v-if="editorImagePreview"
                  type="button"
                  class="editor-image-action editor-image-remove"
                  @click="removePendingArtistImage"
                >
                  <Trash2 :size="15" />
                  <span>Eliminar</span>
                </button>
              </div>
            </div>

            <div class="editor-image-url">
              <label class="editor-field">
                <span>URL de imagen</span>

                <div class="editor-input-with-icon">
                  <Link :size="16" />

                  <input
                    v-model="artistUrlDraft"
                    type="url"
                    placeholder="https://..."
                    autocomplete="off"
                    @input="previewArtistUrl"
                  />
                </div>
              </label>
            </div>
          </section>

          <!-- Fields -->
          <section class="editor-fields-section">
            <div class="editor-section-title">
              <div class="editor-section-icon">
                <UserRound :size="17" />
              </div>

              <div>
                <strong>Información</strong>
                <span>
                  Datos que se mostrarán en el perfil.
                </span>
              </div>
            </div>

            <!-- Artistic name -->
            <label class="editor-field">
              <span>
                Nombre artístico
              </span>

              <input
                v-model="artistProfileDraft.artisticName"
                type="text"
                maxlength="120"
                :placeholder="artistName"
              />
            </label>

            <!-- Real name -->
            <label class="editor-field">
              <span>
                Nombre real
                <small>Opcional</small>
              </span>

              <input
                v-model="artistProfileDraft.realName"
                type="text"
                maxlength="120"
                placeholder="Nombre real del artista"
              />
            </label>

            <!-- Description -->
            <label class="editor-field">
              <div class="field-label-row">
                <span>
                  Descripción
                  <small>Opcional</small>
                </span>

                <span class="character-count">
                  {{ artistProfileDraft.description.length }}/1000
                </span>
              </div>

              <textarea
                v-model="artistProfileDraft.description"
                maxlength="1000"
                placeholder="Escribe una breve descripción del artista..."
              ></textarea>
            </label>
          </section>
        </div>

        <!-- Footer -->
        <footer class="artist-editor-footer">
          <button
            type="button"
            class="editor-cancel-btn"
            :disabled="isSavingArtist"
            @click="closeArtistModal"
          >
            Cancelar
          </button>

          <button
            type="button"
            class="editor-save-btn"
            :disabled="isSavingArtist"
            @click="saveArtistProfileChanges"
          >
            <LoaderCircle
              v-if="isSavingArtist"
              :size="16"
              class="spin"
            />

            <Check
              v-else
              :size="16"
            />

            <span>
              {{ isSavingArtist ? "Guardando..." : "Guardar cambios" }}
            </span>
          </button>
        </footer>
      </div>
    </div>
  </main>
</template>

<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
} from "vue";

import {
  useRoute,
  useRouter,
} from "vue-router";

import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  DiscAlbum,
  Link,
  ListPlus,
  LoaderCircle,
  Music2,
  Pencil,
  Play,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-vue-next";

import SongItem from "../components/library/SongItem.vue";
import { useLibraryStore } from "../stores/libraryStore.js";

const route = useRoute();
const router = useRouter();
const library = useLibraryStore();

/* ============================================================
   HELPERS
============================================================ */

function decodeRouteValue(value) {
  const stringValue = String(value || "");

  try {
    return decodeURIComponent(stringValue);
  } catch {
    return stringValue;
  }
}

function sameArtistName(a, b) {
  return (
    String(a || "").trim().toLowerCase() ===
    String(b || "").trim().toLowerCase()
  );
}

/* ============================================================
   ARTIST IDENTITY
============================================================ */

const artistName = computed(() => {
  return decodeRouteValue(
    route.params.name ||
      route.params.artist ||
      route.params.id ||
      "",
  );
});

const artistData = computed(() => {
  const name = artistName.value;

  if (!name) {
    return null;
  }

  return (
    library.artists.find((artist) =>
      sameArtistName(artist.name, name),
    ) || null
  );
});

/* ============================================================
   ARTIST DATA
============================================================ */

const artistDisplayName = computed(() => {
  return (
    artistData.value?.artisticName ||
    artistData.value?.name ||
    artistName.value ||
    "Artista"
  );
});

const artistRealName = computed(() => {
  return artistData.value?.realName || "";
});

const artistDescription = computed(() => {
  return artistData.value?.description || "";
});

/*
 * IMPORTANT:
 *
 * An artist must NOT inherit the cover of one of its albums.
 *
 * `customCover` is the explicit artist image selected by the user.
 * If there isn't one, we deliberately return null so the template
 * renders the Lucide UserRound fallback.
 */
const artistCover = computed(() => {
  return artistData.value?.customCover || null;
});

const hasCustomCover = computed(() => {
  return Boolean(artistData.value?.customCover);
});

const artistSongs = computed(() => {
  if (artistData.value?.songs) {
    return artistData.value.songs;
  }

  return library.songs.filter((song) =>
    sameArtistName(song.artist, artistName.value),
  );
});

const artistAlbums = computed(() => {
  if (artistData.value?.albums) {
    return artistData.value.albums;
  }

  const albums = new Map();

  artistSongs.value.forEach((song) => {
    const name = song.album;

    if (!name) return;

    if (!albums.has(name)) {
      albums.set(name, {
        id: `${artistName.value}-${name}`,
        name,
        cover: song.cover || null,
        songs: [],
      });
    }

    albums.get(name).songs.push(song);

    if (
      !albums.get(name).cover &&
      song.cover
    ) {
      albums.get(name).cover = song.cover;
    }
  });

  return Array.from(albums.values()).map((album) => ({
    ...album,
    songCount: album.songs.length,
  }));
});

const collaboratorNames = computed(() => {
  if (artistData.value?.collaboratorNames) {
    return artistData.value.collaboratorNames;
  }

  const collaborators = new Set();

  artistSongs.value.forEach((song) => {
    const artist = String(song.artist || "");

    artist
      .split(
        /[,;&]|\s+feat\.?\s+|\s+ft\.?\s+/i,
      )
      .map((name) => name.trim())
      .filter(Boolean)
      .forEach((name) => {
        if (!sameArtistName(name, artistName.value)) {
          collaborators.add(name);
        }
      });
  });

  return Array.from(collaborators);
});

/* ============================================================
   SONG CAROUSEL
============================================================ */

const artistSongsCarousel = ref(null);

function scrollArtistSongs(direction) {
  const container = artistSongsCarousel.value;

  if (!container) return;

  const amount = Math.max(
    container.clientWidth * 0.78,
    260,
  );

  container.scrollBy({
    left: amount * direction,
    behavior: "smooth",
  });
}

/* ============================================================
   PLAY ARTIST
============================================================ */

function playArtist() {
  if (!artistSongs.value.length) return;

  const firstSong = artistSongs.value[0];
  const remainingSongs = artistSongs.value.slice(1);

  library.playSong(firstSong);

  if (
    typeof library.setPlayQueue === "function" &&
    remainingSongs.length
  ) {
    library.setPlayQueue(remainingSongs);
  }

  if (
    typeof window !== "undefined" &&
    window.innerWidth <= 760 &&
    typeof library.openNowPlaying === "function"
  ) {
    library.openNowPlaying();
  }
}

/* ============================================================
   QUEUE ARTIST
============================================================ */

function addArtistToQueue() {
  if (!artistSongs.value.length) return;

  if (typeof library.addToQueue === "function") {
    artistSongs.value.forEach((song) => {
      library.addToQueue(song);
    });

    return;
  }

  if (typeof library.addSongsToQueue === "function") {
    library.addSongsToQueue(artistSongs.value);
  }
}

/* ============================================================
   NAVIGATION
============================================================ */

function openAllArtistSongs() {
  router.push({
    path: "/library",
    query: {
      category: "songs",
      artist: artistName.value,
    },
  });
}

function openAlbum(album) {
  if (!album) return;

  router.push({
    name: "album",
    params: {
      id: album.id || album.name,
    },
  });
}

function openCollaborator(name) {
  if (!name) return;

  router.push({
    name: "artist",
    params: {
      name: encodeURIComponent(name),
    },
  });
}

function collaboratorDisplayName(name) {
  const artist = library.artists.find((item) =>
    sameArtistName(item.name, name),
  );

  return (
    artist?.artisticName ||
    artist?.name ||
    name
  );
}

/* ============================================================
   ARTIST EDITOR
============================================================ */

const isArtistModalOpen = ref(false);
const isSavingArtist = ref(false);

const artistUrlDraft = ref("");

const artistProfileDraft = ref({
  artisticName: "",
  realName: "",
  description: "",
});

const pendingArtistImage = ref(null);
const editorImagePreview = ref(null);

let temporaryImageObjectUrl = null;

/* ============================================================
   IMAGE HELPERS
============================================================ */

/*
 * Self-contained image downscaler.
 *
 * No imageUtils.js required.
 *
 * The resulting value is a Blob so it can be persisted without
 * keeping the original huge image in memory/storage.
 */
function downscaleImage(
  file,
  maxWidth = 1280,
  maxHeight = 1280,
  quality = 0.88,
) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();

      image.onload = () => {
        const scale = Math.min(
          1,
          maxWidth / image.naturalWidth,
          maxHeight / image.naturalHeight,
        );

        const width = Math.max(
          1,
          Math.round(image.naturalWidth * scale),
        );

        const height = Math.max(
          1,
          Math.round(image.naturalHeight * scale),
        );

        const canvas = document.createElement("canvas");

        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");

        if (!context) {
          reject(
            new Error(
              "No se pudo crear el contexto del canvas.",
            ),
          );
          return;
        }

        context.drawImage(
          image,
          0,
          0,
          width,
          height,
        );

        const mimeType =
          file.type === "image/png"
            ? "image/png"
            : "image/jpeg";

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(
                new Error(
                  "No se pudo procesar la imagen.",
                ),
              );
              return;
            }

            resolve(blob);
          },
          mimeType,
          quality,
        );
      };

      image.onerror = () => {
        reject(
          new Error(
            "No se pudo cargar la imagen.",
          ),
        );
      };

      image.src = reader.result;
    };

    reader.onerror = () => {
      reject(
        new Error(
          "No se pudo leer el archivo.",
        ),
      );
    };

    reader.readAsDataURL(file);
  });
}

/* ============================================================
   OPEN MODAL
============================================================ */

function openArtistModal() {
  const profile =
    typeof library.getArtistProfile === "function"
      ? library.getArtistProfile(artistName.value)
      : artistData.value || {};

  artistProfileDraft.value = {
    artisticName:
      profile?.artisticName ||
      artistData.value?.artisticName ||
      artistName.value,

    realName:
      profile?.realName ||
      artistData.value?.realName ||
      "",

    description:
      profile?.description ||
      artistData.value?.description ||
      "",
  };

  /*
   * Only expose an actual custom artist image here.
   * Album covers are intentionally ignored.
   */
  artistUrlDraft.value =
    artistData.value?.customCover &&
    !String(
      artistData.value.customCover,
    ).startsWith("blob:")
      ? artistData.value.customCover
      : "";

  pendingArtistImage.value = null;

  if (temporaryImageObjectUrl) {
    URL.revokeObjectURL(
      temporaryImageObjectUrl,
    );

    temporaryImageObjectUrl = null;
  }

  editorImagePreview.value =
    artistData.value?.customCover || null;

  isArtistModalOpen.value = true;

  nextTick(() => {
    document.body.classList.add(
      "artist-modal-open",
    );
  });
}

/* ============================================================
   CLOSE MODAL
============================================================ */

function closeArtistModal() {
  if (isSavingArtist.value) return;

  isArtistModalOpen.value = false;

  pendingArtistImage.value = null;

  if (temporaryImageObjectUrl) {
    URL.revokeObjectURL(
      temporaryImageObjectUrl,
    );

    temporaryImageObjectUrl = null;
  }

  editorImagePreview.value = null;

  document.body.classList.remove(
    "artist-modal-open",
  );
}

/* ============================================================
   IMAGE FILE
============================================================ */

async function pickArtistImageFile(event) {
  const file = event?.target?.files?.[0];

  if (!file) return;

  try {
    const image = await downscaleImage(
      file,
      1280,
      1280,
      0.88,
    );

    pendingArtistImage.value = image;

    if (temporaryImageObjectUrl) {
      URL.revokeObjectURL(
        temporaryImageObjectUrl,
      );
    }

    temporaryImageObjectUrl =
      URL.createObjectURL(image);

    editorImagePreview.value =
      temporaryImageObjectUrl;

    artistUrlDraft.value = "";
  } catch (error) {
    console.error(
      "Error procesando imagen del artista:",
      error,
    );
  }

  event.target.value = "";
}

/* ============================================================
   REMOVE IMAGE
============================================================ */

function removePendingArtistImage() {
  pendingArtistImage.value = null;

  if (temporaryImageObjectUrl) {
    URL.revokeObjectURL(
      temporaryImageObjectUrl,
    );

    temporaryImageObjectUrl = null;
  }

  editorImagePreview.value = null;
  artistUrlDraft.value = "";
}

/* ============================================================
   URL PREVIEW
============================================================ */

function previewArtistUrl() {
  const url = artistUrlDraft.value.trim();

  if (!url) {
    if (!pendingArtistImage.value) {
      editorImagePreview.value = null;
    }

    return;
  }

  pendingArtistImage.value = null;

  if (temporaryImageObjectUrl) {
    URL.revokeObjectURL(
      temporaryImageObjectUrl,
    );

    temporaryImageObjectUrl = null;
  }

  editorImagePreview.value = url;
}

/* ============================================================
   SAVE PROFILE
============================================================ */

async function saveArtistProfileChanges() {
  if (isSavingArtist.value) return;

  isSavingArtist.value = true;

  try {
    const profile = {
      artisticName:
        artistProfileDraft.value.artisticName.trim(),

      realName:
        artistProfileDraft.value.realName.trim(),

      description:
        artistProfileDraft.value.description.trim(),
    };

    if (
      typeof library.saveArtistProfile ===
      "function"
    ) {
      await library.saveArtistProfile(
        artistName.value,
        profile,
      );
    }

    /*
     * Uploaded image.
     */
    if (pendingArtistImage.value) {
      if (
        typeof library.setCustomArtistCover ===
        "function"
      ) {
        await library.setCustomArtistCover(
          artistName.value,
          pendingArtistImage.value,
        );
      }
    }
    /*
     * URL image.
     */
    else if (artistUrlDraft.value.trim()) {
      if (
        typeof library.setCustomArtistCover ===
        "function"
      ) {
        await library.setCustomArtistCover(
          artistName.value,
          artistUrlDraft.value.trim(),
        );
      }
    }
    /*
     * Explicitly removed image.
     */
    else if (
      !editorImagePreview.value &&
      hasCustomCover.value
    ) {
      if (
        typeof library.removeCustomArtistCover ===
        "function"
      ) {
        await library.removeCustomArtistCover(
          artistName.value,
        );
      }
    }

    await library.init();

    closeArtistModal();
  } catch (error) {
    console.error(
      "Error guardando perfil del artista:",
      error,
    );
  } finally {
    isSavingArtist.value = false;
  }
}

/* ============================================================
   CLEANUP
============================================================ */

onBeforeUnmount(() => {
  if (temporaryImageObjectUrl) {
    URL.revokeObjectURL(
      temporaryImageObjectUrl,
    );
  }

  document.body.classList.remove(
    "artist-modal-open",
  );
});
</script>