import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateRecordingSimilarity,
  deduplicateReleases,
  deduplicateRecordingCandidates,
  rankRecordingCandidates,
  rankReleases,
  textSimilarity,
  durationSimilarity,
} from "./identificationRanking.js";

test("fusiona cuatro providers en un recording", () => {
  const context = { title: "A Bocaitos", artist: "Decai", duration: 180 };
  const candidates = ["musicbrainz", "itunes", "lrclib", "acoustid"].map((provider) => ({
    provider,
    recordingId: "recording-1",
    title: "A Bocaitos",
    artist: "Decai",
    duration: 180,
  }));
  const merged = deduplicateRecordingCandidates(candidates, context);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].providers.length, 4);
});

test("limita recordings a seis y descarta menos de treinta por ciento", () => {
  const context = { title: "Cancion", artist: "Artista", duration: 180 };
  const candidates = Array.from({ length: 20 }, (_, index) => ({
    provider: "itunes",
    recordingId: `recording-${index}`,
    title: index === 0 ? "Cancion" : `Cancion ${index}`,
    artist: "Artista",
    duration: 180,
  }));
  candidates.push({ provider: "itunes", recordingId: "bad", title: "Otra cosa", artist: "Otro artista", duration: 30 });
  const ranked = rankRecordingCandidates(candidates, context);
  assert.equal(ranked.length, 6);
  assert.ok(ranked.every((candidate) => candidate.similarity >= 0.3));
  assert.ok(calculateRecordingSimilarity(ranked[0], context).similarity > 0.3);
});

test("limita releases a cinco y conserva album deluxe como entidad distinta", () => {
  const releases = [
    { id: "album", title: "Album X", type: "album", artist: "Artist", releaseGroupId: "group" },
    { id: "deluxe", title: "Album X Deluxe Edition", type: "album", artist: "Artist", releaseGroupId: "group" },
    ...Array.from({ length: 8 }, (_, index) => ({ id: `release-${index}`, title: `Release ${index}`, type: "single", artist: "Artist" })),
  ];
  const ranked = rankReleases(releases, { title: "Track", artist: "Artist", recordingId: "recording" });
  assert.equal(ranked.length, 5);
  assert.ok(ranked.some((release) => release.id === "album"));
  assert.ok(ranked.some((release) => release.id === "deluxe"));
});

test("conserva exactamente dos releases cuando solo hay dos", () => {
  const ranked = rankReleases([
    { id: "album", title: "Album X", type: "album", artist: "Artist" },
    { id: "single", title: "Track", type: "single", artist: "Artist" },
  ], { title: "Track", artist: "Artist" });
  assert.equal(ranked.length, 2);
});

test("el modo manual puede conservar hasta veinte releases reales", () => {
  const ranked = rankReleases(
    Array.from({ length: 24 }, (_, index) => ({
      id: `release-${index}`,
      title: index % 2 ? "Album Deluxe" : "Album",
      type: "album",
      artist: "Artist",
      releaseGroupId: "group",
    })),
    { title: "Track", artist: "Artist" },
    { limit: 20 },
  );

  assert.equal(ranked.length, 20);
  assert.equal(new Set(ranked.map((release) => release.id)).size, 20);
});

test("conserva artistCredits estructurados y no duplica Andy & Lucas", () => {
  const merged = deduplicateRecordingCandidates([
    {
      provider: "musicbrainz",
      recordingId: "recording-1",
      title: "Cancion",
      artist: "Andy & Lucas",
      artists: [{ id: "artist-1", name: "Andy & Lucas" }],
      artistCredits: [{ id: "artist-1", name: "Andy & Lucas", joinphrase: "" }],
    },
    {
      provider: "itunes",
      recordingId: "recording-1",
      title: "Cancion",
      artist: "Andy & Lucas",
    },
  ], { title: "Cancion", artist: "Andy & Lucas" });

  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].artists, [{ id: "artist-1", name: "Andy & Lucas", joinphrase: "" }]);
  assert.equal(merged[0].artistCredits[0].name, "Andy & Lucas");
});

test("acepta exactamente treinta por ciento y descarta menos", () => {
  const context = { title: "Song", artist: "Artist", duration: 0 };
  const exact = calculateRecordingSimilarity({ provider: "itunes", title: "Song", artist: "Artist" }, context).similarity;
  assert.ok(exact >= 0.3);
  const ranked = rankRecordingCandidates([
    { provider: "itunes", recordingId: "exact", title: "Song", artist: "Artist" },
    { provider: "itunes", recordingId: "bad", title: "x", artist: "y" },
  ], context);
  assert.ok(ranked.some((candidate) => candidate.recordingId === "exact"));
  assert.ok(!ranked.some((candidate) => candidate.recordingId === "bad"));
});

test("conserva un unico candidato descubierto", () => {
  const ranked = rankRecordingCandidates([
    { provider: "itunes", recordingId: "one", title: "Cancion", artist: "Artist" },
  ], { title: "Cancion", artist: "Artist" });
  assert.equal(ranked.length, 1);
});

test("permite candidatos razonables sin rebajar el filtro global", () => {
  const ranked = rankRecordingCandidates([
    { provider: "musicbrainz", recordingId: "strong", title: "Cuando Eramos Dos", artist: "SinSinati", duration: 223 },
    { provider: "itunes", recordingId: "related", title: "Cuando Eramos Dos (Live)", artist: "SinSinati", duration: 226 },
    { provider: "itunes", recordingId: "wrong", title: "Otra cancion", artist: "Otra artista", duration: 20 },
  ], { title: "Cuando Éramos Dos", artist: "SinSinati", duration: 224 });
  assert.ok(ranked.some((candidate) => candidate.recordingId === "related"));
  assert.ok(!ranked.some((candidate) => candidate.recordingId === "wrong"));
});

test("las versiones original y remix siguen siendo recordings distintos", () => {
  const merged = deduplicateRecordingCandidates([
    { provider: "musicbrainz", recordingId: "original", title: "Song", artist: "Artist", duration: 180 },
    { provider: "musicbrainz", recordingId: "remix", title: "Song Remix", artist: "Artist", duration: 240 },
  ], { title: "Song", artist: "Artist", duration: 180 });
  assert.equal(merged.length, 2);
});

test("no fusiona el mismo titulo de artistas diferentes", () => {
  const merged = deduplicateRecordingCandidates([
    { provider: "itunes", title: "Song", artist: "Artist A", duration: 180 },
    { provider: "itunes", title: "Song", artist: "Artist B", duration: 180 },
  ], { title: "Song", artist: "Artist A", duration: 180 });
  assert.equal(merged.length, 2);
});

test("fusiona el mismo release de MusicBrainz e iTunes y conserva artwork", () => {
  const merged = deduplicateReleases([
    { id: "mb-release", title: "Album", type: "album", artist: "Artist", year: "2020", provider: "musicbrainz", cover: "mb-cover" },
    { id: "itunes:123", title: "Album", type: "album", artist: "Artist", year: "2020", provider: "itunes", cover: "itunes-cover" },
  ]);
  assert.equal(merged.length, 1);
  assert.deepEqual(new Set(merged[0].providers), new Set(["musicbrainz", "itunes"]));
  assert.equal(merged[0].artwork.length, 2);
});

test("elimina la copia sin portada cuando representa el mismo release", () => {
  const merged = deduplicateReleases([
    { id: "itunes:album", title: "Album", type: "album", artist: "Artist", year: "2023", provider: "itunes", cover: "cover" },
    { id: "local:album", title: "Album", type: "album", artist: "Artist", year: "2023", provider: "local" },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].cover, "cover");
});

test("la similitud tolera acentos y usa duracion como evidencia", () => {
  assert.ok(textSimilarity("Cuando Eramos Dos", "Cuando Éramos Dos") > 0.95);
  assert.equal(durationSimilarity(223, 224), 1);
  assert.ok(durationSimilarity(223, 260) < 0.5);
});

test("el scoring compara el titulo base cuando hay feat", () => {
  const score = calculateRecordingSimilarity({
    title: "Cuando Éramos Dos (feat. X)",
    artist: "SinSinati",
  }, { title: "Cuando Eramos Dos", artist: "SinSinati" });
  assert.ok(score.titleSimilarity > 0.9);
});

test("la similitud prioriza IDs de artista estructurados", () => {
  const score = calculateRecordingSimilarity({
    title: "Cancion",
    artist: "Nombre legacy distinto",
    artists: [{ id: "artist-id", name: "Nombre real" }],
  }, {
    title: "Cancion",
    artist: "Otro texto",
    artistCredits: [{ id: "artist-id", name: "Nombre real" }],
  });
  assert.equal(score.artistSimilarity, 1);
});

test("descarta titulos coincidentes con artistas incompatibles", () => {
  const ranked = rankRecordingCandidates([
    { provider: "itunes", recordingId: "valid", title: "Demasiado Lejos", artist: "Morat", duration: 180 },
    { provider: "itunes", recordingId: "wrong", title: "Demasiado Lejos", artist: "Nordi", duration: 180 },
  ], { title: "Demasiado Lejos", artist: "Morat", duration: 180 });
  assert.deepEqual(ranked.map((candidate) => candidate.recordingId), ["valid"]);
});
