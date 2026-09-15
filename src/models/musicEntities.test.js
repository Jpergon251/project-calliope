import test from "node:test";
import assert from "node:assert/strict";
import {
  createRecording,
  createRelease,
  parseArtistString,
  cleanGenres,
  normalizeReleaseTitle,
  resolveArtistEntities,
  createStableFileId,
} from "./musicEntities.js";
import { getCoverForSong, selectPrimaryRelease } from "../services/musicRelations.js";
import { applyReleaseContext } from "../services/musicRelations.js";

test("un recording puede pertenecer a album y single sin duplicarse", () => {
  const album = createRelease({ id: "album", title: "Album X", primaryType: "album", cover: "album-cover" });
  const single = createRelease({ id: "single", title: "A Bocaitos", primaryType: "single", cover: "single-cover" });
  const song = createRecording({ id: "recording", title: "A Bocaitos", artist: "Decai", releaseIds: [album.id, single.id] });

  assert.equal(selectPrimaryRelease(song, [album, single]).id, "album");
  assert.equal(getCoverForSong(song, { type: "album", releaseId: "album" }, [album, single]), "album-cover");
  assert.equal(getCoverForSong(song, { type: "single", releaseId: "single" }, [album, single]), "single-cover");
});

test("una seleccion primaria manual conserva la portada del release elegido", () => {
  const album = createRelease({ id: "album", title: "Album X", primaryType: "album", cover: "album-cover" });
  const single = createRelease({ id: "single", title: "Song", primaryType: "single", cover: "single-cover" });
  const song = createRecording({ id: "recording", title: "Song", artist: "Artist", releaseIds: [album.id, single.id], primaryReleaseId: single.id });

  assert.equal(selectPrimaryRelease(song, [album, single]).id, "single");
  assert.equal(getCoverForSong(song, { type: "library" }, [album, single]), "single-cover");
});

test("los nombres con ampersand no se separan y feat si se detecta", () => {
  assert.deepEqual(parseArtistString("Andy & Lucas"), ["Andy & Lucas"]);
  assert.deepEqual(parseArtistString("Artist A feat. Artist B"), ["Artist A", "Artist B"]);
  assert.deepEqual(parseArtistString("Artist A, Artist B"), ["Artist A", "Artist B"]);
  assert.deepEqual(parseArtistString("Shakira Martinez & Decai"), ["Shakira Martinez & Decai"]);
});

test("conserva entidades con ampersand como un solo artista", () => {
  for (const name of ["Andy & Lucas", "Cali y El Dandee", "Simon & Garfunkel"]) {
    const artists = resolveArtistEntities(name, {
      artistEntity: { id: `${name}-id`, name },
    });
    assert.equal(artists.length, 1);
    assert.equal(artists[0].name, name);
  }
});

test("separa una colaboracion solo con entidades validadas", () => {
  const collaborations = [
    ["Morat & Camila Fernández", ["Morat", "Camila Fernández"]],
    ["Sofía Reyes & Beéle", ["Sofía Reyes", "Beéle"]],
    ["TIMØ & Andrés Cepeda", ["TIMØ", "Andrés Cepeda"]],
    ["TIMØ & Bacilos", ["TIMØ", "Bacilos"]],
  ];
  for (const [value, names] of collaborations) {
    const artists = resolveArtistEntities(value, {
      artistEntities: names.map((name, index) => ({ id: `artist-${index}`, name })),
    });
    assert.deepEqual(artists.map((artist) => artist.name), names);
  }
});

test("usa credits externos para feat sin analizar el string destructivamente", () => {
  const artists = resolveArtistEntities("Artist A feat. Artist B", {
    artistCredits: [
      { artist: { id: "a-id", name: "Artist A" }, joinphrase: " feat. " },
      { artist: { id: "b-id", name: "Artist B" }, joinphrase: "" },
    ],
  });
  assert.deepEqual(artists.map((artist) => artist.name), ["Artist A", "Artist B"]);
});

test("no divide nombres ambiguos sin evidencia", () => {
  assert.deepEqual(resolveArtistEntities("A & B").map((artist) => artist.name), ["A & B"]);
});

test("prioriza artist credits estructurados y conserva IDs", () => {
  const song = createRecording({
    artist: "Sofía Reyes & Beéle",
    artistCredits: [
      { artist: { id: "sofia-id", name: "Sofía Reyes" }, joinphrase: " & " },
      { artist: { id: "beele-id", name: "Beéle" }, joinphrase: "" },
    ],
  });
  assert.deepEqual(song.artists.map((artist) => artist.name), ["Sofía Reyes", "Beéle"]);
  assert.deepEqual(song.artists.map((artist) => artist.id), ["sofia-id", "beele-id"]);
  assert.equal(song.artist, "Sofía Reyes, Beéle");
});

test("los generos validos de una sola fuente se conservan", () => {
  assert.deepEqual(cleanGenres(["Pop", "Music", "N/A"]), ["Pop"]);
});

test("los sufijos de clasificacion no contaminan el titulo visible", () => {
  assert.equal(normalizeReleaseTitle("Nombre - EP"), "Nombre");
  assert.equal(normalizeReleaseTitle("Nombre (Single)"), "Nombre");
  assert.equal(createRelease({ title: "Nombre - Single", collectionType: "Single" }).title, "Nombre");
});

test("el contexto de reproduccion usa portada y pista del release seleccionado", () => {
  const song = createRecording({ id: "song", title: "Song", artist: "Artist", releaseIds: ["album", "single"] });
  const contextual = applyReleaseContext(song, "single", [
    { id: "album", title: "Album", type: "album", cover: "album-cover" },
    { id: "single", title: "Song", type: "single", cover: "single-cover" },
  ], [
    { recordingId: "song", releaseId: "single", trackNumber: 1, trackTotal: 1, discNumber: 1 },
  ]);
  assert.equal(contextual.cover, "single-cover");
  assert.equal(contextual.releaseType, "single");
  assert.equal(contextual.track, 1);
  assert.equal(contextual.album, "Song");
});

test("los archivos con el mismo nombre en carpetas distintas no colisionan", () => {
  const left = { name: "song.mp3", size: 1024, lastModified: 1234, webkitRelativePath: "albums/one/song.mp3" };
  const right = { name: "song.mp3", size: 1024, lastModified: 1234, webkitRelativePath: "albums/two/song.mp3" };

  assert.notEqual(createStableFileId(left), createStableFileId(right));
  assert.equal(createStableFileId(left), createStableFileId({ ...left, webkitRelativePath: "albums/one/song.mp3" }));
});
test("separa primaryArtists e involvedArtists del release sin tocar el recording", () => {
  const recording = createRecording({
    id: "track-1",
    title: "Track",
    artists: [
      { id: "timo", name: "TIMØ" },
      { id: "nil", name: "Nil Moliner" },
    ],
  });
  const release = createRelease({
    id: "release-1",
    title: "Canto Pa No Llorar",
    primaryArtists: [{ id: "timo", name: "TIMØ" }],
    involvedArtists: [
      { id: "timo", name: "TIMØ" },
      { id: "nil", name: "Nil Moliner" },
      { id: "vanesa", name: "Vanesa Martín" },
    ],
  });

  assert.deepEqual(recording.artists.map((artist) => artist.name), ["TIMØ", "Nil Moliner"]);
  assert.deepEqual(release.primaryArtists.map((artist) => artist.name), ["TIMØ"]);
  assert.deepEqual(release.involvedArtists.map((artist) => artist.name), ["TIMØ", "Nil Moliner", "Vanesa Martín"]);
});

test("deduplica artistas involucrados por ID y mantiene varios artistas principales", () => {
  const release = createRelease({
    id: "release-2",
    title: "Collaborative Release",
    primaryArtists: [
      { id: "a", name: "Artist A" },
      { id: "b", name: "Artist B" },
    ],
    involvedArtists: [
      { id: "a", name: "Artist A" },
      { id: "a", name: "Artist A" },
      { id: "b", name: "Artist B" },
    ],
  });

  assert.deepEqual(release.primaryArtists.map((artist) => artist.name), ["Artist A", "Artist B"]);
  assert.deepEqual(release.involvedArtists.map((artist) => artist.name), ["Artist A", "Artist B"]);
});
