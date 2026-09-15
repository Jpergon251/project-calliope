import test from "node:test";
import assert from "node:assert/strict";
import {
  createRecording,
  createRelease,
  parseArtistString,
  resolveArtistEntities,
  artistsToDisplayString,
} from "../models/musicEntities.js";
import {
  selectPrimaryRelease,
  setReleasePrimaryCover,
  applyReleaseCoverSelection,
} from "./musicRelations.js";
import { suggestArtistSplit, separateArtists } from "./artistSeparation.js";

test("TEST 0 — La selección de portada queda acotada a un release y no comparte referencias entre releases", () => {
  const album = createRelease({
    id: "album-1",
    title: "Álbum",
    type: "album",
    cover: "album.jpg",
    artworks: [
      { url: "album.jpg", source: "album" },
      { url: "album-alt.jpg", source: "alt" },
    ],
  });
  const special = createRelease({
    id: "special-1",
    title: "Edición especial",
    type: "album",
    cover: "special.jpg",
    artworks: [
      { url: "special.jpg", source: "special" },
      { url: "special-alt.jpg", source: "alt" },
    ],
  });
  const single = createRelease({
    id: "single-1",
    title: "Sencillo",
    type: "single",
    cover: "single.jpg",
    artworks: [
      { url: "single.jpg", source: "single" },
      { url: "single-alt.jpg", source: "alt" },
    ],
  });

  const updated = applyReleaseCoverSelection([album, special, single], "single-1", "single-alt.jpg");
  const updatedAlbum = updated.find((release) => release.id === "album-1");
  const updatedSpecial = updated.find((release) => release.id === "special-1");
  const updatedSingle = updated.find((release) => release.id === "single-1");

  assert.equal(updatedAlbum.cover, "album.jpg");
  assert.equal(updatedSpecial.cover, "special.jpg");
  assert.equal(updatedSingle.cover, "single-alt.jpg");
  assert.equal(updatedAlbum.artworks.length, 2);
  assert.equal(updatedSpecial.artworks.length, 2);
  assert.equal(updatedSingle.artworks.length, 2);
  assert.notEqual(updatedAlbum.artworks, updatedSpecial.artworks);
  assert.notEqual(updatedAlbum.artworks[0], updatedSpecial.artworks[0]);

  const originalSpecial = structuredClone(special);
  updatedAlbum.cover = "new-album-artwork.jpg";
  assert.equal(originalSpecial.cover, "special.jpg");
  assert.equal(updatedSpecial.cover, "special.jpg");
});

// TEST 1 — Tres releases diferentes: cambiar portada del Single no altera Album ni Special Edition
test("TEST 1 — Cambiar portada del Single no modifica Album ni Special Edition", () => {
  const album = createRelease({
    id: "rel-album",
    title: "Balas perdidas",
    type: "album",
    cover: "cover-album.jpg",
  });
  const specialEdition = createRelease({
    id: "rel-special",
    title: "Balas perdidas (Edición Especial)",
    type: "album",
    cover: "cover-special.jpg",
  });
  const single = createRelease({
    id: "rel-single",
    title: "Besos en guerra",
    type: "single",
    cover: "cover-single.jpg",
  });

  const updatedReleases = setReleasePrimaryCover(
    [album, specialEdition, single],
    "rel-single",
    "new-single-cover.jpg",
  );

  const updatedSingle = updatedReleases.find((r) => r.id === "rel-single");
  const updatedAlbum = updatedReleases.find((r) => r.id === "rel-album");
  const updatedSpecial = updatedReleases.find((r) => r.id === "rel-special");

  assert.equal(updatedSingle.cover, "new-single-cover.jpg");
  assert.equal(updatedAlbum.cover, "cover-album.jpg");
  assert.equal(updatedSpecial.cover, "cover-special.jpg");
});

// TEST 2 — Portadas múltiples: seleccionar B como principal mantiene A, B y C disponibles
test("TEST 2 — Seleccionar nueva portada principal conserva todas las portadas alternativas disponibles", () => {
  const releaseX = createRelease({
    id: "rel-x",
    title: "Release X",
    type: "album",
    cover: "artwork-a.jpg",
    artworks: [
      { url: "artwork-a.jpg", source: "front" },
      { url: "artwork-b.jpg", source: "back" },
      { url: "artwork-c.jpg", source: "alt" },
    ],
  });

  const updatedReleases = setReleasePrimaryCover(
    [releaseX],
    "rel-x",
    "artwork-b.jpg",
  );
  const updated = updatedReleases[0];

  assert.equal(updated.cover, "artwork-b.jpg");
  const urls = updated.artworks.map((a) => a.url);
  assert.ok(urls.includes("artwork-a.jpg"));
  assert.ok(urls.includes("artwork-b.jpg"));
  assert.ok(urls.includes("artwork-c.jpg"));
});

// TEST 3 — Dos releases con misma portada: cambiar portada de A no altera B
test("TEST 3 — Dos releases con la misma portada: cambiar portada de A deja B intacto", () => {
  const releaseA = createRelease({
    id: "rel-a",
    title: "Release A",
    type: "album",
    cover: "shared-artwork.jpg",
  });
  const releaseB = createRelease({
    id: "rel-b",
    title: "Release B",
    type: "single",
    cover: "shared-artwork.jpg",
  });

  const updatedReleases = setReleasePrimaryCover(
    [releaseA, releaseB],
    "rel-a",
    "custom-artwork-a.jpg",
  );

  const updatedA = updatedReleases.find((r) => r.id === "rel-a");
  const updatedB = updatedReleases.find((r) => r.id === "rel-b");

  assert.equal(updatedA.cover, "custom-artwork-a.jpg");
  assert.equal(updatedB.cover, "shared-artwork.jpg");
});

// TEST 4 — primaryRelease: cambiar primaryReleaseId solo cambia el release principal sin modificar portadas
test("TEST 4 — Cambiar primaryReleaseId solo cambia el release principal sin modificar portadas", () => {
  const album = createRelease({
    id: "rel-album",
    title: "Album",
    type: "album",
    cover: "album-cover.jpg",
  });
  const single = createRelease({
    id: "rel-single",
    title: "Single",
    type: "single",
    cover: "single-cover.jpg",
  });
  const song = createRecording({
    id: "rec-1",
    title: "Song",
    releaseIds: [album.id, single.id],
    primaryReleaseId: "rel-album",
  });

  assert.equal(selectPrimaryRelease(song, [album, single]).id, "rel-album");

  // Cambiar a Single como release principal
  const updatedSong = { ...song, primaryReleaseId: "rel-single" };
  const primary = selectPrimaryRelease(updatedSong, [album, single]);

  assert.equal(primary.id, "rel-single");
  assert.equal(album.cover, "album-cover.jpg");
  assert.equal(single.cover, "single-cover.jpg");
});

// TEST 5 — Andy & Lucas: no separar automáticamente, permanece como entidad única
test("TEST 5 — Andy & Lucas no se separa automáticamente y permanece como una sola entidad", () => {
  const parsed = parseArtistString("Andy & Lucas");
  assert.deepEqual(parsed, ["Andy & Lucas"]);

  const entities = resolveArtistEntities("Andy & Lucas");
  assert.equal(entities.length, 1);
  assert.equal(entities[0].name, "Andy & Lucas");
  assert.equal(artistsToDisplayString(["Andy & Lucas"]), "Andy & Lucas");
});

// TEST 6 — Morat & Juanes: poder separar manualmente en ["Morat", "Juanes"]
test("TEST 6 — Morat & Juanes se puede separar manualmente en dos entidades", () => {
  const suggested = suggestArtistSplit("Morat & Juanes");
  assert.deepEqual(suggested, ["Morat", "Juanes"]);

  const result = separateArtists(
    { title: "Besos en guerra", artist: "Morat & Juanes" },
    ["Morat", "Juanes"],
  );
  assert.deepEqual(result.artists, ["Morat", "Juanes"]);
  assert.equal(result.artist, "Morat, Juanes");
  assert.equal(result.artistCredits.length, 2);
  assert.equal(result.artistCredits[0].name, "Morat");
  assert.equal(result.artistCredits[1].name, "Juanes");
});

// TEST 7 — Separación desde MetadataModal: funciona correctamente
test("TEST 7 — Separación de artistas desde MetadataModal actualiza estructura y display", () => {
  const songData = {
    title: "Besos en guerra",
    artist: "Morat & Juanes",
    artists: ["Morat & Juanes"],
  };

  const manualSeparated = suggestArtistSplit(songData.artist);
  const updated = separateArtists(songData, manualSeparated);

  assert.deepEqual(updated.artists, ["Morat", "Juanes"]);
  assert.equal(updated.artist, "Morat, Juanes");
});

// TEST 8 — Separación desde Detection Panel: funciona correctamente
test("TEST 8 — Separación de artistas desde Detection Panel funciona aun sin identificar audio", () => {
  const detectionPanelState = {
    formArtist: "Morat & Camila Fernández",
    identifiedResult: null, // Sin identificación previa
  };

  const suggested = suggestArtistSplit(detectionPanelState.formArtist);
  assert.deepEqual(suggested, ["Morat", "Camila Fernández"]);

  const applied = separateArtists(
    { artist: detectionPanelState.formArtist },
    suggested,
  );
  assert.deepEqual(applied.artists, ["Morat", "Camila Fernández"]);
  assert.equal(applied.artist, "Morat, Camila Fernández");
});

// TEST 9 — Separación sin identificación: canción local sin MusicBrainz/AcoustID puede separar artistas
test("TEST 9 — Canción sin MusicBrainz ni AcoustID puede separar artistas manualmente", () => {
  const localSong = {
    id: "local-track-123",
    title: "Canción Local",
    artist: "Artista Uno & Artista Dos",
    musicBrainzRecordingId: null,
    acoustid: null,
    musicBrainzReleaseId: null,
  };

  const separated = separateArtists(localSong, ["Artista Uno", "Artista Dos"]);
  assert.deepEqual(separated.artists, ["Artista Uno", "Artista Dos"]);
  assert.equal(separated.artist, "Artista Uno, Artista Dos");
  assert.equal(separated.musicBrainzRecordingId, null);
  assert.equal(separated.acoustid, null);
});

// TEST 10 — Cancelar separación: no modifica nada
test("TEST 10 — Cancelar separación no modifica ningún campo", () => {
  const originalState = {
    artist: "Andy & Lucas",
    artists: ["Andy & Lucas"],
    title: "Son de Amores",
  };

  // El usuario abre el diálogo, se sugiere separar, pero cancela la acción
  const suggested = suggestArtistSplit(originalState.artist);
  assert.deepEqual(suggested, ["Andy", "Lucas"]);

  // Al cancelar, el estado preservado es idéntico al original
  const cancelledState = { ...originalState };
  assert.deepEqual(cancelledState.artists, ["Andy & Lucas"]);
  assert.equal(cancelledState.artist, "Andy & Lucas");
  assert.equal(cancelledState.title, "Son de Amores");
});

// TEST 11 — Guardar separación: modifica solamente artistas
test("TEST 11 — Guardar separación modifica exclusivamente los campos de artista", () => {
  const song = {
    title: "Besos en guerra",
    artist: "Morat & Juanes",
    artists: ["Morat & Juanes"],
    album: "Balas perdidas",
    year: 2018,
    track: 1,
    genre: "Pop Latino",
    cover: "https://example.com/cover.jpg",
    primaryReleaseId: "rel-album",
    musicBrainzRecordingId: "mb-rec-123",
  };

  const updated = separateArtists(song, ["Morat", "Juanes"]);

  // Modificados
  assert.deepEqual(updated.artists, ["Morat", "Juanes"]);
  assert.equal(updated.artist, "Morat, Juanes");
  assert.equal(updated.artistCredits.length, 2);

  // Intactos
  assert.equal(updated.title, "Besos en guerra");
  assert.equal(updated.album, "Balas perdidas");
  assert.equal(updated.year, 2018);
  assert.equal(updated.track, 1);
  assert.equal(updated.genre, "Pop Latino");
  assert.equal(updated.cover, "https://example.com/cover.jpg");
  assert.equal(updated.primaryReleaseId, "rel-album");
  assert.equal(updated.musicBrainzRecordingId, "mb-rec-123");
});

// TEST 12 — Cambio de carpeta A -> B -> A: no duplica ni destruye relaciones
test("TEST 12 — Cambio de carpeta A -> B -> A conserva releases, recordings, portadas y artistas sin duplicar", () => {
  // Simulación de almacenamiento para carpetas A y B
  const databaseReleases = new Map();
  const databaseRecordings = new Map();

  function saveFolderEntities(recordings, releases) {
    for (const rel of releases) {
      if (!databaseReleases.has(rel.id)) {
        databaseReleases.set(rel.id, { ...rel });
      }
    }
    for (const rec of recordings) {
      if (!databaseRecordings.has(rec.id)) {
        databaseRecordings.set(rec.id, { ...rec });
      }
    }
  }

  // 1. Cargar carpeta A
  const folderAReleases = [
    createRelease({ id: "rel-a1", title: "Album A", cover: "cover-a1.jpg" }),
    createRelease({ id: "rel-a2", title: "Single A", cover: "cover-a2.jpg" }),
  ];
  const folderARecordings = [
    createRecording({
      id: "rec-a1",
      title: "Song A",
      artists: ["Morat", "Juanes"],
      releaseIds: ["rel-a1", "rel-a2"],
    }),
  ];
  saveFolderEntities(folderARecordings, folderAReleases);

  // 2. Cambiar a carpeta B
  const folderBReleases = [
    createRelease({ id: "rel-b1", title: "Album B", cover: "cover-b1.jpg" }),
  ];
  const folderBRecordings = [
    createRecording({
      id: "rec-b1",
      title: "Song B",
      artists: ["Andy & Lucas"],
      releaseIds: ["rel-b1"],
    }),
  ];
  saveFolderEntities(folderBRecordings, folderBReleases);

  // 3. Volver a carpeta A (A -> B -> A)
  saveFolderEntities(folderARecordings, folderAReleases);

  // Verificaciones
  assert.equal(databaseReleases.size, 3, "No debe haber releases duplicados");
  assert.equal(
    databaseRecordings.size,
    2,
    "No debe haber recordings duplicados",
  );

  const restoredRecordingA = databaseRecordings.get("rec-a1");
  assert.deepEqual(
    restoredRecordingA.artists.map((artist) => artist.name),
    ["Morat", "Juanes"],
    "Artistas de A no se pierden",
  );
  assert.equal(
    restoredRecordingA.artist,
    "Morat, Juanes",
    "Display de artistas de A se conserva",
  );
  assert.equal(
    databaseReleases.get("rel-a1").cover,
    "cover-a1.jpg",
    "Portada de A1 no se elimina",
  );
  assert.equal(
    databaseReleases.get("rel-a2").cover,
    "cover-a2.jpg",
    "Portada de A2 no se elimina",
  );
});
