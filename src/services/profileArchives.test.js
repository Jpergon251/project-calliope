import test from "node:test";
import assert from "node:assert/strict";

import {
  archiveHasPortableReferences,
  buildProfileArchive,
  normalizeProfileDirectoryName,
  profileMetricArtistId,
  profileSongReferenceId,
  resolveProfileSongReferences,
  validateProfileArchive,
} from "./profileArchives.js";

function createArchive(overrides = {}) {
  return buildProfileArchive({
    profile: {
      id: "profile-1",
      name: "Biblioteca personal",
      username: "listener",
      bio: "Música favorita",
      avatarUrl: "data:image/png;base64,aGVsbG8=",
      createdAt: 1,
      updatedAt: 2,
      credential: { hash: "private" },
      preferences: { accentColor: "chromatic-glass" },
    },
    playlists: [{
      id: "favorites",
      name: "Favoritos",
      songIds: ["song-1"],
      cover: "data:image/webp;base64,aGVsbG8=",
    }],
    history: [{
      id: "history-1",
      type: "song",
      itemId: "song-1",
      title: "Canción privada",
      subtitle: "Artista privado",
      cover: "data:image/png;base64,private-image",
      duration: 180,
      releaseId: "album-1",
      releaseType: "album",
      albumId: "album-1",
      timestamp: 10,
      playCount: 2,
    }],
    stats: {
      summary: {
        totalPlays: 4,
        totalListenTime: 230,
        songStats: {
          "song-1": {
            title: "Título repetido",
            artist: "Artista repetido",
            album: "Álbum repetido",
            cover: "data:image/png;base64,private-image",
            playCount: 4,
            totalListenTime: 230,
            firstPlayedAt: 5,
            lastPlayedAt: 10,
          },
        },
        artistStats: {
          "Artista agregado": {
            name: "Artista agregado",
            playCount: 4,
            totalListenTime: 230,
            lastPlayedAt: 10,
          },
        },
        albumStats: {
          "Álbum privado": {
            name: "Álbum privado",
            artist: "Artista privado",
            cover: "data:image/png;base64,private-image",
            playCount: 4,
            totalListenTime: 230,
            lastPlayedAt: 10,
          },
        },
        dayStats: {
          "1970-01-01": { date: "1970-01-01", plays: 4, listenTime: 230 },
        },
      },
      events: [{
        id: "event-1",
        songId: "song-1",
        title: "Evento con título",
        artist: "Evento con artista",
        album: "Evento con álbum",
        genres: ["Evento con género"],
        duration: 300,
        cover: "data:image/png;base64,private-image",
        listenTime: 60,
        timestamp: 10,
      }],
    },
    ratings: [{ songId: "song-1", rating: "like", updatedAt: 12 }],
    queue: {
      savedAt: 20,
      playingSongId: "song-1",
      queueIds: ["song-2", "song-1"],
      historyIds: ["song-3"],
      activeQueueHistoryIds: ["song-3"],
      isShuffleEnabled: true,
      originalQueueIds: ["song-1", "song-2"],
      autoplay: true,
      repeatMode: "all",
      savedPlayingSong: {
        id: "song-1",
        title: "Título en caché",
        artist: "Artista en caché",
      },
    },
    ...overrides,
  });
}

test("v3 archive includes profile data and statistics but only opaque song references", () => {
  const archive = createArchive();
  const parsed = JSON.parse(JSON.stringify(archive));
  const result = validateProfileArchive(parsed);

  assert.equal(parsed.format, "calliope-profile");
  assert.equal(parsed.formatVersion, 3);
  assert.equal("credential" in parsed.profile, false);
  assert.equal(parsed.profile.username, "listener");
  assert.equal(parsed.profile.bio, "Música favorita");
  assert.equal("library" in parsed, false);
  assert.equal("favorites" in parsed, false);
  assert.deepEqual(Object.keys(parsed.playlists[0]).sort(), ["cover", "id", "name", "order", "songIds"]);
  assert.deepEqual(parsed.playlists[0].songIds, [profileSongReferenceId("song-1")]);
  assert.equal(parsed.playlists[0].cover, "data:image/webp;base64,aGVsbG8=");
  assert.equal(parsed.profile.avatarUrl, "data:image/png;base64,aGVsbG8=");
  assert.deepEqual(Object.keys(parsed.history[0]).sort(), [
    "albumId", "duration", "id", "itemId", "playCount", "releaseId",
    "releaseType", "subtitle", "timestamp", "title", "type",
  ]);
  assert.equal(parsed.history[0].title, "Canción privada");
  assert.equal(parsed.history[0].subtitle, "Artista privado");
  assert.equal(parsed.history[0].duration, 180);
  assert.match(parsed.history[0].releaseId, /^album-ref-[a-f0-9]{16}$/);
  assert.deepEqual(Object.keys(parsed.metrics.events[0]).sort(), ["dateStr", "id", "listenTime", "songId", "timestamp"]);
  assert.deepEqual(Object.keys(parsed.metrics.summary.songStats[profileSongReferenceId("song-1")]).sort(), [
    "firstPlayedAt", "lastPlayedAt", "playCount", "totalListenTime",
  ]);
  assert.equal(parsed.metrics.summary.totalPlays, 4);
  assert.equal(parsed.metrics.summary.artistStats[profileMetricArtistId("Artista agregado")].playCount, 4);
  assert.equal(Object.values(parsed.metrics.summary.albumStats)[0].totalListenTime, 230);
  assert.equal("savedPlayingSong" in parsed.queue, false);
  assert.deepEqual([...result.songIds].sort(), ["song-1", "song-2", "song-3"].map(profileSongReferenceId).sort());
  assert.equal(JSON.stringify(parsed).includes("Título repetido"), false);
  assert.equal(JSON.stringify(parsed).includes("Evento con artista"), false);
  assert.equal(JSON.stringify(parsed).includes("Artista agregado"), false);
  assert.equal(JSON.stringify(parsed).includes("private-image"), false);
});

test("archive validation accepts only safe portable image data for profile and playlist artwork", () => {
  const archive = createArchive();
  archive.profile.avatarUrl = "data:image/svg+xml;base64,PHNjcmlwdD4=";
  assert.throws(() => validateProfileArchive(archive), /Faltan datos obligatorios/);

  const badPlaylistCover = createArchive();
  badPlaylistCover.playlists[0].cover = "data:text/html;base64,PHNjcmlwdD4=";
  assert.throws(() => validateProfileArchive(badPlaylistCover), /lista de reproducción no válida/);
});

test("portable reference detection supports the Set returned by profile reference collection", () => {
  assert.equal(archiveHasPortableReferences(createArchive()), true);
  assert.equal(archiveHasPortableReferences(buildProfileArchive({
    profile: { id: "profile-empty", name: "Empty" },
    playlists: [],
    history: [],
    stats: { summary: null, events: [] },
    ratings: [],
    queue: null,
  })), false);
});

test("history snapshots keep song labels and resolve album references without exposing local IDs", () => {
  const localSongId = "/home/listener/Music/private/track.flac";
  const localAlbumId = "/home/listener/Music/private/album";
  const archive = createArchive({
    history: [{
      type: "song",
      itemId: localSongId,
      title: "Canción guardada",
      subtitle: "Artista guardado",
      duration: 123,
      releaseId: localAlbumId,
      albumId: localAlbumId,
      timestamp: 50,
      playCount: 3,
    }],
  });
  const serialized = JSON.stringify(archive);
  const resolved = resolveProfileSongReferences(
    archive,
    [{ id: localSongId }],
    [{ id: localAlbumId }],
  );
  const restoredRecord = resolved.archive.history[0];

  assert.equal(serialized.includes(localSongId), false);
  assert.equal(serialized.includes(localAlbumId), false);
  assert.equal(restoredRecord.itemId, localSongId);
  assert.equal(restoredRecord.title, "Canción guardada");
  assert.equal(restoredRecord.subtitle, "Artista guardado");
  assert.equal(restoredRecord.duration, 123);
  assert.equal(restoredRecord.releaseId, localAlbumId);
  assert.equal(restoredRecord.albumId, localAlbumId);
  assert.equal(restoredRecord.timestamp, 50);
  assert.equal(restoredRecord.playCount, 3);
});

test("v1 archives migrate while removing copied library metadata and embedded song details", () => {
  const v2 = createArchive();
  const legacy = {
    ...v2,
    formatVersion: 1,
    playlists: [{
      ...v2.playlists[0],
      cover: "data:image/png;base64,old-cover",
      title: "duplicate playlist metadata",
    }],
    favorites: { songIds: ["song-2"] },
    history: [{
      ...v2.history[0],
      title: "legacy history title",
      subtitle: "legacy history artist",
      cover: "data:image/png;base64,old-cover",
      duration: 180,
    }],
    metrics: {
      summary: {
        ...v2.metrics.summary,
        songStats: {
          "song-1": {
            playCount: 4,
            totalListenTime: 230,
            firstPlayedAt: 5,
            lastPlayedAt: 10,
            title: "legacy summary title",
            artist: "legacy summary artist",
            album: "legacy summary album",
            cover: "data:image/png;base64,old-cover",
          },
        },
        artistStats: v2.metrics.summary.artistStats,
      },
      events: [{
        ...v2.metrics.events[0],
        title: "legacy event title",
        artist: "legacy event artist",
        album: "legacy event album",
        genres: ["legacy genre"],
        duration: 180,
      }],
    },
    queue: { ...v2.queue, savedPlayingSong: { id: "song-1", title: "legacy queue title" } },
    library: {
      songs: [{ id: "song-1", fileId: "song-1", name: "song.mp3" }],
      metadata: [{
        id: "song-1",
        title: "legacy library title",
        artist: "legacy library artist",
        album: "legacy library album",
        genre: "legacy library genre",
        duration: 180,
        cover: "data:image/png;base64,old-cover",
      }],
    },
  };
  const legacyBytes = new TextEncoder().encode(JSON.stringify(legacy)).byteLength;
  const { archive } = validateProfileArchive(legacy);
  const migratedBytes = new TextEncoder().encode(JSON.stringify(archive)).byteLength;
  const serialized = JSON.stringify(archive);

  assert.equal(archive.formatVersion, 3);
  assert.equal("library" in archive, false);
  assert.equal(archive.playlists[0].songIds.includes(profileSongReferenceId("song-2")), true);
  assert.equal(archive.metrics.summary.totalPlays, 4);
  assert.equal(archive.metrics.summary.songStats[profileSongReferenceId("song-1")].playCount, 4);
  assert.equal(serialized.includes("legacy library title"), false);
  assert.equal(serialized.includes("legacy event artist"), false);
  assert.equal(serialized.includes("legacy queue title"), false);
  assert.equal(archive.history[0].title, "legacy history title");
  assert.equal(archive.history[0].subtitle, "legacy history artist");
  assert.equal(archive.history[0].duration, 180);
  assert.ok(migratedBytes < legacyBytes);
});

test("v2 archives migrate their old raw IDs and embedded music details to opaque references", () => {
  const localId = "/device/Music/private/track.flac";
  const current = createArchive();
  const legacy = {
    ...current,
    formatVersion: 2,
    playlists: current.playlists.map((playlist) => ({
      ...playlist,
      songIds: [localId],
      cover: "data:image/png;base64,legacy-cover",
    })),
    history: current.history.map((item) => ({
      ...item,
      itemId: localId,
      title: "legacy title",
      artist: "legacy artist",
    })),
    ratings: current.ratings.map((rating) => ({ ...rating, songId: localId })),
    metrics: {
      summary: {
        ...current.metrics.summary,
        songStats: { [localId]: { playCount: 2, totalListenTime: 40 } },
      },
      events: current.metrics.events.map((event) => ({
        ...event,
        songId: localId,
        title: "legacy event title",
        artist: "legacy event artist",
      })),
    },
    queue: { ...current.queue, queueIds: [localId], savedPlayingSong: { id: localId, title: "legacy queue title" } },
  };
  const { archive } = validateProfileArchive(legacy);
  const serialized = JSON.stringify(archive);
  const portableId = profileSongReferenceId(localId);

  assert.equal(archive.formatVersion, 3);
  assert.deepEqual(archive.playlists[0].songIds, [portableId]);
  assert.equal(archive.history[0].itemId, portableId);
  assert.equal(archive.history[0].title, "legacy title");
  assert.equal(archive.history[0].subtitle, "Artista privado");
  assert.equal(archive.ratings[0].songId, portableId);
  assert.equal(archive.metrics.events[0].songId, portableId);
  assert.equal(archive.metrics.summary.songStats[portableId].playCount, 2);
  assert.equal(serialized.includes(localId), false);
  assert.equal(serialized.includes("legacy event artist"), false);
  assert.equal(serialized.includes("legacy queue title"), false);
});

test("profile directory names cannot escape the profile data folder", () => {
  assert.equal(normalizeProfileDirectoryName("../Music/../outside", "abc123"), "..Music..outside");
  assert.equal(normalizeProfileDirectoryName("CON", "abc123"), "Perfil-abc123");
  assert.equal(normalizeProfileDirectoryName("   ", "abc123"), "Perfil-abc123");
  assert.equal(
    normalizeProfileDirectoryName("Jazz", "profile-1", ["jazz"]),
    "Jazz-profile1",
  );
});

test("song resolution uses only stable IDs and never guesses from filenames", () => {
  const archive = createArchive();
  const resolution = resolveProfileSongReferences(archive, [
    { id: "song-1", name: "Different.mp3" },
    { id: "other-id", fileId: "song-2", name: "same.mp3" },
  ]);
  assert.deepEqual(archive.playlists[0].songIds, [profileSongReferenceId("song-1")]);
  assert.equal(resolution.resolvedCount, 1);
  assert.equal(resolution.unresolvedCount, 2);
});

test("portable references do not disclose local file paths and resolve by the existing library ID", () => {
  const localId = "/home/listener/Music/private/track.flac";
  const archive = createArchive({
    playlists: [{ id: "list-1", name: "Mix", songIds: [localId] }],
    history: [{
      type: "song",
      itemId: localId,
      title: "Canción privada",
      subtitle: "Artista privado",
      timestamp: 1,
      playCount: 1,
    }],
    ratings: [{ songId: localId, rating: "like", updatedAt: 1 }],
  });
  const serialized = JSON.stringify(archive);
  const resolved = resolveProfileSongReferences(archive, [{ id: localId }]);

  assert.equal(serialized.includes("/home/listener/Music/private/track.flac"), false);
  assert.deepEqual(resolved.archive.playlists[0].songIds, [localId]);
  assert.equal(resolved.archive.history[0].itemId, localId);
  assert.equal(resolved.archive.history[0].title, "Canción privada");
  assert.equal(resolved.archive.history[0].subtitle, "Artista privado");
  assert.equal(resolved.archive.ratings[0].songId, localId);
  assert.equal(resolved.resolvedCount, 1);
});

test("invalid and future profile archives are rejected", () => {
  assert.throws(() => validateProfileArchive({ format: "calliope-profile", formatVersion: 99 }), /no es compatible/);
  assert.throws(() => validateProfileArchive({ format: "other", formatVersion: 3 }), /no es una exportación/);
  assert.throws(() => validateProfileArchive({
    ...createArchive(),
    playlists: [{ id: "bad", name: "Bad", songIds: "not-an-array", order: 0 }],
  }), /lista de reproducción no válida/);
});
